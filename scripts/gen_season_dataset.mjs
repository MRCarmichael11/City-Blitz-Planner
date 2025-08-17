// Generate SeasonDataset JSON from a CSV laid out as alternating rows:
// row1 = Stronghold row 1, row2 = City row 1, row3 = Stronghold row 2, row4 = City row 2, ...
// No offsets in the sheet; we will apply offset {x:0.5,y:0.5} for cities/trading-posts to position them at intersections.
// Usage:
//   node scripts/gen_season_dataset.mjs --input src/v2/data/external/sheet.csv --season S3 --rows 13 --cols 13 --out src/v2/data/s3.json --stepDays "3,6,10,13,17,20,28"
// Notes:
// - If stepDays omitted, defaults to [3,6,10,13,17,20,28] (City Blitz uniform schedule across seasons per spec)
// - City unlocks are derived by city level: step N unlocks level N cities; step 7 also includes Capitol

import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input') out.input = args[++i];
    else if (a === '--season') out.season = args[++i];
    else if (a === '--rows') out.rows = parseInt(args[++i], 10);
    else if (a === '--cols') out.cols = parseInt(args[++i], 10);
    else if (a === '--out') out.out = args[++i];
    else if (a === '--stepDays') out.stepDays = args[++i].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
  }
  if (!out.input || !out.season || !out.rows || !out.cols || !out.out) {
    console.error('Usage: node scripts/gen_season_dataset.mjs --input <csv> --season <S1|S2|S3|S4> --rows <n> --cols <n> --out <json> [--stepDays "3,6,10,13,17,20,28"]');
    process.exit(1);
  }
  return out;
}

function parseCSV(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); cur = ''; row = []; }
      else if (ch === '\r') { /* ignore */ }
      else { cur += ch; }
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function colLetter(n) { return COLS[n - 1] || String.fromCharCode(64 + n); }

function centerCoord(rows, cols) {
  const r = Math.floor((rows + 1) / 2);
  const c = Math.floor((cols + 1) / 2);
  return `${colLetter(c)}${r}`;
}

function classifyCell(text) {
  const v = (text || '').trim();
  if (!v) return { kind: 'empty' };
  const lc = v.toLowerCase();
  const mLevel = v.match(/level\s*(\d+)/i);
  const level = mLevel ? parseInt(mLevel[1], 10) : 0;
  // Trading posts
  if (lc.includes('trade') && lc.includes('post')) return { kind: 'trading-post', level: level || 1, subLabel: 'Trade Post' };
  // Strongholds
  if (lc.includes('stronghold')) return { kind: 'stronghold', level: level || 1, subLabel: 'Stronghold' };
  // City-like by known sublabels
  const cityLabels = [
    'village', 'town', 'altar', 'temple', 'square', 'ancient', 'pyramid'
  ];
  if (cityLabels.some(k => lc.includes(k))) {
    let sub = '';
    if (lc.includes('temple')) sub = 'Temple of the Sun';
    else if (lc.includes('square')) sub = 'Square of Judgment';
    else if (lc.includes('ancient')) sub = 'Ancient Tombs';
    else if (lc.includes('pyramid')) sub = 'Great Pyramid';
    else if (lc.includes('altar')) sub = 'Altar';
    else if (lc.includes('town')) sub = 'Town';
    else if (lc.includes('village')) sub = 'Village';
    return { kind: 'city', level: level || 1, subLabel: sub };
  }
  // Unknown text: ignore (empty)
  return { kind: 'empty' };
}

function buildDatasetFromSheet(grid, seasonKey, rows, cols, stepDaysOpt) {
  const ds = {
    key: seasonKey,
    gridSize: { rows, cols },
    capitol: { id: `CAP-${centerCoord(rows, cols)}`, coordinates: centerCoord(rows, cols) },
    strongholds: [],
    cities: [],
    tradingPosts: [],
    calendar: { steps: 7, cityUnlocks: {}, stepDays: stepDaysOpt && stepDaysOpt.length === 7 ? stepDaysOpt : [3,6,10,13,17,20,28] },
  };

  // Iterate alternating rows
  // Expected pattern length: (2*rows - 1) lines
  for (let r = 1; r <= rows; r++) {
    const shRowIndex = (r - 1) * 2; // 0-based index into grid
    const shRow = grid[shRowIndex] || [];
    for (let c = 1; c <= cols; c++) {
      const cell = shRow[c - 1] || '';
      const cls = classifyCell(cell);
      const coord = `${colLetter(c)}${r}`;
      if (cls.kind === 'stronghold') {
        ds.strongholds.push({ coordinates: coord, level: cls.level, resourceType: 'Mithril', resourceValue: 0 });
      }
    }
    // City row only exists between SH rows
    if (r < rows) {
      const cityRowIndex = shRowIndex + 1;
      const cityRow = grid[cityRowIndex] || [];
      for (let c = 1; c <= cols - 1; c++) {
        const cell = cityRow[c - 1] || '';
        const cls = classifyCell(cell);
        const coord = `${colLetter(c)}${r}`; // top-left stronghold corner for intersection
        if (cls.kind === 'trading-post') ds.tradingPosts.push({ coordinates: coord, level: cls.level, offset: { x: 0.5, y: 0.5 } });
        else if (cls.kind === 'city') ds.cities.push({ coordinates: coord, level: cls.level, subLabel: cls.subLabel, offset: { x: 0.5, y: 0.5 }, resourceType: 'Spice', resourceValue: 0 });
      }
    }
  }

  // Build calendar: steps 1..6 by city level, step 7 includes Capitol
  for (let step = 1; step <= 6; step++) {
    ds.calendar.cityUnlocks[step] = ds.cities.filter(c => c.level === step).map(c => c.coordinates);
  }
  ds.calendar.cityUnlocks[7] = [ds.capitol.coordinates];

  return ds;
}

function main() {
  const { input, season, rows, cols, out, stepDays } = parseArgs();
  const csv = fs.readFileSync(path.resolve(input), 'utf-8');
  const table = parseCSV(csv);

  // Attempt to locate the top-left of the data grid by skipping comment/header-only lines
  // Heuristic: find the first line that has at least 3 non-empty cells in first (cols) columns
  let start = 0;
  for (let i = 0; i < table.length; i++) {
    const nonEmpty = (table[i] || []).slice(0, cols).filter(x => (x || '').trim().length > 0).length;
    if (nonEmpty >= Math.max(1, Math.floor(cols * 0.2))) { start = i; break; }
  }
  const slice = table.slice(start, start + (2 * rows - 1)).map(row => row.slice(0, cols));
  const ds = buildDatasetFromSheet(slice, season, rows, cols, stepDays);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), JSON.stringify(ds, null, 2));
  console.log(`Wrote ${out} with ${ds.strongholds.length} strongholds, ${ds.cities.length} cities, ${ds.tradingPosts.length} trading posts`);
}

main();
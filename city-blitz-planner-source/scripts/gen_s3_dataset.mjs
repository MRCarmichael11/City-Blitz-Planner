import https from 'https';
import fs from 'fs';
import path from 'path';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/1QI-Asb9UUYeEfQIguKDTzT4TB6SUJTxYmmrJCb0uzBo/export?format=csv';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSVLine(line) {
  const out = [];
  let i = 0;
  let cur = '';
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      } else { cur += ch; i++; continue; }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { out.push(cur); cur = ''; i++; continue; }
      cur += ch; i++;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  // Robust CSV parser supporting newlines within quoted fields
  const rows = [];
  let cur = '';
  let inQuotes = false;
  const pushRow = (line) => { rows.push(parseCSVLine(line)); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes; cur += ch; continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') { i++; }
      if (cur.length > 0 || rows.length === 0) pushRow(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) pushRow(cur);
  return rows.filter(r => r.length > 0 && (r.length > 1 || (r[0] && r[0].trim())));
}

function letterIndex(letter) {
  const L = (letter || '').trim().toUpperCase();
  if (!L) return null; return L.charCodeAt(0) - 64; // A->1
}

function coord(col, row) { return String.fromCharCode(64 + col) + String(row); }

function deriveBoardIndices(rowLabel, cellIndex, isIntersection) {
  const rL = letterIndex(rowLabel);
  if (!rL) return null;
  let row, col;
  if (isIntersection) {
    // intersection rows are B(2),D(4),...,X(24) => rBoard = rL/2 (1..12)
    row = rL / 2;
    // data columns at 3 + (j-1)*3 => j = ((cellIndex - 3)/3)+1 => 1..12
    const j = Math.floor((cellIndex - 3) / 3) + 1;
    col = j;
  } else {
    // stronghold rows A(1),C(3),...,Y(25) => rBoard = (rL+1)/2 (1..13)
    row = (rL + 1) / 2;
    // data columns at 1 + (j-1)*3 => j = ((cellIndex - 1)/3)+1 => 1..13
    const j = Math.floor((cellIndex - 1) / 3) + 1;
    col = j;
  }
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { row, col };
}

function parseCell(text) {
  // Examples: Lvl 3 Town (299,774) OPEN
  if (!text || !text.trim()) return null;
  const m = text.match(/Lvl\s*(\d+)\s+([^\(]+)\((\d+)\s*,\s*(\d+)\)/i);
  if (!m) return null;
  const level = parseInt(m[1], 10);
  const typeRaw = m[2].trim();
  const x = parseInt(m[3], 10), y = parseInt(m[4], 10);
  return { level, typeRaw, x, y };
}

function classify(typeRaw) {
  const t = typeRaw.toLowerCase();
  if (t.includes('great pyramid')) return { tileType: 'capitol', name: 'Great Pyramid' };
  if (t.includes('digging stronghold')) return { tileType: 'stronghold', name: 'Stronghold' };
  if (t.includes('trade post')) return { tileType: 'trading-post', name: 'Trading Post' };
  // everything else = a city-variant with sublabel
  return { tileType: 'city', name: typeRaw };
}

function citySpice(level) { return level * 100; }
function strongholdMithril(level) { return 100 + (level - 1) * 20; }

async function main() {
  const csv = await fetchText(CSV_URL);
  const rows = parseCSV(csv);
  const strongholds = [];
  const cities = [];
  const tradingPosts = [];
  let capitol = { id: 'CAP-G7', coordinates: 'G7' };

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const rowLabel = cols[0];
    const rIdx = letterIndex(rowLabel);
    if (!rIdx) continue;
    const isIntersection = (rIdx % 2 === 0);
    let j = 0;
    for (let c = 1; c < cols.length; c++) {
      const cell = cols[c];
      if (!cell) continue;
      const parsed = parseCell(cell);
      if (!parsed) continue;
      j++;
      const { level, typeRaw } = parsed;
      const cls = classify(typeRaw);
      const idx = deriveBoardIndices(rowLabel, j === 0 ? 1 : (isIntersection ? 3 + (j - 1) * 3 : 1 + (j - 1) * 3), isIntersection);
      if (!idx) continue;
      const coordinates = coord(idx.col, idx.row);
      if (cls.tileType === 'capitol') {
        capitol = { id: 'CAP-' + coordinates, coordinates };
      } else if (cls.tileType === 'stronghold') {
        strongholds.push({ coordinates, level, resourceType: 'Mithril', resourceValue: strongholdMithril(level) });
      } else if (cls.tileType === 'trading-post') {
        tradingPosts.push({ coordinates, level, offset: { x: 0.5, y: 0.5 } });
      } else if (cls.tileType === 'city') {
        cities.push({ coordinates, level, subLabel: cls.name, offset: { x: 0.5, y: 0.5 }, resourceType: 'Spice', resourceValue: citySpice(level) });
      }
    }
  }

  // Ensure G7 stronghold is removed if present
  const filteredStrongholds = strongholds.filter(s => s.coordinates !== capitol.coordinates);

  // Force the four intersections touching the Capitol to be T6 cities
  const centerAdjCoords = ['F6', 'G6', 'F7', 'G7', 'K6', 'K7', 'L6', 'L7']; // add missing S3 city coordinates to ensure completeness
  for (const coord of centerAdjCoords) {
    const idx = cities.findIndex(c => c.coordinates === coord);
    if (idx !== -1) {
      cities[idx].level = 6;
      cities[idx].resourceValue = citySpice(6);
    } else {
      // In case the dataset missed one, create it to ensure correctness
      cities.push({ coordinates: coord, level: 6, subLabel: cities.find(c => c.coordinates==='F6')?.subLabel || 'City', offset: { x: 0.5, y: 0.5 }, resourceType: 'Spice', resourceValue: citySpice(6) });
    }
  }

  // Build 7-step calendar from dataset levels:
  // Steps 1..6 unlock City levels T1..T6 respectively. Step 7 unlocks the Capitol.
  const cityUnlocks = {};
  for (let lvl = 1; lvl <= 6; lvl++) {
    cityUnlocks[lvl] = cities.filter(c => c.level === lvl).map(c => c.coordinates);
  }
  cityUnlocks[7] = [capitol.coordinates];

  const dataset = {
    key: 'S3',
    gridSize: { rows: 13, cols: 13 },
    capitol,
    strongholds: filteredStrongholds,
    cities,
    tradingPosts,
    calendar: { 
      steps: 7, 
      cityUnlocks,
      // City Clash breakpoint days (approximate, ignoring +12h):
      // W1 D3, W1 D6, W2 D3, W2 D6, W3 D3, W3 D6, W4 D7
      stepDays: [3, 6, 10, 13, 17, 20, 28]
    }
  };

  const outPath = path.resolve(process.cwd(), 'src/v2/data/s3.json');
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));
  console.log('Wrote', outPath, 'with', {
    strongholds: dataset.strongholds.length,
    cities: dataset.cities.length,
    tradingPosts: dataset.tradingPosts.length,
    capitol: dataset.capitol.coordinates
  });
}

main().catch(err => { console.error(err); process.exit(1); });

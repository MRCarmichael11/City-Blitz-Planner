// Scrape cpt-hedge.com interactive maps to harvest S1–S4 datasets
// Usage: npm run scrape:cpt-hedge (after adding playwright dependency) or: node scripts/scrape_cpt_hedge.mjs
// Output: Archives raw responses and chunks to src/v2/data/external/cpt-hedge/<season>/
//         Attempts normalization into SeasonDataset JSON at src/v2/data/s<season>.json (stub mapping for now)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Optional: uncomment after adding dependency
// import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outRoot = path.resolve(__dirname, '../src/v2/data/external/cpt-hedge');

const seasons = ['season-1', 'season-2', 'season-3', 'season-4'];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFileSafe(fp, data) {
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, data);
}

function toSafeName(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/\?.*/, '')
    .replace(/[^a-zA-Z0-9/_.-]/g, '_')
    .replace(/[\/]/g, '__');
}

async function archiveNetwork(page, seasonSlug, manifest) {
  page.on('response', async (resp) => {
    try {
      const url = resp.url();
      const status = resp.status();
      const ct = (resp.headers()['content-type'] || '').toLowerCase();
      const seasonDir = path.join(outRoot, seasonSlug);
      if (!url.includes('cpt-hedge.com')) return;
      // Save JSON and Next chunks aggressively
      const isJson = ct.includes('application/json') || url.endsWith('.json');
      const isChunk = url.includes('/_next/static/chunks/');
      const isAppPage = url.includes('/_next/static/chunks/app/') || url.includes('/_next/static/chunks/pages/');
      if (isJson || isChunk || isAppPage) {
        const body = await resp.body();
        const name = toSafeName(url);
        const fp = path.join(seasonDir, `${status}__${name}`);
        writeFileSafe(fp, body);
        manifest.push({ url, status, contentType: ct, file: path.relative(outRoot, fp) });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('resp archive error', e);
    }
  });
}

function detectSeasonKey(seasonSlug) {
  const n = seasonSlug.match(/season-(\d+)/)?.[1];
  return n ? `S${n}` : 'S0';
}

function emptySeasonDataset(key) {
  return {
    key,
    gridSize: { rows: 13, cols: 13 },
    capitol: { id: 'G7', coordinates: 'G7' },
    strongholds: [],
    cities: [],
    tradingPosts: [],
    calendar: { steps: 7, cityUnlocks: { 7: ['G7'] }, stepDays: [] },
  };
}

// Attempt to parse a Next.js chunk to extract embedded data (very heuristic)
function tryExtractFromChunk(jsText) {
  // Heuristic: look for JSON-like arrays of coordinates and objects with level/resource
  // This is a placeholder to be improved after inspecting archived chunks.
  const results = [];
  const coordRe = /\b([A-M](?:1[0-3]|[1-9]))\b/g; // A1..M13
  let m;
  while ((m = coordRe.exec(jsText))) results.push(m[1]);
  return { coordsSeen: Array.from(new Set(results)) };
}

function normalizeToSeasonDataset(key, archivesDir) {
  // Walk the season dir, try to find useful JSON or chunks
  const ds = emptySeasonDataset(key);
  const files = fs.readdirSync(archivesDir).filter(f => f.endsWith('.js') || f.endsWith('.json') || f.includes('chunks'));
  for (const f of files) {
    const fp = path.join(archivesDir, f);
    try {
      const buf = fs.readFileSync(fp);
      if (f.endsWith('.json')) {
        const text = buf.toString('utf-8');
        // If the site exposes direct JSON, attempt minimal mapping
        try {
          const obj = JSON.parse(text);
          if (Array.isArray(obj?.tiles)) {
            for (const t of obj.tiles) {
              const coordinates = t?.coord || t?.coordinates || t?.id;
              const typeRaw = (t?.type || '').toString().toLowerCase();
              const level = Number(t?.level || t?.tier || 0) || 0;
              if (!coordinates || !/^[A-M](?:1[0-3]|[1-9])$/.test(coordinates)) continue;
              if (typeRaw.includes('strong')) ds.strongholds.push({ coordinates, level });
              else if (typeRaw.includes('city')) ds.cities.push({ coordinates, level, offset: { x: 0.5, y: 0.5 } });
              else if (typeRaw.includes('trade') || typeRaw.includes('tp')) ds.tradingPosts.push({ coordinates, level, offset: { x: 0.5, y: 0.5 } });
            }
          }
        } catch { /* ignore non-JSON */ }
      } else if (f.endsWith('.js')) {
        const text = buf.toString('utf-8');
        const hint = tryExtractFromChunk(text);
        if (hint.coordsSeen?.length) {
          // For now just record that we saw coordinates; mapping needs manual rule authoring.
          // TODO: refine regexes to capture typed structures.
        }
      }
    } catch { /* ignore */ }
  }
  return ds;
}

async function run() {
  ensureDir(outRoot);

  // const browser = await chromium.launch({ headless: true });
  // const context = await browser.newContext();

  for (const seasonSlug of seasons) {
    const seasonUrl = `https://cpt-hedge.com/maps/${seasonSlug}/interactive`;
    const seasonDir = path.join(outRoot, seasonSlug);
    ensureDir(seasonDir);
    const manifest = [];

    // Network archiving phase (disabled if playwright not installed)
    // try {
    //   const page = await context.newPage();
    //   await archiveNetwork(page, seasonSlug, manifest);
    //   await page.goto(seasonUrl, { waitUntil: 'networkidle' });
    //   // Save page HTML as well
    //   const html = await page.content();
    //   writeFileSafe(path.join(seasonDir, 'page.html'), html);
    // } catch (e) {
    //   console.warn('Playwright phase skipped or failed:', e?.message || e);
    // }

    // Save manifest
    writeFileSafe(path.join(seasonDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Normalization attempt
    const ds = normalizeToSeasonDataset(detectSeasonKey(seasonSlug), seasonDir);
    const outDataset = path.resolve(__dirname, '../src/v2/data', `${detectSeasonKey(seasonSlug).toLowerCase()}.json`);
    writeFileSafe(outDataset, JSON.stringify(ds, null, 2));

    // eslint-disable-next-line no-console
    // eslint-disable-next-line no-console
    console.log(`Archived ${seasonSlug} → ${path.relative(root, seasonDir)}; dataset stub → ${path.relative(root, outDataset)}`);
  }

  // if (browser) await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });

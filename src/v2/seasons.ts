import { SeasonDefinition, coord, Territory } from './domain';
import { buildSeasonFromDataset } from './dataLoader';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function edgeStrongholds(rows: number, cols: number): Territory[] {
  const out: Territory[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const onEdge = r === 1 || c === 1 || r === rows || c === cols;
      if (onEdge) {
        out.push({
          id: `${coord(r, c)}`,
          row: r,
          col: c,
          coordinates: coord(r, c),
          tileType: 'stronghold',
          buildingLevel: 1,
          buildingType: 'Stronghold',
          resourceType: 'Mithril',
          resourceValue: 50,
        });
      }
    }
  }
  return out;
}

function simpleCities(rows: number, cols: number): Territory[] {
  // Place a city on every other inner tile as an example; real layouts will replace this.
  const out: Territory[] = [];
  for (let r = 2; r < rows; r++) {
    for (let c = 2; c < cols; c++) {
      if ((r + c) % 2 === 0) {
        out.push({
          id: `${coord(r, c)}`,
          row: r,
          col: c,
          coordinates: coord(r, c),
          tileType: 'city',
          buildingLevel: 1,
          buildingType: 'City',
          resourceType: 'Spice',
          resourceValue: 30,
          isUnlocked: false,
        });
      }
    }
  }
  return out;
}

function interleavedStrongholdsAndCities(opts: {
  rows: number;
  cols: number;
  capitolCoord: string;
  maxCityLevel?: number; // default 6
  maxStrongholdLevel?: number; // default 6
}): { territories: Territory[]; cityUnlocks: Record<number, string[]> } {
  const { rows, cols, capitolCoord } = opts;
  const maxCityLevel = opts.maxCityLevel ?? 6;
  const maxStrongholdLevel = opts.maxStrongholdLevel ?? 6;

  const territories: Territory[] = [];
  const cityUnlocks: Record<number, string[]> = {};
  for (let lvl = 1; lvl <= 6; lvl++) cityUnlocks[lvl] = [];

  const strongholdValue = (lvl: number) => 100 + (clamp(lvl, 1, 6) - 1) * 20; // S1..S6
  const cityValue = (lvl: number) => clamp(lvl, 1, 6) * 100; // T1..T6

  // Strongholds: full grid (except capitol)
  const centerR = Math.floor((rows + 1) / 2);
  const centerC = Math.floor((cols + 1) / 2);
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const id = coord(r, c);
      if (id === capitolCoord) continue;
      const ring = Math.max(Math.abs(r - centerR), Math.abs(c - centerC)); // 0..(rows-1)/2
      const level = clamp((maxStrongholdLevel + 1) - ring, 1, maxStrongholdLevel);
      territories.push({
        id,
        row: r,
        col: c,
        coordinates: id,
        tileType: 'stronghold',
        buildingLevel: level,
        buildingType: 'Stronghold',
        resourceType: 'Mithril',
        resourceValue: strongholdValue(level),
      });
    }
  }

  // Cities: all intersection cells (anchored at top-left stronghold corner), with half-offset
  // Intersections form a (rows-1) x (cols-1) lattice.
  const iRows = rows - 1;
  const iCols = cols - 1;
  const iCenterR = (iRows + 1) / 2; // e.g., 14 -> 7.5
  const iCenterC = (iCols + 1) / 2;
  for (let r = 1; r <= iRows; r++) {
    for (let c = 1; c <= iCols; c++) {
      const base = coord(r, c);
      const dr = Math.abs(r - iCenterR);
      const dc = Math.abs(c - iCenterC);
      const ring = Math.ceil(Math.max(dr, dc)); // 1.. for even-sized intersection grids
      const level = clamp((maxCityLevel + 1) - ring, 1, maxCityLevel);
      territories.push({
        id: `C-${base}`,
        row: r,
        col: c,
        coordinates: base,
        tileType: 'city',
        buildingLevel: level,
        buildingType: 'City',
        subLabel: 'City',
        resourceType: 'Spice',
        resourceValue: cityValue(level),
        isUnlocked: false,
        offset: { x: 0.5, y: 0.5 },
      });
      if (level >= 1 && level <= 6) cityUnlocks[level].push(base);
    }
  }

  // Capitol
  const capRow = parseInt(capitolCoord.slice(1), 10);
  const capCol = capitolCoord.charCodeAt(0) - 64;
  territories.push({
    id: `CAP-${capitolCoord}`,
    row: capRow,
    col: capCol,
    coordinates: capitolCoord,
    tileType: 'capitol',
    buildingLevel: 0,
    buildingType: 'Capitol',
    resourceType: 'None',
    resourceValue: 0,
  });

  return { territories, cityUnlocks };
}

// S3 is dataset-driven (generated from community sheet)
// Using static import to avoid top-level await in build output

import s3DataJson from './data/s3.json' assert { type: 'json' };
export const S3: SeasonDefinition = buildSeasonFromDataset(s3DataJson as import('./dataLoader').SeasonDataset);

export const S1: SeasonDefinition = {
  key: 'S1',
  name: 'Season 1',
  gridSize: { rows: 9, cols: 9 },
  calendar: { steps: 7, cityUnlocks: { 7: ['E5'] }, stepDays: [3,6,10,13,17,20,28] },
  generateBaseMap() {
    const { rows, cols } = this.gridSize;
    return [...edgeStrongholds(rows, cols), ...simpleCities(rows, cols)];
  }
};

export const S2: SeasonDefinition = {
  key: 'S2',
  name: 'Season 2',
  gridSize: { rows: 11, cols: 11 },
  calendar: { steps: 7, cityUnlocks: { 7: ['F6'] }, stepDays: [3,6,10,13,17,20,28] },
  generateBaseMap() {
    const { rows, cols } = this.gridSize;
    return [...edgeStrongholds(rows, cols), ...simpleCities(rows, cols)];
  }
};

export const S4: SeasonDefinition = {
  key: 'S4',
  name: 'Season 4',
  gridSize: { rows: 15, cols: 15 },
  // S4 uses the interleaved board model: Strongholds on the primary grid, Cities at intersections.
  // City tiers (T1..T6) and Stronghold tiers (S1..S6) are derived by ring distance from center (outer edge = level 1).
  calendar: (() => {
    const capitolCoord = 'H8';
    const { cityUnlocks } = interleavedStrongholdsAndCities({ rows: 15, cols: 15, capitolCoord });
    return { steps: 7, cityUnlocks: { ...cityUnlocks, 7: [capitolCoord] }, stepDays: [3,6,10,13,17,20,28] };
  })(),
  generateBaseMap() {
    const capitolCoord = 'H8';
    return interleavedStrongholdsAndCities({ rows: 15, cols: 15, capitolCoord }).territories;
  }
};

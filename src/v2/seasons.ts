import { SeasonDefinition, coord, Territory } from './domain';
import { buildSeasonFromDataset } from './dataLoader';

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

// S3 is dataset-driven (generated from community sheet)
// Using static import to avoid top-level await in build output

import s3DataJson from './data/s3.json' assert { type: 'json' };
export const S3: SeasonDefinition = buildSeasonFromDataset(s3DataJson as import('./dataLoader').SeasonDataset);

// S4 is also dataset-driven - similar to S3 with some key differences:
// - 15x15 grid instead of 13x13
// - T6 cities on cardinal axes instead of diagonal corners
// - New tile types: Holiday Market (HM) and Defensive Tower (DT) near center
import s4DataJson from './data/s4.json' assert { type: 'json' };
export const S4: SeasonDefinition = buildSeasonFromDataset(s4DataJson as import('./dataLoader').SeasonDataset);

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


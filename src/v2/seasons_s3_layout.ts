import { Territory } from './domain';

// Season 3 layout helper: 13x13 strongholds at integer grid points
// Cities/trading posts live at half offsets (r+0.5, c+0.5) visually so they appear at intersections.
// This generator follows the "diagonals to Capitol are Trading Posts" heuristic until full datasets are wired.

export function generateS3Strongholds(): Territory[] {
  const out: Territory[] = [];
  for (let r = 1; r <= 13; r++) {
    for (let c = 1; c <= 13; c++) {
      const coord = `${String.fromCharCode(64 + c)}${r}`;
      if (coord === 'G7') continue; // Capitol occupies center; skip stronghold here
      out.push({
        id: coord,
        row: r,
        col: c,
        coordinates: coord,
        tileType: 'stronghold',
        buildingLevel: 1,
        buildingType: 'Stronghold',
        resourceType: 'Mithril',
        resourceValue: 50,
      });
    }
  }
  return out;
}

// Cities occupy all intersection points EXCEPT most diagonal intersections.
// Special rule: the four intersections touching the Capitol are T6 cities.
// All other diagonal intersections are Trading Posts handled separately.
export function generateS3Cities(): Territory[] {
  const out: Territory[] = [];
  // Place a 12x12 city grid using half offsets, skipping diagonals EXCEPT the 4 center-adjacent intersections
  for (let r = 1; r <= 12; r++) {
    for (let c = 1; c <= 12; c++) {
      const onMainDiag = r === c;           // NW-SE diagonal toward center (6.5,6.5)
      const onAntiDiag = r + c === 13;      // NE-SW diagonal toward center (6.5,6.5)
      const isCenterAdjacent = (r === 6 || r === 7) && (c === 6 || c === 7);
      if (onMainDiag || onAntiDiag) {
        // Only keep the 4 city tiles touching the Capitol as cities; they are T6
        if (!isCenterAdjacent) continue;
      }
      const row = r; // anchor at top-left stronghold cell
      const col = c;
      out.push({
        id: `C-${row}-${col}`,
        row,
        col,
        coordinates: `${String.fromCharCode(64 + col)}${row}`,
        tileType: 'city',
        buildingLevel: isCenterAdjacent ? 6 : 1,
        buildingType: 'City',
        resourceType: 'Spice',
        resourceValue: 30,
        isUnlocked: false,
        offset: { x: 0.5, y: 0.5 },
      });
    }
  }
  return out;
}

// Trading Posts: placed along diagonals leading to the Capitol on intersection points
// Nearest to Capitol are TP5, then TP4, TP3, TP2, and TP1 at the outer corner intersections.
export function generateS3TradingPosts(): Territory[] {
  const out: Territory[] = [];
  for (let r = 1; r <= 12; r++) {
    for (let c = 1; c <= 12; c++) {
      const onMainDiag = r === c;
      const onAntiDiag = r + c === 13;
      if (!(onMainDiag || onAntiDiag)) continue;
      const isCenterAdjacent = (r === 6 || r === 7) && (c === 6 || c === 7);
      if (isCenterAdjacent) continue; // those four are T6 cities, not TPs
      // Compute ring distance from center intersection (6.5, 6.5)
      const dr = Math.abs(r - 6.5);
      const dc = Math.abs(c - 6.5);
      const ring = Math.ceil(Math.max(dr, dc)); // 2..6 for TP rings
      const buildingLevel = 7 - ring; // ring 2->5, 3->4, 4->3, 5->2, 6->1
      out.push({
        id: `TP-${r}-${c}`,
        row: r,
        col: c,
        coordinates: `${String.fromCharCode(64 + c)}${r}`,
        tileType: 'trading-post',
        buildingLevel,
        buildingType: 'Trading Post',
        resourceType: 'None',
        resourceValue: 0,
        offset: { x: 0.5, y: 0.5 },
      });
    }
  }
  return out;
}

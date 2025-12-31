// v2 domain types and helpers
export type TileType = 'stronghold' | 'city' | 'trading-post' | 'capitol';
export type ResourceType = 'Mithril' | 'Spice' | 'Stone' | 'Copper' | 'Iron' | 'Coal' | 'Rare Soil' | 'None';

export type SeasonKey = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export interface Territory {
  id: string; // e.g., A1
  row: number; // 1-based
  col: number; // 1-based
  coordinates: string; // A1..M13
  tileType: TileType;
  buildingLevel: number; // S#, T#, or TP# display handled in UI
  buildingType: 'Stronghold' | 'Trading Post' | 'City' | 'Capitol';
  subLabel?: string; // For City variants: Village, Altar, Town, Temple of the Sun, Square of Judgment, Ancient Tombs, etc.
  resourceType: ResourceType;
  resourceValue: number; // per hour
  isUnlocked?: boolean; // calendar step unlock state (for cities)
  offset?: { x: number; y: number }; // drawing offset in tile units (e.g., 0.5,0.5 for city at intersections)
  alliance?: string; // owner name
}

export interface Alliance {
  id: string;
  name: string;
  color: string;
  priority?: number; // lower number = higher priority; undefined => lowest priority
}

// 12-hour Action timeline primitives
export type Half = 'AM' | 'PM';
export type Tick = number; // 1..56 for S3 (28 days * 2)

export interface ActionEvent {
  tick: Tick;
  tileId: string;
  alliance: string;
  action: 'capture' | 'release';
}

// Learned policy from user-driven manual days
export interface LearnedPolicy {
  version: 1;
  // Tiles to reserve for each alliance (e.g., lanes/corridors demonstrated)
  reservedByAlliance: Record<string, string[]>;
  // Preferred start side inferred from earliest placements
  startSideByAlliance?: Record<string, 'N' | 'S' | 'E' | 'W'>;
  // Optional learned corridor width per alliance
  corridorWidthByAlliance?: Record<string, number>;
}

export function tickFromDayHalf(day: number, half: Half): Tick {
  const d = Math.max(1, Math.floor(day));
  return (d - 1) * 2 + (half === 'AM' ? 1 : 2);
}

export function dayHalfFromTick(tick: Tick): { day: number; half: Half } {
  const t = Math.max(1, Math.floor(tick));
  const day = Math.floor((t - 1) / 2) + 1;
  const half: Half = (t % 2 === 1) ? 'AM' : 'PM';
  return { day, half };
}

export interface MapData {
  season: SeasonKey;
  gridSize: { rows: number; cols: number };
  territories: Territory[];
  alliances: Alliance[];
}

export interface SeasonCalendar {
  // total number of steps (tiers) in the schedule: 7 (T1..T6 cities + Capitol)
  steps: number; // must be 7
  // Which cities unlock at which step index (1..7). Step 7 should include the Capitol.
  cityUnlocks: Record<number, string[]>; // e.g., {2: ['B3','D5'], 7: ['G7']}
  // Optional: cumulative day-of-season markers for each step (1-indexed), used to compute stronghold move windows.
  // Example (S3): [3,6,10,13,17,20,28]
  stepDays?: number[];
}

export interface SeasonDefinition {
  key: SeasonKey;
  name: string;
  gridSize: { rows: number; cols: number };
  calendar: SeasonCalendar;
  generateBaseMap: () => Territory[]; // base map at day 1 (all cities locked)
}

export function coord(row: number, col: number): string {
  return String.fromCharCode(64 + col) + String(row);
}

export function generateAlliancesDefault(): Alliance[] {
  const palette = [
    '#ef4444','#22c55e','#3b82f6','#eab308','#a855f7','#06b6d4','#f97316','#14b8a6','#84cc16','#f43f5e',
    '#8b5cf6','#0ea5e9','#10b981','#fb7185','#6366f1','#059669','#7c3aed','#f59e0b','#dc2626','#65a30d',
    '#1d4ed8','#9d174d','#0f766e','#ef4444','#22c55e','#3b82f6'
  ];
  const out: Alliance[] = [];
  for (let i = 1; i <= 24; i++) {
    out.push({ id: `a${i}`, name: `Alliance ${i}`, color: palette[(i-1)%palette.length] });
  }
  return out;
}

export function buildMapData(season: SeasonDefinition, alliances: Alliance[]): MapData {
  return {
    season: season.key,
    gridSize: season.gridSize,
    territories: season.generateBaseMap(),
    alliances,
  };
}

export function applyCalendarUnlocks(territories: Territory[], calendar: SeasonCalendar, step: number): Territory[] {
  // City Blitz has a pre-unlock window before T1 at day 3.
  // UI Step 1 represents this pre-unlock period (no cities unlocked).
  // Therefore, only unlock city tiers up to (step - 1). Step 7 unlocks Capitol.
  const unlockedCoords = new Set<string>();
  const maxTier = Math.min(6, Math.max(0, step - 1));
  for (let s = 1; s <= maxTier; s++) {
    const list = calendar.cityUnlocks[s] || [];
    list.forEach(c => unlockedCoords.add(c));
  }
  // Capitol unlocks at the final step
  if (step >= calendar.steps) {
    const cap = calendar.cityUnlocks[calendar.steps] || [];
    cap.forEach(c => unlockedCoords.add(c));
  }
  return territories.map(t =>
    t.tileType === 'city' ? { ...t, isUnlocked: unlockedCoords.has(t.coordinates) } : t
  );
}

import { Territory, SeasonDefinition, SeasonCalendar, ResourceType } from './domain';

export interface SeasonDataset {
  key: 'S1'|'S2'|'S3'|'S4'|'S0';
  gridSize: { rows: number; cols: number };
  capitol: { id: string; coordinates: string };
  strongholds: Array<{ coordinates: string; level: number; resourceType?: string; resourceValue?: number }>;
  cities: Array<{ coordinates: string; level: number; subLabel?: string; offset?: {x:number;y:number}; resourceType?: string; resourceValue?: number }>;
  tradingPosts: Array<{ coordinates: string; level: number; offset?: {x:number;y:number} }>;
  calendar?: SeasonCalendar;
}

export function buildSeasonFromDataset(ds: SeasonDataset): SeasonDefinition {
  // Normalize calendar with stepDays and city unlocks per spec
  const calendar: SeasonCalendar = (() => {
    const stepDays = (ds.calendar && Array.isArray(ds.calendar.stepDays) && ds.calendar.stepDays.length === 7)
      ? ds.calendar.stepDays
      : [3,6,10,13,17,20,28];
    const out: SeasonCalendar = { steps: 7, cityUnlocks: {}, stepDays };
    // derive levels 1..6
    for (let s = 1; s <= 6; s++) {
      out.cityUnlocks[s] = (ds.cities || []).filter(c => c.level === s).map(c => c.coordinates);
    }
    // Step 7 unlocks Capitol by default
    out.cityUnlocks[7] = [ds.capitol.coordinates];
    // Merge any explicit overrides
    if (ds.calendar && ds.calendar.cityUnlocks) {
      for (const [k, v] of Object.entries(ds.calendar.cityUnlocks)) out.cityUnlocks[Number(k)] = v;
    }
    return out;
  })();

  return {
    key: ds.key,
    name: `Season ${ds.key.slice(1)}`,
    gridSize: ds.gridSize,
    calendar,
    generateBaseMap() {
      const territories: Territory[] = [];
      const strongholdValue = (lvl: number) => 100 + (Math.max(1, Math.min(6, lvl)) - 1) * 20; // S1..S6 => 100..200 by 20s
      const cityValue = (lvl: number) => Math.max(1, Math.min(6, lvl)) * 100; // T1..T6 => 100..600 by 100s

      // strongholds
      for (const s of ds.strongholds) territories.push({
        id: s.coordinates,
        row: parseInt(s.coordinates.slice(1), 10),
        col: s.coordinates.charCodeAt(0) - 64,
        coordinates: s.coordinates,
        tileType: 'stronghold',
        buildingLevel: s.level,
        buildingType: 'Stronghold',
        resourceType: (s.resourceType as ResourceType) || 'Mithril',
        resourceValue: strongholdValue(s.level),
      });
      // cities (intersection)
      for (const c of ds.cities) territories.push({
        id: `C-${c.coordinates}`,
        row: parseInt(c.coordinates.slice(1), 10),
        col: c.coordinates.charCodeAt(0) - 64,
        coordinates: c.coordinates,
        tileType: 'city',
        buildingLevel: c.level,
        buildingType: 'City',
        subLabel: c.subLabel,
        resourceType: (c.resourceType as ResourceType) || 'Spice',
        resourceValue: cityValue(c.level),
        isUnlocked: false,
        offset: c.offset ?? { x: 0.5, y: 0.5 },
      });
      // trading posts (intersection)
      for (const t of ds.tradingPosts) territories.push({
        id: `TP-${t.coordinates}`,
        row: parseInt(t.coordinates.slice(1), 10),
        col: t.coordinates.charCodeAt(0) - 64,
        coordinates: t.coordinates,
        tileType: 'trading-post',
        buildingLevel: t.level,
        buildingType: 'Trading Post',
        resourceType: 'None',
        resourceValue: 0,
        offset: t.offset ?? { x: 0.5, y: 0.5 },
      });
      // capitol
      territories.push({
        id: ds.capitol.id,
        row: parseInt(ds.capitol.coordinates.slice(1), 10),
        col: ds.capitol.coordinates.charCodeAt(0) - 64,
        coordinates: ds.capitol.coordinates,
        tileType: 'capitol',
        buildingLevel: 0,
        buildingType: 'Capitol',
        resourceType: 'None',
        resourceValue: 0,
      });
      return territories;
    }
  };
}

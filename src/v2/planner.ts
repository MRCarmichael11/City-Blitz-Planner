import { ActionEvent, Alliance, Half, MapData, SeasonDefinition, Territory, Tick, dayHalfFromTick, tickFromDayHalf } from './domain';
import { Assignments, canCapture, type Mode } from './rules';

export interface PlannerOptions {
  // Replace future events starting at currentTick (inclusive)
  replaceFuture?: boolean;
  // Maximum ticks to plan to (defaults to end of S3 = 56 if stepDays provided)
  maxTick?: Tick;
}

export interface PlannerResult {
  planned: ActionEvent[];
  report: string[];
}

interface SimState {
  events: ActionEvent[]; // sorted by tick ascending
  // quick ownership snapshot as of latest appended event; for other ticks we recompute on demand
  assignments: Assignments;
}

function buildAssignmentsUpToTick(events: ActionEvent[], territories: Territory[], tick: Tick): Assignments {
  const out: Assignments = {};
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const sd: number[] = []; // step days derived from season elsewhere; caller sets step via planner when validating
  for (const e of sorted) {
    if (e.tick > tick) break;
    if (e.action === 'capture') out[e.tileId] = { alliance: e.alliance, step: 1 };
    else if (e.action === 'release') delete out[e.tileId];
  }
  return out;
}

// Convert tile to lattice center coordinates used for adjacency checks
function latticeXY(t: Territory): { x: number; y: number } {
  const x = 2 * t.col + (t.offset?.x ? 1 : 0);
  const y = 2 * t.row + (t.offset?.y ? 1 : 0);
  return { x, y };
}

function isCapturable(t: Territory): boolean {
  return t.tileType === 'stronghold' || t.tileType === 'city' || t.tileType === 'capitol';
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Get neighbors on half-step lattice: adjacency iff manhattan === 2
function neighbors(t: Territory, all: Territory[]): Territory[] {
  const txy = latticeXY(t);
  const out: Territory[] = [];
  for (const n of all) {
    if (n.id === t.id) continue;
    if (!isCapturable(n)) continue; // skip TPs
    const nxy = latticeXY(n);
    if (manhattan(nxy, txy) === 2) out.push(n);
  }
  return out;
}

function findCapitol(territories: Territory[]): Territory | null {
  return territories.find(t => t.tileType === 'capitol') || null;
}

function isEdgeStronghold(t: Territory, rows: number, cols: number): boolean {
  return t.tileType === 'stronghold' && t.buildingLevel === 1 && (t.row === 1 || t.col === 1 || t.row === rows || t.col === cols);
}

// Pick anchor points roughly at top, right, bottom, left midpoints to reduce conflicts
function anchorCandidates(rows: number, cols: number): Array<{ r: number; c: number }> {
  return [
    { r: 1, c: Math.floor(cols / 2) }, // top
    { r: Math.floor(rows / 2), c: cols }, // right
    { r: rows, c: Math.floor(cols / 2) }, // bottom
    { r: Math.floor(rows / 2), c: 1 }, // left
  ];
}

function pickStarts(alliances: Alliance[], map: MapData): Record<string, Territory | null> {
  const starts: Record<string, Territory | null> = {};
  const anchors = anchorCandidates(map.gridSize.rows, map.gridSize.cols);
  const used = new Set<string>();
  const sh = map.territories.filter(t => isEdgeStronghold(t, map.gridSize.rows, map.gridSize.cols));
  function nearestTo(r: number, c: number): Territory | null {
    let best: Territory | null = null; let bestD = Number.POSITIVE_INFINITY;
    for (const t of sh) {
      if (used.has(t.id)) continue;
      const d = Math.abs(t.row - r) + Math.abs(t.col - c);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }
  alliances.forEach((a, idx) => {
    const anchor = anchors[idx % anchors.length];
    const start = nearestTo(anchor.r, anchor.c);
    if (start) used.add(start.id);
    starts[a.name] = start ?? null;
  });
  return starts;
}

// Select distinct target tiles near the capitol to stage final positions
function pickTargets(alliances: Alliance[], map: MapData): Record<string, Territory | null> {
  const targets: Record<string, Territory | null> = {};
  const cap = findCapitol(map.territories);
  if (!cap) {
    alliances.forEach(a => targets[a.name] = null);
    return targets;
  }
  const capXY = latticeXY(cap);
  const candidates = map.territories.filter(t => isCapturable(t) && t.id !== cap.id);
  candidates.sort((a, b) => manhattan(latticeXY(a), capXY) - manhattan(latticeXY(b), capXY));
  const used = new Set<string>();
  alliances.forEach((a) => {
    const picked = candidates.find(t => !used.has(t.id));
    if (picked) used.add(picked.id);
    targets[a.name] = picked ?? null;
  });
  return targets;
}

// BFS path between start and target avoiding trading posts and already reserved corridors
function bfsPath(start: Territory, goal: Territory, map: MapData, reserved: Set<string>): Territory[] | null {
  const q: Territory[] = [];
  const prev = new Map<string, string | null>();
  q.push(start);
  prev.set(start.id, null);
  while (q.length) {
    const cur = q.shift()!;
    if (cur.id === goal.id) break;
    for (const nb of neighbors(cur, map.territories)) {
      if (!isCapturable(nb)) continue;
      if (reserved.has(nb.id) && nb.id !== goal.id && nb.id !== start.id) continue;
      if (!prev.has(nb.id)) {
        prev.set(nb.id, cur.id);
        q.push(nb);
      }
    }
  }
  if (!prev.has(goal.id)) return null;
  const path: Territory[] = [];
  let curId: string | null = goal.id;
  while (curId) {
    const t = map.territories.find(tt => tt.id === curId);
    if (!t) break;
    path.push(t);
    curId = prev.get(curId) ?? null;
  }
  path.reverse();
  return path;
}

function endOfSeasonTick(season: SeasonDefinition): Tick {
  const sd = season.calendar.stepDays || [28];
  const lastDay = sd[sd.length - 1] || 28;
  // 12-hour timeline, two ticks per day
  return tickFromDayHalf(lastDay, 'PM');
}

function stepFromDay(day: number, season: SeasonDefinition): number {
  const sd = season.calendar.stepDays || [];
  let s = 1;
  for (let i = 0; i < sd.length; i++) { if (day >= sd[i]) s = i + 1; }
  return Math.max(1, Math.min(s, season.calendar.steps));
}

export function planSeason(map: MapData, season: SeasonDefinition, alliances: Alliance[], currentTick: Tick, existingEvents: ActionEvent[], options?: PlannerOptions): PlannerResult {
  const report: string[] = [];
  const replaceFuture = options?.replaceFuture ?? true;
  const maxTick = options?.maxTick ?? endOfSeasonTick(season);
  // Group alliances by priority (lower number = higher)
  const allies = [...alliances];
  allies.sort((a, b) => (a.priority ?? Number.POSITIVE_INFINITY) - (b.priority ?? Number.POSITIVE_INFINITY));
  // Determine starts and targets
  const starts = pickStarts(allies, map);
  const targets = pickTargets(allies, map);
  const reserved = new Set<string>();
  const planned: ActionEvent[] = [];

  // Simulation state includes past events up to currentTick (kept), future events optionally replaced
  const past = existingEvents.filter(e => e.tick <= currentTick);
  let simEvents: ActionEvent[] = [...past];
  let simAssignments: Assignments = buildAssignmentsUpToTick(simEvents, map.territories, currentTick);

  // Helper to schedule one capture at the earliest available tick respecting daily caps/unlocks/adjacency via canCapture
  const scheduleCapture = (allianceName: string, tile: Territory, startTick: Tick) => {
    let t = startTick as Tick;
    const safetyLimit = maxTick + 100 as Tick;
    while (t <= maxTick) {
      const { day, half } = dayHalfFromTick(t);
      const step = stepFromDay(day, season);
      // Build assignments as of this tick
      simAssignments = buildAssignmentsUpToTick(simEvents, map.territories, t);
      const ok = canCapture(tile, {
        mode: 'action', step, calendar: season.calendar, territories: map.territories, assignments: simAssignments, selectedAlliance: allianceName, currentTick: t, events: simEvents,
      } as const);
      if (ok.ok) {
        const ev: ActionEvent = { tick: t, tileId: tile.id, alliance: allianceName, action: 'capture' };
        simEvents = [...simEvents, ev];
        planned.push(ev);
        report.push(`Plan: ${allianceName} capture ${tile.coordinates} (${tile.id}) at Day ${day} ${half} (Tick ${t})`);
        return t;
      }
      // advance to next half-day tick
      t = (t + 1) as Tick;
      if (t > safetyLimit) break;
    }
    report.push(`Could not schedule ${tile.id} for ${allianceName} before end of season`);
    return null;
  };

  // Iterate alliances by priority, reserving corridor paths for each before moving to the next
  for (const a of allies) {
    const start = starts[a.name];
    const target = targets[a.name];
    if (!start || !target) { report.push(`Skip ${a.name}: missing ${!start ? 'start' : 'target'}`); continue; }
    // Reserve start immediately so others don't take it
    reserved.add(start.id);
    // Compute corridor path
    const path = bfsPath(start, target, map, reserved);
    if (!path || path.length === 0) { report.push(`No path for ${a.name} from ${start.id} to ${target.id}`); continue; }
    // Ensure first capture is the start tile; path includes start->...->target
    let lastTickPlaced: Tick = currentTick;
    for (let i = 0; i < path.length; i++) {
      const tile = path[i];
      if (!isCapturable(tile)) continue;
      // Reserve corridor tiles to prevent later alliances from pathing through
      reserved.add(tile.id);
      // Schedule capture if not already owned by alliance at this tick
      const assigned = simAssignments[tile.id]?.alliance === a.name;
      if (assigned) continue;
      const placedAt = scheduleCapture(a.name, tile, lastTickPlaced);
      if (placedAt) lastTickPlaced = placedAt as Tick;
      else break; // can't schedule further for this alliance
    }
  }

  // Return only future planned events; when applying, caller will merge with past according to replaceFuture
  const futurePlanned = planned.filter(e => e.tick >= currentTick);
  return { planned: futurePlanned, report };
}

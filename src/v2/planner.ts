import { ActionEvent, Alliance, MapData, SeasonDefinition, Territory, Tick, dayHalfFromTick, tickFromDayHalf, applyCalendarUnlocks } from './domain';
import { Assignments, canCapture } from './rules';

export interface PlannerOptions {
  replaceFuture?: boolean;
  maxTick?: Tick;
  plowBias?: 'center' | 'breadth';
  corridorWidth?: number; // desired corridor width in tiles (4-6 typical)
}

export interface PlannerResult {
  planned: ActionEvent[];
  report: string[];
}

function buildAssignmentsUpToTick(events: ActionEvent[], territories: Territory[], tick: Tick): Assignments {
  const out: Assignments = {};
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  for (const e of sorted) {
    if (e.tick > tick) break;
    if (e.action === 'capture') out[e.tileId] = { alliance: e.alliance, step: 1 };
    else if (e.action === 'release') delete out[e.tileId];
  }
  return out;
}

// half-step lattice helpers
function latticeXY(t: Territory): { x: number; y: number } {
  const x = 2 * t.col + (t.offset?.x ? 1 : 0);
  const y = 2 * t.row + (t.offset?.y ? 1 : 0);
  return { x, y };
}
function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isCapturable(t: Territory): boolean {
  return t.tileType === 'stronghold' || t.tileType === 'city' || t.tileType === 'capitol';
}

function findCapitol(territories: Territory[]): Territory | null {
  return territories.find(t => t.tileType === 'capitol') || null;
}

function isEdgeStronghold(t: Territory, rows: number, cols: number): boolean {
  return t.tileType === 'stronghold' && t.buildingLevel === 1 && (t.row === 1 || t.col === 1 || t.row === rows || t.col === cols);
}

// Four anchor directions to spread equal priority alliances
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
  const assigned: Territory[] = [];
  function pickStartNear(r: number, c: number): Territory | null {
    let best: Territory | null = null; let bestScore = -Infinity;
    for (const t of sh) {
      if (used.has(t.id)) continue;
      // maximize distance to already assigned starts to create spacing
      let minDist = Infinity;
      for (const a of assigned) {
        const d = Math.abs(t.row - a.row) + Math.abs(t.col - a.col);
        if (d < minDist) minDist = d;
      }
      if (!assigned.length) minDist = 999;
      const toAnchor = Math.abs(t.row - r) + Math.abs(t.col - c);
      const score = minDist * 100 - toAnchor; // heavy spacing bias, tie-break by closeness to anchor
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
  // group by priority, pair equal-priority alliances to opposite anchors
  const groups = new Map<number, Alliance[]>();
  const keyFor = (a: Alliance) => (a.priority ?? Number.POSITIVE_INFINITY);
  for (const a of alliances) {
    const k = keyFor(a);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);
  let anchorIndex = 0;
  for (const k of sortedKeys) {
    const group = groups.get(k)!;
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      const a1 = anchors[anchorIndex % anchors.length];
      const opposite = (anchorIndex + 2) % anchors.length;
      const a2 = anchors[opposite];
      const targetAnchor = (i % 2 === 0) ? a1 : a2;
      const start = pickStartNear(targetAnchor.r, targetAnchor.c);
      if (start) { used.add(start.id); assigned.push(start); }
      starts[a.name] = start ?? null;
      if (i % 2 === 1) anchorIndex++; // advance after assigning pair
    }
    if (group.length % 2 === 1) anchorIndex++; // odd group, move to next anchor ring
  }
  return starts;
}

function endOfSeasonTick(season: SeasonDefinition): Tick {
  const sd = season.calendar.stepDays || [28];
  const lastDay = sd[sd.length - 1] || 28;
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
  const maxTick = options?.maxTick ?? endOfSeasonTick(season);
  const corridorWidthBase = Math.max(2, Math.min(8, options?.corridorWidth ?? 4));

  // Priority ordering (lower number = higher priority)
  const allies = [...alliances].sort((a, b) => (a.priority ?? Number.POSITIVE_INFINITY) - (b.priority ?? Number.POSITIVE_INFINITY));

  // Starting tiles (symmetric for equal priority)
  const starts = pickStarts(allies, map);

  // Simulation baseline: keep past events, plan future on top
  const past = existingEvents.filter(e => e.tick <= currentTick);
  let simEvents: ActionEvent[] = [...past];
  let simAssignments: Assignments = buildAssignmentsUpToTick(simEvents, map.territories, currentTick);

  // Schedule one capture at or after a tick, advancing by 12h steps if blocked
  const scheduleCapture = (allianceName: string, tile: Territory, startTick: Tick) => {
    let t = startTick as Tick;
    const safetyLimit = (maxTick + 100) as Tick;
    while (t <= maxTick) {
      const { day, half } = dayHalfFromTick(t);
      const step = stepFromDay(day, season);
      simAssignments = buildAssignmentsUpToTick(simEvents, map.territories, t);
      const ok = canCapture(tile, { mode: 'action', step, calendar: season.calendar, territories: map.territories, assignments: simAssignments, selectedAlliance: allianceName, currentTick: t, events: simEvents } as const);
      if (ok.ok) {
        const ev: ActionEvent = { tick: t, tileId: tile.id, alliance: allianceName, action: 'capture' };
        simEvents = [...simEvents, ev];
        report.push(`Plan: ${allianceName} capture ${tile.coordinates} (${tile.id}) at Day ${day} ${half} (Tick ${t})`);
        return t;
      }
      t = (t + 1) as Tick;
      if (t > safetyLimit) break;
    }
    report.push(`Could not schedule ${tile.id} for ${allianceName} before end of season`);
    return null;
  };

  // Day-power model
  const stepDays = season.calendar.stepDays || [3,6,10,13,17,20,28];
  const dayFromTick = (t: Tick) => dayHalfFromTick(t).day;
  const currentDay = dayFromTick(currentTick);
  const lastDay = stepDays[stepDays.length - 1] || 28;
  const unlockedCityLevelAt = (day: number) => {
    // Step 2 unlocks T1 → unlocked level = step-1, clamp to [0..6]
    const step = stepFromDay(day, season);
    return Math.max(0, Math.min(6, step - 1));
  };
  const allowedStrongholdLevelAt = (day: number) => Math.max(1, Math.min(6, unlockedCityLevelAt(day) + 1));

  // Ensure first capture (Lv1 SH) if alliance has no holdings yet
  const ensureFirstCapture = (a: Alliance, day: number) => {
    const hasHoldings = Object.values(simAssignments).some(v => v.alliance === a.name);
    if (hasHoldings) return;
    const start = starts[a.name];
    if (!start) return;
    const tickAM = tickFromDayHalf(day, 'AM');
    scheduleCapture(a.name, start, tickAM);
  };

  // Scoring helpers with priority-scaled center bias and corridor width
  const cap = findCapitol(map.territories);
  const capXY = cap ? latticeXY(cap) : { x: (map.gridSize.cols*2)/2, y: (map.gridSize.rows*2)/2 };
  function corridorPenalty(p: {x:number;y:number}, start: Territory | null, width: number) {
    if (!start) return 0;
    const s = latticeXY(start);
    const vx = capXY.x - s.x, vy = capXY.y - s.y;
    const vLen = Math.max(1, Math.hypot(vx, vy));
    const nx = -vy / vLen, ny = vx / vLen; // unit normal
    const dist = Math.abs((p.x - s.x) * nx + (p.y - s.y) * ny);
    const pen = Math.max(0, dist - width / 2) * 2;
    return pen;
  }
  function insideCorridor(p: {x:number;y:number}, start: Territory | null, width: number) {
    if (!start) return false;
    const s = latticeXY(start);
    const vx = capXY.x - s.x, vy = capXY.y - s.y;
    const vLen = Math.max(1, Math.hypot(vx, vy));
    const nx = -vy / vLen, ny = vx / vLen;
    const dist = Math.abs((p.x - s.x) * nx + (p.y - s.y) * ny);
    return dist <= width / 2;
  }
  function priorityCorridorWidth(priority?: number) {
    if (priority === 1) return corridorWidthBase + 2;
    if (priority === 2) return corridorWidthBase + 1;
    if (priority === 3) return corridorWidthBase;
    return Math.max(2, corridorWidthBase - 1);
  }
  function centerBias(priority?: number) {
    if (priority === 1) return 2.0;
    if (priority === 2) return 1.5;
    if (priority === 3) return 1.2;
    return 1.0;
  }
  function scoreCity(t: Territory, a: Alliance, startsMap: Record<string, Territory | null>, p1Start: Territory | null, p2Start: Territory | null) {
    const p = latticeXY(t);
    const base = -manhattan(p, capXY) * centerBias(a.priority);
    const start = startsMap[a.name] ?? null;
    const width = priorityCorridorWidth(a.priority);
    const pen = corridorPenalty(p, start, width);
    let avoidPen = 0;
    if ((a.priority ?? 99) > 2) {
      if (insideCorridor(p, p1Start, priorityCorridorWidth(1))) avoidPen += 50;
      if (insideCorridor(p, p2Start, priorityCorridorWidth(2))) avoidPen += 30;
    }
    return base - pen - avoidPen;
  }
  function scoreStronghold(t: Territory, preferredLevel: number, a: Alliance, startsMap: Record<string, Territory | null>, p1Start: Territory | null, p2Start: Territory | null) {
    const p = latticeXY(t);
    const levelScore = (t.buildingLevel === preferredLevel) ? 1000 : (t.buildingLevel === preferredLevel - 1 ? 500 : 0);
    const base = levelScore - manhattan(p, capXY) * centerBias(a.priority);
    const start = startsMap[a.name] ?? null;
    const width = priorityCorridorWidth(a.priority);
    const pen = corridorPenalty(p, start, width);
    let avoidPen = 0;
    if ((a.priority ?? 99) > 2) {
      if (insideCorridor(p, p1Start, priorityCorridorWidth(1))) avoidPen += 50;
      if (insideCorridor(p, p2Start, priorityCorridorWidth(2))) avoidPen += 30;
    }
    return base - pen - avoidPen;
  }

  // Day-by-day greedy scheduling
  // Identify top two priority starts for corridor reservation
  const pSorted = [...allies].sort((a,b) => (a.priority ?? 99) - (b.priority ?? 99));
  const p1 = pSorted[0];
  const p2 = pSorted[1];
  const p1Start = p1 ? starts[p1.name] ?? null : null;
  const p2Start = p2 ? starts[p2.name] ?? null : null;

  for (let day = currentDay; day <= lastDay; day++) {
    const tickAM = tickFromDayHalf(day, 'AM');
    const tickPM = tickFromDayHalf(day, 'PM');
    const cityLvl = unlockedCityLevelAt(day); // 0 if cities locked
    const shLvl = Math.max(1, Math.min(6, allowedStrongholdLevelAt(day) + 1));

    // Enforce first capture if needed
    for (const a of allies) ensureFirstCapture(a, day);

    // CITY PASS FIRST (AM)
    if (cityLvl >= 1) {
      for (const a of allies) {
        let takenC = 0;
        const step = stepFromDay(day, season);
        const tickCity = tickFromDayHalf(day, 'AM');
        const terrUnlocked = applyCalendarUnlocks(map.territories, season.calendar, step);
        const asg = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickCity);
        const ownedIds = new Set(Object.entries(asg).filter(([,v]) => v.alliance === a.name).map(([k]) => k));
        const tiers = Array.from({ length: cityLvl }, (_, i) => cityLvl - i);
        for (const tier of tiers) {
          if (takenC >= 2) break;
          const pool = terrUnlocked.filter(t => t.tileType === 'city' && t.buildingLevel === tier && !ownedIds.has(t.id));
          const adj = pool.filter(ct => {
            const ok = canCapture(ct, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: asg, selectedAlliance: a.name, currentTick: tickCity, events: simEvents } as const);
            if (!ok.ok) return false;
            const holder = asg[ct.id]?.alliance;
            if (holder && holder !== a.name) return false;
            return true;
          });
          adj.sort((x,y) => scoreCity(y, a, starts, p1Start, p2Start) - scoreCity(x, a, starts, p1Start, p2Start));
          for (const ct of adj) {
            if (takenC >= 2) break;
            const placed = scheduleCapture(a.name, ct, tickCity);
            if (placed) takenC++;
          }
        }
      }
    }

    // STRONGHOLD PASS SECOND (PM)
    for (const a of allies) {
      let takenS = 0;
      const step = stepFromDay(day, season);
      const tickCity = tickFromDayHalf(day, 'AM');
      const terrUnlocked = applyCalendarUnlocks(map.territories, season.calendar, step);
      const asg = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
      const ownedIds = new Set(Object.entries(asg).filter(([,v]) => v.alliance === a.name).map(([k]) => k));
      const sh = terrUnlocked.filter(t => t.tileType === 'stronghold' && t.buildingLevel <= shLvl && !ownedIds.has(t.id));
      const adj = sh.filter(st => {
        const res = canCapture(st, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: asg, selectedAlliance: a.name, currentTick: tickPM, events: simEvents } as const);
        if (!res.ok) return false;
        const holder = asg[st.id]?.alliance;
        if (holder && holder !== a.name) return false;
        return true;
      });
      adj.sort((x,y) => scoreStronghold(y, shLvl, a, starts, p1Start, p2Start) - scoreStronghold(x, shLvl, a, starts, p1Start, p2Start));

      // Determine how many we expect to take today (up to 2)
      const previewTargets = adj.slice(0, 2);

      // Release planning to free capacity for higher-level captures (drop lowest-level farthest from center, not adjacent to targets)
      const currentAsg = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
      const ownedSH = Object.entries(currentAsg)
        .filter(([,v]) => v.alliance === a.name)
        .map(([id]) => terrUnlocked.find(t => t.id === id)!)
        .filter(t => t && t.tileType === 'stronghold');
      const strongholdCount = ownedSH.length;
      const needSlots = Math.max(0, (strongholdCount + previewTargets.length) - 8);
      if (needSlots > 0) {
        const protectedIds = new Set<string>();
        for (const tgt of previewTargets) {
          for (const o of ownedSH) {
            const man = Math.abs((2*o.col + (o.offset?.x?1:0)) - (2*tgt.col + (tgt.offset?.x?1:0))) + Math.abs((2*o.row + (o.offset?.y?1:0)) - (2*tgt.row + (tgt.offset?.y?1:0)));
            if (man === 2) protectedIds.add(o.id);
          }
        }
        const sortedToDump = [...ownedSH]
          .filter(t => !protectedIds.has(t.id))
          .sort((a,b) => {
            if (a.buildingLevel !== b.buildingLevel) return a.buildingLevel - b.buildingLevel;
            const da = manhattan(latticeXY(a), capXY);
            const db = manhattan(latticeXY(b), capXY);
            return db - da;
          });
        for (let i = 0; i < Math.min(needSlots, sortedToDump.length); i++) {
          const dump = sortedToDump[i];
          const ev: ActionEvent = { tick: tickPM, tileId: dump.id, alliance: a.name, action: 'release' };
          simEvents = [...simEvents, ev];
          report.push(`Plan: ${a.name} release ${dump.coordinates} at Day ${day} PM to free slot`);
        }
      }

      for (const st of adj) {
        if (takenS >= 2) break;
        const placed = scheduleCapture(a.name, st, tickPM);
        if (placed) takenS++;
      }
    }
  }

  const futurePlanned = simEvents.filter(e => e.tick >= currentTick);
  // Exclude duplicates from past baseline
  const plannedOnlyFuture = futurePlanned.filter(e => !past.some(p => p.tick === e.tick && p.tileId === e.tileId && p.action === e.action && p.alliance === e.alliance));
  return { planned: plannedOnlyFuture, report };
}

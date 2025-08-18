import { ActionEvent, Alliance, MapData, SeasonDefinition, Territory, Tick, dayHalfFromTick, tickFromDayHalf, applyCalendarUnlocks } from './domain';
import { Assignments, canCapture, hasAdjacentOwned, countsTotal } from './rules';

export interface PlannerOptions {
  replaceFuture?: boolean;
  maxTick?: Tick;
  plowBias?: 'center' | 'breadth';
  corridorWidth?: number; // desired corridor width in tiles (4-6 typical)
  plannedTarget?: Assignments; // final-day planned assignments to bias toward
  // When true, planner will strongly prefer planned target tiles over non-target tiles
  strictToTarget?: boolean;
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
  const plannedTarget = (options?.plannedTarget ?? {}) as Assignments;

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

  // If strict per-priority pathing is requested, run the layered planner
  if (options?.strictToTarget) {
    const stepDays = season.calendar.stepDays || [3,6,10,13,17,20,28];
    const lastDay = stepDays[stepDays.length - 1] || 28;

    // Helper: centroid of planned target for an alliance
    const centroidFor = (ally: Alliance) => {
      const ids = Object.entries(plannedTarget).filter(([,v]) => v.alliance === ally.name).map(([id]) => id);
      if (ids.length === 0) return latticeXY(findCapitol(map.territories) || map.territories[0]);
      let sx = 0, sy = 0;
      for (const id of ids) {
        const t = map.territories.find(tt => tt.id === id);
        if (!t) continue;
        const p = latticeXY(t); sx += p.x; sy += p.y;
      }
      return { x: sx / Math.max(1, ids.length), y: sy / Math.max(1, ids.length) };
    };
    const cap = findCapitol(map.territories);
    const capXY = cap ? latticeXY(cap) : { x: (map.gridSize.cols*2)/2, y: (map.gridSize.rows*2)/2 };

    function chooseStartForAlliance(a: Alliance): Territory | null {
      // Prefer existing owned SH at currentTick
      const owned = Object.entries(simAssignments).filter(([,v]) => v.alliance === a.name).map(([id]) => map.territories.find(t => t.id === id)!).filter(Boolean);
      const ownedSH = owned.find(t => t.tileType === 'stronghold');
      if (ownedSH) return ownedSH;
      // Otherwise, pick edge based on final-day footprint direction (toward centroid vs map center)
      const c = centroidFor(a);
      const dx = c.x - capXY.x; const dy = c.y - capXY.y;
      const absx = Math.abs(dx), absy = Math.abs(dy);
      let side: 'N'|'S'|'E'|'W' = 'W';
      if (absx >= absy) side = dx < 0 ? 'W' : 'E'; else side = dy < 0 ? 'N' : 'S';
      const edges = map.territories.filter(t => isEdgeStronghold(t, map.gridSize.rows, map.gridSize.cols));
      // Prefer Lv1 SH on the chosen side line first, with at least one adjacent Lv1 neighbor for Day 1 PM
      const sideFilter = (t: Territory) => {
        if (side === 'W') return t.col === 1;
        if (side === 'E') return t.col === map.gridSize.cols;
        if (side === 'N') return t.row === 1;
        return t.row === map.gridSize.rows;
      };
      const edgeOnSide = edges.filter(sideFilter);
      const allLv1 = map.territories.filter(tt => tt.tileType === 'stronghold' && tt.buildingLevel === 1);
      const hasLv1Neighbor = (t: Territory) => allLv1.some(nn => nn.id !== t.id && (Math.abs(latticeXY(nn).x - latticeXY(t).x) + Math.abs(latticeXY(nn).y - latticeXY(t).y) === 2));
      const scoreNearest = (list: Territory[], requireNeighbor = false) => {
        let best: Territory | null = null; let bestScore = Infinity;
        for (const t of list) {
          if (requireNeighbor && !hasLv1Neighbor(t)) continue;
          const p = latticeXY(t);
          const d = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
          if (d < bestScore) { bestScore = d; best = t; }
        }
        return best;
      };
      const lvl1OnSide = edgeOnSide.filter(t => t.buildingLevel === 1);
      const pick = scoreNearest(lvl1OnSide, true) || scoreNearest(lvl1OnSide) || scoreNearest(edgeOnSide, true) || scoreNearest(edgeOnSide) || scoreNearest(edges);
      return pick ?? starts[a.name] ?? null;
    }

    function corridorPenaltyToTarget(p: {x:number;y:number}, start: Territory | null, target: {x:number;y:number}, width: number) {
      if (!start) return 0;
      const s = latticeXY(start);
      const vx = target.x - s.x, vy = target.y - s.y;
      const vLen = Math.max(1, Math.hypot(vx, vy));
      const nx = -vy / vLen, ny = vx / vLen; // unit normal
      const dist = Math.abs((p.x - s.x) * nx + (p.y - s.y) * ny);
      const pen = Math.max(0, dist - width / 2) * 5;
      return pen;
    }

    // Reserve set: all plannedTarget tiles for alliances already planned
    const reservedByOthers = new Set<string>();

    const dayFromTick = (t: Tick) => dayHalfFromTick(t).day;
    const currentDay = dayFromTick(currentTick);

    // Day 1 (or current day) pre-schedule: ensure every alliance starts with 2 adjacent Lv1 SH
    {
      const preDay = currentDay;
      const tickAM = tickFromDayHalf(preDay, 'AM');
      const tickPM = tickFromDayHalf(preDay, 'PM');
      const step = stepFromDay(preDay, season);
      const terrUnlocked = applyCalendarUnlocks(map.territories, season.calendar, step);
      const lv1All = terrUnlocked.filter(t => t.tileType==='stronghold' && t.buildingLevel===1);
      const dist = (p:{x:number;y:number}, q:{x:number;y:number}) => Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
      // For each alliance in priority order
      for (const a of allies) {
        // Skip if they already own anything by AM
        const asgAM = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickAM);
        const ownsAny = Object.values(asgAM).some(v => v.alliance === a.name);
        if (ownsAny) continue;
        // Compute target centroid and side
        const c = centroidFor(a);
        const dx = c.x - capXY.x; const dy = c.y - capXY.y;
        const absx = Math.abs(dx), absy = Math.abs(dy);
        let side: 'N'|'S'|'E'|'W' = 'W';
        if (absx >= absy) side = dx < 0 ? 'W' : 'E'; else side = dy < 0 ? 'N' : 'S';
        const sideEdge = (t: Territory) => (side==='W'?t.col===1: side==='E'?t.col===map.gridSize.cols: side==='N'?t.row===1: t.row===map.gridSize.rows);
        const lxy = (t: Territory) => latticeXY(t);
        // Build candidate pairs: adjacent Lv1 pairs (Manhattan 2 on lattice)
        const pairs: Array<{a:Territory;b:Territory;score:number}> = [];
        const poolSide = lv1All.filter(sideEdge);
        function pushPairs(pool: Territory[]) {
          for (let i=0;i<pool.length;i++) {
            for (let j=i+1;j<pool.length;j++) {
              const t1=pool[i], t2=pool[j];
              if (dist(lxy(t1), lxy(t2))!==2) continue; // must be adjacent on half-lattice
              // skip if reserved already by someone else
              if (reservedByOthers.has(t1.id) || reservedByOthers.has(t2.id)) continue;
              // score: closeness of pair center to target centroid
              const cx=(lxy(t1).x+lxy(t2).x)/2, cy=(lxy(t1).y+lxy(t2).y)/2;
              const s = Math.abs(cx - c.x) + Math.abs(cy - c.y);
              pairs.push({a:t1,b:t2,score:s});
            }
          }
        }
        // Try on side first, then all edges, then anywhere if needed
        pushPairs(poolSide);
        if (pairs.length===0) {
          const edges = lv1All.filter(t => t.row===1||t.col===1||t.row===map.gridSize.rows||t.col===map.gridSize.cols);
          pushPairs(edges);
        }
        if (pairs.length===0) {
          pushPairs(lv1All); // anywhere
        }
        if (pairs.length===0) continue; // no valid pair available
        pairs.sort((x,y)=> x.score - y.score);
        const best = pairs[0];
        // Schedule AM then PM
        const ok1 = canCapture(best.a, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: asgAM, selectedAlliance: a.name, currentTick: tickAM, events: simEvents } as const);
        if (ok1.ok) {
          const placed1 = scheduleCapture(a.name, best.a, tickAM);
          if (placed1) {
            reservedByOthers.add(best.a.id);
            const asgPM = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
            // ensure second still free and adjacent
            const ok2 = canCapture(best.b, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: asgPM, selectedAlliance: a.name, currentTick: tickPM, events: simEvents } as const);
            if (ok2.ok) {
              const placed2 = scheduleCapture(a.name, best.b, tickPM);
              if (placed2) reservedByOthers.add(best.b.id);
            }
          }
        }
      }
    }

    // Plan alliances strictly in priority order, one at a time
    for (const a of allies) {
      const targetC = centroidFor(a);
      const start = chooseStartForAlliance(a);
      const width = priorityCorridorWidth(a.priority);
      // Precompute strict corridor mask toward target (width by priority)
      const inCorridor = (t: Territory) => corridorPenaltyToTarget(latticeXY(t), start, targetC, width) <= 0.5;
      const corridorSet = new Set<string>(map.territories.filter(tt => isCapturable(tt) && inCorridor(tt)).map(tt => tt.id));

      for (let day = currentDay; day <= lastDay; day++) {
        const step = stepFromDay(day, season);
        const tickAM = tickFromDayHalf(day, 'AM');
        const tickPM = tickFromDayHalf(day, 'PM');
        const terrUnlocked = applyCalendarUnlocks(map.territories, season.calendar, step);

        // Refresh assignments at AM
        simAssignments = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickAM);
        const ownedIds = new Set(Object.entries(simAssignments).filter(([,v]) => v.alliance === a.name).map(([k]) => k));

        // Ensure first capture (Lv1 SH)
        if (ownedIds.size === 0 && start) {
          scheduleCapture(a.name, start, tickAM);
          simAssignments = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickAM);
        }

        // AM pass: cities (prefer plannedTarget of this alliance, avoid reservedByOthers)
        const maxCityLvl = Math.max(0, Math.min(6, step - 1));
        if (maxCityLvl >= 1) {
          // Preview candidates to check capacity and optionally release far non-target cities
          const currentAsgAM = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickAM);
          const ownedCities = Object.entries(currentAsgAM)
            .filter(([,v]) => v.alliance === a.name)
            .map(([id]) => terrUnlocked.find(t => t.id === id)!)
            .filter(t => t && t.tileType === 'city');
          // Build candidate list first
          const candidates = terrUnlocked.filter(t => t.tileType === 'city' && t.buildingLevel <= maxCityLvl);
          const adjPre = candidates.filter(ct => {
            if (reservedByOthers.has(ct.id)) return false;
            const ok = canCapture(ct, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: currentAsgAM, selectedAlliance: a.name, currentTick: tickAM, events: simEvents } as const);
            return ok.ok;
          });
          // Strict corridor filter: only take cities inside corridor or explicitly in final plan for this alliance
          const adjStrict = adjPre.filter(ct => inCorridor(ct) || (plannedTarget[ct.id]?.alliance === a.name));
          // If at city cap and still missing final targets, proactively free a slot (drop far, non-corridor, non-target), then recompute
          const totalsC = countsTotal(currentAsgAM, a.name, terrUnlocked).cities;
          const missingCityTargets = Object.entries(plannedTarget).some(([tid, asg]) => asg.alliance === a.name && terrUnlocked.find(t => t.id === tid) && currentAsgAM[tid]?.alliance !== a.name && terrUnlocked.find(t => t.id === tid)?.tileType === 'city');
          if (totalsC >= 8 && missingCityTargets && adjStrict.length === 0 && ownedCities.length > 0) {
            const sortedToDump = [...ownedCities]
              .filter(t => !(plannedTarget[t.id]?.alliance === a.name))
              .filter(t => !inCorridor(t))
              .sort((aa,bb) => {
                const da = Math.abs(latticeXY(aa).x - targetC.x) + Math.abs(latticeXY(aa).y - targetC.y);
                const db = Math.abs(latticeXY(bb).x - targetC.x) + Math.abs(latticeXY(bb).y - targetC.y);
                return db - da;
              });
            const dump = sortedToDump[0];
            if (dump) {
              const ev: ActionEvent = { tick: tickAM, tileId: dump.id, alliance: a.name, action: 'release' };
              simEvents = [...simEvents, ev];
              report.push(`Plan: ${a.name} release ${dump.coordinates} at Day ${day} AM to free city slot (proactive)`);
              // recompute after drop
              const afterAsg = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickAM);
              const adjPre2 = candidates.filter(ct => {
                if (reservedByOthers.has(ct.id)) return false;
                const ok = canCapture(ct, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: afterAsg, selectedAlliance: a.name, currentTick: tickAM, events: simEvents } as const);
                return ok.ok;
              });
              const adjStrict2 = adjPre2.filter(ct => inCorridor(ct) || (plannedTarget[ct.id]?.alliance === a.name));
              adjStrict.splice(0, adjStrict.length, ...adjStrict2);
            }
          }
          // Prefer planned targets, then corridor alignment, then closeness to target centroid
          const prefer = (t: Territory) => (plannedTarget[t.id]?.alliance === a.name ? 1 : 0);
          adjPre.sort((x,y) => {
            const py = prefer(y) - prefer(x);
            if (py !== 0) return py;
            const px = latticeXY(x), py2 = latticeXY(y);
            const scx = corridorPenaltyToTarget(px, start, targetC, width) - corridorPenaltyToTarget(py2, start, targetC, width);
            if (scx !== 0) return scx;
            const dx = (Math.abs(px.x - targetC.x) + Math.abs(px.y - targetC.y));
            const dy = (Math.abs(py2.x - targetC.x) + Math.abs(py2.y - targetC.y));
            return dx - dy;
          });
          // Frontier-only: restrict to candidates adjacent to frontier owned tiles (closest to target)
          const ownedNowAM = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickAM);
          const ownedTilesA = Object.entries(ownedNowAM).filter(([,v]) => v.alliance===a.name).map(([id])=>terrUnlocked.find(t=>t.id===id)!).filter(Boolean);
          const distOf = (t: Territory) => Math.abs(latticeXY(t).x - targetC.x) + Math.abs(latticeXY(t).y - targetC.y);
          const minOwnedDist = ownedTilesA.length ? Math.min(...ownedTilesA.map(distOf)) : Infinity;
          const frontier = new Set(ownedTilesA.filter(t => distOf(t) === minOwnedDist).map(t=>t.id));
          const isAdjToFrontier = (t: Territory) => ownedTilesA.some(o => frontier.has(o.id) && (Math.abs(latticeXY(o).x - latticeXY(t).x) + Math.abs(latticeXY(o).y - latticeXY(t).y) === 2));
          const adjFrontier = adjStrict.filter(isAdjToFrontier);
          const previewTargets = adjFrontier.slice(0, 2);
          const needCitySlots = Math.max(0, (ownedCities.length + previewTargets.length) - 8);
          if (needCitySlots > 0) {
            // Avoid dropping planned end-state cities and those adjacent to today's preview targets
            const protectedIds = new Set<string>();
            for (const tgt of previewTargets) {
              for (const o of ownedCities) {
                const man = Math.abs((2*o.col + (o.offset?.x?1:0)) - (2*tgt.col + (tgt.offset?.x?1:0))) + Math.abs((2*o.row + (o.offset?.y?1:0)) - (2*tgt.row + (tgt.offset?.y?1:0)));
                if (man === 2) protectedIds.add(o.id);
              }
            }
            const sortedToDump = [...ownedCities]
              .filter(t => !protectedIds.has(t.id))
              .filter(t => !(plannedTarget[t.id]?.alliance === a.name))
              .sort((aa,bb) => {
                const da = Math.abs(latticeXY(aa).x - targetC.x) + Math.abs(latticeXY(aa).y - targetC.y);
                const db = Math.abs(latticeXY(bb).x - targetC.x) + Math.abs(latticeXY(bb).y - targetC.y);
                return db - da; // drop farthest first
              });
            for (let i = 0; i < Math.min(needCitySlots, sortedToDump.length); i++) {
              const dump = sortedToDump[i];
              const ev: ActionEvent = { tick: tickAM, tileId: dump.id, alliance: a.name, action: 'release' };
              simEvents = [...simEvents, ev];
              report.push(`Plan: ${a.name} release ${dump.coordinates} at Day ${day} AM to free city slot (strict path)`);
            }
            simAssignments = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickAM);
          }
          // Now actually take up to 2 cities for the AM
          let takenC = 0;
          for (const ct of adjFrontier) {
            if (takenC >= 2) break;
            const placed = scheduleCapture(a.name, ct, tickAM);
            if (placed) {
              takenC++;
              reservedByOthers.add(ct.id);
              simAssignments = buildAssignmentsUpToTick(simEvents, terrUnlocked, placed);
            }
          }
        }

        // PM pass: strongholds toward target (prefer plannedTarget and corridor)
        simAssignments = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
        const ownedNow = new Set(Object.entries(simAssignments).filter(([,v]) => v.alliance === a.name).map(([k]) => k));
        let takenS = 0;
        const shCandBase = terrUnlocked.filter(t => t.tileType === 'stronghold' && !ownedNow.has(t.id) && !reservedByOthers.has(t.id));
        // Stronghold level pacing: compute max allowed level for this alliance today
        const cityUnlockedLvl = Math.max(0, Math.min(6, step - 1));
        const maxAllowedByPriority = (ally: Alliance, tile: Territory): boolean => {
          const allowed = (()=>{
            if ((ally.priority ?? 99) <= 2) return Math.min(6, cityUnlockedLvl + 2);
            if ((ally.priority ?? 99) === 3) {
              // allow +2 only if not conflicting with higher-priority corridors
              const px = latticeXY(tile);
              let conflict = false;
              for (const higher of allies) {
                if ((higher.priority ?? 99) >= (ally.priority ?? 99)) continue;
                const hs = chooseStartForAlliance(higher);
                const hc = centroidFor(higher);
                const pen = corridorPenaltyToTarget(px, hs, hc, priorityCorridorWidth(higher.priority));
                if (pen <= 0.5) { conflict = true; break; }
              }
              return conflict ? Math.min(6, cityUnlockedLvl + 1) : Math.min(6, cityUnlockedLvl + 2);
            }
            return Math.min(6, cityUnlockedLvl + 1);
          })();
          return tile.buildingLevel <= allowed;
        };
        // Enforce Day 1: after first Lv1 SH in AM, the PM capture must be an adjacent Lv1 SH
        const dayIsOne = (day === 1);
        const ownedTilesNow = Object.entries(simAssignments).filter(([,v]) => v.alliance === a.name).map(([id]) => terrUnlocked.find(t => t.id === id)!).filter(Boolean);
        const firstSH = ownedTilesNow.find(t => t.tileType === 'stronghold');
        let shCand = shCandBase;
        if (dayIsOne && firstSH && ownedTilesNow.length === 1) {
          const fxy = latticeXY(firstSH);
          shCand = shCandBase.filter(t => t.buildingLevel === 1 && (Math.abs(latticeXY(t).x - fxy.x) + Math.abs(latticeXY(t).y - fxy.y) === 2));
        }
        // Apply pacing filter
        shCand = shCand.filter(t => maxAllowedByPriority(a, t));
        const shAdjPre = shCand.filter(st => {
          const res = canCapture(st, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: simAssignments, selectedAlliance: a.name, currentTick: tickPM, events: simEvents } as const);
          return res.ok;
        });
        // Strict corridor filter: only take SHs inside corridor or explicitly in final plan for this alliance
        const shAdjStrict = shAdjPre.filter(st => inCorridor(st) || (plannedTarget[st.id]?.alliance === a.name));
        // Frontier-only: restrict to candidates adjacent to frontier owned tiles (closest to target)
        const ownedNowPM = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
        const ownedTilesAPM = Object.entries(ownedNowPM).filter(([,v]) => v.alliance===a.name).map(([id])=>terrUnlocked.find(t=>t.id===id)!).filter(Boolean);
        const distOfPM = (t: Territory) => Math.abs(latticeXY(t).x - targetC.x) + Math.abs(latticeXY(t).y - targetC.y);
        const minOwnedDistPM = ownedTilesAPM.length ? Math.min(...ownedTilesAPM.map(distOfPM)) : Infinity;
        const frontierPM = new Set(ownedTilesAPM.filter(t => distOfPM(t) === minOwnedDistPM).map(t=>t.id));
        const isAdjToFrontierPM = (t: Territory) => ownedTilesAPM.some(o => frontierPM.has(o.id) && (Math.abs(latticeXY(o).x - latticeXY(t).x) + Math.abs(latticeXY(o).y - latticeXY(t).y) === 2));
        const shAdj = shAdjStrict.filter(isAdjToFrontierPM);
        // If at SH cap and still missing final targets, proactively free a slot (drop far, non-corridor, non-target), then recompute
        const totalsS = countsTotal(buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM), a.name, terrUnlocked).strongholds;
        const missingSHTargets = Object.entries(plannedTarget).some(([tid, asg]) => asg.alliance === a.name && terrUnlocked.find(t => t.id === tid) && buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM)[tid]?.alliance !== a.name && terrUnlocked.find(t => t.id === tid)?.tileType === 'stronghold');
        if (totalsS >= 8 && missingSHTargets && shAdj.length === 0) {
          const currentAsg2 = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
          const ownedSH2 = Object.entries(currentAsg2)
            .filter(([,v]) => v.alliance === a.name)
            .map(([id]) => terrUnlocked.find(t => t.id === id)!)
            .filter(t => t && t.tileType === 'stronghold');
          const sortedToDump2 = [...ownedSH2]
            .filter(t => !(plannedTarget[t.id]?.alliance === a.name))
            .filter(t => !inCorridor(t))
            .sort((aa,bb) => {
              const da = Math.abs(latticeXY(aa).x - targetC.x) + Math.abs(latticeXY(aa).y - targetC.y);
              const db = Math.abs(latticeXY(bb).x - targetC.x) + Math.abs(latticeXY(bb).y - targetC.y);
              return db - da;
            });
          const dump2 = sortedToDump2[0];
          if (dump2) {
            const ev: ActionEvent = { tick: tickPM, tileId: dump2.id, alliance: a.name, action: 'release' };
            simEvents = [...simEvents, ev];
            report.push(`Plan: ${a.name} release ${dump2.coordinates} at Day ${day} PM to free SH slot (proactive)`);
            // recompute after drop
            const afterAsg2 = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
            const shAdjPre2 = shCand.filter(st => {
              const res = canCapture(st, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: afterAsg2, selectedAlliance: a.name, currentTick: tickPM, events: simEvents } as const);
              return res.ok;
            });
            const shAdj2 = shAdjPre2.filter(st => inCorridor(st) || (plannedTarget[st.id]?.alliance === a.name));
            shAdj.splice(0, shAdj.length, ...shAdj2);
          }
        }
        const preferSH = (t: Territory) => (plannedTarget[t.id]?.alliance === a.name ? 1 : 0);
        shAdj.sort((x,y) => {
          const py = preferSH(y) - preferSH(x);
          if (py !== 0) return py;
          const px = latticeXY(x), py2 = latticeXY(y);
          const pen = corridorPenaltyToTarget(px, start, targetC, width) - corridorPenaltyToTarget(py2, start, targetC, width);
          if (pen !== 0) return pen;
          const dx = (Math.abs(px.x - targetC.x) + Math.abs(px.y - targetC.y));
          const dy = (Math.abs(py2.x - targetC.x) + Math.abs(py2.y - targetC.y));
          return dx - dy;
        });

        // Preview next two to free slots if needed
        const currentAsg = buildAssignmentsUpToTick(simEvents, terrUnlocked, tickPM);
        const ownedSH = Object.entries(currentAsg)
          .filter(([,v]) => v.alliance === a.name)
          .map(([id]) => terrUnlocked.find(t => t.id === id)!)
          .filter(t => t && t.tileType === 'stronghold');
        const previewTargets = shAdj.slice(0, 2);
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
            .filter(t => !(plannedTarget[t.id]?.alliance === a.name))
            .sort((aa,bb) => {
              const da = Math.abs(latticeXY(aa).x - targetC.x) + Math.abs(latticeXY(aa).y - targetC.y);
              const db = Math.abs(latticeXY(bb).x - targetC.x) + Math.abs(latticeXY(bb).y - targetC.y);
              return db - da; // drop farthest first
            });
          for (let i = 0; i < Math.min(needSlots, sortedToDump.length); i++) {
            const dump = sortedToDump[i];
            const ev: ActionEvent = { tick: tickPM, tileId: dump.id, alliance: a.name, action: 'release' };
            simEvents = [...simEvents, ev];
            report.push(`Plan: ${a.name} release ${dump.coordinates} at Day ${day} PM to free slot (strict path)`);
          }
        }

        for (const st of shAdj) {
          if (takenS >= 2) break;
          const placed = scheduleCapture(a.name, st, tickPM);
          if (placed) {
            takenS++;
            reservedByOthers.add(st.id);
            simAssignments = buildAssignmentsUpToTick(simEvents, terrUnlocked, placed);
          }
        }
      }

      // Reserve this alliance's planned target tiles to avoid lower priorities trying to take them
      for (const [tid, v] of Object.entries(plannedTarget)) {
        if (v.alliance === a.name) reservedByOthers.add(tid);
      }
      // Also reserve this alliance's corridor for lower priorities (top priorities only)
      if ((a.priority ?? 99) <= 2) {
        for (const tid of corridorSet) reservedByOthers.add(tid);
      }
    }

    const futurePlannedStrict = simEvents.filter(e => e.tick >= currentTick);
    const plannedOnlyFutureStrict = futurePlannedStrict.filter(e => !past.some(p => p.tick === e.tick && p.tileId === e.tileId && p.action === e.action && p.alliance === e.alliance));
    return { planned: plannedOnlyFutureStrict, report };
  }

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
  // Strongholds are NOT level-gated by step in rules; only first capture must be Lv1, adjacency after
const allowedStrongholdLevelAt = (_day: number) => 6;

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
    // Bias toward planned final targets: prefer tiles in the saved end-state
    let targetBias = 0;
    const planned = plannedTarget[t.id];
    if (planned) {
      if (planned.alliance === a.name) targetBias += 1800;
      else targetBias -= 1800;
    }
    return base - pen - avoidPen + targetBias;
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
    // Bias toward planned final targets: prefer tiles in the saved end-state
    let targetBias = 0;
    const planned = plannedTarget[t.id];
    if (planned) {
      if (planned.alliance === a.name) targetBias += 1800;
      else targetBias -= 1800;
    }
    return base - pen - avoidPen + targetBias;
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
            return true;
          });
          // If strictToTarget, move planned target tiles of this alliance to the front before score sort
          const preferC = (t: Territory) => {
            const planned = plannedTarget[t.id];
            return planned && planned.alliance === a.name ? 1 : 0;
          };
          adj.sort((x,y) => {
            const px = preferC(x), py = preferC(y);
            if (px !== py) return py - px;
            return scoreCity(y, a, starts, p1Start, p2Start) - scoreCity(x, a, starts, p1Start, p2Start);
          });
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
      const sh = terrUnlocked.filter(t => t.tileType === 'stronghold' && !ownedIds.has(t.id));
      const adj = sh.filter(st => {
        const res = canCapture(st, { mode:'action', step, calendar: season.calendar, territories: terrUnlocked, assignments: asg, selectedAlliance: a.name, currentTick: tickPM, events: simEvents } as const);
        if (!res.ok) return false;
        return true;
      });
      // If strictToTarget, move planned target tiles of this alliance to the front before score sort
      const preferSH = (t: Territory) => {
        const planned = plannedTarget[t.id];
        return planned && planned.alliance === a.name ? 1 : 0;
      };
      adj.sort((x,y) => {
        const px = preferSH(x), py = preferSH(y);
        if (px !== py) return py - px;
        return scoreStronghold(y, shLvl, a, starts, p1Start, p2Start) - scoreStronghold(x, shLvl, a, starts, p1Start, p2Start);
      });

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
          })
          // keep planned end-state strongholds if possible
          .filter(t => {
            const planned = plannedTarget[t.id];
            return !(planned && planned.alliance === a.name);
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

  // Reconciliation pass: ensure final-day target is achieved where possible
  const finalAsg = buildAssignmentsUpToTick(simEvents, map.territories, maxTick);
  for (const [tid, planned] of Object.entries(plannedTarget)) {
    if (!planned?.alliance) continue;
    const current = finalAsg[tid]?.alliance;
    if (current === planned.alliance) continue;
    const tile = map.territories.find(t => t.id === tid);
    if (!tile) continue;
    const placed = scheduleCapture(planned.alliance, tile, currentTick);
    if (placed) {
      report.push(`Reconcile-to-target: ${planned.alliance} capture ${tile.coordinates} by Tick ${placed}`);
    }
  }

  const futurePlanned = simEvents.filter(e => e.tick >= currentTick);
  // Exclude duplicates from past baseline
  const plannedOnlyFuture = futurePlanned.filter(e => !past.some(p => p.tick === e.tick && p.tileId === e.tileId && p.action === e.action && p.alliance === e.alliance));
  return { planned: plannedOnlyFuture, report };
}

import { ActionEvent, Alliance, MapData, SeasonDefinition, Territory, Tick, dayHalfFromTick, tickFromDayHalf, applyCalendarUnlocks, LearnedPolicy } from './domain';
import { Assignments, canCapture, countsTotal } from './rules';

export interface PlannerOptions {
  replaceFuture?: boolean;
  maxTick?: Tick;
  plowBias?: 'center' | 'breadth';
  corridorWidth?: number;
  plannedTarget?: Assignments;
  strictToTarget?: boolean;
  learnedPolicy?: LearnedPolicy;
}

export interface PlannerResult {
  planned: ActionEvent[];
  report: string[];
}

// 🎯 NEW RULE-BASED PLANNER - FOLLOWS ACTUAL GAME RULES AND PROVEN STRATEGY
export function planSeason(
  map: MapData, 
  season: SeasonDefinition, 
  alliances: Alliance[], 
  currentTick: Tick, 
  existingEvents: ActionEvent[], 
  options?: PlannerOptions
): PlannerResult {
  const report: string[] = [];
  const plannedEvents: ActionEvent[] = [];
  
  report.push(`🔥 NEW PLANNER: Rule-based strategy following proven optimal patterns`);
  
  // Get current state
  const { day: currentDay } = dayHalfFromTick(currentTick);
  const lastDay = season.calendar.stepDays?.[season.calendar.stepDays.length - 1] ?? 28;
  const past = existingEvents.filter(e => e.tick <= currentTick);
  
  // Sort alliances by priority (P1 gets best treatment)
  const allies = [...alliances].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  report.push(`📊 Planning for ${allies.length} alliances: ${allies.map(a => `${a.name}(P${a.priority ?? '∞'})`).join(', ')}`);
  
  // Assign 12/3/6/9 o'clock starting positions
  const startPositions = assignClockStartPositions(allies, map);
  for (const [allianceName, start] of Object.entries(startPositions)) {
    if (start) {
      report.push(`🎯 ${allianceName}: Starting at ${start.coordinates} (${getClockPosition(start, map)})`);
    }
  }
  
  // Plan day by day with proper rule enforcement
  for (let day = currentDay; day <= lastDay; day++) {
    const step = stepFromDay(day, season);
    const citiesUnlocked = step > 1; // Cities unlock at step 2 (day 3+)
    
    report.push(`\n📅 === DAY ${day} (Step ${step}) ${citiesUnlocked ? '- Cities Unlocked' : '- Cities Locked'} ===`);
    
    // Get current map state including all events up to this day
    const dayStartTick = tickFromDayHalf(day, 'AM');
    const allEventsUpToDay = [...past, ...plannedEvents.filter(e => e.tick < dayStartTick)];
    const currentState = buildAssignments(allEventsUpToDay, map.territories);
    
    // Plan for each alliance in priority order
    for (const alliance of allies) {
      planAllianceDay(
        alliance, 
        day, 
        step, 
        citiesUnlocked, 
        map, 
        season, 
        startPositions, 
        currentState, 
        [...past, ...plannedEvents], 
        plannedEvents, 
        report
      );
    }
  }
  
  // Capitol assignment for P1 alliance only at the end
  const p1Alliance = allies.find(a => (a.priority ?? 999) === 1);
  if (p1Alliance) {
    const capitol = map.territories.find(t => t.tileType === 'capitol');
    if (capitol) {
      const finalTick = (lastDay * 2) as Tick; // Final PM of last day
      plannedEvents.push({
        tick: finalTick,
        tileId: capitol.id,
        alliance: p1Alliance.name,
        action: 'capture'
      });
      report.push(`👑 CAPITOL: ${p1Alliance.name} captures ${capitol.coordinates} on final day`);
    }
  }
  
  // Filter to only future events if requested
  const futurePlanned = plannedEvents.filter(e => e.tick >= currentTick);
  const uniqueFuture = futurePlanned.filter(e => 
    !past.some(p => p.tick === e.tick && p.tileId === e.tileId && p.action === e.action && p.alliance === e.alliance)
  );
  
  report.push(`\n✅ COMPLETE: Generated ${uniqueFuture.length} future events for ${allies.length} alliances`);
  
  return { planned: uniqueFuture, report };
}

// Assign 12/3/6/9 o'clock starting positions based on priority
function assignClockStartPositions(alliances: Alliance[], map: MapData): Record<string, Territory | null> {
  const positions: Record<string, Territory | null> = {};
  const { rows, cols } = map.gridSize;
  
  // 12/3/6/9 o'clock reference points
  const clockPositions = [
    { clock: '12 o\'clock', row: 1, col: Math.floor(cols/2) },              // North
    { clock: '3 o\'clock', row: Math.floor(rows/2), col: cols },             // East  
    { clock: '6 o\'clock', row: rows, col: Math.floor(cols/2) },             // South
    { clock: '9 o\'clock', row: Math.floor(rows/2), col: 1 }                 // West
  ];
  
  // Find all edge strongholds
  const edgeStrongholds = map.territories.filter(t => 
    t.tileType === 'stronghold' && 
    (t.row === 1 || t.row === rows || t.col === 1 || t.col === cols)
  );
  
  const usedStarts = new Set<string>();
  
  // Assign starts in priority order
  alliances.forEach((alliance, index) => {
    const clockPos = clockPositions[index % 4]; // Cycle through 12/3/6/9
    
    // Find best available edge stronghold near this clock position
    let bestStart: Territory | null = null;
    let bestScore = -Infinity;
    
    for (const sh of edgeStrongholds) {
      if (usedStarts.has(sh.id)) continue; // Already assigned
      
      // Score based on distance to clock position and stronghold level
      const dist = Math.abs(sh.row - clockPos.row) + Math.abs(sh.col - clockPos.col);
      const levelBonus = sh.buildingLevel === 1 ? 10 : 0; // Prefer level 1
      const score = -dist + levelBonus;
      
      if (score > bestScore) {
        bestScore = score;
        bestStart = sh;
      }
    }
    
    if (bestStart) {
      positions[alliance.name] = bestStart;
      usedStarts.add(bestStart.id);
    } else {
      positions[alliance.name] = null;
    }
  });
  
  return positions;
}

// Get clock position description for a territory
function getClockPosition(territory: Territory, map: MapData): string {
  const { rows, cols } = map.gridSize;
  const { row, col } = territory;
  
  if (row === 1) return '12 o\'clock (North)';
  if (row === rows) return '6 o\'clock (South)';
  if (col === 1) return '9 o\'clock (West)';
  if (col === cols) return '3 o\'clock (East)';
  return 'Inner';
}

// Plan one alliance's moves for one day
function planAllianceDay(
  alliance: Alliance,
  day: number,
  step: number,
  citiesUnlocked: boolean,
  map: MapData,
  season: SeasonDefinition,
  startPositions: Record<string, Territory | null>,
  currentState: Assignments,
  allEvents: ActionEvent[],
  plannedEvents: ActionEvent[],
  report: string[]
) {
  const tickAM = tickFromDayHalf(day, 'AM');
  const tickPM = tickFromDayHalf(day, 'PM');
  const priority = alliance.priority ?? 999;
  const isHighPriority = priority <= 2;
  
  // Get current holdings
  const currentHoldings = Object.entries(currentState)
    .filter(([, v]) => v.alliance === alliance.name)
    .map(([id]) => map.territories.find(t => t.id === id)!)
    .filter(Boolean);
    
  const currentSH = currentHoldings.filter(t => t.tileType === 'stronghold');
  const currentCities = currentHoldings.filter(t => t.tileType === 'city');
  
  report.push(`  🏰 ${alliance.name}: ${currentSH.length}/8 SH, ${currentCities.length}/8 Cities`);
  
  // First capture - ensure we have a starting stronghold
  if (currentHoldings.length === 0) {
    const startSH = startPositions[alliance.name];
    if (startSH) {
      plannedEvents.push({
        tick: tickAM,
        tileId: startSH.id,
        alliance: alliance.name,
        action: 'capture'
      });
      report.push(`    🚀 First capture: ${startSH.coordinates}`);
      return; // First day just establish foothold
    }
  }
  
  // AM: Stronghold expansion (up to 2 per day, max 8 total)
  if (currentSH.length < 8) {
    const shTargets = findStrongholdTargets(alliance, currentHoldings, map, currentState, isHighPriority);
    const shCaptures = Math.min(2, 8 - currentSH.length, shTargets.length);
    
    for (let i = 0; i < shCaptures; i++) {
      const target = shTargets[i];
      if (target) {
        plannedEvents.push({
          tick: tickAM,
          tileId: target.id,
          alliance: alliance.name,
          action: 'capture'
        });
        report.push(`    ⚔️  AM: Capture SH ${target.coordinates} (L${target.buildingLevel})`);
      }
    }
  }
  
  // PM: City expansion (if unlocked, up to 2 per day, max 8 total)
  if (citiesUnlocked && currentCities.length < 8) {
    const cityTargets = findCityTargets(alliance, currentHoldings, map, currentState, isHighPriority);
    const cityCaptures = Math.min(2, 8 - currentCities.length, cityTargets.length);
    
    for (let i = 0; i < cityCaptures; i++) {
      const target = cityTargets[i];
      if (target) {
        plannedEvents.push({
          tick: tickPM,
          tileId: target.id,
          alliance: alliance.name,
          action: 'capture'
        });
        report.push(`    🏙️  PM: Capture City ${target.coordinates} (${target.resourceType}: ${target.resourceValue}/hr)`);
      }
    }
  }
}

// Find valid stronghold targets for expansion
function findStrongholdTargets(
  alliance: Alliance, 
  holdings: Territory[], 
  map: MapData, 
  currentState: Assignments,
  isHighPriority: boolean
): Territory[] {
  if (holdings.length === 0) return [];
  
  const candidates = map.territories.filter(t => 
    t.tileType === 'stronghold' && 
    !currentState[t.id] && // Not owned by anyone
    isAdjacent(t, holdings, map.season) // Adjacent to current holdings
  );
  
  // Sort by preference: center-ward movement, higher levels for high priority
  const capitol = map.territories.find(t => t.tileType === 'capitol');
  const centerX = capitol ? capitol.col : Math.floor(map.gridSize.cols / 2);
  const centerY = capitol ? capitol.row : Math.floor(map.gridSize.rows / 2);
  
  return candidates.sort((a, b) => {
    // Distance to center (closer is better)
    const distA = Math.abs(a.col - centerX) + Math.abs(a.row - centerY);
    const distB = Math.abs(b.col - centerX) + Math.abs(b.row - centerY);
    
    if (distA !== distB) return distA - distB;
    
    // Level preference (higher for high priority alliances)
    if (isHighPriority) {
      return b.buildingLevel - a.buildingLevel; // Higher level better
    } else {
      return a.buildingLevel - b.buildingLevel; // Lower level acceptable
    }
  });
}

// Find valid city targets for expansion  
function findCityTargets(
  alliance: Alliance,
  holdings: Territory[],
  map: MapData,
  currentState: Assignments,
  isHighPriority: boolean
): Territory[] {
  if (holdings.length === 0) return [];
  
  const strongholds = holdings.filter(t => t.tileType === 'stronghold');
  if (strongholds.length === 0) return []; // Need strongholds to capture cities
  
  const candidates = map.territories.filter(t => 
    t.tileType === 'city' && 
    !currentState[t.id] && // Not owned by anyone
    isAdjacent(t, strongholds, map.season) // Adjacent to strongholds (rule requirement)
  );
  
  // Sort by resource value priority
  return candidates.sort((a, b) => {
    // Spice is king (leaderboard resource)
    const spiceA = a.resourceType === 'Spice' ? 1000 : 0;
    const spiceB = b.resourceType === 'Spice' ? 1000 : 0;
    
    if (spiceA !== spiceB) return spiceB - spiceA;
    
    // Then by resource value
    return b.resourceValue - a.resourceValue;
  });
}

// Check if territory is adjacent to any in holdings list
function isAdjacent(territory: Territory, holdings: Territory[], seasonKey: MapData['season']): boolean {
  // Keep planner adjacency aligned with capture rules:
  // - S4: edge OR corner adjacency (checkerboard movement)
  // - Others: half-step lattice adjacency (intersection model)
  if (seasonKey === 'S4') {
    for (const holding of holdings) {
      const dx = Math.abs(territory.col - holding.col);
      const dy = Math.abs(territory.row - holding.row);
      if (dx <= 1 && dy <= 1 && (dx + dy > 0)) return true;
    }
    return false;
  }

  const tX = 2 * territory.col + (territory.offset?.x ? 1 : 0);
  const tY = 2 * territory.row + (territory.offset?.y ? 1 : 0);
  for (const holding of holdings) {
    const hX = 2 * holding.col + (holding.offset?.x ? 1 : 0);
    const hY = 2 * holding.row + (holding.offset?.y ? 1 : 0);
    const man = Math.abs(hX - tX) + Math.abs(hY - tY);
    if (man === 2) return true;
  }
  return false;
}

// Build assignments from event list
function buildAssignments(events: ActionEvent[], territories: Territory[]): Assignments {
  const assignments: Assignments = {};
  
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  
  for (const event of sorted) {
    if (event.action === 'capture') {
      assignments[event.tileId] = { alliance: event.alliance, step: 1 };
    } else if (event.action === 'release') {
      delete assignments[event.tileId];
    }
  }
  
  return assignments;
}

// Helper to get step from day
function stepFromDay(day: number, season: SeasonDefinition): number {
  const stepDays = season.calendar.stepDays || [3, 6, 10, 13, 17, 20, 28];
  let step = 1;
  
  for (let i = 0; i < stepDays.length; i++) {
    if (day >= stepDays[i]) {
      step = i + 2; // Step numbers are 1-indexed, stepDays[0] = day 3 = step 2
    }
  }
  
  return Math.min(step, season.calendar.steps);
}
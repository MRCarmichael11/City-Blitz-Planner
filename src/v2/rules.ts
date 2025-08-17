import { Alliance, SeasonCalendar, Territory, Tick, ActionEvent, dayHalfFromTick, tickFromDayHalf } from './domain';

export type Mode = 'planning' | 'action';

export interface Assignment {
  alliance: string;
  step: number;
}

export type Assignments = Record<string, Assignment>; // territoryId -> assignment

export interface CaptureCheckParams {
  mode: Mode;
  step: number; // current step (1..7) - for legacy UI display only
  calendar: SeasonCalendar;
  territories: Territory[];
  assignments: Assignments;
  selectedAlliance: string | null;
  // v3 Action timeline context
  currentTick?: Tick; // 12-hour tick (1..56)
  events?: ActionEvent[]; // historical events up to currentTick (captures/releases)
}

export interface CaptureResult { ok: boolean; reason?: string }

export function availableDaysForStep(step: number, calendar: SeasonCalendar): number {
  const sd = calendar.stepDays;
  if (!Array.isArray(sd) || step < 1 || step > sd.length) return 1;
  if (step === 1) return Math.max(1, sd[0]); // Pre-unlock window (no city unlocks)
  return Math.max(1, sd[step - 1] - sd[step - 2]);
}

export function isCityUnlocked(t: Territory): boolean {
  if (t.tileType !== 'city') return true;
  return !!t.isUnlocked;
}

export function hasAdjacentOwned(territories: Territory[], assignments: Assignments, alliance: string, t: Territory): boolean {
  // Geometric adjacency on the half-step lattice:
  // stronghold centers at (2r,2c), city/TP centers at (2r+1,2c+1). Two tiles are adjacent if |dx|+|dy| === 2.
  const tX = 2 * t.col + (t.offset?.x ? 1 : 0);
  const tY = 2 * t.row + (t.offset?.y ? 1 : 0);
  for (const [tid, asg] of Object.entries(assignments)) {
    if (asg.alliance !== alliance) continue;
    const n = territories.find(tt => tt.id === tid);
    if (!n) continue;
    const nX = 2 * n.col + (n.offset?.x ? 1 : 0);
    const nY = 2 * n.row + (n.offset?.y ? 1 : 0);
    const man = Math.abs(nX - tX) + Math.abs(nY - tY);
    if (man === 2) return true;
  }
  return false;
}

export function countsForStep(assignments: Assignments, alliance: string, step: number, territories: Territory[]): { strongholds: number; cities: number } {
  let strongholds = 0, cities = 0;
  for (const [tid, a] of Object.entries(assignments)) {
    if (a.alliance !== alliance || a.step !== step) continue;
    const t = territories.find(tt => tt.id === tid);
    if (!t) continue;
    if (t.tileType === 'stronghold') strongholds++;
    else if (t.tileType === 'city') cities++;
  }
  return { strongholds, cities };
}

export function countsTotal(assignments: Assignments, alliance: string, territories: Territory[]): { strongholds: number; cities: number } {
  let strongholds = 0, cities = 0;
  for (const [tid, a] of Object.entries(assignments)) {
    if (a.alliance !== alliance) continue;
    const t = territories.find(tt => tt.id === tid);
    if (!t) continue;
    if (t.tileType === 'stronghold') strongholds++;
    else if (t.tileType === 'city') cities++;
  }
  return { strongholds, cities };
}

// Helpers for v3 protection and daily caps
function protectionTicksFor(t: Territory): number {
  if (t.tileType === 'city') return 12; // 6 days @ 12h ticks
  if (t.tileType === 'stronghold') return 3; // 36h @ 12h ticks
  return 0;
}

function recaptureAllowedAtTick(tileId: string, events: ActionEvent[] | undefined): Tick | null {
  if (!events || events.length === 0) return null;
  // Find last capture on this tile
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.tileId === tileId && e.action === 'capture') {
      return e.tick + 0 as Tick; // caller will add protection based on tile type
    }
  }
  return null;
}

function dailyCapsUsedFor(alliance: string, day: number, events: ActionEvent[], territories: Territory[]): { S: number; C: number } {
  let S = 0, C = 0;
  for (const e of events) {
    const { day: d } = dayHalfFromTick(e.tick);
    if (d !== day || e.alliance !== alliance || e.action !== 'capture') continue;
    const t = territories.find(tt => tt.id === e.tileId);
    if (!t) continue;
    if (t.tileType === 'stronghold') S++; else if (t.tileType === 'city') C++;
  }
  return { S, C };
}

export function canCapture(t: Territory, p: CaptureCheckParams): CaptureResult {
  if (!p.selectedAlliance) return { ok: false, reason: 'Select an alliance first' };

  // Non-capturable tiles
  if (t.tileType === 'trading-post') return { ok: false, reason: 'Trading posts are player-held (PvP) and cannot be captured by alliances' };

  // Global per-alliance hard caps: 8 strongholds + 8 cities, always enforced (preview/planning included)
  const totals = countsTotal(p.assignments, p.selectedAlliance, p.territories);
  if (t.tileType === 'stronghold' && totals.strongholds >= 8) return { ok: false, reason: 'Alliance cap reached: 8 strongholds total' }; // capitol excluded
  if (t.tileType === 'city' && totals.cities >= 8) return { ok: false, reason: 'Alliance cap reached: 8 cities total' };

  if (p.mode === 'planning') return { ok: true };

  // v3: Protection timers and daily caps when currentTick/events provided
  if (p.currentTick && p.events) {
    // Protection check: find last capture tick and add type-specific protection
    const lastCaptureTick = recaptureAllowedAtTick(t.id, p.events);
    if (lastCaptureTick !== null) {
      const prot = protectionTicksFor(t);
      const availableTick = (lastCaptureTick + prot) as Tick;
      if (p.currentTick < availableTick) {
        const { day, half } = dayHalfFromTick(availableTick);
        return { ok: false, reason: `Protected: available at Day ${day} ${half}` };
      }
    }

    // Daily caps: 2S + 2C per day
    const { day } = dayHalfFromTick(p.currentTick);
    const used = dailyCapsUsedFor(p.selectedAlliance, day, p.events, p.territories);
    if (t.tileType === 'stronghold' && used.S >= 2) return { ok: false, reason: 'Daily limit reached: 2 strongholds per day' };
    if (t.tileType === 'city' && used.C >= 2) return { ok: false, reason: 'Daily limit reached: 2 cities per day' };
  }

  // Action mode restrictions
  // 1) Unlock state (cities only). Step 1 is a pre-unlock window; cities unlock starting step 2.
  if (!isCityUnlocked(t)) return { ok: false, reason: 'City is locked at this step' };

  // Capitol rule: Only capturable at final day/tick of the season (last day PM) and final step
  if (t.tileType === 'capitol') {
    if (!p.currentTick) return { ok: false, reason: 'Capitol can only be captured at the final tick of the season' };
    const sd = p.calendar.stepDays || [28];
    const lastDay = sd[sd.length - 1] || 28;
    const finalTick = tickFromDayHalf(lastDay, 'PM');
    const { day } = dayHalfFromTick(p.currentTick);
    const currentStep = (()=>{ let s=1; for (let i=0;i<sd.length;i++){ if (day >= sd[i]) s=i+1; } return Math.max(1, Math.min(s, p.calendar.steps)); })();
    if (p.currentTick !== finalTick || currentStep !== p.calendar.steps) {
      return { ok: false, reason: 'Capitol is only capturable at the final event (last day PM)' };
    }
  }

  // Determine if this alliance already owns anything
  const totals2 = countsTotal(p.assignments, p.selectedAlliance, p.territories);
  const ownsAny = (totals2.strongholds + totals2.cities) > 0;

  // 2) First capture rule: if nothing owned yet, only allow Lv1 stronghold (no adjacency needed)
  if (!ownsAny) {
    if (!(t.tileType === 'stronghold' && t.buildingLevel === 1)) {
      return { ok: false, reason: 'First capture must be a level 1 stronghold' };
    }
  } else {
    // 3) Adjacency required for ALL captures thereafter (both strongholds and cities)
    if (!hasAdjacentOwned(p.territories, p.assignments, p.selectedAlliance, t)) {
      return { ok: false, reason: 'Need an adjacent owned tile to capture' };
    }
  }

  // 4) Per-step capture limits scale by days within the step window (2 per day)
  const c = countsForStep(p.assignments, p.selectedAlliance, p.step, p.territories);
  const days = availableDaysForStep(p.step, p.calendar);
  const stepCapS = 2 * days;
  const stepCapC = 2 * days;
  if (t.tileType === 'stronghold' && c.strongholds >= stepCapS) return { ok: false, reason: `Step limit reached: ${stepCapS} strongholds for this step` };
  if (t.tileType === 'city' && c.cities >= stepCapC) return { ok: false, reason: `Step limit reached: ${stepCapC} cities for this step` };

  return { ok: true };
}

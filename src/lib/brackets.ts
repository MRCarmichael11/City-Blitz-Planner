export type BracketConfig = {
  /**
   * Season identifier (e.g. "S4"). If omitted, defaults to week-1 behavior.
   * Only S4 currently has shrinking bracket rules.
   */
  season?: string | null;
  /**
   * Season 4 week number (1..3). Defaults to 1.
   */
  s4Week?: number | null;
};

export type BracketRange = { start: number; end: number };

function normalizeS4Week(week?: number | null): 1 | 2 | 3 {
  if (week === 2) return 2;
  if (week === 3) return 3;
  return 1;
}

export function getBracketRanges(config?: BracketConfig): BracketRange[] {
  const season = (config?.season || '').toUpperCase();
  if (season === 'S4') {
    const wk = normalizeS4Week(config?.s4Week ?? 1);
    if (wk === 1) return [{ start: 1, end: 10 }, { start: 11, end: 20 }];
    if (wk === 2) return [{ start: 1, end: 6 }, { start: 7, end: 12 }, { start: 13, end: 18 }, { start: 19, end: 20 }];
    // Week 3: user-provided "1–3, 4–7 etc" — interpret as continuing 4-wide buckets after the first 3.
    return [{ start: 1, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 }, { start: 12, end: 15 }, { start: 16, end: 19 }, { start: 20, end: 20 }];
  }
  // Default behavior (week 1-style): B1 1–10, B2 11–20; others are unbracketed.
  return [{ start: 1, end: 10 }, { start: 11, end: 20 }];
}

/**
 * Returns the 1-based bracket number for the given rank, or null if unranked / outside 1..20.
 */
export const getBracket = (rank?: number | null, config?: BracketConfig): number | null => {
  if (rank == null) return null;
  if (rank < 1 || rank > 20) return null;
  const ranges = getBracketRanges(config);
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (rank >= r.start && rank <= r.end) return i + 1;
  }
  return null;
};

export function assertBracketParity(
  attackerRank?: number | null,
  defenderRank?: number | null,
  config?: BracketConfig
):
  | { ok: true; a: number; b: number }
  | { ok: false; a: number | null; b: number | null; reason: 'bracket_locked' | 'bracket_mismatch' } {
  const a = getBracket(attackerRank, config);
  const b = getBracket(defenderRank, config);
  if (a == null || b == null) {
    return { ok: false, a, b, reason: 'bracket_locked' };
  }
  if (a !== b) {
    return { ok: false, a, b, reason: 'bracket_mismatch' };
  }
  return { ok: true, a, b };
}


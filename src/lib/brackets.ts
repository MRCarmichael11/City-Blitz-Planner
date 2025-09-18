export const getBracket = (rank?: number | null): 1 | 2 | 3 => {
  if (rank == null) return 3;
  if (rank <= 10) return 1;
  if (rank <= 20) return 2;
  return 3;
};

export function assertBracketParity(attackerRank?: number | null, defenderRank?: number | null):
  | { ok: true; a: 1 | 2 | 3; b: 1 | 2 | 3 }
  | { ok: false; a: 1 | 2 | 3; b: 1 | 2 | 3; reason: 'bracket_locked' | 'bracket_mismatch' } {
  const a = getBracket(attackerRank);
  const b = getBracket(defenderRank);
  if (a !== b || a === 3 || b === 3) {
    return { ok: false, a, b, reason: a === 3 || b === 3 ? 'bracket_locked' : 'bracket_mismatch' };
  }
  return { ok: true, a, b };
}


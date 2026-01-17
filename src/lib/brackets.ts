export const MAX_RANK = 20;
export const BRACKET_SIZE = 3;
export const MAX_BRACKET = Math.ceil(MAX_RANK / BRACKET_SIZE);

export type Bracket = number;
export type BracketOrNull = Bracket | null;

export const getBracket = (rank?: number | null): BracketOrNull => {
  if (rank == null) return null;
  if (rank < 1 || rank > MAX_RANK) return null;
  return Math.ceil(rank / BRACKET_SIZE);
};

export const BRACKET_RANGES = Array.from({ length: MAX_BRACKET }, (_, index) => {
  const bracket = index + 1;
  const start = index * BRACKET_SIZE + 1;
  const end = Math.min(bracket * BRACKET_SIZE, MAX_RANK);
  return { bracket, start, end };
});

export function formatBracketLabel(bracket: BracketOrNull): string {
  return bracket == null ? 'Unranked' : `B${bracket}`;
}

export function assertBracketParity(attackerRank?: number | null, defenderRank?: number | null):
  | { ok: true; a: Bracket; b: Bracket }
  | { ok: false; a: BracketOrNull; b: BracketOrNull; reason: 'bracket_locked' | 'bracket_mismatch' } {
  const a = getBracket(attackerRank);
  const b = getBracket(defenderRank);
  if (a == null || b == null) {
    return { ok: false, a, b, reason: 'bracket_locked' };
  }
  if (a !== b) {
    return { ok: false, a, b, reason: 'bracket_mismatch' };
  }
  return { ok: true, a, b };
}


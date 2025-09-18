import { describe, it, expect } from 'vitest';
import { getBracket, assertBracketParity } from '@/lib/brackets';

describe('brackets', () => {
  it('getBracket maps ranks', () => {
    expect(getBracket(null)).toBe(3);
    expect(getBracket(undefined)).toBe(3);
    expect(getBracket(1)).toBe(1);
    expect(getBracket(10)).toBe(1);
    expect(getBracket(11)).toBe(2);
    expect(getBracket(20)).toBe(2);
    expect(getBracket(21)).toBe(3);
  });

  it('assertBracketParity only ok for (1,1) and (2,2)', () => {
    expect(assertBracketParity(1, 1)).toMatchObject({ ok: true });
    expect(assertBracketParity(2, 2)).toMatchObject({ ok: true });
    expect(assertBracketParity(5, 15)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(15, 5)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(null, 1)).toMatchObject({ ok: false, reason: 'bracket_locked' });
    expect(assertBracketParity(2, null)).toMatchObject({ ok: false, reason: 'bracket_locked' });
  });
});


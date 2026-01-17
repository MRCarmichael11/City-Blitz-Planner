import { describe, it, expect } from 'vitest';
import { getBracket, assertBracketParity } from '@/lib/brackets';

describe('brackets', () => {
  it('getBracket maps ranks', () => {
    expect(getBracket(null)).toBeNull();
    expect(getBracket(undefined)).toBeNull();
    expect(getBracket(1)).toBe(1);
    expect(getBracket(3)).toBe(1);
    expect(getBracket(4)).toBe(2);
    expect(getBracket(6)).toBe(2);
    expect(getBracket(7)).toBe(3);
    expect(getBracket(9)).toBe(3);
    expect(getBracket(10)).toBe(4);
    expect(getBracket(12)).toBe(4);
    expect(getBracket(19)).toBe(7);
    expect(getBracket(20)).toBe(7);
    expect(getBracket(21)).toBeNull();
  });

  it('assertBracketParity only ok for matching ranked brackets', () => {
    expect(assertBracketParity(1, 3)).toMatchObject({ ok: true });
    expect(assertBracketParity(4, 6)).toMatchObject({ ok: true });
    expect(assertBracketParity(5, 15)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(15, 5)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(null, 1)).toMatchObject({ ok: false, reason: 'bracket_locked' });
    expect(assertBracketParity(2, null)).toMatchObject({ ok: false, reason: 'bracket_locked' });
    expect(assertBracketParity(21, 2)).toMatchObject({ ok: false, reason: 'bracket_locked' });
  });
});


import { describe, it, expect } from 'vitest';
import { getBracket, assertBracketParity } from '@/lib/brackets';

describe('brackets', () => {
  it('getBracket maps ranks', () => {
    expect(getBracket(null)).toBe(null);
    expect(getBracket(undefined)).toBe(null);
    expect(getBracket(1)).toBe(1);
    expect(getBracket(10)).toBe(1);
    expect(getBracket(11)).toBe(2);
    expect(getBracket(20)).toBe(2);
    expect(getBracket(21)).toBe(null);
  });

  it('assertBracketParity only ok for (1,1) and (2,2)', () => {
    expect(assertBracketParity(1, 1)).toMatchObject({ ok: true });
    expect(assertBracketParity(2, 2)).toMatchObject({ ok: true });
    expect(assertBracketParity(5, 15)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(15, 5)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(null, 1)).toMatchObject({ ok: false, reason: 'bracket_locked' });
    expect(assertBracketParity(2, null)).toMatchObject({ ok: false, reason: 'bracket_locked' });
  });

  it('Season 4 week 2 shrinks brackets (1–6, 7–12, 13–18, 19–20)', () => {
    const cfg = { season: 'S4', s4Week: 2 };
    expect(getBracket(6, cfg)).toBe(1);
    expect(getBracket(7, cfg)).toBe(2);
    expect(assertBracketParity(6, 7, cfg)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(7, 12, cfg)).toMatchObject({ ok: true });
    expect(assertBracketParity(13, 18, cfg)).toMatchObject({ ok: true });
    expect(assertBracketParity(18, 19, cfg)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
    expect(assertBracketParity(19, 20, cfg)).toMatchObject({ ok: true });
  });

  it('week 2 setting applies even if season is not S4', () => {
    const cfg = { season: 'S', s4Week: 2 };
    expect(getBracket(6, cfg)).toBe(1);
    expect(getBracket(7, cfg)).toBe(2);
    expect(assertBracketParity(6, 7, cfg)).toMatchObject({ ok: false, reason: 'bracket_mismatch' });
  });
});


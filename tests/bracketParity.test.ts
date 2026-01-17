import { describe, it, expect } from 'vitest';
import { assertBracketParity } from '@/lib/brackets';

describe('bracket parity on lock', () => {
  it('rejects mismatched brackets', () => {
    const res = assertBracketParity(5, 15);
    expect(res.ok).toBe(false);
    if ('reason' in res) expect(['bracket_mismatch','bracket_locked']).toContain(res.reason);
  });

  it('rejects B3 involvement', () => {
    const res = assertBracketParity(null, 12);
    expect(res.ok).toBe(false);
    if ('reason' in res) expect(res.reason).toBe('bracket_locked');
  });

  it('accepts matching brackets', () => {
    const res = assertBracketParity(4, 6);
    expect(res.ok).toBe(true);
  });
});


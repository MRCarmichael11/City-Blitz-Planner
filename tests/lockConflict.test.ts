import { describe, it, expect } from 'vitest';
import { firstLockWins, type Decl } from '@/lib/locks';

describe('firstLockWins', () => {
  it('blocks overlapping window on same target', () => {
    const locked: Decl[] = [{ id: 'a', orgId: 'o', declaringAllianceId: 'A', targetAllianceId: 'T', start: 1000, end: 2000 }];
    const next: Decl = { id: 'b', orgId: 'o', declaringAllianceId: 'X', targetAllianceId: 'T', start: 1500, end: 2500 };
    const res = firstLockWins(locked, next);
    expect(res.ok).toBe(false);
    if (!('ok' in res) || res.ok) throw new Error('expected conflict');
    expect(res.error).toBe('lock_conflict');
  });

  it('allows non-overlapping windows', () => {
    const locked: Decl[] = [{ id: 'a', orgId: 'o', declaringAllianceId: 'A', targetAllianceId: 'T', start: 1000, end: 2000 }];
    const next: Decl = { id: 'b', orgId: 'o', declaringAllianceId: 'X', targetAllianceId: 'T', start: 2000, end: 3000 };
    const res = firstLockWins(locked, next);
    expect(res.ok).toBe(true);
  });
});


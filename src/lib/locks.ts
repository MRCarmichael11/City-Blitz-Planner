export type Decl = {
  id: string;
  orgId: string;
  declaringAllianceId: string;
  targetAllianceId: string;
  start: number; // epoch ms
  end: number;   // epoch ms, [start, end)
};

export function overlaps(a: Decl, b: Decl): boolean {
  return a.start < b.end && b.start < a.end;
}

export function firstLockWins(existingLocked: Decl[], next: Decl): { ok: true } | { ok: false; error: 'lock_conflict'; blocking: Decl } {
  for (const locked of existingLocked) {
    if (locked.orgId !== next.orgId) continue;
    if (!overlaps(locked, next)) continue;
    const attackerBusy = locked.declaringAllianceId === next.declaringAllianceId;
    const targetBusy = locked.targetAllianceId === next.targetAllianceId;
    if (attackerBusy || targetBusy) {
      return { ok: false, error: 'lock_conflict', blocking: locked };
    }
  }
  return { ok: true };
}


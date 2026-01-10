import { useState } from 'react';
import { lockDeclaration } from '@/services/strikeApi';

export default function LockModal({ orgId, declarationId }: { orgId?: string; declarationId?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 text-xs">
      <button className="px-2 py-1 border rounded" disabled={!orgId || !declarationId} onClick={async ()=>{
        if (!orgId || !declarationId) return;
        const res = await lockDeclaration(orgId, declarationId);
        if (!res.ok) {
          if (res.error === 'lock_conflict') setMsg('Lock conflict: attacker or target already locked in overlapping window.');
          else if (res.error === 'bracket_mismatch') setMsg(`Bracket mismatch: must be in the same bracket (B${res.a} vs B${res.b}).`);
          else if (res.error === 'bracket_locked') setMsg('Bracket locked: one side is unranked/outside the top 20.');
        } else setMsg('Locked');
      }}>Lock</button>
      {msg && <span className="text-muted-foreground">{msg}</span>}
    </div>
  );
}


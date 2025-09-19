import { useEffect, useMemo, useState } from 'react';
import { listAlliances, listReps, upsertRep, removeRep } from '@/services/adminApi';

export default function AllianceRepsManager() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [alliances, setAlliances] = useState<Array<{ id: string; tag: string; name: string }>>([]);
  const [allianceId, setAllianceId] = useState<string>('');
  const [reps, setReps] = useState<Array<{ user_id: string; role: string }>>([]);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'alliance_leader'|'member'|'viewer'>('alliance_leader');

  useEffect(()=> { if (!orgId) return; listAlliances(orgId).then(a => { setAlliances(a); if (a[0]) setAllianceId(a[0].id); }).catch(()=>{}); }, [orgId]);
  useEffect(()=> { if (!orgId || !allianceId) return; listReps(orgId, allianceId).then(setReps).catch(()=>{}); }, [orgId, allianceId]);

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Alliance Representatives</h3>
      <p className="text-sm text-muted-foreground">Assign per-alliance reps (leader/member/viewer).</p>
      <div className="border rounded p-3 space-y-2">
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={allianceId} onChange={e=> setAllianceId(e.target.value)}>
            {alliances.map(a => <option key={a.id} value={a.id}>{a.tag} — {a.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input className="border rounded px-2 py-1 text-sm w-[320px] bg-background text-foreground" placeholder="User ID (uuid)" value={userId} onChange={e=> setUserId(e.target.value)} />
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={role} onChange={e=> setRole(e.target.value as any)}>
            <option value="alliance_leader">alliance_leader</option>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button className="px-2 py-1 border rounded text-sm disabled:opacity-50" disabled={!orgId || !allianceId || !userId.trim()} onClick={async ()=>{
            try { await upsertRep(orgId, allianceId, userId.trim(), role); const rows = await listReps(orgId, allianceId); setReps(rows); setUserId(''); } catch {}
          }}>Add / Update Rep</button>
        </div>
        <div className="space-y-1 max-h-40 overflow-auto">
          {reps.map(r => (
            <div key={r.user_id} className="text-xs flex items-center gap-2">
              <span className="border rounded px-1">{r.role}</span>
              <span className="font-mono">{r.user_id}</span>
              <button className="px-1 py-0.5 border rounded" onClick={async ()=>{ try { await removeRep(orgId, allianceId, r.user_id); setReps(prev=> prev.filter(x=> x.user_id!==r.user_id)); } catch {} }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


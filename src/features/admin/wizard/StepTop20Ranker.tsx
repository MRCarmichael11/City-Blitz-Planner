import { getBracket } from '@/lib/brackets';
import { useEffect, useMemo, useState } from 'react';
import { listAlliances, listFactions, setAllianceRank } from '@/services/adminApi';

export default function StepTop20Ranker() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [factionId, setFactionId] = useState<string>('');
  const [alliances, setAlliances] = useState<Array<{ id: string; tag: string; name: string; rank_int: number | null }>>([]);

  useEffect(() => { listFactions(orgId).then(f => { setFactions(f); if (f[0]) setFactionId(f[0].id); }).catch(()=>{}); }, [orgId]);
  useEffect(() => { if (!orgId || !factionId) return; listAlliances(orgId, undefined, factionId).then(setAlliances).catch(()=>{}); }, [orgId, factionId]);

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Step 3 — Top-20 Ranker</h2>
      <p className="text-sm text-muted-foreground">Drag to order 1..20 per faction. Others remain unranked (Bracket 3).</p>
      <div className="flex items-center gap-2">
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={factionId} onChange={e=> setFactionId(e.target.value)}>
          {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2 text-xs">
        <span className="px-2 py-1 rounded border">B1 = 1–10</span>
        <span className="px-2 py-1 rounded border">B2 = 11–20</span>
        <span className="px-2 py-1 rounded border">B3 = null or &gt;20</span>
      </div>
      <div className="border rounded p-3 space-y-2">
        <div className="grid md:grid-cols-2 gap-2">
          {alliances.map(a => {
            const b = getBracket(a.rank_int);
            return (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <div className={`w-8 text-center rounded ${b===1?'bg-green-600 text-white': b===2?'bg-blue-600 text-white':'bg-muted'}`}>{a.rank_int ?? '-'}</div>
                <div className="w-24 font-mono">{a.tag}</div>
                <div className="flex-1">{a.name}</div>
                <input className="w-16 border rounded px-1 py-0.5 text-xs bg-background text-foreground" placeholder="rank" defaultValue={a.rank_int ?? ''} onBlur={async (e)=>{
                  const v = e.currentTarget.value.trim();
                  const n = v ? parseInt(v, 10) : null;
                  try { await setAllianceRank(a.id, orgId, n); e.currentTarget.value = n?.toString() ?? ''; } catch {}
                }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


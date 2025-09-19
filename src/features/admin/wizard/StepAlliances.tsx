import { useEffect, useMemo, useState } from 'react';
import { listServers, listAlliances, createAlliance, getServerFaction, deleteAlliance } from '@/services/adminApi';

export default function StepAlliances() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [serverId, setServerId] = useState<string>('');
  const [factionId, setFactionId] = useState<string>('');
  const [alliances, setAlliances] = useState<Array<{ id: string; tag: string; name: string }>>([]);
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    listServers(orgId).then(s => { setServers(s); if (s[0]) setServerId(s[0].id); }).catch(()=>{});
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setError(null);
      let fid = factionId;
      if (serverId) {
        try {
          const map = await getServerFaction(orgId, serverId);
          fid = map?.faction_id || '';
          setFactionId(fid);
        } catch {}
      }
      listAlliances(orgId, serverId || undefined, fid || undefined).then(setAlliances).catch(()=>{});
    })();
  }, [orgId, serverId]);

  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Step 2 — Alliances</h2>
      <div className="flex gap-2 items-center">
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={serverId} onChange={e=> setServerId(e.target.value)}>
          {servers.length === 0 && <option value="">No servers found (create in Step 1)</option>}
          {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="border rounded px-2 py-1 text-sm bg-background text-foreground" placeholder="Alliance Tag (required)" value={tag} onChange={e=> setTag(e.target.value)} />
        <button className="px-2 py-1 border rounded text-sm disabled:opacity-50" disabled={!tag.trim() || !serverId || !factionId} onClick={async ()=>{
          try {
            setError(null);
            const a = await createAlliance({ orgId, serverId, factionId, tag: tag.trim(), name: tag.trim() });
            setAlliances(prev=> [a as any, ...prev]);
            setTag('');
          } catch (e: any) { setError(e.message || 'Failed to add alliance'); }
        }}>Add Alliance</button>
      </div>
      {!factionId && serverId && (
        <div className="text-xs text-yellow-700">Selected server is not mapped to a faction yet (Step 1). Map it to enable alliance creation.</div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="border rounded p-3">
        <div className="text-sm font-medium mb-2">Alliances</div>
        <div className="grid md:grid-cols-2 gap-2">
          {alliances.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <div className="w-24 font-mono">{a.tag}</div>
              <div className="flex-1">{a.name}</div>
              <button className="px-2 py-0.5 border rounded text-xs" title="Delete" onClick={async ()=>{
                if (!confirm(`Delete alliance ${a.tag}?`)) return;
                try { await deleteAlliance(orgId, a.id); setAlliances(prev=> prev.filter(x=> x.id !== a.id)); } catch (e:any) { setError(e.message || 'Delete failed'); }
              }}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


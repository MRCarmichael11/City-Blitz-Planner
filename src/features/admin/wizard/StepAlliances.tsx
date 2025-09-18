import { useEffect, useMemo, useState } from 'react';
import { listServers, listFactions, listAlliances, createAlliance } from '@/services/adminApi';

export default function StepAlliances() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [serverId, setServerId] = useState<string>('');
  const [factionId, setFactionId] = useState<string>('');
  const [alliances, setAlliances] = useState<Array<{ id: string; tag: string; name: string }>>([]);
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!orgId) return;
    listServers(orgId).then(s => { setServers(s); if (s[0]) setServerId(s[0].id); }).catch(()=>{});
    listFactions(orgId).then(f => { setFactions(f); if (f[0]) setFactionId(f[0].id); }).catch(()=>{});
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    listAlliances(orgId, serverId || undefined, factionId || undefined).then(setAlliances).catch(()=>{});
  }, [orgId, serverId, factionId]);

  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Step 2 — Alliances</h2>
      <div className="flex gap-2 items-center">
        <select className="border rounded px-2 py-1 text-sm" value={serverId} onChange={e=> setServerId(e.target.value)}>
          {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm" value={factionId} onChange={e=> setFactionId(e.target.value)}>
          {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input className="border rounded px-2 py-1 text-sm" placeholder="Tag" value={tag} onChange={e=> setTag(e.target.value)} />
        <input className="border rounded px-2 py-1 text-sm" placeholder="Name" value={name} onChange={e=> setName(e.target.value)} />
        <button className="px-2 py-1 border rounded text-sm" disabled={!tag.trim() || !name.trim() || !serverId || !factionId} onClick={async ()=>{
          try { const a = await createAlliance({ orgId, serverId, factionId, tag: tag.trim(), name: name.trim() }); setAlliances(prev=> [a as any, ...prev]); setTag(''); setName(''); } catch {}
        }}>Add Alliance</button>
      </div>

      <div className="border rounded p-3">
        <div className="text-sm font-medium mb-2">Alliances</div>
        <div className="grid md:grid-cols-2 gap-2">
          {alliances.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <div className="w-24 font-mono">{a.tag}</div>
              <div className="flex-1">{a.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


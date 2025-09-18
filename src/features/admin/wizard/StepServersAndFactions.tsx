import { useEffect, useMemo, useState } from 'react';
import { listServers, createServer, listFactions, createFaction, mapServerToFaction, getServerFaction } from '@/services/adminApi';

export default function StepServersAndFactions() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [newServer, setNewServer] = useState('');
  const [newFaction, setNewFaction] = useState('');
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!orgId) return;
    listServers(orgId).then(setServers).catch(()=>{});
    listFactions(orgId).then(setFactions).catch(()=>{});
  }, [orgId]);

  useEffect(() => {
    if (!orgId || servers.length === 0) return;
    Promise.all(servers.map(s => getServerFaction(orgId, s.id))).then(rows => {
      const m: Record<string, string | null> = {};
      rows.forEach((r, idx) => { m[servers[idx].id] = r?.faction_id ?? null; });
      setMapping(m);
    }).catch(()=>{});
  }, [orgId, servers]);

  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Step 1 — Servers & Faction map</h2>
      <div className="flex gap-2 items-center">
        <input className="border rounded px-2 py-1 text-sm" placeholder="New server (e.g., 978)" value={newServer} onChange={e=> setNewServer(e.target.value)} />
        <button className="px-2 py-1 border rounded text-sm" disabled={!newServer.trim() || !orgId} onClick={async ()=>{
          try { const s = await createServer(orgId, newServer.trim()); setServers(prev=> [...prev, s]); setNewServer(''); } catch {}
        }}>Add Server</button>
        <div className="mx-2" />
        <input className="border rounded px-2 py-1 text-sm" placeholder="New faction (e.g., Gendarmarie)" value={newFaction} onChange={e=> setNewFaction(e.target.value)} />
        <button className="px-2 py-1 border rounded text-sm" disabled={!newFaction.trim() || !orgId} onClick={async ()=>{
          try { const f = await createFaction(orgId, newFaction.trim()); setFactions(prev=> [...prev, f]); setNewFaction(''); } catch {}
        }}>Add Faction</button>
      </div>

      <div className="border rounded p-3">
        <div className="text-sm font-medium mb-2">Assign each server to a faction</div>
        <div className="grid md:grid-cols-2 gap-2">
          {servers.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="w-24">{s.name}</div>
              <select className="border rounded px-2 py-1 text-sm" value={mapping[s.id] || ''} onChange={async (e)=>{
                const val = e.target.value || '';
                try { const row = await mapServerToFaction(orgId, s.id, val); setMapping(prev=> ({ ...prev, [s.id]: row.faction_id })); } catch {}
              }}>
                <option value="">Select faction…</option>
                {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


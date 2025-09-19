import { useEffect, useMemo, useState } from 'react';
import { listServers, createServer, listFactions, createFaction, mapServerToFaction, getServerFaction } from '@/services/adminApi';

export default function StepServersAndFactions() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [myFactionId, setMyFactionId] = useState<string>('');
  const [newServer, setNewServer] = useState('');
  const [newFaction, setNewFaction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!orgId) return;
    listServers(orgId).then(setServers).catch(()=>{});
    listFactions(orgId).then(fs=> { setFactions(fs); const saved = localStorage.getItem('my_faction_id') || ''; if (saved && fs.find(f=> f.id===saved)) setMyFactionId(saved); }).catch(()=>{});
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
        <input className="border rounded px-2 py-1 text-sm bg-background text-foreground" placeholder="New server (e.g., 978)" value={newServer} onChange={e=> setNewServer(e.target.value)} />
        <button className="px-2 py-1 border rounded text-sm disabled:opacity-50" disabled={!newServer.trim() || !orgId} onClick={async ()=>{
          try { setError(null); const s = await createServer(orgId, newServer.trim()); setServers(prev=> [...prev, s]); setNewServer(''); } catch (e: any) { setError(e.message || 'Failed to add server'); }
        }}>Add Server</button>
        <div className="mx-2" />
        <input className="border rounded px-2 py-1 text-sm bg-background text-foreground" placeholder="New faction (e.g., Gendarmarie)" value={newFaction} onChange={e=> setNewFaction(e.target.value)} />
        <button className="px-2 py-1 border rounded text-sm disabled:opacity-50" disabled={!newFaction.trim() || !orgId} onClick={async ()=>{
          try { setError(null); const f = await createFaction(orgId, newFaction.trim()); setFactions(prev=> [...prev, f]); setNewFaction(''); } catch (e: any) { setError(e.message || 'Failed to add faction'); }
        }}>Add Faction</button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="border rounded p-3">
        <div className="text-sm font-medium mb-2">Assign each server to a faction</div>
        <div className="grid md:grid-cols-2 gap-2">
          {servers.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="w-24">{s.name}</div>
              <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={mapping[s.id] || ''} onChange={async (e)=>{
                const val = e.target.value || '';
                try { setError(null); const row = await mapServerToFaction(orgId, s.id, val); setMapping(prev=> ({ ...prev, [s.id]: row.faction_id })); } catch (err: any) { setError(err.message || 'Failed to map server'); }
              }}>
                <option value="">Select faction…</option>
                {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {factions.length > 0 && (
        <div className="border rounded p-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">My Faction</div>
            <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={myFactionId} onChange={e=> { setMyFactionId(e.target.value); localStorage.setItem('my_faction_id', e.target.value); localStorage.setItem('my_faction_name', factions.find(f=> f.id===e.target.value)?.name || ''); }}>
              <option value="">Select…</option>
              {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {myFactionId && <span className="text-xs text-muted-foreground">Saved for Strike Planner</span>}
          </div>
        </div>
      )}
    </div>
  );
}


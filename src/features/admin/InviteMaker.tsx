import { useEffect, useMemo, useState, useMemo as useReactMemo } from 'react';
import { createInvite, listInvites, createBroadcastInvite, getActiveBroadcastInvite, revokeBroadcastInvite } from '@/services/inviteApi';
import { useEffect as useEffectReact } from 'react';
import { listAlliances, listFactions, listServers } from '@/services/adminApi';

export default function InviteMaker() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [role, setRole] = useState<'alliance_leader'|'member'>('alliance_leader');
  const [invites, setInvites] = useState<any[]>([]);
  const base = window.location.origin;
  const [generating, setGenerating] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [alliances, setAlliances] = useState<Array<{ id: string; tag: string; server_id?: string; faction_id?: string }>>([]);
  const [allianceId, setAllianceId] = useState<string>('');
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [factionId, setFactionId] = useState<string>('');
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [serverId, setServerId] = useState<string>('');
  const [broadcast, setBroadcast] = useState<{ token: string; expires_at: string; max_uses: number; use_count: number } | null>(null);
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  useEffect(()=> { if (!orgId) return; listInvites(orgId).then(setInvites).catch(()=>{}); getActiveBroadcastInvite(orgId).then((b:any)=>{ if (b) setBroadcast({ token: b.token, expires_at: b.expires_at, max_uses: b.max_uses, use_count: b.use_count }); }).catch(()=>{}); }, [orgId]);
  useEffectReact(()=> { if (!orgId) return; (async ()=>{
    try {
      const [f, s] = await Promise.all([listFactions(orgId), listServers(orgId)]);
      setFactions(f);
      setServers(s);
      if (f && f[0]) setFactionId(f[0].id);
    } catch {}
  })(); }, [orgId]);
  useEffectReact(()=> { if (!orgId) return; (async ()=>{
    try {
      const data = await listAlliances(orgId, serverId || undefined, factionId || undefined);
      setAlliances(data as any);
      if (allianceId && !data.find((a:any)=> a.id===allianceId)) setAllianceId('');
    } catch {}
  })(); }, [orgId, factionId, serverId]);

  const filteredServers = useReactMemo(() => {
    if (!servers.length || !alliances.length) return [] as Array<{ id: string; name: string }>;
    const serverIds = new Set((alliances as any[]).map(a => a.server_id).filter(Boolean));
    return servers.filter(s => serverIds.has(s.id));
  }, [servers, alliances]);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Invite Maker</h3>
      <p className="text-sm text-muted-foreground">Issue org-scoped invites for roles (server_admin, faction_leader, alliance_leader, member, viewer).</p>
      <div className="border rounded p-3 space-y-2">
        <div className="text-xs font-medium">Broadcast viewer link</div>
        {broadcast ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="border rounded px-1">uses {broadcast.use_count}/{broadcast.max_uses}</span>
              <span className="text-muted-foreground">expires {new Date(broadcast.expires_at).toLocaleString()}</span>
              <button className="px-2 py-1 border rounded disabled:opacity-50" disabled={broadcastBusy} onClick={async ()=>{ try { setBroadcastBusy(true); await revokeBroadcastInvite(orgId); setBroadcast(null); setMsg('Broadcast link revoked'); } catch { setMsg('Failed to revoke'); } finally { setBroadcastBusy(false); } }}>Revoke</button>
            </div>
            <div className="flex items-center gap-2">
              <input className="flex-1 border rounded px-2 py-1 text-xs bg-background text-foreground" value={`${base}/invite?token=${broadcast.token}`} readOnly onClick={(e)=> (e.currentTarget as HTMLInputElement).select()} />
              <button className="px-2 py-1 border rounded text-xs" onClick={async ()=>{ try { await navigator.clipboard.writeText(`${base}/invite?token=${broadcast.token}`); setMsg('Copied!'); } catch { /* ignore */ } }}>Copy</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <button className="px-2 py-1 border rounded disabled:opacity-50" disabled={broadcastBusy} onClick={async ()=>{
              try {
                setMsg(null); setBroadcastBusy(true);
                const row:any = await createBroadcastInvite(orgId, 40, 400);
                setBroadcast({ token: row.token, expires_at: row.expires_at, max_uses: row.max_uses, use_count: row.use_count });
                const url = `${base}/invite?token=${row.token}`;
                setLastUrl(url);
                try { await navigator.clipboard.writeText(url); setMsg('Broadcast link copied to clipboard'); } catch { setMsg('Broadcast link created. Copy from the field below.'); }
                try { const updated = await listInvites(orgId); setInvites(updated); } catch {}
              } catch {
                setMsg('Failed to create broadcast link');
              } finally {
                setBroadcastBusy(false);
              }
            }}>Create 40-day / 400-use link</button>
          </div>
        )}
      </div>
      <div className="border rounded p-3 space-y-2">
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={factionId} onChange={e=> { setFactionId(e.target.value); setServerId(''); setAllianceId(''); }}>
            <option value="">Faction…</option>
            {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={serverId} onChange={e=> { setServerId(e.target.value); setAllianceId(''); }}>
            <option value="">Server…</option>
            {filteredServers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={role} onChange={e=> setRole(e.target.value as any)}>
            <option value="alliance_leader">alliance_leader</option>
            <option value="member">member</option>
          </select>
          {(role==='alliance_leader' || role==='member') && (
            <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={allianceId} onChange={e=> setAllianceId(e.target.value)}>
              <option value="">Alliance…</option>
              {alliances.map(a => <option key={a.id} value={a.id}>{a.tag}</option>)}
            </select>
          )}
          <button className="px-2 py-1 border rounded text-sm disabled:opacity-50" disabled={!orgId || generating || ((role==='alliance_leader' || role==='member') && !allianceId)} onClick={async ()=>{
            try {
              setMsg(null); setGenerating(true);
              const row = await createInvite(orgId, role, (role==='alliance_leader'||role==='member') ? allianceId || undefined : undefined);
              const url = `${base}/invite?token=${encodeURIComponent(row.token)}`;
              setLastUrl(url);
              try { const updated = await listInvites(orgId); setInvites(updated); } catch {}
              try { await navigator.clipboard.writeText(url); setMsg('Invite copied to clipboard'); } catch {
                setMsg('Invite generated. Copy from the field below.');
              }
            } catch (e: any) {
              setMsg(e?.message || 'Failed to create invite. Ensure invites table exists.');
            } finally {
              setGenerating(false);
            }
          }}>Create Invite</button>
        </div>
        <div className="text-xs text-muted-foreground">Links expire automatically and add users to this org upon accept.</div>
        {msg && <div className="text-xs">{msg}</div>}
        {lastUrl && (
          <div className="flex items-center gap-2">
            <input className="flex-1 border rounded px-2 py-1 text-xs bg-background text-foreground" value={lastUrl} readOnly onClick={(e)=> (e.currentTarget as HTMLInputElement).select()} />
            <button className="px-2 py-1 border rounded text-xs" onClick={async ()=>{ try { await navigator.clipboard.writeText(lastUrl); setMsg('Copied!'); } catch { /* ignore */ } }}>Copy</button>
          </div>
        )}
        <div className="space-y-1 max-h-40 overflow-auto">
          {invites.map((x: any) => (
            <div key={x.id} className="text-xs flex items-center gap-2">
              <span className="border rounded px-1">{x.role}</span>
              {x.alliances?.tag && (<span className="border rounded px-1 bg-accent/30">{x.alliances.tag}</span>)}
              <span className="text-muted-foreground">{new Date(x.expires_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


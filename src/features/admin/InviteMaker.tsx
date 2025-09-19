import { useEffect, useMemo, useState } from 'react';
import { createInvite, listInvites } from '@/services/inviteApi';

export default function InviteMaker() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [role, setRole] = useState('viewer');
  const [invites, setInvites] = useState<any[]>([]);
  const base = window.location.origin;
  const [generating, setGenerating] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(()=> { if (!orgId) return; listInvites(orgId).then(setInvites).catch(()=>{}); }, [orgId]);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Invite Maker</h3>
      <p className="text-sm text-muted-foreground">Issue org-scoped invites for roles (server_admin, faction_leader, alliance_leader, member, viewer).</p>
      <div className="border rounded p-3 space-y-2">
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={role} onChange={e=> setRole(e.target.value)}>
            <option>server_admin</option>
            <option>faction_leader</option>
            <option>alliance_leader</option>
            <option>member</option>
            <option>viewer</option>
          </select>
          <button className="px-2 py-1 border rounded text-sm disabled:opacity-50" disabled={!orgId || generating} onClick={async ()=>{
            try {
              setMsg(null); setGenerating(true);
              const row = await createInvite(orgId, role);
              const url = `${base}/invite?token=${encodeURIComponent(row.token)}`;
              setLastUrl(url);
              setInvites(prev=> [row, ...prev]);
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
          {invites.map(x => <div key={x.id} className="text-xs flex items-center gap-2"><span className="border rounded px-1">{x.role}</span><span className="text-muted-foreground">{new Date(x.expires_at).toLocaleString()}</span></div>)}
        </div>
      </div>
    </div>
  );
}


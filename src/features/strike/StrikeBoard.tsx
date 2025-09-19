import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { listAlliances } from '@/services/adminApi';
import { getMembership, can } from '@/lib/rbac';

type Faction = { id: string; name: string };
type Alliance = { id: string; tag: string; name: string; rank_int: number | null };

export default function StrikeBoard() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [offense, setOffense] = useState<1|2|3|4>(1);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [factionId, setFactionId] = useState<string>('');
  const [opponentFactionId, setOpponentFactionId] = useState<string>('');
  const [top20, setTop20] = useState<Alliance[]>([]);
  const [attackerAlliances, setAttackerAlliances] = useState<Alliance[]>([]);
  const [attackerId, setAttackerId] = useState<string>('');
  const [interest, setInterest] = useState<Record<string, { count: number; tags: string[] }>>({});
  const [canReset, setCanReset] = useState<boolean>(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem('offense_step') || '1');
    if (saved>=1 && saved<=4) setOffense(saved as 1|2|3|4);
  }, []);
  useEffect(() => { localStorage.setItem('offense_step', String(offense)); }, [offense]);

  useEffect(() => {
    if (!orgId || !supabase) return;
    (supabase as any).from('factions').select('id,name').eq('org_id', orgId).then(({ data }: any)=>{
      setFactions(data||[]);
      const preferred = localStorage.getItem('my_faction_id') || '';
      const mine = (data||[]).find((f:any)=> f.id===preferred);
      if (mine) setFactionId(mine.id);
      else if (data && data[0] && !factionId) setFactionId(data[0].id);
    }).catch(()=>{});
    // attacker alliances will load when factionId resolves (see below)
    (async () => {
      try {
        const { data: userRes } = await (supabase as any).auth.getUser();
        const uid = userRes?.user?.id;
        const mem = uid ? await getMembership(orgId, uid) : null;
        let allowed = false;
        if (mem && can.adminOrg(mem.role)) allowed = true;
        if (!allowed && uid) {
          const { data: org } = await (supabase as any).from('orgs').select('created_by').eq('id', orgId).maybeSingle();
          if (org?.created_by === uid) allowed = true;
        }
        setCanReset(!!allowed);
      } catch {
        setCanReset(false);
      }
    })();
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !factionId) return;
    // determine opponent faction (assumes two factions per org)
    const other = (factions || []).find(f => f.id !== factionId);
    setOpponentFactionId(other?.id || '');
    // load Top-20 targets for selected faction
    (supabase as any)
      .from('alliances')
      .select('id,tag,name,rank_int')
      .eq('org_id', orgId)
      .eq('faction_id', factionId)
      .not('rank_int','is',null)
      .lte('rank_int',20)
      .order('rank_int', { ascending: true })
      .then(({ data }: any) => setTop20(data || []))
      .catch(()=>{});
  }, [orgId, factionId, factions]);

  // Load attacker alliances from the opponent faction
  useEffect(() => {
    if (!orgId || !opponentFactionId) { setAttackerAlliances([]); setAttackerId(''); return; }
    (supabase as any)
      .from('alliances')
      .select('id,tag,name,rank_int')
      .eq('org_id', orgId)
      .eq('faction_id', opponentFactionId)
      .order('tag', { ascending: true })
      .then(({ data }: any) => { setAttackerAlliances(data || []); setAttackerId(''); })
      .catch(()=>{});
  }, [orgId, opponentFactionId]);

  useEffect(() => {
    if (!orgId || top20.length === 0) { setInterest({}); return; }
    const note = `offense:${offense}`;
    (supabase as any)
      .from('declarations')
      .select('id,target_alliance_id')
      .eq('org_id', orgId)
      .eq('status','proposed')
      .eq('notes', note)
      .in('target_alliance_id', top20.map(a=> a.id))
      .then(async ({ data }: any) => {
        const map: Record<string, { id: string }> = {};
        (data||[]).forEach((d: any)=> { map[d.target_alliance_id] = { id: d.id }; });
        const out: Record<string, { count: number; tags: string[] }> = {};
        for (const row of Object.entries(map)) {
          const targetId = row[0];
          const declId = (row[1] as any).id;
          const { data: parts } = await (supabase as any).from('declaration_participants').select('alliance_id').eq('declaration_id', declId);
          const ids = (parts||[]).map((p:any)=> p.alliance_id);
          if (ids.length) {
            const { data: attackers } = await (supabase as any).from('alliances').select('tag').in('id', ids);
            out[targetId] = { count: ids.length, tags: (attackers||[]).map((x:any)=> x.tag).slice(0,4) };
          }
        }
        setInterest(out);
      }).catch(()=>{});
  }, [orgId, top20, offense]);

  const handleInterested = async (targetAllianceId: string) => {
    if (!orgId || !attackerId) { alert('Select an attacker alliance first'); return; }
    const note = `offense:${offense}`;
    // find or create declaration
    let declId: string | null = null;
    const { data: found } = await (supabase as any)
      .from('declarations')
      .select('id')
      .eq('org_id', orgId)
      .eq('target_alliance_id', targetAllianceId)
      .eq('status','proposed')
      .eq('notes', note)
      .maybeSingle();
    if (found?.id) declId = found.id;
    if (!declId) {
      const now = new Date().toISOString();
      const { data: created, error } = await (supabase as any).from('declarations').insert({
        org_id: orgId,
        season: 'S',
        declaring_alliance_id: attackerId,
        target_alliance_id: targetAllianceId,
        start: now,
        end: now,
        visibility: 'faction',
        status: 'proposed',
        notes: note
      }).select('id').single();
      if (error) { alert('Failed to create'); return; }
      declId = created.id;
    }
    // RSVP
    await (supabase as any).from('declaration_participants').upsert({ declaration_id: declId, alliance_id: attackerId }, { onConflict: 'declaration_id,alliance_id' });
    // refresh interest for this row
    const { data: parts } = await (supabase as any).from('declaration_participants').select('alliance_id').eq('declaration_id', declId);
    const ids = (parts||[]).map((p:any)=> p.alliance_id);
    const { data: attackers } = await (supabase as any).from('alliances').select('tag').in('id', ids);
    setInterest(prev => ({ ...prev, [targetAllianceId]: { count: ids.length, tags: (attackers||[]).map((x:any)=> x.tag).slice(0,4) } }));
  };

  const handleResetOffense = async () => {
    if (!canReset) return;
    if (!confirm(`Reset offense ${offense}? This clears proposed interest for this offense.`)) return;
    const note = `offense:${offense}`;
    try {
      await (supabase as any)
        .from('declarations')
        .delete()
        .eq('org_id', orgId)
        .eq('status','proposed')
        .eq('notes', note);
      setInterest({});
      setOffense(prev => (prev < 4 ? (prev + 1) as 1|2|3|4 : 1));
    } catch {
      alert('Reset failed');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-full border overflow-hidden">
          {[1,2,3,4].map(n => (
            <button key={n} className={`px-3 py-1 text-xs ${offense===n?'bg-primary text-primary-foreground':'hover:bg-accent'}`} onClick={()=> setOffense(n as 1|2|3|4)}>Offense {n}</button>
          ))}
        </div>
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={factionId} onChange={e=> setFactionId(e.target.value)}>
          {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={attackerId} onChange={e=> setAttackerId(e.target.value)}>
          <option value="">Attacker alliance…</option>
          {attackerAlliances.map(a => <option key={a.id} value={a.id}>{a.tag}</option>)}
        </select>
        <button className="ml-auto px-3 py-1 border rounded text-xs disabled:opacity-50" disabled={!canReset} onClick={handleResetOffense} title={canReset? 'Clears all proposed interest for this offense and steps to next' : 'Only org admin/creator can reset'}>
          Reset offense {offense}
        </button>
      </div>
      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/50">
            <tr>
              <th className="text-left px-2 py-1 w-12">#</th>
              <th className="text-left px-2 py-1">Target</th>
              <th className="text-left px-2 py-1">Interest</th>
              <th className="text-left px-2 py-1 w-36">Action</th>
            </tr>
          </thead>
          <tbody>
            {top20.map(a => {
              const meta = interest[a.id] || { count: 0, tags: [] };
              return (
                <tr key={a.id} className="border-t">
                  <td className="px-2 py-1">{a.rank_int ?? ''}</td>
                  <td className="px-2 py-1 font-mono">{a.tag}</td>
                  <td className="px-2 py-1">
                    {meta.count>0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs border rounded px-1">{meta.count}</span>
                        {meta.tags.map((t, i)=> <span key={i} className="text-xs border rounded px-1">{t}</span>)}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">None</span>}
                  </td>
                  <td className="px-2 py-1">
                    <button className="px-2 py-1 border rounded text-xs disabled:opacity-50" disabled={!attackerId} onClick={()=> handleInterested(a.id)}>Interested</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { listAlliances } from '@/services/adminApi';
import { getMembership, can } from '@/lib/rbac';
import { getBracket } from '@/lib/brackets';

type Faction = { id: string; name: string };
type Alliance = { id: string; tag: string; name: string; rank_int: number | null; server?: { name: string } };
type InterestRow = { declId: string | null; count: number; participants: Array<{ id: string; tag: string; server?: { name: string } | null }> };

export default function StrikeBoard() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [factionId, setFactionId] = useState<string>('');
  const [opponentFactionId, setOpponentFactionId] = useState<string>('');
  const [top20, setTop20] = useState<Alliance[]>([]);
  const [attackerAlliances, setAttackerAlliances] = useState<Alliance[]>([]);
  const [attackerId, setAttackerId] = useState<string>('');
  const [interest, setInterest] = useState<Record<string, InterestRow>>({});
  const [canReset, setCanReset] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>('');
  const [isOrgAdmin, setIsOrgAdmin] = useState<boolean>(false);
  const [lockedAlliance, setLockedAlliance] = useState<Alliance | null>(null);
  const [isAllianceLeader, setIsAllianceLeader] = useState<boolean>(false);
  const attackerBracket = useMemo(() => {
    const a = attackerAlliances.find(x => x.id === attackerId);
    return getBracket(a?.rank_int ?? null);
  }, [attackerAlliances, attackerId]);

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
        setUserId(uid || '');
        const mem = uid ? await getMembership(orgId, uid) : null;
        let allowed = false;
        if (mem && can.adminOrg(mem.role)) allowed = true;
        setIsOrgAdmin(!!(mem && can.adminOrg(mem.role)));
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
    // load Top-20 targets for enemy faction (other)
    (supabase as any)
      .from('alliances')
      .select('id,tag,name,rank_int,server:servers(name)')
      .eq('org_id', orgId)
      .eq('faction_id', other?.id || '')
      .not('rank_int','is',null)
      .lte('rank_int',20)
      .order('rank_int', { ascending: true })
      .then(({ data }: any) => setTop20(data || []))
      .catch(()=>{});
  }, [orgId, factionId, factions]);

  // Load attacker alliances from my faction (Anubis)
  useEffect(() => {
    if (!orgId || !factionId) { setAttackerAlliances([]); setAttackerId(''); return; }
    (supabase as any)
      .from('alliances')
      .select('id,tag,name,rank_int,server:servers(name)')
      .eq('org_id', orgId)
      .eq('faction_id', factionId)
      .order('tag', { ascending: true })
      .then(({ data }: any) => { setAttackerAlliances(data || []); setAttackerId(''); })
      .catch(()=>{});
  }, [orgId, factionId]);

  // For non-admins, lock the attacker alliance to the user's mapped alliance (via alliance_reps)
  useEffect(() => {
    (async () => {
      if (!orgId || !userId || isOrgAdmin === true) { setLockedAlliance(null); return; }
      try {
        const { data: reps } = await (supabase as any)
          .from('alliance_reps')
          .select('alliance_id,role')
          .eq('org_id', orgId)
          .eq('user_id', userId);
        const ids: string[] = (reps || []).map((r:any)=> r.alliance_id);
        if (!ids.length) { setLockedAlliance(null); setAttackerId(''); return; }
        const { data: alliances } = await (supabase as any)
          .from('alliances')
          .select('id,tag,name,rank_int,faction_id,server:servers(name)')
          .in('id', ids);
        const chosen: Alliance & { faction_id?: string } | undefined = (alliances || []).find((a:any)=> a.faction_id === factionId) || (alliances || [])[0];
        if (chosen) {
          setLockedAlliance({ id: chosen.id, tag: (chosen as any).tag, name: (chosen as any).name, rank_int: (chosen as any).rank_int, server: (chosen as any).server });
          setAttackerId(chosen.id);
          const rep = (reps || []).find((r:any)=> r.alliance_id === chosen.id);
          setIsAllianceLeader(rep?.role === 'alliance_leader');
          if (chosen && (chosen as any).faction_id && (chosen as any).faction_id !== factionId) {
            setFactionId((chosen as any).faction_id);
            localStorage.setItem('my_faction_id', (chosen as any).faction_id);
          }
        } else {
          setLockedAlliance(null);
          setAttackerId('');
          setIsAllianceLeader(false);
        }
      } catch {
        setLockedAlliance(null);
        setAttackerId('');
        setIsAllianceLeader(false);
      }
    })();
  }, [orgId, userId, isOrgAdmin, factionId]);

  useEffect(() => {
    if (!orgId || top20.length === 0) { setInterest({}); return; }
    (supabase as any)
      .from('declarations')
      .select('id,target_alliance_id')
      .eq('org_id', orgId)
      .eq('status','proposed')
      .in('target_alliance_id', top20.map(a=> a.id))
      .then(async ({ data }: any) => {
        const map: Record<string, { id: string }> = {};
        (data||[]).forEach((d: any)=> { map[d.target_alliance_id] = { id: d.id }; });
        const out: Record<string, InterestRow> = {};
        for (const row of Object.entries(map)) {
          const targetId = row[0];
          const declId = (row[1] as any).id;
          const { data: parts } = await (supabase as any).from('declaration_participants').select('alliance_id').eq('declaration_id', declId);
          const ids = (parts||[]).map((p:any)=> p.alliance_id);
          if (ids.length) {
            const { data: attackers } = await (supabase as any).from('alliances').select('id,tag,server:servers(name)').in('id', ids);
            const participants = (attackers || []).map((x:any)=> ({ id: x.id, tag: x.tag, server: x.server || null }));
            out[targetId] = { declId, count: ids.length, participants };
          } else {
            out[targetId] = { declId, count: 0, participants: [] };
          }
        }
        setInterest(out);
      }).catch(()=>{});
  }, [orgId, top20]);

  const handleInterested = async (targetAllianceId: string) => {
    if (!orgId || !attackerId) { alert('Select an attacker alliance first'); return; }
    // find or create declaration
    let declId: string | null = null;
    const { data: found } = await (supabase as any)
      .from('declarations')
      .select('id')
      .eq('org_id', orgId)
      .eq('target_alliance_id', targetAllianceId)
      .eq('status','proposed')
      .maybeSingle();
    if (found?.id) declId = found.id;
    if (!declId) {
      const now = new Date().toISOString();
      const { data: userRes } = await (supabase as any).auth.getUser();
      const uid = userRes?.user?.id || null;
      const { data: created, error } = await (supabase as any).from('declarations').insert({
        org_id: orgId,
        season: 'S',
        declaring_alliance_id: attackerId,
        target_alliance_id: targetAllianceId,
        start: now,
        end: now,
        visibility: 'faction',
        status: 'proposed',
        notes: null,
        created_by: uid
      }).select('id').single();
      if (error) { alert('Failed to create'); return; }
      declId = created.id;
    }
    // RSVP
    await (supabase as any).from('declaration_participants').upsert({ declaration_id: declId, alliance_id: attackerId }, { onConflict: 'declaration_id,alliance_id' });
    // refresh interest for this row
    const { data: parts } = await (supabase as any).from('declaration_participants').select('alliance_id').eq('declaration_id', declId);
    const ids = (parts||[]).map((p:any)=> p.alliance_id);
    if (ids.length) {
      const { data: attackers } = await (supabase as any).from('alliances').select('id,tag,server:servers(name)').in('id', ids);
      const participants = (attackers || []).map((x:any)=> ({ id: x.id, tag: x.tag, server: x.server || null }));
      setInterest(prev => ({ ...prev, [targetAllianceId]: { declId, count: ids.length, participants } }));
    } else {
      setInterest(prev => ({ ...prev, [targetAllianceId]: { declId, count: 0, participants: [] } }));
    }
  };

  const handleWithdraw = async (targetAllianceId: string, removeAllianceId: string) => {
    if (!orgId) return;
    let declId: string | null = interest[targetAllianceId]?.declId || null;
    if (!declId) {
      const { data: found } = await (supabase as any)
        .from('declarations')
        .select('id')
        .eq('org_id', orgId)
        .eq('target_alliance_id', targetAllianceId)
        .eq('status','proposed')
        .maybeSingle();
      if (found?.id) declId = found.id;
    }
    if (!declId) return;
    await (supabase as any).from('declaration_participants').delete().eq('declaration_id', declId).eq('alliance_id', removeAllianceId);
    const { data: parts } = await (supabase as any).from('declaration_participants').select('alliance_id').eq('declaration_id', declId);
    const ids = (parts||[]).map((p:any)=> p.alliance_id);
    if (ids.length) {
      const { data: attackers } = await (supabase as any).from('alliances').select('id,tag,server:servers(name)').in('id', ids);
      const participants = (attackers || []).map((x:any)=> ({ id: x.id, tag: x.tag, server: x.server || null }));
      setInterest(prev => ({ ...prev, [targetAllianceId]: { declId, count: ids.length, participants } }));
    } else {
      setInterest(prev => ({ ...prev, [targetAllianceId]: { declId, count: 0, participants: [] } }));
    }
  };

  const handleReset = async () => {
    if (!canReset) return;
    if (!confirm(`Reset current cycle? This clears all proposed interest.`)) return;
    try {
      await (supabase as any)
        .from('declarations')
        .delete()
        .eq('org_id', orgId)
        .eq('status','proposed');
      setInterest({});
    } catch {
      alert('Reset failed');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-xs border rounded px-2 py-1 bg-accent/40">
          My Faction: <strong>{(factions.find(f=> f.id===factionId)?.name) || '—'}</strong>
        </div>
        <div className="text-xs border rounded px-2 py-1 bg-accent/40">
          Targeting: <strong>{(factions.find(f=> f.id===opponentFactionId)?.name) || '—'}</strong>
        </div>
        {isOrgAdmin ? (
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={attackerId} onChange={e=> setAttackerId(e.target.value)}>
            <option value="">Attacker alliance…</option>
            {attackerAlliances.map(a => <option key={a.id} value={a.id}>{a.tag} {a.server?.name ? `(${a.server.name})` : ''}</option>)}
          </select>
        ) : (
          <div className="text-xs border rounded px-2 py-1 bg-accent/20">
            Attacker: <strong>{lockedAlliance ? `${lockedAlliance.tag}${lockedAlliance.server?.name ? ` (${lockedAlliance.server.name})` : ''}` : '—'}</strong>
          </div>
        )}
        <button className="ml-auto px-3 py-1 border rounded text-xs disabled:opacity-50" disabled={!canReset} onClick={handleReset} title={canReset? 'Clears all proposed interest in current cycle' : 'Only org admin/creator can reset'}>
          Reset current cycle
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
            {/* Bracket 1 */}
            <tr className="bg-primary/10">
              <td className="px-2 py-1 font-medium" colSpan={4}>Bracket 1 (1–10)</td>
            </tr>
            {top20.filter(a => (a.rank_int ?? 99) <= 10).map(a => {
              const meta = interest[a.id] || { declId: null, count: 0, participants: [] };
              const b = getBracket(a.rank_int ?? null);
              const parityOk = attackerBracket === b && attackerBracket !== 3;
              return (
                <tr key={a.id} className="border-t">
                  <td className="px-2 py-1">{a.rank_int ?? ''}</td>
                  <td className="px-2 py-1 font-mono">{a.tag} {a.server?.name ? `(${a.server.name})` : ''}</td>
                  <td className="px-2 py-1">
                    {meta.count>0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs border rounded px-1">{meta.count}</span>
                        {meta.participants.map((p) => (
                          <span key={p.id} className="text-xs border rounded px-1 inline-flex items-center gap-1">
                            {p.tag}{p.server?.name ? ` (${p.server.name})` : ''}
                            {(isOrgAdmin || (lockedAlliance?.id === p.id && isAllianceLeader)) && (
                              <button className="ml-1 text-[10px]" title="Remove" onClick={()=> handleWithdraw(a.id, p.id)}>✕</button>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">None</span>}
                  </td>
                  <td className="px-2 py-1 space-x-1">
                    <button className="px-2 py-1 border rounded text-xs disabled:opacity-50" disabled={!attackerId || !parityOk} onClick={()=> handleInterested(a.id)} title={parityOk? 'Mark interest' : 'Bracket mismatch'}>Interested</button>
                    {(attackerId && (isOrgAdmin || (lockedAlliance?.id === attackerId && isAllianceLeader)) && meta.participants.some(p=> p.id===attackerId)) && (
                      <button className="px-2 py-1 border rounded text-xs" onClick={()=> handleWithdraw(a.id, attackerId)}>Withdraw</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Bracket 2 */}
            <tr className="bg-secondary/10">
              <td className="px-2 py-1 font-medium" colSpan={4}>Bracket 2 (11–20)</td>
            </tr>
            {top20.filter(a => (a.rank_int ?? 0) > 10).map(a => {
              const meta = interest[a.id] || { declId: null, count: 0, participants: [] };
              const b = getBracket(a.rank_int ?? null);
              const parityOk = attackerBracket === b && attackerBracket !== 3;
              return (
                <tr key={a.id} className="border-t">
                  <td className="px-2 py-1">{a.rank_int ?? ''}</td>
                  <td className="px-2 py-1 font-mono">{a.tag} {a.server?.name ? `(${a.server.name})` : ''}</td>
                  <td className="px-2 py-1">
                    {meta.count>0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs border rounded px-1">{meta.count}</span>
                        {meta.participants.map((p) => (
                          <span key={p.id} className="text-xs border rounded px-1 inline-flex items-center gap-1">
                            {p.tag}{p.server?.name ? ` (${p.server.name})` : ''}
                            {(isOrgAdmin || (lockedAlliance?.id === p.id && isAllianceLeader)) && (
                              <button className="ml-1 text-[10px]" title="Remove" onClick={()=> handleWithdraw(a.id, p.id)}>✕</button>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">None</span>}
                  </td>
                  <td className="px-2 py-1 space-x-1">
                    <button className="px-2 py-1 border rounded text-xs disabled:opacity-50" disabled={!attackerId || !parityOk} onClick={()=> handleInterested(a.id)} title={parityOk? 'Mark interest' : 'Bracket mismatch'}>Interested</button>
                    {(attackerId && (isOrgAdmin || (lockedAlliance?.id === attackerId && isAllianceLeader)) && meta.participants.some(p=> p.id===attackerId)) && (
                      <button className="px-2 py-1 border rounded text-xs" onClick={()=> handleWithdraw(a.id, attackerId)}>Withdraw</button>
                    )}
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


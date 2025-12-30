import { useEffect, useMemo, useState } from 'react';
import { listFactions, listAlliances } from '@/services/adminApi';
import { assertBracketParity } from '@/lib/brackets';
import { supabase } from '@/services/supabaseClient';
import { normalizeTeamName } from '@/lib/teams';

export default function DeclarationForm() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [attackerAlliances, setAttackerAlliances] = useState<Array<any>>([]);
  const [targetAlliances, setTargetAlliances] = useState<Array<any>>([]);
  const [attackerId, setAttackerId] = useState('');
  const [factionId, setFactionId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [vis, setVis] = useState<'faction'|'public'>('faction');
  const [maxP, setMaxP] = useState<number | ''>('');
  const [parity, setParity] = useState<string | null>(null);

  useEffect(() => { if (!orgId) return; listFactions(orgId).then(setFactions).catch(()=>{}); }, [orgId]);
  useEffect(() => { if (!orgId) return; listAlliances(orgId).then(setAttackerAlliances).catch(()=>{}); }, [orgId]);
  useEffect(() => { if (!orgId || !factionId) { setTargetAlliances([]); return; } listAlliances(orgId, undefined, factionId).then(setTargetAlliances).catch(()=>{}); }, [orgId, factionId]);

  useEffect(() => {
    const a = attackerAlliances.find((x:any)=> x.id === attackerId)?.rank_int ?? null;
    const d = targetAlliances.find((x:any)=> x.id === targetId)?.rank_int ?? null;
    if (attackerId && targetId) {
      const r = assertBracketParity(a, d);
      setParity(r.ok ? null : (r.reason === 'bracket_locked' ? `Bracket locked (attacker B${r.a}, defender B${r.b})` : `Bracket mismatch (B${r.a} vs B${r.b})`));
    } else setParity(null);
  }, [attackerId, targetId, attackerAlliances, targetAlliances]);

  return (
    <div className="border rounded p-3 space-y-3">
      <h3 className="font-semibold">New Declaration</h3>
      <div className="grid md:grid-cols-2 gap-2">
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={attackerId} onChange={e=> setAttackerId(e.target.value)}>
          <option value="">Attacking alliance…</option>
          {attackerAlliances.map((a:any)=> <option key={a.id} value={a.id}>{a.tag} — {a.name} {a.rank_int? `(B${a.rank_int<=10?1:a.rank_int<=20?2:3})`:''}</option>)}
        </select>
        <div className="flex gap-2">
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={factionId} onChange={e=> setFactionId(e.target.value)}>
            <option value="">Target faction…</option>
            {factions.map(f=> <option key={f.id} value={f.id}>{normalizeTeamName(f.name)}</option>)}
          </select>
          <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={targetId} onChange={e=> setTargetId(e.target.value)} disabled={!factionId}>
            <option value="">Target alliance…</option>
            {targetAlliances.map((a:any)=> <option key={a.id} value={a.id}>{a.tag} — {a.name} {a.rank_int? `(B${a.rank_int<=10?1:a.rank_int<=20?2:3})`:''}</option>)}
          </select>
        </div>
        <input className="border rounded px-2 py-1 text-sm bg-background text-foreground" type="datetime-local" value={start} onChange={e=> setStart(e.target.value)} />
        <input className="border rounded px-2 py-1 text-sm bg-background text-foreground" type="datetime-local" value={end} onChange={e=> setEnd(e.target.value)} />
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={vis} onChange={e=> setVis(e.target.value as any)}>
          <option value="faction">Faction</option>
          <option value="public">Public</option>
        </select>
        <input className="border rounded px-2 py-1 text-sm bg-background text-foreground" type="number" placeholder="Max participants" value={maxP as any} onChange={e=> setMaxP(e.target.value ? parseInt(e.target.value,10) : '')} />
      </div>
      {parity && <div className="text-xs text-yellow-700">{parity}</div>}
      <div className="flex gap-2">
        <button className="px-2 py-1 border rounded text-sm disabled:opacity-50" disabled={!orgId || !attackerId || !targetId || !start || !end} onClick={async ()=>{
          try {
            const { error } = await (supabase as any).from('declarations').insert({
              org_id: orgId,
              season: 'S',
              declaring_alliance_id: attackerId,
              target_alliance_id: targetId,
              start,
              end,
              visibility: vis,
              status: 'proposed',
              max_participants: maxP === '' ? null : maxP,
            });
            if (error) throw error;
            alert('Declaration created');
          } catch (e: any) { alert(e.message || 'Create failed'); }
        }}>Create Proposed</button>
      </div>
    </div>
  );
}


import { BRACKET_RANGES, getBracket, MAX_RANK } from '@/lib/brackets';
import { useEffect, useMemo, useState } from 'react';
import { listAlliances, listFactions, setAllianceRank } from '@/services/adminApi';
import { normalizeTeamName } from '@/lib/teams';

export default function StepTop20Ranker() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [factionId, setFactionId] = useState<string>('');
  const [alliances, setAlliances] = useState<Array<{ id: string; tag: string; name: string; rank_int: number | null }>>([]);

  useEffect(() => { listFactions(orgId).then(f => { setFactions(f); if (f[0]) setFactionId(f[0].id); }).catch(()=>{}); }, [orgId]);
  useEffect(() => { if (!orgId || !factionId) return; listAlliances(orgId, undefined, factionId).then(setAlliances).catch(()=>{}); }, [orgId, factionId]);

  async function refresh() {
    try { const data = await listAlliances(orgId, undefined, factionId); setAlliances(data); } catch {}
  }

  async function handleRankChange(allianceId: string, nextRank: number | null) {
    try {
      if (nextRank != null) {
        // Clear any existing holder of this rank within the same faction to avoid unique constraint errors
        const res = await (window as any).supabase
          ?.from('alliances')
          .select('id')
          .eq('org_id', orgId)
          .eq('faction_id', factionId)
          .eq('rank_int', nextRank)
          .neq('id', allianceId)
          .maybeSingle();
        const existingId = res?.data?.id as string | undefined;
        if (existingId) {
          await setAllianceRank(existingId, orgId, null);
        }
      }
      await setAllianceRank(allianceId, orgId, nextRank);
      await refresh();
    } catch (e) {
      alert('Failed to set rank. Ensure 1-20 and unique within faction.');
      await refresh();
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Step 3 — Top-20 Ranker</h2>
      <p className="text-sm text-muted-foreground">Drag to order 1..20 per faction. Others remain unranked (outside top {MAX_RANK}).</p>
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={factionId} onChange={e=> setFactionId(e.target.value)}>
          {factions.map(f => <option key={f.id} value={f.id}>{normalizeTeamName(f.name)}</option>)}
        </select>
      </div>
      <div className="flex gap-2 text-xs flex-wrap">
        {BRACKET_RANGES.map(({ bracket, start, end }) => (
          <span key={bracket} className="px-2 py-1 rounded border">B{bracket} = {start}–{end}</span>
        ))}
        <span className="px-2 py-1 rounded border">Unranked = null or &gt;{MAX_RANK}</span>
      </div>
      <div className="border rounded p-3 space-y-2">
        <div className="grid md:grid-cols-2 gap-2">
          {alliances.map(a => {
            const b = getBracket(a.rank_int);
            const badgeClass = b == null
              ? 'bg-muted'
              : (b % 2 === 1 ? 'bg-green-600 text-white' : 'bg-blue-600 text-white');
            return (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <div className={`w-8 text-center rounded ${badgeClass}`}>{a.rank_int ?? '-'}</div>
                <div className="w-24 font-mono">{a.tag}</div>
                <div className="flex-1">{a.name}</div>
                <input className="w-16 border rounded px-1 py-0.5 text-xs bg-background text-foreground" placeholder="rank" defaultValue={a.rank_int ?? ''} onBlur={async (e)=>{
                  const v = e.currentTarget.value.trim();
                  const n = v ? parseInt(v, 10) : null;
                  await handleRankChange(a.id, n);
                  e.currentTarget.value = n?.toString() ?? '';
                }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


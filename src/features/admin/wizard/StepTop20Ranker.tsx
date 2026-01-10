import { getBracket, getBracketRanges } from '@/lib/brackets';
import { useEffect, useMemo, useState } from 'react';
import { listAlliances, listFactions, setAllianceRank } from '@/services/adminApi';
import { normalizeTeamName } from '@/lib/teams';
import { readOrgRules } from '@/lib/orgRules';

export default function StepTop20Ranker() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const bracketConfig = useMemo(() => {
    const r = readOrgRules(orgId);
    return { season: r.season ?? null, s4Week: r.s4_week ?? null };
  }, [orgId]);
  const ranges = useMemo(() => getBracketRanges(bracketConfig), [bracketConfig]);
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
      <p className="text-sm text-muted-foreground">Drag to order 1..20 per faction. Others remain unranked (Bracket 3).</p>
      <div className="flex items-center gap-2 text-xs">
        <select className="border rounded px-2 py-1 text-sm bg-background text-foreground" value={factionId} onChange={e=> setFactionId(e.target.value)}>
          {factions.map(f => <option key={f.id} value={f.id}>{normalizeTeamName(f.name)}</option>)}
        </select>
      </div>
      <div className="flex gap-2 text-xs">
        {ranges.map((r, i) => (
          <span key={i} className="px-2 py-1 rounded border">B{i + 1} = {r.start}–{r.end}</span>
        ))}
        <span className="px-2 py-1 rounded border">Unbracketed = null or &gt;20</span>
      </div>
      <div className="border rounded p-3 space-y-2">
        <div className="grid md:grid-cols-2 gap-2">
          {alliances.map(a => {
            const b = getBracket(a.rank_int, bracketConfig);
            return (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <div className={`w-8 text-center rounded ${b!=null?'bg-primary text-primary-foreground':'bg-muted'}`}>{a.rank_int ?? '-'}</div>
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


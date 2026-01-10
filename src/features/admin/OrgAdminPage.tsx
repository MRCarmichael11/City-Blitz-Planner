import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import StepServersAndFactions from './wizard/StepServersAndFactions';
import StepAlliances from './wizard/StepAlliances';
import StepTop20Ranker from './wizard/StepTop20Ranker';
import InviteMaker from './InviteMaker';
import AllianceRepsManager from './AllianceRepsManager';
import { createOrgWithSlug, getOrgById, getOrgBySlug, listUserOrgs, setOrgS4Week } from '@/services/adminApi';
import ToolSwitcher from '@/components/ToolSwitcher';
import { readOrgRules, writeOrgRules } from '@/lib/orgRules';

export default function OrgAdminPage() {
  const params = useParams();
  const urlOrg = params.orgId as string | undefined;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orgId, setOrgId] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const [orgSeason, setOrgSeason] = useState<string>('S');
  const [orgSlug, setOrgSlug] = useState<string>('');
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; season: string; slug?: string }>>([]);
  const [runningSchema, setRunningSchema] = useState(false);
  const [loadedOrgSeason, setLoadedOrgSeason] = useState<string>('');
  const [s4Week, setS4Week] = useState<1 | 2 | 3>(1);

  const orgIdTrim = (orgId || '').trim();
  const orgIdIsUuid = /^[0-9a-fA-F-]{36}$/.test(orgIdTrim);
  const cachedRules = useMemo(() => (orgIdIsUuid ? readOrgRules(orgIdTrim) : {}), [orgIdIsUuid, orgIdTrim]);
  const listSeason = useMemo(() => {
    if (!orgIdIsUuid) return '';
    const found = orgs.find(o => o.id === orgIdTrim);
    return (found?.season || '').toUpperCase();
  }, [orgIdIsUuid, orgIdTrim, orgs]);
  const derivedSeason = (loadedOrgSeason || cachedRules.season || listSeason || '').toUpperCase();

  useEffect(() => {
    const initial = urlOrg || localStorage.getItem('current_org') || '';
    setOrgId(initial);
    if (initial) localStorage.setItem('current_org', initial);
    const savedStep = parseInt(localStorage.getItem('admin_step') || '1', 10);
    if (savedStep === 1 || savedStep === 2 || savedStep === 3) setStep(savedStep as 1|2|3);
    listUserOrgs().then(setOrgs).catch(()=>{});
  }, [urlOrg]);

  useEffect(() => {
    localStorage.setItem('admin_step', String(step));
  }, [step]);

  useEffect(() => {
    (async () => {
      try {
        const id = (orgId || '').trim();
        if (!/^[0-9a-fA-F-]{36}$/.test(id)) return;
        // optimistic: set from cache/list immediately (helps if direct org select is blocked by RLS)
        if (cachedRules?.season) setLoadedOrgSeason(String(cachedRules.season).toUpperCase());
        else if (listSeason) setLoadedOrgSeason(listSeason);
        const wk0 = cachedRules?.s4_week ?? 1;
        setS4Week((wk0 === 2 ? 2 : wk0 === 3 ? 3 : 1) as 1 | 2 | 3);

        const org = await getOrgById(id);
        if (!org) return;
        const season = (org.season || '').toUpperCase();
        setLoadedOrgSeason(season);
        const wk = (cachedRules.s4_week ?? org.s4_week ?? 1);
        setS4Week((wk === 2 ? 2 : wk === 3 ? 3 : 1) as 1 | 2 | 3);
        writeOrgRules(id, { season, s4_week: wk });
      } catch {
        // ignore
      }
    })();
  }, [orgId, cachedRules, listSeason]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between border-b bg-card/60 px-2 py-2 rounded">
        <div className="font-semibold">Org Admin</div>
        <ToolSwitcher />
      </div>
      {orgError && <div className="text-xs text-red-600">{orgError}</div>}
      {/* Schema controls moved to Super Admin */}
      {/* Compact org controls below header for a cleaner look */}
      <div className="border rounded bg-card/60 p-2">
        <div className="text-xs font-medium mb-1">Organization</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input className="border rounded px-2 py-1 bg-background text-foreground w-[200px]" placeholder="Org ID (uuid)" value={orgId} onChange={(e)=> setOrgId(e.target.value)} />
          <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={async ()=>{
            try {
              setOrgError(null);
              const id = orgId.trim();
              if (!/^[0-9a-fA-F-]{36}$/.test(id)) { setOrgError('Enter a valid UUID'); return; }
              const found = await getOrgById(id);
              if (!found) { setOrgError('Org not found'); return; }
              localStorage.setItem('current_org', found.id);
              const season = String(found.season || 'S').toUpperCase();
              setLoadedOrgSeason(season);
              const wk = (found.s4_week ?? 1);
              setS4Week((wk === 2 ? 2 : wk === 3 ? 3 : 1) as 1 | 2 | 3);
              writeOrgRules(found.id, { season, s4_week: wk });
              alert('Org loaded');
            }
            catch (e: any) { setOrgError(e.message || 'Failed to load org'); }
          }}>Load</button>
          <span className="text-muted-foreground">or</span>
          <input className="border rounded px-2 py-1 bg-background text-foreground w-[140px]" placeholder="Slug (e.g., blue3)" value={orgSlug} onChange={(e)=> setOrgSlug(e.target.value)} />
          <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={async ()=>{
            try {
              setOrgError(null);
              const slug = orgSlug.trim();
              if (!slug) { setOrgError('Enter a slug'); return; }
              const found = await getOrgBySlug(slug);
              if (!found) { setOrgError('Slug not found'); return; }
              localStorage.setItem('current_org', found.id);
              setOrgId(found.id);
              const season = String(found.season || 'S').toUpperCase();
              setLoadedOrgSeason(season);
              const wk = (found.s4_week ?? readOrgRules(found.id).s4_week ?? 1);
              setS4Week((wk === 2 ? 2 : wk === 3 ? 3 : 1) as 1 | 2 | 3);
              writeOrgRules(found.id, { season, s4_week: wk });
              alert(`Org loaded: ${(found as any).slug || found.id}`);
            }
            catch (e: any) { setOrgError(e.message || 'Failed to load by slug'); }
          }}>Load by Slug</button>
          <span className="text-muted-foreground">•</span>
          <input className="border rounded px-2 py-1 bg-background text-foreground w-[160px]" placeholder="New org name" value={orgName} onChange={(e)=> setOrgName(e.target.value)} />
          <input className="border rounded px-2 py-1 bg-background text-foreground w-[64px]" placeholder="Season" value={orgSeason} onChange={(e)=> setOrgSeason(e.target.value)} />
          <input className="border rounded px-2 py-1 bg-background text-foreground w-[120px]" placeholder="Slug (optional)" value={orgSlug} onChange={(e)=> setOrgSlug(e.target.value)} />
          <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={async ()=>{
            try { setOrgError(null); const created = await createOrgWithSlug(orgName.trim() || 'Org', orgSeason.trim() || 'S', orgSlug.trim() || undefined); setOrgId(created.id); localStorage.setItem('current_org', created.id); alert(`Org created: ${created.slug || created.id}`); setOrgs(prev=> [{ id: created.id, name: created.name, season: created.season, slug: created.slug }, ...prev]); }
            catch (e: any) { setOrgError(e.message || 'Failed to create org'); }
          }}>Create</button>
        </div>
        {derivedSeason === 'S4' && orgIdIsUuid && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <div className="text-xs font-medium">S4 Bracket Week</div>
            <select
              className="border rounded px-2 py-1 bg-background text-foreground"
              value={s4Week}
              onChange={async (e) => {
                const next = (e.target.value === '2' ? 2 : e.target.value === '3' ? 3 : 1) as 1 | 2 | 3;
                setS4Week(next);
                const id = orgId.trim();
                const res = await setOrgS4Week(id, next);
                if (!res.ok) {
                  // Still apply locally so the admin can immediately use the rule in this browser.
                  writeOrgRules(id, { season: 'S4', s4_week: next });
                  alert('Could not save to server (RLS/schema). Applied locally for this browser.');
                  return;
                }
                writeOrgRules(id, { season: 'S4', s4_week: next });
              }}
            >
              <option value={1}>Week 1 (1–10, 11–20)</option>
              <option value={2}>Week 2 (1–6, 7–12, 13–18, 19–20)</option>
              <option value={3}>Week 3 (1–3, 4–7, 8–11, 12–15, 16–19, 20)</option>
            </select>
            <span className="text-muted-foreground">Affects Strike Planner bracket-matching rules.</span>
          </div>
        )}
      </div>
      {orgs.length > 0 && (
        <div className="border rounded p-2 text-sm">
          <div className="font-medium mb-1">Your Orgs</div>
          <div className="flex flex-wrap gap-2">
            {orgs.map(o => (
              <button key={o.id} className="px-2 py-1 border rounded" onClick={()=>{
                localStorage.setItem('current_org', o.id);
                setOrgId(o.id);
                setLoadedOrgSeason(String(o.season || 'S').toUpperCase());
                const wk = readOrgRules(o.id).s4_week ?? 1;
                setS4Week((wk === 2 ? 2 : wk === 3 ? 3 : 1) as 1 | 2 | 3);
                writeOrgRules(o.id, { season: String(o.season || 'S').toUpperCase(), s4_week: wk });
                alert(`Org loaded: ${o.slug || o.id}`);
              }}>
                {o.slug || o.name} ({o.season})
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="inline-flex rounded-full border overflow-hidden">
        <button className={`px-3 py-1 text-xs ${step===1? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} onClick={()=> setStep(1)}>Servers & Factions</button>
        <button className={`px-3 py-1 text-xs ${step===2? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} onClick={()=> setStep(2)}>Alliances</button>
        <button className={`px-3 py-1 text-xs ${step===3? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} onClick={()=> setStep(3)}>Top-20 Ranker</button>
      </div>
      {step === 1 && <StepServersAndFactions />}
      {step === 2 && <StepAlliances />}
      {step === 3 && <StepTop20Ranker />}
      <div className="grid md:grid-cols-2 gap-4">
        <InviteMaker />
        <AllianceRepsManager />
      </div>
    </div>
  );
}


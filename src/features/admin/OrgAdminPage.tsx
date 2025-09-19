import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import StepServersAndFactions from './wizard/StepServersAndFactions';
import StepAlliances from './wizard/StepAlliances';
import StepTop20Ranker from './wizard/StepTop20Ranker';
import InviteMaker from './InviteMaker';
import AllianceRepsManager from './AllianceRepsManager';
import { createOrgWithSlug, getOrgById, getOrgBySlug, listUserOrgs } from '@/services/adminApi';
import ToolSwitcher from '@/components/ToolSwitcher';

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

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Org Admin</h1>
          <ToolSwitcher />
        </div>
        <div className="flex items-center gap-2">
          <input className="border rounded px-2 py-1 text-sm w-[200px] bg-background text-foreground" placeholder="Org ID (uuid)" value={orgId} onChange={(e)=> setOrgId(e.target.value)} />
          <button className="px-2 py-1 border rounded text-sm" onClick={async ()=>{
            try { setOrgError(null); const id = orgId.trim(); if (!/^[0-9a-fA-F-]{36}$/.test(id)) { setOrgError('Enter a valid UUID'); return; } const found = await getOrgById(id); if (!found) { setOrgError('Org not found'); return; } localStorage.setItem('current_org', found.id); alert('Org loaded'); }
            catch (e: any) { setOrgError(e.message || 'Failed to load org'); }
          }}>Load Org</button>
          <input className="border rounded px-2 py-1 text-sm w-[160px] bg-background text-foreground" placeholder="or Slug (e.g., anubis3)" value={orgSlug} onChange={(e)=> setOrgSlug(e.target.value)} />
          <button className="px-2 py-1 border rounded text-sm" onClick={async ()=>{
            try { setOrgError(null); const slug = orgSlug.trim(); if (!slug) { setOrgError('Enter a slug'); return; } const found = await getOrgBySlug(slug); if (!found) { setOrgError('Slug not found'); return; } localStorage.setItem('current_org', found.id); setOrgId(found.id); alert(`Org loaded: ${found.slug || found.id}`); }
            catch (e: any) { setOrgError(e.message || 'Failed to load by slug'); }
          }}>Load by Slug</button>
          <input className="border rounded px-2 py-1 text-sm w-[200px] bg-background text-foreground" placeholder="New org name" value={orgName} onChange={(e)=> setOrgName(e.target.value)} />
          <input className="border rounded px-2 py-1 text-sm w-[80px] bg-background text-foreground" placeholder="Season" value={orgSeason} onChange={(e)=> setOrgSeason(e.target.value)} />
          <input className="border rounded px-2 py-1 text-sm w-[120px] bg-background text-foreground" placeholder="Slug (optional)" value={orgSlug} onChange={(e)=> setOrgSlug(e.target.value)} />
          <button className="px-2 py-1 border rounded text-sm" onClick={async ()=>{
            try { setOrgError(null); const created = await createOrgWithSlug(orgName.trim() || 'Org', orgSeason.trim() || 'S', orgSlug.trim() || undefined); setOrgId(created.id); localStorage.setItem('current_org', created.id); alert(`Org created: ${created.slug || created.id}`); setOrgs(prev=> [{ id: created.id, name: created.name, season: created.season, slug: created.slug }, ...prev]); }
            catch (e: any) { setOrgError(e.message || 'Failed to create org'); }
          }}>Create Org</button>
        </div>
      </div>
      {orgError && <div className="text-xs text-red-600">{orgError}</div>}
      <div className="text-xs text-muted-foreground">
        DB not initialized? Open Supabase SQL editor and run schema file: <a className="underline" href="/supabase-schema.sql" download>supabase-schema.sql</a>
      </div>
      {orgs.length > 0 && (
        <div className="border rounded p-2 text-sm">
          <div className="font-medium mb-1">Your Orgs</div>
          <div className="flex flex-wrap gap-2">
            {orgs.map(o => (
              <button key={o.id} className="px-2 py-1 border rounded" onClick={()=>{ localStorage.setItem('current_org', o.id); setOrgId(o.id); alert(`Org loaded: ${o.slug || o.id}`); }}>
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


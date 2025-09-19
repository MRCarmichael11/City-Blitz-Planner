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
  const [runningSchema, setRunningSchema] = useState(false);

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
      <div className="flex items-center justify-between border-b bg-card/60 px-2 py-2 rounded">
        <div className="font-semibold">Org Admin</div>
        <ToolSwitcher />
      </div>
      {orgError && <div className="text-xs text-red-600">{orgError}</div>}
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <span>DB not initialized?</span>
        <a className="underline" href="/supabase-schema.sql" download>Download schema</a>
        <span>or</span>
        <button className="px-2 py-1 border rounded disabled:opacity-50" disabled={runningSchema} onClick={async ()=>{
          try {
            setOrgError(null); setRunningSchema(true);
            const resp = await fetch('/api/run-schema', { method: 'POST' });
            const j = await resp.json();
            if (!resp.ok) throw new Error(j?.detail || 'Schema apply failed');
            alert('Schema applied and cache reloaded.');
          } catch (e: any) {
            setOrgError(e.message || 'Failed to apply schema');
          } finally {
            setRunningSchema(false);
          }
        }}>Run schema now</button>
      </div>
      {/* Compact org controls below header for a cleaner look */}
      <div className="border rounded bg-card/60 p-2">
        <div className="text-xs font-medium mb-1">Organization</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input className="border rounded px-2 py-1 bg-background text-foreground w-[200px]" placeholder="Org ID (uuid)" value={orgId} onChange={(e)=> setOrgId(e.target.value)} />
          <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={async ()=>{
            try { setOrgError(null); const id = orgId.trim(); if (!/^[0-9a-fA-F-]{36}$/.test(id)) { setOrgError('Enter a valid UUID'); return; } const found = await getOrgById(id); if (!found) { setOrgError('Org not found'); return; } localStorage.setItem('current_org', found.id); alert('Org loaded'); }
            catch (e: any) { setOrgError(e.message || 'Failed to load org'); }
          }}>Load</button>
          <span className="text-muted-foreground">or</span>
          <input className="border rounded px-2 py-1 bg-background text-foreground w-[140px]" placeholder="Slug (e.g., anubis3)" value={orgSlug} onChange={(e)=> setOrgSlug(e.target.value)} />
          <button className="px-2 py-1 border rounded disabled:opacity-50" onClick={async ()=>{
            try { setOrgError(null); const slug = orgSlug.trim(); if (!slug) { setOrgError('Enter a slug'); return; } const found = await getOrgBySlug(slug); if (!found) { setOrgError('Slug not found'); return; } localStorage.setItem('current_org', found.id); setOrgId(found.id); alert(`Org loaded: ${found.slug || found.id}`); }
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


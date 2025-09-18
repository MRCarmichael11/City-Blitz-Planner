import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import StepServersAndFactions from './wizard/StepServersAndFactions';
import StepAlliances from './wizard/StepAlliances';
import StepTop20Ranker from './wizard/StepTop20Ranker';
import InviteMaker from './InviteMaker';
import AllianceRepsManager from './AllianceRepsManager';
import { createOrg, getOrgById } from '@/services/adminApi';

export default function OrgAdminPage() {
  const params = useParams();
  const urlOrg = params.orgId as string | undefined;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orgId, setOrgId] = useState<string>('');
  const [orgName, setOrgName] = useState<string>('');
  const [orgSeason, setOrgSeason] = useState<string>('S');
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    const initial = urlOrg || localStorage.getItem('current_org') || '';
    setOrgId(initial);
    if (initial) localStorage.setItem('current_org', initial);
  }, [urlOrg]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Org Admin</h1>
        <div className="flex items-center gap-2">
          <input className="border rounded px-2 py-1 text-sm w-[320px] bg-background text-foreground" placeholder="Org ID (uuid)" value={orgId} onChange={(e)=> setOrgId(e.target.value)} />
          <button className="px-2 py-1 border rounded text-sm" onClick={async ()=>{
            try { setOrgError(null); const id = orgId.trim(); if (!/^[0-9a-fA-F-]{36}$/.test(id)) { setOrgError('Enter a valid UUID'); return; } const found = await getOrgById(id); if (!found) { setOrgError('Org not found'); return; } localStorage.setItem('current_org', found.id); alert('Org loaded'); }
            catch (e: any) { setOrgError(e.message || 'Failed to load org'); }
          }}>Load Org</button>
          <input className="border rounded px-2 py-1 text-sm w-[200px] bg-background text-foreground" placeholder="New org name" value={orgName} onChange={(e)=> setOrgName(e.target.value)} />
          <input className="border rounded px-2 py-1 text-sm w-[80px] bg-background text-foreground" placeholder="Season" value={orgSeason} onChange={(e)=> setOrgSeason(e.target.value)} />
          <button className="px-2 py-1 border rounded text-sm" onClick={async ()=>{
            try { setOrgError(null); const created = await createOrg(orgName.trim() || 'Org', orgSeason.trim() || 'S'); setOrgId(created.id); localStorage.setItem('current_org', created.id); alert(`Org created: ${created.id}`); }
            catch (e: any) { setOrgError(e.message || 'Failed to create org'); }
          }}>Create Org</button>
        </div>
      </div>
      {orgError && <div className="text-xs text-red-600">{orgError}</div>}
      <div className="text-xs text-muted-foreground">
        DB not initialized? Open Supabase SQL editor and run schema file: <a className="underline" href="/supabase-schema.sql" download>supabase-schema.sql</a>
      </div>
      <div className="flex gap-2">
        <button className={`px-3 py-1 border rounded ${step===1? 'bg-primary text-primary-foreground':''}`} onClick={()=> setStep(1)}>Servers & Factions</button>
        <button className={`px-3 py-1 border rounded ${step===2? 'bg-primary text-primary-foreground':''}`} onClick={()=> setStep(2)}>Alliances</button>
        <button className={`px-3 py-1 border rounded ${step===3? 'bg-primary text-primary-foreground':''}`} onClick={()=> setStep(3)}>Top-20 Ranker</button>
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


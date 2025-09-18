import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import StepServersAndFactions from './wizard/StepServersAndFactions';
import StepAlliances from './wizard/StepAlliances';
import StepTop20Ranker from './wizard/StepTop20Ranker';
import InviteMaker from './InviteMaker';
import AllianceRepsManager from './AllianceRepsManager';

export default function OrgAdminPage() {
  const params = useParams();
  const urlOrg = params.orgId as string | undefined;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orgId, setOrgId] = useState<string>('');

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
          <input className="border rounded px-2 py-1 text-sm w-[340px]" placeholder="Org ID (uuid)" value={orgId} onChange={(e)=>{ setOrgId(e.target.value); localStorage.setItem('current_org', e.target.value); }} />
        </div>
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


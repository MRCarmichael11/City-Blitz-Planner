import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { acceptInvite } from '@/services/inviteApi';
import ToolSwitcher from '@/components/ToolSwitcher';

export default function InvitePage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<string>('Checking invite…');
  const token = params.get('token') || '';
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      try {
        const res = await acceptInvite(token);
        localStorage.setItem('current_org', res.org_id);
        setStatus(`Joined org as ${res.role}. Redirecting…`);
        setTimeout(() => navigate('/faction-strike-planner'), 1000);
      } catch (e: any) {
        setStatus(e.message || 'Invalid invite');
      }
    })();
  }, [token, navigate]);
  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between border-b bg-card/60 px-2 py-2 rounded">
        <div className="font-semibold">Join Organization</div>
        <ToolSwitcher />
      </div>
      <div className="border rounded p-4 bg-card/60">
        <div className="text-sm">{status}</div>
      </div>
    </div>
  );
}


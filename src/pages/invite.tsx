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
        setTimeout(() => navigate('/faction-strike-planner'), 300);
      } catch (e: any) {
        if ((e?.message || '').toLowerCase().includes('not signed in')) {
          setStatus('Please sign in to accept the invite…');
          // trigger OAuth flow to preserve URL
          const { supabase } = await import('@/services/supabaseClient');
          (supabase as any).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
          return;
        }
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


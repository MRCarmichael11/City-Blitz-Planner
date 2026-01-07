import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { acceptInvite } from '@/services/inviteApi';

function getPendingInvite(): { token: string; next: string } | null {
  try {
    const token = localStorage.getItem('pending_invite_token') || '';
    if (!token) return null;
    const next = localStorage.getItem('pending_invite_next') || '/faction-strike-planner';
    return { token, next };
  } catch {
    return null;
  }
}

function clearPendingInvite() {
  try {
    localStorage.removeItem('pending_invite_token');
    localStorage.removeItem('pending_invite_next');
  } catch { /* ignore */ }
}

/**
 * Handles the case where OAuth redirects to `/` (losing the original `/invite?token=...` URL).
 * If a pending invite token exists in localStorage and the user is now signed in, accept it and navigate.
 */
export default function PendingInviteHandler() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    // Let the dedicated invite page handle itself to avoid double-accept.
    if (pathname.startsWith('/invite')) return;
    const pending = getPendingInvite();
    if (!pending) return;
    if (inFlight.current) return;
    inFlight.current = true;

    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes.user?.id;
        if (!uid) return; // not signed in yet; keep pending

        const res = await acceptInvite(pending.token);
        localStorage.setItem('current_org', res.org_id);
        clearPendingInvite();
        navigate(pending.next, { replace: true });
      } catch (e: unknown) {
        const msg = (e instanceof Error ? e.message : '').toLowerCase();
        if (!msg.includes('not signed in')) {
          // token is invalid/expired/etc; don't keep retrying forever
          clearPendingInvite();
        }
      } finally {
        inFlight.current = false;
      }
    })();
  }, [pathname, navigate]);

  return null;
}


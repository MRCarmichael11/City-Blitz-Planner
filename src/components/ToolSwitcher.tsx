import { Link, useLocation, generatePath } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getMembership, can } from '@/lib/rbac';
import { supabase } from '@/services/supabaseClient';

type Props = {
  orgId?: string | null;
};

function isUuid(v?: string | null): boolean {
  if (!v) return false;
  return /^[0-9a-fA-F-]{36}$/.test(v);
}

export default function ToolSwitcher({ orgId }: Props) {
  const { pathname } = useLocation();
  const isStrike = pathname.startsWith('/faction-strike-planner');
  const isAdmin = pathname.startsWith('/admin');
  const isSuper = pathname.startsWith('/super-admin');
  const tab = isStrike ? 'strike' : isAdmin ? 'admin' : isSuper ? 'super' : 'blitz';

  const saved = typeof window !== 'undefined' ? localStorage.getItem('current_org') : null;
  const resolvedOrg = isUuid(orgId || saved || undefined) ? (orgId || (saved as string)) : null;
  const adminHref = resolvedOrg ? generatePath('/admin/org/:orgId', { orgId: resolvedOrg }) : '/admin/org/new';
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [showSuper, setShowSuper] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        if (!resolvedOrg || !supabase) { setShowAdmin(false); return; }
        const { data: userRes } = await (supabase as any).auth.getUser();
        const uid = userRes?.user?.id;
        const email = userRes?.user?.email as string | undefined;
        if (!uid) { setShowAdmin(false); return; }
        const mem = await getMembership(resolvedOrg, uid);
        setShowAdmin(mem?.role ? can.adminServer(mem.role) : false);
        const superEmails = (import.meta as any)?.env?.VITE_SUPERADMIN_EMAIL as string | undefined;
        if (email && superEmails) {
          const list = superEmails.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          setShowSuper(list.includes(email.toLowerCase()));
        } else {
          setShowSuper(false);
        }
      } catch {
        setShowAdmin(false);
        setShowSuper(false);
      }
    })();
  }, [resolvedOrg]);

  return (
    <div className="inline-flex rounded-full border overflow-hidden">
      <Link to="/" className={`px-3 py-1 text-xs ${tab==='blitz' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>City Blitz</Link>
      <Link to="/faction-strike-planner" className={`px-3 py-1 text-xs ${tab==='strike' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Strike Planner</Link>
      {showAdmin && (
        <Link to={adminHref} className={`px-3 py-1 text-xs ${tab==='admin' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Admin</Link>
      )}
      {showSuper && (
        <Link to="/super-admin" className={`px-3 py-1 text-xs ${tab==='super' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Super Admin</Link>
      )}
    </div>
  );
}


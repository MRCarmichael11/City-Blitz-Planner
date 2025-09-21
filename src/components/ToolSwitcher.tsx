import { Link, useLocation, generatePath } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getMembership, can } from '@/lib/rbac';
import { supabase } from '@/services/supabaseClient';
import { useI18n } from '@/i18n';

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
  const { lang, setLang, langs } = useI18n();
  const [bootstrappedOrgId, setBootstrappedOrgId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!supabase) { setShowAdmin(false); setShowSuper(false); return; }
        const { data: userRes } = await (supabase as any).auth.getUser();
        const uid = userRes?.user?.id;
        const email = userRes?.user?.email as string | undefined;
        if (!uid) { setShowAdmin(false); setShowSuper(false); return; }

        // If no org in context, auto-select the user's most recent org membership
        if (!resolvedOrg) {
          const { data: memberships } = await (supabase as any)
            .from('org_memberships')
            .select('org_id,role,created_at')
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(1);
          const first = memberships && memberships[0];
          if (first?.org_id) {
            localStorage.setItem('current_org', first.org_id);
            setBootstrappedOrgId(first.org_id);
            setShowAdmin(can.adminServer(first.role));
          } else {
            setShowAdmin(false);
          }
        } else {
          const mem = await getMembership(resolvedOrg, uid);
          setShowAdmin(mem?.role ? can.adminServer(mem.role) : false);
        }
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
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-full border overflow-hidden">
        <Link to="/" className={`px-3 py-1 text-xs ${tab==='blitz' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>City Blitz</Link>
        <Link to="/faction-strike-planner" className={`px-3 py-1 text-xs ${tab==='strike' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Strike Planner</Link>
        {showAdmin && (
          <Link to={(bootstrappedOrgId ? generatePath('/admin/org/:orgId', { orgId: bootstrappedOrgId }) : adminHref)} className={`px-3 py-1 text-xs ${tab==='admin' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Admin</Link>
        )}
        {showSuper && (
          <Link to="/super-admin" className={`px-3 py-1 text-xs ${tab==='super' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Super Admin</Link>
        )}
      </div>
      <select className="border rounded px-2 py-1 text-xs bg-background text-foreground" value={lang} onChange={(e)=> setLang(e.target.value as any)}>
        {langs.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </div>
  );
}


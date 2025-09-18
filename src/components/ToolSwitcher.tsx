import { Link, useLocation, generatePath } from 'react-router-dom';

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
  const tab = isStrike ? 'strike' : isAdmin ? 'admin' : 'blitz';

  const saved = typeof window !== 'undefined' ? localStorage.getItem('current_org') : null;
  const resolvedOrg = isUuid(orgId || saved || undefined) ? (orgId || (saved as string)) : null;
  const adminHref = resolvedOrg ? generatePath('/admin/org/:orgId', { orgId: resolvedOrg }) : '/admin/org/new';

  return (
    <div className="inline-flex rounded-full border overflow-hidden">
      <Link to="/" className={`px-3 py-1 text-xs ${tab==='blitz' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>City Blitz</Link>
      <Link to="/faction-strike-planner" className={`px-3 py-1 text-xs ${tab==='strike' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Strike Planner</Link>
      <Link to={adminHref} className={`px-3 py-1 text-xs ${tab==='admin' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} title={orgId ? '' : 'Replace ORG_ID in URL'}>Admin</Link>
    </div>
  );
}


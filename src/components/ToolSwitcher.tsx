import { Link, useLocation, generatePath } from 'react-router-dom';

type Props = {
  orgId?: string | null;
};

export default function ToolSwitcher({ orgId }: Props) {
  const { pathname } = useLocation();
  const isStrike = pathname.startsWith('/faction-strike-planner');
  const isAdmin = pathname.startsWith('/admin');
  const tab = isStrike ? 'strike' : isAdmin ? 'admin' : 'blitz';

  const adminHref = orgId ? generatePath('/admin/org/:orgId', { orgId }) : '/admin/org/ORG_ID';

  return (
    <div className="inline-flex rounded-full border overflow-hidden">
      <Link to="/" className={`px-3 py-1 text-xs ${tab==='blitz' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>City Blitz</Link>
      <Link to="/faction-strike-planner" className={`px-3 py-1 text-xs ${tab==='strike' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Strike Planner</Link>
      <Link to={adminHref} className={`px-3 py-1 text-xs ${tab==='admin' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} title={orgId ? '' : 'Replace ORG_ID in URL'}>Admin</Link>
    </div>
  );
}


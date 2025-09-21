import ToolSwitcher from '@/components/ToolSwitcher';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/services/supabaseClient';

export default function SuperAdminPage() {
  const [allowed, setAllowed] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        if (!supabase) { setAllowed(false); return; }
        const { data: userRes } = await (supabase as any).auth.getUser();
        const email = userRes?.user?.email as string | undefined;
        const env = (import.meta as any)?.env?.VITE_SUPERADMIN_EMAIL as string | undefined;
        if (!email || !env) { setAllowed(false); return; }
        const list = env.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        setAllowed(list.includes(email.toLowerCase()));
      } catch {
        setAllowed(false);
      }
    })();
  }, []);

  if (!allowed) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Super Admin</h1>
          <ToolSwitcher />
        </div>
        <div className="mt-4 text-sm text-red-600">Access denied.</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Super Admin</h1>
        <ToolSwitcher />
      </div>

      <div className="border rounded p-3 space-y-2">
        <div className="font-medium text-sm">Database Schema</div>
        <div className="text-xs text-muted-foreground">Run or download the Supabase schema. Use carefully.</div>
        <div className="flex items-center gap-2 text-xs">
          <a className="px-2 py-1 border rounded" href="/supabase-schema.sql" download>Download schema</a>
          <button className="px-2 py-1 border rounded disabled:opacity-50" disabled={busy} onClick={async ()=>{
            try {
              setMsg(null); setBusy(true);
              const resp = await fetch('/api/run-schema', { method: 'POST' });
              const j = await resp.json();
              if (!resp.ok) throw new Error(j?.detail || 'Schema apply failed');
              setMsg('Schema applied and cache reloaded.');
            } catch (e: any) {
              setMsg(e?.message || 'Failed to apply schema');
            } finally {
              setBusy(false);
            }
          }}>Run schema now</button>
        </div>
        {msg && <div className="text-xs">{msg}</div>}
      </div>
    </div>
  );
}
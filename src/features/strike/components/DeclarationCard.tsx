import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import LockModal from './LockModal';

type Row = { id: string; declaring_alliance_id: string; target_alliance_id: string; start: string; end: string; status: string; locked_bracket_attacker?: number | null; locked_bracket_target?: number | null };

export default function DeclarationCard() {
  const orgId = useMemo(() => localStorage.getItem('current_org') || '', []);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!orgId) return;
    (supabase as any).from('declarations').select('*').eq('org_id', orgId).order('start', { ascending: true }).then(({ data }: any) => setRows(data || [])).catch(()=>{});
  }, [orgId]);

  return (
    <div className="grid gap-2">
      {rows.map(r => (
        <div key={r.id} className="border rounded p-3">
          <div className="font-medium">{r.declaring_alliance_id} → {r.target_alliance_id}</div>
          <div className="text-xs text-muted-foreground">{new Date(r.start).toLocaleString()} – {new Date(r.end).toLocaleString()} • {r.status}</div>
          {r.status === 'locked' && (
            <div className="text-xs">Locked B{r.locked_bracket_attacker}↔B{r.locked_bracket_target}</div>
          )}
          <div className="mt-2">
            <LockModal />
          </div>
        </div>
      ))}
    </div>
  );
}


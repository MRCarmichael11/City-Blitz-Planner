import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { can, getMembership } from '@/lib/rbac';
import { assertBracketParity } from '@/lib/brackets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId, id } = req.query as { orgId: string; id: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem || !can.lockDecl(mem.role)) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'PUT') return res.status(405).end();

  // Load declaration with alliances and ranks
  const { data: decl, error: e0 } = await supabase!.from('declarations').select('*').eq('org_id', orgId).eq('id', id).single();
  if (e0 || !decl) return res.status(404).json({ error: 'not_found' });
  const { data: atk, error: e1 } = await supabase!.from('alliances').select('rank_int').eq('org_id', orgId).eq('id', decl.declaring_alliance_id).single();
  const { data: def, error: e2 } = await supabase!.from('alliances').select('rank_int').eq('org_id', orgId).eq('id', decl.target_alliance_id).single();
  if (e1 || e2) return res.status(400).json({ error: 'invalid_alliance' });
  const parity = assertBracketParity(atk?.rank_int ?? null, def?.rank_int ?? null);
  if (!parity.ok) return res.status(409).json({ error: parity.reason, a: parity.a, b: parity.b });

  // Attempt lock; rely on DB constraints for first-lock-wins
  const update = {
    status: 'locked',
    locked_bracket_attacker: parity.a,
    locked_bracket_target: parity.b,
  };
  const { error } = await supabase!.from('declarations').update(update).eq('org_id', orgId).eq('id', id);
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'lock_conflict' });
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}


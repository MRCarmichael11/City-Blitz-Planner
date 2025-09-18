import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { can, getMembership } from '@/lib/rbac';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId, allianceId } = req.query as { orgId: string; allianceId: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem || !can.manageFaction(mem.role)) return res.status(403).json({ error: 'forbidden' });

  if (req.method !== 'PUT') return res.status(405).end();
  const body = req.body as { rank_int: number | null };
  if (body.rank_int != null && (body.rank_int < 1 || body.rank_int > 20)) return res.status(400).json({ error: 'rank_out_of_range' });
  const { error } = await supabase!.from('alliances').update({ rank_int: body.rank_int }).eq('org_id', orgId).eq('id', allianceId);
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'rank_conflict' });
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}


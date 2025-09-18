import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { can, getMembership } from '@/lib/rbac';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId, id } = req.query as { orgId: string; id: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem || !can.rsvp(mem.role)) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body as { alliance_id: string };
  const { error } = await supabase!.from('declaration_participants').insert({ declaration_id: id, alliance_id: body.alliance_id, user_id: userId });
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'duplicate' });
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ ok: true });
}


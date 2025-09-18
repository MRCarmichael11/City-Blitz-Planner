import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { can, getMembership } from '@/lib/rbac';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId, id } = req.query as { orgId: string; id: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem || !can.resolve(mem.role)) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'PUT') return res.status(405).end();

  const { error } = await supabase!.from('declarations').update({ status: 'resolved' }).eq('org_id', orgId).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}


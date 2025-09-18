import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { can, getMembership } from '@/lib/rbac';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId } = req.query as { orgId: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem || !can.adminServer(mem.role)) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const { data, error } = await supabase!.from('servers').select('*').eq('org_id', orgId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === 'POST') {
    const body = req.body as { name: string };
    const { data, error } = await supabase!.from('servers').insert({ org_id: orgId, name: body.name }).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }
  return res.status(405).end();
}


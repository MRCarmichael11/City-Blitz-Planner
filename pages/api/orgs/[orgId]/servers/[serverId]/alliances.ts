import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { can, getMembership } from '@/lib/rbac';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId, serverId } = req.query as { orgId: string; serverId: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem || !can.adminServer(mem.role)) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const { data, error } = await supabase!.from('alliances').select('*').eq('org_id', orgId).eq('server_id', serverId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === 'POST') {
    const body = req.body as { faction_id: string; tag: string; name: string };
    const { data, error } = await supabase!.from('alliances').insert({ org_id: orgId, server_id: serverId, faction_id: body.faction_id, tag: body.tag, name: body.name }).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }
  return res.status(405).end();
}


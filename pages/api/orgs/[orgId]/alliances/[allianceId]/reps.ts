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

  if (req.method === 'GET') {
    const { data, error } = await supabase!.from('alliance_reps').select('*').eq('org_id', orgId).eq('alliance_id', allianceId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === 'POST') {
    const body = req.body as { user_id: string; role: 'alliance_leader'|'member'|'viewer' };
    const { error } = await supabase!.from('alliance_reps').upsert({ org_id: orgId, alliance_id: allianceId, user_id: body.user_id, role: body.role }, { onConflict: 'org_id,alliance_id,user_id' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }
  return res.status(405).end();
}


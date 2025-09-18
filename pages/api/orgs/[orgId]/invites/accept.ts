import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { parseInviteToken } from '@/lib/invites';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId } = req.query as { orgId: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();
  const token = (req.query.token as string) || '';
  const secret = process.env.INVITE_SECRET || 'dev-secret';
  const payload = parseInviteToken(token, secret);
  if (!payload || payload.orgId !== orgId) return res.status(400).json({ error: 'invalid_token' });
  const { error } = await supabase!.from('org_memberships').upsert({ org_id: orgId, user_id: userId, role: payload.role }, { onConflict: 'org_id,user_id' });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}


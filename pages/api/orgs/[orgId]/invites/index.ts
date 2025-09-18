import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/db';
import { can, getMembership } from '@/lib/rbac';
import { createInviteURL } from '@/lib/invites';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId } = req.query as { orgId: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem || !can.adminServer(mem.role)) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body as { role: string };
  const secret = process.env.INVITE_SECRET || 'dev-secret';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:8080/';
  const url = createInviteURL(baseUrl, orgId, body.role, secret);
  return res.status(201).json({ url });
}


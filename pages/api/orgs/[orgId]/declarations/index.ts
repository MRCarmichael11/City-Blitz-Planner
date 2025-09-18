import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/services/supabaseClient';
import { getSession } from '@/lib/db';
import { can, canAuthorForAlliance, getMembership } from '@/lib/rbac';
import { assertBracketParity } from '@/lib/brackets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { orgId } = req.query as { orgId: string };
  const { userId } = await getSession();
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const mem = await getMembership(orgId, userId);
  if (!mem) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const { status, faction, bracket, server } = req.query as Record<string, string | undefined>;
    let query = supabase!.from('declarations').select('*').eq('org_id', orgId);
    if (status) query = query.eq('status', status);
    // Optional filters can be implemented via joins if needed
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    if (!can.createDecl(mem.role)) return res.status(403).json({ error: 'forbidden' });
    const body = req.body as { declaringAllianceId: string; targetAllianceId: string; start: string; end: string; visibility: 'faction'|'public'; maxParticipants?: number; notes?: string; season?: string };
    const authorOk = await canAuthorForAlliance(mem.role, userId, orgId, body.declaringAllianceId);
    if (!authorOk) return res.status(403).json({ error: 'not_author' });

    const { data: attacker, error: e1 } = await supabase!.from('alliances').select('rank_int').eq('org_id', orgId).eq('id', body.declaringAllianceId).single();
    if (e1) return res.status(400).json({ error: 'invalid_attacker' });
    const { data: defender, error: e2 } = await supabase!.from('alliances').select('rank_int').eq('org_id', orgId).eq('id', body.targetAllianceId).single();
    if (e2) return res.status(400).json({ error: 'invalid_target' });
    const parity = assertBracketParity(attacker?.rank_int ?? null, defender?.rank_int ?? null);
    const advisory = parity.ok ? null : { warning: parity };

    const insert = {
      org_id: orgId,
      season: body.season ?? 'S',
      declaring_alliance_id: body.declaringAllianceId,
      target_alliance_id: body.targetAllianceId,
      start: body.start,
      end: body.end,
      visibility: body.visibility ?? 'faction',
      status: 'proposed',
      max_participants: body.maxParticipants ?? null,
      notes: body.notes ?? null,
      created_by: userId,
    };
    const { data, error } = await supabase!.from('declarations').insert(insert).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ...data, advisory });
  }

  return res.status(405).end();
}


import { supabase } from '@/services/supabaseClient';
import { assertBracketParity } from '@/lib/brackets';

export type Declaration = {
  id: string;
  org_id: string;
  declaring_alliance_id: string;
  target_alliance_id: string;
  start: string;
  end: string;
  visibility: 'faction'|'public';
  status: 'proposed'|'locked'|'resolved'|'cancelled';
  max_participants: number | null;
  locked_bracket_attacker?: number | null;
  locked_bracket_target?: number | null;
};

export async function listDeclarations(orgId: string, filters?: { status?: string; factionId?: string; bracket?: number }): Promise<Declaration[]> {
  let q = (supabase as any).from('declarations').select('*').eq('org_id', orgId);
  if (filters?.status) q = q.eq('status', filters.status);
  const { data, error } = await q.order('start', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createDeclaration(input: Omit<Declaration, 'id'|'status'|'org_id'> & { org_id: string }): Promise<void> {
  const { error } = await (supabase as any).from('declarations').insert({
    org_id: input.org_id,
    declaring_alliance_id: input.declaring_alliance_id,
    target_alliance_id: input.target_alliance_id,
    start: input.start,
    end: input.end,
    visibility: input.visibility,
    status: 'proposed',
    max_participants: input.max_participants ?? null,
  });
  if (error) throw error;
}

export async function lockDeclaration(orgId: string, declarationId: string): Promise<{ ok: true } | { ok: false; error: 'lock_conflict'|'bracket_mismatch'|'bracket_locked'; a?: number | null; b?: number | null }>{
  // Load attacker/defender ranks
  const { data: decl, error: e0 } = await (supabase as any).from('declarations').select('*').eq('org_id', orgId).eq('id', declarationId).single();
  if (e0 || !decl) throw e0 || new Error('not_found');
  const { data: atk } = await (supabase as any).from('alliances').select('rank_int').eq('org_id', orgId).eq('id', decl.declaring_alliance_id).single();
  const { data: def } = await (supabase as any).from('alliances').select('rank_int').eq('org_id', orgId).eq('id', decl.target_alliance_id).single();
  const parity = assertBracketParity(atk?.rank_int ?? null, def?.rank_int ?? null);
  if (!parity.ok) return { ok: false, error: parity.reason, a: parity.a, b: parity.b };
  const { error } = await (supabase as any).from('declarations').update({ status: 'locked', locked_bracket_attacker: parity.a, locked_bracket_target: parity.b }).eq('org_id', orgId).eq('id', declarationId);
  if (error) {
    const msg: string = (error.message || '').toLowerCase();
    if (msg.includes('ux_locked')) return { ok: false, error: 'lock_conflict' } as const;
    return { ok: false, error: 'lock_conflict' } as const;
  }
  return { ok: true } as const;
}

export async function rsvp(orgId: string, declarationId: string, allianceId: string, userId?: string | null): Promise<void> {
  const { error } = await (supabase as any).from('declaration_participants').insert({ declaration_id: declarationId, alliance_id: allianceId, user_id: userId ?? null });
  if (error) throw error;
}

export async function cancelDeclaration(orgId: string, declarationId: string): Promise<void> {
  const { error } = await (supabase as any).from('declarations').update({ status: 'cancelled' }).eq('org_id', orgId).eq('id', declarationId);
  if (error) throw error;
}

export async function resolveDeclaration(orgId: string, declarationId: string): Promise<void> {
  const { error } = await (supabase as any).from('declarations').update({ status: 'resolved' }).eq('org_id', orgId).eq('id', declarationId);
  if (error) throw error;
}


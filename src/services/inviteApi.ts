import { supabase } from '@/services/supabaseClient';

export type InviteRow = { id: string; org_id: string; role: string; token: string; expires_at: string };

export async function createInvite(orgId: string, role: string, ttlHours = 48): Promise<InviteRow> {
  const token = crypto.randomUUID();
  const expires_at = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  const { data, error } = await (supabase as any).from('invites').insert({ org_id: orgId, role, token, expires_at }).select('*').single();
  if (error) throw error;
  return data as InviteRow;
}

export async function listInvites(orgId: string): Promise<InviteRow[]> {
  const { data, error } = await (supabase as any).from('invites').select('*').eq('org_id', orgId).order('expires_at', { ascending: false });
  if (error) throw error;
  return (data || []) as InviteRow[];
}

export async function acceptInvite(token: string, currentUserId: string): Promise<{ ok: boolean; orgId?: string; role?: string }>{
  const { data, error } = await (supabase as any).from('invites').select('*').eq('token', token).maybeSingle();
  if (error || !data) return { ok: false };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false };
  const { error: e2 } = await (supabase as any).from('org_memberships').upsert({ org_id: data.org_id, user_id: currentUserId, role: data.role }, { onConflict: 'org_id,user_id' });
  if (e2) return { ok: false };
  return { ok: true, orgId: data.org_id, role: data.role };
}


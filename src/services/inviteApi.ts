import { supabase } from '@/services/supabaseClient';

export async function createInvite(orgId: string, role: string, allianceId?: string) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const expires_at = new Date(Date.now() + 1000*60*60*24*7).toISOString();
  const { data, error } = await (supabase as any)
    .from('invites')
    .insert({ org_id: orgId, role, token, expires_at, alliance_id: allianceId ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as { id: string; token: string; role: string; expires_at: string };
}

export async function listInvites(orgId: string) {
  const { data, error } = await (supabase as any)
    .from('invites')
    .select('id,role,expires_at')
    .eq('org_id', orgId)
    .order('expires_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function acceptInvite(token: string) {
  const { data: inv, error } = await (supabase as any)
    .from('invites')
    .select('id,org_id,role,expires_at,alliance_id,consumed_at')
    .eq('token', token)
    .maybeSingle();
  if (error || !inv) throw new Error('Invalid invite');
  if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error('Invite expired');
  if (inv.consumed_at) throw new Error('Invite already used');
  const { data: userRes } = await (supabase as any).auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) throw new Error('Not signed in');
  const { error: upErr } = await (supabase as any)
    .from('org_memberships')
    .upsert({ org_id: inv.org_id, user_id: uid, role: inv.role }, { onConflict: 'org_id,user_id' });
  if (upErr) throw upErr;
  // If invite targets an alliance, map as rep with role
  if (inv.alliance_id) {
    const repRole = inv.role === 'alliance_leader' ? 'alliance_leader' : (inv.role === 'member' ? 'member' : 'viewer');
    await (supabase as any)
      .from('alliance_reps')
      .upsert({ org_id: inv.org_id, alliance_id: inv.alliance_id, user_id: uid, role: repRole }, { onConflict: 'org_id,alliance_id,user_id' });
  }
  // Mark as consumed to enforce one-time use
  await (supabase as any).from('invites').update({ consumed_at: new Date().toISOString() }).eq('id', inv.id);
  return { org_id: inv.org_id, role: inv.role };
}


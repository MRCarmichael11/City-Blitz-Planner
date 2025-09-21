import { supabase } from '@/services/supabaseClient';

export async function createInvite(orgId: string, role: string, allianceId?: string) {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const expires_at = new Date(Date.now() + 1000*60*60*24*7).toISOString();
  const { data, error } = await (supabase as any)
    .from('invites')
    .insert({ org_id: orgId, role, token, expires_at, alliance_id: allianceId ?? null, is_broadcast: false })
    .select('*')
    .single();
  if (error) throw error;
  return data as { id: string; token: string; role: string; expires_at: string };
}

export async function listInvites(orgId: string) {
  const { data, error } = await (supabase as any)
    .from('invites')
    .select('id,role,expires_at,alliance_id,alliances(tag),is_broadcast,max_uses,use_count,revoked_at')
    .eq('org_id', orgId)
    .order('expires_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function acceptInvite(token: string) {
  const { data: inv, error } = await (supabase as any)
    .from('invites')
    .select('id,org_id,role,expires_at,alliance_id,consumed_at,is_broadcast,max_uses,use_count,revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (error || !inv) throw new Error('Invalid invite');
  if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error('Invite expired');
  if (inv.revoked_at) throw new Error('Invite revoked');
  if (!inv.is_broadcast) {
    if (inv.consumed_at) throw new Error('Invite already used');
  } else {
    if (inv.max_uses != null && inv.use_count >= inv.max_uses) throw new Error('Invite exhausted');
  }
  const { data: userRes } = await (supabase as any).auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) throw new Error('Not signed in');
  // Do not downgrade existing membership role
  const roleRank: Record<string, number> = {
    org_admin: 6,
    server_admin: 5,
    faction_leader: 4,
    alliance_leader: 3,
    member: 2,
    viewer: 1,
  };
  const { data: existingMem } = await (supabase as any)
    .from('org_memberships')
    .select('role')
    .eq('org_id', inv.org_id)
    .eq('user_id', uid)
    .maybeSingle();
  const existingRole: string | null = existingMem?.role ?? null;
  const incomingRole: string = inv.role;
  const finalRole = existingRole && roleRank[existingRole] >= roleRank[incomingRole] ? existingRole : incomingRole;
  const { error: upErr } = await (supabase as any)
    .from('org_memberships')
    .upsert({ org_id: inv.org_id, user_id: uid, role: finalRole }, { onConflict: 'org_id,user_id' });
  if (upErr) throw upErr;
  // If invite targets an alliance, map as rep with role
  if (inv.alliance_id) {
    const repRole = inv.role === 'alliance_leader' ? 'alliance_leader' : (inv.role === 'member' ? 'member' : 'viewer');
    // Do not downgrade existing rep role
    const repRank: Record<string, number> = { alliance_leader: 3, member: 2, viewer: 1 } as const;
    const { data: existingRep } = await (supabase as any)
      .from('alliance_reps')
      .select('role')
      .eq('org_id', inv.org_id)
      .eq('alliance_id', inv.alliance_id)
      .eq('user_id', uid)
      .maybeSingle();
    const currentRepRole: string | null = existingRep?.role ?? null;
    const finalRepRole = currentRepRole && repRank[currentRepRole] >= repRank[repRole] ? currentRepRole : repRole;
    await (supabase as any)
      .from('alliance_reps')
      .upsert({ org_id: inv.org_id, alliance_id: inv.alliance_id, user_id: uid, role: finalRepRole }, { onConflict: 'org_id,alliance_id,user_id' });
  }
  if (!inv.is_broadcast) {
    await (supabase as any).from('invites').update({ consumed_at: new Date().toISOString() }).eq('id', inv.id);
  } else {
    // increment use_count with simple update; in heavy contention you could add a where to guard
    await (supabase as any).from('invites').update({ use_count: (inv.use_count || 0) + 1 }).eq('id', inv.id);
  }
  return { org_id: inv.org_id, role: inv.role };
}

export async function createBroadcastInvite(orgId: string, days: number, maxUses: number) {
  // Revoke existing active broadcast for this org
  await (supabase as any)
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('is_broadcast', true)
    .is('revoked_at', null);
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const expires_at = new Date(Date.now() + 1000*60*60*24*days).toISOString();
  const { data, error } = await (supabase as any)
    .from('invites')
    .insert({ org_id: orgId, role: 'viewer', token, expires_at, is_broadcast: true, max_uses: maxUses, use_count: 0 })
    .select('*')
    .single();
  if (error) throw error;
  return data as { id: string; token: string; role: string; expires_at: string; max_uses: number; use_count: number };
}

export async function revokeBroadcastInvite(orgId: string) {
  const { error } = await (supabase as any)
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('is_broadcast', true)
    .is('revoked_at', null);
  if (error) throw error;
}

export async function getActiveBroadcastInvite(orgId: string) {
  const { data, error } = await (supabase as any)
    .from('invites')
    .select('id,role,expires_at,is_broadcast,max_uses,use_count,revoked_at,token')
    .eq('org_id', orgId)
    .eq('is_broadcast', true)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}


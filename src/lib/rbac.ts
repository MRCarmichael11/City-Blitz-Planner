import { supabase } from '@/services/supabaseClient';

export type Role = 'org_admin' | 'server_admin' | 'faction_leader' | 'alliance_leader' | 'member' | 'viewer';

export async function getMembership(orgId: string, userId: string): Promise<{ role: Role } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  return { role: data.role as Role };
}

export const can = {
  adminOrg: (role: Role) => role === 'org_admin',
  adminServer: (role: Role) => role === 'org_admin' || role === 'server_admin',
  manageFaction: (role: Role) => ['org_admin', 'server_admin', 'faction_leader'].includes(role),
  createDecl: (role: Role) => ['org_admin', 'server_admin', 'faction_leader', 'alliance_leader'].includes(role),
  lockDecl: (role: Role) => ['org_admin', 'server_admin', 'faction_leader', 'alliance_leader'].includes(role),
  cancelDecl: (role: Role) => ['org_admin', 'server_admin', 'faction_leader', 'alliance_leader'].includes(role),
  resolve: (role: Role) => role === 'org_admin',
  rsvp: (role: Role) => ['org_admin', 'server_admin', 'faction_leader', 'alliance_leader', 'member'].includes(role),
} as const;

export async function canAuthorForAlliance(orgRole: Role, userId: string, orgId: string, allianceId: string): Promise<boolean> {
  if (['org_admin', 'server_admin', 'faction_leader'].includes(orgRole)) return true;
  if (!supabase) return false;
  const { data } = await supabase
    .from('alliance_reps')
    .select('role')
    .eq('org_id', orgId)
    .eq('alliance_id', allianceId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'alliance_leader';
}


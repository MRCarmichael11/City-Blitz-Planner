import { supabase } from '@/services/supabaseClient';

export type Org = { id: string; name: string; season: string };
export type Server = { id: string; org_id: string; name: string };
export type Faction = { id: string; org_id: string; name: string; color?: string | null };
export type ServerFactionMap = { id: string; org_id: string; server_id: string; faction_id: string };
export type Alliance = { id: string; org_id: string; server_id: string; faction_id: string; tag: string; name: string; rank_int: number | null };
export type AllianceRep = { id: string; org_id: string; alliance_id: string; user_id: string; role: 'alliance_leader'|'member'|'viewer' };

export async function listServers(orgId: string): Promise<Server[]> {
  const { data, error } = await (supabase as any).from('servers').select('*').eq('org_id', orgId).order('name');
  if (error) throw error;
  return data as Server[];
}

export async function createOrg(name: string, season: string): Promise<Org> {
  const { data, error } = await (supabase as any).from('orgs').insert({ name, season, created_by: (await (supabase as any).auth.getUser()).data.user?.id || null }).select('*').single();
  if (error) throw error;
  return data as Org;
}

export async function getOrgById(orgId: string): Promise<Org | null> {
  const { data, error } = await (supabase as any).from('orgs').select('*').eq('id', orgId).maybeSingle();
  if (error) throw error;
  return data as Org | null;
}

export async function createServer(orgId: string, name: string): Promise<Server> {
  const { data, error } = await (supabase as any).from('servers').insert({ org_id: orgId, name }).select('*').single();
  if (error) throw error;
  return data as Server;
}

export async function listFactions(orgId: string): Promise<Faction[]> {
  const { data, error } = await (supabase as any).from('factions').select('*').eq('org_id', orgId).order('name');
  if (error) throw error;
  return data as Faction[];
}

export async function createFaction(orgId: string, name: string, color?: string): Promise<Faction> {
  const { data, error } = await (supabase as any).from('factions').insert({ org_id: orgId, name, color: color ?? null }).select('*').single();
  if (error) throw error;
  return data as Faction;
}

export async function getServerFaction(orgId: string, serverId: string): Promise<ServerFactionMap | null> {
  const { data, error } = await (supabase as any).from('server_faction_map').select('*').eq('org_id', orgId).eq('server_id', serverId).maybeSingle();
  if (error) throw error;
  return data as ServerFactionMap | null;
}

export async function mapServerToFaction(orgId: string, serverId: string, factionId: string): Promise<ServerFactionMap> {
  const { data, error } = await (supabase as any)
    .from('server_faction_map')
    .upsert({ org_id: orgId, server_id: serverId, faction_id: factionId }, { onConflict: 'org_id,server_id' })
    .select('*').single();
  if (error) throw error;
  return data as ServerFactionMap;
}

export async function listAlliances(orgId: string, serverId?: string, factionId?: string): Promise<Alliance[]> {
  let query = (supabase as any).from('alliances').select('*').eq('org_id', orgId);
  if (serverId) query = query.eq('server_id', serverId);
  if (factionId) query = query.eq('faction_id', factionId);
  const { data, error } = await query.order('rank_int', { nullsFirst: true }).order('name');
  if (error) throw error;
  return data as Alliance[];
}

export async function createAlliance(params: { orgId: string; serverId: string; factionId: string; tag: string; name: string }): Promise<Alliance> {
  const { data, error } = await (supabase as any).from('alliances').insert({ org_id: params.orgId, server_id: params.serverId, faction_id: params.factionId, tag: params.tag, name: params.name }).select('*').single();
  if (error) throw error;
  return data as Alliance;
}

export async function setAllianceRank(allianceId: string, orgId: string, rank: number | null): Promise<void> {
  if (rank != null && (rank < 1 || rank > 20)) throw new Error('rank_out_of_range');
  const { error } = await (supabase as any).from('alliances').update({ rank_int: rank }).eq('id', allianceId).eq('org_id', orgId);
  if (error) throw error;
}

export async function listReps(orgId: string, allianceId: string): Promise<AllianceRep[]> {
  const { data, error } = await (supabase as any).from('alliance_reps').select('*').eq('org_id', orgId).eq('alliance_id', allianceId).order('role');
  if (error) throw error;
  return data as AllianceRep[];
}

export async function upsertRep(orgId: string, allianceId: string, userId: string, role: AllianceRep['role']): Promise<void> {
  const { error } = await (supabase as any).from('alliance_reps').upsert({ org_id: orgId, alliance_id: allianceId, user_id: userId, role }, { onConflict: 'org_id,alliance_id,user_id' });
  if (error) throw error;
}

export async function removeRep(orgId: string, allianceId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any).from('alliance_reps').delete().eq('org_id', orgId).eq('alliance_id', allianceId).eq('user_id', userId);
  if (error) throw error;
}


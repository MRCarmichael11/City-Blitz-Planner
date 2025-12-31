import { supabase } from '@/services/supabaseClient';
import type { Alliance, ActionEvent } from '@/v2/domain';
import type { Assignments } from '@/v2/rules';

export type V3Payload = {
  version: number; // 3 or 3.1
  alliances?: Alliance[]; // v3.0 format (global alliances)
  alliancesBySeason?: Record<string, Alliance[]>; // v3.1 format (per-season alliances)
  eventsBySeason: Record<string, ActionEvent[]>;
  plannedBySeason: Record<string, Assignments>;
};

export async function getUserSeasonData(userId: string, season: string): Promise<V3Payload | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_maps')
    .select('data')
    .eq('user_id', userId)
    .eq('season', season)
    .single();
  if (error) {
    if (error.code === 'PGRST116' /* No rows */) return null;
    // eslint-disable-next-line no-console
    console.warn('getUserSeasonData error', error);
    return null;
  }
  return (data?.data as V3Payload) ?? null;
}

export async function saveUserSeasonData(userId: string, season: string, payload: V3Payload): Promise<boolean> {
  if (!supabase) return false;
  const row = { user_id: userId, season, data: payload } as const;
  const { error } = await supabase
    .from('user_maps')
    .upsert(row, { onConflict: 'user_id,season' })
    .select('user_id')
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('saveUserSeasonData error', error);
    return false;
  }
  return true;
}

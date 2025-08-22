import { supabase } from '@/services/supabaseClient';
import type { V3Payload } from '@/services/userData';

export interface SharedMap {
  id: string;
  share_id: string;
  owner_user_id: string;
  season: string;
  title: string;
  created_at: string;
  is_active: boolean;
}

export interface SharedMapWithData extends SharedMap {
  data: V3Payload;
  owner_display_name?: string;
}

// Generate a random share ID
function generateShareId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Create a new shared map
export async function createSharedMap(
  userId: string, 
  season: string, 
  title: string, 
  payload: V3Payload
): Promise<{ shareId: string; success: boolean }> {
  if (!supabase) {
    console.error('Supabase not configured');
    return { shareId: '', success: false };
  }
  
  const shareId = generateShareId();
  
  console.log('Creating shared map:', { userId, season, title, shareId });
  
  const { error } = await supabase
    .from('shared_maps')
    .insert({
      share_id: shareId,
      owner_user_id: userId,
      season,
      title,
      data: payload,
      is_active: true
    });
    
  if (error) {
    console.error('Error creating shared map:', error);
    return { shareId: '', success: false };
  }
  
  console.log('Shared map created successfully:', shareId);
  return { shareId, success: true };
}

// Get shared map by share ID (public access)
export async function getSharedMap(shareId: string): Promise<SharedMapWithData | null> {
  if (!supabase) {
    console.error('Supabase not configured for getSharedMap');
    return null;
  }
  
  console.log('Fetching shared map:', shareId);
  
  const { data, error } = await supabase
    .from('shared_maps')
    .select('*')
    .eq('share_id', shareId)
    .eq('is_active', true)
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') {
      console.log('Shared map not found:', shareId);
      return null; // Not found
    }
    console.error('Error fetching shared map:', error);
    return null;
  }
  
  console.log('Shared map found:', data);
  
  return {
    ...data,
    owner_display_name: 'Map Owner' // Simple fallback for now
  };
}

// Get all shared maps for a user
export async function getUserSharedMaps(userId: string): Promise<SharedMap[]> {
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('shared_maps')
    .select('*')
    .eq('owner_user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching user shared maps:', error);
    return [];
  }
  
  return data || [];
}

// Update shared map data (when master makes changes)
export async function updateSharedMapData(shareId: string, payload: V3Payload): Promise<boolean> {
  if (!supabase) return false;
  
  const { error } = await supabase
    .from('shared_maps')
    .update({ data: payload })
    .eq('share_id', shareId)
    .eq('is_active', true);
    
  if (error) {
    console.error('Error updating shared map:', error);
    return false;
  }
  
  return true;
}

// Deactivate (delete) a shared map
export async function deactivateSharedMap(shareId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  
  const { error } = await supabase
    .from('shared_maps')
    .update({ is_active: false })
    .eq('share_id', shareId)
    .eq('owner_user_id', userId); // Only owner can deactivate
    
  if (error) {
    console.error('Error deactivating shared map:', error);
    return false;
  }
  
  return true;
}
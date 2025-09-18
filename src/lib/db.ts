import { supabase } from '@/services/supabaseClient';

export type SessionInfo = { userId: string | null };

export async function getSession(): Promise<SessionInfo> {
  try {
    if (!supabase) return { userId: null };
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id ?? null;
    return { userId };
  } catch {
    return { userId: null };
  }
}

export async function emitRealtime(channel: string, event: string, payload?: unknown): Promise<void> {
  // Stub: replace with Supabase Realtime or WS publish as needed
  // eslint-disable-next-line no-console
  console.log('[realtime]', channel, event, payload ? JSON.stringify(payload).slice(0, 200) : '');
}


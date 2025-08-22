import { useEffect, useState } from 'react';
import { supabase } from '@/services/supabaseClient';

export interface UserProfile {
  id: string;
  email: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!supabase) { setLoading(false); return; }
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
      setLoading(false);
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
      });
      return () => {
        sub?.subscription?.unsubscribe();
      };
    }
    init();
    return () => { mounted = false; };
  }, []);

  const signInWithEmail = async (email: string) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) throw error;
  };

  const signInWithOAuth = async (provider: 'google' | 'github' | 'discord') => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return { user, loading, signInWithEmail, signInWithOAuth, signOut };
}

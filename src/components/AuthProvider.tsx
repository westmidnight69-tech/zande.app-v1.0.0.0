import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  business: any | null;
  sessionId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshBusiness: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  business: null,
  sessionId: null,
  loading: true,
  signOut: async () => {},
  refreshBusiness: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<any | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const syncSession = async (userId: string, businessId?: string) => {
    try {
      // Check for an existing active session in our table
      const { data: existingSession } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        setSessionId(existingSession.id);
        return existingSession.id;
      }

      // Create a new session record
      const { data: newSession, error: createError } = await supabase
        .from('user_sessions')
        .insert([{
          user_id: userId,
          business_id: businessId || null,
          user_agent: window.navigator.userAgent,
          device_type: /Mobi|Android/i.test(window.navigator.userAgent) ? 'mobile' : 'desktop',
          browser: 'Generic Browser', // Could be more specific with a library
          os: window.navigator.platform,
          is_active: true
        }])
        .select()
        .single();

      if (!createError && newSession) {
        setSessionId(newSession.id);
        return newSession.id;
      }
    } catch (err) {
      console.error('Error syncing session:', err);
    }
    return null;
  };

  const fetchBusiness = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle();
      
      if (!error && data) {
        setBusiness(data);
      } else {
        setBusiness(null);
      }
    } catch (err) {
      console.error('Error fetching business:', err);
      setBusiness(null);
    }
  };

  const refreshBusiness = async () => {
    if (user) {
      await fetchBusiness(user.id);
    }
  };

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchBusiness(session.user.id);
        syncSession(session.user.id);
      }
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchBusiness(session.user.id);
        syncSession(session.user.id);
      } else {
        setBusiness(null);
        setSessionId(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (sessionId) {
      await supabase
        .from('user_sessions')
        .update({ is_active: false, signed_out_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, business, sessionId, loading, signOut, refreshBusiness }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};

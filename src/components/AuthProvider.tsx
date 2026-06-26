import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { safeRequest } from '../lib/supabase-utils';
import { clearCache } from '../lib/cache';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  business: any | null;
  sessionId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshBusiness: () => Promise<void>;
  setBusiness: (business: any | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  business: null,
  sessionId: null,
  loading: true,
  signOut: async () => {},
  refreshBusiness: async () => {},
  setBusiness: () => {},
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
      const { data: existingSession } = await safeRequest(() => supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      );

      if (existingSession) {
        setSessionId(existingSession.id);
        return existingSession.id;
      }

      // Create a new session record
      const { data: newSession, error: createError } = await safeRequest(() => supabase
        .from('user_sessions')
        .insert([{
          user_id: userId,
          business_id: businessId || null,
          user_agent: window.navigator.userAgent,
          device_type: /Mobi|Android/i.test(window.navigator.userAgent) ? 'mobile' : 'desktop',
          browser: 'Generic Browser',
          os: window.navigator.platform,
          is_active: true
        }])
        .select()
        .single()
      );

      if (!createError && newSession) {
        setSessionId(newSession.id);
        return newSession.id;
      }
    } catch (err) {
      console.error('Error syncing session:', err);
    }
    return null;
  };

  const fetchBusiness = async (userId: string, isSignInEvent: boolean = false) => {
    try {
      const { data, error } = await safeRequest(() => supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle()
      );
      
      if (!error && data) {
        // If it's a fresh sign-in, increment the login count
        if (isSignInEvent) {
          const newCount = (data.login_count || 0) + 1;
          await safeRequest(() => supabase
            .from('businesses')
            .update({ login_count: newCount })
            .eq('id', data.id)
          );
          data.login_count = newCount;
        }
        setBusiness(data);
      } else {
        setBusiness(null);
      }
    } catch (err) {
      console.error('Error fetching business:', err);
      setBusiness(null);
    }
  };

  const handleAuthUpdate = async (newSession: Session | null, event?: string) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
    
    try {
      if (newSession?.user) {
        await Promise.all([
          fetchBusiness(newSession.user.id, event === 'SIGNED_IN'),
          syncSession(newSession.user.id)
        ]);
      } else {
        setBusiness(null);
        setSessionId(null);
        clearCache();
      }
    } catch (err) {
      console.error('Data fetching error:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshBusiness = async () => {
    if (user) {
      await fetchBusiness(user.id);
    }
  };

  useEffect(() => {
    // 15 second safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
      console.warn('Auth initialization timed out - forcing loading false');
    }, 15000);

    let isMounted = true;

    const performInit = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (isMounted) {
          await handleAuthUpdate(currentSession);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (isMounted) setLoading(false);
      }
    };

    performInit();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (isMounted) {
        await handleAuthUpdate(newSession, _event);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    clearCache();
    if (sessionId) {
      await supabase
        .from('user_sessions')
        .update({ is_active: false, signed_out_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, business, sessionId, loading, signOut, refreshBusiness, setBusiness }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};

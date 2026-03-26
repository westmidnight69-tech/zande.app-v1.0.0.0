import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { safeRequest } from '../lib/supabase-utils';

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
  
  // Use refs to prevent concurrent/redundant processing of the same user state
  const lastProcessedUserId = React.useRef<string | null>(undefined as any);
  const initializationPromise = React.useRef<Promise<void> | null>(null);
  // Guard against concurrent auth events firing simultaneously (e.g. getSession + onAuthStateChange)
  const isHandlingAuth = React.useRef(false);

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

  const fetchBusiness = async (userId: string) => {
    try {
      const { data, error } = await safeRequest(() => supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId)
        .maybeSingle()
      );
      
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

  const handleAuthUpdate = async (newSession: Session | null) => {
    // Drop concurrent calls — only one auth update should run at a time per tab
    if (isHandlingAuth.current) return;
    isHandlingAuth.current = true;

    const userId = newSession?.user?.id ?? null;
    
    // Skip if we've already processed this user state
    if (userId === lastProcessedUserId.current) {
      setLoading(false);
      isHandlingAuth.current = false;
      return;
    }
    lastProcessedUserId.current = userId;

    setSession(newSession);
    setUser(newSession?.user ?? null);
    
    try {
      if (newSession?.user) {
        await Promise.all([
          fetchBusiness(newSession.user.id),
          syncSession(newSession.user.id)
        ]);
      } else {
        setBusiness(null);
        setSessionId(null);
      }
    } catch (err) {
      console.error('Data fetching error:', err);
    } finally {
      setLoading(false);
      isHandlingAuth.current = false;
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

    const performInit = async () => {
      try {
        let { data: { session: currentSession } } = await supabase.auth.getSession();
        
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const devEmail = import.meta.env.VITE_DEV_LOGIN_EMAIL;
        const devPass = import.meta.env.VITE_DEV_LOGIN_PASSWORD;

        if (!currentSession && isLocalhost && devEmail && devPass && devPass !== 'YourPasswordHere') {
          const hasTried = sessionStorage.getItem('zande_auto_login_tried');
          if (!hasTried) {
            sessionStorage.setItem('zande_auto_login_tried', 'true');
            try {
              const { data } = await supabase.auth.signInWithPassword({
                email: devEmail,
                password: devPass,
              });
              if (data.session) currentSession = data.session;
            } catch (e) {
              console.error('Auto-login failed:', e);
            }
          }
        }

        await handleAuthUpdate(currentSession);
      } catch (err) {
        console.error('Auth initialization error:', err);
        setLoading(false);
      }
    };

    initializationPromise.current = performInit();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (initializationPromise.current) {
        await initializationPromise.current;
      }
      handleAuthUpdate(newSession);
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
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
    <AuthContext.Provider value={{ session, user, business, sessionId, loading, signOut, refreshBusiness, setBusiness }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};

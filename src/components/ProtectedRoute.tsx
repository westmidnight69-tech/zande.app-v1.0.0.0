import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const location = useLocation();

  useEffect(() => {
    async function checkOnboarding() {
      if (!session?.user) {
        setCheckingOnboarding(false);
        return;
      }
      
      const { data } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .single();
        
      setNeedsOnboarding(!data);
      setCheckingOnboarding(false);
    }
    
    if (!loading) {
      checkOnboarding();
    }
  }, [session, loading]);

  if (loading || checkingOnboarding) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#000', color: '#fff' }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signup" replace />;
  }

  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  if (!needsOnboarding && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

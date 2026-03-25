import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export default function ProtectedRoute() {
  const { session, business, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#000', color: '#fff' }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signup" replace />;
  }

  const needsOnboarding = !business;

  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  
  if (!needsOnboarding && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

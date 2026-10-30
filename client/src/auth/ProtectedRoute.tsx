import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function AuthPending() {
  const { error, status, retry, logout } = useAuth();
  return <main className="auth-page"><section className="auth-panel" role="status"><h1>{status === 'error' ? 'Could not verify your session' : 'Checking your session…'}</h1>{error && <><p className="error">{error}</p><div className="flex gap-4 mt-5"><button className="primary" onClick={retry}>Try again</button><button className="text-button" onClick={logout}>Sign out</button></div></>}</section></main>;
}
export default function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { session, status } = useAuth();
  const location = useLocation();
  if (status !== 'ready') return <AuthPending/>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }}/>;
  if (admin && session.user.role !== 'admin') return <Navigate to="/forbidden" replace/>;
  return <Outlet/>;
}

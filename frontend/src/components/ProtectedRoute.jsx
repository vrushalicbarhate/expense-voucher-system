import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// Blocks anonymous users, and (when `roles` is given) users with the wrong role.
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

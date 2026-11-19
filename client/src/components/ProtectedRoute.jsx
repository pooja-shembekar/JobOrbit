import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

/**
 * Route protection wrapper.
 * Enforces authentication and role-based access.
 * Prevents premature redirection during initial session verification.
 * Passes the intended destination in location.state.from so Login can redirect back.
 */
function ProtectedRoute({ allowedRoles }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Wait for session verification on page refresh/direct URL access
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-medium text-slate-500">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login, preserving the intended destination
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // If specific roles are required, ensure user's role is authorized
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'recruiter') {
      return <Navigate to="/recruiter/dashboard" replace />;
    }
    return <Navigate to="/jobs" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;

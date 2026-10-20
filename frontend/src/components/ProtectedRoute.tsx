import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../lib/authContext";

/** Gate for authenticated routes; redirects to /login preserving the target path. */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-gray-500">Loading…</div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

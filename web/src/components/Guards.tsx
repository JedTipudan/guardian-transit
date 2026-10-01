import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../state/AuthContext';
import { PageLoader } from './ui';
import type { Role } from '../lib/types';

export const roleHome: Record<Role, string> = {
  STUDENT: '/student',
  PARENT: '/parent',
  DRIVER: '/driver',
  ADMIN: '/admin',
};

/** Blocks a route until the session is known, then enforces role access. */
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-alt">
        <PageLoader label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome[user.role]} replace />;
  }

  return <Outlet />;
}

/** Keeps signed-in users out of the sign-in screens. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas-alt">
        <PageLoader label="Checking your session…" />
      </div>
    );
  }

  if (user) {
    const state = location.state as { from?: string } | null;
    const intended = state?.from && state.from !== '/login' ? state.from : roleHome[user.role];
    return <Navigate to={intended} replace />;
  }

  return <>{children}</>;
}

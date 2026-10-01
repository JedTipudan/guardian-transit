import { type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BrandIdentity } from './PublicLayout';
import { ConnectionBanner } from './ConnectionBanner';
import { Icon } from '../Icon';
import { Avatar } from '../ui';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';

export interface ShellNavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

/**
 * Shared responsive workspace for the Driver and Admin consoles.
 * ≥1024 uses the 248px sidebar from the Figma parent shell; smaller viewports
 * collapse to a header plus a fixed bottom tab bar.
 */
export function AppShell({
  workspaceLabel,
  nav,
  notificationsTo,
  children,
}: {
  workspaceLabel: string;
  nav: ShellNavItem[];
  notificationsTo: string;
  children?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const { pathname } = useLocation();

  const current = nav.find(
    (item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)),
  );
  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Account';

  return (
    <div className="flex min-h-screen bg-canvas-alt">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-8 border-r border-border bg-white p-6 lg:flex">
        <Link to="/" aria-label="Guardian Transit home">
          <BrandIdentity />
        </Link>
        <p className="text-[11px] leading-[1.5] text-muted">{workspaceLabel}</p>

        <nav className="flex flex-col gap-2" aria-label={workspaceLabel}>
          {nav.map((item) => {
            const active = item.end
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={`flex items-center gap-3 rounded-[12px] px-3 py-3 text-[13px] transition ${
                  active ? 'bg-primary-soft font-bold text-primary' : 'bg-white text-muted hover:bg-canvas-alt hover:text-heading'
                }`}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5 border-t border-border pt-4">
          <Avatar name={displayName} src={user?.avatarUrl} size={40} tone="navy" />
          <p className="text-[12px] leading-[1.7] text-muted">
            <span className="block font-bold text-heading">{displayName}</span>
            {user?.role?.toLowerCase()}
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-0.5 block text-left text-[12px] text-primary hover:underline"
            >
              Log out
            </button>
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-[72px] lg:pb-0">
        <ConnectionBanner />

        <header className="sticky top-0 z-30 border-b border-border bg-white">
          <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="lg:hidden">
                <Link to="/" aria-label="Guardian Transit home">
                  <BrandIdentity size="sm" />
                </Link>
              </span>
              <p className="hidden truncate text-[13px] text-muted lg:block">
                {workspaceLabel.toLowerCase().replace(/\s+/g, ' ')} / {current?.label ?? 'Overview'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to={notificationsTo}
                className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-navy transition hover:bg-canvas-alt"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              >
                <Icon name="bell" size={20} />
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </Link>
              <span className="hidden items-center gap-3 sm:flex">
                <Avatar name={displayName} src={user?.avatarUrl} size={36} tone="navy" />
                <span className="text-[13px] font-semibold text-heading">{displayName}</span>
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-[10px] px-2 py-1.5 text-[12px] text-muted transition hover:bg-canvas-alt hover:text-danger"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-5 md:p-8">{children ?? <Outlet />}</main>
      </div>

      {/* Bottom tabs on small screens */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex h-[72px] items-stretch border-t border-border bg-white lg:hidden"
        aria-label={workspaceLabel}
      >
        {nav.slice(0, 5).map((item) => {
          const active = item.end
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex flex-1 flex-col items-center justify-center gap-1"
              aria-current={active ? 'page' : undefined}
            >
              <span className={active ? 'text-primary' : 'text-muted'}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className={`text-[11px] ${active ? 'font-bold text-primary' : 'text-muted'}`}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

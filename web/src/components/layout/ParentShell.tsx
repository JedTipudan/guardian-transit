import { type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BrandIdentity, NavLinkItem } from './PublicLayout';
import { ConnectionBanner } from './ConnectionBanner';
import { Icon } from '../Icon';
import { Avatar } from '../ui';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';

const nav = [
  { to: '/parent', label: 'Dashboard', icon: 'layout-dashboard', end: true },
  { to: '/parent/live', label: 'Live Trip', icon: 'radio' },
  { to: '/parent/history', label: 'Trip History', icon: 'history' },
  { to: '/parent/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/parent/profile', label: 'Profile', icon: 'user-round' },
];

const titles: Record<string, string> = {
  '/parent': 'Dashboard',
  '/parent/live': 'Live Trip',
  '/parent/history': 'Trip History',
  '/parent/notifications': 'Notifications',
  '/parent/profile': 'Profile',
  '/parent/book': 'Book a Ride',
  '/parent/guardians': 'Guardian Links',
};

function usePageTitle(): string {
  const { pathname } = useLocation();
  if (titles[pathname]) return titles[pathname];
  const match = Object.keys(titles).find((key) => pathname.startsWith(`${key}/`));
  return match ? titles[match] : 'Dashboard';
}

/**
 * Parent web workspace — Figma "Parent sidebar" (248px, ≥1280) plus the
 * responsive header/chip navigation used on tablet and mobile browsers.
 */
export function ParentShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const title = usePageTitle();
  const location = useLocation();
  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Parent';

  return (
    <div className="flex min-h-screen bg-canvas-alt">
      {/* --- Desktop sidebar (≥1280) ---------------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-8 border-r border-border bg-white p-6 xl:flex">
        <Link to="/" aria-label="Guardian Transit home">
          <BrandIdentity />
        </Link>
        <p className="text-[11px] leading-[1.5] text-muted">PARENT WEB</p>

        <nav className="flex flex-col gap-2" aria-label="Parent web">
          {nav.map((item) => (
            <NavLinkItem key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.end} />
          ))}
        </nav>

        <p className="mt-auto whitespace-pre-line text-[12px] leading-[1.7] text-muted">
          {'Follow your child’s active ride from any browser.\n\nHelp & support'}
        </p>

        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
          <Avatar name={displayName} src={user?.avatarUrl} size={40} />
          <p className="text-[12px] leading-[1.7] text-muted">
            <span className="block font-bold text-heading">{displayName}</span>
            Parent / guardian
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

      {/* --- Workspace ------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner />

        <header className="border-b border-border bg-white">
          <div className="flex flex-col gap-[18px] px-6 py-5 md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 xl:hidden">
                <Link to="/" aria-label="Guardian Transit home">
                  <BrandIdentity size="sm" />
                </Link>
              </div>
              <p className="hidden min-w-0 flex-1 truncate text-[13px] text-muted xl:block">
                Parent web / {title}
              </p>

              <div className="flex items-center gap-4">
                <Link
                  to="/parent/notifications"
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
                <Link to="/parent/profile" className="flex items-center gap-3" aria-label="Open profile">
                  <Avatar name={displayName} src={user?.avatarUrl} size={36} />
                  <span className="hidden text-[13px] font-semibold text-heading sm:inline">{displayName}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="hidden rounded-[10px] px-2 py-1.5 text-[12px] text-muted transition hover:bg-canvas-alt hover:text-danger xl:inline"
                >
                  Log out
                </button>
              </div>
            </div>

            {/* Chip navigation below the desktop breakpoint */}
            <nav className="flex flex-wrap gap-2 xl:hidden" aria-label="Parent web sections">
              {nav.map((item) => {
                const active = item.end
                  ? location.pathname === item.to
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 rounded-[12px] px-[10px] py-2 text-[12px] transition ${
                      active ? 'bg-primary-soft font-bold text-primary' : 'bg-white text-muted border border-border'
                    }`}
                  >
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-6 md:p-8">{children ?? <Outlet />}</main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-6 py-6 text-[12px] text-muted md:px-8">
          <span>Guardian Transit · Parent web</span>
          <Link to="/#privacy" className="hover:text-primary">
            Privacy &amp; safety
          </Link>
        </footer>
      </div>
    </div>
  );
}

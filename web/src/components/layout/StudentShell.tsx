import { type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { ConnectionBanner } from './ConnectionBanner';
import { ThemeToggle } from '../ThemeToggle';
import { BrandIdentity } from './PublicLayout';
import { Avatar } from '../ui';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';

const tabs = [
  { to: '/student', label: 'Home', icon: 'home', end: true },
  { to: '/student/book', label: 'Book', icon: 'car' },
  { to: '/student/trips', label: 'Trips', icon: 'history' },
  { to: '/student/rewards', label: 'Rewards', icon: 'gift' },
  { to: '/student/profile', label: 'Profile', icon: 'user-round' },
];

/**
 * Student app shell.
 * - Mobile / PWA: centered 480px column with bottom tab bar (original design).
 * - Desktop (md+): full-width layout with a left sidebar, matching AppShell.
 */
export function StudentShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { unread } = useNotifications();

  const hideTabs = /\/student\/(book|ride|emergency|otp)/.test(pathname) && pathname !== '/student/book';
  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Student';

  return (
    <>
      {/* ── DESKTOP layout (md+) ─────────────────────────────────────── */}
      <div className="hidden min-h-screen bg-canvas-alt md:flex">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-8 border-r border-border bg-white p-6 lg:flex">
          <Link to="/" aria-label="Guardian Transit home">
            <BrandIdentity />
          </Link>
          <p className="text-[11px] leading-[1.5] text-muted">Student workspace</p>
          <nav className="flex flex-col gap-2" aria-label="Student app">
            {tabs.map((tab) => {
              const active = tab.end
                ? pathname === tab.to
                : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-3 text-[13px] transition ${
                    active ? 'bg-primary-soft font-bold text-primary' : 'bg-white text-muted hover:bg-canvas-alt hover:text-heading'
                  }`}
                >
                  <Icon name={tab.icon} size={18} />
                  <span>{tab.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-2.5 border-t border-border pt-4">
            <Avatar name={displayName} src={user?.avatarUrl} size={40} tone="navy" />
            <p className="text-[12px] leading-[1.7] text-muted">
              <span className="block font-bold text-heading">{displayName}</span>
              student
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
              <span className="lg:hidden">
                <Link to="/" aria-label="Guardian Transit home"><BrandIdentity size="sm" /></Link>
              </span>
              <div className="flex items-center gap-3 ml-auto">
                <Link
                  to="/student/notifications"
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
                <ThemeToggle />
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
          <main className="flex flex-1 flex-col">{children ?? <Outlet />}</main>
        </div>

        {/* Bottom tabs on md screens (before lg sidebar kicks in) */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 flex h-[72px] items-stretch border-t border-border bg-white lg:hidden"
          aria-label="Student app"
        >
          {tabs.map((tab) => {
            const active = tab.end
              ? pathname === tab.to
              : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className="flex flex-1 flex-col items-center justify-center gap-1"
                aria-current={active ? 'page' : undefined}
              >
                <span className={active ? 'text-primary' : 'text-muted'}><Icon name={tab.icon} size={20} /></span>
                <span className={`text-[11px] ${active ? 'font-bold text-primary' : 'text-muted'}`}>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* ── MOBILE layout (< md) — original PWA design ───────────────── */}
      <div className="flex min-h-screen justify-center bg-canvas md:hidden">
        <div className="relative flex w-full max-w-[480px] flex-col bg-canvas-alt shadow-[0_0_60px_rgba(16,40,70,0.08)]">
          <ConnectionBanner />
          <main className={`flex-1 ${hideTabs ? 'pb-4' : 'pb-[84px]'}`}>{children ?? <Outlet />}</main>
          {!hideTabs ? (
            <nav
              className="fixed bottom-0 left-1/2 z-40 flex h-16 w-full max-w-[480px] -translate-x-1/2 items-stretch border-t border-border bg-white"
              aria-label="Student app"
            >
              {tabs.map((tab) => {
                const active = tab.end
                  ? pathname === tab.to
                  : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className="flex flex-1 flex-col items-center justify-center gap-1"
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={`relative ${active ? 'text-primary' : 'text-muted'}`}>
                      <Icon name={tab.icon} size={20} />
                    </span>
                    <span className={`text-[12px] ${active ? 'font-bold text-primary' : 'text-muted'}`}>{tab.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Compact app-bar shared by the student screens.
 * Mobile: sticky top bar with back button.
 * Desktop (md+): inline page heading — the shell header handles nav. */
export function StudentHeader({
  title,
  subtitle,
  backTo,
  right,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  right?: ReactNode;
}) {
  return (
    <>
      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-3 px-5 py-4">
          {backTo ? (
            <Link
              to={backTo}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
              aria-label="Go back"
            >
              <Icon name="chevron-left" size={18} />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-bold text-heading">{title}</h1>
            {subtitle ? <p className="truncate text-[12px] text-muted">{subtitle}</p> : null}
          </div>
          {right}
          <ThemeToggle />
        </div>
      </header>
      {/* Desktop inline heading */}
      <div className="hidden items-center gap-3 md:flex">
        {backTo ? (
          <Link
            to={backTo}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
            aria-label="Go back"
          >
            <Icon name="chevron-left" size={18} />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">{title}</h1>
          {subtitle ? <p className="text-[13px] text-muted">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </>
  );
}

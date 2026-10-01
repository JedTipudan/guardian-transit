import { type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';
import { ConnectionBanner } from './ConnectionBanner';
import { ThemeToggle } from '../ThemeToggle';

const tabs = [
  { to: '/student', label: 'Home', icon: 'home', end: true },
  { to: '/student/book', label: 'Book', icon: 'car' },
  { to: '/student/trips', label: 'Trips', icon: 'history' },
  { to: '/student/rewards', label: 'Rewards', icon: 'gift' },
  { to: '/student/profile', label: 'Profile', icon: 'user-round' },
];

/** Phone-width app frame used by the student PWA (Figma mobile frames = 390). */
export function StudentShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();

  const hideTabs = /\/student\/(book|ride|emergency|otp)/.test(pathname) && pathname !== '/student/book';

  return (
    <div className="flex min-h-screen justify-center bg-canvas">
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
  );
}

/** Compact app-bar shared by the student screens. */
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
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
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
  );
}

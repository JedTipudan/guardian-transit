import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '../Icon';

export function BrandIdentity({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-primary-soft text-primary">
        <Icon name="shield-check" size={26} />
      </span>
      <span
        className={`text-navy ${size === 'md' ? 'text-[17px] font-bold' : 'text-[15px] font-bold'}`}
        style={{ lineHeight: 1.45 }}
      >
        Guardian Transit
      </span>
    </span>
  );
}

const publicLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/#how-it-works', label: 'How It Works', end: false },
  { to: '/#safety', label: 'Safety', end: false },
  { to: '/#about', label: 'About', end: false },
];

/** Public marketing header — Figma "Public header" (padding 20px 64px). */
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-5 md:px-10 xl:px-16">
        <div className="flex items-center justify-between gap-6">
          <Link to="/" aria-label="Guardian Transit home">
            <BrandIdentity />
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Public">
            {publicLinks.map((link) => (
              <a
                key={link.label}
                href={link.to}
                className={`text-[14px] transition ${
                  link.end && location.pathname === '/'
                    ? 'font-semibold text-primary'
                    : 'text-muted hover:text-primary'
                }`}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/login" className="gt-btn gt-btn-secondary hidden sm:inline-flex">
              Parent Login
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-border text-heading md:hidden"
              aria-expanded={open}
              aria-label="Toggle navigation"
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name={open ? 'x' : 'menu'} size={20} />
            </button>
          </div>
        </div>

        {open ? (
          <nav className="flex flex-wrap items-center gap-x-[18px] gap-y-3 md:hidden" aria-label="Public mobile">
            {publicLinks.map((link) => (
              <a key={link.label} href={link.to} onClick={() => setOpen(false)} className="text-[12px] font-semibold text-muted">
                {link.label}
              </a>
            ))}
            <Link to="/login" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-primary">
              Parent Login
            </Link>
            <Link to="/student/login" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-muted">
              Student Sign In
            </Link>
            <Link to="/driver/login" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-muted">
              Driver Sign In
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-6 py-10 md:px-10 xl:px-16">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex flex-col gap-2.5">
            <BrandIdentity />
            <p className="text-[14px] text-muted">Safe rides. Connected families.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-muted" aria-label="Footer">
            <Link to="/#about" className="hover:text-primary">About</Link>
            <Link to="/#safety" className="hover:text-primary">Safety</Link>
            <Link to="/#privacy" className="hover:text-primary">Privacy</Link>
            <Link to="/#faq" className="hover:text-primary">FAQ</Link>
            <Link to="/register" className="hover:text-primary">Create account</Link>
            <Link to="/login" className="hover:text-primary">Contact</Link>
          </nav>
        </div>
        <p className="text-[11px] text-muted">© 2026 Guardian Transit. Student safety, family connection.</p>
      </div>
    </footer>
  );
}

/** Header + footer wrapper for every public page (landing, auth, onboarding). */
export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas-alt">
      <PublicHeader />
      <main className="flex-1">{children ?? <Outlet />}</main>
      <PublicFooter />
    </div>
  );
}

export function NavLinkItem({
  to,
  label,
  icon,
  end = false,
  onClick,
}: {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-[12px] px-3 py-3 text-[13px] transition',
          isActive
            ? 'bg-primary-soft font-bold text-primary'
            : 'bg-white font-normal text-muted hover:bg-canvas-alt hover:text-heading',
        ].join(' ')
      }
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

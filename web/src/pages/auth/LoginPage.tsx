import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, TextField } from '../../components/ui';
import { MapCanvas } from '../../components/MapCanvas';
import { useAuth } from '../../state/AuthContext';
import { errorMessage } from '../../lib/api';
import { roleHome } from '../../components/Guards';
import { useDocumentTitle } from '../../lib/hooks';

export default function LoginPage() {
  useDocumentTitle('Parent Login · Guardian Transit');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ identifier?: string; password?: string }>({});
  const [pending, setPending] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof fieldError = {};
    if (identifier.trim().length < 3) next.identifier = 'Enter your mobile number or email.';
    if (!password) next.password = 'Enter your password.';
    setFieldError(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    setError(null);
    try {
      const result = await login(identifier.trim(), password);
      if (result.requiresOtp && !result.user) {
        navigate('/verify-otp', {
          replace: true,
          state: { phone: result.phone, purpose: 'LOGIN', from },
        });
        return;
      }
      if (result.user) {
        navigate(from && from !== '/login' ? from : roleHome[result.user.role], { replace: true });
      }
    } catch (cause) {
      setError(errorMessage(cause, 'We could not sign you in.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-canvas-alt">
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-10 md:px-10 lg:grid-cols-2 lg:gap-12 lg:py-16 xl:px-20">
        {/* Left: navy intro (desktop only) */}
        <div className="hidden flex-col gap-6 rounded-[20px] bg-navy p-8 lg:flex">
          <p className="text-[12px] font-bold uppercase tracking-wide text-navy-text">Parent web access</p>
          <h1 className="text-[40px] font-bold leading-[1.2] text-white">
            Your child’s journey. Your peace of mind.
          </h1>
          <p className="text-[16px] text-navy-text">
            Follow Maya’s active ride with a verified BaoBao driver, directly from your browser.
          </p>

          <MapCanvas
            height={260}
            pickup={{ lat: 14.5995, lng: 120.9842, label: 'San Isidro · Gate A' }}
            destination={{ lat: 14.6071, lng: 120.9912, label: 'Home' }}
            student={{ lat: 14.6018, lng: 120.9871, label: 'Maya' }}
            driver={{ lat: 14.6036, lng: 120.9892, label: 'BaoBao' }}
            freshness="Updated 3:42 PM · 5 sec ago"
            live
            interactive={false}
          />

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-bold text-white">No app installation needed.</p>
            <p className="text-[12px] text-navy-text">
              Private monitoring for connected guardians. Location is shared during active trips only.
            </p>
          </div>
        </div>

        {/* Right: form */}
        <div className="rounded-[20px] border border-border bg-white p-6 sm:p-8 lg:border-0 lg:bg-transparent lg:p-0">
          <div className="flex flex-col gap-[22px]">
            <span className="gt-badge gt-badge-primary self-start">PARENT ACCESS</span>

            <div className="flex flex-col gap-2.5">
              <h2 className="text-[30px] font-bold leading-[1.2] text-heading">Welcome Back</h2>
              <p className="text-[14px] text-muted">Sign in to stay connected to your child’s journey.</p>
            </div>

            <form className="flex flex-col gap-[22px]" onSubmit={onSubmit} noValidate>
              <TextField
                label="Phone Number"
                name="identifier"
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="+63 917 555 0182"
                leadingIcon="phone"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                error={fieldError.identifier}
                hint="Mobile number or email address."
              />

              <TextField
                label="Password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••"
                leadingIcon="lock"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldError.password}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] hover:bg-canvas-alt"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
                  </button>
                }
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-[4px] border border-border accent-[#2463EB]"
                    checked={keepSignedIn}
                    onChange={(event) => setKeepSignedIn(event.target.checked)}
                  />
                  Keep me signed in
                </label>
                <Link to="/forgot-password" className="text-[12px] font-semibold text-primary hover:underline">
                  Forgot Password?
                </Link>
              </div>

              {error ? (
                <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" loading={pending} block>
                Login
              </Button>

              <Link to="/register" className="gt-btn gt-btn-secondary gt-btn-block">
                Create Account
              </Link>

              <div className="gt-notice gt-notice-primary">
                <Icon name="info" size={20} className="mt-0.5 shrink-0 text-primary" />
                <p>
                  <span className="font-bold text-heading">Connected from the first ride</span>
                  <br />
                  Use your parent account linked to your child. No PWA installation is needed to monitor a trip.
                </p>
              </div>

              <p className="text-[11px] text-muted">
                By logging in, you agree to our Terms and Privacy Policy.
              </p>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 pb-6 md:px-10 xl:px-20">
        <p className="text-[12px] text-muted">Safe rides. Connected families.</p>
        <Link to="/register" className="text-[12px] text-primary hover:underline">
          Need help signing in?
        </Link>
      </section>
    </div>
  );
}

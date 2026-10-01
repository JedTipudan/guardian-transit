import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, TextField } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { errorMessage } from '../../lib/api';
import { roleHome } from '../../components/Guards';
import { useDocumentTitle } from '../../lib/hooks';

/** Student sign-in — mirrors the Figma "Student · Login" frame. */
export default function StudentLogin() {
  useDocumentTitle('Student Login · Guardian Transit');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
          state: { phone: result.phone, purpose: 'LOGIN', from: from ?? '/student' },
        });
        return;
      }
      if (result.user) {
        navigate(from && from !== '/student/login' ? from : roleHome[result.user.role], { replace: true });
      }
    } catch (cause) {
      setError(errorMessage(cause, 'We could not sign you in.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-canvas-alt">
      <section className="mx-auto flex w-full max-w-[440px] flex-col gap-[22px] px-6 py-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-primary-soft text-primary">
            <Icon name="shield-check" size={28} />
          </span>
          <span className="text-[17px] font-bold text-navy">Guardian Transit</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="gt-badge gt-badge-primary self-start">STUDENT ACCESS</span>
          <h1 className="text-[30px] font-bold leading-[1.2] text-heading">Welcome back.</h1>
          <p className="text-[14px] text-muted">Your next safe ride starts here.</p>
        </div>

        <form className="flex flex-col gap-[22px]" onSubmit={onSubmit} noValidate>
          <TextField
            label="Phone number"
            name="identifier"
            type="text"
            inputMode="tel"
            autoComplete="username"
            placeholder="+63 917 555 0148"
            leadingIcon="phone"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            error={fieldError.identifier}
            hint="The mobile number or email on your student account."
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

          <div className="flex items-center justify-end">
            <Link to="/forgot-password" className="text-[12px] font-semibold text-primary hover:underline">
              Forgot password
            </Link>
          </div>

          {error ? (
            <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={pending} block trailingIcon="arrow-right">
            Login
          </Button>

          <Link to="/student/register" className="gt-btn gt-btn-secondary gt-btn-block">
            Create account
          </Link>

          <div className="gt-notice gt-notice-primary">
            <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-primary" />
            <p>
              <span className="font-bold text-heading">Connected from the first ride</span>
              <br />
              Use your student account to book, track and keep your guardian informed.
            </p>
          </div>

          <p className="text-[11px] text-muted">
            By logging in, you agree to our Terms and Privacy Policy.
          </p>

          <p className="text-center text-[12px] text-muted">
            New here?{' '}
            <Link to="/onboarding" className="font-semibold text-primary hover:underline">
              See how it works
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}

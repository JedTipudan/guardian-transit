import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Notice, TextField } from '../../components/ui';
import { roleHome } from '../../components/Guards';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { useAuth } from '../../state/AuthContext';

interface DriverLoginProps {
  mode?: 'login' | 'register';
}

interface RegisterPayload {
  phone: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

/** Mirrors server/src/lib/password.ts so weak passwords fail before a round-trip. */
function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters.');
  if (!/[A-Za-z]/.test(password)) issues.push('Include at least one letter.');
  if (!/[0-9]/.test(password)) issues.push('Include at least one number.');
  return issues;
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-7 w-7 items-center justify-center rounded-[6px] hover:bg-canvas-alt"
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      <Icon name={shown ? 'eye-off' : 'eye'} size={17} />
    </button>
  );
}

function AuthAside({ registerMode }: { registerMode: boolean }) {
  const bullets: [string, string][] = registerMode
    ? [
        ['shield-check', 'Licence, vehicle and background checks are reviewed by the safety desk.'],
        ['file-check', 'Track every verification result and reviewer note in your console.'],
        ['radio', 'Go online when you are ready and receive real ride requests.'],
        ['wallet', 'Your trips and earnings are summarised every day.'],
      ]
    : [
        ['layout-dashboard', 'Accept or decline ride requests straight from your dashboard.'],
        ['key', 'Pickup PIN verification protects every handover.'],
        ['navigation', 'Live location is shared only while a trip is in progress.'],
        ['wallet', 'Today’s trips and earnings, always up to date.'],
      ];

  return (
    <div className="hidden flex-col gap-6 rounded-[20px] bg-navy p-8 lg:flex">
      <p className="text-[12px] font-bold uppercase tracking-wide text-navy-text">Driver console</p>
      <h1 className="text-[40px] font-bold leading-[1.2] text-white">
        {registerMode ? 'Become a verified BaoBao driver.' : 'Welcome back to the driver console.'}
      </h1>
      <p className="text-[16px] text-navy-text">
        {registerMode
          ? 'Register your licence and vehicle once — the safety desk reviews them before you receive any ride.'
          : 'Accept requests, run pickups and complete trips — all from your phone.'}
      </p>
      <ul className="mt-1 flex flex-col gap-4 text-[14px] text-navy-text">
        {bullets.map(([icon, text]) => (
          <li key={text} className="flex gap-3">
            <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-white" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-[12px] text-navy-text">Safe rides. Connected families.</p>
    </div>
  );
}

export default function DriverLogin({ mode = 'login' }: DriverLoginProps) {
  const registerMode = mode === 'register';
  useDocumentTitle(registerMode ? 'Driver Registration · Guardian Transit' : 'Driver Login · Guardian Transit');

  const navigate = useNavigate();
  const { login } = useAuth();

  // --- sign in -------------------------------------------------------------
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginFieldError, setLoginFieldError] = useState<{ identifier?: string; password?: string }>({});
  const [loginPending, setLoginPending] = useState(false);

  async function onLoginSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof loginFieldError = {};
    if (identifier.trim().length < 3) next.identifier = 'Enter your mobile number or email.';
    if (!password) next.password = 'Enter your password.';
    setLoginFieldError(next);
    if (Object.keys(next).length > 0) return;

    setLoginPending(true);
    setLoginError(null);
    try {
      const result = await login(identifier.trim(), password);
      if (result.requiresOtp && !result.user) {
        navigate('/verify-otp', { replace: true, state: { phone: result.phone, purpose: 'LOGIN' } });
        return;
      }
      if (result.user) navigate(roleHome[result.user.role], { replace: true });
    } catch (cause) {
      setLoginError(errorMessage(cause, 'We could not sign you in.'));
    } finally {
      setLoginPending(false);
    }
  }

  // --- register ------------------------------------------------------------
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    confirm: '',
    licenseNumber: '',
    licenseExpiry: '',
    licenseClass: '',
    vehicleNickname: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleColor: '',
    plateNumber: '',
    capacity: '',
    year: '',
  });
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [regError, setRegError] = useState<string | null>(null);
  const [regPending, setRegPending] = useState(false);

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  function validateRegistration(): Record<string, string> {
    const next: Record<string, string> = {};
    if (form.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
    if (form.lastName.trim().length < 2) next.lastName = 'Enter your last name.';
    if (form.phone.trim().length < 7) next.phone = 'Enter a valid mobile number.';
    if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email address.';

    const issues = passwordIssues(form.password);
    if (issues.length > 0) next.password = issues[0];
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match.';

    if (form.licenseNumber.trim().length < 4) next.licenseNumber = 'Driver licence number is required.';
    if (!form.licenseExpiry) next.licenseExpiry = 'Licence expiry date is required.';

    if (form.vehicleNickname.trim().length < 2) next.vehicleNickname = 'Give your vehicle a nickname.';
    if (!form.vehicleMake.trim()) next.vehicleMake = 'Enter the vehicle make.';
    if (!form.vehicleModel.trim()) next.vehicleModel = 'Enter the vehicle model.';
    if (!form.vehicleColor.trim()) next.vehicleColor = 'Enter the vehicle colour.';
    if (form.plateNumber.trim().length < 2) next.plateNumber = 'Enter the plate number.';
    if (form.capacity.trim()) {
      const seats = Number(form.capacity);
      if (!Number.isInteger(seats) || seats < 1 || seats > 20) {
        next.capacity = 'Seats must be a whole number between 1 and 20.';
      }
    }
    if (form.year.trim()) {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 1980 || year > 2035) {
        next.year = 'Year must be between 1980 and 2035.';
      }
    }
    return next;
  }

  async function onRegisterSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validateRegistration();
    setRegErrors(next);
    if (Object.keys(next).length > 0) return;

    setRegPending(true);
    setRegError(null);
    try {
      const payload = await api.post<RegisterPayload>('/auth/register', {
        role: 'DRIVER',
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        licenseNumber: form.licenseNumber.trim(),
        licenseExpiry: form.licenseExpiry,
        licenseClass: form.licenseClass.trim() || undefined,
        vehicle: {
          nickname: form.vehicleNickname.trim(),
          make: form.vehicleMake.trim(),
          model: form.vehicleModel.trim(),
          color: form.vehicleColor.trim(),
          plateNumber: form.plateNumber.trim().toUpperCase(),
          ...(form.capacity.trim() ? { capacity: Number(form.capacity) } : {}),
          ...(form.year.trim() ? { year: Number(form.year) } : {}),
        },
      });

      navigate('/verify-otp', {
        replace: true,
        state: {
          phone: payload.phone,
          purpose: 'REGISTRATION',
          expiresInSeconds: payload.expiresInSeconds,
          resendAfterSeconds: payload.resendAfterSeconds,
        },
      });
    } catch (cause) {
      setRegError(errorMessage(cause, 'We could not create your driver account.'));
    } finally {
      setRegPending(false);
    }
  }

  const busy = loginPending || regPending;

  return (
    <div className="bg-canvas-alt">
      <section className="mx-auto grid max-w-[1440px] items-start gap-10 px-6 py-10 md:px-10 lg:grid-cols-2 lg:gap-12 lg:py-16 xl:px-20">
        <AuthAside registerMode={registerMode} />

        <div className="rounded-[20px] border border-border bg-white p-6 shadow-card sm:p-8">
          {!registerMode ? (
            <div className="flex flex-col gap-[22px]">
              <span className="gt-badge gt-badge-primary self-start">DRIVER ACCESS</span>

              <div className="flex flex-col gap-2.5">
                <h2 className="text-[30px] font-bold leading-[1.2] text-heading">Sign in to drive</h2>
                <p className="text-[14px] text-muted">Use the mobile number or email on your driver account.</p>
              </div>

              <form className="flex flex-col gap-[22px]" onSubmit={onLoginSubmit} noValidate>
                <TextField
                  label="Phone Number"
                  name="identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="+63 917 555 0182"
                  leadingIcon="phone"
                  disabled={busy}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  error={loginFieldError.identifier}
                  hint="Mobile number or email address."
                />

                <TextField
                  label="Password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  leadingIcon="lock"
                  disabled={busy}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={loginFieldError.password}
                  trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((value) => !value)} />}
                />

                {loginError ? (
                  <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
                    {loginError}
                  </p>
                ) : null}

                <Button type="submit" loading={loginPending} block trailingIcon="arrow-right">
                  Sign In
                </Button>

                <Link to="/driver/register" className="gt-btn gt-btn-secondary gt-btn-block">
                  Create Driver Account
                </Link>

                <Notice tone="primary" icon="info" title="New to Guardian Transit?">
                  Your licence and vehicle are reviewed by the safety desk before you receive any ride requests.
                </Notice>

                <div className="flex flex-col gap-2 border-t border-border pt-4 text-[12px] text-muted">
                  <p className="font-semibold text-heading">Looking for another account?</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Link to="/login" className="font-semibold text-primary hover:underline">
                      Parent / guardian login
                    </Link>
                    <Link to="/student/login" className="font-semibold text-primary hover:underline">
                      Student login
                    </Link>
                    <Link to="/" className="font-semibold text-primary hover:underline">
                      Back to home
                    </Link>
                  </div>
                </div>

                <p className="text-[11px] text-muted">By logging in, you agree to our Terms and Privacy Policy.</p>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-[22px]">
              <span className="gt-badge gt-badge-primary self-start">NEW DRIVER</span>

              <div className="flex flex-col gap-2.5">
                <h2 className="text-[30px] font-bold leading-[1.2] text-heading">Register to drive</h2>
                <p className="text-[14px] text-muted">
                  We ask for your licence and vehicle details because you carry students home.
                </p>
              </div>

              <form className="flex flex-col gap-[18px]" onSubmit={onRegisterSubmit} noValidate>
                <div className="flex flex-col gap-4 rounded-[12px] bg-canvas-alt p-4">
                  <p className="text-[13px] font-bold text-heading">Your account</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="First Name"
                      name="firstName"
                      autoComplete="given-name"
                      disabled={busy}
                      value={form.firstName}
                      onChange={update('firstName')}
                      error={regErrors.firstName}
                    />
                    <TextField
                      label="Last Name"
                      name="lastName"
                      autoComplete="family-name"
                      disabled={busy}
                      value={form.lastName}
                      onChange={update('lastName')}
                      error={regErrors.lastName}
                    />
                  </div>
                  <TextField
                    label="Mobile Number"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+63 917 555 0148"
                    leadingIcon="phone"
                    disabled={busy}
                    value={form.phone}
                    onChange={update('phone')}
                    error={regErrors.phone}
                    hint="We send a one-time code to verify this number."
                  />
                  <TextField
                    label="Email (optional)"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    leadingIcon="message-square"
                    disabled={busy}
                    value={form.email}
                    onChange={update('email')}
                    error={regErrors.email}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      leadingIcon="lock"
                      disabled={busy}
                      value={form.password}
                      onChange={update('password')}
                      error={regErrors.password}
                      hint="8+ characters with a letter and a number."
                      trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((value) => !value)} />}
                    />
                    <TextField
                      label="Confirm Password"
                      name="confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      leadingIcon="lock"
                      disabled={busy}
                      value={form.confirm}
                      onChange={update('confirm')}
                      error={regErrors.confirm}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-[12px] bg-canvas-alt p-4">
                  <p className="text-[13px] font-bold text-heading">Driver licence</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Licence Number"
                      name="licenseNumber"
                      disabled={busy}
                      value={form.licenseNumber}
                      onChange={update('licenseNumber')}
                      error={regErrors.licenseNumber}
                    />
                    <TextField
                      label="Licence Expiry"
                      name="licenseExpiry"
                      type="date"
                      disabled={busy}
                      value={form.licenseExpiry}
                      onChange={update('licenseExpiry')}
                      error={regErrors.licenseExpiry}
                    />
                  </div>
                  <TextField
                    label="Licence Class (optional)"
                    name="licenseClass"
                    placeholder="Professional"
                    disabled={busy}
                    value={form.licenseClass}
                    onChange={update('licenseClass')}
                  />
                </div>

                <div className="flex flex-col gap-4 rounded-[12px] bg-canvas-alt p-4">
                  <p className="text-[13px] font-bold text-heading">Vehicle</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Vehicle Nickname"
                      name="vehicleNickname"
                      placeholder="Blue BaoBao"
                      disabled={busy}
                      value={form.vehicleNickname}
                      onChange={update('vehicleNickname')}
                      error={regErrors.vehicleNickname}
                    />
                    <TextField
                      label="Plate Number"
                      name="plateNumber"
                      placeholder="BB 2048"
                      disabled={busy}
                      value={form.plateNumber}
                      onChange={update('plateNumber')}
                      error={regErrors.plateNumber}
                    />
                    <TextField
                      label="Make"
                      name="vehicleMake"
                      placeholder="BaoBao"
                      disabled={busy}
                      value={form.vehicleMake}
                      onChange={update('vehicleMake')}
                      error={regErrors.vehicleMake}
                    />
                    <TextField
                      label="Model"
                      name="vehicleModel"
                      placeholder="Tuktuk"
                      disabled={busy}
                      value={form.vehicleModel}
                      onChange={update('vehicleModel')}
                      error={regErrors.vehicleModel}
                    />
                    <TextField
                      label="Colour"
                      name="vehicleColor"
                      placeholder="Blue"
                      disabled={busy}
                      value={form.vehicleColor}
                      onChange={update('vehicleColor')}
                      error={regErrors.vehicleColor}
                    />
                    <TextField
                      label="Seats (optional)"
                      name="capacity"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      placeholder="4"
                      disabled={busy}
                      value={form.capacity}
                      onChange={update('capacity')}
                      error={regErrors.capacity}
                    />
                    <TextField
                      label="Year (optional)"
                      name="year"
                      type="number"
                      inputMode="numeric"
                      min={1980}
                      max={2035}
                      placeholder="2022"
                      disabled={busy}
                      value={form.year}
                      onChange={update('year')}
                      error={regErrors.year}
                    />
                  </div>
                </div>

                <Notice tone="primary" icon="file-check" title="Verified before you drive">
                  Your licence, vehicle documents and background check are reviewed by the safety desk. You start
                  receiving ride requests once everything is verified.
                </Notice>

                {regError ? (
                  <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
                    {regError}
                  </p>
                ) : null}

                <Button type="submit" loading={regPending} block trailingIcon="arrow-right">
                  Create Driver Account
                </Button>

                <p className="text-center text-[13px] text-muted">
                  Already registered?{' '}
                  <Link to="/driver/login" className="font-semibold text-primary hover:underline">
                    Sign in
                  </Link>
                </p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-[12px] text-muted">
                  <Link to="/login" className="font-semibold text-primary hover:underline">
                    Parent / guardian login
                  </Link>
                  <Link to="/student/login" className="font-semibold text-primary hover:underline">
                    Student login
                  </Link>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 pb-6 md:px-10 xl:px-20">
        <p className="text-[12px] text-muted">Guardian Transit · Safe rides. Connected families.</p>
        <Link to="/" className="text-[12px] text-primary hover:underline">
          Back to home
        </Link>
      </section>
    </div>
  );
}

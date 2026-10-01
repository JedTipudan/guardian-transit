import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Notice,
  PageLoader,
  TextField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { badgeTone, formatCurrency, formatDate, verificationStatusLabel } from '../../lib/format';
import type { DriverMe, User } from '../../lib/types';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';
import { useToast } from '../../state/ToastContext';

/* -------------------------------------------------------------------------- */
/* API helpers (kept local to this screen)                                     */
/* -------------------------------------------------------------------------- */

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

interface ProfileBundle {
  user: User;
  driver: DriverMe;
}

interface ProfilePatch {
  firstName: string;
  lastName: string;
  email: string | null;
}

interface PasswordPayload {
  currentPassword: string;
  newPassword: string;
}

function loadProfile(signal: AbortSignal): Promise<ProfileBundle> {
  return Promise.all([
    api.get<{ user: User }>('/account/me', { signal }),
    api.get<DriverMe>('/driver/me', { signal }),
  ]).then(([account, driver]) => ({ user: account.user, driver }));
}

function patchProfile(payload: ProfilePatch) {
  return api.patch<{ user: User }>('/account/me', payload);
}

function postPasswordChange(payload: PasswordPayload) {
  return api.post<{ changed: boolean }>('/account/password', payload);
}

/** Mirrors server/src/lib/password.ts so weak passwords fail before a round-trip. */
function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters.');
  if (!/[A-Za-z]/.test(password)) issues.push('Include at least one letter.');
  if (!/[0-9]/.test(password)) issues.push('Include at least one number.');
  return issues;
}

/* -------------------------------------------------------------------------- */
/* Small local building blocks                                                 */
/* -------------------------------------------------------------------------- */

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

function CardHeading({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-heading">{title}</p>
        {hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-border bg-canvas-alt px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate text-[13px] font-semibold text-heading">{value}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

type AccountErrors = { firstName?: string; lastName?: string; email?: string };
type PasswordErrors = { current?: string; next?: string; confirm?: string };

export default function DriverProfile() {
  useDocumentTitle('Profile · Guardian Transit');

  const { setUser, logout } = useAuth();
  const { push } = useToast();
  const { browserPermission, requestBrowserPermission } = useNotifications();

  const profile = useAsync<ProfileBundle>(loadProfile, []);

  // --- account details form -------------------------------------------------
  const [accountForm, setAccountForm] = useState({ firstName: '', lastName: '', email: '' });
  const [accountErrors, setAccountErrors] = useState<AccountErrors>({});
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const saveAccount = useMutation(patchProfile);

  useEffect(() => {
    const loaded = profile.data?.user;
    if (!loaded || seededFor === loaded.id) return;
    setAccountForm({
      firstName: loaded.firstName,
      lastName: loaded.lastName,
      email: loaded.email ?? '',
    });
    setSeededFor(loaded.id);
  }, [profile.data, seededFor]);

  const updateAccount =
    (key: keyof typeof accountForm) => (event: { target: { value: string } }) =>
      setAccountForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSaveAccount(event: FormEvent) {
    event.preventDefault();
    const next: AccountErrors = {};
    if (accountForm.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
    if (accountForm.lastName.trim().length < 2) next.lastName = 'Enter your last name.';
    const email = accountForm.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) next.email = 'Enter a valid email address.';
    setAccountErrors(next);
    if (Object.keys(next).length > 0) return;

    const result = await saveAccount.run({
      firstName: accountForm.firstName.trim(),
      lastName: accountForm.lastName.trim(),
      email: email || null,
    });
    if (result) {
      setUser(result.user);
      push('Your profile details were saved.', 'success');
    }
  }

  // --- password form --------------------------------------------------------
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState<PasswordErrors>({});
  const [showPasswords, setShowPasswords] = useState(false);
  const savePassword = useMutation(postPasswordChange);

  const updatePassword =
    (key: keyof typeof pwForm) => (event: { target: { value: string } }) =>
      setPwForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    const issues = passwordIssues(pwForm.next);
    const next: PasswordErrors = {};
    if (!pwForm.current) next.current = 'Enter your current password.';
    if (issues.length > 0) next.next = issues[0];
    if (pwForm.confirm !== pwForm.next) next.confirm = 'Passwords do not match.';
    setPwErrors(next);
    if (Object.keys(next).length > 0) return;

    const result = await savePassword.run({
      currentPassword: pwForm.current,
      newPassword: pwForm.next,
    });
    if (result) {
      setPwForm({ current: '', next: '', confirm: '' });
      setPwErrors({});
      push('Your password was updated.', 'success');
    }
  }

  // --- session / notifications ---------------------------------------------
  const [loggingOut, setLoggingOut] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);

  async function onSignOut() {
    setLoggingOut(true);
    try {
      await logout();
      push('You are signed out.', 'info');
    } finally {
      setLoggingOut(false);
    }
  }

  async function onEnableNotifications() {
    setPermissionBusy(true);
    try {
      const result = await requestBrowserPermission();
      if (result === 'granted') push('Browser alerts enabled.', 'success');
      else if (result === 'denied') push('Your browser blocked notifications for this site.', 'error');
    } finally {
      setPermissionBusy(false);
    }
  }

  // --- initial load ---------------------------------------------------------
  if (!profile.data) {
    return (
      <div className="mx-auto flex w-full max-w-[840px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Profile</h1>
          <p className="text-[13px] text-muted">Your account, licence and notification preferences.</p>
        </div>
        {profile.error ? (
          <ErrorState title="We could not load your profile" message={profile.error} onRetry={profile.reload} />
        ) : (
          <PageLoader label="Loading your profile…" />
        )}
      </div>
    );
  }

  const { user, driver } = profile.data;
  const driverInfo = driver.driver;

  return (
    <div className="mx-auto flex w-full max-w-[840px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Profile</h1>
          <p className="text-[13px] text-muted">Your account, licence and notification preferences.</p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" onClick={profile.reload} disabled={profile.loading}>
          Refresh
        </Button>
      </div>

      {profile.error ? (
        <Notice tone="danger" icon="alert-triangle" title="Could not refresh your profile">
          {profile.error}{' '}
          <button type="button" onClick={profile.reload} className="font-semibold text-primary hover:underline">
            Retry
          </button>
        </Notice>
      ) : null}

      {/* Identity ----------------------------------------------------------- */}
      <section className="gt-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={user.fullName} src={user.avatarUrl} size={56} />
          <div className="min-w-0">
            <p className="text-[17px] font-bold leading-[1.3] text-heading">{user.fullName}</p>
            <p className="break-words text-[13px] text-muted">{user.phone}</p>
            <p className="break-words text-[12px] text-muted">{user.email ?? 'No email on file'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="navy">Driver</Badge>
              <Badge tone={driverInfo.isOnline ? 'success' : 'neutral'} icon="power">
                {driverInfo.isOnline ? 'Online' : 'Offline'}
              </Badge>
              <Badge tone={badgeTone(driverInfo.overallStatus)} icon="shield-check">
                {verificationStatusLabel(driverInfo.overallStatus)}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="secondary" icon="log-out" loading={loggingOut} onClick={() => void onSignOut()}>
          Sign out
        </Button>
      </section>

      {/* Forms --------------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="gt-card flex flex-col gap-4">
          <CardHeading icon="user-round" title="Account details" hint="Shown to the safety desk and to families." />
          <form className="flex flex-col gap-4" onSubmit={onSaveAccount} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="First Name"
                name="firstName"
                autoComplete="given-name"
                disabled={saveAccount.pending}
                value={accountForm.firstName}
                onChange={updateAccount('firstName')}
                error={accountErrors.firstName}
              />
              <TextField
                label="Last Name"
                name="lastName"
                autoComplete="family-name"
                disabled={saveAccount.pending}
                value={accountForm.lastName}
                onChange={updateAccount('lastName')}
                error={accountErrors.lastName}
              />
            </div>
            <TextField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              leadingIcon="message-square"
              disabled={saveAccount.pending}
              value={accountForm.email}
              onChange={updateAccount('email')}
              error={accountErrors.email}
              hint="Leave blank if you do not use email. Your mobile number cannot be changed here."
            />
            {saveAccount.error ? (
              <p className="gt-error-text" role="alert">
                {saveAccount.error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" icon="check" loading={saveAccount.pending}>
                Save changes
              </Button>
            </div>
          </form>
        </section>

        <section className="gt-card flex flex-col gap-4">
          <CardHeading icon="lock" title="Change password" hint="8+ characters with a letter and a number." />
          <form className="flex flex-col gap-4" onSubmit={onChangePassword} noValidate>
            <TextField
              label="Current Password"
              name="currentPassword"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="current-password"
              leadingIcon="lock"
              disabled={savePassword.pending}
              value={pwForm.current}
              onChange={updatePassword('current')}
              error={pwErrors.current}
              trailing={
                <PasswordToggle
                  shown={showPasswords}
                  onToggle={() => setShowPasswords((value) => !value)}
                />
              }
            />
            <TextField
              label="New Password"
              name="newPassword"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              leadingIcon="lock"
              disabled={savePassword.pending}
              value={pwForm.next}
              onChange={updatePassword('next')}
              error={pwErrors.next}
            />
            <TextField
              label="Confirm New Password"
              name="confirmPassword"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              leadingIcon="lock"
              disabled={savePassword.pending}
              value={pwForm.confirm}
              onChange={updatePassword('confirm')}
              error={pwErrors.confirm}
            />
            {savePassword.error ? (
              <p className="gt-error-text" role="alert">
                {savePassword.error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" icon="key" loading={savePassword.pending}>
                Update password
              </Button>
            </div>
          </form>
        </section>
      </div>

      {/* Driver record ------------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[16px] font-bold text-heading">
            <span className="text-primary">
              <Icon name="credit-card" size={18} />
            </span>
            Driver record
          </h2>
          <Link to="/driver/verification" className="text-[12px] font-semibold text-primary hover:underline">
            Verification details →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem icon="credit-card" label="Licence number" value={driverInfo.licenseNumber || '—'} />
          <InfoItem icon="calendar" label="Licence expiry" value={formatDate(driverInfo.licenseExpiry)} />
          <InfoItem
            icon="shield-check"
            label="Background check"
            value={verificationStatusLabel(driverInfo.backgroundCheckStatus)}
          />
          <InfoItem
            icon="badge-check"
            label="Verified"
            value={driverInfo.verifiedAt ? formatDate(driverInfo.verifiedAt) : 'Not yet'}
          />
          <InfoItem icon="star" label="Rating" value={`★ ${driverInfo.rating.toFixed(1)}`} />
          <InfoItem icon="check-circle" label="Completed trips" value={String(driverInfo.completedTrips)} />
          <InfoItem icon="wallet" label="Earnings today" value={formatCurrency(driver.stats.todayEarnings)} />
          <InfoItem icon="clock" label="Member since" value={formatDate(user.createdAt)} />
        </div>
        <p className="text-[12px] text-muted">
          Licence and document changes are handled by the safety desk —{' '}
          <Link to="/driver/verification" className="font-semibold text-primary hover:underline">
            see your verification status
          </Link>
          .
        </p>
      </section>

      {/* Vehicles ------------------------------------------------------------ */}
      <section className="gt-card flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-[16px] font-bold text-heading">
          <span className="text-primary">
            <Icon name="car" size={18} />
          </span>
          Vehicles
        </h2>
        {driver.vehicles.length === 0 ? (
          <EmptyState
            icon="car"
            title="No vehicle on file"
            description="Your vehicle is added during driver registration. Contact the safety desk to add or update it."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {driver.vehicles.map((vehicle) => (
              <li
                key={vehicle.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-canvas-alt px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-heading">
                    {vehicle.nickname} · {vehicle.plateNumber}
                  </p>
                  <p className="truncate text-[12px] text-muted">
                    {vehicle.make} {vehicle.model} · {vehicle.color} · {vehicle.capacity} seats
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={vehicle.isActive ? 'success' : 'neutral'}>
                    {vehicle.isActive ? 'In service' : 'Out of service'}
                  </Badge>
                  <Badge tone={badgeTone(vehicle.status)}>{verificationStatusLabel(vehicle.status)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Browser alerts ------------------------------------------------------ */}
      {browserPermission !== 'unsupported' ? (
        <section className="gt-card flex flex-col gap-4">
          <CardHeading
            icon="bell"
            title="Browser alerts"
            hint="Hear about assignments, arrivals and safety alerts outside this tab."
          />
          {browserPermission === 'granted' ? (
            <Notice tone="success" icon="check-circle" title="Browser alerts are on">
              New ride activity and safety alerts can appear as browser notifications.{' '}
              <Link to="/driver/notifications">Open your notification feed →</Link>
            </Notice>
          ) : browserPermission === 'denied' ? (
            <Notice tone="danger" icon="alert-triangle" title="Browser alerts are blocked">
              Your browser is blocking notifications for this site. Re-enable them in your browser settings to
              receive ride and safety alerts in the background.
            </Notice>
          ) : (
            <>
              <Notice tone="primary" icon="bell" title="Get alerts outside this tab">
                Allow notifications to hear about ride requests, pickup updates and safety alerts even when this
                tab is in the background.
              </Notice>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon="bell" loading={permissionBusy} onClick={() => void onEnableNotifications()}>
                  Enable browser notifications
                </Button>
                <Link to="/driver/notifications" className="gt-btn gt-btn-ghost">
                  Notification feed
                </Link>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

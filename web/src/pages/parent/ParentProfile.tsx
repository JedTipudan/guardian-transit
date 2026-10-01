import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import type { StudentListItem, User } from '../../lib/types';
import { useAuth } from '../../state/AuthContext';
import { useMeta } from '../../state/MetaContext';
import { useNotifications } from '../../state/NotificationsContext';
import { useToast } from '../../state/ToastContext';
import { Icon } from '../../components/Icon';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Modal,
  Notice,
  PageLoader,
  SelectField,
  Skeleton,
  TextField,
} from '../../components/ui';

interface ProfileForm {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  preferredContact: string;
}

interface ProfilePatch {
  firstName: string;
  lastName: string;
  email: string | null;
  address: string | null;
  preferredContact: string;
}

type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

/** Mirrors the server's password rules so the form and API always agree. */
function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters.');
  if (password.length > 128) issues.push('Password is too long.');
  if (!/[A-Za-z]/.test(password)) issues.push('Include at least one letter.');
  if (!/[0-9]/.test(password)) issues.push('Include at least one number.');
  return issues;
}

function toForm(user: User): ProfileForm {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? '',
    address: user.parentProfile?.address ?? '',
    preferredContact: user.parentProfile?.preferredContact ?? 'PHONE',
  };
}

export default function ParentProfile() {
  useDocumentTitle('Parent profile · Guardian Transit');
  const navigate = useNavigate();
  const { setUser, logout } = useAuth();
  const meta = useMeta();
  const { push } = useToast();
  const { unread, browserPermission, requestBrowserPermission } = useNotifications();

  const accountQuery = useAsync<{ user: User }>((signal) => api.get('/account/me', { signal }), []);
  const accountUser = accountQuery.data?.user ?? null;

  const childrenQuery = useAsync<{ students: StudentListItem[] }>(
    (signal) => api.get('/students', { signal }),
    [],
  );
  const children = childrenQuery.data?.students ?? [];

  const [form, setForm] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});

  // Seed the editor once per loaded account so typing is never clobbered by a refetch.
  useEffect(() => {
    if (!accountUser) return;
    setForm((current) => current ?? toForm(accountUser));
  }, [accountUser]);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
  }>({});
  const [permissionBusy, setPermissionBusy] = useState(false);

  const saveMutation = useMutation(async (body: ProfilePatch) =>
    api.patch<{ user: User }>('/account/me', body),
  );
  const passwordMutation = useMutation(async (body: { currentPassword: string; newPassword: string }) =>
    api.post<{ changed: boolean }>('/account/password', body),
  );
  const signOut = useMutation(async () => logout());

  const dirty = Boolean(
    form && accountUser && JSON.stringify(form) !== JSON.stringify(toForm(accountUser)),
  );

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    if (!form) return;

    const next: ProfileErrors = {};
    if (form.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
    if (form.lastName.trim().length < 2) next.lastName = 'Enter your last name.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (form.address.trim().length > 0 && form.address.trim().length < 4) {
      next.address = 'Enter a full address, or leave it blank.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const result = await saveMutation.run({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() ? form.email.trim() : null,
      address: form.address.trim() ? form.address.trim() : null,
      preferredContact: form.preferredContact,
    });
    if (result) {
      setUser(result.user);
      setForm(toForm(result.user));
      push('Profile updated.', 'success');
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    const next: { current?: string; next?: string; confirm?: string } = {};
    if (!passwords.current) next.current = 'Enter your current password.';
    const issues = passwordIssues(passwords.next);
    if (issues.length) next.next = issues[0];
    if (passwords.confirm !== passwords.next) next.confirm = 'Passwords do not match.';
    setPasswordErrors(next);
    if (Object.keys(next).length > 0) return;

    const result = await passwordMutation.run({
      currentPassword: passwords.current,
      newPassword: passwords.next,
    });
    if (result?.changed) {
      setPasswordOpen(false);
      setPasswords({ current: '', next: '', confirm: '' });
      push('Password updated.', 'success');
    }
  }

  async function onEnableBrowserAlerts() {
    setPermissionBusy(true);
    try {
      const next = await requestBrowserPermission();
      push(
        next === 'granted'
          ? 'Browser alerts enabled.'
          : next === 'denied'
            ? 'Browser alerts are blocked — allow them in your browser settings.'
            : next === 'unsupported'
              ? 'This browser does not support notifications.'
              : 'Browser alerts unchanged.',
        next === 'granted' ? 'success' : 'info',
      );
    } finally {
      setPermissionBusy(false);
    }
  }

  async function onLogout() {
    await signOut.run();
    navigate('/login', { replace: true });
  }

  if (accountQuery.loading && !accountQuery.data) {
    return <PageLoader label="Loading your profile…" />;
  }
  if (accountQuery.error && !accountQuery.data) {
    return (
      <ErrorState
        title="We could not load your profile"
        message={accountQuery.error}
        onRetry={accountQuery.reload}
      />
    );
  }
  if (!accountUser || !form) {
    return (
      <EmptyState
        icon="user-round"
        title="No profile to show"
        description="Your account details are unavailable. Sign in again to continue."
        action={
          <LinkButton to="/login" icon="log-out">
            Go to sign in
          </LinkButton>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* --- Heading ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">Parent Profile</h1>
        <p className="text-[14px] text-muted">
          Your account, connected children and monitoring preferences.
        </p>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        {/* --- Identity column ------------------------------------------ */}
        <div className="flex w-full flex-col gap-6 xl:w-[340px] xl:shrink-0">
          <section className="gt-card flex flex-col gap-4" aria-label="Parent information">
            <div className="flex items-center gap-3.5">
              <Avatar name={accountUser.fullName} src={accountUser.avatarUrl} size={60} />
              <div className="min-w-0">
                <p className="truncate text-[20px] font-bold leading-[1.5] text-heading">
                  {accountUser.fullName}
                </p>
                <Badge tone="primary" icon="shield-check">
                  Parent / guardian
                </Badge>
              </div>
            </div>

            <form className="flex flex-col gap-4" onSubmit={onSaveProfile} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="First name"
                  name="firstName"
                  value={form.firstName}
                  error={errors.firstName}
                  onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                />
                <TextField
                  label="Last name"
                  name="lastName"
                  value={form.lastName}
                  error={errors.lastName}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                />
              </div>

              <TextField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                error={errors.email}
                hint="Optional — used for account recovery."
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />

              <TextField
                label="Phone number"
                name="phone"
                value={accountUser.phone}
                readOnly
                leadingIcon="phone"
                hint="This number receives trip updates. Contact support to change it."
                onChange={() => undefined}
              />

              <TextField
                label="Home address"
                name="address"
                value={form.address}
                error={errors.address}
                placeholder="Where pickups happen"
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />

              <SelectField
                label="Preferred contact"
                name="preferredContact"
                value={form.preferredContact}
                onChange={(event) => setForm({ ...form, preferredContact: event.target.value })}
              >
                <option value="PHONE">Phone call</option>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
              </SelectField>

              {saveMutation.error ? <p className="gt-error-text">{saveMutation.error}</p> : null}

              <Button type="submit" block icon="check" loading={saveMutation.pending} disabled={!dirty}>
                Save Profile
              </Button>
              {!dirty ? <p className="gt-hint">Nothing has changed yet.</p> : null}
            </form>
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Connected children">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Connected child</h2>
              <Link to="/parent/guardians" className="text-[12px] font-semibold text-primary hover:underline">
                Manage
              </Link>
            </div>

            {childrenQuery.loading && !childrenQuery.data ? (
              <div className="flex flex-col gap-3">
                <Skeleton height={72} className="rounded-[12px]" />
                <Skeleton height={72} className="rounded-[12px]" />
              </div>
            ) : childrenQuery.error ? (
              <ErrorState
                title="We could not load your children"
                message={childrenQuery.error}
                onRetry={childrenQuery.reload}
              />
            ) : children.length === 0 ? (
              <EmptyState
                icon="users"
                title="No child linked yet"
                description="Link a student code to follow their trips, rewards and live location."
                action={
                  <LinkButton to="/parent/guardians" icon="plus">
                    Link a child
                  </LinkButton>
                }
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {children.map((child) => (
                  <li
                    key={child.id}
                    className="flex flex-col gap-3 rounded-[12px] border border-border bg-white p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={child.name} src={child.avatarUrl} size={56} tone="success" />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-heading">{child.name}</p>
                        <p className="truncate text-[12px] text-muted">
                          {child.school} · {child.grade}
                        </p>
                        <p className="truncate text-[12px] text-primary">
                          Connected to {accountUser.fullName}
                        </p>
                      </div>
                    </div>

                    <dl className="flex flex-col gap-1.5 text-[13px] leading-[1.6]">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Student ID</dt>
                        <dd className="font-semibold text-heading">{child.studentCode}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Reward points</dt>
                        <dd className="font-semibold text-heading">{child.points}</dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap items-center gap-2">
                      {child.activeRide ? (
                        <span className="gt-badge gt-badge-primary">
                          Trip {child.activeRide.code} active
                        </span>
                      ) : (
                        <span className="gt-badge gt-badge-success">Connected ✓</span>
                      )}
                      {child.activeRide ? (
                        <Link
                          to="/parent/live"
                          className="text-[12px] font-semibold text-primary hover:underline"
                        >
                          Follow live →
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <LinkButton to="/parent/guardians" variant="secondary" block icon="users">
              Manage child connection
            </LinkButton>
          </section>

          <Notice tone="primary" icon="lock" title="A private family connection">
            Only your connected child’s active trip is visible from this account. Location sharing stops the
            moment the ride ends.
          </Notice>
        </div>

        {/* --- Settings column ------------------------------------------ */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section className="gt-card flex flex-col gap-4" aria-label="Notification settings">
            <h2 className="text-[20px] font-bold leading-[1.5] text-heading">Notification settings</h2>
            <p className="text-[13px] text-muted">
              Ride confirmations, pickup updates and arrival notifications reach you in the app feed, and can
              also be pushed by this browser.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-canvas-alt px-3.5 py-3">
              <span className="flex items-center gap-3 text-[13px] text-heading">
                <Icon name="bell" size={17} className="text-muted" />
                Browser alerts
              </span>
              {browserPermission === 'granted' ? (
                <Badge tone="success" icon="check-circle">
                  Enabled
                </Badge>
              ) : browserPermission === 'denied' ? (
                <Badge tone="danger" icon="alert-triangle">
                  Blocked
                </Badge>
              ) : browserPermission === 'unsupported' ? (
                <Badge tone="neutral">Not supported</Badge>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="bell"
                  loading={permissionBusy}
                  onClick={() => void onEnableBrowserAlerts()}
                >
                  Enable
                </Button>
              )}
            </div>
            {browserPermission === 'denied' ? (
              <p className="gt-hint">
                Your browser is blocking notifications for this site — re-enable them in your browser settings.
              </p>
            ) : null}

            <LinkButton to="/parent/notifications" variant="secondary" block icon="list">
              {unread > 0 ? `Open notifications · ${unread} unread` : 'Open notifications'}
            </LinkButton>
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Location monitoring settings">
            <h2 className="text-[20px] font-bold leading-[1.5] text-heading">Location monitoring</h2>
            <Notice tone="success" icon="map-pin" title="Sharing ends on arrival">
              Monitoring does not enable tracking outside an active ride. Your child’s location is shared only
              with their connected guardian, and only from pickup until drop-off.
            </Notice>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-canvas-alt px-3.5 py-3">
              <span className="flex items-center gap-3 text-[13px] text-heading">
                <Icon name="radio" size={17} className="text-muted" />
                Live trip monitoring
              </span>
              <Link to="/parent/live" className="text-[12px] font-semibold text-primary hover:underline">
                Open Live Trip →
              </Link>
            </div>
            <p className="text-[12px] text-muted">
              Delayed updates are flagged on the map with the exact time of the last position we received, so
              you are never shown stale data as if it were live.
            </p>
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Account settings">
            <h2 className="text-[20px] font-bold leading-[1.5] text-heading">Account settings</h2>

            <button
              type="button"
              onClick={() => {
                setPasswordErrors({});
                setPasswordOpen(true);
              }}
              className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-2 text-left text-[14px] text-heading transition hover:text-primary"
            >
              <span className="flex items-center gap-3">
                <Icon name="lock" size={17} className="text-muted" />
                <span>
                  <span className="block font-bold">Password &amp; security</span>
                  <span className="block text-[12px] text-muted">
                    Update your password and protect your account.
                  </span>
                </span>
              </span>
              <Icon name="chevron-right" size={16} className="shrink-0 text-muted" />
            </button>

            <div className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-2">
              <span className="flex items-center gap-3 text-[14px] text-heading">
                <Icon name="phone" size={17} className="text-muted" />
                <span>
                  <span className="block font-bold">Signed-in sessions</span>
                  <span className="block text-[12px] text-muted">
                    Current session · Parent web browser
                  </span>
                </span>
              </span>
            </div>

            {meta?.supportEmail ? (
              <a
                href={`mailto:${meta.supportEmail}`}
                className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-2 text-[14px] text-heading transition hover:text-primary"
              >
                <span className="flex items-center gap-3">
                  <Icon name="life-buoy" size={17} className="text-muted" />
                  <span>
                    <span className="block font-bold">Help &amp; support</span>
                    <span className="block text-[12px] text-muted">{meta.supportEmail}</span>
                  </span>
                </span>
                <Icon name="chevron-right" size={16} className="shrink-0 text-muted" />
              </a>
            ) : null}
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Privacy">
            <h2 className="text-[20px] font-bold leading-[1.5] text-heading">Privacy</h2>
            <p className="text-[13px] text-muted">
              Your parent account can access your connected child’s trip details. Live location is limited to
              active rides and automatically turns off on arrival. Guardian links can be revoked at any time
              from the guardians screen.
            </p>
            <div className="flex flex-wrap gap-4">
              <span className="text-[13px] font-semibold text-primary">Privacy Policy</span>
              <span className="text-[13px] font-semibold text-primary">Terms of Service</span>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              icon="log-out"
              loading={signOut.pending}
              onClick={() => void onLogout()}
            >
              Log out
            </Button>
            <LinkButton to="/parent" variant="ghost" icon="layout-dashboard">
              Back to dashboard
            </LinkButton>
          </div>
        </div>
      </div>

      {/* --- Password dialog -------------------------------------------- */}
      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Password & security"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)} disabled={passwordMutation.pending}>
              Cancel
            </Button>
            <Button
              loading={passwordMutation.pending}
              onClick={(event) => void onChangePassword(event as unknown as FormEvent)}
            >
              Update password
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={onChangePassword} noValidate>
          <TextField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            leadingIcon="lock"
            value={passwords.current}
            error={passwordErrors.current}
            onChange={(event) => setPasswords((prev) => ({ ...prev, current: event.target.value }))}
          />
          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            leadingIcon="key"
            value={passwords.next}
            error={passwordErrors.next}
            hint="At least 8 characters with a number."
            onChange={(event) => setPasswords((prev) => ({ ...prev, next: event.target.value }))}
          />
          <TextField
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            leadingIcon="key"
            value={passwords.confirm}
            error={passwordErrors.confirm}
            onChange={(event) => setPasswords((prev) => ({ ...prev, confirm: event.target.value }))}
          />
          {passwordMutation.error ? <p className="gt-error-text">{passwordMutation.error}</p> : null}
          <Notice tone="primary" icon="shield-check">
            Changing your password keeps your session active on this device.
          </Notice>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>
    </div>
  );
}

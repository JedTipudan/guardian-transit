import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
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
  Skeleton,
  TextField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import type { User } from '../../lib/types';
import { useAuth } from '../../state/AuthContext';
import { useMeta } from '../../state/MetaContext';
import { useNotifications } from '../../state/NotificationsContext';
import { useToast } from '../../state/ToastContext';

interface Guardian {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  since: string;
}

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  school: string;
  grade: string;
  homeAddress: string;
};

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] bg-canvas-alt px-3.5 py-2.5">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="truncate text-[13px] font-semibold text-heading">{value}</span>
    </div>
  );
}

/** Student profile: identity card, connected guardian, settings and session actions. */
export default function StudentProfile() {
  useDocumentTitle('Your profile · Guardian Transit');
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();
  const meta = useMeta();
  const { push } = useToast();
  const { unread, browserPermission, requestBrowserPermission } = useNotifications();

  const studentId = user?.studentProfile?.id ?? null;

  const guardians = useAsync<{ guardians: Guardian[] }>(
    (signal) =>
      api.get<{ guardians: Guardian[] }>(`/guardians/students/${studentId}/guardians`, { signal }),
    [studentId],
    { enabled: Boolean(studentId) },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    school: user?.studentProfile?.school ?? '',
    grade: user?.studentProfile?.grade ?? '',
    homeAddress: user?.studentProfile?.homeAddress ?? '',
  });
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [profileError, setProfileError] = useState<string | null>(null);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const saveProfile = useMutation(async (body: ProfileForm) =>
    api.patch<{ user: User }>('/account/me', body),
  );
  const changePassword = useMutation(async (body: { currentPassword: string; newPassword: string }) =>
    api.post<{ changed: boolean }>('/account/password', body),
  );
  const signOut = useMutation(async () => logout());

  const connected = guardians.data?.guardians ?? [];
  const leadGuardian = connected[0] ?? null;

  function openEdit() {
    setProfile({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      school: user?.studentProfile?.school ?? '',
      grade: user?.studentProfile?.grade ?? '',
      homeAddress: user?.studentProfile?.homeAddress ?? '',
    });
    setProfileErrors({});
    setProfileError(null);
    setEditOpen(true);
  }

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    const next: ProfileErrors = {};
    if (profile.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
    if (profile.lastName.trim().length < 2) next.lastName = 'Enter your last name.';
    if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (profile.school.trim().length < 2) next.school = 'Tell us which school you attend.';
    if (!profile.grade.trim()) next.grade = 'Tell us your grade level.';
    if (profile.homeAddress.trim().length < 4) next.homeAddress = 'Enter your home address for pickups.';
    setProfileErrors(next);
    if (Object.keys(next).length > 0) return;

    const result = await saveProfile.run({
      firstName: profile.firstName.trim(),
      lastName: profile.lastName.trim(),
      email: profile.email.trim(),
      school: profile.school.trim(),
      grade: profile.grade.trim(),
      homeAddress: profile.homeAddress.trim(),
    });
    if (result) {
      setUser(result.user);
      setEditOpen(false);
      push('Profile updated.', 'success');
    } else if (saveProfile.error) {
      setProfileError(saveProfile.error);
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

    const result = await changePassword.run({
      currentPassword: passwords.current,
      newPassword: passwords.next,
    });
    if (result?.changed) {
      setPasswordOpen(false);
      setPasswords({ current: '', next: '', confirm: '' });
      setPasswordError(null);
      push('Password updated.', 'success');
    } else if (changePassword.error) {
      setPasswordError(changePassword.error);
    }
  }

  async function onToggleBrowserAlerts() {
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
    navigate('/student/login', { replace: true });
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <PageLoader label="Loading your profile…" />
      </div>
    );
  }

  return (
    <>
      <StudentHeader
        title="Your profile"
        subtitle={user.status === 'ACTIVE' ? 'Student account' : `Account · ${user.status.toLowerCase()}`}
        right={
          <Link
            to="/student/notifications"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
          >
            <Icon name="bell" size={18} />
            {unread > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            ) : null}
          </Link>
        }
      />

      <div className="flex flex-col gap-[22px] px-5 pb-7 pt-[18px]">
        {/* Identity */}
        <section className="gt-card flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} src={user.avatarUrl} size={72} />
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-[22px] font-bold leading-[1.3] text-heading">{user.fullName}</p>
              <Badge tone="primary" icon="shield-check">
                Student account
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <InfoRow label="Student ID" value={user.studentProfile?.studentCode ?? 'Not available'} />
            <InfoRow
              label="School · Grade"
              value={
                user.studentProfile
                  ? `${user.studentProfile.school} · ${user.studentProfile.grade}`
                  : 'Not available'
              }
            />
            <InfoRow label="Phone number" value={user.phone} />
            {user.studentProfile?.homeAddress ? (
              <InfoRow label="Home address" value={user.studentProfile.homeAddress} />
            ) : null}
            {user.email ? <InfoRow label="Email" value={user.email} /> : null}
          </div>

          <Button variant="secondary" block icon="user-round" onClick={openEdit}>
            Edit profile
          </Button>
        </section>

        {/* Connected guardian */}
        <section className="gt-card flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold leading-[1.45] text-heading">Connected guardian</h2>
            <Link to="/student/guardians" className="text-[12px] font-semibold text-primary hover:underline">
              Manage
            </Link>
          </div>

          {!studentId ? (
            <EmptyState
              icon="users"
              title="No student profile on this account"
              description="Guardian connections appear once this account is linked to a student profile."
            />
          ) : guardians.loading ? (
            <div className="flex flex-col gap-2.5">
              <Skeleton height={64} className="rounded-[12px]" />
              <Skeleton height={64} className="rounded-[12px]" />
            </div>
          ) : guardians.error ? (
            <ErrorState
              title="We could not load your guardians"
              message={guardians.error}
              onRetry={guardians.reload}
            />
          ) : connected.length === 0 ? (
            <EmptyState
              icon="users"
              title="No guardian connected yet"
              description="Share your student code so a parent or guardian can follow your trips."
              action={
                <LinkButton to="/student/guardians" icon="share">
                  Open guardians
                </LinkButton>
              }
            />
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                {connected.map((guardian) => (
                  <div
                    key={guardian.id}
                    className="flex items-center gap-3 rounded-[12px] border border-border bg-white p-3"
                  >
                    <Avatar name={guardian.name} src={guardian.avatarUrl} size={44} tone="success" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-heading">{guardian.name}</p>
                      <p className="truncate text-[12px] text-muted">{guardian.phone}</p>
                    </div>
                    <Icon name="badge-check" size={20} className="shrink-0 text-success" />
                  </div>
                ))}
              </div>
              <Badge tone="success" icon="check-circle">
                {connected.length === 1 ? 'Connected' : `${connected.length} connected`}
              </Badge>
            </>
          )}
        </section>

        <Notice tone="success" icon="map-pin" title="Location sharing status · ON">
          {leadGuardian
            ? `Shared with ${leadGuardian.name} only during your active ride. Automatically turns off on arrival.`
            : 'Shared with your guardian only during your active ride. Automatically turns off on arrival.'}
        </Notice>

        {/* Account settings */}
        <section className="gt-card flex flex-col gap-3">
          <h2 className="text-[18px] font-bold leading-[1.45] text-heading">Account settings</h2>

          <Link
            to="/student/notifications"
            className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-2 text-[14px] text-heading transition hover:text-primary"
          >
            <span className="flex items-center gap-3">
              <Icon name="bell" size={17} className="text-muted" />
              Notifications
            </span>
            <Icon name="chevron-right" size={16} className="text-muted" />
          </Link>

          <button
            type="button"
            onClick={() => setPasswordOpen(true)}
            className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-2 text-left text-[14px] text-heading transition hover:text-primary"
          >
            <span className="flex items-center gap-3">
              <Icon name="lock" size={17} className="text-muted" />
              Password &amp; security
            </span>
            <Icon name="chevron-right" size={16} className="text-muted" />
          </button>

          <button
            type="button"
            onClick={() => setPrivacyOpen((value) => !value)}
            aria-expanded={privacyOpen}
            className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-2 text-left text-[14px] text-heading transition hover:text-primary"
          >
            <span className="flex items-center gap-3">
              <Icon name="map-pin" size={17} className="text-muted" />
              Privacy &amp; location sharing
            </span>
            <Icon name={privacyOpen ? 'chevron-up' : 'chevron-down'} size={16} className="text-muted" />
          </button>
          {privacyOpen ? (
            <p className="rounded-[12px] bg-canvas-alt px-3.5 py-3 text-[12px] leading-[1.6] text-muted">
              Your live location is shared with connected guardians only while a ride is active — from pickup
              until you arrive. Nothing is shared between trips, and every guardian connection can be revoked
              from the guardians screen.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] px-1 py-2">
            <span className="flex items-center gap-3 text-[14px] text-heading">
              <Icon name="radio" size={17} className="text-muted" />
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
              <Button variant="secondary" size="sm" icon="bell" loading={permissionBusy} onClick={() => void onToggleBrowserAlerts()}>
                Enable
              </Button>
            )}
          </div>
          {browserPermission === 'denied' ? (
            <p className="gt-hint">
              Your browser is blocking notifications for this site — re-enable them in your browser settings.
            </p>
          ) : null}

          {meta?.supportEmail ? (
            <a
              href={`mailto:${meta.supportEmail}`}
              className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-2 text-[14px] text-heading transition hover:text-primary"
            >
              <span className="flex items-center gap-3">
                <Icon name="message-square" size={17} className="text-muted" />
                Help &amp; support
              </span>
              <Icon name="chevron-right" size={16} className="text-muted" />
            </a>
          ) : (
            <p className="gt-hint">Support contact is not configured yet — ask your school office to reach us.</p>
          )}
        </section>

        <Button variant="secondary" block icon="log-out" loading={signOut.pending} onClick={() => void onLogout()}>
          Log out
        </Button>
      </div>

      {/* Edit profile */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit profile"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button loading={saveProfile.pending} onClick={(event) => void onSaveProfile(event as unknown as FormEvent)}>
              Save changes
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={onSaveProfile} noValidate>
          <TextField
            label="First name"
            name="firstName"
            value={profile.firstName}
            onChange={(event) => setProfile((prev) => ({ ...prev, firstName: event.target.value }))}
            error={profileErrors.firstName}
          />
          <TextField
            label="Last name"
            name="lastName"
            value={profile.lastName}
            onChange={(event) => setProfile((prev) => ({ ...prev, lastName: event.target.value }))}
            error={profileErrors.lastName}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={profile.email}
            onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
            error={profileErrors.email}
            hint="Optional — used for account recovery."
          />
          <TextField
            label="School"
            name="school"
            value={profile.school}
            onChange={(event) => setProfile((prev) => ({ ...prev, school: event.target.value }))}
            error={profileErrors.school}
          />
          <TextField
            label="Grade"
            name="grade"
            value={profile.grade}
            onChange={(event) => setProfile((prev) => ({ ...prev, grade: event.target.value }))}
            error={profileErrors.grade}
          />
          <TextField
            label="Home address"
            name="homeAddress"
            value={profile.homeAddress}
            onChange={(event) => setProfile((prev) => ({ ...prev, homeAddress: event.target.value }))}
            error={profileErrors.homeAddress}
            hint="Your default pickup point."
          />
          {profileError ? <p className="gt-error-text">{profileError}</p> : null}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      {/* Password & security */}
      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Password & security"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={changePassword.pending}
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
            onChange={(event) => setPasswords((prev) => ({ ...prev, current: event.target.value }))}
            error={passwordErrors.current}
          />
          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            leadingIcon="key"
            value={passwords.next}
            onChange={(event) => setPasswords((prev) => ({ ...prev, next: event.target.value }))}
            error={passwordErrors.next}
            hint="At least 8 characters with a number."
          />
          <TextField
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            leadingIcon="key"
            value={passwords.confirm}
            onChange={(event) => setPasswords((prev) => ({ ...prev, confirm: event.target.value }))}
            error={passwordErrors.confirm}
          />
          {passwordError ? <p className="gt-error-text">{passwordError}</p> : null}
          <Notice tone="primary" icon="shield-check">
            Changing your password keeps your session active on this device.
          </Notice>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>
    </>
  );
}

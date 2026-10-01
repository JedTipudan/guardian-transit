import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, EmptyState, ErrorState, Modal, PageLoader, SegmentedControl, SelectField, TextField, TextareaField } from '../../components/ui';
import { api } from '../../lib/api';
import { badgeTone, formatDateTime, relativeTime, verificationStatusLabel } from '../../lib/format';
import { useAsync, useDebounced, useDocumentTitle, useMutation } from '../../lib/hooks';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import type { AdminUser, Role } from '../../lib/types';

type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

interface UsersPayload {
  users: AdminUser[];
}

interface StudentRecord {
  id: string;
  studentCode: string;
  name: string;
  points: number;
}

interface StudentsPayload {
  students: StudentRecord[];
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'STUDENT', label: 'Students' },
  { value: 'PARENT', label: 'Parents' },
  { value: 'DRIVER', label: 'Drivers' },
  { value: 'ADMIN', label: 'Admins' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Any status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'DEACTIVATED', label: 'Deactivated' },
];

const TARGET_STATUS_OPTIONS: { value: AccountStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active — allow sign-in' },
  { value: 'PENDING', label: 'Pending — await verification' },
  { value: 'SUSPENDED', label: 'Suspended — block sign-in now' },
  { value: 'DEACTIVATED', label: 'Deactivated — close the account' },
];

function roleTone(role: Role): 'navy' | 'primary' | 'success' | 'neutral' {
  switch (role) {
    case 'ADMIN':
      return 'navy';
    case 'DRIVER':
      return 'primary';
    case 'PARENT':
      return 'success';
    default:
      return 'neutral';
  }
}

export default function AdminUsers() {
  useDocumentTitle('Users · Guardian Transit');
  const { push } = useToast();
  const { user: me } = useAuth();

  const [role, setRole] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);

  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [nextStatus, setNextStatus] = useState<AccountStatus>('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [pointsTarget, setPointsTarget] = useState<AdminUser | null>(null);
  const [delta, setDelta] = useState('10');
  const [pointNote, setPointNote] = useState('');
  const [pointsError, setPointsError] = useState<string | null>(null);

  const users = useAsync<UsersPayload>(
    (signal) =>
      api.get('/admin/users', {
        signal,
        query: { role, q: debouncedSearch.trim() || undefined },
      }),
    [role, debouncedSearch],
  );

  // Student profiles carry the id the points ledger is keyed by, so the list is
  // only fetched while a points dialog is open.
  const students = useAsync<StudentsPayload>((signal) => api.get('/students', { signal }), [], {
    enabled: pointsTarget !== null,
  });

  const statusMutation = useMutation(
    async (id: string, status: AccountStatus, reason: string): Promise<string> => {
      const body: { status: AccountStatus; reason?: string } = { status };
      if (reason) body.reason = reason;
      await api.patch(`/admin/users/${id}/status`, body);
      return 'saved';
    },
  );

  const pointsMutation = useMutation(
    async (studentId: string, amount: number, note: string): Promise<{ balance: number }> =>
      api.post<{ entry: unknown; balance: number }>('/admin/points/adjust', { studentId, delta: amount, note }),
  );

  const allUsers = useMemo(() => users.data?.users ?? [], [users.data]);
  const visible = useMemo(
    () => (statusFilter === 'ALL' ? allUsers : allUsers.filter((entry) => entry.status === statusFilter)),
    [allUsers, statusFilter],
  );

  const pointsStudent = useMemo(() => {
    if (!pointsTarget?.studentCode) return null;
    return students.data?.students.find((entry) => entry.studentCode === pointsTarget.studentCode) ?? null;
  }, [pointsTarget, students.data]);

  const hasFilters = role !== 'ALL' || statusFilter !== 'ALL' || debouncedSearch.trim() !== '';

  function resetFilters() {
    setRole('ALL');
    setStatusFilter('ALL');
    setSearch('');
  }

  function openStatusDialog(entry: AdminUser) {
    setStatusTarget(entry);
    setNextStatus(entry.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
    setStatusReason('');
    statusMutation.setError(null);
  }

  async function submitStatus() {
    if (!statusTarget) return;
    const result = await statusMutation.run(statusTarget.id, nextStatus, statusReason.trim());
    if (result === null) return;
    push(`${statusTarget.name} is now ${nextStatus.toLowerCase()}.`, 'success');
    setStatusTarget(null);
    users.reload();
  }

  function openPointsDialog(entry: AdminUser) {
    setPointsTarget(entry);
    setDelta('10');
    setPointNote('');
    setPointsError(null);
    pointsMutation.setError(null);
  }

  async function submitPoints() {
    if (!pointsTarget || !pointsStudent) return;
    const amount = Number(delta);
    const trimmed = pointNote.trim();
    if (!Number.isInteger(amount) || amount === 0 || amount < -100 || amount > 100) {
      setPointsError('Enter a whole number between -100 and 100, and not zero.');
      return;
    }
    if (trimmed.length < 3) {
      setPointsError('Add a short reason for the adjustment (at least 3 characters).');
      return;
    }
    setPointsError(null);
    const result = await pointsMutation.run(pointsStudent.id, amount, trimmed);
    if (result === null) return;
    push(`Adjustment saved. ${pointsStudent.name} now has ${result.balance} points.`, 'success');
    setPointsTarget(null);
    students.reload();
  }

  const parsedDelta = Number(delta);
  const previewBalance =
    pointsStudent && Number.isFinite(parsedDelta)
      ? Math.max(0, pointsStudent.points + (Number.isInteger(parsedDelta) ? parsedDelta : 0))
      : null;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="gt-eyebrow">Safety desk</p>
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading md:text-[30px]">Users</h1>
          <p className="text-[13px] text-muted">
            Every account on Guardian Transit — suspend accounts and correct guardian point balances.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" loading={users.loading} onClick={users.reload}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <SegmentedControl value={role} options={ROLE_OPTIONS} onChange={setRole} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            label="Search name, phone or email"
            name="user-search"
            leadingIcon="search"
            placeholder="e.g. Ramon, +63 917…"
            value={search}
            wrapClassName="sm:flex-1"
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="sm:w-52">
            <SelectField
              label="Status"
              name="user-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </div>
          {hasFilters ? (
            <Button variant="ghost" icon="x" className="sm:mb-0.5" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {users.loading && !users.data ? (
        <PageLoader label="Loading accounts…" />
      ) : users.error ? (
        <ErrorState title="We could not load users" message={users.error} onRetry={users.reload} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="users"
          title={hasFilters ? 'No accounts match these filters' : 'No accounts yet'}
          description={
            hasFilters
              ? 'Try another role, status or search term.'
              : 'Registered students, parents, drivers and admins appear here.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-[12px] text-muted">
            Showing {visible.length} of {allUsers.length} account{allUsers.length === 1 ? '' : 's'}
            {allUsers.length === 100 ? ' · this view is capped at 100 — narrow the search to see more' : ''}.
            {statusFilter !== 'ALL' ? ' Status filtering happens in this view.' : ''}
          </p>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-semibold">Account</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Verification</th>
                  <th className="py-2 pr-3 font-semibold">Student code</th>
                  <th className="py-2 pr-3 text-right font-semibold">Vehicles</th>
                  <th className="py-2 pr-3 font-semibold">Last login</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/70 last:border-0">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={entry.name} size={34} tone={entry.role === 'ADMIN' ? 'navy' : 'primary'} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-heading">{entry.name}</p>
                          <p className="truncate text-[11px] text-muted">
                            {entry.phone}
                            {entry.email ? ` · ${entry.email}` : ''}
                          </p>
                        </div>
                        <Badge tone={roleTone(entry.role)}>{entry.role}</Badge>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge tone={badgeTone(entry.status)}>{entry.status}</Badge>
                    </td>
                    <td className="py-3 pr-3 text-[12px] text-muted">
                      {entry.verification ? verificationStatusLabel(entry.verification) : '—'}
                    </td>
                    <td className="py-3 pr-3 text-[12px] text-muted">{entry.studentCode ?? '—'}</td>
                    <td className="py-3 pr-3 text-right text-[12px] text-muted">{entry.vehicleCount}</td>
                    <td className="py-3 pr-3 text-[12px] text-muted">
                      {entry.lastLoginAt ? relativeTime(entry.lastLoginAt) : 'Never'}
                      <span className="block text-[11px]">Joined {formatDateTime(entry.createdAt)}</span>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {entry.studentCode ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="star"
                            aria-label={`Adjust guardian points for ${entry.name}`}
                            onClick={() => openPointsDialog(entry)}
                          >
                            Points
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant={entry.status === 'ACTIVE' ? 'danger' : 'secondary'}
                          disabled={entry.id === me?.id}
                          title={entry.id === me?.id ? 'You cannot change your own status here.' : undefined}
                          aria-label={`${entry.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'} ${entry.name}`}
                          onClick={() => openStatusDialog(entry)}
                        >
                          {entry.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {visible.map((entry) => (
              <section key={entry.id} className="gt-card flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Avatar name={entry.name} size={40} tone={entry.role === 'ADMIN' ? 'navy' : 'primary'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-heading">{entry.name}</p>
                    <p className="truncate text-[12px] text-muted">
                      {entry.phone}
                      {entry.email ? ` · ${entry.email}` : ''}
                    </p>
                  </div>
                  <Badge tone={roleTone(entry.role)}>{entry.role}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={badgeTone(entry.status)}>{entry.status}</Badge>
                  {entry.verification ? (
                    <Badge tone={badgeTone(entry.verification)}>{verificationStatusLabel(entry.verification)}</Badge>
                  ) : null}
                  {entry.studentCode ? <Badge tone="neutral">{entry.studentCode}</Badge> : null}
                  {entry.vehicleCount > 0 ? <Badge tone="neutral">{entry.vehicleCount} vehicles</Badge> : null}
                </div>
                <p className="text-[11px] text-muted">
                  Last login {entry.lastLoginAt ? relativeTime(entry.lastLoginAt) : 'never'} · Joined{' '}
                  {formatDateTime(entry.createdAt)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {entry.studentCode ? (
                    <Button size="sm" variant="secondary" icon="star" onClick={() => openPointsDialog(entry)}>
                      Adjust points
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={entry.status === 'ACTIVE' ? 'danger' : 'secondary'}
                    disabled={entry.id === me?.id}
                    onClick={() => openStatusDialog(entry)}
                  >
                    {entry.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                  </Button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {/* --- Status change ------------------------------------------------ */}
      <Modal
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title={statusTarget ? `${statusTarget.name} · account status` : 'Account status'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusTarget(null)} disabled={statusMutation.pending}>
              Cancel
            </Button>
            <Button
              variant={nextStatus === 'SUSPENDED' || nextStatus === 'DEACTIVATED' ? 'danger' : 'primary'}
              loading={statusMutation.pending}
              onClick={() => void submitStatus()}
            >
              Confirm change
            </Button>
          </>
        }
      >
        {statusTarget ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-muted">Current status</span>
              <Badge tone={badgeTone(statusTarget.status)}>{statusTarget.status}</Badge>
              <Icon name="arrow-right" size={15} className="text-muted" />
              <Badge tone={badgeTone(nextStatus)}>{nextStatus}</Badge>
            </div>

            <SelectField
              label="Set status to"
              name="target-status"
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as AccountStatus)}
            >
              {TARGET_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            <TextareaField
              label="Reason (optional)"
              name="status-reason"
              value={statusReason}
              maxLength={300}
              placeholder="Shown to the user in their notification."
              hint="Sent to the account as a notification. Maximum 300 characters."
              onChange={(event) => setStatusReason(event.target.value)}
            />

            {nextStatus === 'SUSPENDED' ? (
              <div className="gt-notice gt-notice-danger">
                <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[12px]">
                  Suspending immediately signs this account out of every session and, for drivers, takes them offline.
                </p>
              </div>
            ) : null}

            {statusMutation.error ? <p className="gt-error-text">{statusMutation.error}</p> : null}
          </div>
        ) : null}
      </Modal>

      {/* --- Guardian points ---------------------------------------------- */}
      <Modal
        open={pointsTarget !== null}
        onClose={() => setPointsTarget(null)}
        title={pointsTarget ? `Guardian points · ${pointsTarget.name}` : 'Guardian points'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPointsTarget(null)} disabled={pointsMutation.pending}>
              Cancel
            </Button>
            <Button
              icon="star"
              loading={pointsMutation.pending}
              disabled={!pointsStudent}
              onClick={() => void submitPoints()}
            >
              Apply adjustment
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {students.loading && !students.data ? (
            <PageLoader label="Loading the student record…" />
          ) : students.error ? (
            <ErrorState title="We could not load the student record" message={students.error} onRetry={students.reload} />
          ) : !pointsStudent ? (
            <EmptyState
              icon="user-round"
              title="No student profile found"
              description="This account has a student code but no matching student profile, so points cannot be adjusted."
            />
          ) : (
            <>
              <div className="rounded-[12px] border border-border bg-canvas-alt p-3">
                <p className="text-[12px] text-muted">
                  {pointsStudent.name} · {pointsStudent.studentCode}
                </p>
                <p className="mt-1 text-[20px] font-bold text-heading">{pointsStudent.points} points</p>
                <p className="text-[11px] text-muted">Current balance from the guardian points ledger.</p>
              </div>

              <TextField
                label="Adjustment"
                name="points-delta"
                type="number"
                min={-100}
                max={100}
                step={1}
                value={delta}
                hint="Whole number between -100 and 100. The balance never drops below zero."
                onChange={(event) => {
                  setDelta(event.target.value);
                  if (pointsError) setPointsError(null);
                }}
              />

              <TextareaField
                label="Reason"
                name="points-note"
                value={pointNote}
                maxLength={200}
                placeholder="e.g. Safety bonus for reporting a hazard"
                hint="Sent to the student with the point update. 3–200 characters."
                onChange={(event) => {
                  setPointNote(event.target.value);
                  if (pointsError) setPointsError(null);
                }}
              />

              <p className="text-[12px] text-muted">
                New balance:{' '}
                <span className="font-bold text-heading">{previewBalance ?? '—'}</span>
              </p>

              {pointsError ? <p className="gt-error-text">{pointsError}</p> : null}
              {pointsMutation.error ? <p className="gt-error-text">{pointsMutation.error}</p> : null}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

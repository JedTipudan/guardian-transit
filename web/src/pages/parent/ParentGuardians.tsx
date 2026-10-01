import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { formatDate, rideStatusLabel } from '../../lib/format';
import type { GuardianConnection } from '../../lib/types';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import { Icon } from '../../components/Icon';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Modal,
  Notice,
  PageLoader,
  Skeleton,
  TextField,
  TextareaField,
} from '../../components/ui';

interface GuardianRequest {
  id: string;
  status: 'PENDING' | 'DECLINED';
  createdAt: string;
  requestedBy: 'me' | 'student';
  student: { id: string; name: string };
}

function StatusBadge({ status }: { status: GuardianConnection['status'] }) {
  switch (status) {
    case 'ACTIVE':
      return <span className="gt-badge gt-badge-success">Linked ✓</span>;
    case 'PENDING':
      return <span className="gt-badge gt-badge-warning">Awaiting approval</span>;
    case 'DECLINED':
      return <span className="gt-badge gt-badge-danger">Declined</span>;
    case 'REVOKED':
      return <span className="gt-badge gt-badge-neutral">Unlinked</span>;
    default:
      return <span className="gt-badge gt-badge-neutral">{status}</span>;
  }
}

export default function ParentGuardians() {
  useDocumentTitle('Linked children · Guardian Transit');
  const { user } = useAuth();
  const { push } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [studentCode, setStudentCode] = useState('');
  const [note, setNote] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<GuardianConnection | null>(null);

  const connectionsQuery = useAsync<{ connections: GuardianConnection[] }>(
    (signal) => api.get('/guardians/connections', { signal }),
    [],
  );
  const requestsQuery = useAsync<{ requests: GuardianRequest[] }>(
    (signal) => api.get('/guardians/requests', { signal }),
    [],
  );

  const requestMutation = useMutation(async (body: { studentCode: string; note?: string }) =>
    api.post<{ id: string; status: string }>('/guardians/connections', body),
  );
  const revokeMutation = useMutation(async (id: string) =>
    api.post<{ connection: { id: string; status: string } }>(`/guardians/connections/${id}/revoke`),
  );
  const acceptMutation = useMutation(async (id: string) =>
    api.post<{ connection: { id: string; status: string } }>(`/guardians/connections/${id}/accept`),
  );
  const declineMutation = useMutation(async (id: string) =>
    api.post<{ connection: { id: string; status: string } }>(`/guardians/connections/${id}/decline`),
  );

  const connections = connectionsQuery.data?.connections ?? [];
  const requestedBy = new Map(
    (requestsQuery.data?.requests ?? []).map((request) => [request.id, request.requestedBy]),
  );
  const activeCount = connections.filter((connection) => connection.status === 'ACTIVE').length;

  function refresh() {
    connectionsQuery.reload();
    requestsQuery.reload();
  }

  async function onLinkChild(event: FormEvent) {
    event.preventDefault();
    const code = studentCode.trim().toUpperCase();
    if (code.length < 4) {
      setCodeError('Enter the student code from your child’s account (at least 4 characters).');
      return;
    }
    setCodeError(null);
    const result = await requestMutation.run({
      studentCode: code,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (!result) return;
    setStudentCode('');
    setNote('');
    push('Link request sent — your child approves it from their guardians screen.', 'success');
    refresh();
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    const result = await revokeMutation.run(revokeTarget.id);
    if (!result) return;
    setRevokeTarget(null);
    push(`${revokeTarget.student.name} was unlinked from your account.`, 'success');
    refresh();
  }

  async function onAccept(id: string) {
    const result = await acceptMutation.run(id);
    if (!result) return;
    push('Connection approved.', 'success');
    refresh();
  }

  async function onDecline(id: string) {
    const result = await declineMutation.run(id);
    if (!result) return;
    push('Connection declined.', 'info');
    refresh();
  }

  async function onReRequest(connection: GuardianConnection) {
    const result = await requestMutation.run({ studentCode: connection.student.studentCode });
    if (!result) return;
    push(`New link request sent to ${connection.student.name}.`, 'success');
    refresh();
  }

  if (connectionsQuery.loading && !connectionsQuery.data) {
    return <PageLoader label="Loading your connections…" />;
  }
  if (connectionsQuery.error && !connectionsQuery.data) {
    return (
      <ErrorState
        title="We could not load your connections"
        message={connectionsQuery.error}
        onRetry={connectionsQuery.reload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* --- Heading ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">Linked children</h1>
        <p className="text-[14px] text-muted">
          Link a student code to follow trips, rewards and live location for that child.
        </p>
      </div>

      <Notice tone="primary" icon="shield-check" title="Approval is always in the student’s hands">
        Sending a request never shares anything on its own. Trips become visible only after your child
        approves the link, and either of you can unlink at any time.
      </Notice>

      {requestsQuery.error ? (
        <Notice tone="neutral" icon="info" title="Request history is unavailable">
          {requestsQuery.error}{' '}
          <button
            type="button"
            onClick={requestsQuery.reload}
            className="font-semibold text-primary hover:underline"
          >
            Try again
          </button>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row">
        {/* --- Link a child --------------------------------------------- */}
        <div className="flex w-full flex-col gap-6 xl:w-[360px] xl:shrink-0">
          <section className="gt-card flex flex-col gap-4" aria-label="Link a child">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Link a child</h2>
            <p className="text-[13px] text-muted">
              Ask your child for the student code shown on their profile, then send the request here.
            </p>
            <form className="flex flex-col gap-4" onSubmit={onLinkChild} noValidate>
              <TextField
                label="Student code"
                name="studentCode"
                value={studentCode}
                error={codeError}
                leadingIcon="id"
                placeholder="e.g. SIA-2026-0418"
                autoCapitalize="characters"
                hint="Found under Profile → Student ID on your child’s account."
                onChange={(event) => setStudentCode(event.target.value)}
              />
              <TextareaField
                label="Note (optional)"
                name="note"
                value={note}
                maxLength={200}
                placeholder="Hi {child}, please approve so I can follow your trips."
                onChange={(event) => setNote(event.target.value)}
              />
              {requestMutation.error ? <p className="gt-error-text">{requestMutation.error}</p> : null}
              <Button type="submit" block icon="plus" loading={requestMutation.pending}>
                Send link request
              </Button>
            </form>
          </section>

          <section className="gt-card flex flex-col gap-3" aria-label="How linking works">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">What you get</h2>
            <ul className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-muted">
              <li className="flex gap-2.5">
                <Icon name="radio" size={16} className="mt-0.5 shrink-0 text-primary" />
                Live location during an active trip only — it stops on arrival.
              </li>
              <li className="flex gap-2.5">
                <Icon name="history" size={16} className="mt-0.5 shrink-0 text-primary" />
                Trip history, fares and receipts for every completed ride.
              </li>
              <li className="flex gap-2.5">
                <Icon name="star" size={16} className="mt-0.5 shrink-0 text-primary" />
                Reward points and free-ride progress for each linked child.
              </li>
            </ul>
          </section>
        </div>

        {/* --- Connection list ------------------------------------------ */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[20px] font-bold leading-[1.5] text-heading">Your connections</h2>
            <Button
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              loading={connectionsQuery.loading}
              onClick={refresh}
            >
              Refresh
            </Button>
          </div>

          {connectionsQuery.loading && !connectionsQuery.data ? (
            <div className="flex flex-col gap-4">
              <Skeleton height={150} className="rounded-[20px]" />
              <Skeleton height={150} className="rounded-[20px]" />
            </div>
          ) : connectionsQuery.error && !connectionsQuery.data ? (
            <ErrorState
              title="We could not load your connections"
              message={connectionsQuery.error}
              onRetry={connectionsQuery.reload}
            />
          ) : connections.length === 0 ? (
            <EmptyState
              icon="users"
              title="No children linked yet"
              description="Send a link request with your child’s student code. It appears here as soon as it is waiting for approval."
              action={
                <LinkButton to="/parent" variant="secondary" icon="layout-dashboard">
                  Back to dashboard
                </LinkButton>
              }
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {connections.map((connection) => {
                const origin = requestedBy.get(connection.id);
                const pending = connection.status === 'PENDING';
                const active = connection.status === 'ACTIVE';
                return (
                  <li
                    key={connection.id}
                    className="flex flex-col gap-4 rounded-[20px] border border-border bg-white p-5 shadow-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <Avatar
                          name={connection.student.name}
                          src={connection.student.avatarUrl}
                          size={52}
                          tone={active ? 'success' : 'primary'}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-bold leading-[1.5] text-heading">
                            {connection.student.name}
                          </p>
                          <p className="truncate text-[12px] text-muted">
                            {connection.student.school} · {connection.student.grade}
                          </p>
                          <p className="truncate text-[12px] text-primary">
                            Student ID {connection.student.studentCode}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={connection.status} />
                    </div>

                    {active ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
                          <div className="rounded-[12px] bg-canvas-alt px-3 py-2.5">
                            <p className="text-[11px] text-muted">Reward points</p>
                            <p className="font-bold text-heading">{connection.points}</p>
                          </div>
                          <div className="rounded-[12px] bg-canvas-alt px-3 py-2.5">
                            <p className="text-[11px] text-muted">Completed rides</p>
                            <p className="font-bold text-heading">{connection.completedRides}</p>
                          </div>
                          <div className="rounded-[12px] bg-canvas-alt px-3 py-2.5">
                            <p className="text-[11px] text-muted">Linked since</p>
                            <p className="font-bold text-heading">{formatDate(connection.createdAt)}</p>
                          </div>
                        </div>

                        {connection.activeRide ? (
                          <Notice tone="primary" icon="radio" title={`Trip ${connection.activeRide.code} is running`}>
                            {connection.student.name.split(' ')[0]} is currently{' '}
                            {rideStatusLabel(connection.activeRide.status).toLowerCase()}.{' '}
                            <Link to="/parent/live">Follow it live</Link> or open the{' '}
                            <Link to={`/parent/ride/${connection.activeRide.id}`}>trip details</Link>.
                          </Notice>
                        ) : null}

                        <div className="flex flex-wrap gap-3">
                          <LinkButton to="/parent" size="sm" icon="layout-dashboard">
                            Open dashboard
                          </LinkButton>
                          <LinkButton to="/parent/history" size="sm" variant="secondary" icon="history">
                            Trip history
                          </LinkButton>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="x"
                            onClick={() => setRevokeTarget(connection)}
                          >
                            Unlink
                          </Button>
                        </div>
                      </>
                    ) : pending ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-[13px] text-muted">
                          {origin === 'student'
                            ? `${connection.student.name.split(' ')[0]} asked to link you as a guardian on ${formatDate(connection.createdAt)}.`
                            : `You asked to link ${connection.student.name.split(' ')[0]} on ${formatDate(connection.createdAt)}. They approve it from their guardians screen.`}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {isAdmin ? (
                            <>
                              <Button
                                size="sm"
                                icon="check"
                                loading={acceptMutation.pending}
                                onClick={() => void onAccept(connection.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon="x"
                                loading={declineMutation.pending}
                                onClick={() => void onDecline(connection.id)}
                              >
                                Decline
                              </Button>
                            </>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="x"
                            loading={revokeMutation.pending}
                            onClick={() => setRevokeTarget(connection)}
                          >
                            Cancel request
                          </Button>
                        </div>
                        {declineMutation.error || acceptMutation.error ? (
                          <p className="gt-error-text">{declineMutation.error ?? acceptMutation.error}</p>
                        ) : null}
                      </div>
                    ) : connection.status === 'DECLINED' ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-[13px] text-muted">
                          This request was declined. Ask {connection.student.name.split(' ')[0]} to issue a
                          new invitation from their guardians screen — declined links cannot be re-sent from
                          here.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <p className="text-[13px] text-muted">
                          This link was removed on {formatDate(connection.createdAt)}. Send a fresh request to
                          follow trips again.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            size="sm"
                            icon="plus"
                            loading={requestMutation.pending}
                            onClick={() => void onReRequest(connection)}
                          >
                            Request again
                          </Button>
                          {requestMutation.error ? (
                            <p className="gt-error-text">{requestMutation.error}</p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] leading-[1.6] text-muted">
            {activeCount > 0
              ? `${activeCount} child${activeCount === 1 ? ' is' : 'ren are'} currently sharing trips with this account.`
              : 'No child is sharing trips with this account yet.'}
          </p>
        </div>
      </div>

      {/* --- Unlink confirmation ---------------------------------------- */}
      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title={revokeTarget ? `Unlink ${revokeTarget.student.name}?` : 'Unlink child?'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={revokeMutation.pending}>
              Keep linked
            </Button>
            <Button variant="danger" loading={revokeMutation.pending} onClick={() => void confirmRevoke()}>
              Unlink
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Notice tone="danger" icon="alert-triangle" title="Trips stop being visible">
            You will no longer see this child’s trips, rewards or live location. You can send a new link
            request later, and they will need to approve it again.
          </Notice>
          {revokeMutation.error ? <p className="gt-error-text">{revokeMutation.error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

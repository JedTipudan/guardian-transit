import { useState, type FormEvent } from 'react';
import { StudentHeader } from '../../components/layout/StudentShell';
import { Icon } from '../../components/Icon';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Modal,
  Notice,
  Skeleton,
  TextField,
  TextareaField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { formatDate, relativeTime } from '../../lib/format';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';
import { useToast } from '../../state/ToastContext';

interface LinkedGuardian {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  since: string;
}

interface PendingRequest {
  notificationId: string;
  connectionId: string;
  title: string;
  body: string;
  createdAt: string;
}

type RespondAction = 'accept' | 'decline';

/** Student guardians: share the code, answer link requests, manage connections. */
export default function StudentGuardians() {
  useDocumentTitle('Guardians · Guardian Transit');
  const { user } = useAuth();
  const { push } = useToast();
  const { notifications, loading: notificationsLoading, markRead, refresh } = useNotifications();

  const studentId = user?.studentProfile?.id ?? null;
  const studentCode = user?.studentProfile?.studentCode ?? null;

  const guardians = useAsync<{ guardians: LinkedGuardian[] }>(
    (signal) =>
      api.get<{ guardians: LinkedGuardian[] }>(`/guardians/students/${studentId}/guardians`, { signal }),
    [studentId],
    { enabled: Boolean(studentId) },
  );

  const respond = useMutation(async (input: { connectionId: string; action: RespondAction }) =>
    api.post<{ connection: { id: string; status: string } }>(
      `/guardians/connections/${input.connectionId}/${input.action}`,
    ),
  );
  const revoke = useMutation(async (connectionId: string) =>
    api.post<{ connection: { id: string; status: string } }>(`/guardians/connections/${connectionId}/revoke`),
  );
  const invite = useMutation(async (body: { studentCode: string; note?: string }) =>
    api.post<{ id: string; status: string }>('/guardians/connections', body),
  );

  const [answered, setAnswered] = useState<string[]>([]);
  const [activeRespondId, setActiveRespondId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<LinkedGuardian | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');

  const connected = guardians.data?.guardians ?? [];

  const pending = notifications.flatMap<PendingRequest>((item) => {
    if (item.type !== 'GUARDIAN_REQUEST') return [];
    const connectionId = item.data?.connectionId;
    if (typeof connectionId !== 'string' || answered.includes(connectionId)) return [];
    return [
      {
        notificationId: item.id,
        connectionId,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
      },
    ];
  });

  async function copyCode() {
    if (!studentCode) return;
    if (!navigator.clipboard) {
      push('Copying is blocked here — select the code and copy it manually.', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(studentCode);
      setCopied(true);
      push('Student code copied.', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      push('Copying is blocked here — select the code and copy it manually.', 'info');
    }
  }

  async function onRespond(item: PendingRequest, action: RespondAction) {
    setActiveRespondId(item.connectionId);
    const result = await respond.run({ connectionId: item.connectionId, action });
    if (result) {
      setAnswered((prev) => (prev.includes(item.connectionId) ? prev : [...prev, item.connectionId]));
      setActiveRespondId(null);
      guardians.reload();
      void markRead(item.notificationId);
      void refresh();
      push(
        action === 'accept'
          ? 'Guardian connected — they can now follow your trips.'
          : 'Request declined. Nothing was shared.',
        'success',
      );
    }
  }

  async function onRevokeConfirm() {
    if (!revokeTarget) return;
    const result = await revoke.run(revokeTarget.id);
    if (result) {
      setRevokeTarget(null);
      guardians.reload();
      push('Guardian access revoked.', 'success');
    }
  }

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentCode) return;
    const result = await invite.run({ studentCode, note: note.trim() || undefined });
    if (result) {
      setNote('');
      push('Link request sent. It is waiting for approval.', 'success');
    }
  }

  return (
    <>
      <StudentHeader
        title="Guardians"
        subtitle={
          guardians.loading
            ? 'Loading your connections…'
            : `${connected.length} connected${pending.length > 0 ? ` · ${pending.length} waiting` : ''}`
        }
        backTo="/student"
        right={
          <button
            type="button"
            onClick={guardians.reload}
            aria-label="Refresh guardians"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
          >
            <Icon name="refresh-cw" size={17} />
          </button>
        }
      />

      <div className="flex flex-col gap-[22px] px-5 pb-7 pt-[18px]">
        {/* Shareable student code */}
        <section className="gt-card flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold leading-[1.45] text-heading">Your student code</h2>
            <Badge tone="primary" icon="id">
              Share
            </Badge>
          </div>

          <p className="text-[13px] leading-[1.55] text-muted">
            A parent or guardian sends a link request with this code. You decide who gets to follow your trips.
          </p>

          {studentCode ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-[12px] bg-canvas-alt px-3.5 py-3">
                <span className="truncate font-mono text-[20px] font-bold tracking-[0.16em] text-heading">
                  {studentCode}
                </span>
                <Button variant="secondary" size="sm" icon={copied ? 'check' : 'share'} onClick={() => void copyCode()}>
                  {copied ? 'Copied' : 'Copy code'}
                </Button>
              </div>
              <p className="gt-hint">Only people you approve can see your rides — you can revoke anyone at any time.</p>
            </>
          ) : (
            <Notice tone="neutral" icon="info" title="No student code on this account">
              This account is not linked to a student profile yet, so there is no code to share. Ask your school
              office to link your profile.
            </Notice>
          )}
        </section>

        {/* Pending link requests */}
        <section className="gt-card flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold leading-[1.45] text-heading">Link requests</h2>
            {pending.length > 0 ? <Badge tone="warning">{pending.length} new</Badge> : null}
          </div>

          {notificationsLoading && notifications.length === 0 ? (
            <div className="flex flex-col gap-2.5">
              <Skeleton height={96} className="rounded-[12px]" />
              <Skeleton height={96} className="rounded-[12px]" />
            </div>
          ) : pending.length === 0 ? (
            <EmptyState
              icon="users"
              title="No requests waiting"
              description="When a guardian asks to follow your trips, the request shows up here for you to approve."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {pending.map((item) => {
                const busy = respond.pending && activeRespondId === item.connectionId;
                return (
                  <div
                    key={item.connectionId}
                    className="flex flex-col gap-3 rounded-[12px] border border-border bg-white p-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                        <Icon name="users" size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-bold text-heading">{item.title}</p>
                        <p className="mt-0.5 text-[12px] leading-[1.55] text-muted">{item.body}</p>
                        <p className="mt-1 text-[11px] text-muted">{relativeTime(item.createdAt)}</p>
                      </div>
                    </div>

                    {respond.error && activeRespondId === item.connectionId ? (
                      <p className="gt-error-text">{respond.error}</p>
                    ) : null}

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        block
                        disabled={respond.pending}
                        loading={busy}
                        onClick={() => void onRespond(item, 'decline')}
                      >
                        Decline
                      </Button>
                      <Button size="sm" block disabled={respond.pending} loading={busy} onClick={() => void onRespond(item, 'accept')}>
                        Accept
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Connected guardians */}
        <section className="gt-card flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold leading-[1.45] text-heading">Connected guardians</h2>
            {connected.length > 0 ? (
              <Badge tone="success" icon="check-circle">
                {connected.length} active
              </Badge>
            ) : null}
          </div>

          {!studentId ? (
            <EmptyState
              icon="users"
              title="No student profile on this account"
              description="Guardian connections appear once this account is linked to a student profile."
            />
          ) : guardians.loading ? (
            <div className="flex flex-col gap-2.5">
              <Skeleton height={72} className="rounded-[12px]" />
              <Skeleton height={72} className="rounded-[12px]" />
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
              description="Copy your student code above and share it with a parent or guardian — they send the request, you approve it."
              action={
                <Button variant="secondary" icon="share" onClick={() => void copyCode()}>
                  {copied ? 'Copied' : 'Copy student code'}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {connected.map((guardian) => (
                <div key={guardian.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-white p-3">
                  <Avatar name={guardian.name} src={guardian.avatarUrl} size={44} tone="success" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-heading">{guardian.name}</p>
                    <p className="truncate text-[12px] text-muted">
                      {guardian.phone}
                      {guardian.email ? ` · ${guardian.email}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">Linked {formatDate(guardian.since)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(guardian)}
                    aria-label={`Revoke access for ${guardian.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-muted transition hover:bg-danger-soft hover:text-danger"
                  >
                    <Icon name="x" size={17} />
                  </button>
                </div>
              ))}
              <p className="gt-hint">Guardians see your rides only while a trip is active. Revoking takes effect immediately.</p>
            </div>
          )}
        </section>

        {/* Invite from a guardian device */}
        <section className="gt-card flex flex-col gap-3">
          <h2 className="text-[18px] font-bold leading-[1.45] text-heading">Send a link request</h2>
          <p className="text-[13px] leading-[1.55] text-muted">
            Link requests are normally sent from a guardian account using your code. If you are signed in on a
            guardian device too, you can send it from here.
          </p>

          <form className="flex flex-col gap-4" onSubmit={(event) => void onInvite(event)} noValidate>
            <TextField
              label="Student code"
              name="studentCode"
              className="font-mono tracking-[0.12em]"
              value={studentCode ?? ''}
              readOnly
              hint="Prefilled from this account so the request points at the right student."
            />

            <TextareaField
              label="Note (optional)"
              name="note"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              hint={`${200 - note.length} characters left`}
            />

            <Button type="submit" block icon="share" loading={invite.pending} disabled={!studentCode}>
              Send link request
            </Button>
          </form>

          {invite.error ? (
            <Notice tone="primary" icon="info" title="That request has to come from a guardian account">
              {invite.error} Share your student code instead — the guardian sends the request from their account and
              you approve it under “Link requests”.
            </Notice>
          ) : null}
        </section>
      </div>

      {/* Revoke confirmation */}
      <Modal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Revoke guardian access"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevokeTarget(null)}>
              Keep connected
            </Button>
            <Button variant="danger" loading={revoke.pending} onClick={() => void onRevokeConfirm()}>
              Revoke access
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[14px] leading-[1.6] text-heading">
            {revokeTarget ? (
              <>
                <span className="font-semibold">{revokeTarget.name}</span> will lose access to your live location and
                trip updates immediately. They would have to send a new request to follow you again.
              </>
            ) : null}
          </p>
          {revoke.error ? <p className="gt-error-text">{revoke.error}</p> : null}
        </div>
      </Modal>
    </>
  );
}

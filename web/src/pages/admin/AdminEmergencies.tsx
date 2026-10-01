import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { MapCanvas } from '../../components/MapCanvas';
import { Badge, Button, EmptyState, ErrorState, Modal, PageLoader, SegmentedControl, TextareaField, SelectField } from '../../components/ui';
import { api } from '../../lib/api';
import { emergencyTypeLabel, formatDateTime, relativeTime } from '../../lib/format';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { getSocket } from '../../lib/socket';
import { useToast } from '../../state/ToastContext';
import type { EmergencyEvent } from '../../lib/types';

type FilterStatus = 'ALL' | EmergencyEvent['status'];
type Resolution = 'RESOLVED' | 'FALSE_ALARM';

interface EmergenciesPayload {
  emergencies: EmergencyEvent[];
}

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'FALSE_ALARM', label: 'False alarm' },
];

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: 'RESOLVED', label: 'Resolved — the situation is safe' },
  { value: 'FALSE_ALARM', label: 'False alarm — no incident occurred' },
];

function statusLabel(status: EmergencyEvent['status']): string {
  switch (status) {
    case 'FALSE_ALARM':
      return 'False alarm';
    case 'ACKNOWLEDGED':
      return 'Acknowledged';
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

function statusTone(status: EmergencyEvent['status']): 'danger' | 'warning' | 'success' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'danger';
    case 'ACKNOWLEDGED':
      return 'warning';
    case 'RESOLVED':
      return 'success';
    default:
      return 'neutral';
  }
}

function typeLabel(type: string): string {
  return emergencyTypeLabel(type);
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-canvas-alt p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 break-words text-[13px] font-semibold leading-[1.5] text-heading">{children}</div>
    </div>
  );
}

export default function AdminEmergencies() {
  useDocumentTitle('Emergencies · Guardian Transit');
  const { push } = useToast();

  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<EmergencyEvent | null>(null);
  const [resolution, setResolution] = useState<Resolution>('RESOLVED');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const list = useAsync<EmergenciesPayload>(
    (signal) => api.get('/admin/emergencies', { signal, query: { status: filter } }),
    [filter],
  );

  // A fresh SOS should land on the desk without anyone pressing refresh.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onRaised = () => list.reload();
    socket.on('emergency:raised', onRaised);
    return () => {
      socket.off('emergency:raised', onRaised);
    };
  }, [list.reload]);

  const acknowledge = useMutation(async (id: string): Promise<string> => {
    await api.post(`/emergency/${id}/acknowledge`);
    return 'saved';
  });

  const resolve = useMutation(
    async (id: string, next: Resolution, resolutionNote: string): Promise<string> => {
      await api.post(`/emergency/${id}/resolve`, { status: next, note: resolutionNote });
      return 'saved';
    },
  );

  async function onAcknowledge(event: EmergencyEvent) {
    setActiveId(event.id);
    const result = await acknowledge.run(event.id);
    if (result === null) return;
    push('Alert acknowledged — the person who raised it was notified.', 'success');
    setActiveId(null);
    list.reload();
  }

  function openResolve(event: EmergencyEvent) {
    setResolveTarget(event);
    setResolution('RESOLVED');
    setNote('');
    setNoteError(null);
    resolve.setError(null);
  }

  async function submitResolve() {
    if (!resolveTarget) return;
    const trimmed = note.trim();
    if (trimmed.length < 3) {
      setNoteError('Add a short resolution note (at least 3 characters).');
      return;
    }
    setNoteError(null);
    const result = await resolve.run(resolveTarget.id, resolution, trimmed);
    if (result === null) return;
    push(resolution === 'RESOLVED' ? 'Emergency resolved.' : 'Alert closed as a false alarm.', 'success');
    setResolveTarget(null);
    list.reload();
  }

  const events = list.data?.emergencies ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="gt-eyebrow">Safety desk</p>
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading md:text-[30px]">Emergencies</h1>
          <p className="text-[13px] text-muted">
            SOS alerts, route deviations and breakdowns raised by students, parents and drivers.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" loading={list.loading} onClick={list.reload}>
          Refresh
        </Button>
      </div>

      <SegmentedControl value={filter} options={FILTER_OPTIONS} onChange={setFilter} />

      {list.loading && !list.data ? (
        <PageLoader label="Loading emergency feed…" />
      ) : list.error ? (
        <ErrorState title="We could not load emergencies" message={list.error} onRetry={list.reload} />
      ) : events.length === 0 ? (
        <EmptyState
          icon="shield-check"
          title={filter === 'ALL' ? 'A quiet day — no emergencies logged' : `No ${statusLabel(filter as EmergencyEvent['status']).toLowerCase()} alerts`}
          description={
            filter === 'ALL'
              ? 'Alerts raised through the SOS button appear here in real time.'
              : 'Switch back to “All” to see the full history.'
          }
          action={
            filter !== 'ALL' ? (
              <Button variant="secondary" onClick={() => setFilter('ALL')}>
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((event) => {
            const isOpen = event.status === 'ACTIVE' || event.status === 'ACKNOWLEDGED';
            const errorHere = activeId === event.id ? acknowledge.error : null;
            return (
              <section
                key={event.id}
                className={`gt-card flex flex-col gap-4 ${event.status === 'ACTIVE' ? 'border-danger/40' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${
                        event.status === 'ACTIVE' ? 'bg-danger-soft text-danger' : 'bg-canvas-alt text-muted'
                      }`}
                    >
                      <Icon name="siren" size={19} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[16px] font-bold text-heading">{typeLabel(event.type)}</h2>
                        <Badge tone={statusTone(event.status)}>{statusLabel(event.status)}</Badge>
                        {event.sharedWithGuardian ? <Badge tone="primary">Shared with guardian</Badge> : null}
                      </div>
                      <p className="mt-1 text-[13px] text-muted">{event.message ?? 'No message was attached.'}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        Raised {formatDateTime(event.createdAt)} · {relativeTime(event.createdAt)}
                        {event.acknowledgedAt ? ` · acknowledged ${formatDateTime(event.acknowledgedAt)}` : ''}
                        {event.resolvedAt ? ` · closed ${formatDateTime(event.resolvedAt)}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Meta label="Raised by">
                    {event.raisedBy
                      ? `${event.raisedBy.firstName} ${event.raisedBy.lastName} · ${event.raisedBy.role.toLowerCase()}`
                      : 'Unknown'}
                  </Meta>
                  <Meta label="Ride">
                    {event.ride ? (
                      <Link to={`/admin/rides?ride=${event.ride.id}`} className="text-primary hover:underline">
                        {event.ride.code} · {event.ride.status.replace(/_/g, ' ').toLowerCase()}
                      </Link>
                    ) : (
                      'Not linked to a ride'
                    )}
                  </Meta>
                  <Meta label="Hotline used">
                    {event.hotlineNumber ? (
                      <a href={`tel:${event.hotlineNumber}`} className="flex items-center gap-1.5 text-primary hover:underline">
                        <Icon name="phone" size={14} />
                        {event.hotlineLabel ? `${event.hotlineLabel} · ` : ''}
                        {event.hotlineNumber}
                      </a>
                    ) : (
                      'No hotline was dialled'
                    )}
                  </Meta>
                  <Meta label="Guardian contact">{event.guardianContact ?? 'None recorded'}</Meta>
                  <Meta label="Coordinates">
                    {event.lat !== null && event.lng !== null
                      ? `${event.lat.toFixed(5)}, ${event.lng.toFixed(5)}`
                      : 'Location not shared'}
                  </Meta>
                  <Meta label="Handled by">
                    {event.handledBy ? `${event.handledBy.firstName} ${event.handledBy.lastName}` : 'Not yet assigned'}
                  </Meta>
                </div>

                {event.lat !== null && event.lng !== null ? (
                  <MapCanvas
                    markers={[{ id: event.id, lat: event.lat, lng: event.lng, label: typeLabel(event.type), kind: 'alert' }]}
                    height={190}
                    interactive={false}
                    hint="Alert location"
                  />
                ) : null}

                {event.resolutionNote ? (
                  <div className="gt-notice gt-notice-success">
                    <Icon name="check-circle" size={18} className="mt-0.5 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="mb-1 font-bold text-heading">Resolution note</p>
                      <p className="text-[12px] text-muted">{event.resolutionNote}</p>
                    </div>
                  </div>
                ) : null}

                {errorHere ? <p className="gt-error-text">{errorHere}</p> : null}

                {isOpen ? (
                  <div className="flex flex-wrap gap-2">
                    {event.status === 'ACTIVE' ? (
                      <Button
                        icon="bell"
                        size="sm"
                        loading={acknowledge.pending && activeId === event.id}
                        onClick={() => void onAcknowledge(event)}
                      >
                        Acknowledge
                      </Button>
                    ) : null}
                    <Button variant="secondary" size="sm" icon="check-circle" onClick={() => openResolve(event)}>
                      Resolve…
                    </Button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={resolveTarget !== null}
        onClose={() => setResolveTarget(null)}
        title={resolveTarget ? `Close alert · ${typeLabel(resolveTarget.type)}` : 'Close alert'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveTarget(null)} disabled={resolve.pending}>
              Cancel
            </Button>
            <Button icon="check" loading={resolve.pending} onClick={() => void submitResolve()}>
              Close alert
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">
            The person who raised this alert is notified with your note. Add what actually happened.
          </p>

          <SelectField
            label="Outcome"
            name="resolution"
            value={resolution}
            onChange={(event) => setResolution(event.target.value as Resolution)}
          >
            {RESOLUTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <TextareaField
            label="Resolution note"
            name="resolution-note"
            value={note}
            maxLength={500}
            placeholder="e.g. Driver called back, student collected safely at 4:12 PM."
            hint="3–500 characters. Stored on the alert and sent to the person who raised it."
            error={noteError}
            onChange={(event) => {
              setNote(event.target.value);
              if (noteError) setNoteError(null);
            }}
          />

          {resolve.error ? <p className="gt-error-text">{resolve.error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

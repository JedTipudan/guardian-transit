import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Notice,
  PageLoader,
  Skeleton,
  Toggle,
} from '../../components/ui';
import { RideStatusBadge } from '../../components/RideBits';
import { api, errorMessage } from '../../lib/api';
import { useAsync, useDocumentTitle, useInterval } from '../../lib/hooks';
import {
  badgeTone,
  formatCurrency,
  formatDateTime,
  formatDistance,
  formatMinutes,
  relativeTime,
  verificationStatusLabel,
} from '../../lib/format';
import type { DriverMe, SerializedRide } from '../../lib/types';
import { useToast } from '../../state/ToastContext';

function SectionHeader({ title, icon, action }: { title: string; icon: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[16px] font-bold text-heading">
        <span className="text-primary">
          <Icon name={icon} size={18} />
        </span>
        {title}
      </h2>
      {action}
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="gt-card-flat flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
        <Icon name={icon} size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[18px] font-bold leading-[1.3] text-heading">{value}</p>
        <p className="truncate text-[12px] text-muted">{label}</p>
      </div>
    </div>
  );
}

function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return timestamp >= start.getTime();
}

export default function DriverDashboard() {
  useDocumentTitle('Driver Dashboard · Guardian Transit');
  const { push } = useToast();

  const me = useAsync<DriverMe>((signal) => api.get<DriverMe>('/driver/me', { signal }), []);
  const requests = useAsync<{ requests: SerializedRide[] }>(
    (signal) => api.get<{ requests: SerializedRide[] }>('/driver/requests', { signal }),
    [],
  );
  const trips = useAsync<{ trips: SerializedRide[] }>(
    (signal) => api.get<{ trips: SerializedRide[] }>('/driver/trips', { signal, query: { limit: 30 } }),
    [],
  );

  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busyRide, setBusyRide] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'accept' | 'decline' | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Keep the request tray fresh while the console is open (paused in the background).
  useInterval(() => {
    requests.reload();
    me.reload();
    trips.reload();
  }, 20000);

  async function toggleOnline(next: boolean) {
    setStatusPending(true);
    setStatusError(null);
    try {
      const result = await api.post<{ isOnline: boolean }>('/driver/status', { isOnline: next });
      const current = me.data;
      if (current) {
        me.setData({ ...current, driver: { ...current.driver, isOnline: result.isOnline } });
      }
      push(
        result.isOnline
          ? 'You are online — ride requests can reach you now.'
          : 'You are offline — no new ride requests will be sent.',
        'success',
      );
    } catch (cause) {
      const message = errorMessage(cause, 'We could not update your availability.');
      setStatusError(message);
      push(message, 'error');
    } finally {
      setStatusPending(false);
    }
  }

  async function decide(rideId: string, action: 'accept' | 'decline') {
    setBusyRide(rideId);
    setBusyAction(action);
    setRequestError(null);
    try {
      await api.post(`/rides/${rideId}/${action}`);
      push(action === 'accept' ? 'Ride accepted — head to the pickup point.' : 'Request declined.', 'success');
      requests.reload();
      me.reload();
      trips.reload();
    } catch (cause) {
      const message = errorMessage(
        cause,
        action === 'accept' ? 'We could not accept this ride.' : 'We could not decline this ride.',
      );
      setRequestError(message);
      push(message, 'error');
    } finally {
      setBusyRide(null);
      setBusyAction(null);
    }
  }

  if (!me.data) {
    return (
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Driver dashboard</h1>
          <p className="text-[13px] text-muted">Your availability, ride requests and today’s numbers.</p>
        </div>
        {me.error ? (
          <ErrorState title="We could not load your console" message={me.error} onRetry={me.reload} />
        ) : (
          <PageLoader label="Loading your driver console…" />
        )}
      </div>
    );
  }

  const data = me.data;
  const driver = data.driver;
  const stats = data.stats;
  const verified = driver.overallStatus === 'VERIFIED';
  const pendingRequests = requests.data?.requests ?? [];
  const todayTrips = (trips.data?.trips ?? []).filter((ride) => ride.status === 'COMPLETED' && isToday(ride.completedAt));
  const activeRide = stats.activeRide;

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Driver dashboard</h1>
          <p className="text-[13px] text-muted">
            {driver.name} · ★ {driver.rating.toFixed(1)} · {driver.completedTrips} completed trips
          </p>
        </div>
        <Badge tone={badgeTone(driver.overallStatus)} icon="shield-check">
          {verificationStatusLabel(driver.overallStatus)}
        </Badge>
      </div>

      {me.error ? (
        <Notice tone="danger" icon="alert-triangle" title="Could not refresh your console">
          {me.error} <button type="button" onClick={me.reload} className="font-semibold text-primary hover:underline">Retry</button>
        </Notice>
      ) : null}

      {!verified ? (
        <Notice tone="primary" icon="file-check" title="Verification required">
          Verified drivers only receive ride requests. Your account is currently{' '}
          <span className="font-semibold text-heading">{verificationStatusLabel(driver.overallStatus).toLowerCase()}</span>
          {data.verifications.length > 0
            ? ` — ${data.verifications.length} document check${data.verifications.length === 1 ? '' : 's'} on file`
            : ''}
          . <Link to="/driver/verification">Review your documents →</Link>
        </Notice>
      ) : null}

      {/* Availability ---------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${
                driver.isOnline ? 'bg-success-soft text-success' : 'bg-canvas-alt text-muted'
              }`}
            >
              <Icon name="power" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-heading">{driver.isOnline ? 'You are online' : 'You are offline'}</p>
              <p className="text-[12px] text-muted">
                {driver.isOnline
                  ? 'New ride requests from students will appear below.'
                  : 'Go online to receive ride requests from students.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {statusPending ? <span className="text-[12px] text-muted">Saving…</span> : null}
            <Toggle
              checked={driver.isOnline}
              onChange={(next) => void toggleOnline(next)}
              disabled={statusPending}
              label="Online status"
            />
          </div>
        </div>
        {statusError ? (
          <p className="gt-error-text" role="alert">
            {statusError}
          </p>
        ) : null}
      </section>

      {/* Stats ----------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon="history" label="Trips completed today" value={String(stats.todayTrips)} />
        <StatTile icon="list" label="Pending ride requests" value={String(stats.pendingRequests)} />
        <StatTile icon="wallet" label="Earnings today" value={formatCurrency(stats.todayEarnings)} />
      </div>

      {/* Active ride ------------------------------------------------------ */}
      {activeRide ? (
        <section className="gt-card flex flex-col gap-4">
          <SectionHeader title="Active ride" icon="navigation" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-heading">
                {activeRide.pickup.label} → {activeRide.destination.label}
              </p>
              <p className="mt-1 text-[12px] text-muted">
                {activeRide.student.name} · {activeRide.student.school} · {activeRide.code}
              </p>
              <p className="mt-1 text-[12px] text-muted">Requested {relativeTime(activeRide.requestedAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <RideStatusBadge status={activeRide.status} />
              <p className="text-[15px] font-bold text-heading">{formatCurrency(activeRide.fare)}</p>
              <p className="text-[11px] text-muted">
                {formatDistance(activeRide.distanceKm)} · {formatMinutes(activeRide.durationMin)}
              </p>
            </div>
          </div>
          <LinkButton to="/driver/ride" icon="navigation" block>
            Open active ride
          </LinkButton>
        </section>
      ) : null}

      {/* Ride requests ---------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <SectionHeader
          title="Ride requests"
          icon="radio"
          action={
            <Button
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              onClick={requests.reload}
              disabled={requests.loading}
            >
              Refresh
            </Button>
          }
        />

        {requestError ? (
          <p className="gt-error-text" role="alert">
            {requestError}
          </p>
        ) : null}

        {requests.loading && !requests.data ? (
          <div className="flex flex-col gap-3">
            <Skeleton height={96} />
            <Skeleton height={96} />
          </div>
        ) : requests.error && !requests.data ? (
          <ErrorState title="We could not load ride requests" message={requests.error} onRetry={requests.reload} />
        ) : pendingRequests.length === 0 ? (
          <EmptyState
            icon="car"
            title="No pending requests"
            description={
              verified
                ? driver.isOnline
                  ? 'You are online — new requests from students will appear here in real time.'
                  : 'Go online to start receiving requests from students.'
                : 'Once your documents are verified and you go online, ride requests will appear here.'
            }
            action={!verified ? <LinkButton to="/driver/verification" variant="secondary" icon="file-check">Go to verification</LinkButton> : undefined}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingRequests.map((ride) => {
              const busy = busyRide === ride.id;
              return (
                <li key={ride.id} className="flex flex-col gap-3 rounded-[12px] border border-border bg-canvas-alt p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-heading">
                        {ride.pickup.label} → {ride.destination.label}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {ride.student.name} · {ride.student.school}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        Requested {relativeTime(ride.requestedAt)} · {ride.code}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-bold text-heading">{formatCurrency(ride.fare)}</p>
                      <p className="text-[11px] text-muted">
                        {formatDistance(ride.distanceKm)} · {formatMinutes(ride.durationMin)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      icon="check"
                      loading={busy && busyAction === 'accept'}
                      disabled={busyRide !== null}
                      onClick={() => void decide(ride.id, 'accept')}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="x"
                      loading={busy && busyAction === 'decline'}
                      disabled={busyRide !== null}
                      onClick={() => void decide(ride.id, 'decline')}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Today's trips ---------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <SectionHeader
          title="Today’s trips"
          icon="history"
          action={
            <Link to="/driver/trips" className="text-[12px] font-semibold text-primary hover:underline">
              Trip history →
            </Link>
          }
        />
        {trips.loading && !trips.data ? (
          <div className="flex flex-col gap-3">
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : trips.error && !trips.data ? (
          <ErrorState title="We could not load today’s trips" message={trips.error} onRetry={trips.reload} />
        ) : todayTrips.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No trips completed today"
            description="Trips you finish today will be listed here with their fare."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {todayTrips.map((ride) => (
              <li
                key={ride.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-canvas-alt px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-heading">
                    {ride.pickup.label} → {ride.destination.label}
                  </p>
                  <p className="text-[12px] text-muted">
                    {formatDateTime(ride.completedAt)} · {ride.student.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-[14px] font-bold text-heading">{formatCurrency(ride.fare)}</p>
                  <RideStatusBadge status={ride.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vehicles --------------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <SectionHeader title="Vehicles" icon="car" />
        {data.vehicles.length === 0 ? (
          <EmptyState
            icon="car"
            title="No vehicle on file"
            description="Vehicle details are captured during driver registration. Contact the safety desk to add or update your vehicle."
          />
        ) : (
          <ul className="flex flex-col gap-3 sm:grid sm:grid-cols-2">
            {data.vehicles.map((vehicle) => (
              <li key={vehicle.id} className="flex flex-col gap-3 rounded-[12px] border border-border bg-canvas-alt p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                      <Icon name="car-front" size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold text-heading">{vehicle.nickname}</p>
                      <p className="truncate text-[12px] text-muted">
                        {vehicle.make} {vehicle.model} · {vehicle.color} · {vehicle.plateNumber}
                      </p>
                    </div>
                  </div>
                  <Badge tone={badgeTone(vehicle.status)}>{verificationStatusLabel(vehicle.status)}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <span>{vehicle.capacity} seats</span>
                  <span aria-hidden="true">·</span>
                  <Badge tone={vehicle.isActive ? 'success' : 'neutral'}>
                    {vehicle.isActive ? 'In service' : 'Out of service'}
                  </Badge>
                  <Link to="/driver/verification" className="ml-auto font-semibold text-primary hover:underline">
                    Verification details →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

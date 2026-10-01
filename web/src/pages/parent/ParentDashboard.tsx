import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useInterval } from '../../lib/hooks';
import {
  formatDate,
  formatTime,
  greeting,
  relativeTime,
  rideStatusLabel,
} from '../../lib/format';
import { getConnectionState, getSocket, onConnectionChange, watchRide, type ConnectionState } from '../../lib/socket';
import type { RewardsPayload, SerializedRide, StudentListItem } from '../../lib/types';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';
import { Icon } from '../../components/Icon';
import {
  EmptyState,
  ErrorState,
  LinkButton,
  Modal,
  Notice,
  PageLoader,
  Skeleton,
} from '../../components/ui';
import { RideTimeline, RideStatusBadge } from '../../components/RideBits';
import { MapCanvas, MapLegend } from '../../components/MapCanvas';
import { SosModal } from '../../components/SosModal';

interface TrackPoint {
  lat: number;
  lng: number;
  at: string;
}

interface TrackPayload {
  ride: SerializedRide;
  route: TrackPoint[];
  driver: { lat: number; lng: number; lastSeen: string | null } | null;
}

interface TripLocationFrame {
  rideId: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

interface Fix {
  lat: number;
  lng: number;
  at: string | null;
}

/** Age of the last telemetry frame, honestly split into fresh vs stale wording. */
function freshnessLabel(at: string | null, now: number): { text: string; fresh: boolean } {
  if (!at) return { text: 'Driver position · timestamp unknown', fresh: false };
  const stamp = new Date(at).getTime();
  if (Number.isNaN(stamp)) return { text: 'Driver position · timestamp unknown', fresh: false };
  const seconds = Math.max(0, Math.round((now - stamp) / 1000));
  if (seconds <= 45) {
    const age = seconds < 5 ? 'just now' : `${seconds}s ago`;
    return { text: `Updated ${formatTime(stamp)} · ${age}`, fresh: true };
  }
  const minutes = Math.round(seconds / 60);
  const age = minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hr ago`;
  return { text: `Last update ${formatTime(stamp)} · ${age}`, fresh: false };
}

/** Remaining travel time only counts down once the trip has actually started. */
function tripEta(ride: SerializedRide, now: number): { minutes: number | null; arrivesAt: number | null; started: boolean } {
  const startedAt = ride.startedAt ? new Date(ride.startedAt).getTime() : null;
  if (startedAt !== null && !Number.isNaN(startedAt)) {
    const elapsed = (now - startedAt) / 60000;
    const remaining = Math.max(0, Math.round(ride.durationMin - elapsed));
    return { minutes: remaining, arrivesAt: startedAt + ride.durationMin * 60000, started: true };
  }
  return { minutes: Math.round(ride.durationMin), arrivesAt: null, started: false };
}

function statusHeadline(ride: SerializedRide | null, firstName: string): string {
  if (!ride) return `${firstName} has no trip right now.`;
  switch (ride.status) {
    case 'REQUESTED':
      return `A driver is being arranged for ${firstName}.`;
    case 'DRIVER_ASSIGNED':
      return `${ride.driver.name} is heading to the pickup point.`;
    case 'DRIVER_ARRIVED':
      return `The driver has arrived at ${ride.pickup.label}.`;
    case 'PIN_VERIFIED':
      return `${firstName} has boarded — the ride starts shortly.`;
    case 'IN_PROGRESS':
      return `${firstName} is traveling to ${ride.destination.label}.`;
    default:
      return `${firstName}’s trip is ${rideStatusLabel(ride.status).toLowerCase()}.`;
  }
}

function statusBadgeFor(ride: SerializedRide | null): string {
  if (!ride) return 'No active trip';
  return rideStatusLabel(ride.status);
}

function QuickTile({ to, icon, label, hint, onClick }: { to?: string; icon: string; label: string; hint: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-heading">{label}</span>
        <span className="block truncate text-[11px] text-muted">{hint}</span>
      </span>
      <Icon name="chevron-right" size={16} className="ml-auto shrink-0 text-muted" />
    </>
  );
  const classes =
    'flex w-full items-center gap-3 rounded-[12px] border border-border bg-white px-3 py-3 text-left transition hover:border-primary/40';

  if (to) {
    return (
      <Link to={to} className={classes}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  );
}

export default function ParentDashboard() {
  useDocumentTitle('Dashboard · Guardian Transit');
  const { user } = useAuth();
  const { unread } = useNotifications();

  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 5000);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const studentsQuery = useAsync<{ students: StudentListItem[] }>((signal) => api.get('/students', { signal }), []);
  const students = studentsQuery.data?.students ?? [];

  useEffect(() => {
    if (students.length === 0) return;
    if (selectedId && students.some((student) => student.id === selectedId)) return;
    setSelectedId(students[0].id);
  }, [students, selectedId]);

  const selected = students.find((student) => student.id === selectedId) ?? null;

  const activeQuery = useAsync<{ ride: SerializedRide | null }>((signal) => api.get('/rides/active', { signal }), []);
  const rawRide = activeQuery.data?.ride ?? null;
  const belongsToSelected = Boolean(rawRide && selected && rawRide.student.id === selected.id);
  const baseRide = belongsToSelected ? rawRide : null;
  const otherRide = rawRide && !belongsToSelected ? rawRide : null;
  const baseRideId = baseRide?.id ?? null;

  const [socketRide, setSocketRide] = useState<SerializedRide | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const ride = socketRide && baseRideId && socketRide.id === baseRideId ? socketRide : baseRide;
  const rideId = ride?.id ?? null;

  // A new active trip replaces whatever live frames we were following.
  useEffect(() => {
    setSocketRide(null);
    setFix(null);
  }, [baseRideId]);

  const trackQuery = useAsync<TrackPayload>(
    (signal) => api.get(`/rides/${baseRideId}/track`, { signal }),
    [baseRideId],
    { enabled: Boolean(baseRideId) },
  );

  const recentQuery = useAsync<{ rides: SerializedRide[] }>(
    (signal) => api.get('/rides', { signal, query: { limit: 3, studentId: selected?.id ?? undefined } }),
    [selected?.id],
    { enabled: Boolean(selected) },
  );

  const rewardsQuery = useAsync<RewardsPayload>(
    (signal) => api.get('/rewards', { signal, query: { studentId: selected?.id ?? undefined } }),
    [selected?.id],
    { enabled: Boolean(selected) },
  );

  const [connection, setConnection] = useState<ConnectionState>(getConnectionState());
  useEffect(() => onConnectionChange(setConnection), []);

  useEffect(() => {
    if (!baseRideId) return;
    const unwatch = watchRide(baseRideId);
    const socket = getSocket();
    if (!socket) return unwatch;

    const onState = (payload: SerializedRide) => {
      if (payload.id === baseRideId) setSocketRide(payload);
    };
    const onLocation = (frame: TripLocationFrame) => {
      if (frame.rideId !== baseRideId) return;
      setFix({ lat: frame.lat, lng: frame.lng, at: frame.recordedAt });
    };
    socket.on('trip:state', onState);
    socket.on('trip:location', onLocation);

    return () => {
      socket.off('trip:state', onState);
      socket.off('trip:location', onLocation);
      unwatch();
    };
  }, [baseRideId, connection]);

  const [sosOpen, setSosOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);

  if (studentsQuery.loading) return <PageLoader label="Loading your family…" />;
  if (studentsQuery.error) {
    return (
      <ErrorState
        title="We could not load your children"
        message={studentsQuery.error}
        onRetry={studentsQuery.reload}
      />
    );
  }

  const firstName = user?.firstName ?? 'your child';
  const selectedName = selected?.name ?? firstName;
  const selectedFirstName = selectedName.split(' ')[0];
  const driverFix: Fix | null =
    fix ?? (trackQuery.data?.driver ? { lat: trackQuery.data.driver.lat, lng: trackQuery.data.driver.lng, at: trackQuery.data.driver.lastSeen } : null);
  const freshness = driverFix ? freshnessLabel(driverFix.at, now) : null;
  const live = Boolean(freshness?.fresh && connection === 'online');
  const onboard = ride ? ride.status === 'PIN_VERIFIED' || ride.status === 'IN_PROGRESS' : false;
  const studentFix = onboard && live && driverFix ? driverFix : null;
  const eta = ride ? tripEta(ride, now) : null;

  if (students.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">
            {greeting()}, {firstName}!
          </h1>
          <p className="text-[14px] text-muted">{formatDate(now)} · {formatTime(now)} · Your family’s journey at a glance.</p>
        </div>
        <EmptyState
          icon="users"
          title="No children linked yet"
          description="Link your child’s student code to follow their trips, rewards and live location from this dashboard."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton to="/parent/guardians" icon="plus">
                Link a child
              </LinkButton>
              <LinkButton to="/parent/history" variant="secondary" icon="history">
                Trip history
              </LinkButton>
            </div>
          }
        />
      </div>
    );
  }

  const recentRide = (recentQuery.data?.rides ?? []).find((item) => item.id !== rideId) ?? null;
  const rewards = rewardsQuery.data;

  return (
    <div className="flex flex-col gap-6">
      {/* --- Heading ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">
          {greeting()}, {firstName}!
        </h1>
        <p className="text-[14px] text-muted">
          {formatDate(now)} · {formatTime(now)} · Your family’s journey at a glance.
        </p>
      </div>

      {unread > 0 ? (
        <Notice tone="primary" icon="bell" title={`${unread} unread update${unread === 1 ? '' : 's'}`}>
          New trip and safety messages are waiting in your feed.{' '}
          <Link to="/parent/notifications">Open notifications</Link>
        </Notice>
      ) : null}

      {/* --- Child switcher + status ----------------------------------- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a child">
          {students.map((student) => (
            <button
              key={student.id}
              type="button"
              aria-pressed={selectedId === student.id}
              onClick={() => setSelectedId(student.id)}
              className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 text-[12px] transition ${
                selectedId === student.id
                  ? 'border-primary bg-primary-soft font-bold text-primary'
                  : 'border-border bg-white text-muted hover:text-heading'
              }`}
            >
              <Icon name={student.activeRide ? 'radio' : 'user-round'} size={14} />
              {student.name}
            </button>
          ))}
        </div>

        <section className="gt-card flex flex-col gap-4" aria-label="Child status">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[16px] font-bold text-primary">
                {selectedName
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-bold leading-[1.5] text-heading">{selectedName}</p>
                <p className="truncate text-[12px] leading-[1.65] text-muted">
                  {selected?.school ?? '—'} · {selected?.grade ?? '—'}
                </p>
                <p className="truncate text-[12px] leading-[1.65] text-primary">
                  Connected to {user ? `${user.firstName} ${user.lastName}` : 'your account'}
                </p>
              </div>
            </div>
            <span
              className={`gt-badge ${
                ride ? 'gt-badge-primary' : 'gt-badge-neutral'
              }`}
            >
              {statusBadgeFor(ride)}
            </span>
          </div>

          <div>
            <p className="text-[16px] font-bold leading-[1.5] text-heading">{statusHeadline(ride, selectedFirstName)}</p>
            <p className="mt-1 text-[12px] text-muted">
              {ride ? (
                <>
                  Trip {ride.code} ·{' '}
                  {ride.startedAt
                    ? `Picked up at ${formatTime(ride.startedAt)}`
                    : `Requested ${formatTime(ride.requestedAt)}`}
                  {eta?.arrivesAt ? ` · Arriving ${formatTime(eta.arrivesAt)}` : ''}
                </>
              ) : selected?.activeRide ? (
                <>
                  Trip {selected.activeRide.code} is active for {selectedFirstName}.{' '}
                  <Link to="/parent/live" className="font-semibold text-primary hover:underline">
                    Open Live Trip
                  </Link>
                </>
              ) : (
                <>Last activity {selected ? `${selected.points} reward points banked` : '—'}</>
              )}
            </p>
          </div>

          {otherRide ? (
            <Notice tone="primary" icon="radio" title="Another child is on a trip">
              {otherRide.student.name} is riding right now (trip {otherRide.code},{' '}
              {rideStatusLabel(otherRide.status)}). Follow it from the Live Trip screen.{' '}
              <Link to="/parent/live">Open Live Trip</Link>
            </Notice>
          ) : null}
        </section>
      </div>

      {/* --- Current trip workspace ------------------------------------ */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[20px] font-bold leading-[1.5] text-heading">Current Trip</h2>
            {ride ? (
              <span className={`gt-badge ${live ? 'gt-badge-success' : 'gt-badge-neutral'}`}>
                {live ? 'Live Location Active' : 'Location updates paused'}
              </span>
            ) : null}
          </div>

          {!ride ? (
            activeQuery.loading ? (
              <Skeleton height={320} className="rounded-[20px]" />
            ) : activeQuery.error ? (
              <ErrorState
                title="We could not check for an active trip"
                message={activeQuery.error}
                onRetry={activeQuery.reload}
              />
            ) : (
              <EmptyState
                icon="navigation"
                title={`${selectedFirstName} is not on a trip`}
                description="When a ride is requested you will see the map, driver location and arrival estimate here in real time."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <LinkButton to="/parent/history" variant="secondary" icon="history">
                      Trip history
                    </LinkButton>
                    <LinkButton to="/parent/live" icon="radio">
                      Live Trip
                    </LinkButton>
                  </div>
                }
              />
            )
          ) : (
            <>
              {trackQuery.error ? (
                <Notice tone="danger" icon="alert-triangle" title="Live location could not be loaded">
                  {trackQuery.error}{' '}
                  <button type="button" onClick={trackQuery.reload} className="font-semibold text-primary hover:underline">
                    Try again
                  </button>
                </Notice>
              ) : null}

              <div className="flex flex-col gap-3">
                {trackQuery.loading ? (
                  <Skeleton height={390} className="rounded-[20px]" />
                ) : (
                  <MapCanvas
                    height={390}
                    pickup={{ lat: ride.pickup.lat, lng: ride.pickup.lng, label: ride.pickup.label }}
                    destination={{ lat: ride.destination.lat, lng: ride.destination.lng, label: ride.destination.label }}
                    driver={driverFix ? { lat: driverFix.lat, lng: driverFix.lng, label: ride.vehicle.nickname || 'Driver' } : null}
                    student={studentFix ? { lat: studentFix.lat, lng: studentFix.lng, label: selectedFirstName } : null}
                    trace={(trackQuery.data?.route ?? []).map((point) => ({ lat: point.lat, lng: point.lng }))}
                    freshness={freshness?.text ?? null}
                    live={live}
                    hint={`Trip ${ride.code} map`}
                  />
                )}
                <MapLegend active={live} />
              </div>

              {freshness && !freshness.fresh ? (
                <Notice tone="neutral" icon="clock" title="Location data is delayed">
                  {freshness.text}. The marker shows the last position the driver’s device reported.
                </Notice>
              ) : null}
              {connection !== 'online' ? (
                <Notice tone="danger" icon="wifi-off" title="Realtime connection lost">
                  Live updates are paused on this device. Reconnect to keep receiving trip positions.
                </Notice>
              ) : null}

              <section className="gt-card flex flex-col gap-4" aria-label="Arrival and progress">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[15px] font-bold text-heading">
                    {eta?.minutes !== null && eta?.minutes !== undefined
                      ? `${eta.minutes} min to ${ride.destination.label}`
                      : `${rideStatusLabel(ride.status)} · trip ${ride.code}`}
                  </p>
                  <p className="text-[12px] text-muted">
                    {eta?.arrivesAt ? `ETA ${formatTime(eta.arrivesAt)}` : `Estimated ${Math.round(ride.durationMin)} min ride`}
                  </p>
                </div>
                <RideTimeline ride={ride} />
              </section>

              <div className="flex flex-wrap gap-3">
                <a
                  href={`tel:${(ride.student.phone || '').replace(/\s+/g, '')}`}
                  className="gt-btn gt-btn-secondary"
                  aria-label={`Call ${ride.student.name}`}
                >
                  <Icon name="phone" size={17} />
                  Contact Child
                </a>
                <button type="button" className="gt-btn gt-btn-danger" onClick={() => setSosOpen(true)}>
                  <Icon name="siren" size={17} />
                  Emergency
                </button>
                <LinkButton to={`/parent/ride/${ride.id}`} variant="primary" icon="list">
                  Trip Details
                </LinkButton>
              </div>
            </>
          )}
        </div>

        {/* --- Right panel ---------------------------------------------- */}
        <div className="flex w-full flex-col gap-5 xl:w-[320px] xl:shrink-0">
          <section className="gt-card flex flex-col gap-4" aria-label="Trip details">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Trip details</h2>
            {ride ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[15px] font-bold text-primary">
                    {ride.driver.name
                      .split(' ')
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-bold leading-[1.5] text-heading">{ride.driver.name}</p>
                    <p className="text-[11px] leading-[1.5] text-success">
                      {ride.driver.overallStatus === 'VERIFIED' ? 'Verified driver ✓' : `Driver status: ${ride.driver.overallStatus}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 text-[13px] leading-[1.6]">
                  <p>
                    <span className="text-muted">Driver</span>
                    <br />
                    <span className="font-semibold text-heading">{ride.driver.name}</span>
                  </p>
                  <p>
                    <span className="text-muted">Vehicle</span>
                    <br />
                    <span className="font-semibold text-heading">
                      {ride.vehicle.color} {ride.vehicle.nickname} · {ride.vehicle.plateNumber}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted">Pickup{ride.acceptedAt ? ` · ${formatTime(ride.acceptedAt)}` : ''}</span>
                    <br />
                    <span className="font-semibold text-heading">{ride.pickup.label}</span>
                  </p>
                  <p>
                    <span className="text-muted">Destination</span>
                    <br />
                    <span className="font-semibold text-heading">{ride.destination.label}</span>
                  </p>
                  <p>
                    <span className="text-muted">ETA</span>
                    <br />
                    <span className="font-semibold text-heading">
                      {eta?.minutes !== null && eta?.minutes !== undefined ? `${eta.minutes} min` : '—'}
                      {eta?.arrivesAt ? ` · Arriving ${formatTime(eta.arrivesAt)}` : ''}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted">Trip status</span>
                    <br />
                    <span className="font-semibold text-heading">{rideStatusLabel(ride.status)}</span>
                  </p>
                </div>

                {ride.vehicle.status === 'VERIFIED' ? (
                  <span className="gt-badge gt-badge-success">Verified vehicle ✓</span>
                ) : null}
              </>
            ) : activeQuery.loading ? (
              <div className="flex flex-col gap-3">
                <Skeleton height={48} />
                <Skeleton height={96} />
              </div>
            ) : (
              <p className="text-[13px] text-muted">
                Trip details appear here as soon as {selectedFirstName} has an active ride.
              </p>
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-[12px] p-4" style={{ background: live ? 'var(--color-success-soft)' : 'var(--color-primary-soft)' }}>
            <div className="flex items-center gap-3">
              <Icon name={live ? 'shield-check' : 'shield-alert'} size={20} className={live ? 'text-success' : 'text-primary'} />
              <p className="text-[13px] font-bold text-heading">
                Location Sharing: {live ? 'Active' : 'Not active'}
              </p>
            </div>
            <p className="text-[12px] leading-[1.55] text-muted">
              {ride
                ? `Shared with you during ${selectedFirstName}’s active trip only. Sharing stops on arrival.`
                : 'No trip is sharing a location right now. Sharing only happens while a ride is active.'}
            </p>
          </div>

          <section className="gt-card flex flex-col gap-3" aria-label="Quick actions">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Quick actions</h2>
            <QuickTile to="/parent/live" icon="radio" label="Live Trip" hint="Follow the active ride" />
            <QuickTile to="/parent/history" icon="history" label="Trip History" hint="Past rides and receipts" />
            <QuickTile icon="gift" label="Free rides" hint="Rewards progress" onClick={() => setRewardsOpen(true)} />
            <QuickTile icon="siren" label="Safety" hint="SOS and safety desk" onClick={() => setSosOpen(true)} />
          </section>
        </div>
      </div>

      {/* --- Family updates -------------------------------------------- */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="gt-card flex flex-col gap-4" aria-label="Recent ride">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Recent ride</h2>
            {recentRide ? <RideStatusBadge status={recentRide.status} /> : null}
          </div>
          {recentQuery.loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton height={18} />
              <Skeleton height={44} />
            </div>
          ) : recentQuery.error ? (
            <ErrorState title="We could not load recent rides" message={recentQuery.error} onRetry={recentQuery.reload} />
          ) : recentRide ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-muted">{formatDate(recentRide.completedAt ?? recentRide.requestedAt)}</p>
              <p className="text-[14px] font-bold leading-[1.5] text-heading">
                {recentRide.pickup.label} → {recentRide.destination.label}
              </p>
              <p className="text-[12px] text-muted">
                {recentRide.driver.name} · {recentRide.vehicle.nickname} {recentRide.vehicle.plateNumber} ·{' '}
                {recentRide.freeRideApplied ? 'Free ride' : `₱${Math.round(recentRide.fare)}`}
              </p>
              <div className="mt-1 flex flex-wrap gap-3">
                <Link
                  to={`/parent/ride/${recentRide.id}`}
                  className="text-[12px] font-semibold text-primary hover:underline"
                >
                  View trip details →
                </Link>
                <Link to="/parent/history" className="text-[12px] font-semibold text-primary hover:underline">
                  View Trip History →
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted">No completed rides yet for {selectedFirstName}.</p>
          )}
        </section>

        <section className="gt-card flex flex-col gap-4" aria-label="Child rewards">
          <h2 className="text-[13px] font-bold leading-[1.5] text-heading">Guardian Points</h2>
          {rewardsQuery.loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton height={32} />
              <Skeleton height={8} />
            </div>
          ) : rewardsQuery.error ? (
            <ErrorState title="We could not load rewards" message={rewardsQuery.error} onRetry={rewardsQuery.reload} />
          ) : rewards ? (
            <>
              <p className="text-[26px] font-bold leading-[1.2] text-heading">
                {rewards.progress} / {rewards.goal} Points
              </p>
              <div
                className="gt-progress"
                role="progressbar"
                aria-valuenow={rewards.progress}
                aria-valuemin={0}
                aria-valuemax={rewards.goal}
                aria-label="Points toward a free ride"
              >
                <span style={{ width: `${rewards.percent}%` }} />
              </div>
              <p className="text-[12px] text-muted">
                {rewards.remaining > 0
                  ? `${rewards.remaining} more ride${rewards.remaining === 1 ? '' : 's'} until your FREE RIDE!`
                  : 'A free ride is ready to claim.'}
              </p>
              <p className="text-[11px] text-muted">
                Each completed trip earns {rewards.perRide} point.
                {rewards.freeRidesAvailable > 0 ? ` ${rewards.freeRidesAvailable} free ride(s) available.` : ''}
              </p>
            </>
          ) : null}
        </section>
      </div>

      {/* --- Dialogs ---------------------------------------------------- */}
      <SosModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        rideId={rideId}
        context={ride ? `about trip ${ride.code}` : undefined}
      />

      <Modal open={rewardsOpen} onClose={() => setRewardsOpen(false)} title="Free rides" size="sm">
        {rewardsQuery.loading ? (
          <PageLoader label="Loading rewards…" />
        ) : rewardsQuery.error ? (
          <ErrorState
            title="We could not load rewards"
            message={rewardsQuery.error}
            onRetry={rewardsQuery.reload}
          />
        ) : rewards ? (
          <div className="flex flex-col gap-4">
            <Notice tone="success" icon="gift" title={`${rewards.balance} points banked`}>
              {rewards.goal} points are worth one free ride. {rewards.remaining > 0 ? `${rewards.remaining} to go.` : 'You can claim one now.'}
            </Notice>
            <div className="gt-progress" role="progressbar" aria-valuenow={rewards.progress} aria-valuemin={0} aria-valuemax={rewards.goal}>
              <span style={{ width: `${rewards.percent}%` }} />
            </div>
            <ul className="flex flex-col gap-2 text-[13px] text-heading">
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">Completed rides</span>
                <span className="font-semibold">{rewards.completedRides}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">Free rides claimed</span>
                <span className="font-semibold">{rewards.freeRidesClaimed}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">Free rides available</span>
                <span className="font-semibold">{rewards.freeRidesAvailable}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted">Last ledger entry</span>
                <span className="font-semibold text-right">
                  {rewards.ledger[0]
                    ? `${rewards.ledger[0].delta > 0 ? '+' : ''}${rewards.ledger[0].delta} · ${relativeTime(rewards.ledger[0].createdAt)}`
                    : '—'}
                </span>
              </li>
            </ul>
            <LinkButton to="/parent/history" variant="secondary" block icon="history">
              See the rides that earned these points
            </LinkButton>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

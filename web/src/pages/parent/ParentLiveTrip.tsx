import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useInterval } from '../../lib/hooks';
import { formatDate, formatTime, rideStatusLabel } from '../../lib/format';
import { getConnectionState, getSocket, onConnectionChange, watchRide, type ConnectionState } from '../../lib/socket';
import type { SerializedRide } from '../../lib/types';
import { EmptyState, ErrorState, LinkButton, Notice, PageLoader, Skeleton } from '../../components/ui';
import { RideStatusBadge, RideTimeline } from '../../components/RideBits';
import { MapCanvas, MapLegend } from '../../components/MapCanvas';
import { Icon } from '../../components/Icon';
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

/** Freshness wording: never claim "live" for a frame we have not seen recently. */
function freshnessLabel(at: string | null, now: number): { text: string; fresh: boolean } {
  if (!at) return { text: 'Position time unknown', fresh: false };
  const stamp = new Date(at).getTime();
  if (Number.isNaN(stamp)) return { text: 'Position time unknown', fresh: false };
  const seconds = Math.max(0, Math.round((now - stamp) / 1000));
  if (seconds <= 45) {
    const age = seconds < 5 ? 'just now' : `${seconds}s ago`;
    return { text: `Updated ${formatTime(stamp)} · ${age}`, fresh: true };
  }
  const minutes = Math.round(seconds / 60);
  const age = minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hr ago`;
  return { text: `Last update ${formatTime(stamp)} · ${age}`, fresh: false };
}

function tripEta(
  ride: SerializedRide,
  now: number,
): { minutes: number | null; arrivesAt: number | null; remainingKm: number | null } {
  const startedAt = ride.startedAt ? new Date(ride.startedAt).getTime() : null;
  if (startedAt !== null && !Number.isNaN(startedAt)) {
    const elapsed = (now - startedAt) / 60000;
    const remaining = Math.max(0, ride.durationMin - elapsed);
    const fraction = ride.durationMin > 0 ? Math.max(0, Math.min(1, remaining / ride.durationMin)) : 1;
    return {
      minutes: Math.round(remaining),
      arrivesAt: startedAt + ride.durationMin * 60000,
      remainingKm: Number((ride.distanceKm * fraction).toFixed(1)),
    };
  }
  return { minutes: Math.round(ride.durationMin), arrivesAt: null, remainingKm: null };
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="text-[13px] leading-[1.6]">
      <span className="text-muted">{label}</span>
      <br />
      <span className="font-semibold text-heading">{value}</span>
    </p>
  );
}

export default function ParentLiveTrip() {
  useDocumentTitle('Live Trip · Guardian Transit');

  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 5000);

  const activeQuery = useAsync<{ ride: SerializedRide | null }>((signal) => api.get('/rides/active', { signal }), []);
  const activeRide = activeQuery.data?.ride ?? null;
  const activeId = activeRide?.id ?? null;

  const [socketRide, setSocketRide] = useState<SerializedRide | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const ride = socketRide && activeId && socketRide.id === activeId ? socketRide : activeRide;

  // When the active trip changes, drop the frames belonging to the old one.
  useEffect(() => {
    setSocketRide(null);
    setFix(null);
  }, [activeId]);

  const trackQuery = useAsync<TrackPayload>(
    (signal) => api.get(`/rides/${activeId}/track`, { signal }),
    [activeId],
    { enabled: Boolean(activeId) },
  );

  const [connection, setConnection] = useState<ConnectionState>(getConnectionState());
  useEffect(() => onConnectionChange(setConnection), []);

  useEffect(() => {
    if (!activeId) return;
    const unwatch = watchRide(activeId);
    const socket = getSocket();
    if (!socket) return unwatch;

    const onState = (payload: SerializedRide) => {
      if (payload.id === activeId) setSocketRide(payload);
    };
    const onLocation = (frame: TripLocationFrame) => {
      if (frame.rideId !== activeId) return;
      setFix({ lat: frame.lat, lng: frame.lng, at: frame.recordedAt });
    };
    socket.on('trip:state', onState);
    socket.on('trip:location', onLocation);

    return () => {
      socket.off('trip:state', onState);
      socket.off('trip:location', onLocation);
      unwatch();
    };
  }, [activeId, connection]);

  const [sosOpen, setSosOpen] = useState(false);

  if (activeQuery.loading) return <PageLoader label="Loading live trip…" />;
  if (activeQuery.error) {
    return (
      <ErrorState
        title="We could not load the active trip"
        message={activeQuery.error}
        onRetry={activeQuery.reload}
      />
    );
  }

  if (!ride) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">Live Location</h1>
          <p className="text-[14px] text-muted">No active trip · {formatDate(now)}</p>
        </div>
        <EmptyState
          icon="radio"
          title="No trip is happening right now"
          description="Live location appears here the moment a driver is assigned to one of your linked children, and stops on arrival."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton to="/parent/history" icon="history">
                Trip history
              </LinkButton>
              <LinkButton to="/parent" variant="secondary" icon="layout-dashboard">
                Dashboard
              </LinkButton>
            </div>
          }
        />
      </div>
    );
  }

  const driverFix: Fix | null =
    fix ??
    (trackQuery.data?.driver
      ? { lat: trackQuery.data.driver.lat, lng: trackQuery.data.driver.lng, at: trackQuery.data.driver.lastSeen }
      : null);
  const freshness = driverFix ? freshnessLabel(driverFix.at, now) : null;
  const live = Boolean(freshness?.fresh && connection === 'online');
  const onboard = ride.status === 'PIN_VERIFIED' || ride.status === 'IN_PROGRESS';
  const studentFix = onboard && live && driverFix ? driverFix : null;
  const eta = tripEta(ride, now);
  const studentFirstName = ride.student.name.split(' ')[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">Live Location</h1>
        <p className="text-[14px] text-muted">
          {studentFirstName}’s ride home · Trip {ride.code} · {formatDate(now)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className={`gt-badge ${live ? 'gt-badge-success' : 'gt-badge-neutral'}`}>
          Location Sharing: {live ? 'Active' : 'Paused'}
        </span>
        <RideStatusBadge status={ride.status} />
        <p className="text-[12px] text-muted">
          {freshness ? freshness.text : 'Waiting for the first position update…'}
        </p>
      </div>

      {!live ? (
        <Notice tone="danger" icon="alert-triangle" title="Live updates are not current">
          {connection !== 'online'
            ? 'This browser lost its realtime connection, so positions may be out of date. The map shows the last position we received.'
            : freshness
              ? `${freshness.text}. Treat the marker as the last known position, not the current one.`
              : 'No position has been reported for this trip yet.'}
        </Notice>
      ) : null}

      {trackQuery.error ? (
        <Notice tone="neutral" icon="map" title="Trip route unavailable">
          {trackQuery.error}{' '}
          <button type="button" onClick={trackQuery.reload} className="font-semibold text-primary hover:underline">
            Try again
          </button>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row">
        {/* --- Live route workspace ------------------------------------ */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {trackQuery.loading ? (
            <Skeleton height={440} className="rounded-[20px]" />
          ) : (
            <MapCanvas
              height={440}
              pickup={{ lat: ride.pickup.lat, lng: ride.pickup.lng, label: ride.pickup.label }}
              destination={{ lat: ride.destination.lat, lng: ride.destination.lng, label: ride.destination.label }}
              driver={driverFix ? { lat: driverFix.lat, lng: driverFix.lng, label: ride.vehicle.nickname || 'Driver' } : null}
              student={studentFix ? { lat: studentFix.lat, lng: studentFix.lng, label: studentFirstName } : null}
              trace={(trackQuery.data?.route ?? []).map((point) => ({ lat: point.lat, lng: point.lng }))}
              freshness={freshness?.text ?? null}
              live={live}
              hint={`Trip ${ride.code}`}
            />
          )}
          <MapLegend active={live} />

          <section className="gt-card flex flex-col gap-4" aria-label="Journey timeline">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[15px] font-bold text-heading">
                {ride.status === 'IN_PROGRESS' && eta.minutes !== null
                  ? `${eta.minutes} min to ${ride.destination.label}`
                  : `${rideStatusLabel(ride.status)}`}
              </p>
              <p className="text-[12px] text-muted">
                {eta.arrivesAt
                  ? `ETA ${formatTime(eta.arrivesAt)} · ${eta.remainingKm !== null ? `${eta.remainingKm} km left` : `${ride.distanceKm} km route`}`
                  : `Estimated ${Math.round(ride.durationMin)} min · ${ride.distanceKm} km`}
              </p>
            </div>
            <RideTimeline ride={ride} />
          </section>

          <div className="flex flex-wrap gap-3">
            <a
              href={`tel:${ride.student.phone.replace(/\s+/g, '')}`}
              className="gt-btn gt-btn-secondary"
              aria-label={`Call ${ride.student.name}`}
            >
              <Icon name="phone" size={17} />
              Contact Child
            </a>
            <a
              href={`tel:${(ride.driver.phone || '').replace(/\s+/g, '')}`}
              className="gt-btn gt-btn-secondary"
              aria-label={`Call ${ride.driver.name}`}
            >
              <Icon name="phone-call" size={17} />
              Contact Driver
            </a>
            <button type="button" className="gt-btn gt-btn-danger" onClick={() => setSosOpen(true)}>
              <Icon name="siren" size={17} />
              Emergency
            </button>
            <LinkButton to={`/parent/ride/${ride.id}`} variant="navy" icon="list">
              Trip details
            </LinkButton>
          </div>
        </div>

        {/* --- Live trip information ----------------------------------- */}
        <div className="flex w-full flex-col gap-5 xl:w-[308px] xl:shrink-0">
          <section className="gt-card flex flex-col gap-4" aria-label="Trip details">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Trip details</h2>
            <Detail label="Student" value={ride.student.name} />

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
                  {ride.driver.overallStatus === 'VERIFIED'
                    ? 'Verified driver ✓'
                    : `Driver status: ${ride.driver.overallStatus}`}
                </p>
              </div>
            </div>

            <Detail label="Driver" value={ride.driver.name} />
            <Detail
              label="Vehicle"
              value={`${ride.vehicle.color} ${ride.vehicle.nickname} · ${ride.vehicle.plateNumber}`}
            />
            <Detail label={`Pickup${ride.arrivedAt ? ` · ${formatTime(ride.arrivedAt)}` : ''}`} value={ride.pickup.label} />
            <Detail label="Destination" value={ride.destination.label} />
            <Detail
              label="ETA"
              value={
                ride.status === 'IN_PROGRESS' && eta.arrivesAt
                  ? `${eta.minutes} min · Arriving ${formatTime(eta.arrivesAt)}`
                  : `≈${Math.round(ride.durationMin)} min after pickup`
              }
            />
            <Detail label="Trip status" value={rideStatusLabel(ride.status)} />
            {ride.vehicle.status === 'VERIFIED' ? (
              <span className="gt-badge gt-badge-success">Verified vehicle ✓</span>
            ) : null}
          </section>

          <div className="flex flex-col gap-2 rounded-[12px] p-4" style={{ background: 'var(--color-success-soft)' }}>
            <div className="flex items-center gap-3">
              <Icon name="users" size={20} className="text-success" />
              <p className="text-[13px] font-bold text-heading">
                {studentFix ? `${studentFirstName} is connected` : 'Following the driver'}
              </p>
            </div>
            <p className="text-[12px] leading-[1.55] text-muted">
              {studentFix
                ? `${ride.student.name} and the ${ride.vehicle.nickname || 'vehicle'} are on the same active ride. Separate markers identify each location source.`
                : `${ride.student.name}’s marker appears once the driver’s PIN confirms pickup — until then the map shows the driver only.`}
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-[12px] p-4" style={{ background: 'var(--color-primary-soft)' }}>
            <div className="flex items-center gap-3">
              <Icon name="lock" size={20} className="text-primary" />
              <p className="text-[13px] font-bold text-heading">Private by design</p>
            </div>
            <p className="text-[12px] leading-[1.55] text-muted">
              Only the connected guardian can follow this trip. Location sharing stops automatically when{' '}
              {studentFirstName} arrives.
            </p>
          </div>

          <p className="text-[11px] leading-[1.5] text-muted">
            ETA is an estimate and may change with traffic. If an update is delayed, check the last updated time
            before taking action.
          </p>
        </div>
      </div>

      <SosModal open={sosOpen} onClose={() => setSosOpen(false)} rideId={ride.id} context={`about trip ${ride.code}`} />
    </div>
  );
}

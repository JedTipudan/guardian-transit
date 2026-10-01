import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { MapCanvas, type LatLng } from '../../components/MapCanvas';
import { Icon } from '../../components/Icon';
import { SosModal } from '../../components/SosModal';
import { RideStatusBadge, RideTimeline } from '../../components/RideBits';
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
  TextareaField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useInterval, useMutation } from '../../lib/hooks';
import { connectSocket, watchRide } from '../../lib/socket';
import {
  formatCurrency,
  formatDate,
  formatDistance,
  formatMinutes,
  formatTime,
  relativeTime,
  rideStatusLabel,
} from '../../lib/format';
import type { LedgerEntry, RideStatus, SerializedRide } from '../../lib/types';
import { useBooking } from '../../state/BookingContext';
import { useNotifications } from '../../state/NotificationsContext';
import { useToast } from '../../state/ToastContext';

const ACTIVE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'PIN_VERIFIED',
  'IN_PROGRESS',
];

const CANCELLABLE: RideStatus[] = ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'];

/** Progress reflects the real ride status — never a fabricated percentage. */
const stagePercent: Record<RideStatus, number> = {
  REQUESTED: 8,
  DRIVER_ASSIGNED: 30,
  DRIVER_ARRIVED: 50,
  PIN_VERIFIED: 62,
  IN_PROGRESS: 78,
  COMPLETED: 100,
  CANCELLED: 100,
  NO_SHOW: 100,
};

interface TrackPayload {
  ride: SerializedRide;
  route: { lat: number; lng: number; at: string }[];
  driver: { lat: number; lng: number; lastSeen: string | null } | null;
}

interface TripLocationFrame {
  rideId: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

/** The live trip: real ride state over REST + `trip:*` socket frames. */
export default function StudentRide() {
  useDocumentTitle('Your ride · Guardian Transit');

  const { id } = useParams<{ id: string }>();
  const rideId = id ?? '';
  const booking = useBooking();
  const { connection } = useNotifications();
  const { push } = useToast();

  const [ride, setRide] = useState<SerializedRide | null>(null);
  const [route, setRoute] = useState<LatLng[]>([]);
  const [driverFix, setDriverFix] = useState<{ lat: number; lng: number; at: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const rideQuery = useAsync<{ ride: SerializedRide | null }>(
    (signal) => api.get<{ ride: SerializedRide | null }>(`/rides/${rideId}`, { signal }),
    [rideId],
    { enabled: Boolean(rideId) },
  );
  const trackQuery = useAsync<TrackPayload>(
    (signal) => api.get<TrackPayload>(`/rides/${rideId}/track`, { signal }),
    [rideId],
    { enabled: Boolean(rideId) },
  );

  useEffect(() => {
    if (rideQuery.data?.ride) setRide(rideQuery.data.ride);
  }, [rideQuery.data]);

  useEffect(() => {
    const data = trackQuery.data;
    if (!data) return;
    setRoute(data.route.map((point) => ({ lat: point.lat, lng: point.lng })));
    setDriverFix(
      data.driver ? { lat: data.driver.lat, lng: data.driver.lng, at: data.driver.lastSeen ?? '' } : null,
    );
  }, [trackQuery.data]);

  // Join the ride room and follow live state + telemetry while mounted.
  useEffect(() => {
    if (!rideId) return;
    const socket = connectSocket();
    const onState = (payload: SerializedRide) => {
      if (payload && payload.id === rideId) setRide(payload);
    };
    const onLocation = (payload: TripLocationFrame) => {
      if (!payload || payload.rideId !== rideId) return;
      setDriverFix({ lat: payload.lat, lng: payload.lng, at: payload.recordedAt });
      setRoute((previous) => [...previous, { lat: payload.lat, lng: payload.lng }]);
      setNow(Date.now());
    };
    socket.on('trip:state', onState);
    socket.on('trip:location', onLocation);
    const unwatch = watchRide(rideId);
    return () => {
      socket.off('trip:state', onState);
      socket.off('trip:location', onLocation);
      unwatch();
    };
  }, [rideId]);

  // After a reconnect we may have missed frames — refetch before trusting data.
  const previousConnection = useRef(connection);
  const { reload: reloadRide } = rideQuery;
  const { reload: reloadTrack } = trackQuery;
  useEffect(() => {
    if (connection === 'online' && previousConnection.current !== 'online' && rideId) {
      reloadRide();
      reloadTrack();
    }
    previousConnection.current = connection;
  }, [connection, rideId, reloadRide, reloadTrack]);

  const isActive = ride ? ACTIVE_STATUSES.includes(ride.status) : false;
  const canCancel = ride ? CANCELLABLE.includes(ride.status) : false;
  useInterval(() => setNow(Date.now()), isActive ? 5000 : null);

  const rewardsQuery = useAsync<{ ledger: LedgerEntry[] }>(
    (signal) => api.get<{ ledger: LedgerEntry[] }>('/rewards', { signal }),
    [rideId],
    { enabled: ride?.status === 'COMPLETED' },
  );
  const pointsEntry = rewardsQuery.data?.ledger.find((entry) => entry.rideId === rideId) ?? null;

  const [sosOpen, setSosOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const cancel = useMutation((reason: string) =>
    api.post<{ ride: SerializedRide }>(`/rides/${rideId}/cancel`, { reason }),
  );

  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const rate = useMutation(() =>
    api.post<{ ride: SerializedRide }>(`/rides/${rideId}/rate`, {
      rating,
      note: note.trim() || undefined,
    }),
  );

  const ratedAlready = ride?.rating ?? 0;
  useEffect(() => {
    if (ratedAlready > 0) {
      setRating(ratedAlready);
      setNote(ride?.reviewNote ?? '');
    }
  }, [ratedAlready, ride?.reviewNote]);

  async function onSubmitCancel() {
    const reason = cancelReason.trim();
    if (reason.length < 3) return;
    const result = await cancel.run(reason);
    if (result) {
      setRide(result.ride);
      setCancelOpen(false);
      setCancelReason('');
      push('Ride cancelled.', 'info');
    }
  }

  async function onSubmitRating() {
    if (rating < 1) return;
    const result = await rate.run();
    if (result) {
      setRide(result.ride);
      push('Thanks — your rating was saved.', 'success');
    }
  }

  const fixTime = driverFix && Number.isFinite(Date.parse(driverFix.at)) ? Date.parse(driverFix.at) : null;
  const isFresh = fixTime !== null && now - fixTime < 20000;
  const isLive = isFresh && connection === 'online';
  const freshnessText = !driverFix
    ? null
    : fixTime === null
      ? 'Driver position on file'
      : isLive
        ? `Live · updated ${formatTime(fixTime)}`
        : `Last position · ${relativeTime(fixTime)}`;

  const header = (
    <StudentHeader
      title="Your ride home"
      subtitle={ride ? `Trip ${ride.code} · ${formatDate(ride.requestedAt)}` : 'Loading trip…'}
      backTo="/student"
      right={
        <LinkButton to="/student/notifications" variant="secondary" size="sm" icon="bell" className="px-3">
          <span className="sr-only">Notifications</span>
        </LinkButton>
      }
    />
  );

  if (!ride) {
    if (rideQuery.loading) {
      return (
        <>
          {header}
          <PageLoader label="Loading your ride…" />
        </>
      );
    }
    if (rideQuery.error) {
      return (
        <>
          {header}
          <div className="px-5 py-6">
            <ErrorState title="We could not load this ride" message={rideQuery.error} onRetry={rideQuery.reload} />
          </div>
        </>
      );
    }
    return (
      <>
        {header}
        <div className="px-5 py-6">
          <EmptyState
            icon="history"
            title="Ride not found"
            description="This ride may have been removed, or it does not belong to your account."
            action={<LinkButton to="/student/trips" variant="secondary">Back to trips</LinkButton>}
          />
        </div>
      </>
    );
  }

  const connectionBadge =
    connection === 'offline' ? (
      <Badge tone="danger" icon="wifi-off">
        Connection lost
      </Badge>
    ) : connection === 'connecting' ? (
      <Badge tone="warning" icon="wifi">
        Reconnecting…
      </Badge>
    ) : isLive ? (
      <Badge tone="success" icon="radio">
        Live location on
      </Badge>
    ) : null;

  const pin = ride.pin ?? booking.pickupPin ?? null;
  const etaClock = formatTime(Date.now() + ride.durationMin * 60000);

  return (
    <>
      {header}

      <div className="flex flex-col gap-5 px-5 pb-6 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <RideStatusBadge status={ride.status} />
          {connectionBadge}
        </div>

        {connection !== 'online' ? (
          <Notice tone="danger" icon="wifi-off" title={connection === 'connecting' ? 'Reconnecting' : 'Connection lost'}>
            Live updates are paused. The map below shows the last position we received — not a live one.
          </Notice>
        ) : null}

        {isActive ? (
          <MapCanvas
            pickup={{ lat: ride.pickup.lat, lng: ride.pickup.lng, label: ride.pickup.label }}
            destination={{ lat: ride.destination.lat, lng: ride.destination.lng, label: ride.destination.label }}
            driver={driverFix ? { lat: driverFix.lat, lng: driverFix.lng, label: 'BaoBao' } : null}
            trace={route}
            height={260}
            freshness={freshnessText}
            live={isLive}
            hint="Your route"
          />
        ) : null}

        {ride.status === 'REQUESTED' ? (
          <section className="gt-card flex flex-col gap-3">
            <Badge tone="primary" icon="clock">
              Waiting for a driver to accept
            </Badge>
            <p className="text-[13px] text-muted">
              Your request was sent to {ride.driver.name}. Live trip details appear the moment they accept.
            </p>
            {/* Shimmer placeholders stand in for live data we do not have yet. */}
            <Skeleton height={72} className="rounded-[12px]" />
            <Skeleton height={56} className="rounded-[12px]" />
          </section>
        ) : null}

        {isActive ? (
          <section className="gt-card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[21px] font-bold leading-[1.3] text-heading">
                {formatMinutes(ride.durationMin)} to {ride.destination.label}
              </h2>
              <span className="shrink-0 pt-1 text-[12px] text-muted">est. {etaClock}</span>
            </div>
            <div
              className="gt-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={stagePercent[ride.status]}
              aria-label="Trip progress"
            >
              <span style={{ width: `${stagePercent[ride.status]}%` }} />
            </div>
            <div className="text-[13px] leading-[1.7] text-heading">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Pickup · {formatTime(ride.requestedAt)}
              </p>
              <p className="font-semibold">{ride.pickup.label}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Destination · est. {etaClock}
              </p>
              <p className="font-semibold">{ride.destination.label}</p>
            </div>
          </section>
        ) : null}

        {isActive ? (
          <section className="gt-card">
            <RideTimeline ride={ride} />
          </section>
        ) : null}

        {ride.status !== 'REQUESTED' && isActive ? (
          <section className="gt-card flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={ride.driver.name} src={ride.driver.avatarUrl} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold leading-[1.5] text-heading">{ride.driver.name}</p>
                <p className="truncate text-[12px] text-muted">
                  Verified driver{ride.driver.overallStatus === 'VERIFIED' ? ' ✓' : ''}
                  {ride.driver.rating ? ` · ★ ${ride.driver.rating.toFixed(1)}` : ''}
                </p>
              </div>
              <Badge tone="success" icon="badge-check">
                Verified
              </Badge>
            </div>
            <p className="text-[13px] leading-[1.65] text-muted">
              {ride.vehicle.nickname} {ride.vehicle.make} {ride.vehicle.model}
              <br />
              Plate {ride.vehicle.plateNumber} ·{' '}
              <span className="font-bold text-heading">
                Fare · {ride.freeRideApplied ? 'Free ride' : formatCurrency(ride.fare)}
              </span>
            </p>
            <p className="text-[12px] text-muted">
              {freshnessText ?? 'No live position received for this driver yet.'}
            </p>
            <a href={`tel:${ride.driver.phone ?? ''}`} className="gt-btn gt-btn-secondary gt-btn-block">
              <Icon name="phone" size={17} />
              Contact driver
            </a>
          </section>
        ) : null}

        {ride.status === 'DRIVER_ARRIVED' ? (
          <section className="gt-card flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name="key" size={18} className="text-primary" />
              <h2 className="text-[15px] font-bold text-heading">Pickup PIN</h2>
            </div>
            {pin ? (
              <>
                <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Your pickup PIN">
                  {pin.split('').map((digit, index) => (
                    <span
                      key={`${digit}-${index}`}
                      className="gt-otp-box flex items-center justify-center"
                      aria-hidden="true"
                    >
                      {digit}
                    </span>
                  ))}
                </div>
                <Notice tone="primary" icon="info">
                  Read this PIN to your driver so they can verify pickup. Only your assigned driver can use it — never
                  share it with anyone else.
                </Notice>
              </>
            ) : (
              <p className="gt-hint">Your pickup PIN will appear here once your driver arrives.</p>
            )}
          </section>
        ) : null}

        {ride.status === 'PIN_VERIFIED' ? (
          <Notice tone="success" icon="check-circle" title="Pickup verified">
            {ride.verifiedAt ? `Verified ${formatTime(ride.verifiedAt)} · ` : ''}Your driver is starting the trip now.
          </Notice>
        ) : null}

        {ride.status === 'COMPLETED' ? (
          <section className="gt-card flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[12px] text-muted">Fare paid</p>
                <p className="text-[24px] font-bold leading-[1.4] text-heading">{formatCurrency(ride.fare)}</p>
              </div>
              {ride.freeRideApplied ? (
                <Badge tone="success" icon="gift">
                  Free ride applied
                </Badge>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-muted">Distance</p>
                <p className="text-[14px] font-semibold text-heading">{formatDistance(ride.distanceKm)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Duration</p>
                <p className="text-[14px] font-semibold text-heading">{formatMinutes(ride.durationMin)}</p>
              </div>
            </div>
            <p className="gt-hint">
              Completed {formatTime(ride.completedAt)} · {formatDate(ride.completedAt)}
            </p>
            {rewardsQuery.error ? (
              <button type="button" onClick={rewardsQuery.reload} className="gt-hint text-left underline">
                Points could not be loaded — tap to retry.
              </button>
            ) : pointsEntry ? (
              <Badge tone="success" icon="star">
                +{pointsEntry.delta} point{pointsEntry.delta === 1 ? '' : 's'} earned
              </Badge>
            ) : rewardsQuery.loading ? (
              <Skeleton height={22} />
            ) : null}
          </section>
        ) : null}

        {ride.status === 'COMPLETED' ? (
          <section className="gt-card flex flex-col gap-3">
            <h2 className="text-[15px] font-bold text-heading">
              {ride.rating ? 'Your rating' : 'Rate your driver'}
            </h2>
            <div className="flex items-center gap-1.5" role={ride.rating ? undefined : 'radiogroup'} aria-label="Driver rating">
              {[1, 2, 3, 4, 5].map((value) =>
                ride.rating ? (
                  <Icon
                    key={value}
                    name="star"
                    size={22}
                    className={value <= ratedAlready ? 'text-primary fill-current' : 'text-border'}
                  />
                ) : (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value} star${value === 1 ? '' : 's'}`}
                    onClick={() => setRating(value)}
                    className="rounded-[8px] p-1 transition hover:bg-primary-soft"
                  >
                    <Icon
                      name="star"
                      size={26}
                      className={value <= rating ? 'text-primary fill-current' : 'text-border'}
                    />
                  </button>
                ),
              )}
              {ride.rating ? (
                <span className="ml-2 text-[13px] text-muted">You rated this ride {ride.rating} of 5</span>
              ) : null}
            </div>
            {ride.rating ? (
              ride.reviewNote ? (
                <p className="text-[13px] text-muted">“{ride.reviewNote}”</p>
              ) : null
            ) : (
              <>
                <TextareaField
                  id="ride-note"
                  label="Add a note (optional)"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={300}
                  error={rate.error}
                  placeholder="How was the ride?"
                />
                <Button block loading={rate.pending} disabled={rating < 1} onClick={() => void onSubmitRating()}>
                  Submit rating
                </Button>
              </>
            )}
          </section>
        ) : null}

        {ride.status === 'CANCELLED' || ride.status === 'NO_SHOW' ? (
          <Notice
            tone="danger"
            icon="alert-triangle"
            title={rideStatusLabel(ride.status)}
          >
            {ride.cancelReason ? `Reason: ${ride.cancelReason}` : 'This ride ended before the trip was completed.'}
            {ride.cancelRequestedBy ? ` · Reported by ${ride.cancelRequestedBy.toLowerCase()}` : ''}
          </Notice>
        ) : null}

        {canCancel ? (
          <Button variant="secondary" block icon="x" onClick={() => setCancelOpen(true)}>
            Cancel this ride
          </Button>
        ) : null}

        {ride.status === 'COMPLETED' || ride.status === 'CANCELLED' || ride.status === 'NO_SHOW' ? (
          <LinkButton to="/student/book/pickup" block icon="car">
            Book another ride
          </LinkButton>
        ) : null}

        <Button variant="danger" block icon="siren" onClick={() => setSosOpen(true)}>
          SOS · Get emergency help
        </Button>

        {isActive ? (
          <p className="text-center text-[11px] text-muted">
            Stay seated and check your belongings before arrival.
          </p>
        ) : null}
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this ride"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep ride
            </Button>
            <Button
              variant="danger"
              loading={cancel.pending}
              disabled={cancelReason.trim().length < 3}
              onClick={() => void onSubmitCancel()}
            >
              Cancel ride
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">
            Tell us why this ride is being cancelled — your driver and guardian are notified right away.
          </p>
          <TextareaField
            id="cancel-reason"
            label="Reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={200}
            error={cancel.error}
            placeholder="e.g. plans changed, no longer needed"
          />
        </div>
      </Modal>

      <SosModal open={sosOpen} onClose={() => setSosOpen(false)} rideId={rideId} context={`on ride ${ride.code}`} />
    </>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, EmptyState, ErrorState, LinkButton, Modal, PageLoader } from '../../components/ui';
import { MapCanvas, MapLegend, type LatLng } from '../../components/MapCanvas';
import { DetailRow, RideStatusBadge, RideTimeline } from '../../components/RideBits';
import { SosModal } from '../../components/SosModal';
import { api, errorMessage, type ApiError } from '../../lib/api';
import { useAsync, useDocumentTitle, useInterval } from '../../lib/hooks';
import { getConnectionState, getSocket, onConnectionChange, watchRide, type ConnectionState } from '../../lib/socket';
import {
  formatCurrency,
  formatDateTime,
  formatDistance,
  formatMinutes,
  formatTime,
  rideStatusLabel,
} from '../../lib/format';
import type { SerializedRide } from '../../lib/types';
import { useToast } from '../../state/ToastContext';

type GeoState = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable';
type RideAction = 'accept' | 'arrive' | 'start' | 'complete';

interface Fix extends LatLng {
  at: number;
}

const ACTIVE_STATUSES = ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PIN_VERIFIED', 'IN_PROGRESS'];
const CANCELLABLE_STATUSES = ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'];

const ACTION_MESSAGES: Record<RideAction, string> = {
  accept: 'Ride accepted — head to the pickup point.',
  arrive: 'Marked as arrived — the student has been notified.',
  start: 'Trip started — your live location is being shared.',
  complete: 'Trip completed. Nice work!',
};

function freshnessLabel(point: Fix, now: number): string {
  const ageMs = Math.max(0, now - point.at);
  const seconds = Math.round(ageMs / 1000);
  const age = seconds < 10 ? 'just now' : seconds < 60 ? `${seconds} sec ago` : `${Math.round(seconds / 60)} min ago`;
  return `Updated ${formatTime(point.at)} · ${age}`;
}

export default function DriverActiveRide() {
  const { id: rideId } = useParams();
  useDocumentTitle('Active Ride · Guardian Transit');
  const { push } = useToast();

  const rideState = useAsync<{ ride: SerializedRide | null }>(
    (signal) =>
      rideId
        ? api.get<{ ride: SerializedRide }>(`/rides/${rideId}`, { signal })
        : api.get<{ ride: SerializedRide | null }>('/driver/active-ride', { signal }),
    [rideId],
  );

  const ride = rideState.data?.ride ?? null;
  const isActive = ride ? ACTIVE_STATUSES.includes(ride.status) : false;
  const canCancel = ride ? CANCELLABLE_STATUSES.includes(ride.status) : false;

  // --- live transport ------------------------------------------------------
  const [connection, setConnection] = useState<ConnectionState>(getConnectionState());
  const [now, setNow] = useState(() => Date.now());

  const [geoState, setGeoState] = useState<GeoState>('idle');
  const [localFix, setLocalFix] = useState<Fix | null>(null);
  const [localFixes, setLocalFixes] = useState<Fix[]>([]);
  const [remoteFix, setRemoteFix] = useState<Fix | null>(null);
  const [remoteFixes, setRemoteFixes] = useState<LatLng[]>([]);

  useEffect(() => onConnectionChange(setConnection), []);

  // Keeps relative "updated … ago" labels honest without hammering the CPU.
  useInterval(() => setNow(Date.now()), ride ? 5000 : null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !ride?.id) return;
    const currentId = ride.id;

    const unwatch = watchRide(currentId);
    const onState = (payload: SerializedRide) => {
      if (payload && payload.id === currentId) rideState.setData({ ride: payload });
    };
    const onLocation = (payload: { rideId?: string; lat?: number; lng?: number; recordedAt?: string }) => {
      const lat = payload?.lat;
      const lng = payload?.lng;
      if (payload?.rideId !== currentId || typeof lat !== 'number' || typeof lng !== 'number') return;
      const parsed = payload.recordedAt ? Date.parse(payload.recordedAt) : NaN;
      const at = Number.isNaN(parsed) ? Date.now() : parsed;
      setRemoteFix({ lat, lng, at });
      setRemoteFixes((prev) => [...prev, { lat, lng }].slice(-80));
    };

    socket.on('trip:state', onState);
    socket.on('trip:location', onLocation);
    return () => {
      socket.off('trip:state', onState);
      socket.off('trip:location', onLocation);
      unwatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, rideState.setData]);

  // Real device position, streamed to the server only while a ride is open.
  useEffect(() => {
    if (!ride?.id || !isActive) return;
    if (!('geolocation' in navigator)) {
      setGeoState('unavailable');
      return;
    }

    const activeRideId = ride.id;
    setLocalFix(null);
    setLocalFixes([]);
    setRemoteFix(null);
    setRemoteFixes([]);
    setGeoState('locating');

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const at = Date.now();
        setLocalFix({ lat, lng, at });
        setLocalFixes((prev) => [...prev, { lat, lng, at }].slice(-80));
        setGeoState('active');

        const socket = getSocket();
        if (!socket?.connected) return;
        const payload: {
          rideId: string;
          lat: number;
          lng: number;
          accuracyM?: number;
          speedKph?: number;
          heading?: number;
        } = { rideId: activeRideId, lat, lng };
        const accuracy = position.coords.accuracy;
        const speed = position.coords.speed;
        const heading = position.coords.heading;
        if (Number.isFinite(accuracy)) payload.accuracyM = accuracy;
        if (typeof speed === 'number' && Number.isFinite(speed)) payload.speedKph = speed * 3.6;
        if (typeof heading === 'number' && Number.isFinite(heading)) payload.heading = heading;
        socket.emit('driver:location', payload);
      },
      (error) => setGeoState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, isActive]);

  // --- status actions ------------------------------------------------------
  const [acting, setActing] = useState<RideAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runAction(action: RideAction) {
    if (!ride) return;
    setActing(action);
    setActionError(null);
    try {
      const result = await api.post<{ ride: SerializedRide }>(`/rides/${ride.id}/${action}`);
      rideState.setData({ ride: result.ride });
      push(ACTION_MESSAGES[action], 'success');
    } catch (cause) {
      const message = errorMessage(cause, 'That action did not go through.');
      setActionError(message);
      push(message, 'error');
    } finally {
      setActing(null);
    }
  }

  // --- pickup PIN ----------------------------------------------------------
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);

  async function submitPin(event: FormEvent) {
    event.preventDefault();
    if (!ride) return;
    const value = pin.trim();
    if (value.length < 4) {
      setPinError('Enter the pickup PIN the student sees in their app.');
      return;
    }
    setPinPending(true);
    setPinError(null);
    try {
      const result = await api.post<{ ride: SerializedRide; attemptsLeft: number }>(`/rides/${ride.id}/verify-pin`, {
        pin: value,
      });
      rideState.setData({ ride: result.ride });
      setPin('');
      push('Pickup verified — you can start the trip.', 'success');
    } catch (cause) {
      const details = (cause as ApiError)?.details as { attemptsLeft?: number } | undefined;
      const message = errorMessage(cause, 'That PIN did not work.');
      setPinError(
        typeof details?.attemptsLeft === 'number' && !/attempt/i.test(message)
          ? `${message} ${details.attemptsLeft} attempt(s) left.`
          : message,
      );
    } finally {
      setPinPending(false);
    }
  }

  // --- cancel + emergency --------------------------------------------------
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  async function submitCancel() {
    if (!ride) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setCancelError('Tell us why this ride is being cancelled.');
      return;
    }
    setCancelPending(true);
    setCancelError(null);
    try {
      const result = await api.post<{ ride: SerializedRide }>(`/rides/${ride.id}/cancel`, { reason });
      rideState.setData({ ride: result.ride });
      setCancelOpen(false);
      setCancelReason('');
      push('Ride cancelled. The student and guardian were notified.', 'success');
    } catch (cause) {
      setCancelError(errorMessage(cause, 'We could not cancel this ride.'));
    } finally {
      setCancelPending(false);
    }
  }

  // --- loading / empty -----------------------------------------------------
  if (!rideState.data && rideState.error) {
    return (
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Active ride</h1>
        <ErrorState
          title="We could not load this ride"
          message={rideState.error}
          onRetry={rideState.reload}
        />
        <LinkButton to="/driver" variant="secondary" icon="layout-dashboard">
          Back to dashboard
        </LinkButton>
      </div>
    );
  }

  if (!rideState.data) {
    return (
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Active ride</h1>
        <PageLoader label="Loading ride…" />
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Active ride</h1>
          <p className="text-[13px] text-muted">Everything happening on the trip you are driving right now.</p>
        </div>
        <EmptyState
          icon="navigation"
          title="No active ride"
          description="When a student books you for a ride it shows up here. Go online from your dashboard to start receiving requests."
          action={<LinkButton to="/driver" icon="layout-dashboard">Back to dashboard</LinkButton>}
        />
      </div>
    );
  }

  const driverPoint: Fix | null = localFix ?? remoteFix;
  const trace: LatLng[] = localFixes.length >= 2 ? localFixes : remoteFixes;

  const locationStatus = (() => {
    if (connection === 'offline') {
      return { tone: 'danger' as const, icon: 'wifi-off', text: 'Connection lost — live updates are paused.' };
    }
    if (connection === 'connecting') {
      return { tone: 'warning' as const, icon: 'refresh-cw', text: 'Reconnecting to live updates…' };
    }
    if (!isActive) {
      return { tone: 'neutral' as const, icon: 'map-pin', text: 'No trip in progress — location sharing is off.' };
    }
    if (geoState === 'denied') {
      return {
        tone: 'danger' as const,
        icon: 'map-pin',
        text: 'Location permission required — allow location access in your browser to share your position.',
      };
    }
    if (geoState === 'unavailable') {
      return {
        tone: 'warning' as const,
        icon: 'alert-triangle',
        text: 'GPS unavailable — this device is not reporting a position.',
      };
    }
    if (geoState === 'locating') {
      return { tone: 'warning' as const, icon: 'radio', text: 'Waiting for a GPS fix…' };
    }
    if (geoState === 'active' && driverPoint) {
      return {
        tone: 'success' as const,
        icon: 'check-circle',
        text: `Location active · ${freshnessLabel(driverPoint, now)}`,
      };
    }
    return { tone: 'neutral' as const, icon: 'map-pin', text: 'Waiting for your device location…' };
  })();

  const locationBadge = (() => {
    if (connection === 'offline') return 'Connection lost';
    if (connection === 'connecting') return 'Reconnecting';
    if (!isActive) return 'Sharing off';
    if (geoState === 'denied') return 'Permission required';
    if (geoState === 'unavailable') return 'GPS unavailable';
    if (geoState === 'locating') return 'Acquiring GPS';
    if (geoState === 'active') return 'Location active';
    return 'Location idle';
  })();

  const stepCopy = (() => {
    switch (ride.status) {
      case 'REQUESTED':
        return 'Accept the request to be assigned, then head to the pickup point.';
      case 'DRIVER_ASSIGNED':
        return `Head to ${ride.pickup.label} and tap “Arrive at pickup” when you get there.`;
      case 'DRIVER_ARRIVED':
        return 'Ask the student for the pickup PIN shown in their app to verify the handover.';
      case 'PIN_VERIFIED':
        return 'The student is aboard. Start the trip when you are ready to drive.';
      case 'IN_PROGRESS':
        return `Drive to ${ride.destination.label}, then complete the trip on arrival.`;
      default:
        return '';
    }
  })();

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">
            {ride.status === 'IN_PROGRESS' ? 'Trip in progress' : ride.status === 'COMPLETED' ? 'Trip summary' : 'Active ride'}
          </h1>
          <p className="text-[13px] text-muted">
            {ride.code} · {rideStatusLabel(ride.status)} · requested {formatDateTime(ride.requestedAt)}
          </p>
        </div>
        <RideStatusBadge status={ride.status} />
      </div>

      {rideState.error ? (
        <p className="gt-error-text" role="alert">
          Could not refresh: {rideState.error}{' '}
          <button type="button" onClick={rideState.reload} className="font-semibold underline">
            Retry
          </button>
        </p>
      ) : null}

      {/* Map ------------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <MapCanvas
          height={300}
          pickup={{ lat: ride.pickup.lat, lng: ride.pickup.lng, label: ride.pickup.label }}
          destination={{ lat: ride.destination.lat, lng: ride.destination.lng, label: ride.destination.label }}
          driver={driverPoint ? { lat: driverPoint.lat, lng: driverPoint.lng, label: 'You' } : null}
          trace={trace}
          freshness={driverPoint ? freshnessLabel(driverPoint, now) : null}
          live={geoState === 'active' && connection === 'online'}
          hint="Map shows your pickup, destination and your live position."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={locationStatus.tone} icon={locationStatus.icon}>
            {locationBadge}
          </Badge>
          <span className="min-w-0 text-[12px] text-muted">{locationStatus.text}</span>
        </div>
        <MapLegend active={geoState === 'active'} />
      </div>

      {/* Student + route --------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={ride.student.name} src={ride.student.avatarUrl} size={48} />
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-heading">{ride.student.name}</p>
            <p className="text-[12px] text-muted">
              {ride.student.school} · {ride.student.grade} · {ride.student.studentCode}
            </p>
          </div>
          <a
            href={`tel:${ride.student.phone.replace(/\s+/g, '')}`}
            className="gt-btn gt-btn-secondary gt-btn-sm ml-auto"
            aria-label={`Call ${ride.student.name}`}
          >
            <Icon name="phone" size={15} />
            Call
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DetailRow
            label="Pickup"
            strong
            value={
              <>
                {ride.pickup.label}
                <span className="block text-[12px] font-normal text-muted">{ride.pickup.address}</span>
              </>
            }
          />
          <DetailRow
            label="Destination"
            strong
            value={
              <>
                {ride.destination.label}
                <span className="block text-[12px] font-normal text-muted">{ride.destination.address}</span>
              </>
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-3 sm:grid-cols-4">
          <DetailRow label="Fare" strong value={formatCurrency(ride.fare)} />
          <DetailRow label="Distance" value={formatDistance(ride.distanceKm)} />
          <DetailRow label="Duration" value={formatMinutes(ride.durationMin)} />
          <DetailRow label="Vehicle" value={`${ride.vehicle.nickname} · ${ride.vehicle.plateNumber}`} />
        </div>

        {ride.parent ? (
          <p className="text-[12px] text-muted">
            Guardian: {ride.parent.name} · {ride.parent.phone}
          </p>
        ) : null}
      </section>

      {/* Progress ---------------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-[16px] font-bold text-heading">
          <span className="text-primary">
            <Icon name="route" size={18} />
          </span>
          Trip progress
        </h2>
        <RideTimeline ride={ride} />
      </section>

      {/* Actions ----------------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-[16px] font-bold text-heading">
          <span className="text-primary">
            <Icon name="navigation" size={18} />
          </span>
          Next step
        </h2>

        {actionError ? (
          <p className="gt-error-text" role="alert">
            {actionError}
          </p>
        ) : null}

        {stepCopy ? <p className="text-[13px] leading-[1.6] text-muted">{stepCopy}</p> : null}

        {ride.status === 'DRIVER_ARRIVED' ? (
          <form className="flex flex-col gap-3 rounded-[12px] bg-canvas-alt p-4" onSubmit={submitPin} noValidate>
            <p className="text-[13px] font-bold text-heading">Verify pickup PIN</p>
            <div className="gt-field">
              <label className="gt-label" htmlFor="pickup-pin">
                Pickup PIN
              </label>
              <input
                id="pickup-pin"
                className="gt-input tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                placeholder="••••"
                value={pin}
                disabled={pinPending}
                onChange={(event) => setPin(event.target.value)}
                aria-invalid={pinError ? 'true' : undefined}
              />
              {pinError ? <p className="gt-error-text">{pinError}</p> : <p className="gt-hint">4 digits, shown in the student’s app.</p>}
            </div>
            <Button type="submit" loading={pinPending} block icon="key">
              Verify PIN
            </Button>
          </form>
        ) : null}

        {ride.status === 'REQUESTED' ? (
          <Button block size="lg" icon="check" loading={acting === 'accept'} onClick={() => void runAction('accept')}>
            Accept ride
          </Button>
        ) : null}

        {ride.status === 'DRIVER_ASSIGNED' ? (
          <Button block size="lg" icon="map-pin" loading={acting === 'arrive'} onClick={() => void runAction('arrive')}>
            Arrive at pickup
          </Button>
        ) : null}

        {ride.status === 'PIN_VERIFIED' ? (
          <Button block size="lg" icon="navigation" loading={acting === 'start'} onClick={() => void runAction('start')}>
            Start trip
          </Button>
        ) : null}

        {ride.status === 'IN_PROGRESS' ? (
          <Button block size="lg" icon="check-circle" loading={acting === 'complete'} onClick={() => void runAction('complete')}>
            Complete Trip
          </Button>
        ) : null}

        {ride.status === 'COMPLETED' ? (
          <div className="gt-notice gt-notice-success">
            <Icon name="check-circle" size={18} className="mt-0.5 shrink-0 text-success" />
            <p>
              <span className="font-bold text-heading">Trip completed at {formatDateTime(ride.completedAt)}</span>
              <br />
              {formatCurrency(ride.fare)} · {formatDistance(ride.distanceKm)} · {ride.student.name} arrived at{' '}
              {ride.destination.label}.
            </p>
          </div>
        ) : null}

        {ride.status === 'CANCELLED' ? (
          <div className="gt-notice gt-notice-neutral">
            <Icon name="x" size={18} className="mt-0.5 shrink-0 text-muted" />
            <p>
              <span className="font-bold text-heading">This ride was cancelled</span>
              <br />
              {ride.cancelReason ?? 'No reason was recorded.'}
              {ride.cancelRequestedBy ? ` · by ${ride.cancelRequestedBy.toLowerCase()}` : ''}
            </p>
          </div>
        ) : null}

        {ride.status === 'NO_SHOW' ? (
          <div className="gt-notice gt-notice-neutral">
            <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0 text-muted" />
            <p>
              <span className="font-bold text-heading">Marked as a no-show</span>
              <br />
              The student did not meet you at the pickup point.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {canCancel ? (
            <Button variant="secondary" icon="x" disabled={acting !== null} onClick={() => setCancelOpen(true)}>
              Cancel ride
            </Button>
          ) : null}
          {isActive ? (
            <Button variant="danger" icon="siren" onClick={() => setSosOpen(true)}>
              Emergency
            </Button>
          ) : null}
          {ride.status === 'COMPLETED' ? (
            <LinkButton to="/driver/trips" variant="secondary" icon="history">
              Trip history
            </LinkButton>
          ) : null}
          {ride.status === 'CANCELLED' || ride.status === 'NO_SHOW' ? (
            <LinkButton to="/driver" icon="layout-dashboard">
              Back to dashboard
            </LinkButton>
          ) : null}
        </div>
      </section>

      {/* Trip log ---------------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-[16px] font-bold text-heading">
          <span className="text-primary">
            <Icon name="list" size={18} />
          </span>
          Trip log
        </h2>
        {ride.timeline.length === 0 ? (
          <p className="gt-hint">No events recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {[...ride.timeline].reverse().map((event) => (
              <li key={event.id} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-heading">{event.message}</p>
                  <p className="text-[12px] text-muted">{formatDateTime(event.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this ride?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={cancelPending} onClick={() => setCancelOpen(false)}>
              Keep ride
            </Button>
            <Button variant="danger" loading={cancelPending} onClick={() => void submitCancel()}>
              Cancel ride
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">
            {ride.student.name} and their guardian are notified right away, so give them a clear reason.
          </p>
          <div className="gt-field">
            <label className="gt-label" htmlFor="cancel-reason">
              Reason
            </label>
            <textarea
              id="cancel-reason"
              className="gt-input min-h-[90px] resize-y"
              maxLength={200}
              placeholder="e.g. vehicle broke down at the pickup point"
              value={cancelReason}
              disabled={cancelPending}
              onChange={(event) => setCancelReason(event.target.value)}
            />
            {cancelError ? (
              <p className="gt-error-text">{cancelError}</p>
            ) : (
              <p className="gt-hint">At least 3 characters.</p>
            )}
          </div>
        </div>
      </Modal>

      <SosModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        rideId={ride.id}
        context={`on ride ${ride.code}`}
      />
    </div>
  );
}

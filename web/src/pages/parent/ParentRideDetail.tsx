import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useInterval, useMutation } from '../../lib/hooks';
import {
  formatCurrency,
  formatDate,
  formatDistance,
  formatMinutes,
  formatTime,
  rideStatusLabel,
} from '../../lib/format';
import { getConnectionState, getSocket, onConnectionChange, watchRide, type ConnectionState } from '../../lib/socket';
import type { RideEvent, SafetyCategory, SerializedRide } from '../../lib/types';
import { useToast } from '../../state/ToastContext';
import { Icon } from '../../components/Icon';
import {
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Modal,
  Notice,
  PageLoader,
  SelectField,
  Skeleton,
  TextField,
  TextareaField,
} from '../../components/ui';
import { RideStatusBadge, RideTimeline } from '../../components/RideBits';
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

interface ReportDraft {
  category: string;
  subject: string;
  description: string;
  severity: string;
}

const CANCELLABLE = ['REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'];
const SEVERITIES: { value: string; label: string }[] = [
  { value: 'LOW', label: 'Low — worth noting' },
  { value: 'MEDIUM', label: 'Medium — needs attention' },
  { value: 'HIGH', label: 'High — urgent' },
];

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

function eventIcon(type: string): string {
  if (type.includes('CANCEL')) return 'x';
  if (type.includes('COMPLETE')) return 'home';
  if (type.includes('PIN') || type.includes('VERIFY')) return 'key';
  if (type.includes('ARRIVE')) return 'car-front';
  if (type.includes('ACCEPT') || type.includes('ASSIGN')) return 'badge-check';
  if (type.includes('START')) return 'navigation';
  if (type.includes('RATE')) return 'star';
  if (type.includes('LOCATION') || type.includes('TRACK')) return 'map-pin';
  return 'clock';
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

function EventRow({ event }: { event: RideEvent }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-canvas-alt text-muted">
        <Icon name={eventIcon(event.type)} size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] leading-[1.5] text-heading">{event.message}</p>
        <p className="mt-0.5 text-[11px] text-muted">{formatTime(event.createdAt)}</p>
      </div>
    </li>
  );
}

export default function ParentRideDetail() {
  const params = useParams<{ id?: string }>();
  const rideId = params.id ?? '';
  useDocumentTitle('Trip details · Guardian Transit');
  const { push } = useToast();

  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 5000);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rateOpen, setRateOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingNote, setRatingNote] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<ReportDraft>({
    category: '',
    subject: '',
    description: '',
    severity: 'MEDIUM',
  });
  const [sosOpen, setSosOpen] = useState(false);

  /**
   * The detail route only allows the ride's own parent account, so guardian-linked
   * parents get a 404 here — fall back to the ride list they are allowed to read.
   */
  const rideQuery = useAsync<{ ride: SerializedRide; viaList: boolean }>(
    async (signal) => {
      try {
        const data = await api.get<{ ride: SerializedRide }>(`/rides/${rideId}`, { signal });
        return { ride: data.ride, viaList: false };
      } catch (cause) {
        if (signal.aborted) throw cause;
        const list = await api.get<{ rides: SerializedRide[] }>('/rides', { signal, query: { limit: 100 } });
        const found = list.rides.find((item) => item.id === rideId);
        if (!found) throw cause;
        return { ride: found, viaList: true };
      }
    },
    [rideId],
    { enabled: Boolean(rideId) },
  );

  const baseRide = rideQuery.data?.ride ?? null;
  const baseRideId = baseRide?.id ?? null;

  const [socketRide, setSocketRide] = useState<SerializedRide | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const ride = socketRide && baseRideId && socketRide.id === baseRideId ? socketRide : baseRide;

  // A freshly loaded trip replaces whatever live frames we were following.
  useEffect(() => {
    setSocketRide(null);
    setFix(null);
  }, [baseRideId]);

  const trackQuery = useAsync<TrackPayload>(
    (signal) => api.get(`/rides/${baseRideId}/track`, { signal }),
    [baseRideId],
    { enabled: Boolean(baseRideId) },
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

  const events = useMemo(() => (ride ? [...ride.timeline].reverse() : []), [ride]);

  const cancelMutation = useMutation(async (reason: string) =>
    api.post<{ ride: SerializedRide }>(`/rides/${rideId}/cancel`, { reason }),
  );

  const rateMutation = useMutation(async (value: number, note: string) =>
    api.post<{ ride: SerializedRide }>(`/rides/${rideId}/rate`, {
      rating: value,
      ...(note ? { note } : {}),
    }),
  );

  const reportMutation = useMutation(async (input: ReportDraft) =>
    api.post('/safety', { ...input, rideId }),
  );

  const categoriesQuery = useAsync<{ categories: SafetyCategory[] }>(
    (signal) => api.get('/safety/categories', { signal }),
    [],
    { enabled: reportOpen },
  );

  function reloadTrip() {
    rideQuery.reload();
    trackQuery.reload();
  }

  async function submitCancel() {
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      cancelMutation.setError('Tell us why this trip is being cancelled (at least 3 characters).');
      return;
    }
    const result = await cancelMutation.run(reason);
    if (!result) return;
    setCancelOpen(false);
    setCancelReason('');
    push(`Trip ${result.ride.code} cancelled.`, 'success');
    reloadTrip();
  }

  async function submitRating() {
    if (rating < 1 || rating > 5) {
      rateMutation.setError('Pick a star rating before saving.');
      return;
    }
    const result = await rateMutation.run(rating, ratingNote.trim());
    if (!result) return;
    setRateOpen(false);
    setRating(0);
    setRatingNote('');
    push('Thanks — your rating was saved.', 'success');
    rideQuery.reload();
  }

  async function submitReport() {
    const subject = report.subject.trim();
    const description = report.description.trim();
    if (!report.category) {
      reportMutation.setError('Choose what this report is about.');
      return;
    }
    if (subject.length < 4) {
      reportMutation.setError('Add a short title (at least 4 characters).');
      return;
    }
    if (description.length < 10) {
      reportMutation.setError('Describe what happened (at least 10 characters).');
      return;
    }
    const result = await reportMutation.run({ ...report, subject, description });
    if (!result) return;
    setReportOpen(false);
    setReport({ category: '', subject: '', description: '', severity: 'MEDIUM' });
    push('Safety report sent. The safety desk will review it.', 'success');
  }

  if (!rideId) {
    return (
      <ErrorState
        title="That trip link is incomplete"
        message="No trip id was provided in the address. Open the trip from your dashboard or trip history."
        onRetry={() => window.history.back()}
      />
    );
  }

  if (rideQuery.loading && !rideQuery.data) return <PageLoader label="Loading trip details…" />;

  if (rideQuery.error && !rideQuery.data) {
    return (
      <div className="flex flex-col gap-6">
        <ErrorState title="We could not load this trip" message={rideQuery.error} onRetry={rideQuery.reload} />
        <div className="flex flex-wrap justify-center gap-3">
          <LinkButton to="/parent/history" variant="secondary" icon="history">
            Trip history
          </LinkButton>
          <LinkButton to="/parent" icon="layout-dashboard">
            Dashboard
          </LinkButton>
        </div>
      </div>
    );
  }

  if (!ride) {
    return (
      <EmptyState
        icon="route"
        title="Trip not found"
        description="This trip may have been removed, or it is not linked to your account."
        action={
          <LinkButton to="/parent/history" icon="history">
            Back to trip history
          </LinkButton>
        }
      />
    );
  }

  const driverFix: Fix | null =
    fix ??
    (trackQuery.data?.driver
      ? { lat: trackQuery.data.driver.lat, lng: trackQuery.data.driver.lng, at: trackQuery.data.driver.lastSeen }
      : null);
  const freshness = driverFix ? freshnessLabel(driverFix.at, now) : null;
  const active = CANCELLABLE.includes(ride.status) || ride.status === 'PIN_VERIFIED' || ride.status === 'IN_PROGRESS';
  const onboard = ride.status === 'PIN_VERIFIED' || ride.status === 'IN_PROGRESS';
  const liveNow = Boolean(freshness?.fresh && connection === 'online' && active);
  const studentFix = onboard && liveNow && driverFix ? driverFix : null;
  const canCancel = CANCELLABLE.includes(ride.status);
  const canRate = ride.status === 'COMPLETED' && ride.rating === null;
  const studentFirstName = ride.student.name.split(' ')[0];

  return (
    <div className="flex flex-col gap-6">
      {/* --- Heading ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <LinkButton to="/parent/history" variant="ghost" size="sm" trailingIcon="arrow-left">
            Trip history
          </LinkButton>
          <RideStatusBadge status={ride.status} />
          {liveNow ? <span className="gt-badge gt-badge-success">Live location active</span> : null}
        </div>
        <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">Trip {ride.code}</h1>
        <p className="text-[14px] text-muted">
          {ride.student.name} · {ride.pickup.label} → {ride.destination.label} ·{' '}
          {formatDate(ride.completedAt ?? ride.requestedAt)}
        </p>
      </div>

      {ride.status === 'CANCELLED' && ride.cancelReason ? (
        <Notice tone="danger" icon="alert-triangle" title="This trip was cancelled">
          {ride.cancelReason}
          {ride.cancelRequestedBy ? ` · Requested by ${ride.cancelRequestedBy.toLowerCase()}` : ''}
        </Notice>
      ) : null}

      {rideQuery.data?.viaList ? (
        <Notice tone="neutral" icon="info" title="Loaded from your trip list">
          The full trip record is not readable from this account, so this page shows the summary your account
          is allowed to see.{' '}
          <button type="button" onClick={rideQuery.reload} className="font-semibold text-primary hover:underline">
            Try the full record again
          </button>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row">
        {/* --- Trip workspace ------------------------------------------- */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {trackQuery.error ? (
            <Notice tone="neutral" icon="map" title="Trip route could not be loaded">
              {trackQuery.error}{' '}
              <button type="button" onClick={trackQuery.reload} className="font-semibold text-primary hover:underline">
                Try again
              </button>
            </Notice>
          ) : null}

          {trackQuery.loading && !trackQuery.data ? (
            <Skeleton height={360} className="rounded-[20px]" />
          ) : (
            <MapCanvas
              height={360}
              pickup={{ lat: ride.pickup.lat, lng: ride.pickup.lng, label: ride.pickup.label }}
              destination={{ lat: ride.destination.lat, lng: ride.destination.lng, label: ride.destination.label }}
              driver={
                active && driverFix
                  ? { lat: driverFix.lat, lng: driverFix.lng, label: ride.vehicle.nickname || 'Driver' }
                  : null
              }
              student={studentFix ? { lat: studentFix.lat, lng: studentFix.lng, label: studentFirstName } : null}
              trace={(trackQuery.data?.route ?? []).map((point) => ({ lat: point.lat, lng: point.lng }))}
              freshness={active ? (freshness?.text ?? null) : null}
              live={liveNow}
              hint={`Trip ${ride.code} route`}
            />
          )}
          <MapLegend active={liveNow} />

          {active && freshness && !freshness.fresh ? (
            <Notice tone="neutral" icon="clock" title="Location data is delayed">
              {freshness.text}. The marker shows the last position the driver’s device reported.
            </Notice>
          ) : null}

          <section className="gt-card flex flex-col gap-4" aria-label="Trip timeline">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[15px] font-bold text-heading">{rideStatusLabel(ride.status)}</p>
              <p className="text-[12px] text-muted">
                {ride.completedAt
                  ? `Arrived ${formatTime(ride.completedAt)}`
                  : ride.startedAt
                    ? `Picked up ${formatTime(ride.startedAt)}`
                    : `Requested ${formatTime(ride.requestedAt)}`}
              </p>
            </div>
            <RideTimeline ride={ride} />
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Trip actions">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Trip actions</h2>
            <div className="flex flex-wrap gap-3">
              {active ? (
                <LinkButton to="/parent/live" icon="radio">
                  Follow live
                </LinkButton>
              ) : null}
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
              <button
                type="button"
                className="gt-btn gt-btn-secondary"
                onClick={() => {
                  reportMutation.setError(null);
                  setReportOpen(true);
                }}
              >
                <Icon name="shield-alert" size={17} />
                Report a safety concern
              </button>
              {canCancel ? (
                <button
                  type="button"
                  className="gt-btn gt-btn-danger"
                  onClick={() => {
                    cancelMutation.setError(null);
                    setCancelOpen(true);
                  }}
                >
                  <Icon name="x" size={17} />
                  Cancel trip
                </button>
              ) : null}
              {canRate ? (
                <button
                  type="button"
                  className="gt-btn gt-btn-primary"
                  onClick={() => {
                    rateMutation.setError(null);
                    setRateOpen(true);
                  }}
                >
                  <Icon name="star" size={17} />
                  Rate this trip
                </button>
              ) : null}
            </div>
            {!canCancel && !canRate && !active ? (
              <p className="text-[12px] text-muted">
                Cancellation is available until the driver starts the trip, and rating opens once the trip is
                completed.
              </p>
            ) : null}
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Trip events">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Trip events</h2>
            {events.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">
                No recorded events yet. They appear as the driver accepts, arrives and completes the trip.
              </p>
            )}
          </section>
        </div>

        {/* --- Trip information ----------------------------------------- */}
        <div className="flex w-full flex-col gap-5 xl:w-[320px] xl:shrink-0">
          <section className="gt-card flex flex-col gap-4" aria-label="Child details">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Child</h2>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[15px] font-bold text-primary">
                {ride.student.name
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-bold leading-[1.5] text-heading">{ride.student.name}</p>
                <p className="truncate text-[12px] text-muted">
                  {ride.student.school} · {ride.student.grade}
                </p>
              </div>
            </div>
            <Detail label="Student ID" value={ride.student.studentCode} />
            <Detail label="Phone" value={ride.student.phone || '—'} />
            <Detail
              label="On board"
              value={onboard ? 'Yes — PIN verified' : ride.status === 'COMPLETED' ? 'Trip finished' : 'Not yet'}
            />
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Driver and vehicle">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Driver & vehicle</h2>
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
                    : `Driver status: ${ride.driver.overallStatus ?? 'unknown'}`}
                </p>
              </div>
            </div>
            <Detail
              label="Vehicle"
              value={`${ride.vehicle.color} ${ride.vehicle.nickname} · ${ride.vehicle.plateNumber}`}
            />
            <Detail label="Vehicle status" value={ride.vehicle.status} />
            {typeof ride.driver.rating === 'number' ? (
              <Detail
                label="Driver rating"
                value={`${ride.driver.rating.toFixed(1)} ★${
                  ride.driver.totalTrips ? ` · ${ride.driver.totalTrips} trips` : ''
                }`}
              />
            ) : null}
          </section>

          <section className="gt-card flex flex-col gap-4" aria-label="Fare and route">
            <h2 className="text-[18px] font-bold leading-[1.5] text-heading">Fare & route</h2>
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="text-[26px] font-bold leading-[1.2] text-heading">{formatCurrency(ride.fare)}</p>
              {ride.freeRideApplied ? <span className="gt-badge gt-badge-success">Free ride applied</span> : null}
            </div>
            <Detail label="Distance" value={formatDistance(ride.distanceKm)} />
            <Detail label="Estimated duration" value={formatMinutes(ride.durationMin)} />
            <Detail label="Pickup" value={ride.pickup.label} />
            <Detail label="Destination" value={ride.destination.label} />
            <Detail
              label="Requested"
              value={`${formatDate(ride.requestedAt)} · ${formatTime(ride.requestedAt)}`}
            />
            {ride.completedAt ? (
              <Detail
                label="Completed"
                value={`${formatDate(ride.completedAt)} · ${formatTime(ride.completedAt)}`}
              />
            ) : null}
            {typeof ride.rating === 'number' ? (
              <div className="flex flex-col gap-1">
                <p className="text-[13px] text-muted">Your rating</p>
                <p className="text-[16px] font-bold text-heading" aria-label={`${ride.rating} out of 5 stars`}>
                  <span className="text-primary">{'★'.repeat(ride.rating)}</span>
                  <span className="text-border">{'★'.repeat(5 - ride.rating)}</span>
                </p>
                {ride.reviewNote ? <p className="text-[12px] text-muted">{ride.reviewNote}</p> : null}
              </div>
            ) : null}
          </section>

          <div
            className="flex flex-col gap-2 rounded-[12px] p-4"
            style={{ background: liveNow ? 'var(--color-success-soft)' : 'var(--color-primary-soft)' }}
          >
            <div className="flex items-center gap-3">
              <Icon
                name={liveNow ? 'shield-check' : 'shield-alert'}
                size={20}
                className={liveNow ? 'text-success' : 'text-primary'}
              />
              <p className="text-[13px] font-bold text-heading">
                Location sharing: {liveNow ? 'Active' : 'Off'}
              </p>
            </div>
            <p className="text-[12px] leading-[1.55] text-muted">
              {active
                ? 'Shared with you during this trip only. Sharing stops on arrival.'
                : 'This trip is not sharing a location. Sharing only happens while a ride is active.'}
            </p>
          </div>
        </div>
      </div>

      {/* --- Dialogs ----------------------------------------------------- */}
      <SosModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        rideId={ride.id}
        context={`about trip ${ride.code}`}
      />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel trip ${ride.code}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelMutation.pending}>
              Keep trip
            </Button>
            <Button variant="danger" loading={cancelMutation.pending} onClick={() => void submitCancel()}>
              Cancel trip
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Notice tone="neutral" icon="info" title="Cancellation is recorded">
            {studentFirstName} and the assigned driver are notified immediately, and your reason is stored with
            the trip record.
          </Notice>
          <TextareaField
            label="Reason"
            name="cancelReason"
            value={cancelReason}
            maxLength={200}
            placeholder="Tell us why this trip is being cancelled"
            error={cancelMutation.error}
            onChange={(event) => setCancelReason(event.target.value)}
          />
          <p className="gt-hint">{cancelReason.trim().length}/200 characters</p>
        </div>
      </Modal>

      <Modal
        open={rateOpen}
        onClose={() => setRateOpen(false)}
        title="Rate this trip"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRateOpen(false)} disabled={rateMutation.pending}>
              Later
            </Button>
            <Button loading={rateMutation.pending} onClick={() => void submitRating()}>
              Save rating
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">
            How was {ride.driver.name} on trip {ride.code}?
          </p>
          <div className="flex gap-2" role="group" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                aria-pressed={rating === value}
                onClick={() => {
                  setRating(value);
                  rateMutation.setError(null);
                }}
                className={`flex h-11 w-11 items-center justify-center rounded-[12px] border transition ${
                  value <= rating
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-white text-muted hover:text-heading'
                }`}
              >
                <Icon name="star" size={20} />
              </button>
            ))}
          </div>
          <TextareaField
            label="Note (optional)"
            name="ratingNote"
            value={ratingNote}
            maxLength={300}
            placeholder="What went well, or what should improve?"
            error={rateMutation.error}
            onChange={(event) => setRatingNote(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report a safety concern"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)} disabled={reportMutation.pending}>
              Cancel
            </Button>
            <Button loading={reportMutation.pending} icon="shield-alert" onClick={() => void submitReport()}>
              Send report
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Notice tone="primary" icon="shield-check" title={`Linked to trip ${ride.code}`}>
            The safety desk receives this report with the trip record and follows up directly.
          </Notice>

          {reportMutation.error ? <p className="gt-error-text">{reportMutation.error}</p> : null}

          {categoriesQuery.loading && !categoriesQuery.data ? (
            <div className="flex flex-col gap-3">
              <Skeleton height={44} />
              <Skeleton height={44} />
            </div>
          ) : categoriesQuery.error ? (
            <ErrorState
              title="We could not load the report categories"
              message={categoriesQuery.error}
              onRetry={categoriesQuery.reload}
            />
          ) : (
            <>
              <SelectField
                label="What is this about?"
                name="reportCategory"
                value={report.category}
                onChange={(event) => {
                  setReport((current) => ({ ...current, category: event.target.value }));
                  reportMutation.setError(null);
                }}
              >
                <option value="">Choose a category…</option>
                {(categoriesQuery.data?.categories ?? []).map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label} — {category.hint}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Severity"
                name="reportSeverity"
                value={report.severity}
                onChange={(event) => setReport((current) => ({ ...current, severity: event.target.value }))}
              >
                {SEVERITIES.map((severity) => (
                  <option key={severity.value} value={severity.value}>
                    {severity.label}
                  </option>
                ))}
              </SelectField>

              <TextField
                label="Short title"
                name="reportSubject"
                value={report.subject}
                maxLength={120}
                placeholder="e.g. Hard braking on the way home"
                onChange={(event) => setReport((current) => ({ ...current, subject: event.target.value }))}
              />

              <TextareaField
                label="What happened?"
                name="reportDescription"
                value={report.description}
                maxLength={1500}
                placeholder="Describe what you saw, when it happened and who was involved."
                onChange={(event) => setReport((current) => ({ ...current, description: event.target.value }))}
              />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

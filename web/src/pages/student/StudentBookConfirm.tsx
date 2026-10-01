import { useEffect, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { MapCanvas } from '../../components/MapCanvas';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, Notice, Skeleton, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { formatCurrency, formatDistance, formatMinutes } from '../../lib/format';
import type { Quote, RewardsPayload, SerializedRide } from '../../lib/types';
import { useCurrentUser } from '../../state/AuthContext';
import { useBooking } from '../../state/BookingContext';
import { useToast } from '../../state/ToastContext';

function placeBody(place: { label: string; address: string; lat: number; lng: number }) {
  return { label: place.label, address: place.address, lat: place.lat, lng: place.lng };
}

/** Step 4 of booking: review the trip and send the real booking request. */
export default function StudentBookConfirm() {
  useDocumentTitle('Book · Confirm ride · Guardian Transit');

  const booking = useBooking();
  const user = useCurrentUser();
  const { push } = useToast();
  const navigate = useNavigate();
  // Stays true once the booking request succeeded so the step guards below do
  // not bounce us back to step 1 while the booking state is being cleared.
  const bookedRef = useRef(false);

  const studentId = booking.studentId ?? user?.studentProfile?.id ?? null;
  const { pickup, destination, driver, quote, useFreeRide } = booking;

  // The fare is required before we can honestly confirm the price.
  const quoteReady = Boolean(quote);
  const pickupKey = pickup ? `${pickup.lat},${pickup.lng},${pickup.address}` : '';
  const destinationKey = destination ? `${destination.lat},${destination.lng},${destination.address}` : '';
  const quoteState = useAsync<Quote>(
    async (signal) => {
      if (!pickup || !destination) throw new Error('Choose a route first.');
      return api.post<Quote>('/rides/quote', { pickup: placeBody(pickup), destination: placeBody(destination) }, { signal });
    },
    [pickupKey, destinationKey],
    { enabled: Boolean(pickup && destination && !quoteReady) },
  );
  const { setQuote } = booking;
  const fetchedQuote = quoteState.data;
  useEffect(() => {
    if (fetchedQuote) setQuote(fetchedQuote);
  }, [fetchedQuote, setQuote]);

  const rewards = useAsync<RewardsPayload>((signal) => api.get<RewardsPayload>('/rewards', { signal }), []);
  const freeRidesAvailable = rewards.data?.freeRidesAvailable ?? 0;
  const hasFreeRide = freeRidesAvailable > 0;
  const { setUseFreeRide } = booking;
  useEffect(() => {
    if (rewards.data && !hasFreeRide && useFreeRide) setUseFreeRide(false);
  }, [rewards.data, hasFreeRide, useFreeRide, setUseFreeRide]);

  const book = useMutation(() =>
    api.post<{ ride: SerializedRide; pickupPin: string }>('/rides', {
      studentId,
      driverId: driver?.id,
      pickup: pickup ? placeBody(pickup) : undefined,
      destination: destination ? placeBody(destination) : undefined,
      useFreeRide,
    }),
  );

  async function onConfirm() {
    const result = await book.run();
    if (!result) return;
    const pin = result.pickupPin ?? null;
    bookedRef.current = true;
    booking.reset();
    booking.setPickupPin(pin);
    push(`Ride ${result.ride.code} booked — your driver has been notified.`, 'success');
    navigate(`/student/ride/${result.ride.id}`, { replace: true });
  }

  // Ordered guards: each step requires the previous one to be complete.
  if (!bookedRef.current) {
    if (!pickup) return <Navigate to="/student/book/pickup" replace />;
    if (!destination) return <Navigate to="/student/book/destination" replace />;
    if (!driver) return <Navigate to="/student/book/drivers" replace />;
  }

  const activeQuote = quote ?? quoteState.data;
  const canBook = Boolean(studentId && activeQuote);

  return (
    <>
      <StudentHeader
        title="Confirm your ride"
        subtitle="Review the details before we send your request."
        backTo="/student/book/drivers"
        right={
          <Link
            to="/student/notifications"
            aria-label="Notifications"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
          >
            <Icon name="bell" size={18} />
          </Link>
        }
      />

      <div className="flex flex-col gap-5 px-5 pb-6 pt-4">
        <Badge tone="primary">STEP 4 OF 4 · CONFIRM</Badge>

        <MapCanvas
          pickup={{ lat: pickup.lat, lng: pickup.lng, label: pickup.label }}
          destination={{ lat: destination.lat, lng: destination.lng, label: destination.label }}
          height={190}
          interactive={false}
          hint="Your route"
        />

        <section className="gt-card flex flex-col gap-4">
          <h2 className="text-[14px] font-bold text-heading">Trip summary</h2>

          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-canvas-alt text-muted">
                <Icon name="map-pin" size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Pickup</span>
                <span className="block text-[13px] font-semibold text-heading">{pickup.label}</span>
                <span className="block text-[12px] text-muted">{pickup.address}</span>
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                <Icon name="navigation" size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Destination</span>
                <span className="block text-[13px] font-semibold text-heading">{destination.label}</span>
                <span className="block text-[12px] text-muted">{destination.address}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-[12px] border border-border bg-canvas-alt p-3">
            <Avatar name={driver.name} src={driver.avatarUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-heading">{driver.name}</p>
              <p className="truncate text-[12px] text-muted">
                {driver.vehicle
                  ? `${driver.vehicle.nickname || driver.vehicle.make} · ${driver.vehicle.color} · Plate ${driver.vehicle.plateNumber}`
                  : 'Vehicle details pending verification'}
              </p>
            </div>
            <Badge tone="success" icon="badge-check">
              Verified
            </Badge>
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
            <div>
              <p className="text-[12px] text-muted">
                {activeQuote ? (
                  <>
                    {formatDistance(activeQuote.distanceKm)} · {formatMinutes(activeQuote.durationMin)}
                  </>
                ) : (
                  'Fetching fare…'
                )}
              </p>
              <p className="text-[22px] font-bold leading-[1.45] text-heading">
                {activeQuote ? formatCurrency(activeQuote.fare, activeQuote.currency) : '—'}
              </p>
            </div>
            {useFreeRide && hasFreeRide ? (
              <Badge tone="success" icon="gift">
                Free ride applied
              </Badge>
            ) : null}
          </div>

          {quoteState.loading ? <Skeleton height={14} /> : null}
          {quoteState.error ? (
            <div className="flex flex-col items-start gap-2">
              <p className="gt-error-text">{quoteState.error}</p>
              <Button variant="secondary" size="sm" icon="refresh-cw" onClick={quoteState.reload}>
                Try again
              </Button>
            </div>
          ) : null}
        </section>

        <section className="gt-card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-heading">Use a free ride</p>
              <p className="text-[12px] text-muted">
                {rewards.loading
                  ? 'Checking your rewards…'
                  : rewards.error
                    ? 'Rewards could not be loaded right now.'
                    : hasFreeRide
                      ? `${freeRidesAvailable} free ride${freeRidesAvailable === 1 ? '' : 's'} available`
                      : `Unlocks at ${rewards.data?.goal ?? 50} Guardian Points`}
              </p>
            </div>
            <Toggle
              checked={useFreeRide && hasFreeRide}
              onChange={setUseFreeRide}
              label="Use a free ride for this trip"
              disabled={!hasFreeRide || book.pending}
            />
          </div>
          {rewards.error ? (
            <Button variant="secondary" size="sm" icon="refresh-cw" onClick={rewards.reload}>
              Retry rewards
            </Button>
          ) : null}
        </section>

        <Notice tone="neutral" icon="key" title="Your pickup PIN">
          When your driver arrives, your ride screen shows a PIN. Read it to your driver so they can verify pickup —
          never share it with anyone else.
        </Notice>

        {!studentId ? (
          <Notice tone="danger" icon="alert-triangle" title="No student profile">
            This account is not linked to a student profile, so the ride cannot be booked from here.
          </Notice>
        ) : null}

        {book.error ? <p className="gt-error-text">{book.error}</p> : null}

        <Button
          block
          size="lg"
          icon="shield-check"
          loading={book.pending}
          disabled={!canBook}
          onClick={() => void onConfirm()}
        >
          Confirm Ride
        </Button>

        <p className="text-center text-[11px] text-muted">
          Your guardian is notified as soon as the ride starts.
        </p>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, EmptyState, ErrorState, Notice, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { formatCurrency, formatDistance, formatMinutes } from '../../lib/format';
import type { AvailableDriver, Quote, SavedLocation } from '../../lib/types';
import { useBooking } from '../../state/BookingContext';

function placeBody(place: SavedLocation): { label: string; address: string; lat: number; lng: number } {
  return { label: place.label, address: place.address, lat: place.lat, lng: place.lng };
}

function DriverOption({
  driver,
  fare,
  selected,
  onSelect,
}: {
  driver: AvailableDriver;
  fare: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const vehicle = driver.vehicle;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-[20px] border bg-white p-[18px] text-left transition ${
        selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/40'
      }`}
    >
      <span className="flex items-center gap-3">
        <Avatar name={driver.name} src={driver.avatarUrl} size={50} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-bold leading-[1.45] text-heading">{driver.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="success" icon="badge-check">
              Verified
            </Badge>
            <span className="text-[12px] text-muted">
              ★ {driver.rating.toFixed(1)} · {driver.completedTrips} trips
            </span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? 'border-primary bg-primary text-white' : 'border-border text-transparent'
          }`}
        >
          <Icon name="check" size={12} />
        </span>
      </span>

      <span className="mt-3 flex flex-col gap-0.5">
        <span className="block truncate text-[13px] text-heading">
          {vehicle ? vehicle.nickname || `${vehicle.make} ${vehicle.model}`.trim() : 'Vehicle being verified'}
        </span>
        <span className="block truncate text-[12px] text-muted">
          {vehicle ? `${vehicle.color} · Plate ${vehicle.plateNumber}` : 'Plate details will appear once verified'}
        </span>
      </span>

      <span className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          {driver.locationKnown && driver.etaMinutes !== null ? (
            <>
              Estimated arrival · {formatMinutes(driver.etaMinutes)}
              {driver.distanceKm !== null ? ` · ${formatDistance(driver.distanceKm)}` : ''}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="info" size={14} />
              Live position unknown
            </span>
          )}
        </span>
        {fare !== null ? <span className="text-[22px] font-bold leading-[1.45] text-heading">{formatCurrency(fare)}</span> : null}
      </span>
    </button>
  );
}

/** Step 3 of booking: pick one of the verified drivers near the pickup point. */
export default function StudentBookDrivers() {
  useDocumentTitle('Book · Choose a driver · Guardian Transit');

  const booking = useBooking();
  const navigate = useNavigate();

  const { pickup, destination, driver: chosen, quote } = booking;
  const [selected, setSelected] = useState<AvailableDriver | null>(chosen);

  // If the quote did not survive (or was never fetched), get it here so the
  // confirm screen always shows a real server-side fare.
  const quoteMissing = Boolean(pickup && destination) && !quote;
  const pickupKey = pickup ? `${pickup.lat},${pickup.lng},${pickup.address}` : '';
  const destinationKey = destination ? `${destination.lat},${destination.lng},${destination.address}` : '';
  const quoteState = useAsync<Quote>(
    async (signal) => {
      if (!pickup || !destination) throw new Error('Choose a route first.');
      return api.post<Quote>('/rides/quote', { pickup: placeBody(pickup), destination: placeBody(destination) }, { signal });
    },
    [pickupKey, destinationKey],
    { enabled: quoteMissing },
  );
  const { setQuote } = booking;
  const fetchedQuote = quoteState.data;
  useEffect(() => {
    if (fetchedQuote) setQuote(fetchedQuote);
  }, [fetchedQuote, setQuote]);

  const drivers = useAsync<AvailableDriver[]>(
    async (signal) =>
      (await api.get<{ drivers: AvailableDriver[] }>('/rides/available-drivers', {
        query: { pickupLat: pickup?.lat, pickupLng: pickup?.lng },
        signal,
      })).drivers,
    [pickup?.lat, pickup?.lng],
    { enabled: Boolean(pickup) },
  );

  const activeQuote = quote ?? quoteState.data;
  const fare = activeQuote?.fare ?? null;

  function onContinue() {
    if (!selected) return;
    booking.setDriver(selected);
    navigate('/student/book/confirm');
  }

  // Guard: this step only makes sense once the route is chosen.
  if (!pickup) return <Navigate to="/student/book/pickup" replace />;
  if (!destination) return <Navigate to="/student/book/destination" replace />;

  const driverList = drivers.data ?? [];

  return (
    <>
      <StudentHeader
        title="Your safe ride awaits"
        subtitle="Choose a verified BaoBao driver."
        backTo="/student/book/destination"
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
        <Badge tone="primary">1 · ROUTE&nbsp;&nbsp;/&nbsp;&nbsp;2 · DRIVER</Badge>

        <p className="text-[12px] text-muted">
          {pickup.label} → {destination.label}
          {activeQuote ? ` · ${formatDistance(activeQuote.distanceKm)}` : ''}
        </p>

        <section className="flex flex-col gap-3" aria-live="polite">
          {drivers.loading ? (
            <>
              <Skeleton height={168} className="rounded-[20px]" />
              <Skeleton height={168} className="rounded-[20px]" />
            </>
          ) : drivers.error ? (
            <ErrorState title="We could not load drivers" message={drivers.error} onRetry={drivers.reload} />
          ) : driverList.length === 0 ? (
            <EmptyState
              icon="car"
              title="No verified drivers available right now"
              description="Drivers appear here when they are online, verified and near your pickup point. Check again in a moment."
              action={
                <Button variant="secondary" icon="refresh-cw" onClick={drivers.reload}>
                  Check again
                </Button>
              }
            />
          ) : (
            driverList.map((driver) => (
              <DriverOption
                key={driver.id}
                driver={driver}
                fare={fare}
                selected={selected?.id === driver.id}
                onSelect={() => setSelected(driver)}
              />
            ))
          )}
        </section>

        <Notice tone="primary" icon="shield-check" title="Check before you board">
          Match your driver, vehicle and plate number with your booking before you get in.
        </Notice>

        {selected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-heading">Selected · {selected.name}</p>
            {fare !== null ? <p className="text-[14px] font-bold text-heading">{formatCurrency(fare)}</p> : null}
          </div>
        ) : (
          <p className="text-[13px] text-muted">Choose a driver to continue.</p>
        )}

        <Button block icon="arrow-right" disabled={!selected} onClick={onContinue}>
          Continue to confirm
        </Button>
      </div>
    </>
  );
}

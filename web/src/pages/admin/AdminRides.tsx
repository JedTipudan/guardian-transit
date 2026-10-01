import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { MapCanvas } from '../../components/MapCanvas';
import { RideTimeline, RideStatusBadge } from '../../components/RideBits';
import { Badge, Button, EmptyState, ErrorState, Modal, PageLoader, SegmentedControl, Skeleton, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, verificationStatusLabel } from '../../lib/format';
import { useAsync, useDebounced, useDocumentTitle } from '../../lib/hooks';
import type { SafetyReport, SerializedRide } from '../../lib/types';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'DRIVER_ASSIGNED', label: 'Assigned' },
  { value: 'DRIVER_ARRIVED', label: 'Arrived' },
  { value: 'PIN_VERIFIED', label: 'PIN verified' },
  { value: 'IN_PROGRESS', label: 'On the way' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
];

interface RidesPayload {
  rides: SerializedRide[];
}

interface RideLocationPoint {
  id: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

interface RidePointEntry {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

interface RideDetailPayload {
  ride: SerializedRide;
  locations: RideLocationPoint[];
  emergencies: { id: string; type: string; status: string; message: string | null; createdAt: string }[];
  reports: SafetyReport[];
  points: RidePointEntry | null;
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-canvas-alt p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-[13px] font-semibold leading-[1.5] text-heading">{value}</p>
    </div>
  );
}

export default function AdminRides() {
  useDocumentTitle('All rides · Guardian Transit');

  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [params, setParams] = useSearchParams();

  const rides = useAsync<RidesPayload>(
    (signal) =>
      api.get('/admin/rides', {
        signal,
        query: { status, q: debouncedSearch.trim() || undefined },
      }),
    [status, debouncedSearch],
  );

  const rideId = params.get('ride');
  const detail = useAsync<RideDetailPayload>(
    (signal) => api.get(`/admin/rides/${rideId ?? ''}`, { signal }),
    [rideId],
    { enabled: Boolean(rideId) },
  );

  function closeDetail() {
    const next = new URLSearchParams(params);
    next.delete('ride');
    setParams(next, { replace: true });
  }

  function openDetail(id: string) {
    const next = new URLSearchParams(params);
    next.set('ride', id);
    setParams(next, { replace: true });
  }

  const list = useMemo(() => rides.data?.rides ?? [], [rides.data]);
  const hasFilters = status !== 'ALL' || debouncedSearch.trim() !== '';

  function resetFilters() {
    setStatus('ALL');
    setSearch('');
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="gt-eyebrow">Safety desk</p>
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading md:text-[30px]">Rides</h1>
          <p className="text-[13px] text-muted">
            Every trip on the platform with its fare, people and full timeline.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" loading={rides.loading} onClick={rides.reload}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <SegmentedControl value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            label="Search by ride code"
            name="ride-search"
            leadingIcon="search"
            placeholder="e.g. GT-1001"
            value={search}
            wrapClassName="sm:flex-1"
            onChange={(event) => setSearch(event.target.value)}
          />
          {hasFilters ? (
            <Button variant="ghost" icon="x" className="sm:mb-0.5" onClick={resetFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {rides.loading && !rides.data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={72} className="rounded-[20px]" />
          ))}
        </div>
      ) : rides.error ? (
        <ErrorState title="We could not load rides" message={rides.error} onRetry={rides.reload} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="car"
          title={hasFilters ? 'No rides match these filters' : 'No rides yet'}
          description={
            hasFilters
              ? 'Try a different status or clear the search to see more trips.'
              : 'Trips appear here as soon as a student requests one.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-semibold">Ride</th>
                  <th className="py-2 pr-3 font-semibold">Student</th>
                  <th className="py-2 pr-3 font-semibold">Driver</th>
                  <th className="py-2 pr-3 font-semibold">Route</th>
                  <th className="py-2 pr-3 text-right font-semibold">Fare</th>
                  <th className="py-2 pr-3 font-semibold">Requested</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((ride) => (
                  <tr key={ride.id} className="border-b border-border/70 last:border-0">
                    <td className="py-3 pr-3 text-[13px] font-bold text-heading">{ride.code}</td>
                    <td className="py-3 pr-3 text-[13px] text-heading">{ride.student.name}</td>
                    <td className="py-3 pr-3 text-[13px] text-heading">{ride.driver.name}</td>
                    <td className="max-w-[220px] truncate py-3 pr-3 text-[12px] text-muted">
                      {ride.pickup.label} → {ride.destination.label}
                    </td>
                    <td className="py-3 pr-3 text-right text-[13px] font-semibold text-heading">
                      {formatCurrency(ride.fare)}
                    </td>
                    <td className="py-3 pr-3 text-[12px] text-muted">{formatDateTime(ride.requestedAt)}</td>
                    <td className="py-3 pr-3">
                      <RideStatusBadge status={ride.status} />
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Open details for ride ${ride.code}`}
                        onClick={() => openDetail(ride.id)}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {list.map((ride) => (
              <button
                key={ride.id}
                type="button"
                onClick={() => openDetail(ride.id)}
                aria-label={`Open details for ride ${ride.code}`}
                className="gt-card w-full gap-3 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-heading">{ride.code}</p>
                    <p className="truncate text-[12px] text-muted">
                      {ride.pickup.label} → {ride.destination.label}
                    </p>
                  </div>
                  <RideStatusBadge status={ride.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                  <span>
                    {ride.student.name} · {ride.driver.name}
                  </span>
                  <span className="font-semibold text-heading">{formatCurrency(ride.fare)}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">{formatDateTime(ride.requestedAt)}</p>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-muted">
            Showing {list.length} of the {list.length === 60 ? 'most recent 60' : 'matching'} trips.
          </p>
        </>
      )}

      {/* --- Ride detail -------------------------------------------------- */}
      <Modal open={Boolean(rideId)} onClose={closeDetail} size="lg" title={detail.data ? `Ride ${detail.data.ride.code}` : 'Ride details'}>
        {detail.loading && !detail.data ? (
          <PageLoader label="Loading ride details…" />
        ) : detail.error ? (
          <ErrorState title="We could not load this ride" message={detail.error} onRetry={detail.reload} />
        ) : detail.data ? (
          <RideDetail payload={detail.data} />
        ) : null}
      </Modal>
    </div>
  );
}

function RideDetail({ payload }: { payload: RideDetailPayload }) {
  const { ride, locations, emergencies, reports, points } = payload;
  const trace = locations.map((point) => ({ lat: point.lat, lng: point.lng }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <RideStatusBadge status={ride.status} />
          <Badge tone="neutral">{formatDateTime(ride.requestedAt)}</Badge>
          {ride.freeRideApplied ? <Badge tone="primary">Free ride applied</Badge> : null}
          {ride.rating ? <Badge tone="warning">Rated {ride.rating}/5</Badge> : null}
        </div>
        <p className="text-[16px] font-bold text-heading">{formatCurrency(ride.fare)}</p>
      </div>

      <RideTimeline ride={ride} />

      <MapCanvas
        pickup={ride.pickup}
        destination={ride.destination}
        trace={trace}
        height={220}
        hint="Trip route preview"
        interactive={false}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem
          label="Student"
          value={
            <>
              {ride.student.name}
              <span className="block text-[12px] font-normal text-muted">
                {ride.student.studentCode} · {ride.student.school} · {ride.student.grade}
              </span>
            </>
          }
        />
        <DetailItem label="Parent" value={ride.parent ? `${ride.parent.name} · ${ride.parent.phone}` : 'Not linked'} />
        <DetailItem
          label="Driver"
          value={
            <>
              {ride.driver.name}
              <span className="block text-[12px] font-normal text-muted">
                {ride.driver.phone} · {verificationStatusLabel(ride.driver.overallStatus ?? 'PENDING')}
              </span>
            </>
          }
        />
        <DetailItem
          label="Vehicle"
          value={
            <>
              {ride.vehicle.nickname}
              <span className="block text-[12px] font-normal text-muted">
                {ride.vehicle.color} {ride.vehicle.make} {ride.vehicle.model} · {ride.vehicle.plateNumber}
              </span>
            </>
          }
        />
        <DetailItem label="Pickup" value={`${ride.pickup.label} · ${ride.pickup.address}`} />
        <DetailItem label="Destination" value={`${ride.destination.label} · ${ride.destination.address}`} />
        <DetailItem label="Distance · duration" value={`${ride.distanceKm} km · ${ride.durationMin} min`} />
        <DetailItem
          label="Pickup PIN"
          value={
            ride.pinVerified
              ? 'Verified'
              : `${ride.pinFailedAttempts} failed attempt${ride.pinFailedAttempts === 1 ? '' : 's'}${
                  ride.pinLockedUntil ? ` · locked until ${formatDateTime(ride.pinLockedUntil)}` : ''
                }`
          }
        />
        {ride.cancelReason ? (
          <DetailItem
            label="Cancellation"
            value={`${ride.cancelReason}${ride.cancelRequestedBy ? ` · by ${ride.cancelRequestedBy}` : ''}`}
          />
        ) : null}
        {points ? (
          <DetailItem
            label="Guardian points"
            value={`${points.delta > 0 ? '+' : ''}${points.delta} · balance ${points.balanceAfter}`}
          />
        ) : null}
      </div>

      {(emergencies.length > 0 || reports.length > 0) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">Safety signals on this trip</h3>
          <div className="flex flex-col gap-2">
            {emergencies.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-[12px] border border-border bg-danger-soft p-3">
                <span className="mt-0.5 shrink-0 text-danger">
                  <Icon name="siren" size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-heading">
                    Emergency · {event.type.replace(/_/g, ' ').toLowerCase()} · {event.status}
                  </p>
                  <p className="text-[11px] text-muted">{event.message ?? 'No message recorded'} · {formatDateTime(event.createdAt)}</p>
                </div>
              </div>
            ))}
            {reports.map((report) => (
              <div key={report.id} className="flex items-start gap-3 rounded-[12px] border border-border bg-warning-soft p-3">
                <span className="mt-0.5 shrink-0 text-warning">
                  <Icon name="shield-alert" size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-heading">
                    Report · {report.subject} · {report.status}
                  </p>
                  <p className="text-[11px] text-muted">{report.description.slice(0, 160)} · {formatDateTime(report.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">Trip timeline</h3>
        {ride.timeline.length === 0 ? (
          <p className="text-[12px] text-muted">No events have been recorded for this trip yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {ride.timeline.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 rounded-[12px] border border-border bg-canvas-alt p-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-heading">{event.message}</p>
                  <p className="text-[11px] text-muted">{event.type.replace(/_/g, ' ').toLowerCase()}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted">{formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

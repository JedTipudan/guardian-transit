import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Button, EmptyState, ErrorState, Modal, PageLoader, SegmentedControl, Skeleton } from '../../components/ui';
import { DetailRow, RideStatusBadge, RideTimeline } from '../../components/RideBits';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { formatCurrency, formatDateTime, formatDistance, formatMinutes, relativeTime } from '../../lib/format';
import type { SerializedRide } from '../../lib/types';

type StatusFilter = 'ALL' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
];

export default function DriverTrips() {
  useDocumentTitle('Trip History · Guardian Transit');

  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const trips = useAsync<{ trips: SerializedRide[] }>(
    (signal) => api.get<{ trips: SerializedRide[] }>('/driver/trips', { signal, query: { status: filter, limit: 30 } }),
    [filter],
  );

  const detail = useAsync<{ ride: SerializedRide | null }>(
    (signal) => api.get<{ ride: SerializedRide }>(`/rides/${selectedId}`, { signal }),
    [selectedId],
    { enabled: Boolean(selectedId) },
  );

  const list = trips.data?.trips ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[840px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Trip history</h1>
          <p className="text-[13px] text-muted">
            {trips.data ? `${list.length} trip${list.length === 1 ? '' : 's'} shown · newest first` : 'Your recent trips, newest first.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={trips.reload} disabled={trips.loading}>
            Refresh
          </Button>
        </div>
      </div>

      {trips.loading && !trips.data ? (
        <div className="flex flex-col gap-3">
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </div>
      ) : trips.error && !trips.data ? (
        <ErrorState title="We could not load your trips" message={trips.error} onRetry={trips.reload} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="history"
          title={filter === 'ALL' ? 'No trips yet' : 'No trips with that status'}
          description={
            filter === 'ALL'
              ? 'Completed and cancelled trips appear here as soon as you finish driving.'
              : 'Try another filter to see more of your trip history.'
          }
          action={
            filter === 'ALL' ? undefined : (
              <Button variant="secondary" onClick={() => setFilter('ALL')}>
                Show all trips
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((ride) => (
            <li key={ride.id}>
              <button
                type="button"
                onClick={() => setSelectedId(ride.id)}
                className="flex w-full flex-col gap-3 rounded-[20px] border border-border bg-white p-4 text-left shadow-card transition hover:border-primary/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-heading">
                      {ride.pickup.label} → {ride.destination.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {formatDateTime(ride.completedAt ?? ride.requestedAt)} · {ride.code}
                    </p>
                  </div>
                  <RideStatusBadge status={ride.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted">
                    <Icon name="user-round" size={15} />
                    <span className="truncate">{ride.student.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{ride.student.school}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted">{relativeTime(ride.completedAt ?? ride.requestedAt)}</span>
                    <span className="text-[14px] font-bold text-heading">{formatCurrency(ride.fare)}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Trip details">
        {!detail.data && detail.error ? (
          <ErrorState title="We could not load this trip" message={detail.error} onRetry={detail.reload} />
        ) : !detail.data ? (
          <PageLoader label="Loading trip…" />
        ) : detail.data.ride ? (
          (() => {
            const ride = detail.data.ride;
            return (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-heading">
                      {ride.pickup.label} → {ride.destination.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {ride.code} · requested {formatDateTime(ride.requestedAt)}
                    </p>
                  </div>
                  <RideStatusBadge status={ride.status} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailRow label="Student" value={`${ride.student.name} · ${ride.student.school}`} />
                  <DetailRow label="Vehicle" value={`${ride.vehicle.nickname} · ${ride.vehicle.plateNumber}`} />
                  <DetailRow label="Fare" strong value={formatCurrency(ride.fare)} />
                  <DetailRow label="Distance" value={formatDistance(ride.distanceKm)} />
                  <DetailRow label="Duration" value={formatMinutes(ride.durationMin)} />
                  <DetailRow label="Pickup" value={ride.pickup.address} />
                  <DetailRow label="Destination" value={ride.destination.address} />
                  <DetailRow
                    label="Completed"
                    value={ride.completedAt ? formatDateTime(ride.completedAt) : 'Not completed'}
                  />
                </div>

                {ride.cancelReason ? (
                  <div className="gt-notice gt-notice-neutral">
                    <Icon name="x" size={17} className="mt-0.5 shrink-0 text-muted" />
                    <p>
                      <span className="font-bold text-heading">Cancelled</span>
                      <br />
                      {ride.cancelReason}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <p className="text-[13px] font-bold text-heading">Trip progress</p>
                  <RideTimeline ride={ride} compact />
                </div>

                {ride.timeline.length > 0 ? (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <p className="text-[13px] font-bold text-heading">Trip log</p>
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
                  </div>
                ) : null}
              </div>
            );
          })()
        ) : (
          <EmptyState icon="history" title="Trip not found" description="This trip is no longer available." />
        )}
      </Modal>
    </div>
  );
}

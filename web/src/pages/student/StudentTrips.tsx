import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { Icon } from '../../components/Icon';
import { RideCard } from '../../components/RideBits';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Notice,
  SegmentedControl,
  Skeleton,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { formatDistance, formatMinutes } from '../../lib/format';
import type { RideStatus, SerializedRide } from '../../lib/types';

type Filter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

/** The filter travels with the payload so stale rows are never shown while a
 *  different filter is loading. */
interface TripsPayload {
  filter: Filter;
  rides: SerializedRide[];
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All rides' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
];

const ACTIVE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'PIN_VERIFIED',
  'IN_PROGRESS',
];

const PAGE_SIZE = 30;
const MAX_LIMIT = 100;

interface MonthGroup {
  key: string;
  label: string;
  rides: SerializedRide[];
}

/** Groups the (server-sorted) ride list into calendar months, newest first. */
function groupByMonth(rides: SerializedRide[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const ride of rides) {
    const date = new Date(ride.requestedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rides.push(ride);
    else groups.push({ key, label, rides: [ride] });
  }
  return groups;
}

function rideFooter(ride: SerializedRide) {
  const detail =
    ride.status === 'CANCELLED' && ride.cancelReason
      ? `Cancelled · ${ride.cancelReason}`
      : ride.status === 'NO_SHOW'
        ? 'Marked as a no-show'
        : `${formatDistance(ride.distanceKm)} · ${formatMinutes(ride.durationMin)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <span className="min-w-0 truncate text-[12px] text-muted">{detail}</span>
      {ride.status === 'COMPLETED' ? (
        <span className="text-[12px] font-bold text-primary">Points earned · +1</span>
      ) : ACTIVE_STATUSES.includes(ride.status) ? (
        <span className="text-[12px] font-semibold text-primary">Track this ride →</span>
      ) : null}
    </div>
  );
}

/** Student trip history: filterable, month-grouped list of every ride. */
export default function StudentTrips() {
  useDocumentTitle('Trip history · Guardian Transit');

  const [filter, setFilter] = useState<Filter>('ALL');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const trips = useAsync<TripsPayload>(
    async (signal) => {
      const payload = await api.get<{ rides: SerializedRide[] }>('/rides', {
        query: { status: filter, limit },
        signal,
      });
      return { filter, rides: payload.rides };
    },
    [filter, limit],
  );

  const list = trips.data?.rides ?? [];
  const sameFilter = trips.data?.filter === filter;
  const groups = useMemo(() => groupByMonth(list), [list]);
  const activeRide = list.find((ride) => ACTIVE_STATUSES.includes(ride.status)) ?? null;

  const filterLabel = FILTERS.find((option) => option.value === filter)?.label ?? 'All rides';
  const latestMonth = list.length > 0 ? new Date(list[0].requestedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  // Keep the button (with its spinner) visible while the next page loads.
  const canLoadMore =
    sameFilter && limit < MAX_LIMIT && (trips.loading || list.length >= limit);

  function changeFilter(next: Filter) {
    setFilter(next);
    setLimit(PAGE_SIZE);
  }

  function loadEarlier() {
    setLimit((value) => Math.min(value + PAGE_SIZE, MAX_LIMIT));
  }

  return (
    <>
      <StudentHeader
        title="Trip History"
        subtitle="Your school-to-home journeys, all in one place."
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

      <div className="flex flex-col gap-[22px] px-5 pb-7 pt-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="primary">{filterLabel}</Badge>
          {latestMonth ? (
            <Badge tone="neutral" icon="calendar">
              {latestMonth}
            </Badge>
          ) : null}
        </div>

        <SegmentedControl value={filter} options={FILTERS} onChange={changeFilter} />

        {activeRide && (filter === 'ALL' || filter === 'ACTIVE') ? (
          <Notice tone="primary" icon="navigation" title="A ride is running right now">
            <Link to={`/student/ride/${activeRide.id}`}>Open live tracking</Link>
          </Notice>
        ) : null}

        <div className="flex flex-col gap-[22px]" aria-live="polite">
          {trips.loading && !sameFilter ? (
            <>
              <Skeleton height={168} className="rounded-[20px]" />
              <Skeleton height={168} className="rounded-[20px]" />
              <Skeleton height={168} className="rounded-[20px]" />
            </>
          ) : trips.error && (!sameFilter || list.length === 0) ? (
            <ErrorState title="We could not load your trips" message={trips.error} onRetry={trips.reload} />
          ) : list.length === 0 ? (
            <EmptyState
              icon="history"
              title={filter === 'ALL' ? 'No rides yet' : `No ${filterLabel.toLowerCase()} rides`}
              description={
                filter === 'ALL'
                  ? 'Your school-to-home journeys appear here after your first trip.'
                  : 'Nothing matches this filter right now. Try another filter to see the rest of your rides.'
              }
              action={
                filter === 'ALL' ? (
                  <LinkButton to="/student/book/pickup" icon="navigation">
                    Book your first ride
                  </LinkButton>
                ) : (
                  <Button variant="secondary" icon="list" onClick={() => changeFilter('ALL')}>
                    Show all rides
                  </Button>
                )
              }
            />
          ) : (
            <>
              {groups.map((group) => (
                <section key={group.key} className="flex flex-col gap-3" aria-label={group.label}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[13px] font-bold text-heading">{group.label}</h2>
                    <span className="text-[11px] text-muted">
                      {group.rides.length} ride{group.rides.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {group.rides.map((ride) => (
                    <RideCard key={ride.id} ride={ride} to={`/student/ride/${ride.id}`} footer={rideFooter(ride)} />
                  ))}
                </section>
              ))}

              {trips.error ? (
                <div className="flex flex-col items-center gap-2 rounded-[12px] bg-canvas-alt p-3.5 text-center">
                  <p className="gt-error-text text-[12px]">{trips.error}</p>
                  <Button variant="secondary" size="sm" icon="refresh-cw" onClick={trips.reload}>
                    Try again
                  </Button>
                </div>
              ) : canLoadMore ? (
                <Button variant="secondary" block icon="chevron-down" loading={trips.loading} onClick={loadEarlier}>
                  Load earlier rides
                </Button>
              ) : (
                <p className="text-center text-[11px] text-muted">
                  Showing all {list.length} ride{list.length === 1 ? '' : 's'}.
                </p>
              )}
            </>
          )}
        </div>

        <LinkButton to="/student/emergency" variant="secondary" icon="shield-alert" block>
          Report a safety concern
        </LinkButton>
      </div>
    </>
  );
}

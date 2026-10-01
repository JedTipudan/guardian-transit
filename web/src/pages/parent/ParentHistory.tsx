import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { formatDate, formatDistance, formatTime, rideStatusLabel } from '../../lib/format';
import type { SerializedRide, StudentListItem } from '../../lib/types';
import { useToast } from '../../state/ToastContext';
import { Icon } from '../../components/Icon';
import { Button, EmptyState, ErrorState, LinkButton, PageLoader, Skeleton } from '../../components/ui';
import { RideStatusBadge } from '../../components/RideBits';

const PAGE_SIZE = 30;
/** The API caps `limit` at 100 and has no offset, so this is the deepest page we can reach. */
const MAX_LIMIT = 100;
const POINTS_PER_RIDE = 1;

type StatusFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
type PeriodFilter = 'ALL' | '7' | '30';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active now' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
];

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'ALL', label: 'All dates' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

function cell(ride: SerializedRide): string {
  return `${formatDate(ride.completedAt ?? ride.requestedAt)} ${formatTime(ride.completedAt ?? ride.requestedAt)}`;
}

function csvField(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a real CSV from the rows we have loaded — there is no export endpoint. */
function downloadCsv(rides: SerializedRide[], fileName: string): number {
  const header = [
    'Date',
    'Trip',
    'Status',
    'Child',
    'Pickup',
    'Destination',
    'Driver',
    'Vehicle',
    'Plate',
    'Distance km',
    'Duration min',
    'Fare',
    'Free ride',
    'Rating',
  ];
  const rows = rides.map((ride) =>
    [
      cell(ride),
      ride.code,
      rideStatusLabel(ride.status),
      ride.student.name,
      ride.pickup.label,
      ride.destination.label,
      ride.driver.name,
      `${ride.vehicle.color} ${ride.vehicle.nickname}`.trim(),
      ride.vehicle.plateNumber,
      ride.distanceKm,
      ride.durationMin,
      ride.fare,
      ride.freeRideApplied ? 'yes' : 'no',
      ride.rating ?? '',
    ]
      .map(csvField)
      .join(','),
  );
  const blob = new Blob([[header.map(csvField).join(','), ...rows].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return rides.length;
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-white p-5">
      <p className="text-[24px] font-bold leading-[1.5] text-heading">{value}</p>
      <p className="text-[12px] leading-[1.5] text-muted">{label}</p>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 md:block">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted md:hidden">{label}</span>
      <div className="min-w-0 text-right text-[12px] leading-[1.65] text-heading md:text-left">{children}</div>
    </div>
  );
}

export default function ParentHistory() {
  useDocumentTitle('Trip History · Guardian Transit');
  const { push } = useToast();

  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [period, setPeriod] = useState<PeriodFilter>('ALL');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [exporting, setExporting] = useState(false);

  const studentsQuery = useAsync<{ students: StudentListItem[] }>(
    (signal) => api.get('/students', { signal }),
    [],
  );
  const students = studentsQuery.data?.students ?? [];

  const ridesQuery = useAsync<{ rides: SerializedRide[] }>(
    (signal) =>
      api.get('/rides', {
        signal,
        query: {
          status: status === 'ALL' ? undefined : status,
          studentId: studentId ?? undefined,
          limit,
        },
      }),
    [status, studentId, limit],
  );

  const rides = useMemo(() => ridesQuery.data?.rides ?? [], [ridesQuery.data]);

  const visible = useMemo(() => {
    if (period === 'ALL') return rides;
    const cutoff = Date.now() - Number(period) * 24 * 60 * 60 * 1000;
    return rides.filter((ride) => new Date(ride.completedAt ?? ride.requestedAt).getTime() >= cutoff);
  }, [rides, period]);

  const completedInView = visible.filter((ride) => ride.status === 'COMPLETED');
  const selectedStudent = students.find((student) => student.id === studentId) ?? null;
  const hasFilters = status !== 'ALL' || period !== 'ALL' || studentId !== null;

  function clearFilters() {
    setStatus('ALL');
    setPeriod('ALL');
    setStudentId(null);
    setLimit(PAGE_SIZE);
  }

  function onExport() {
    if (visible.length === 0) return;
    setExporting(true);
    try {
      const count = downloadCsv(visible, `guardian-transit-trips-${new Date().toISOString().slice(0, 10)}.csv`);
      push(`Exported ${count} trip${count === 1 ? '' : 's'} to CSV.`, 'success');
    } catch {
      push('We could not build the CSV file. Try again.', 'error');
    } finally {
      setExporting(false);
    }
  }

  if (studentsQuery.loading && !studentsQuery.data) return <PageLoader label="Loading your family…" />;
  if (studentsQuery.error && !studentsQuery.data) {
    return (
      <ErrorState
        title="We could not load your children"
        message={studentsQuery.error}
        onRetry={studentsQuery.reload}
      />
    );
  }

  const loading = ridesQuery.loading && !ridesQuery.data;
  const moreAvailable = rides.length >= limit && limit < MAX_LIMIT;

  return (
    <div className="flex flex-col gap-6">
      {/* --- Heading ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <h1 className="text-[27px] font-bold leading-[1.2] text-heading md:text-[30px]">Trip History</h1>
        <p className="text-[14px] text-muted">
          {selectedStudent
            ? `${selectedStudent.name}’s journeys, all in one place.`
            : students.length > 0
              ? 'Every linked child’s journeys, all in one place.'
              : 'Your linked journeys, all in one place.'}
        </p>
      </div>

      {/* --- Summary metrics ------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric value={String(completedInView.length)} label="Completed rides in this view" />
        <Metric
          value={`${completedInView.length * POINTS_PER_RIDE} point${completedInView.length === 1 ? '' : 's'}`}
          label="Earned from these rides"
        />
        {selectedStudent ? (
          <Metric value={selectedStudent.name} label="Connected child" />
        ) : (
          <Metric
            value={students.length > 0 ? String(students.length) : '—'}
            label={students.length === 1 ? 'Connected child' : 'Connected children'}
          />
        )}
      </div>

      {/* --- Filters ---------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        {students.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by child">
            <button
              key="all"
              type="button"
              aria-pressed={studentId === null}
              onClick={() => setStudentId(null)}
              className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 text-[12px] transition ${
                studentId === null
                  ? 'border-primary bg-primary-soft font-bold text-primary'
                  : 'border-border bg-white text-muted hover:text-heading'
              }`}
            >
              <Icon name="users" size={14} />
              All children
            </button>
            {students.map((student) => (
              <button
                key={student.id}
                type="button"
                aria-pressed={studentId === student.id}
                onClick={() => setStudentId(student.id)}
                className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 text-[12px] transition ${
                  studentId === student.id
                    ? 'border-primary bg-primary-soft font-bold text-primary'
                    : 'border-border bg-white text-muted hover:text-heading'
                }`}
              >
                <Icon name="user-round" size={14} />
                {student.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="gt-input w-auto min-w-[170px] appearance-none"
            value={status}
            aria-label="Filter by status"
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setLimit(PAGE_SIZE);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="gt-input w-auto min-w-[150px] appearance-none"
            value={period}
            aria-label="Filter by date range"
            onChange={(event) => setPeriod(event.target.value as PeriodFilter)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            icon="share"
            onClick={onExport}
            loading={exporting}
            disabled={visible.length === 0}
          >
            Export History
          </Button>

          {hasFilters ? (
            <Button variant="ghost" icon="x" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <p className="text-[12px] text-muted">
          {ridesQuery.loading
            ? 'Loading trips…'
            : `Showing ${visible.length} of ${rides.length} loaded trip${rides.length === 1 ? '' : 's'}`}
          {' · '}
          Active trips appear on the Live Trip screen.
        </p>
      </div>

      {/* --- Trip table -------------------------------------------------- */}
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton height={72} className="rounded-[16px]" />
          <Skeleton height={72} className="rounded-[16px]" />
          <Skeleton height={72} className="rounded-[16px]" />
        </div>
      ) : ridesQuery.error ? (
        <ErrorState
          title="We could not load trip history"
          message={ridesQuery.error}
          onRetry={ridesQuery.reload}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="history"
          title={hasFilters ? 'No trips match these filters' : 'No trips recorded yet'}
          description={
            hasFilters
              ? 'Try a wider date range or clear the filters to see every journey your family has taken.'
              : 'Once a linked child completes a ride it appears here with the fare, driver and receipt details.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" icon="x" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-3">
                <LinkButton to="/parent" icon="layout-dashboard">
                  Dashboard
                </LinkButton>
                <LinkButton to="/parent/guardians" variant="secondary" icon="users">
                  Link a child
                </LinkButton>
              </div>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-border bg-white">
          <div className="hidden grid-cols-[132px_1.4fr_1.4fr_1fr_1fr_132px] gap-3 bg-primary-soft px-5 py-3 md:grid">
            <span className="text-[12px] font-bold text-heading">Date</span>
            <span className="text-[12px] font-bold text-heading">Pickup</span>
            <span className="text-[12px] font-bold text-heading">Destination</span>
            <span className="text-[12px] font-bold text-heading">Driver</span>
            <span className="text-[12px] font-bold text-heading">Vehicle</span>
            <span className="text-[12px] font-bold text-heading">Status</span>
          </div>

          <ul className="divide-y divide-border">
            {visible.map((ride) => (
              <li key={ride.id}>
                <Link
                  to={`/parent/ride/${ride.id}`}
                  className="grid grid-cols-1 gap-2.5 px-4 py-4 transition hover:bg-canvas-alt md:grid-cols-[132px_1.4fr_1.4fr_1fr_1fr_132px] md:items-center md:gap-3 md:px-5 md:py-5"
                >
                  <Cell label="Date">
                    <span className="block">{formatDate(ride.completedAt ?? ride.requestedAt)}</span>
                    <span className="block text-muted">{formatTime(ride.completedAt ?? ride.requestedAt)}</span>
                  </Cell>
                  <Cell label="Pickup">
                    <span className="block break-words">{ride.pickup.label}</span>
                  </Cell>
                  <Cell label="Destination">
                    <span className="block break-words">{ride.destination.label}</span>
                  </Cell>
                  <Cell label="Driver">
                    <span className="block break-words">{ride.driver.name}</span>
                  </Cell>
                  <Cell label="Vehicle">
                    <span className="block break-words">
                      {ride.vehicle.nickname} {ride.vehicle.plateNumber}
                    </span>
                    <span className="block text-muted">{formatDistance(ride.distanceKm)}</span>
                  </Cell>
                  <div className="flex flex-wrap items-center gap-1.5 md:flex-col md:items-start">
                    <RideStatusBadge status={ride.status} />
                    {ride.status === 'COMPLETED' ? (
                      <span className="text-[11px] text-primary">
                        +{POINTS_PER_RIDE} point{POINTS_PER_RIDE === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Pagination -------------------------------------------------- */}
      {!loading && visible.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-muted">
            Showing {visible.length} trip{visible.length === 1 ? '' : 's'}
            {moreAvailable ? ` · more available (up to ${MAX_LIMIT})` : ''}
          </p>
          {moreAvailable ? (
            <Button
              variant="secondary"
              icon="chevron-down"
              loading={ridesQuery.loading}
              onClick={() => setLimit((value) => Math.min(value + PAGE_SIZE, MAX_LIMIT))}
            >
              Load more
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

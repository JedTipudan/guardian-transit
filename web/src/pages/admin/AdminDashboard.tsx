import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, EmptyState, ErrorState, LinkButton, Skeleton } from '../../components/ui';
import { RideStatusBadge } from '../../components/RideBits';
import { api } from '../../lib/api';
import { badgeTone, emergencyTypeLabel, formatCurrency, formatDateTime, relativeTime, verificationStatusLabel } from '../../lib/format';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { getSocket } from '../../lib/socket';
import type { AdminStats, AdminVerificationDriver, AvailableDriver, EmergencyEvent, SerializedRide } from '../../lib/types';

type Tone = 'primary' | 'success' | 'danger' | 'neutral' | 'warning' | 'navy';

interface EmergenciesPayload {
  emergencies: EmergencyEvent[];
}

interface VerificationsPayload {
  drivers: AdminVerificationDriver[];
  vehicles: unknown[];
}

interface RidesPayload {
  rides: SerializedRide[];
}

interface DriversPayload {
  drivers: AvailableDriver[];
}

interface Tile {
  key: keyof AdminStats['totals'];
  label: string;
  caption: string;
  icon: string;
  tone: Tone;
  to: string;
}

const TILES: Tile[] = [
  { key: 'users', label: 'Total users', caption: 'Every account on the platform', icon: 'users', tone: 'primary', to: '/admin/users' },
  {
    key: 'pendingVerifications',
    label: 'Pending verifications',
    caption: 'Driver and vehicle checks',
    icon: 'file-check',
    tone: 'warning',
    to: '/admin/verifications',
  },
  { key: 'activeRides', label: 'Active rides', caption: 'In progress right now', icon: 'navigation', tone: 'primary', to: '/admin/rides' },
  {
    key: 'completedToday',
    label: 'Completed today',
    caption: 'Finished since midnight',
    icon: 'check-circle',
    tone: 'success',
    to: '/admin/rides',
  },
  {
    key: 'openEmergencies',
    label: 'Open emergencies',
    caption: 'Awaiting a response',
    icon: 'siren',
    tone: 'danger',
    to: '/admin/emergencies',
  },
  {
    key: 'newReports',
    label: 'New safety reports',
    caption: 'Filed and not yet triaged',
    icon: 'shield-alert',
    tone: 'warning',
    to: '/admin/reports',
  },
  { key: 'onlineDrivers', label: 'Online drivers', caption: 'Verified and available', icon: 'wifi', tone: 'success', to: '/admin/users' },
  {
    key: 'ridesToday',
    label: 'Rides today',
    caption: 'Requested since midnight',
    icon: 'route',
    tone: 'navy',
    to: '/admin/rides',
  },
];

const toneSurface: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-canvas-alt text-muted',
  navy: 'bg-navy text-white',
};

/** Tone-correct badge copy for a tile value. */
function tileStatus(key: Tile['key'], value: number): { tone: Tone; label: string } {
  switch (key) {
    case 'openEmergencies':
      return value > 0 ? { tone: 'danger', label: 'Action needed' } : { tone: 'success', label: 'All clear' };
    case 'newReports':
      return value > 0 ? { tone: 'warning', label: 'Waiting' } : { tone: 'success', label: 'None' };
    case 'pendingVerifications':
      return value > 0 ? { tone: 'warning', label: 'In queue' } : { tone: 'success', label: 'Clear' };
    case 'activeRides':
      return value > 0 ? { tone: 'primary', label: 'Live' } : { tone: 'neutral', label: 'Idle' };
    case 'onlineDrivers':
      return value > 0 ? { tone: 'success', label: 'On the road' } : { tone: 'neutral', label: 'Offline' };
    case 'completedToday':
      return { tone: 'success', label: 'Today' };
    case 'users':
      return { tone: 'neutral', label: 'All roles' };
    default:
      return { tone: 'navy', label: 'Today' };
  }
}

function titleCase(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function emergencyTone(status: EmergencyEvent['status']): Tone {
  switch (status) {
    case 'ACTIVE':
      return 'danger';
    case 'ACKNOWLEDGED':
      return 'warning';
    case 'RESOLVED':
      return 'success';
    default:
      return 'neutral';
  }
}

function PanelHeading({ title, to, toLabel }: { title: string; to?: string; toLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[16px] font-bold text-heading md:text-[18px]">{title}</h2>
      {to ? (
        <Link to={to} className="text-[12px] font-semibold text-primary hover:underline">
          {toLabel ?? 'View all'}
        </Link>
      ) : null}
    </div>
  );
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={56} className="rounded-[12px]" />
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  useDocumentTitle('Safety desk · Guardian Transit');

  const stats = useAsync<AdminStats>((signal) => api.get('/admin/stats', { signal }), []);
  const emergencies = useAsync<EmergenciesPayload>((signal) => api.get('/emergency', { signal }), []);
  const verifications = useAsync<VerificationsPayload>((signal) => api.get('/admin/verifications', { signal }), []);
  const rides = useAsync<RidesPayload>((signal) => api.get('/admin/rides', { signal }), []);

  // Online drivers are ranked from the most recent trip's pickup point, so the
  // panel only becomes available once a ride exists to anchor the query.
  const reference = rides.data?.rides[0]?.pickup ?? null;
  const referenceKey = reference ? `${reference.lat}:${reference.lng}` : '';
  const onlineDrivers = useAsync<DriversPayload>(
    (signal) =>
      api.get('/rides/available-drivers', {
        signal,
        query: { pickupLat: reference?.lat ?? 0, pickupLng: reference?.lng ?? 0 },
      }),
    [referenceKey],
    { enabled: referenceKey !== '' },
  );

  // Live refresh: a new SOS should surface on the desk without a manual reload.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onRaised = () => {
      stats.reload();
      emergencies.reload();
    };
    socket.on('emergency:raised', onRaised);
    return () => {
      socket.off('emergency:raised', onRaised);
    };
  }, [stats.reload, emergencies.reload]);

  const openEmergencies = useMemo(() => {
    const list = emergencies.data?.emergencies ?? [];
    return list.filter((event) => event.status === 'ACTIVE' || event.status === 'ACKNOWLEDGED').slice(0, 5);
  }, [emergencies.data]);

  const pendingDrivers = useMemo(() => {
    const list = verifications.data?.drivers ?? [];
    return list
      .filter((driver) => driver.overallStatus !== 'VERIFIED' && driver.overallStatus !== 'REJECTED')
      .slice(0, 5);
  }, [verifications.data]);

  const recentRides = useMemo(() => (rides.data?.rides ?? []).slice(0, 6), [rides.data]);

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="gt-eyebrow">Safety desk</p>
        <h1 className="text-[24px] font-bold leading-[1.2] text-heading md:text-[30px]">Dashboard</h1>
        <p className="text-[13px] text-muted">
          {formatDateTime(new Date())} · Platform-wide safety at a glance.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon="refresh-cw"
          loading={stats.loading}
          onClick={() => {
            stats.reload();
            emergencies.reload();
            verifications.reload();
            rides.reload();
          }}
        >
          Refresh
        </Button>
        <LinkButton to="/admin/emergencies" variant="danger" size="sm" icon="siren">
          Emergencies
        </LinkButton>
      </div>
    </div>
  );

  if (stats.error && !stats.data) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        {heading}
        <ErrorState
          title="We could not load the safety desk totals"
          message={stats.error}
          onRetry={stats.reload}
        />
      </div>
    );
  }

  const totals = stats.data?.totals ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      {heading}

      {/* --- Totals ------------------------------------------------------ */}
      {stats.loading && !stats.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} height={118} className="rounded-[20px]" />
          ))}
        </div>
      ) : totals ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {TILES.map((tile) => {
            const value = totals[tile.key];
            const status = tileStatus(tile.key, value);
            return (
              <Link
                key={tile.key}
                to={tile.to}
                className="gt-card flex flex-col gap-3 transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${toneSurface[tile.tone]}`}>
                    <Icon name={tile.icon} size={18} />
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <div>
                  <p className="text-[26px] font-bold leading-[1.2] text-heading">{value}</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-heading">{tile.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{tile.caption}</p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}

      {stats.error && stats.data ? (
        <NoticeInline message={stats.error} onRetry={stats.reload} />
      ) : null}

      {/* --- Emergencies + verification queue ---------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="gt-card flex flex-col gap-4">
          <PanelHeading title="Open emergencies" to="/admin/emergencies" />
          {emergencies.loading && !emergencies.data ? (
            <PanelSkeleton />
          ) : emergencies.error ? (
            <ErrorState title="Emergencies failed to load" message={emergencies.error} onRetry={emergencies.reload} />
          ) : openEmergencies.length === 0 ? (
            <EmptyState
              icon="shield-check"
              title="All clear"
              description="No SOS alerts are waiting for the safety desk right now."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {openEmergencies.map((event) => (
                <Link
                  key={event.id}
                  to="/admin/emergencies"
                  className="flex items-start gap-3 rounded-[12px] border border-border bg-canvas-alt p-3 transition hover:border-danger/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-danger-soft text-danger">
                    <Icon name="siren" size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-bold text-heading">{emergencyTypeLabel(event.type)}</span>
                      <Badge tone={emergencyTone(event.status)}>{titleCase(event.status)}</Badge>
                    </span>
                    <span className="mt-1 block truncate text-[12px] text-muted">
                      {event.message ?? 'No message was attached to this alert.'}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted">
                      {relativeTime(event.createdAt)}
                      {event.ride ? ` · Ride ${event.ride.code}` : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="gt-card flex flex-col gap-4">
          <PanelHeading title="Pending verifications" to="/admin/verifications" />
          {verifications.loading && !verifications.data ? (
            <PanelSkeleton />
          ) : verifications.error ? (
            <ErrorState
              title="Verifications failed to load"
              message={verifications.error}
              onRetry={verifications.reload}
            />
          ) : pendingDrivers.length === 0 ? (
            <EmptyState
              icon="badge-check"
              title="Nothing waiting for review"
              description="Every driver document submitted so far has been decided."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {pendingDrivers.map((driver) => (
                <Link
                  key={driver.id}
                  to="/admin/verifications"
                  className="flex items-center gap-3 rounded-[12px] border border-border bg-canvas-alt p-3 transition hover:border-primary/40"
                >
                  <Avatar name={driver.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-heading">{driver.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {driver.phone} · {driver.checks.filter((check) => check.status !== 'VERIFIED').length} check
                      {driver.checks.filter((check) => check.status !== 'VERIFIED').length === 1 ? '' : 's'} outstanding
                    </span>
                  </span>
                  <Badge tone={badgeTone(driver.overallStatus)}>{verificationStatusLabel(driver.overallStatus)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* --- Recent rides + online drivers -------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="gt-card flex flex-col gap-4">
          <PanelHeading title="Recent rides" to="/admin/rides" />
          {rides.loading && !rides.data ? (
            <PanelSkeleton rows={4} />
          ) : rides.error ? (
            <ErrorState title="Rides failed to load" message={rides.error} onRetry={rides.reload} />
          ) : recentRides.length === 0 ? (
            <EmptyState icon="car" title="No rides yet" description="Trips will appear here as soon as they are requested." />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3 font-semibold">Ride</th>
                      <th className="py-2 pr-3 font-semibold">Student</th>
                      <th className="py-2 pr-3 font-semibold">Driver</th>
                      <th className="py-2 pr-3 text-right font-semibold">Fare</th>
                      <th className="py-2 pr-3 font-semibold">When</th>
                      <th className="py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRides.map((ride) => (
                      <tr key={ride.id} className="border-b border-border/70 last:border-0">
                        <td className="py-3 pr-3">
                          <Link
                            to={`/admin/rides?ride=${ride.id}`}
                            className="text-[13px] font-bold text-primary hover:underline"
                          >
                            {ride.code}
                          </Link>
                          <p className="truncate text-[11px] text-muted">
                            {ride.pickup.label} → {ride.destination.label}
                          </p>
                        </td>
                        <td className="py-3 pr-3 text-[13px] text-heading">{ride.student.name}</td>
                        <td className="py-3 pr-3 text-[13px] text-heading">{ride.driver.name}</td>
                        <td className="py-3 pr-3 text-right text-[13px] font-semibold text-heading">
                          {formatCurrency(ride.fare)}
                        </td>
                        <td className="py-3 pr-3 text-[12px] text-muted">
                          {formatDateTime(ride.completedAt ?? ride.requestedAt)}
                        </td>
                        <td className="py-3">
                          <RideStatusBadge status={ride.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                {recentRides.map((ride) => (
                  <Link
                    key={ride.id}
                    to={`/admin/rides?ride=${ride.id}`}
                    className="rounded-[12px] border border-border bg-canvas-alt p-3 transition hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-heading">{ride.code}</p>
                        <p className="truncate text-[12px] text-muted">
                          {ride.pickup.label} → {ride.destination.label}
                        </p>
                      </div>
                      <RideStatusBadge status={ride.status} />
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      {ride.student.name} · {ride.driver.name} · {formatCurrency(ride.fare)}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="gt-card flex flex-col gap-4">
          <PanelHeading title="Online drivers" to="/admin/users" toLabel="All users" />
          <p className="-mt-2 text-[11px] text-muted">
            Ranked from the most recent trip’s pickup point.
          </p>
          {referenceKey === '' && !rides.loading ? (
            <EmptyState
              icon="wifi"
              title="No reference location yet"
              description="Once a trip is requested the desk can rank the drivers currently online."
            />
          ) : onlineDrivers.loading && !onlineDrivers.data ? (
            <PanelSkeleton />
          ) : onlineDrivers.error ? (
            <ErrorState title="Drivers failed to load" message={onlineDrivers.error} onRetry={onlineDrivers.reload} />
          ) : (onlineDrivers.data?.drivers.length ?? 0) === 0 ? (
            <EmptyState icon="wifi-off" title="Nobody is online" description="All verified drivers are currently off the road." />
          ) : (
            <div className="flex flex-col gap-3">
              {onlineDrivers.data?.drivers.map((driver) => (
                <div key={driver.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-canvas-alt p-3">
                  <Avatar name={driver.name} src={driver.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-heading">{driver.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {driver.vehicle ? `${driver.vehicle.nickname} · ${driver.vehicle.plateNumber}` : 'No vehicle assigned'} ·{' '}
                      {driver.completedTrips} trips
                    </p>
                  </div>
                  <Badge tone={driver.locationKnown ? 'success' : 'neutral'}>
                    {driver.locationKnown ? 'Location live' : 'No fix'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Small inline retry strip used when a secondary refresh fails. */
function NoticeInline({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="gt-notice gt-notice-danger">
      <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="mb-1 font-bold text-heading">The latest refresh failed</p>
        <p className="text-[12px] text-muted">{message}</p>
        <Button variant="secondary" size="sm" icon="refresh-cw" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

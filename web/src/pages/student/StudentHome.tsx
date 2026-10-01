import { Link } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { Icon } from '../../components/Icon';
import { Badge, Button, EmptyState, ErrorState, LinkButton, Skeleton } from '../../components/ui';
import { MapCanvas } from '../../components/MapCanvas';
import { RideCard, RideStatusBadge } from '../../components/RideBits';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { greeting } from '../../lib/format';
import type { RewardsPayload, SerializedRide } from '../../lib/types';
import { useAuth } from '../../state/AuthContext';
import { useNotifications } from '../../state/NotificationsContext';

/** Student home: greeting, current ride / booking callout, points and recent trips. */
export default function StudentHome() {
  useDocumentTitle('Home · Guardian Transit');
  const { user } = useAuth();
  const { unread } = useNotifications();

  const firstName = user?.firstName ?? 'there';

  const active = useAsync<{ ride: SerializedRide | null }>((signal) =>
    api.get<{ ride: SerializedRide | null }>('/rides/active', { signal }),
  );
  const rewards = useAsync<RewardsPayload>((signal) => api.get<RewardsPayload>('/rewards', { signal }));
  const recent = useAsync<SerializedRide[]>(
    async (signal) =>
      (
        await api.get<{ rides: SerializedRide[] }>('/rides', {
          query: { status: 'COMPLETED', limit: 3 },
          signal,
        })
      ).rides,
  );

  const ride = active.data?.ride ?? null;

  function reloadAll() {
    active.reload();
    rewards.reload();
    recent.reload();
  }

  const now = new Date();
  const dateLine = `${now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${now.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' },
  )}`;

  const rides = recent.data ?? [];
  const points = rewards.data;

  return (
    <>
      <StudentHeader
        title={`${greeting()}, ${firstName}`}
        subtitle={dateLine}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reloadAll}
              aria-label="Refresh home screen"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
            >
              <Icon name="refresh-cw" size={17} />
            </button>
            <Link
              to="/student/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
            >
              <Icon name="bell" size={18} />
              {unread > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              ) : null}
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-[22px] px-5 pb-7 pt-[18px]">
        <p className="text-[14px] text-muted">{firstName}, your way home is connected.</p>

        {/* Current ride, or the booking callout when nothing is running. */}
        {active.loading ? (
          <div className="gt-card flex flex-col gap-3">
            <Skeleton height={16} className="w-1/3" />
            <Skeleton height={26} className="w-2/3" />
            <Skeleton height={150} className="rounded-[12px]" />
            <Skeleton height={44} className="rounded-[12px]" />
          </div>
        ) : active.error ? (
          <ErrorState title="We could not load your ride status" message={active.error} onRetry={active.reload} />
        ) : ride ? (
          <section className="gt-card flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-bold text-heading">Current ride</h2>
              <RideStatusBadge status={ride.status} />
            </div>

            <div>
              <p className="text-[24px] font-bold leading-[1.4] text-heading">
                {ride.status === 'IN_PROGRESS' ? 'On the way to ' : 'Heading to '}
                {ride.destination.label}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {ride.pickup.label} → {ride.destination.label} · {ride.durationMin} min · {ride.distanceKm} km
              </p>
            </div>

            <MapCanvas
              height={150}
              interactive={false}
              pickup={ride.pickup}
              destination={ride.destination}
              hint="Route preview appears when the trip starts."
            />

            <p className="text-[12px] text-muted">
              Driver · <span className="font-semibold text-heading">{ride.driver.name}</span> · {ride.vehicle.plateNumber}
            </p>

            <LinkButton to={`/student/ride/${ride.id}`} icon="map" block>
              Track my ride
            </LinkButton>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-[20px] bg-navy p-5">
            <p className="text-[18px] font-bold leading-[1.45] text-white">School’s out. Head home safely.</p>
            <p className="text-[12px] text-navy-text">Verified BaoBao drivers. A guardian in the loop.</p>
            <LinkButton to="/student/book" icon="navigation" block>
              Book a Safe Ride
            </LinkButton>
          </section>
        )}

        {/* Guardian points */}
        <section className="gt-card flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-heading">Guardian Points</h2>
            <Badge tone="primary" icon="gift">
              Rewards
            </Badge>
          </div>

          {rewards.loading ? (
            <>
              <Skeleton height={24} className="w-40" />
              <Skeleton height={8} className="rounded-full" />
              <Skeleton height={14} className="w-2/3" />
            </>
          ) : rewards.error ? (
            <div className="flex flex-col items-start gap-2 rounded-[12px] bg-canvas-alt p-3.5">
              <p className="gt-error-text">{rewards.error}</p>
              <Button variant="secondary" size="sm" icon="refresh-cw" onClick={rewards.reload}>
                Try again
              </Button>
            </div>
          ) : points ? (
            <>
              <p className="text-[22px] font-bold text-heading">
                {points.balance}{' '}
                <span className="text-[14px] font-semibold text-muted">/ {points.goal} points</span>
              </p>
              <div className="gt-progress" role="progressbar" aria-valuenow={points.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progress towards a free ride">
                <span style={{ width: `${points.percent}%` }} />
              </div>
              <p className="text-[12px] text-muted">
                {points.freeRidesAvailable > 0
                  ? `${points.freeRidesAvailable} free ride${points.freeRidesAvailable === 1 ? '' : 's'} ready to use.`
                  : points.balance === 0
                    ? 'Complete your first ride to earn a point.'
                    : `${points.remaining} more ride${points.remaining === 1 ? '' : 's'} until your FREE RIDE!`}
              </p>
              <LinkButton to="/student/rewards" variant="secondary" block trailingIcon="arrow-right">
                Open rewards
              </LinkButton>
            </>
          ) : null}
        </section>

        {/* Quick actions */}
        <section className="grid grid-cols-2 gap-3">
          <Link
            to="/student/guardians"
            className="gt-card flex flex-col gap-2.5 transition hover:border-primary/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
              <Icon name="users" size={20} />
            </span>
            <span>
              <span className="block text-[14px] font-bold text-heading">Guardians</span>
              <span className="block text-[12px] text-muted">Connected family</span>
            </span>
          </Link>

          <Link
            to="/student/emergency"
            className="gt-card flex flex-col gap-2.5 transition hover:border-danger/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-danger-soft text-danger">
              <Icon name="siren" size={20} />
            </span>
            <span>
              <span className="block text-[14px] font-bold text-heading">Emergency</span>
              <span className="block text-[12px] text-muted">SOS &amp; hotlines</span>
            </span>
          </Link>
        </section>

        {/* Recent rides */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-heading">Recent rides</h2>
            <Link to="/student/trips" className="text-[12px] font-semibold text-primary hover:underline">
              See all trips
            </Link>
          </div>

          {recent.loading ? (
            <>
              <Skeleton height={110} className="rounded-[20px]" />
              <Skeleton height={110} className="rounded-[20px]" />
            </>
          ) : recent.error ? (
            <ErrorState title="We could not load your rides" message={recent.error} onRetry={recent.reload} />
          ) : rides.length === 0 ? (
            <EmptyState
              icon="car-front"
              title="No completed rides yet"
              description="Your school-to-home journeys appear here after your first trip."
              action={
                <LinkButton to="/student/book" icon="navigation">
                  Book a ride
                </LinkButton>
              }
            />
          ) : (
            rides.map((item) => <RideCard key={item.id} ride={item} to={`/student/ride/${item.id}`} />)
          )}
        </section>
      </div>
    </>
  );
}

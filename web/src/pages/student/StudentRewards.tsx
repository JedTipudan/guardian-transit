import { Link } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { Icon } from '../../components/Icon';
import { Badge, Button, EmptyState, ErrorState, LinkButton, Notice, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { formatDate } from '../../lib/format';
import type { LedgerEntry } from '../../lib/types';

/** The rewards endpoint returns `RewardSummary` rows (title/code/status/dates),
 *  which is narrower than the shared `RewardItem` type — model it locally so the
 *  screen only ever renders fields the server actually sends. */
interface RewardRecord {
  id: string;
  title: string;
  code: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
}

interface RewardsResponse {
  student: { id: string; studentCode: string; name: string };
  balance: number;
  perRide: number;
  goal: number;
  progress: number;
  remaining: number;
  percent: number;
  completedRides: number;
  freeRidesClaimed: number;
  freeRidesAvailable: number;
  rewards: RewardRecord[];
  ledger: LedgerEntry[];
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'RIDE_COMPLETED':
      return 'Completed ride';
    case 'SIGNUP_BONUS':
      return 'Welcome bonus';
    case 'ADMIN_ADJUSTMENT':
      return 'Reward redeemed';
    default:
      return reason.replace(/_/g, ' ');
  }
}

function rewardTone(status: string): 'primary' | 'success' | 'danger' | 'neutral' | 'warning' {
  switch (status) {
    case 'ISSUED':
      return 'success';
    case 'REDEEMED':
      return 'primary';
    case 'EXPIRED':
      return 'warning';
    case 'REVOKED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function rewardLabel(status: string): string {
  switch (status) {
    case 'ISSUED':
      return 'Ready to use';
    case 'REDEEMED':
      return 'Redeemed';
    case 'EXPIRED':
      return 'Expired';
    case 'REVOKED':
      return 'Revoked';
    default:
      return status;
  }
}

/** Student rewards: points balance, free-ride unlock, rewards and point ledger. */
export default function StudentRewards() {
  useDocumentTitle('Guardian Points · Guardian Transit');

  const rewards = useAsync<RewardsResponse>((signal) => api.get<RewardsResponse>('/rewards', { signal }));

  const data = rewards.data;
  const freeRides = data?.freeRidesAvailable ?? 0;
  const unlocked = freeRides > 0;

  const caption = data
    ? freeRides > 0
      ? `${freeRides} free ride${freeRides === 1 ? '' : 's'} ready to use.`
      : data.balance === 0
        ? 'Complete your first ride to earn a point.'
        : `${data.remaining} more ride${data.remaining === 1 ? '' : 's'} until your FREE RIDE!`
    : '';

  const tiles = data
    ? [
        { label: 'Completed rides', value: data.completedRides },
        { label: 'Free rides ready', value: data.freeRidesAvailable },
        { label: 'Rewards redeemed', value: data.freeRidesClaimed },
      ]
    : [];

  return (
    <>
      <StudentHeader
        title="Guardian Points"
        subtitle="Every completed ride brings you closer."
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

      <div className="flex flex-col gap-[22px] px-5 pb-7 pt-[18px]" aria-live="polite">
        {rewards.loading ? (
          <>
            <Skeleton height={132} className="rounded-[20px]" />
            <Skeleton height={190} className="rounded-[20px]" />
            <Skeleton height={150} className="rounded-[20px]" />
          </>
        ) : rewards.error || !data ? (
          <ErrorState
            title="We could not load your points"
            message={rewards.error ?? 'No rewards data was returned for your account.'}
            onRetry={rewards.reload}
          />
        ) : (
          <>
            {/* Balance + progress towards the next free ride */}
            <section className="gt-card flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[14px] font-bold text-heading">Guardian Points</h2>
                <Badge tone="primary" icon="sparkles">
                  {data.balance} / {data.goal} Points
                </Badge>
              </div>
              <p className="text-[26px] font-bold leading-[1.2] text-heading">
                {data.balance}
                <span className="text-[15px] font-semibold text-muted"> / {data.goal} points</span>
              </p>
              <div
                className="gt-progress"
                role="progressbar"
                aria-valuenow={data.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress towards a free ride"
              >
                <span style={{ width: `${data.percent}%` }} />
              </div>
              <p className="text-[12px] text-muted">{caption}</p>
            </section>

            {/* Free ride unlock card */}
            <section className="gt-card flex flex-col gap-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[16px] bg-primary-soft text-primary">
                  <Icon name="gift" size={32} />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-[19px] font-bold leading-[1.45] text-heading">Your next ride, on us.</p>
                  {unlocked ? (
                    <Badge tone="success" icon="check-circle">
                      {freeRides} free ride{freeRides === 1 ? '' : 's'} ready
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon="lock">
                      Locked · Unlock at {data.goal} points
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-[13px] text-muted">
                {unlocked
                  ? `You have ${freeRides} free ride${freeRides === 1 ? '' : 's'} saved up. One is applied automatically when you book your next ride.`
                  : `One FREE RIDE reward becomes available when your balance reaches ${data.goal} Guardian Points.`}
              </p>
              {unlocked ? (
                <LinkButton to="/student/book/pickup" icon="gift" block>
                  Book a free ride
                </LinkButton>
              ) : (
                <Button variant="secondary" icon="lock" block disabled>
                  Unlock at {data.goal} points
                </Button>
              )}
            </section>

            {/* Quick stats */}
            <section className="grid grid-cols-3 gap-3">
              {tiles.map((tile) => (
                <div key={tile.label} className="gt-card flex flex-col items-center gap-1 text-center">
                  <span className="text-[20px] font-bold leading-[1.2] text-heading">{tile.value}</span>
                  <span className="text-[11px] leading-[1.45] text-muted">{tile.label}</span>
                </div>
              ))}
            </section>

            <Notice tone="primary" icon="shield-check" title="1 completed ride = 1 point">
              Your ride earns its point after you arrive, not before.
            </Notice>

            {/* Issued / redeemed rewards */}
            <section className="gt-card flex flex-col gap-3.5">
              <h2 className="text-[18px] font-bold text-heading">Your rewards</h2>
              {data.rewards.length === 0 ? (
                <EmptyState
                  icon="gift"
                  title="No rewards yet"
                  description={`A FREE RIDE reward is issued automatically every ${data.goal} points.`}
                />
              ) : (
                data.rewards.map((reward, index) => (
                  <div
                    key={reward.id}
                    className={`flex items-center gap-3 ${index === 0 ? '' : 'border-t border-border pt-3'}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                      <Icon name="gift" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-heading">{reward.title}</p>
                      <p className="truncate text-[12px] text-muted">
                        {reward.code} · Earned {formatDate(reward.issuedAt)}
                      </p>
                    </div>
                    <Badge tone={rewardTone(reward.status)}>{rewardLabel(reward.status)}</Badge>
                  </div>
                ))
              )}
            </section>

            {/* Point ledger */}
            <section className="gt-card flex flex-col gap-3.5">
              <h2 className="text-[18px] font-bold text-heading">Ride points history</h2>
              {data.ledger.length === 0 ? (
                <EmptyState
                  icon="list"
                  title="No points yet"
                  description="Your first point lands here as soon as a ride is completed."
                />
              ) : (
                data.ledger.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="truncate text-[14px] font-semibold text-heading">{formatDate(entry.createdAt)}</p>
                      <p className="truncate text-[11px] text-muted">
                        {reasonLabel(entry.reason)} · Balance {entry.balanceAfter}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[14px] font-bold ${
                        entry.delta >= 0 ? 'text-primary' : 'text-danger'
                      }`}
                    >
                      {entry.delta >= 0 ? `+${entry.delta}` : `−${Math.abs(entry.delta)}`}
                    </span>
                  </div>
                ))
              )}
            </section>

            <p className="text-center text-[11px] text-muted">
              {data.balance} points earned ·{' '}
              {data.freeRidesClaimed > 0
                ? `${data.freeRidesClaimed} reward${data.freeRidesClaimed === 1 ? '' : 's'} redeemed`
                : 'No rewards redeemed yet'}
            </p>
          </>
        )}
      </div>
    </>
  );
}

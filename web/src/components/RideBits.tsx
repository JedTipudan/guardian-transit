import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Avatar, Badge } from './ui';
import type { SerializedRide } from '../lib/types';
import { badgeTone, formatCurrency, formatDateTime, rideStatusLabel } from '../lib/format';

export function RideStatusBadge({ status }: { status: string }) {
  return <Badge tone={badgeTone(status)}>{rideStatusLabel(status)}</Badge>;
}

/** Compact ride row used in history and dashboards. */
export function RideCard({
  ride,
  to,
  showStudent = false,
  footer,
}: {
  ride: SerializedRide;
  to?: string;
  showStudent?: boolean;
  footer?: React.ReactNode;
}) {
  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
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

      <div className="flex items-center gap-3">
        <Avatar name={ride.driver.name} src={ride.driver.avatarUrl} size={36} />
        <div className="min-w-0 text-[12px] text-muted">
          <p className="truncate font-semibold text-heading">
            {ride.driver.name}
            {ride.driver.overallStatus === 'VERIFIED' ? ' ✓' : ''}
          </p>
          <p className="truncate">
            {ride.vehicle.nickname} {ride.vehicle.plateNumber}
            {showStudent ? ` · ${ride.student.name}` : ''}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[14px] font-bold text-heading">{formatCurrency(ride.fare)}</p>
          <p className="text-[11px] text-muted">{ride.freeRideApplied ? 'Free ride' : `${ride.distanceKm} km`}</p>
        </div>
      </div>

      {footer}
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-[20px] border border-border bg-white p-5 shadow-card transition hover:border-primary/40"
      >
        {body}
      </Link>
    );
  }

  return <div className="rounded-[20px] border border-border bg-white p-5 shadow-card">{body}</div>;
}

const stages = [
  { key: 'REQUESTED', label: 'Driver Arriving', icon: 'car' },
  { key: 'DRIVER_ARRIVED', label: 'Picked Up', icon: 'map-pin' },
  { key: 'PIN_VERIFIED', label: 'Verified', icon: 'key' },
  { key: 'IN_PROGRESS', label: 'On the Way', icon: 'navigation' },
  { key: 'COMPLETED', label: 'Arrived', icon: 'home' },
];

function stageState(stageKey: string, ride: SerializedRide): 'done' | 'current' | 'todo' {
  const order = stages.findIndex((stage) => stage.key === stageKey);
  const currentIndex = (() => {
    switch (ride.status) {
      case 'REQUESTED':
        return 0;
      case 'DRIVER_ASSIGNED':
        return 0;
      case 'DRIVER_ARRIVED':
        return 1;
      case 'PIN_VERIFIED':
        return 2;
      case 'IN_PROGRESS':
        return 3;
      case 'COMPLETED':
        return stages.length;
      default:
        return -1;
    }
  })();

  if (currentIndex > order) return 'done';
  if (currentIndex === order) return 'current';
  return 'todo';
}

function stageTime(stageKey: string, ride: SerializedRide): string {
  switch (stageKey) {
    case 'REQUESTED':
      return ride.acceptedAt ? formatDateTime(ride.acceptedAt) : 'Waiting';
    case 'DRIVER_ARRIVED':
      return ride.arrivedAt ? formatDateTime(ride.arrivedAt) : 'ETA soon';
    case 'PIN_VERIFIED':
      return ride.verifiedAt ? formatDateTime(ride.verifiedAt) : 'Pending PIN';
    case 'IN_PROGRESS':
      return ride.startedAt ? formatDateTime(ride.startedAt) : 'Not started';
    case 'COMPLETED':
      return ride.completedAt ? formatDateTime(ride.completedAt) : `ETA ${ride.durationMin} min`;
    default:
      return '';
  }
}

/** Trip progress rail — matches the Figma "Trip timeline" component. */
export function RideTimeline({ ride, compact = false }: { ride: SerializedRide; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {stages.map((stage) => {
        const state = stageState(stage.key, ride);
        return (
          <div key={stage.key} className="flex min-w-[96px] flex-1 flex-col gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                state === 'done'
                  ? 'bg-primary text-white'
                  : state === 'current'
                    ? 'bg-primary text-white ring-4 ring-primary-soft'
                    : 'bg-border text-muted'
              }`}
            >
              {state === 'done' ? (
                <Icon name="check" size={13} />
              ) : state === 'current' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              ) : (
                <Icon name={stage.icon} size={12} />
              )}
            </span>
            <span
              className={`text-[11px] leading-[1.5] ${
                state === 'current' ? 'font-semibold text-primary' : 'text-muted'
              }`}
            >
              {stage.label}
              {!compact ? (
                <>
                  <br />
                  {stageTime(stage.key, ride)}
                </>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Label + value row used across trip detail panels. */
export function DetailRow({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <p className="text-[13px] leading-[1.6] text-heading">
      <span className="text-muted">{label}</span>
      <br />
      <span className={strong ? 'font-bold' : 'font-semibold'}>{value}</span>
    </p>
  );
}

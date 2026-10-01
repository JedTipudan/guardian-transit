/** Small formatting helpers shared across screens. */

export function formatCurrency(value: number, currency = 'PHP'): string {
  const symbol = currency === 'PHP' ? '₱' : '$';
  return `${symbol}${Math.round(value).toLocaleString()}`;
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return 'Under 1 min';
  return `${Math.round(minutes)} min`;
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function rideStatusLabel(status: string): string {
  switch (status) {
    case 'REQUESTED':
      return 'Awaiting driver';
    case 'DRIVER_ASSIGNED':
      return 'Driver assigned';
    case 'DRIVER_ARRIVED':
      return 'Driver arrived';
    case 'PIN_VERIFIED':
      return 'Pickup verified';
    case 'IN_PROGRESS':
      return 'On the way';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    case 'NO_SHOW':
      return 'No show';
    default:
      return status;
  }
}

const EMERGENCY_TYPE_LABELS: Record<string, string> = {
  SOS_BUTTON: 'SOS alert',
  ROUTE_DEVIATION: 'Route deviation',
  ACCIDENT: 'Accident',
  VEHICLE_BREAKDOWN: 'Vehicle breakdown',
  STUDENT_UNSAFE: 'Student unsafe',
  OTHER: 'Other',
};

export function emergencyTypeLabel(type: string): string {
  const known = EMERGENCY_TYPE_LABELS[type];
  if (known) return known;
  const text = type.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function verificationStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'UNDER_REVIEW':
      return 'Under Review';
    case 'VERIFIED':
      return 'Verified';
    case 'REQUIRES_ACTION':
      return 'Requires Action';
    case 'REJECTED':
      return 'Rejected';
    default:
      return status;
  }
}

/** Maps a status string onto one of the design's badge colour families. */
export function badgeTone(status: string): 'primary' | 'success' | 'danger' | 'neutral' | 'warning' {
  switch (status) {
    case 'COMPLETED':
    case 'VERIFIED':
    case 'ACTIVE':
    case 'RESOLVED':
    case 'ACKNOWLEDGED':
      return 'success';
    case 'CANCELLED':
    case 'NO_SHOW':
    case 'REJECTED':
    case 'SUSPENDED':
    case 'DEACTIVATED':
      return 'danger';
    case 'UNDER_REVIEW':
    case 'REQUIRES_ACTION':
    case 'PENDING':
      return 'warning';
    case 'REQUESTED':
    case 'DRIVER_ASSIGNED':
    case 'DRIVER_ARRIVED':
    case 'PIN_VERIFIED':
    case 'IN_PROGRESS':
      return 'primary';
    default:
      return 'neutral';
  }
}

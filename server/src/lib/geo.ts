export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Urban average speed assumption used only for ETA estimates. */
export const AVG_SPEED_KPH = 26;

export function estimateMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / AVG_SPEED_KPH) * 60));
}

/** Straight-line distance is a floor for routing distance; road factor approximates real routes. */
export function estimateRoute(from: LatLng, to: LatLng) {
  const straight = haversineKm(from, to);
  const distanceKm = Math.max(0.4, straight * 1.32);
  return { distanceKm: Number(distanceKm.toFixed(2)), durationMin: estimateMinutes(distanceKm) };
}

export function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLng(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRadians(a.lat);
  const φ2 = toRadians(b.lat);
  const Δλ = toRadians(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

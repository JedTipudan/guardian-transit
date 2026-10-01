import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './Icon';
import { useMeta } from '../state/MetaContext';

/**
 * Map renderer.
 *
 * The Figma source ships a vector neighbourhood map (green blocks, white
 * streets, a blue route and label chips), so the default renderer reproduces
 * exactly that look while plotting **real** coordinates. The provider is
 * selectable at runtime through `/api/meta` (`maps.provider` + `maps.tileUrl`);
 * when a raster provider is configured the tiles are drawn underneath the same
 * marker layer, so switching engines never changes the surrounding UI.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker extends LatLng {
  id: string;
  label: string;
  kind: 'pickup' | 'destination' | 'student' | 'driver' | 'poi' | 'alert';
}

export interface MapCanvasProps {
  pickup?: (LatLng & { label?: string }) | null;
  destination?: (LatLng & { label?: string }) | null;
  driver?: (LatLng & { label?: string }) | null;
  student?: (LatLng & { label?: string }) | null;
  /** Live telemetry trace — drawn on top of the planned route. */
  trace?: LatLng[];
  markers?: MapMarker[];
  height?: number | string;
  /** e.g. "Updated 3:42 PM · 5 sec ago" — omitted when there is no fresh fix. */
  freshness?: string | null;
  live?: boolean;
  interactive?: boolean;
  className?: string;
  /** Shown when we have nothing to plot yet. */
  hint?: string;
  children?: ReactNode;
  tileUrl?: string | null;
  attribution?: string | null;
}

interface Projected {
  x: number;
  y: number;
}

const MAP_W = 1000;
const MAP_H = 560;

function useProjection(points: LatLng[], zoom: number) {
  return useMemo(() => {
    if (points.length === 0) {
      return (_point: LatLng): Projected => ({ x: MAP_W / 2, y: MAP_H / 2 });
    }

    let minLat = Math.min(...points.map((p) => p.lat));
    let maxLat = Math.max(...points.map((p) => p.lat));
    let minLng = Math.min(...points.map((p) => p.lng));
    let maxLng = Math.max(...points.map((p) => p.lng));

    const latSpan = Math.max(maxLat - minLat, 0.0018);
    const lngSpan = Math.max(maxLng - minLng, 0.0024);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Zoom in by shrinking the visible window around its centre.
    const factor = 1 / zoom;
    minLat = centerLat - (latSpan * factor) / 2;
    maxLat = centerLat + (latSpan * factor) / 2;
    minLng = centerLng - (lngSpan * factor) / 2;
    maxLng = centerLng + (lngSpan * factor) / 2;

    const padX = 90;
    const padY = 70;

    return (point: LatLng): Projected => {
      const rx = (point.lng - minLng) / (maxLng - minLng || 1);
      const ry = (point.lat - minLat) / (maxLat - minLat || 1);
      const clampedX = Math.min(1, Math.max(0, rx));
      const clampedY = Math.min(1, Math.max(0, 1 - ry));
      return {
        x: padX + clampedX * (MAP_W - padX * 2),
        y: padY + clampedY * (MAP_H - padY * 2),
      };
    };
  }, [points, zoom]);
}

function smoothPath(coords: Projected[]): string {
  if (coords.length < 2) return '';
  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i += 1) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    d += ` Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  return d;
}

function markerClass(kind: MapMarker['kind']): string {
  switch (kind) {
    case 'pickup':
      return 'bg-white text-heading';
    case 'destination':
      return 'bg-white text-primary ring-1 ring-primary';
    case 'student':
      return 'bg-navy text-white';
    case 'driver':
      return 'bg-primary text-white';
    case 'alert':
      return 'bg-danger text-white';
    default:
      return 'bg-white text-heading';
  }
}

export function MapCanvas({
  pickup,
  destination,
  driver,
  student,
  trace = [],
  markers = [],
  height = 390,
  freshness,
  live = false,
  interactive = true,
  className = '',
  hint,
  children,
  tileUrl = null,
  attribution = null,
}: MapCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const meta = useMeta();
  const resolvedTileUrl = tileUrl ?? meta?.maps.tileUrl ?? null;
  const resolvedAttribution = attribution ?? meta?.maps.attribution ?? null;

  // --- Leaflet map (only when tileUrl is provided) ---
  const leafletRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const hasViewRef = useRef(false);

  useEffect(() => {
    if (!resolvedTileUrl || !leafletRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(leafletRef.current, {
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer(resolvedTileUrl, { attribution: resolvedAttribution ?? '' }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Remove previous dynamic layers
    for (const layer of layersRef.current) map.removeLayer(layer);
    layersRef.current = [];

    const points: L.LatLngExpression[] = [];

    const addMarker = (pos: LatLng, color: string, label: string) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)">${label}</div>`,
        iconAnchor: [0, 0],
      });
      const m = L.marker([pos.lat, pos.lng], { icon }).addTo(map);
      layersRef.current.push(m);
      points.push([pos.lat, pos.lng]);
    };

    if (pickup) addMarker(pickup, '#172B45', pickup.label ?? 'Pickup');
    if (destination) addMarker(destination, '#2463EB', destination.label ?? 'Destination');
    if (student) addMarker(student, '#102846', student.label ?? 'Student');
    if (driver) addMarker(driver, '#2463EB', driver.label ?? 'Driver');
    for (const m of markers) addMarker(m, m.kind === 'alert' ? '#CC3344' : '#172B45', m.label);

    if (trace.length >= 2) {
      const poly = L.polyline(trace.map((p) => [p.lat, p.lng] as L.LatLngExpression), {
        color: '#102846',
        weight: 3,
        dashArray: '10 8',
        opacity: 0.55,
      }).addTo(map);
      layersRef.current.push(poly);
    }

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      hasViewRef.current = true;
    } else if (!hasViewRef.current) {
      map.setView([14.5995, 120.9842], 13); // Manila default
      hasViewRef.current = true;
    }

    return () => {
      // layers cleaned up on next run; map persists for the lifetime of the component
    };
  }, [resolvedTileUrl, resolvedAttribution, pickup, destination, driver, student, trace, markers]);

  // Destroy Leaflet map when tileUrl is removed or component unmounts
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const allPoints = useMemo<LatLng[]>(() => {
    const list: LatLng[] = [];
    if (pickup) list.push(pickup);
    if (destination) list.push(destination);
    if (driver) list.push(driver);
    if (student) list.push(student);
    for (const point of trace) list.push(point);
    for (const marker of markers) list.push(marker);
    return list;
  }, [pickup, destination, driver, student, trace, markers]);

  const project = useProjection(allPoints, zoom);

  const hasPoints = allPoints.length > 0;

  const plannedRoute = useMemo(() => {
    const anchors: LatLng[] = [];
    if (driver) anchors.push(driver);
    else if (student) anchors.push(student);
    else if (pickup) anchors.push(pickup);
    if (pickup && !driver && !student) anchors.push(pickup);
    if (destination) anchors.push(destination);
    const unique = anchors.filter(
      (anchor, index) => index === 0 || anchor.lat !== anchors[index - 1].lat || anchor.lng !== anchors[index - 1].lng,
    );
    if (unique.length < 2) return '';
    return smoothPath(unique.map(project));
  }, [driver, student, pickup, destination, project]);

  const tracePath = useMemo(() => {
    if (trace.length < 2) return '';
    return smoothPath(trace.map(project));
  }, [trace, project]);

  // Chips are rendered as HTML so typography and colours come straight from CSS.
  const chipHtml = (marker: MapMarker): ReactNode => {
    const point = project(marker);
    const leftPct = (point.x / MAP_W) * 100;
    const topPct = (point.y / MAP_H) * 100;
    return (
      <span
        key={marker.id}
        className={`absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] px-2 py-1 text-[11px] font-semibold leading-none ${markerClass(
          marker.kind,
        )}`}
        style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      >
        {marker.label}
        <span
          className={`absolute left-1/2 top-full h-2 w-px -translate-x-1/2 ${
            marker.kind === 'student' ? 'bg-navy' : marker.kind === 'driver' ? 'bg-primary' : 'bg-heading/40'
          }`}
        />
      </span>
    );
  };

  const chips: MapMarker[] = [];
  if (pickup) chips.push({ ...pickup, id: 'pickup', kind: 'pickup', label: pickup.label ?? 'Pickup' });
  if (destination)
    chips.push({ ...destination, id: 'destination', kind: 'destination', label: destination.label ?? 'Destination' });
  if (student)
    chips.push({ lat: student.lat, lng: student.lng, id: 'student', kind: 'student', label: student.label ?? 'Student' });
  if (driver) chips.push({ lat: driver.lat, lng: driver.lng, id: 'driver', kind: 'driver', label: driver.label ?? 'BaoBao' });
  chips.push(...markers);

  return (
    <div
      className={`relative rounded-[20px] bg-map ${resolvedTileUrl ? '' : 'overflow-hidden'} ${className}`}
      style={{ height }}
      role="img"
      aria-label={hint ?? 'Trip map'}
    >
      {/* --- Leaflet map (real slippy map when tileUrl is set) ----------- */}
      {resolvedTileUrl ? (
        <div ref={leafletRef} className="absolute inset-0" />
      ) : null}

      {/* --- vector base ------------------------------------------------- */}
      {!resolvedTileUrl ? (
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <rect width={MAP_W} height={MAP_H} fill="#E9F0EB" />

          {/* Parks / school grounds */}
          <rect x={40} y={300} width={200} height={112} rx={12} fill="#D0E5D5" />
          <rect x={740} y={250} width={210} height={116} rx={12} fill="#D0E5D5" />
          <rect x={520} y={40} width={120} height={80} rx={12} fill="#D0E5D5" opacity={0.75} />

          {/* Streets */}
          <rect x={0} y={196} width={MAP_W} height={16} fill="#FFFFFF" />
          <rect x={0} y={368} width={MAP_W} height={16} fill="#FFFFFF" />
          <rect x={0} y={78} width={MAP_W} height={12} fill="#FFFFFF" opacity={0.9} />
          <rect x={320} y={0} width={16} height={MAP_H} fill="#FFFFFF" />
          <rect x={700} y={0} width={16} height={MAP_H} fill="#FFFFFF" />
          <rect x={128} y={0} width={12} height={MAP_H} fill="#FFFFFF" opacity={0.85} />

          {/* Route + live trace */}
          {plannedRoute ? (
            <path
              d={plannedRoute}
              fill="none"
              stroke="#2463EB"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          ) : null}
          {tracePath ? (
            <path
              d={tracePath}
              fill="none"
              stroke="#102846"
              strokeWidth={3}
              strokeDasharray="10 8"
              strokeLinecap="round"
              opacity={0.55}
            />
          ) : null}

          {/* Point pips */}
          {pickup ? (
            <circle cx={project(pickup).x} cy={project(pickup).y} r={7} fill="#FFFFFF" stroke="#172B45" strokeWidth={3} />
          ) : null}
          {destination ? (
            <circle cx={project(destination).x} cy={project(destination).y} r={7} fill="#FFFFFF" stroke="#2463EB" strokeWidth={3} />
          ) : null}
          {student ? (
            <circle cx={project(student).x} cy={project(student).y} r={9} fill="#102846" stroke="#FFFFFF" strokeWidth={3} />
          ) : null}
          {driver ? (
            <circle cx={project(driver).x} cy={project(driver).y} r={9} fill="#2463EB" stroke="#FFFFFF" strokeWidth={3} />
          ) : null}
          {markers.map((marker) => (
            <circle
              key={`pip-${marker.id}`}
              cx={project(marker).x}
              cy={project(marker).y}
              r={6}
              fill={marker.kind === 'alert' ? '#CC3344' : '#FFFFFF'}
              stroke={marker.kind === 'alert' ? '#FFFFFF' : '#172B45'}
              strokeWidth={3}
            />
          ))}
        </svg>
      ) : null}

      {/* --- label chips (HTML so CSS tokens apply) ---------------------- */}
      <div className={`absolute inset-0 ${resolvedTileUrl ? 'pointer-events-none' : ''}`}>
        {hasPoints && interactive && !resolvedTileUrl ? chips.map(chipHtml) : null}
        {!hasPoints && hint ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <span className="rounded-[12px] bg-white/85 px-4 py-2 text-[12px] text-muted">{hint}</span>
          </div>
        ) : null}
      </div>

      {/* --- controls ---------------------------------------------------- */}
      {interactive && !resolvedTileUrl ? (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2 rounded-[8px] bg-white p-1.5 shadow-card">
          <button
            type="button"
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-heading transition hover:bg-canvas-alt"
            onClick={() => setZoom((value) => Math.min(3, Number((value + 0.35).toFixed(2))))}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-heading transition hover:bg-canvas-alt"
            onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.35).toFixed(2))))}
          >
            <Icon name="minus" size={16} />
          </button>
        </div>
      ) : null}

      {/* --- freshness --------------------------------------------------- */}
      {freshness ? (
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-[8px] bg-white px-2.5 py-[7px]">
          <span className={`relative inline-block h-1.5 w-1.5 rounded-full ${live ? 'bg-success gt-pulse-dot text-success' : 'bg-muted'}`} />
          <span className="text-[10px] text-muted">{freshness}</span>
        </div>
      ) : null}

      {resolvedAttribution ? (
        <span className="absolute bottom-1.5 right-2 text-[9px] text-muted/80">{resolvedAttribution}</span>
      ) : null}

      {children}
    </div>
  );
}

/** Compact legend matching the Figma caption row under each map. */
export function MapLegend({ active = true }: { active?: boolean }) {
  return (
    <p className="text-[12px] text-muted">
      <span className="text-navy">●</span> Child location&nbsp;&nbsp;
      <span className="text-primary">●</span> BaoBao location&nbsp;&nbsp;
      <span className="text-heading">◇</span> Destination&nbsp;&nbsp;
      <span className="text-primary">──</span> Route
      {active ? null : <span className="ml-2 text-danger">· Location sharing is not active</span>}
    </p>
  );
}

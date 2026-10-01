import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { MapCanvas } from '../../components/MapCanvas';
import { Icon } from '../../components/Icon';
import { Badge, Button, EmptyState, Modal, Notice, Skeleton, Spinner, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDebounced, useDocumentTitle, useMutation } from '../../lib/hooks';
import { formatTime } from '../../lib/format';
import type { GeocodeResult, SavedLocation } from '../../lib/types';
import { useCurrentUser } from '../../state/AuthContext';
import { useBooking } from '../../state/BookingContext';
import { useToast } from '../../state/ToastContext';

type GeoState = 'idle' | 'locating' | 'denied' | 'unavailable' | 'unsupported';

function placeIcon(kind: string): string {
  return kind.toUpperCase() === 'HOME' ? 'home' : 'map-pin';
}

function geocodeToPlace(result: GeocodeResult): SavedLocation {
  return {
    id: result.id,
    kind: result.source.toUpperCase(),
    label: result.label,
    address: result.address,
    lat: result.lat,
    lng: result.lng,
  };
}

/** Step 1 of booking: choose where the driver picks the student up. */
export default function StudentBookPickup() {
  useDocumentTitle('Book · Pickup · Guardian Transit');

  const booking = useBooking();
  const user = useCurrentUser();
  const { push } = useToast();
  const navigate = useNavigate();

  const studentId = booking.studentId ?? user?.studentProfile?.id ?? null;
  const { setStudent } = booking;

  const [selected, setSelected] = useState<SavedLocation | null>(booking.pickup);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query.trim(), 350);

  const [geo, setGeo] = useState<GeoState>('idle');
  const [fix, setFix] = useState<{ lat: number; lng: number; at: number } | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');

  // Keep the booking context in sync with the profile we resolved.
  useEffect(() => {
    if (studentId && booking.studentId !== studentId) setStudent(studentId);
  }, [studentId, booking.studentId, setStudent]);

  const saved = useAsync<SavedLocation[]>(
    async (signal) =>
      (await api.get<{ locations: SavedLocation[] }>('/rides/saved-locations', {
        query: { studentId },
        signal,
      })).locations,
    [studentId],
    { enabled: Boolean(studentId) },
  );

  const searching = debouncedQuery.length >= 2;
  const search = useAsync<GeocodeResult[]>(
    async (signal) =>
      (await api.get<{ results: GeocodeResult[] }>('/rides/geocode', {
        query: { q: debouncedQuery, studentId },
        signal,
      })).results,
    [debouncedQuery, studentId],
    { enabled: searching },
  );

  const save = useMutation(async (place: SavedLocation) =>
    api.post<{ location: SavedLocation }>('/rides/saved-locations', {
      studentId,
      kind: 'OTHER',
      label: saveLabel.trim() || place.label,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
    }),
  );

  function locate() {
    if (!('geolocation' in navigator)) {
      setGeo('unsupported');
      return;
    }
    setGeo('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const at = position.timestamp;
        setFix({ lat, lng, at });
        setGeo('idle');
        setSelected({
          id: `gps:${at}`,
          kind: 'CURRENT',
          label: 'Current location',
          address: `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)} · ${formatTime(at)}`,
          lat,
          lng,
        });
      },
      (error) => setGeo(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }

  function pick(place: SavedLocation) {
    setSelected(place);
    setQuery('');
  }

  async function onSave() {
    if (!selected || saveLabel.trim().length === 0) return;
    const result = await save.run(selected);
    if (result) {
      push('Place saved for next time.', 'success');
      setSaveOpen(false);
      setSaveLabel('');
      saved.reload();
    }
  }

  function onContinue() {
    if (!selected) return;
    booking.setPickup(selected);
    navigate('/student/book/destination');
  }

  const resultRows = search.data ?? [];

  return (
    <>
      <StudentHeader
        title="Book a BaoBao"
        subtitle="Where are you heading after school?"
        backTo="/student"
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

      <div className="flex flex-col gap-5 px-5 pb-6 pt-4">
        <Badge tone="primary">1 · ROUTE&nbsp;&nbsp;/&nbsp;&nbsp;2 · DRIVER</Badge>

        {!studentId ? (
          <Notice tone="neutral" icon="info" title="No student profile on this account">
            Saved places are unavailable because this account is not linked to a student profile.
          </Notice>
        ) : null}

        <TextField
          id="pickup-search"
          label="Pickup location"
          leadingIcon="search"
          placeholder="Search an address or saved place"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          hint="Meet your driver at the designated student pickup area."
          trailing={search.loading ? <Spinner size={15} /> : undefined}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" icon="navigation" loading={geo === 'locating'} onClick={locate}>
            Use current location
          </Button>
          {geo === 'denied' ? (
            <p className="gt-error-text">Location permission required — allow access or search for the address.</p>
          ) : geo === 'unavailable' ? (
            <p className="gt-hint">GPS unavailable — search for the address instead.</p>
          ) : geo === 'unsupported' ? (
            <p className="gt-hint">This device can’t share a location — search instead.</p>
          ) : fix ? (
            <p className="gt-hint">
              Located {formatTime(fix.at)} · {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
            </p>
          ) : null}
        </div>

        {selected ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-border bg-white p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
              <Icon name="map-pin" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-heading">{selected.label}</span>
              <span className="block truncate text-[12px] text-muted">{selected.address}</span>
            </span>
            <button
              type="button"
              aria-label="Clear pickup location"
              onClick={() => setSelected(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-muted transition hover:bg-canvas-alt hover:text-heading"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ) : null}

        {searching ? (
          <div className="flex flex-col gap-2">
            <p className="gt-eyebrow">Search results</p>
            {search.loading ? (
              <>
                <Skeleton height={54} className="rounded-[12px]" />
                <Skeleton height={54} className="rounded-[12px]" />
              </>
            ) : search.error ? (
              <div className="flex flex-col items-start gap-2 rounded-[12px] border border-border bg-white p-3.5">
                <p className="gt-error-text">{search.error}</p>
                <Button variant="secondary" size="sm" icon="refresh-cw" onClick={search.reload}>
                  Try again
                </Button>
              </div>
            ) : resultRows.length === 0 ? (
              <p className="gt-hint">No matches for “{debouncedQuery}”. Try a different search.</p>
            ) : (
              resultRows.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => pick(geocodeToPlace(result))}
                  className="flex w-full items-center gap-3 rounded-[12px] border border-border bg-white p-3 text-left transition hover:border-primary/40"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-canvas-alt text-muted">
                    <Icon name={result.source === 'geocoder' ? 'route' : 'map-pin'} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-heading">{result.label}</span>
                    <span className="block truncate text-[11px] text-muted">{result.address}</span>
                  </span>
                  <Icon name="chevron-right" size={15} className="shrink-0 text-muted" />
                </button>
              ))
            )}
          </div>
        ) : null}

        <MapCanvas
          pickup={selected ? { lat: selected.lat, lng: selected.lng, label: selected.label } : null}
          height={210}
          hint="Pick a pickup point to preview it here."
        />

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-heading">Saved places</h2>
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              disabled={!selected}
              onClick={() => {
                setSaveLabel(selected?.label ?? '');
                setSaveOpen(true);
              }}
            >
              Save this place
            </Button>
          </div>

          {!studentId ? (
            <EmptyState
              icon="map-pin"
              title="Saved places unavailable"
              description="Link this account to a student profile to see saved places."
            />
          ) : saved.loading ? (
            <>
              <Skeleton height={56} className="rounded-[20px]" />
              <Skeleton height={56} className="rounded-[20px]" />
            </>
          ) : saved.error ? (
            <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-white px-5 py-8 text-center">
              <p className="max-w-xs text-[13px] text-muted">{saved.error}</p>
              <Button variant="secondary" icon="refresh-cw" onClick={saved.reload}>
                Try again
              </Button>
            </div>
          ) : (saved.data ?? []).length === 0 ? (
            <EmptyState
              icon="map-pin"
              title="No saved places yet"
              description="Search for a place above, then save it here to book it faster next time."
            />
          ) : (
            <div className="gt-card flex flex-col gap-3">
              {(saved.data ?? []).map((place) => {
                const active = selected?.id === place.id;
                return (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => pick(place)}
                    className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition ${
                      active ? 'border-primary bg-primary-soft' : 'border-border bg-white hover:border-primary/40'
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${active ? 'bg-white text-primary' : 'bg-canvas-alt text-muted'}`}>
                      <Icon name={placeIcon(place.kind)} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-heading">{place.label}</span>
                      <span className="block truncate text-[11px] text-muted">{place.address}</span>
                    </span>
                    {active ? <Icon name="check" size={16} className="shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <Notice tone="primary" icon="shield-check" title="A connected ride from start to finish">
          Your guardian is notified when your ride starts. Live sharing ends when you arrive.
        </Notice>

        <Button block icon="arrow-right" disabled={!selected} onClick={onContinue}>
          Continue to destination
        </Button>
      </div>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this place"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.pending}
              disabled={saveLabel.trim().length === 0}
              onClick={() => void onSave()}
            >
              Save place
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            id="save-place-label"
            label="Name"
            value={saveLabel}
            onChange={(event) => setSaveLabel(event.target.value)}
            placeholder="e.g. Home, School, Library"
            maxLength={80}
            error={save.error}
            hint="Saved places show up as quick options while booking."
          />
          {selected ? (
            <p className="gt-hint">
              {selected.label} · {selected.address}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

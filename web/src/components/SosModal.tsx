import { useCallback, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { EmergencyEvent, Hotline } from '../lib/types';
import { useMeta } from '../state/MetaContext';
import { useToast } from '../state/ToastContext';
import { Button, Modal, Notice, Spinner, Toggle } from './ui';
import { Icon } from './Icon';

type Stage = 'confirm' | 'sending' | 'done' | 'error';
type GeoState = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';

interface Props {
  open: boolean;
  onClose: () => void;
  rideId?: string | null;
  /** What the alert is about, e.g. "on ride GT-1001". */
  context?: string;
  onRaised?: (emergency: EmergencyEvent) => void;
}

/**
 * SOS flow: real geolocation, admin-configured hotlines (never hard-coded),
 * guardian contact + live location sharing, and a persisted EmergencyEvent.
 */
export function SosModal({ open, onClose, rideId = null, context, onRaised }: Props) {
  const meta = useMeta();
  const { push } = useToast();

  const [stage, setStage] = useState<Stage>('confirm');
  const [message, setMessage] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const [contactGuardian, setContactGuardian] = useState(true);
  const [geo, setGeo] = useState<GeoState>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    emergency: EmergencyEvent;
    hotline: Hotline | null;
    guardianContact: string | null;
    message: string;
  } | null>(null);

  const hotlines: Hotline[] = meta?.hotlines ?? [];

  const locate = useCallback(() => {
    return new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!('geolocation' in navigator)) {
        setGeo('unavailable');
        resolve(null);
        return;
      }
      setGeo('locating');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const point = { lat: position.coords.latitude, lng: position.coords.longitude };
          setCoords(point);
          setGeo('ok');
          resolve(point);
        },
        (positionError) => {
          setGeo(positionError.code === positionError.PERMISSION_DENIED ? 'denied' : 'unavailable');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });
  }, []);

  const submit = useCallback(async () => {
    setStage('sending');
    setError(null);

    let point = coords;
    if (shareLocation) {
      if (!point) point = await locate();
      if (!point && geo === 'denied') {
        // Permission denied is an honest, non-blocking outcome: the alert still goes out.
      }
    }

    try {
      const payload = await api.post<{
        emergency: EmergencyEvent;
        hotline: Hotline | null;
        guardianContact: string | null;
        message: string;
      }>('/emergency', {
        type: 'SOS_BUTTON',
        message: message.trim() || undefined,
        rideId,
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        shareLocation: Boolean(shareLocation && point),
        contactGuardian,
      });
      setResult(payload);
      setStage('done');
      onRaised?.(payload.emergency);
      push('Emergency alert sent to the safety desk.', 'success');
    } catch (cause) {
      setError(errorMessage(cause, 'We could not send your alert. Try again.'));
      setStage('error');
    }
  }, [coords, shareLocation, geo, message, rideId, contactGuardian, onRaised, push, locate]);

  const close = () => {
    onClose();
    // Reset once the dialog is fully closed so reopening starts clean.
    window.setTimeout(() => {
      setStage('confirm');
      setError(null);
      setResult(null);
      setMessage('');
    }, 200);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={stage === 'done' ? 'Alert sent' : 'Emergency · SOS'}
      size="sm"
      footer={
        stage === 'done' ? (
          <Button onClick={close}>Close</Button>
        ) : stage === 'sending' ? (
          <Button loading>Sending…</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" icon="siren" onClick={() => void submit()}>
              Send SOS alert
            </Button>
          </>
        )
      }
    >
      {stage === 'done' && result ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success" icon="check-circle" title="Help is on the way">
            {result.message}
          </Notice>
          <div className="rounded-[12px] border border-border bg-canvas-alt p-4 text-[13px] text-muted">
            <p className="mb-2 font-bold text-heading">What was shared</p>
            <ul className="flex flex-col gap-1.5">
              <li className="flex items-start gap-2">
                <Icon name="shield-alert" size={15} className="mt-0.5 shrink-0 text-danger" />
                Alert logged as {result.emergency.type.replace('_', ' ').toLowerCase()} for the safety desk.
              </li>
              <li className="flex items-start gap-2">
                <Icon name="map-pin" size={15} className="mt-0.5 shrink-0 text-primary" />
                {result.emergency.sharedWithGuardian
                  ? 'Your live location was attached and shared.'
                  : 'No location was attached (location sharing is off or unavailable).'}
              </li>
              <li className="flex items-start gap-2">
                <Icon name="phone-call" size={15} className="mt-0.5 shrink-0 text-primary" />
                {result.guardianContact
                  ? `Guardian notified: ${result.guardianContact}`
                  : 'No guardian contact was available for this trip.'}
              </li>
            </ul>
          </div>
          {result.hotline ? (
            <div className="rounded-[12px] bg-danger-soft p-4">
              <p className="text-[12px] text-muted">{result.hotline.label}</p>
              <a
                href={`tel:${result.hotline.number.replace(/\s+/g, '')}`}
                className="text-[20px] font-bold text-danger"
              >
                {result.hotline.number}
              </a>
              {result.hotline.description ? (
                <p className="mt-1 text-[12px] text-muted">{result.hotline.description}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-[12px] text-muted">
              No hotline number is configured yet — your administrator can add one in Safety Desk → Settings.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="danger" icon="siren" title="Send an emergency alert?">
            The safety desk is notified immediately{context ? ` ${context}` : ''}. Your guardian is contacted too.
          </Notice>

          <label className="flex items-start gap-3 text-[13px] text-heading">
            <span className="pt-0.5">
              <Toggle checked={shareLocation} onChange={setShareLocation} label="Share live location" />
            </span>
            <span>
              <span className="font-semibold">Share my live location</span>
              <span className="block text-[12px] text-muted">
                Uses your device GPS. You will be asked for permission.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-[13px] text-heading">
            <span className="pt-0.5">
              <Toggle checked={contactGuardian} onChange={setContactGuardian} label="Contact guardian" />
            </span>
            <span>
              <span className="font-semibold">Contact my guardian</span>
              <span className="block text-[12px] text-muted">Sends the alert to connected guardians.</span>
            </span>
          </label>

          <div className="gt-field">
            <label className="gt-label" htmlFor="sos-message">
              What happened? (optional)
            </label>
            <textarea
              id="sos-message"
              className="gt-input min-h-[80px] resize-y"
              maxLength={500}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. driver took an unexpected turn"
            />
          </div>

          {shareLocation ? (
            <div className="flex items-center gap-2 rounded-[12px] bg-canvas-alt px-3 py-2.5 text-[12px] text-muted">
              {geo === 'locating' ? (
                <>
                  <Spinner size={14} /> Getting your location…
                </>
              ) : geo === 'ok' && coords ? (
                <>
                  <Icon name="check-circle" size={14} className="text-success" />
                  Location ready · {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                </>
              ) : geo === 'denied' ? (
                <>
                  <Icon name="alert-triangle" size={14} className="text-warning" />
                  Location permission denied — the alert will be sent without a position.
                </>
              ) : geo === 'unavailable' ? (
                <>
                  <Icon name="alert-triangle" size={14} className="text-warning" />
                  GPS unavailable on this device — the alert will be sent without a position.
                </>
              ) : (
                <>
                  <Icon name="map-pin" size={14} />
                  We will ask for your location when you send.
                </>
              )}
            </div>
          ) : null}

          {hotlines.length > 0 ? (
            <div className="rounded-[12px] border border-border p-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Emergency contacts</p>
              {hotlines.map((line) => (
                <a
                  key={line.key}
                  href={`tel:${line.number.replace(/\s+/g, '')}`}
                  className="flex items-center justify-between gap-3 py-1.5 text-[13px] text-heading hover:text-primary"
                >
                  <span>{line.label}</span>
                  <span className="font-bold">{line.number}</span>
                </a>
              ))}
            </div>
          ) : null}

          {error ? <p className="gt-error-text">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}

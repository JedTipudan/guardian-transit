import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { StudentHeader } from '../../components/layout/StudentShell';
import { Icon } from '../../components/Icon';
import { SosModal } from '../../components/SosModal';
import { RideStatusBadge } from '../../components/RideBits';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Notice,
  SegmentedControl,
  SelectField,
  Skeleton,
  TextField,
  TextareaField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { badgeTone, emergencyTypeLabel, formatDateTime } from '../../lib/format';
import type { EmergencyEvent, Hotline, SafetyCategory, SafetyReport, SerializedRide } from '../../lib/types';
import { useAuth } from '../../state/AuthContext';
import { useMeta } from '../../state/MetaContext';
import { useNotifications } from '../../state/NotificationsContext';

interface LinkedGuardian {
  id: string;
  name: string;
  phone: string;
}

type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

const WAITING_TIPS = [
  'Stay on the line and keep your phone unlocked so the safety desk can reach you.',
  'Move to a well-lit, populated spot if it is safe to walk there.',
  'Tell your guardian where you are — location is shared during an active ride only.',
  'Never share your ride PIN with anyone other than your driver.',
  'Note the plate number and the driver’s name if you can do it safely.',
];

function sentence(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Student emergency: SOS, live ride context, hotlines, safety reporting. */
export default function StudentEmergency() {
  useDocumentTitle('Emergency · Guardian Transit');
  const { user } = useAuth();
  const meta = useMeta();
  const { unread } = useNotifications();

  const studentId = user?.studentProfile?.id ?? null;

  const active = useAsync<{ ride: SerializedRide | null }>((signal) =>
    api.get<{ ride: SerializedRide | null }>('/rides/active', { signal }),
  );
  const guardians = useAsync<{ guardians: LinkedGuardian[] }>(
    (signal) =>
      api.get<{ guardians: LinkedGuardian[] }>(`/guardians/students/${studentId}/guardians`, { signal }),
    [studentId],
    { enabled: Boolean(studentId) },
  );
  const alerts = useAsync<{ emergencies: EmergencyEvent[] }>((signal) =>
    api.get<{ emergencies: EmergencyEvent[] }>('/emergency', { query: { mine: true }, signal }),
  );
  const categories = useAsync<{ categories: SafetyCategory[] }>((signal) =>
    api.get<{ categories: SafetyCategory[] }>('/safety/categories', { signal }),
  );
  const reports = useAsync<{ reports: SafetyReport[] }>((signal) =>
    api.get<{ reports: SafetyReport[] }>('/safety/mine', { signal }),
  );
  // Meta arrives from the shared provider; this query only covers the case where it failed.
  const hotlineQuery = useAsync<{ hotlines: Hotline[] }>(
    (signal) => api.get<{ hotlines: Hotline[] }>('/emergency/hotlines', { signal }),
    [],
    { enabled: meta === null },
  );

  const ride = active.data?.ride ?? null;
  const leadGuardian = guardians.data?.guardians[0] ?? null;
  const hotlines: Hotline[] = meta?.hotlines ?? hotlineQuery.data?.hotlines ?? [];
  const hotlinesLoading = meta === null && hotlineQuery.loading;
  const hotlinesError = meta === null ? hotlineQuery.error : null;

  const [sosOpen, setSosOpen] = useState(false);
  const [form, setForm] = useState({ category: '', subject: '', description: '', severity: 'MEDIUM' as Severity });
  const [formErrors, setFormErrors] = useState<{ category?: string; subject?: string; description?: string }>({});
  const [success, setSuccess] = useState<string | null>(null);

  const submitReport = useMutation(
    async (body: { category: string; subject: string; description: string; severity: Severity; rideId: string | null }) =>
      api.post<{ report: { id: string }; message: string }>('/safety', body),
  );

  const recentAlerts = alerts.data?.emergencies ?? [];
  const myReports = reports.data?.reports ?? [];

  function categoryLabel(value: string): string {
    return categories.data?.categories.find((entry) => entry.value === value)?.label ?? sentence(value);
  }

  async function onSubmitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: { category?: string; subject?: string; description?: string } = {};
    if (!form.category) next.category = 'Pick what this report is about.';
    const subject = form.subject.trim();
    if (subject.length < 4) next.subject = 'Add a short title (at least 4 characters).';
    else if (subject.length > 120) next.subject = 'Keep the title under 120 characters.';
    const description = form.description.trim();
    if (description.length < 10) next.description = 'Describe what happened (at least 10 characters).';
    else if (description.length > 1500) next.description = 'Keep the description under 1500 characters.';
    setFormErrors(next);
    if (Object.keys(next).length > 0) return;

    setSuccess(null);
    const result = await submitReport.run({
      category: form.category,
      subject,
      description,
      severity: form.severity,
      rideId: ride?.id ?? null,
    });
    if (result) {
      setSuccess(result.message);
      setForm({ category: '', subject: '', description: '', severity: 'MEDIUM' });
      setFormErrors({});
      reports.reload();
    }
  }

  return (
    <>
      <StudentHeader
        title="Emergency / SOS"
        subtitle="Help when you need it"
        backTo="/student"
        right={
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
        }
      />

      <div className="flex flex-col gap-[22px] px-5 pb-7 pt-[18px]">
        {/* Emblem */}
        <section className="gt-card flex flex-col items-center gap-4 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-danger-soft text-danger">
            <Icon name="siren" size={42} />
          </span>
          <div>
            <h2 className="text-[23px] font-bold leading-[1.45] text-heading">Help when you need it.</h2>
            <p className="mt-1 text-[14px] leading-[1.45] text-muted">
              If you are in immediate danger, call your local emergency service.
            </p>
          </div>
        </section>

        {/* Active ride context */}
        <section className="gt-card flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-heading">Your active ride</h2>
            {ride ? <RideStatusBadge status={ride.status} /> : null}
          </div>

          {active.loading ? (
            <>
              <Skeleton height={16} className="w-1/3" />
              <Skeleton height={54} className="rounded-[12px]" />
              <Skeleton height={54} className="rounded-[12px]" />
            </>
          ) : active.error ? (
            <ErrorState
              title="We could not load your active ride"
              message={active.error}
              onRetry={active.reload}
            />
          ) : ride ? (
            <>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-start gap-2.5 rounded-[12px] bg-canvas-alt px-3.5 py-3">
                  <Icon name="map-pin" size={16} className="mt-0.5 shrink-0 text-primary" />
                  <p className="text-[13px] leading-[1.55] text-heading">
                    <span className="block text-[12px] text-muted">Student &amp; current location</span>
                    <span className="font-semibold">
                      {user?.fullName ?? ride.student.name} · {ride.pickup.label}
                    </span>
                  </p>
                </div>
                <div className="flex items-start gap-2.5 rounded-[12px] bg-canvas-alt px-3.5 py-3">
                  <Icon name="car" size={16} className="mt-0.5 shrink-0 text-primary" />
                  <p className="text-[13px] leading-[1.55] text-heading">
                    <span className="block text-[12px] text-muted">Driver &amp; vehicle</span>
                    <span className="font-semibold">
                      {ride.driver.name} · {ride.vehicle.plateNumber}
                    </span>
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-muted">
                Trip {ride.code} · requested {formatDateTime(ride.requestedAt)}
              </p>
              <LinkButton to={`/student/ride/${ride.id}`} variant="secondary" block trailingIcon="arrow-right">
                Open live tracking
              </LinkButton>
            </>
          ) : (
            <EmptyState
              icon="car-front"
              title="No ride in progress"
              description="SOS still works without a trip — it shares your live location with the safety desk and your guardian."
              action={
                <LinkButton to="/student/book" icon="navigation">
                  Book a ride
                </LinkButton>
              }
            />
          )}
        </section>

        {/* SOS trigger */}
        <div className="flex flex-col gap-2">
          <Button variant="danger" size="lg" block icon="siren" onClick={() => setSosOpen(true)}>
            SOS · Get emergency help
          </Button>
          {recentAlerts.length === 0 && !alerts.loading && !alerts.error ? (
            <p className="text-center text-[11px] text-muted">No emergency call or alert has been sent yet.</p>
          ) : null}
        </div>

        {/* Recent alerts raised from this account */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[14px] font-bold text-heading">Your recent alerts</h2>
          {alerts.loading ? (
            <>
              <Skeleton height={72} className="rounded-[20px]" />
              <Skeleton height={72} className="rounded-[20px]" />
            </>
          ) : alerts.error ? (
            <ErrorState title="We could not load your alerts" message={alerts.error} onRetry={alerts.reload} />
          ) : recentAlerts.length === 0 ? (
            <div className="rounded-[12px] bg-canvas-alt px-3.5 py-3 text-[12px] leading-[1.55] text-muted">
              Nothing has been sent yet. If something goes wrong on a trip, the button above reaches the safety desk
              and your guardian in one tap.
            </div>
          ) : (
            recentAlerts.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-[12px] border border-border bg-white p-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-heading">{emergencyTypeLabel(item.type)}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {formatDateTime(item.createdAt)}
                    {item.ride ? ` · Trip ${item.ride.code}` : ''}
                  </p>
                  {item.message ? <p className="mt-1 text-[12px] text-muted">{item.message}</p> : null}
                  {item.guardianContact ? (
                    <p className="mt-1 text-[11px] text-muted">Guardian notified · {item.guardianContact}</p>
                  ) : null}
                </div>
                <Badge tone={badgeTone(item.status)}>{sentence(item.status)}</Badge>
              </div>
            ))
          )}
        </section>

        {/* Hotlines + guardian contact */}
        <section className="gt-card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-heading">Emergency contacts</h2>
            <Badge tone="danger" icon="phone-call">
              Tap to call
            </Badge>
          </div>

          {hotlinesLoading ? (
            <>
              <Skeleton height={56} className="rounded-[12px]" />
              <Skeleton height={56} className="rounded-[12px]" />
            </>
          ) : hotlinesError ? (
            <div className="flex flex-col items-start gap-2 rounded-[12px] bg-canvas-alt p-3.5">
              <p className="gt-error-text">{hotlinesError}</p>
              <Button variant="secondary" size="sm" icon="refresh-cw" onClick={hotlineQuery.reload}>
                Try again
              </Button>
            </div>
          ) : hotlines.length === 0 ? (
            <Notice tone="neutral" icon="phone" title="No hotline configured yet">
              Your school administrator can add emergency numbers in Safety Desk → Settings. Until then, call your
              local emergency service directly.
            </Notice>
          ) : (
            hotlines.map((line) => (
              <a
                key={line.key}
                href={`tel:${line.number.replace(/\s+/g, '')}`}
                className="flex items-center justify-between gap-3 rounded-[12px] bg-danger-soft px-3.5 py-3 transition hover:opacity-90"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-heading">{line.label}</span>
                  {line.description ? (
                    <span className="block truncate text-[11px] text-muted">{line.description}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[15px] font-bold text-danger">{line.number}</span>
              </a>
            ))
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Your guardian</p>
            {!studentId ? (
              <p className="text-[12px] leading-[1.55] text-muted">
                No guardian is connected to this account yet.{' '}
                <Link to="/student/guardians" className="font-semibold text-primary hover:underline">
                  Connect one
                </Link>{' '}
                so someone is always a tap away.
              </p>
            ) : guardians.loading ? (
              <Skeleton height={44} className="rounded-[12px]" />
            ) : guardians.error ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="gt-error-text">{guardians.error}</p>
                <Button variant="secondary" size="sm" icon="refresh-cw" onClick={guardians.reload}>
                  Retry
                </Button>
              </div>
            ) : leadGuardian ? (
              <a
                href={`tel:${leadGuardian.phone.replace(/\s+/g, '')}`}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-border px-3.5 py-3 text-[13px] text-heading transition hover:border-primary/40"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon name="phone-call" size={17} className="shrink-0 text-primary" />
                  <span className="truncate font-semibold">{leadGuardian.name}</span>
                </span>
                <span className="shrink-0 font-bold text-primary">{leadGuardian.phone}</span>
              </a>
            ) : (
              <p className="text-[12px] leading-[1.55] text-muted">
                No guardian connected yet.{' '}
                <Link to="/student/guardians" className="font-semibold text-primary hover:underline">
                  Send your student code
                </Link>{' '}
                to a parent or guardian.
              </p>
            )}
          </div>
        </section>

        <Notice tone="primary" icon="shield-check" title="Active-trip location only">
          Share a secure view of your current ride. No location is shared after arrival.
        </Notice>

        {/* While you wait */}
        <section className="gt-card flex flex-col gap-3">
          <h2 className="text-[14px] font-bold text-heading">While you wait</h2>
          <ul className="flex flex-col gap-2.5">
            {WAITING_TIPS.map((tip) => (
              <li key={tip} className="flex items-start gap-2.5 text-[13px] leading-[1.55] text-heading">
                <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-success" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Safety report */}
        <section className="gt-card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-heading">File a safety report</h2>
            <Badge tone="neutral" icon="file-check">
              Safety desk
            </Badge>
          </div>

          <p className="text-[12px] leading-[1.55] text-muted">
            Something did not feel right? Driver behaviour, vehicle condition, an unexpected detour or delay — the
            safety desk reviews every report.
          </p>

          {success ? (
            <Notice tone="success" icon="check-circle" title="Report sent">
              {success}
            </Notice>
          ) : null}

          <p className="gt-hint">
            {ride
              ? `This report will be linked to trip ${ride.code}.`
              : 'No ride in progress, so this report is filed without a trip attached.'}
          </p>

          <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmitReport(event)} noValidate>
            {categories.loading ? (
              <Skeleton height={44} className="rounded-[12px]" />
            ) : categories.error ? (
              <div className="flex flex-col items-start gap-2 rounded-[12px] bg-canvas-alt p-3">
                <p className="gt-error-text">{categories.error}</p>
                <Button variant="secondary" size="sm" icon="refresh-cw" onClick={categories.reload}>
                  Try again
                </Button>
              </div>
            ) : (
              <SelectField
                label="What is this about?"
                name="category"
                value={form.category}
                error={formErrors.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              >
                <option value="">Choose a category</option>
                {(categories.data?.categories ?? []).map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label} — {entry.hint}
                  </option>
                ))}
              </SelectField>
            )}

            <TextField
              label="Short title"
              name="subject"
              value={form.subject}
              error={formErrors.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="e.g. Hard braking on the way home"
              maxLength={120}
            />

            <TextareaField
              label="What happened?"
              name="description"
              value={form.description}
              error={formErrors.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              hint={`${1500 - form.description.length} characters left`}
              maxLength={1500}
            />

            <div className="gt-field">
              <span className="gt-label">How urgent is it?</span>
              <SegmentedControl<Severity>
                value={form.severity}
                options={[
                  { value: 'LOW', label: 'Low' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'HIGH', label: 'High' },
                ]}
                onChange={(next) => setForm((prev) => ({ ...prev, severity: next }))}
              />
            </div>

            {submitReport.error ? <p className="gt-error-text">{submitReport.error}</p> : null}

            <Button type="submit" block icon="file-check" loading={submitReport.pending}>
              Send report
            </Button>
          </form>
        </section>

        {/* Report history */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-bold text-heading">Your reports</h2>
            {myReports.length > 0 ? <Badge tone="neutral">{myReports.length}</Badge> : null}
          </div>

          {reports.loading ? (
            <>
              <Skeleton height={76} className="rounded-[20px]" />
              <Skeleton height={76} className="rounded-[20px]" />
            </>
          ) : reports.error ? (
            <ErrorState
              title="We could not load your reports"
              message={reports.error}
              onRetry={reports.reload}
            />
          ) : myReports.length === 0 ? (
            <EmptyState
              icon="file-check"
              title="No reports yet"
              description="Anything you file appears here with its review status, so you can follow up."
            />
          ) : (
            myReports.slice(0, 10).map((report) => (
              <div
                key={report.id}
                className="flex items-start justify-between gap-3 rounded-[12px] border border-border bg-white p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-heading">{report.subject}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {categoryLabel(report.category)} · {formatDateTime(report.createdAt)}
                    {report.ride ? ` · Trip ${report.ride.code}` : ''}
                  </p>
                  {report.resolution ? (
                    <p className="mt-1 text-[12px] leading-[1.55] text-muted">{report.resolution}</p>
                  ) : null}
                </div>
                <Badge tone={badgeTone(report.status)}>{sentence(report.status)}</Badge>
              </div>
            ))
          )}
        </section>
      </div>

      <SosModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        rideId={ride?.id ?? null}
        context={ride ? `on ride ${ride.code}` : undefined}
        onRaised={() => alerts.reload()}
      />
    </>
  );
}

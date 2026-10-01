import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Modal,
  PageLoader,
  SegmentedControl,
  Skeleton,
  SelectField,
  TextareaField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, relativeTime } from '../../lib/format';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { useToast } from '../../state/ToastContext';
import type { SafetyCategory, SafetyReport } from '../../lib/types';

type StatusFilter = 'ALL' | SafetyReport['status'];
type SeverityFilter = 'ALL' | SafetyReport['severity'];
type ReportStatus = SafetyReport['status'];
type Severity = SafetyReport['severity'];
type Tone = 'primary' | 'success' | 'danger' | 'neutral' | 'warning' | 'navy';

/** The API also returns the admin currently handling the report. */
interface ReportEntry extends SafetyReport {
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
}

interface ReportsPayload {
  reports: ReportEntry[];
}

interface CategoriesPayload {
  categories: SafetyCategory[];
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'RESOLVED', label: 'Resolved' },
];

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: 'ALL', label: 'Any severity' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const STATUS_TONE: Record<ReportStatus, Tone> = {
  NEW: 'warning',
  UNDER_REVIEW: 'primary',
  RESOLVED: 'success',
};

const SEVERITY_TONE: Record<Severity, Tone> = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'primary',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

function statusLabel(status: ReportStatus): string {
  switch (status) {
    case 'UNDER_REVIEW':
      return 'Under review';
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

function titleCase(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function categoryLabel(value: string, categories: SafetyCategory[]): string {
  const match = categories.find((entry) => entry.value === value);
  return match ? match.label : titleCase(value);
}

function fullName(person?: { firstName: string; lastName: string } | null): string | null {
  return person ? `${person.firstName} ${person.lastName}` : null;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-canvas-alt p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 break-words text-[13px] font-semibold leading-[1.5] text-heading">{children}</div>
    </div>
  );
}

export default function AdminReports() {
  useDocumentTitle('Safety reports · Guardian Transit');
  const { push } = useToast();

  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [category, setCategory] = useState<string>('ALL');
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');

  const [target, setTarget] = useState<ReportEntry | null>(null);
  const [nextStatus, setNextStatus] = useState<ReportStatus>('UNDER_REVIEW');
  const [resolution, setResolution] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const categories = useAsync<CategoriesPayload>((signal) => api.get('/safety/categories', { signal }), []);

  const list = useAsync<ReportsPayload>(
    (signal) =>
      api.get('/safety', {
        signal,
        query: {
          status: status === 'ALL' ? undefined : status,
          category: category === 'ALL' ? undefined : category,
        },
      }),
    [status, category],
  );

  const update = useMutation(
    async (id: string, next: ReportStatus, note: string): Promise<string> => {
      const body: { status: ReportStatus; resolution?: string } = { status: next };
      if (note) body.resolution = note;
      await api.patch(`/safety/${id}`, body);
      return 'saved';
    },
  );

  function clearFilters() {
    setStatus('ALL');
    setCategory('ALL');
    setSeverity('ALL');
  }

  function openReview(report: ReportEntry) {
    setTarget(report);
    setNextStatus(report.status === 'NEW' ? 'UNDER_REVIEW' : report.status);
    setResolution(report.resolution ?? '');
    setResolutionError(null);
    update.setError(null);
  }

  async function submitReview() {
    if (!target) return;
    const trimmed = resolution.trim();
    if (nextStatus === 'RESOLVED' && !trimmed && !target.resolution) {
      setResolutionError('Add a resolution note before marking this resolved.');
      return;
    }
    setResolutionError(null);
    const result = await update.run(target.id, nextStatus, trimmed);
    if (result === null) return;
    push('Update saved — the person who filed this report was notified.', 'success');
    setTarget(null);
    list.reload();
  }

  const categoryList = categories.data?.categories ?? [];
  const reports = list.data?.reports ?? [];
  const visible = severity === 'ALL' ? reports : reports.filter((report) => report.severity === severity);
  const filteredIn = category !== 'ALL' || status !== 'ALL';

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="gt-eyebrow">Safety desk</p>
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading md:text-[30px]">Safety reports</h1>
          <p className="text-[13px] text-muted">
            Incidents filed by students, parents and drivers — triage, assign and close them with a note.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" loading={list.loading} onClick={list.reload}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <SegmentedControl value={status} options={STATUS_OPTIONS} onChange={setStatus} />

        <div className="grid gap-3 sm:grid-cols-2">
          {categories.loading && !categories.data ? (
            <div className="gt-field">
              <p className="gt-label">Category</p>
              <Skeleton height={42} />
            </div>
          ) : categories.error ? (
            <div className="gt-field">
              <p className="gt-label">Category</p>
              <p className="gt-error-text">{categories.error}</p>
              <Button variant="ghost" size="sm" icon="refresh-cw" onClick={categories.reload}>
                Retry categories
              </Button>
            </div>
          ) : (
            <SelectField
              label="Category"
              name="report-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="ALL">All categories</option>
              {categoryList.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </SelectField>
          )}

          <SelectField
            label="Severity"
            name="report-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as SeverityFilter)}
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>

        {!list.loading && !list.error ? (
          <p className="text-[12px] text-muted">
            Showing {visible.length} of {reports.length} loaded report{reports.length === 1 ? '' : 's'}
            {severity !== 'ALL' ? ` · ${severity.toLowerCase()} severity only` : ''}
          </p>
        ) : null}
      </div>

      {list.loading && !list.data ? (
        <PageLoader label="Loading safety reports…" />
      ) : list.error ? (
        <ErrorState title="We could not load safety reports" message={list.error} onRetry={list.reload} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon="shield-alert"
          title={filteredIn ? 'No reports match these filters' : 'No safety reports yet'}
          description={
            filteredIn
              ? 'Try a different status or category to widen the search.'
              : 'Reports filed through the app land here the moment they are submitted.'
          }
          action={
            filteredIn ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="shield-alert"
          title="No reports at this severity"
          description="Change the severity filter to see the rest of the loaded reports."
          action={
            <Button variant="secondary" onClick={() => setSeverity('ALL')}>
              Show all severities
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((report) => {
            const reporter = fullName(report.reporter ?? null);
            const handler = fullName(report.assignedTo ?? null);
            const reviewError = target?.id === report.id ? update.error : null;
            return (
              <section
                key={report.id}
                className={`gt-card flex flex-col gap-4 ${
                  report.status === 'NEW' && report.severity === 'HIGH' ? 'border-danger/40' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${
                      report.status === 'RESOLVED' ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary'
                    }`}
                  >
                    <Icon name={report.status === 'RESOLVED' ? 'shield-check' : 'shield-alert'} size={19} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-bold text-heading">{report.subject}</h2>
                      <Badge tone={STATUS_TONE[report.status]}>{statusLabel(report.status)}</Badge>
                      <Badge tone={SEVERITY_TONE[report.severity]}>{SEVERITY_LABEL[report.severity]} severity</Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{report.description}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {categoryLabel(report.category, categoryList)} · filed {formatDateTime(report.createdAt)} ·{' '}
                      {relativeTime(report.createdAt)}
                      {report.resolvedAt ? ` · closed ${formatDateTime(report.resolvedAt)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Meta label="Reported by">
                    {reporter ? `${reporter} · ${report.reporter?.role.toLowerCase()}` : 'Unknown'}
                  </Meta>
                  <Meta label="Ride">
                    {report.ride ? (
                      <Link to={`/admin/rides?ride=${report.ride.id}`} className="text-primary hover:underline">
                        {report.ride.code}
                        {report.ride.status ? ` · ${report.ride.status.replace(/_/g, ' ').toLowerCase()}` : ''}
                      </Link>
                    ) : (
                      'Not linked to a ride'
                    )}
                  </Meta>
                  <Meta label="Assigned to">{handler ?? 'Not yet assigned'}</Meta>
                  <Meta label="Category">{categoryLabel(report.category, categoryList)}</Meta>
                </div>

                {report.resolution ? (
                  <div className="gt-notice gt-notice-success">
                    <Icon name="check-circle" size={18} className="mt-0.5 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="mb-1 font-bold text-heading">Resolution note</p>
                      <p className="text-[12px] text-muted">{report.resolution}</p>
                    </div>
                  </div>
                ) : null}

                {reviewError ? <p className="gt-error-text">{reviewError}</p> : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={report.status === 'RESOLVED' ? 'secondary' : 'primary'}
                    size="sm"
                    icon={report.status === 'RESOLVED' ? 'eye' : 'file-check'}
                    onClick={() => openReview(report)}
                  >
                    {report.status === 'RESOLVED' ? 'Reopen or amend…' : 'Review…'}
                  </Button>
                  {report.ride ? (
                    <LinkButton to={`/admin/rides?ride=${report.ride.id}`} variant="ghost" size="sm" icon="route">
                      View ride
                    </LinkButton>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `Update report · ${target.subject}` : 'Update report'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={update.pending}>
              Cancel
            </Button>
            <Button icon="check" loading={update.pending} onClick={() => void submitReview()}>
              Save update
            </Button>
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-muted">
              {target.description} — filed {relativeTime(target.createdAt)}. The reporter is notified whenever you save.
            </p>

            <SelectField
              label="Status"
              name="report-status"
              value={nextStatus}
              onChange={(event) => {
                setNextStatus(event.target.value as ReportStatus);
                if (resolutionError) setResolutionError(null);
              }}
            >
              <option value="NEW">New — still waiting to be triaged</option>
              <option value="UNDER_REVIEW">Under review — someone is looking into it</option>
              <option value="RESOLVED">Resolved — close the report</option>
            </SelectField>

            <TextareaField
              label="Resolution note"
              name="report-resolution"
              value={resolution}
              maxLength={1000}
              placeholder="e.g. Spoke with the driver, retrained on gate protocol, parent confirmed the fix."
              hint="Required to resolve a report that has no note yet. Up to 1000 characters."
              error={resolutionError}
              onChange={(event) => {
                setResolution(event.target.value);
                if (resolutionError) setResolutionError(null);
              }}
            />

            {update.error ? <p className="gt-error-text">{update.error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

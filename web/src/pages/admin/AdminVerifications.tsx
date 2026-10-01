import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Badge, Button, EmptyState, ErrorState, Modal, PageLoader, SegmentedControl, TextareaField, SelectField } from '../../components/ui';
import { api } from '../../lib/api';
import { badgeTone, formatDateTime, verificationStatusLabel } from '../../lib/format';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { useToast } from '../../state/ToastContext';
import type { AdminVerificationDriver, VerificationStatus } from '../../lib/types';

type FilterStatus = 'ALL' | VerificationStatus;
type DecisionStatus = 'PENDING' | 'VERIFIED' | 'UNDER_REVIEW' | 'REQUIRES_ACTION' | 'REJECTED';

const DRIVER_DOC_TYPES = ['IDENTITY', 'GOVERNMENT', 'VEHICLE', 'BACKGROUND'] as const;
type DriverDocType = (typeof DRIVER_DOC_TYPES)[number];

interface VerificationsPayload {
  drivers: AdminVerificationDriver[];
  vehicles: unknown[];
}

interface DecisionTarget {
  kind: 'driver' | 'driverCheck' | 'vehicle';
  /** What the reviewer is looking at, e.g. "Ramon Cruz" or "Identity document". */
  label: string;
  driverId: string;
  vehicleId?: string;
  docType?: string;
}

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REQUIRES_ACTION', label: 'Requires action' },
  { value: 'REJECTED', label: 'Rejected' },
];

const DECISION_OPTIONS: { value: DecisionStatus; label: string }[] = [
  { value: 'VERIFIED', label: 'Verified — approve' },
  { value: 'UNDER_REVIEW', label: 'Under review — keep open' },
  { value: 'PENDING', label: 'Pending — back to the queue' },
  { value: 'REQUIRES_ACTION', label: 'Requires action — send back to the driver' },
  { value: 'REJECTED', label: 'Rejected — decline' },
];

function docLabel(docType: string): string {
  switch (docType) {
    case 'IDENTITY':
      return 'Identity document';
    case 'GOVERNMENT':
      return 'Government ID';
    case 'BACKGROUND':
      return 'Background check';
    case 'VEHICLE':
      return 'Vehicle document';
    default:
      return docType.replace(/_/g, ' ').toLowerCase();
  }
}

function isDriverDocType(value: string): value is DriverDocType {
  return (DRIVER_DOC_TYPES as readonly string[]).includes(value);
}

function isDecisionStatus(value: VerificationStatus): value is DecisionStatus {
  return value === 'VERIFIED' || value === 'UNDER_REVIEW' || value === 'REQUIRES_ACTION' || value === 'REJECTED';
}

function CheckLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-[1.6] text-muted">
      {label} <span className="font-semibold text-heading">{value}</span>
    </p>
  );
}

function CheckCard({
  title,
  status,
  reference,
  submittedAt,
  reviewedAt,
  notes,
  onReview,
  reviewLabel,
}: {
  title: string;
  status: VerificationStatus;
  reference?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  notes?: string | null;
  onReview: () => void;
  reviewLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-canvas-alt p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-bold text-heading">{title}</p>
        <Badge tone={badgeTone(status)}>{verificationStatusLabel(status)}</Badge>
      </div>
      <div className="flex flex-col gap-0.5">
        <CheckLine label="Reference" value={reference || '—'} />
        <CheckLine label="Submitted" value={formatDateTime(submittedAt ?? null)} />
        <CheckLine label="Reviewed" value={formatDateTime(reviewedAt ?? null)} />
      </div>
      {notes ? (
        <p className="rounded-[8px] border border-border bg-white p-2 text-[11px] leading-[1.6] text-muted">
          <span className="font-semibold text-heading">Reviewer notes:</span> {notes}
        </p>
      ) : null}
      <Button size="sm" variant="secondary" icon="file-check" className="self-start" onClick={onReview}>
        {reviewLabel}
      </Button>
    </div>
  );
}

export default function AdminVerifications() {
  useDocumentTitle('Driver verifications · Guardian Transit');
  const { push } = useToast();

  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [decision, setDecision] = useState<DecisionStatus>('VERIFIED');
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);

  const state = useAsync<VerificationsPayload>(
    (signal) => api.get('/admin/verifications', { signal, query: { status: filter } }),
    [filter],
  );

  const decide = useMutation(
    async (next: DecisionTarget, status: DecisionStatus, note: string): Promise<string> => {
      const body: { status: DecisionStatus; notes?: string; docType?: DriverDocType } = { status };
      if (note) body.notes = note;
      if (next.kind === 'driverCheck') {
        if (!next.docType || !isDriverDocType(next.docType)) {
          throw new Error('This document cannot be reviewed on its own. Review the whole driver instead.');
        }
        body.docType = next.docType;
        await api.post(`/admin/verifications/${next.driverId}`, body);
        return 'saved';
      }
      if (next.kind === 'vehicle') {
        await api.post(`/admin/verifications/vehicle/${next.vehicleId ?? ''}`, body);
        return 'saved';
      }
      await api.post(`/admin/verifications/${next.driverId}`, body);
      return 'saved';
    },
  );

  const drivers = state.data?.drivers ?? [];

  function openDecision(next: DecisionTarget, currentStatus: VerificationStatus) {
    setTarget(next);
    setDecision(isDecisionStatus(currentStatus) ? currentStatus : 'UNDER_REVIEW');
    setNotes('');
    setNotesError(null);
    decide.setError(null);
  }

  function closeDecision() {
    setTarget(null);
    setNotes('');
    setNotesError(null);
  }

  async function submitDecision() {
    if (!target) return;
    const trimmed = notes.trim();
    if ((decision === 'REJECTED' || decision === 'REQUIRES_ACTION') && trimmed.length < 3) {
      setNotesError('Add a short note so the driver knows what to fix.');
      return;
    }
    setNotesError(null);
    const result = await decide.run(target, decision, trimmed);
    if (result === null) return; // failure is rendered inline in the dialog
    push(`${target.label} marked ${verificationStatusLabel(decision).toLowerCase()}.`, 'success');
    closeDecision();
    state.reload();
  }

  const needsNote = decision === 'REJECTED' || decision === 'REQUIRES_ACTION';

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="gt-eyebrow">Safety desk</p>
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading md:text-[30px]">Verifications</h1>
          <p className="text-[13px] text-muted">
            Review driver documents, background checks and vehicle paperwork before anyone goes online.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" loading={state.loading} onClick={state.reload}>
          Refresh
        </Button>
      </div>

      <SegmentedControl value={filter} options={FILTER_OPTIONS} onChange={setFilter} />

      {state.loading && !state.data ? (
        <PageLoader label="Loading verification queue…" />
      ) : state.error ? (
        <ErrorState title="We could not load the verification queue" message={state.error} onRetry={state.reload} />
      ) : drivers.length === 0 ? (
        <EmptyState
          icon="badge-check"
          title={filter === 'ALL' ? 'No drivers on file yet' : `No drivers marked ${verificationStatusLabel(filter)}`}
          description={
            filter === 'ALL'
              ? 'Drivers appear here as soon as they submit their documents.'
              : 'Try another status filter to see the rest of the queue.'
          }
          action={
            filter !== 'ALL' ? (
              <Button variant="secondary" onClick={() => setFilter('ALL')}>
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-muted">
            Showing {drivers.length} driver{drivers.length === 1 ? '' : 's'}
            {filter === 'ALL' ? '' : ` · ${verificationStatusLabel(filter)}`} · up to 100 records per request.
          </p>

          {drivers.map((driver) => {
            const open = expandedId === driver.id;
            const outstanding = driver.checks.filter((check) => check.status !== 'VERIFIED').length;
            return (
              <section key={driver.id} className="gt-card flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-bold text-heading">{driver.name}</h2>
                      <Badge tone={badgeTone(driver.overallStatus)}>{verificationStatusLabel(driver.overallStatus)}</Badge>
                      <Badge tone={badgeTone(driver.backgroundCheckStatus)}>
                        Background: {verificationStatusLabel(driver.backgroundCheckStatus)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      {driver.phone}
                      {driver.email ? ` · ${driver.email}` : ''} · Joined {formatDateTime(driver.joinedAt)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      Licence <span className="font-semibold text-heading">{driver.licenseNumber || '—'}</span> · Expires{' '}
                      {formatDateTime(driver.licenseExpiry)} · {outstanding} of {driver.checks.length} checks outstanding
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={open ? 'chevron-up' : 'chevron-down'}
                      aria-expanded={open}
                      aria-label={`${open ? 'Collapse' : 'Expand'} the review for ${driver.name}`}
                      onClick={() => setExpandedId(open ? null : driver.id)}
                    >
                      {open ? 'Hide review' : 'Open review'}
                    </Button>
                    <Button
                      size="sm"
                      icon="shield-check"
                      onClick={() =>
                        openDecision({ kind: 'driver', label: driver.name, driverId: driver.id }, driver.overallStatus)
                      }
                    >
                      Decide all
                    </Button>
                  </div>
                </div>

                {open ? (
                  <div className="flex flex-col gap-5 border-t border-border pt-4">
                    <div className="flex flex-col gap-3">
                      <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">Driver documents</h3>
                      {driver.checks.length === 0 ? (
                        <p className="text-[12px] text-muted">No documents have been submitted yet.</p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {driver.checks.map((check) => (
                            <CheckCard
                              key={check.id}
                              title={docLabel(check.docType)}
                              status={check.status}
                              reference={check.reference}
                              submittedAt={check.submittedAt}
                              reviewedAt={check.reviewedAt}
                              notes={check.notes}
                              reviewLabel="Review document"
                              onReview={() =>
                                openDecision(
                                  {
                                    kind: 'driverCheck',
                                    label: `${driver.name} · ${docLabel(check.docType)}`,
                                    driverId: driver.id,
                                    docType: check.docType,
                                  },
                                  check.status,
                                )
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">Vehicles</h3>
                      {driver.vehicles.length === 0 ? (
                        <p className="text-[12px] text-muted">No vehicles have been added to this profile yet.</p>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {driver.vehicles.map((vehicle) => (
                            <div key={vehicle.id} className="flex flex-col gap-3 rounded-[12px] border border-border bg-canvas-alt p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-bold text-heading">{vehicle.label}</p>
                                  <p className="text-[11px] text-muted">Plate {vehicle.plateNumber}</p>
                                </div>
                                <Badge tone={badgeTone(vehicle.status)}>{verificationStatusLabel(vehicle.status)}</Badge>
                              </div>
                              <div className="flex flex-col gap-2">
                                {vehicle.verifications.map((check) => (
                                  <div
                                    key={check.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-border bg-white p-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-[12px] font-semibold text-heading">{docLabel(check.docType)}</p>
                                      <p className="text-[11px] text-muted">
                                        Reviewed {formatDateTime(check.reviewedAt)}
                                        {check.notes ? ` · ${check.notes}` : ''}
                                      </p>
                                    </div>
                                    <Badge tone={badgeTone(check.status)}>{verificationStatusLabel(check.status)}</Badge>
                                  </div>
                                ))}
                                {vehicle.verifications.length === 0 ? (
                                  <p className="text-[11px] text-muted">No paperwork submitted for this vehicle yet.</p>
                                ) : null}
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon="car-front"
                                className="self-start"
                                onClick={() =>
                                  openDecision(
                                    {
                                      kind: 'vehicle',
                                      label: `${vehicle.label} (${vehicle.plateNumber})`,
                                      driverId: driver.id,
                                      vehicleId: vehicle.id,
                                    },
                                    vehicle.status,
                                  )
                                }
                              >
                                Review vehicle
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={target !== null}
        onClose={closeDecision}
        title={target ? `Review ${target.label}` : 'Review'}
        footer={
          <>
            <Button variant="ghost" onClick={closeDecision} disabled={decide.pending}>
              Cancel
            </Button>
            <Button
              variant={decision === 'REJECTED' ? 'danger' : 'primary'}
              icon="check"
              loading={decide.pending}
              onClick={() => void submitDecision()}
            >
              Save decision
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="gt-notice gt-notice-primary">
            <Icon name="info" size={18} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[12px] text-muted">
                Saving updates the driver’s overall status, switches off their availability unless everything is verified
                and notifies them immediately.
              </p>
            </div>
          </div>

          <SelectField
            label="Decision"
            name="decision"
            value={decision}
            onChange={(event) => setDecision(event.target.value as DecisionStatus)}
          >
            {DECISION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <TextareaField
            label={needsNote ? 'Notes (required)' : 'Notes (optional)'}
            name="verification-notes"
            value={notes}
            maxLength={500}
            placeholder="What did you check? What still needs attention?"
            hint="Sent to the driver with the decision. Maximum 500 characters."
            error={notesError}
            onChange={(event) => {
              setNotes(event.target.value);
              if (notesError) setNotesError(null);
            }}
          />

          {decide.error ? <p className="gt-error-text">{decide.error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

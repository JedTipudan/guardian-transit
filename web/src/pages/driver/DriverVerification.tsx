import { Icon } from '../../components/Icon';
import { Badge, Button, ErrorState, PageLoader } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useDocumentTitle } from '../../lib/hooks';
import { badgeTone, formatDateTime, verificationStatusLabel } from '../../lib/format';
import type { DriverMe, VerificationStatus } from '../../lib/types';

interface CategoryModel {
  key: string;
  label: string;
  icon: string;
  blurb: string;
  /** `null` means the API returned no record for this check. */
  status: VerificationStatus | null;
  notes: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

/** Worst-first ranking so a single blocking check drives the vehicle category. */
const STATUS_RANK: VerificationStatus[] = ['REJECTED', 'REQUIRES_ACTION', 'UNDER_REVIEW', 'PENDING', 'VERIFIED'];

function worstStatus(statuses: VerificationStatus[]): VerificationStatus | null {
  if (statuses.length === 0) return null;
  return STATUS_RANK.reduce<VerificationStatus | null>(
    (worst, candidate) => (worst !== null ? worst : statuses.includes(candidate) ? candidate : null),
    null,
  );
}

function overallCopy(status: VerificationStatus): string {
  switch (status) {
    case 'VERIFIED':
      return 'Every check passed. You can go online and receive ride requests.';
    case 'UNDER_REVIEW':
      return 'The safety desk is reviewing your documents. You will receive a notification when a decision is made.';
    case 'REQUIRES_ACTION':
      return 'One or more checks need your attention — read the reviewer notes below.';
    case 'REJECTED':
      return 'One or more checks were rejected. Review the notes below and contact the safety desk.';
    default:
      return 'Your documents are queued for review. Verified drivers are the only ones who receive ride requests.';
  }
}

function StatusChip({ status }: { status: VerificationStatus | null }) {
  if (!status) {
    return <Badge tone="neutral">Not on file</Badge>;
  }
  return <Badge tone={badgeTone(status)}>{verificationStatusLabel(status)}</Badge>;
}

export default function DriverVerification() {
  useDocumentTitle('Verification · Guardian Transit');

  const me = useAsync<DriverMe>((signal) => api.get<DriverMe>('/driver/me', { signal }), []);

  if (!me.data) {
    return (
      <div className="mx-auto flex w-full max-w-[840px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Verification</h1>
          <p className="text-[13px] text-muted">Identity, government, vehicle and background checks.</p>
        </div>
        {me.error ? (
          <ErrorState title="We could not load your verification status" message={me.error} onRetry={me.reload} />
        ) : (
          <PageLoader label="Loading verification status…" />
        )}
      </div>
    );
  }

  const data = me.data;
  const driver = data.driver;

  const findCheck = (docType: string) => data.verifications.find((entry) => entry.docType === docType) ?? null;
  const toCategory = (
    key: string,
    label: string,
    icon: string,
    blurb: string,
    docType: string,
  ): CategoryModel => {
    const entry = findCheck(docType);
    return {
      key,
      label,
      icon,
      blurb,
      status: entry ? entry.status : null,
      notes: entry?.notes ?? null,
      submittedAt: entry?.submittedAt ?? null,
      reviewedAt: entry?.reviewedAt ?? null,
    };
  };

  const categories: CategoryModel[] = [
    toCategory('identity', 'Identity', 'id', 'Government ID confirming who you are.', 'IDENTITY'),
    toCategory('government', 'Government', 'file-check', 'Professional licence and transport permits.', 'GOVERNMENT'),
    {
      key: 'vehicle',
      label: 'Vehicle',
      icon: 'car',
      blurb: 'Registration, insurance and inspection for each vehicle you drive.',
      status: worstStatus(data.vehicles.map((vehicle) => vehicle.status)),
      notes: null,
      submittedAt: null,
      reviewedAt: null,
    },
    toCategory('background', 'Background', 'shield-check', 'Background and record checks for student safety.', 'BACKGROUND'),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[840px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Verification</h1>
          <p className="text-[13px] text-muted">
            The safety desk reviews your documents before you can receive ride requests.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" onClick={me.reload} disabled={me.loading}>
          Refresh
        </Button>
      </div>

      {me.error ? (
        <p className="gt-error-text" role="alert">
          Could not refresh: {me.error}
        </p>
      ) : null}

      {/* Overall status --------------------------------------------------- */}
      <section className="gt-card flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${
                driver.overallStatus === 'VERIFIED' ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary'
              }`}
            >
              <Icon name="shield-check" size={21} />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-wide text-muted">Verification status</p>
              <p className="text-[18px] font-bold leading-[1.3] text-heading">
                {verificationStatusLabel(driver.overallStatus)}
              </p>
            </div>
          </div>
          <Badge tone={badgeTone(driver.backgroundCheckStatus)}>
            Background: {verificationStatusLabel(driver.backgroundCheckStatus)}
          </Badge>
        </div>

        <p className="text-[13px] leading-[1.6] text-muted">{overallCopy(driver.overallStatus)}</p>

        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-[12px] text-muted">
          <span>
            Licence:{' '}
            <span className="font-semibold text-heading">{driver.licenseNumber || '—'}</span>
          </span>
          <span>
            Expires: <span className="font-semibold text-heading">{formatDateTime(driver.licenseExpiry)}</span>
          </span>
          <span>
            Verified:{' '}
            <span className="font-semibold text-heading">
              {driver.verifiedAt ? formatDateTime(driver.verifiedAt) : 'Not yet'}
            </span>
          </span>
        </div>
      </section>

      {/* Document categories ---------------------------------------------- */}
      <div className="flex flex-col gap-4">
        {categories.map((category) => (
          <section key={category.key} className="gt-card flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                  <Icon name={category.icon} size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-heading">{category.label}</p>
                  <p className="text-[12px] text-muted">{category.blurb}</p>
                </div>
              </div>
              <StatusChip status={category.status} />
            </div>

            {category.key === 'vehicle' ? (
              data.vehicles.length === 0 ? (
                <p className="gt-hint">
                  No vehicle is on file yet. Your vehicle is added with driver registration and reviewed together with
                  its registration, insurance and inspection documents.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.vehicles.map((vehicle) => (
                    <li
                      key={vehicle.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-canvas-alt px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-heading">
                          {vehicle.nickname} · {vehicle.plateNumber}
                        </p>
                        <p className="truncate text-[12px] text-muted">
                          {vehicle.make} {vehicle.model} · {vehicle.color} · {vehicle.capacity} seats
                        </p>
                      </div>
                      <Badge tone={badgeTone(vehicle.status)}>{verificationStatusLabel(vehicle.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {category.key === 'vehicle' ? (
              <p className="gt-hint">
                Registration, insurance and inspection are reviewed together for each vehicle — the result appears on
                the vehicle row above.
              </p>
            ) : null}

            {category.notes ? (
              <div className="flex gap-3 rounded-[12px] bg-warning-soft p-4">
                <span className="mt-0.5 shrink-0 text-warning">
                  <Icon name="message-square" size={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-heading">Reviewer note</p>
                  <p className="mt-1 text-[12px] leading-[1.6] text-muted">{category.notes}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-[12px] text-muted">
              <span>
                Submitted:{' '}
                <span className="font-semibold text-heading">
                  {category.submittedAt ? formatDateTime(category.submittedAt) : '—'}
                </span>
              </span>
              <span>
                Reviewed:{' '}
                <span className="font-semibold text-heading">
                  {category.reviewedAt ? formatDateTime(category.reviewedAt) : 'Not reviewed yet'}
                </span>
              </span>
            </div>
          </section>
        ))}
      </div>

      {/* Honest guidance --------------------------------------------------- */}
      <div className="gt-notice gt-notice-primary">
        <Icon name="info" size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="mb-1 font-bold text-heading">How review works</p>
          <p>
            The safety desk reviews the documents on file with your registration and adds a note whenever something
            needs fixing. This console shows their latest decision in real time — it cannot upload documents yet, so
            follow up with the safety desk if a check is returned to you.
          </p>
        </div>
      </div>
    </div>
  );
}

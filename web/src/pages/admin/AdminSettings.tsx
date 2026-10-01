import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Notice,
  PageLoader,
  Skeleton,
  TextField,
  TextareaField,
  Toggle,
} from '../../components/ui';
import { api } from '../../lib/api';
import { formatMinutes } from '../../lib/format';
import { useAsync, useDocumentTitle, useMutation } from '../../lib/hooks';
import { getSocket } from '../../lib/socket';
import { useToast } from '../../state/ToastContext';
import type { Hotline, MetaPayload, PublicConfig } from '../../lib/types';

interface HotlineDraft {
  key: string;
  label: string;
  number: string;
  description: string;
  available24h: boolean;
}

interface ConfigDraft {
  hotlines: HotlineDraft[];
  sosMessage: string;
  supportEmail: string;
}

interface ConfigBody {
  hotlines: { key: string; label: string; number: string; description?: string; available24h: boolean }[];
  sosMessage: string;
  supportEmail: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toDraft(config: PublicConfig): ConfigDraft {
  return {
    hotlines: (config.hotlines ?? []).map((line: Hotline) => ({
      key: line.key,
      label: line.label,
      number: line.number ?? '',
      description: line.description ?? '',
      available24h: line.available24h !== false,
    })),
    sosMessage: config.sosMessage ?? '',
    supportEmail: config.supportEmail ?? '',
  };
}

function validate(draft: ConfigDraft): Record<string, string> {
  const errors: Record<string, string> = {};

  const sos = draft.sosMessage.trim();
  if (sos.length < 10) errors.sos = 'The SOS message needs at least 10 characters.';
  else if (sos.length > 500) errors.sos = 'Keep the SOS message to 500 characters or fewer.';

  if (!EMAIL_PATTERN.test(draft.supportEmail.trim())) {
    errors.email = 'Enter a valid support email address.';
  }

  for (const line of draft.hotlines) {
    const number = line.number.trim();
    if (number.length < 3) errors[`number:${line.key}`] = 'Enter a number with at least 3 characters.';
    else if (number.length > 40) errors[`number:${line.key}`] = 'Keep the number to 40 characters or fewer.';

    if (line.description.trim().length > 240) {
      errors[`desc:${line.key}`] = 'Keep the description to 240 characters or fewer.';
    }
  }

  return errors;
}

function toBody(draft: ConfigDraft): ConfigBody {
  return {
    hotlines: draft.hotlines.map((line) => ({
      key: line.key,
      label: line.label,
      number: line.number.trim(),
      ...(line.description.trim() ? { description: line.description.trim() } : {}),
      available24h: line.available24h,
    })),
    sosMessage: draft.sosMessage.trim(),
    supportEmail: draft.supportEmail.trim(),
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-canvas-alt px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-0.5 break-words text-[13px] font-semibold leading-[1.5] text-heading">{children}</div>
    </div>
  );
}

export default function AdminSettings() {
  useDocumentTitle('System settings · Guardian Transit');
  const { push } = useToast();

  const config = useAsync<PublicConfig>((signal) => api.get('/admin/config', { signal }), []);
  const meta = useAsync<MetaPayload>((signal) => api.get('/meta', { signal }), []);

  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [external, setExternal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation(async (body: ConfigBody): Promise<PublicConfig> => api.put('/admin/config', body));

  // Keep the form on the saved values unless the admin has edits in flight.
  useEffect(() => {
    if (!config.data || dirtyRef.current) return;
    setDraft(toDraft(config.data));
    setErrors({});
  }, [config.data]);

  // Another admin saving must never silently overwrite typing here.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onUpdated = () => {
      if (dirtyRef.current) setExternal(true);
      else config.reload();
    };
    socket.on('config:updated', onUpdated);
    return () => {
      socket.off('config:updated', onUpdated);
    };
  }, [config.reload]);

  function markDirty() {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    setDirty(true);
  }

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function patchHotline(key: string, changes: Partial<HotlineDraft>) {
    markDirty();
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            hotlines: prev.hotlines.map((line) => (line.key === key ? { ...line, ...changes } : line)),
          }
        : prev,
    );
    clearError(`number:${key}`);
    clearError(`desc:${key}`);
  }

  function patchField(field: 'sosMessage' | 'supportEmail', value: string) {
    markDirty();
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    clearError(field === 'sosMessage' ? 'sos' : 'email');
  }

  function discard() {
    dirtyRef.current = false;
    setDirty(false);
    setExternal(false);
    setErrors({});
    setDraft(config.data ? toDraft(config.data) : null);
    config.reload();
  }

  async function submit() {
    if (!draft) return;
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      push('Fix the highlighted fields before saving.', 'error');
      return;
    }
    const result = await save.run(toBody(draft));
    if (result === null) return;
    dirtyRef.current = false;
    setDirty(false);
    setExternal(false);
    setDraft(toDraft(result));
    config.setData(result);
    push('Configuration saved — Guardian Transit is using the new values now.', 'success');
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="gt-eyebrow">Admin console</p>
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading md:text-[30px]">System settings</h1>
          <p className="text-[13px] text-muted">
            Emergency hotlines, the SOS copy and the support inbox that every Guardian Transit user sees.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon="refresh-cw" loading={config.loading} onClick={config.reload}>
          Refresh
        </Button>
      </div>

      {config.loading && !config.data ? (
        <PageLoader label="Loading configuration…" />
      ) : config.error && !config.data ? (
        <ErrorState title="We could not load system settings" message={config.error} onRetry={config.reload} />
      ) : !draft ? (
        <PageLoader label="Preparing the settings form…" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-6">
            {external && dirty ? (
              <Notice tone="danger" icon="alert-triangle" title="Another admin just saved">
                Your unsaved edits are kept exactly as typed. Reload the saved values when you are ready to start
                from the new configuration.
                <div className="mt-2">
                  <Button size="sm" variant="secondary" icon="refresh-cw" onClick={discard}>
                    Load saved values
                  </Button>
                </div>
              </Notice>
            ) : null}

            <section className="gt-card flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[16px] font-bold text-heading">Emergency hotlines</h2>
                <p className="text-[13px] text-muted">
                  The numbers dialled from the SOS sheet. Labels come straight from the server configuration.
                </p>
              </div>

              {draft.hotlines.length === 0 ? (
                <EmptyState
                  icon="phone"
                  title="No hotlines configured"
                  description="The server has not published any hotline entries yet, so there is nothing to edit here."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {draft.hotlines.map((line) => (
                    <div key={line.key} className="flex flex-col gap-3 rounded-[12px] border border-border bg-canvas-alt p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-bold text-heading">{line.label}</p>
                          <p className="mt-0.5 break-all text-[11px] text-muted">Config key · {line.key}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-muted">Answered 24 hours</span>
                          <Toggle
                            checked={line.available24h}
                            label={`${line.label} answered 24 hours`}
                            onChange={(next) => patchHotline(line.key, { available24h: next })}
                          />
                        </div>
                      </div>

                      <TextField
                        label="Number"
                        name={`number-${line.key}`}
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={40}
                        value={line.number}
                        error={errors[`number:${line.key}`] ?? null}
                        onChange={(event) => patchHotline(line.key, { number: event.target.value })}
                      />

                      <TextField
                        label="Description"
                        name={`desc-${line.key}`}
                        maxLength={240}
                        value={line.description}
                        error={errors[`desc:${line.key}`] ?? null}
                        hint="Shown alongside the number. Up to 240 characters."
                        onChange={(event) => patchHotline(line.key, { description: event.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="gt-card flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[16px] font-bold text-heading">SOS message</h2>
                <p className="text-[13px] text-muted">The copy shown when someone opens the SOS button.</p>
              </div>
              <TextareaField
                label="Message"
                name="sos-message"
                value={draft.sosMessage}
                maxLength={500}
                error={errors.sos ?? null}
                hint={`10–500 characters. ${draft.sosMessage.trim().length}/500 used.`}
                placeholder="Help is on the way. Stay where you are and keep this screen open."
                onChange={(event) => patchField('sosMessage', event.target.value)}
              />
            </section>

            <section className="gt-card flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[16px] font-bold text-heading">Support inbox</h2>
                <p className="text-[13px] text-muted">Where replies and escalation notices are sent.</p>
              </div>
              <TextField
                label="Support email"
                name="support-email"
                type="email"
                autoComplete="email"
                value={draft.supportEmail}
                error={errors.email ?? null}
                hint="Must be a valid email address."
                onChange={(event) => patchField('supportEmail', event.target.value)}
              />
            </section>

            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-surface/95 px-4 py-3 shadow-pop backdrop-blur">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-heading">
                  {dirty ? 'You have unsaved changes.' : 'Everything here is saved.'}
                </p>
                {save.error ? <p className="gt-error-text">{save.error}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" disabled={!dirty || save.pending} onClick={discard}>
                  Discard changes
                </Button>
                <Button icon="check" disabled={!dirty} loading={save.pending} onClick={() => void submit()}>
                  Save changes
                </Button>
              </div>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <section className="gt-card flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-heading">Runtime configuration</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="refresh-cw"
                  loading={meta.loading}
                  aria-label="Refresh runtime configuration"
                  onClick={meta.reload}
                />
              </div>
              <p className="text-[12px] text-muted">Read-only values reported by the server.</p>

              {meta.loading && !meta.data ? (
                <div className="flex flex-col gap-2.5">
                  <Skeleton height={46} />
                  <Skeleton height={46} />
                  <Skeleton height={46} />
                  <Skeleton height={46} />
                </div>
              ) : meta.error ? (
                <div className="flex flex-col gap-2">
                  <p className="gt-error-text">{meta.error}</p>
                  <Button variant="ghost" size="sm" icon="refresh-cw" onClick={meta.reload}>
                    Try again
                  </Button>
                </div>
              ) : !meta.data ? (
                <EmptyState
                  icon="info"
                  title="Runtime details unavailable"
                  description="The server did not return any runtime configuration."
                  action={
                    <Button variant="secondary" size="sm" icon="refresh-cw" onClick={meta.reload}>
                      Try again
                    </Button>
                  }
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  <Row label="Maps provider">
                    <span className="flex flex-wrap items-center gap-2">
                      {meta.data.maps.provider}
                      <Badge tone={meta.data.maps.hasApiKey ? 'success' : 'warning'}>
                        {meta.data.maps.hasApiKey ? 'API key set' : 'No API key'}
                      </Badge>
                    </span>
                  </Row>
                  <Row label="Map tiles">
                    <span className="break-all">{meta.data.maps.tileUrl ?? 'Built-in default tiles'}</span>
                  </Row>
                  <Row label="SMS provider">{meta.data.smsProvider}</Row>
                  <Row label="OTP policy">
                    {meta.data.otp.length}-digit code · valid {formatMinutes(meta.data.otp.ttlSeconds / 60)} ·{' '}
                    {meta.data.otp.maxAttempts} attempts · resend every {meta.data.otp.resendCooldownSeconds}s
                  </Row>
                </div>
              )}
            </section>

            <Notice tone="primary" icon="info" title="Saving is immediate">
              <p>
                Saved values are pushed to every open admin tab and picked up by the SOS sheet and support surfaces on
                their next load.
              </p>
            </Notice>

            <Notice tone="neutral" icon="shield-check" title="Read-only for a reason">
              <p>Map keys, SMS credentials and OTP tuning live in server environment variables, not in this form.</p>
            </Notice>
          </aside>
        </div>
      )}
    </div>
  );
}

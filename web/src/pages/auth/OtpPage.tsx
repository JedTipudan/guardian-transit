import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { useMeta } from '../../state/MetaContext';
import { useToast } from '../../state/ToastContext';
import { api, errorMessage, isUnauthorized, type ApiError } from '../../lib/api';
import { roleHome } from '../../components/Guards';
import { useDocumentTitle } from '../../lib/hooks';

interface OtpNavState {
  phone?: string;
  purpose?: 'LOGIN' | 'REGISTRATION' | 'PHONE_CHANGE';
  from?: string;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
}

function countdownLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function OtpPage() {
  useDocumentTitle('Verify your number · Guardian Transit');
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const meta = useMeta();
  const toast = useToast();

  const state = (location.state as OtpNavState | null) ?? {};
  const phone = state.phone ?? '';
  const purpose = state.purpose ?? 'LOGIN';
  const from = state.from;

  const length = meta?.otp.length ?? 6;
  const resendCooldown = meta?.otp.resendCooldownSeconds ?? 60;
  const ttl = meta?.otp.ttlSeconds ?? 300;

  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ''));
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number>(state.expiresInSeconds ?? ttl);
  const [resendIn, setResendIn] = useState<number>(state.resendAfterSeconds ?? 0);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setDigits(Array.from({ length }, () => ''));
  }, [length]);

  // Poll the dev-hint endpoint when SMS_PROVIDER=dev so the code is visible in the UI
  useEffect(() => {
    if (meta?.smsProvider !== 'dev' || !phone) return;
    let active = true;
    const poll = () => {
      api
        .get<{ code: string }>('/auth/otp/dev-hint', { query: { phone } })
        .then((r) => { if (active) setDevCode(r.code); })
        .catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 4000);
    return () => { active = false; window.clearInterval(timer); };
  // re-run when meta loads (it starts null then resolves)
  }, [meta, phone]);

  // One shared ticker drives both the code-expiry and the resend cooldown.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setExpiresIn((value) => (value > 0 ? value - 1 : 0));
      setResendIn((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const code = digits.join('');
  const complete = code.length === length && digits.every((digit) => digit !== '');

  const focusIndex = useCallback(
    (index: number) => {
      inputs.current[Math.max(0, Math.min(length - 1, index))]?.focus();
    },
    [length],
  );

  const setDigit = useCallback(
    (index: number, value: string) => {
      const cleaned = value.replace(/\D/g, '');
      setDigits((current) => {
        const next = [...current];
        if (cleaned.length > 1) {
          // Paste-style entry fills several boxes at once.
          for (let offset = 0; offset < length; offset += 1) {
            next[index + offset] = cleaned[offset] ?? '';
          }
        } else {
          next[index] = cleaned.slice(-1);
        }
        return next;
      });
      if (cleaned.length > 1) focusIndex(index + cleaned.length);
      else if (cleaned) focusIndex(index + 1);
    },
    [focusIndex, length],
  );

  const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((current) => {
        const next = [...current];
        next[index - 1] = '';
        return next;
      });
      focusIndex(index - 1);
    }
    if (event.key === 'ArrowLeft') focusIndex(index - 1);
    if (event.key === 'ArrowRight') focusIndex(index + 1);
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (text) {
      setDigits((current) => {
        const next = [...current];
        text.split('').forEach((character, offset) => {
          next[offset] = character;
        });
        return next;
      });
      focusIndex(text.length);
    }
  };

  const resend = useCallback(async () => {
    if (resendIn > 0 || !phone) return;
    try {
      const result = await api.post<{ resendAfterSeconds: number; expiresInSeconds: number }>('/auth/otp/request', {
        phone,
        purpose,
      });
      setResendIn(result.resendAfterSeconds ?? resendCooldown);
      setExpiresIn(result.expiresInSeconds ?? ttl);
      setAttemptsLeft(null);
      setError(null);
      toast.push('A new code is on its way.', 'success');
    } catch (cause) {
      setError(errorMessage(cause, 'We could not resend the code.'));
    }
  }, [phone, purpose, resendIn, resendCooldown, ttl, toast]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!complete || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ user: Parameters<typeof setUser>[0] }>('/auth/otp/verify', {
        phone,
        code,
        purpose,
      });
      if (result.user) {
        setUser(result.user);
        toast.push('Number verified. Welcome back!', 'success');
        navigate(from && from !== '/verify-otp' ? from : roleHome[result.user.role], { replace: true });
      }
    } catch (cause) {
      const details = (cause as ApiError)?.details as { attemptsLeft?: number } | undefined;
      if (typeof details?.attemptsLeft === 'number') setAttemptsLeft(details.attemptsLeft);
      setError(
        isUnauthorized(cause) || errorMessage(cause) ? errorMessage(cause, 'That code did not work.') : 'That code did not work.',
      );
      setDigits(Array.from({ length }, () => ''));
      focusIndex(0);
    } finally {
      setPending(false);
    }
  }

  const maskedPhone = useMemo(() => {
    if (!phone) return 'your number';
    const visible = phone.slice(-4);
    return `•••• ${visible}`;
  }, [phone]);

  if (!phone) {
    return <Navigate to="/login" replace />;
  }

  const expired = expiresIn <= 0;

  return (
    <div className="bg-canvas-alt">
      <section className="mx-auto flex max-w-[560px] flex-col gap-6 px-6 py-12 md:py-16">
        <div className="rounded-[20px] border border-border bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-col gap-5">
            <span className="gt-badge gt-badge-primary self-start">PHONE VERIFICATION</span>

            <div className="flex flex-col gap-2.5">
              <h1 className="text-[30px] font-bold leading-[1.2] text-heading">Enter Your Code</h1>
              <p className="text-[14px] text-muted">
                We sent a {length}-digit code to <span className="font-semibold text-heading">{maskedPhone}</span>. It
                expires in {countdownLabel(expiresIn)}.
              </p>
            </div>

            <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
              {devCode ? (
                <div className="flex items-center gap-2 rounded-[10px] bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-200">
                  <Icon name="terminal" size={15} className="shrink-0" />
                  <span>Dev mode — your code is <span className="font-mono font-bold tracking-widest">{devCode}</span></span>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-between gap-2" role="group" aria-label="Verification code">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      inputs.current[index] = element;
                    }}
                    className="gt-otp-box"
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={length}
                    aria-label={`Digit ${index + 1}`}
                    value={digit}
                    disabled={expired}
                    onChange={(event) => setDigit(index, event.target.value)}
                    onKeyDown={onKeyDown(index)}
                    onPaste={onPaste}
                    onFocus={(event) => event.target.select()}
                  />
                ))}
              </div>

              {expired ? (
                <p className="gt-notice gt-notice-danger" role="alert">
                  <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0 text-danger" />
                  <span>
                    <span className="font-bold text-heading">This code has expired.</span>
                    <br />
                    Request a new one to keep going.
                  </span>
                </p>
              ) : null}

              {error ? (
                <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
                  {error}
                  {attemptsLeft !== null ? ` · ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.` : ''}
                </p>
              ) : null}

              {meta?.smsProvider === 'dev' ? (
                <p className="rounded-[12px] bg-primary-soft px-4 py-3 text-center text-[13px] text-primary">
                  Dev mode — use code <span className="font-bold tracking-widest">123456</span>
                </p>
              ) : null}

              <Button type="submit" block loading={pending} disabled={!complete || expired}>
                Verify Code
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
                <span className="text-muted">
                  {resendIn > 0 ? (
                    <>Resend available in {countdownLabel(resendIn)}</>
                  ) : (
                    <span className="text-muted">Didn’t receive it?</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={resendIn > 0}
                  className={`font-semibold ${resendIn > 0 ? 'cursor-not-allowed text-muted' : 'text-primary hover:underline'}`}
                >
                  Resend Code
                </button>
              </div>

              <div className="gt-notice gt-notice-primary">
                <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-primary" />
                <p>
                  <span className="font-bold text-heading">Why we verify</span>
                  <br />
                  Your number keeps trip alerts and guardian contacts tied to one verified account.
                </p>
              </div>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted">
          <Link to="/login" className="font-semibold text-primary hover:underline">
            ← Back to sign in
          </Link>
          <span>Guardian Transit · Safe rides. Connected families.</span>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, TextField } from '../../components/ui';
import { useMeta } from '../../state/MetaContext';
import { useToast } from '../../state/ToastContext';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';

function countdownLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset your password · Guardian Transit');
  const navigate = useNavigate();
  const meta = useMeta();
  const toast = useToast();

  const length = meta?.otp.length ?? 6;
  const resendCooldown = meta?.otp.resendCooldownSeconds ?? 60;

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ phone?: string; code?: string; password?: string; confirm?: string }>({});
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = phone.trim();
    if (trimmed.length < 7) {
      setFieldError({ phone: 'Enter the mobile number on your account.' });
      return;
    }
    setPending(true);
    setError(null);
    setFieldError({});
    try {
      const result = await api.post<{ resendAfterSeconds: number }>('/auth/otp/request', {
        phone: trimmed,
        purpose: 'LOGIN',
      });
      setResendIn(result.resendAfterSeconds ?? resendCooldown);
      setStep('code');
      toast.push('We sent a reset code to your phone.', 'success');
    } catch (cause) {
      setError(errorMessage(cause, 'We could not send a reset code.'));
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: typeof fieldError = {};
    if (code.trim().length < 4) next.code = `Enter the ${length}-digit code we sent you.`;
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setFieldError(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    setError(null);
    try {
      await api.post('/auth/password/reset', { phone: phone.trim(), code: code.trim(), password });
      toast.push('Password updated. Sign in with your new password.', 'success');
      navigate('/login', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause, 'We could not reset your password.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-canvas-alt">
      <section className="mx-auto flex max-w-[560px] flex-col gap-6 px-6 py-12 md:py-16">
        <div className="rounded-[20px] border border-border bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-col gap-5">
            <span className="gt-badge gt-badge-primary self-start">ACCOUNT RECOVERY</span>

            <div className="flex flex-col gap-2.5">
              <h1 className="text-[30px] font-bold leading-[1.2] text-heading">Reset Password</h1>
              <p className="text-[14px] text-muted">
                {step === 'phone'
                  ? 'Enter the mobile number on your account. We will text you a reset code.'
                  : `Enter the code sent to ${phone} and choose a new password.`}
              </p>
            </div>

            {step === 'phone' ? (
              <form className="flex flex-col gap-5" onSubmit={requestCode} noValidate>
                <TextField
                  label="Phone Number"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+63 917 555 0182"
                  leadingIcon="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  error={fieldError.phone}
                  hint="We only use this to confirm it is really you."
                />

                {error ? (
                  <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" block loading={pending}>
                  Send Reset Code
                </Button>

                <Link to="/login" className="gt-btn gt-btn-secondary gt-btn-block">
                  Back to Sign In
                </Link>
              </form>
            ) : (
              <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
                <TextField
                  label="Reset Code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={length}
                  placeholder={'•'.repeat(length)}
                  leadingIcon="key"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  error={fieldError.code}
                  hint={`The code expires in ${countdownLabel(meta?.otp.ttlSeconds ?? 300)}.`}
                />

                <TextField
                  label="New Password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  leadingIcon="lock"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={fieldError.password}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="flex h-7 w-7 items-center justify-center rounded-[6px] hover:bg-canvas-alt"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
                    </button>
                  }
                />

                <TextField
                  label="Confirm New Password"
                  name="confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat the new password"
                  leadingIcon="lock"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  error={fieldError.confirm}
                />

                {error ? (
                  <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" block loading={pending}>
                  Update Password
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
                  <button
                    type="button"
                    onClick={() => void requestCode()}
                    disabled={resendIn > 0 || pending}
                    className={`font-semibold ${resendIn > 0 ? 'cursor-not-allowed text-muted' : 'text-primary hover:underline'}`}
                  >
                    {resendIn > 0 ? `Resend in ${countdownLabel(resendIn)}` : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('phone');
                      setCode('');
                      setError(null);
                    }}
                    className="font-semibold text-muted hover:text-heading"
                  >
                    Use a different number
                  </button>
                </div>
              </form>
            )}

            <div className="gt-notice gt-notice-primary">
              <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-primary" />
              <p>
                <span className="font-bold text-heading">Signing out everywhere</span>
                <br />
                For your safety, resetting a password ends every active session on all devices.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted">
          Still stuck? Contact support from the numbers listed on our{' '}
          <Link to="/" className="font-semibold text-primary hover:underline">
            homepage
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

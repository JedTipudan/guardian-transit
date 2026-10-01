import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Field, Notice, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../state/AuthContext';
import { roleHome } from '../../components/Guards';
import { useDocumentTitle } from '../../lib/hooks';

interface RegisterPayload {
  userId?: string;
  phone?: string;
  requiresOtp: boolean;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
  user?: import('../../lib/types').User;
}

/** Mirrors the server's password policy (server/src/lib/password.ts). */
function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters.');
  if (password.length > 128) issues.push('Password is too long.');
  if (!/[A-Za-z]/.test(password)) issues.push('Include at least one letter.');
  if (!/[0-9]/.test(password)) issues.push('Include at least one number.');
  return issues;
}

type FormErrors = Partial<Record<
  'name' | 'phone' | 'email' | 'password' | 'confirm' | 'school' | 'grade' | 'homeAddress' | 'terms',
  string
>>;

/** Student registration — Figma "Student · Registration" (step 1 of 2). */
export default function StudentRegister() {
  useDocumentTitle('Create student account · Guardian Transit');
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): FormErrors {
    const next: FormErrors = {};
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    if (firstName.length < 2) next.name = 'Enter your first and last name.';
    else if (lastName.length < 2) next.name = 'Enter your last name too, exactly as your school records it.';
    if (phone.trim().length < 7 || phone.trim().length > 20) next.phone = 'Enter a valid mobile number.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    const issues = passwordIssues(password);
    if (issues.length) next.password = issues[0];
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    if (school.trim().length < 2) next.school = 'Tell us which school you attend.';
    if (!grade.trim()) next.grade = 'Tell us your grade level.';
    if (homeAddress.trim().length < 4) next.homeAddress = 'Enter your home address for pickups.';
    if (!agreed) next.terms = 'Please accept the Terms and Privacy Policy to continue.';
    return next;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const parts = name.trim().split(/\s+/).filter(Boolean);

    setPending(true);
    setError(null);
    try {
      const payload = await api.post<RegisterPayload>('/auth/register', {
        role: 'STUDENT',
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password,
        school: school.trim(),
        grade: grade.trim(),
        homeAddress: homeAddress.trim(),
      });

      if (!payload.requiresOtp && payload.user) {
        setUser(payload.user);
        navigate(roleHome[payload.user.role], { replace: true });
        return;
      }

      navigate('/verify-otp', {
        replace: true,
        state: {
          phone: payload.phone,
          purpose: 'REGISTRATION',
          expiresInSeconds: payload.expiresInSeconds,
          resendAfterSeconds: payload.resendAfterSeconds,
        },
      });
    } catch (cause) {
      setError(errorMessage(cause, 'We could not create your account.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-canvas-alt">
      <section className="mx-auto flex w-full max-w-[440px] flex-col gap-[22px] px-6 py-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-primary-soft text-primary">
              <Icon name="shield-check" size={28} />
            </span>
            <span className="text-[17px] font-bold text-navy">Guardian Transit</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-bold leading-[1.2] text-heading">Create your account</h1>
          <p className="text-[14px] text-muted">A safer way home, connected to your family.</p>
        </div>

        <span className="gt-badge gt-badge-primary self-start">STEP 1 OF 2 · YOUR DETAILS</span>

        <form className="flex flex-col gap-[18px]" onSubmit={onSubmit} noValidate>
          <TextField
            label="Full name"
            name="fullName"
            autoComplete="name"
            placeholder="Maya Santos"
            leadingIcon="user-round"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            hint="First and last name, as your school records them."
          />

          <TextField
            label="Phone number"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+63 917 555 0148"
            leadingIcon="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={errors.phone}
            hint="We send a one-time code to verify this number."
          />

          <TextField
            label="Email (optional)"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            leadingIcon="message-square"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            leadingIcon="lock"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            hint="Use at least 8 characters, including a number."
          />

          <TextField
            label="Confirm password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            leadingIcon="lock"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={errors.confirm}
          />

          <div className="flex flex-col gap-4 rounded-[12px] bg-canvas-alt p-4">
            <p className="text-[13px] font-bold text-heading">Student details</p>
            <TextField
              label="School"
              name="school"
              placeholder="San Isidro Academy"
              leadingIcon="id"
              value={school}
              onChange={(event) => setSchool(event.target.value)}
              error={errors.school}
            />
            <TextField
              label="Grade"
              name="grade"
              placeholder="Grade 11"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              error={errors.grade}
            />
            <TextField
              label="Home address"
              name="homeAddress"
              placeholder="18 Mabini St, San Roque"
              leadingIcon="map-pin"
              value={homeAddress}
              onChange={(event) => setHomeAddress(event.target.value)}
              error={errors.homeAddress}
              hint="Used as your default pickup point."
            />
            <Notice tone="primary" icon="id">
              Your student code is generated for you right after verification — share it with a guardian to
              connect.
            </Notice>
          </div>

          <Notice tone="primary" icon="shield-check" title="Your location, your active trip">
            Your guardian sees your live location only while you are riding.
          </Notice>

          <label className="flex items-start gap-2.5 text-[12px] text-muted">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded-[4px] border border-border accent-[#2463EB]"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              I agree to the{' '}
              <span className="font-semibold text-heading">Terms and Privacy Policy</span>.
              {errors.terms ? <span className="gt-error-text mt-1 block">{errors.terms}</span> : null}
            </span>
          </label>

          {error ? (
            <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <Field>
            <Button type="submit" loading={pending} block trailingIcon="arrow-right">
              Create account
            </Button>
          </Field>

          <p className="text-center text-[13px] text-muted">
            Already registered?{' '}
            <Link to="/student/login" className="font-semibold text-primary hover:underline">
              Login
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}

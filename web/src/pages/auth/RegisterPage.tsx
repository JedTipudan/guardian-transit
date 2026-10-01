import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, TextField, Notice } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';

type Role = 'STUDENT' | 'PARENT' | 'DRIVER';

interface RegisterPayload {
  userId: string;
  phone: string;
  requiresOtp: boolean;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

const roleOptions: { value: Role; label: string; blurb: string }[] = [
  { value: 'STUDENT', label: 'Student', blurb: 'Book rides and earn Guardian Points.' },
  { value: 'PARENT', label: 'Parent / Guardian', blurb: 'Follow your child’s trips from any browser.' },
  { value: 'DRIVER', label: 'Driver', blurb: 'Accept rides after your documents are verified.' },
];

export default function RegisterPage() {
  useDocumentTitle('Create account · Guardian Transit');
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>('PARENT');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    confirm: '',
    // student
    school: '',
    grade: '',
    homeAddress: '',
    // parent
    address: '',
    // driver
    licenseNumber: '',
    licenseExpiry: '',
    licenseClass: '',
    vehicleNickname: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleColor: '',
    plateNumber: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (form.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
    if (form.lastName.trim().length < 2) next.lastName = 'Enter your last name.';
    if (form.phone.trim().length < 7) next.phone = 'Enter a valid mobile number.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match.';
    if (role === 'STUDENT') {
      if (!form.school.trim()) next.school = 'Tell us which school you attend.';
      if (!form.grade.trim()) next.grade = 'Tell us your grade level.';
      if (form.homeAddress.trim().length < 4) next.homeAddress = 'Enter your home address for pickups.';
    }
    if (role === 'DRIVER') {
      if (form.licenseNumber.trim().length < 4) next.licenseNumber = 'Driver licence number is required.';
      if (!form.licenseExpiry) next.licenseExpiry = 'Licence expiry date is required.';
      if (!form.vehicleNickname.trim()) next.vehicleNickname = 'Give your vehicle a nickname.';
      if (!form.vehicleMake.trim()) next.vehicleMake = 'Enter the vehicle make.';
      if (!form.vehicleModel.trim()) next.vehicleModel = 'Enter the vehicle model.';
      if (!form.vehicleColor.trim()) next.vehicleColor = 'Enter the vehicle colour.';
      if (form.plateNumber.trim().length < 2) next.plateNumber = 'Enter the plate number.';
    }
    return next;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    setError(null);
    try {
      const payload = await api.post<RegisterPayload>('/auth/register', {
        role,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        ...(role === 'STUDENT'
          ? { school: form.school.trim(), grade: form.grade.trim(), homeAddress: form.homeAddress.trim() }
          : {}),
        ...(role === 'PARENT' ? { address: form.address.trim() || undefined } : {}),
        ...(role === 'DRIVER'
          ? {
              licenseNumber: form.licenseNumber.trim(),
              licenseExpiry: form.licenseExpiry,
              licenseClass: form.licenseClass.trim() || undefined,
              vehicle: {
                nickname: form.vehicleNickname.trim(),
                make: form.vehicleMake.trim(),
                model: form.vehicleModel.trim(),
                color: form.vehicleColor.trim(),
                plateNumber: form.plateNumber.trim().toUpperCase(),
              },
            }
          : {}),
      });

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
      <section className="mx-auto grid max-w-[1440px] items-start gap-10 px-6 py-10 md:px-10 lg:grid-cols-[1fr_520px] lg:gap-12 lg:py-16 xl:px-20">
        <div className="hidden flex-col gap-5 rounded-[20px] bg-navy p-8 lg:flex">
          <p className="text-[12px] font-bold uppercase tracking-wide text-navy-text">Join Guardian Transit</p>
          <h1 className="text-[40px] font-bold leading-[1.2] text-white">
            One account for every safe journey.
          </h1>
          <p className="text-[16px] text-navy-text">
            Students book, guardians monitor, drivers carry the trip — and the safety desk sees it all.
          </p>
          <ul className="mt-2 flex flex-col gap-4 text-[14px] text-navy-text">
            {[
              ['shield-check', 'Drivers and vehicles are verified by an administrator before any ride.'],
              ['radio', 'Live trip updates stream straight to the connected guardian.'],
              ['key', 'Pickup PIN verification protects every handover.'],
              ['gift', 'One completed ride earns one Guardian Point — 50 unlocks a free ride.'],
            ].map(([icon, text]) => (
              <li key={text} className="flex gap-3">
                <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-white" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[20px] border border-border bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-[22px]">
            <span className="gt-badge gt-badge-primary self-start">CREATE ACCOUNT</span>
            <div className="flex flex-col gap-2.5">
              <h2 className="text-[30px] font-bold leading-[1.2] text-heading">Get started</h2>
              <p className="text-[14px] text-muted">
                Choose your role — we only ask for the details that role needs.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Account type">
              {roleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={role === option.value}
                  onClick={() => setRole(option.value)}
                  className={`rounded-[12px] border px-2 py-2.5 text-[12px] font-semibold transition ${
                    role === option.value
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border bg-white text-muted hover:text-heading'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="-mt-3 text-[12px] text-muted">{roleOptions.find((o) => o.value === role)?.blurb}</p>

            <form className="flex flex-col gap-[18px]" onSubmit={onSubmit} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="First Name"
                  name="firstName"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={update('firstName')}
                  error={errors.firstName}
                />
                <TextField
                  label="Last Name"
                  name="lastName"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={update('lastName')}
                  error={errors.lastName}
                />
              </div>

              <TextField
                label="Mobile Number"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+63 917 555 0148"
                leadingIcon="phone"
                value={form.phone}
                onChange={update('phone')}
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
                value={form.email}
                onChange={update('email')}
                error={errors.email}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  leadingIcon="lock"
                  value={form.password}
                  onChange={update('password')}
                  error={errors.password}
                  hint="At least 8 characters with a number."
                />
                <TextField
                  label="Confirm Password"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  leadingIcon="lock"
                  value={form.confirm}
                  onChange={update('confirm')}
                  error={errors.confirm}
                />
              </div>

              {role === 'STUDENT' ? (
                <div className="flex flex-col gap-4 rounded-[12px] bg-canvas-alt p-4">
                  <p className="text-[13px] font-bold text-heading">Student details</p>
                  <TextField
                    label="School"
                    name="school"
                    placeholder="San Isidro Academy"
                    leadingIcon="id"
                    value={form.school}
                    onChange={update('school')}
                    error={errors.school}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Grade"
                      name="grade"
                      placeholder="Grade 11"
                      value={form.grade}
                      onChange={update('grade')}
                      error={errors.grade}
                    />
                    <TextField
                      label="Home Address"
                      name="homeAddress"
                      placeholder="18 Mabini St, San Roque"
                      value={form.homeAddress}
                      onChange={update('homeAddress')}
                      error={errors.homeAddress}
                    />
                  </div>
                </div>
              ) : null}

              {role === 'PARENT' ? (
                <div className="flex flex-col gap-4 rounded-[12px] bg-canvas-alt p-4">
                  <p className="text-[13px] font-bold text-heading">Guardian details</p>
                  <TextField
                    label="Home address (optional)"
                    name="address"
                    placeholder="18 Mabini St, San Roque"
                    leadingIcon="map-pin"
                    value={form.address}
                    onChange={update('address')}
                  />
                  <Notice tone="primary" icon="users">
                    After signing in, link your child using the student code printed on their profile to follow their
                    trips.
                  </Notice>
                </div>
              ) : null}

              {role === 'DRIVER' ? (
                <div className="flex flex-col gap-4 rounded-[12px] bg-canvas-alt p-4">
                  <p className="text-[13px] font-bold text-heading">Driver &amp; vehicle details</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Licence Number"
                      name="licenseNumber"
                      value={form.licenseNumber}
                      onChange={update('licenseNumber')}
                      error={errors.licenseNumber}
                    />
                    <TextField
                      label="Licence Expiry"
                      name="licenseExpiry"
                      type="date"
                      value={form.licenseExpiry}
                      onChange={update('licenseExpiry')}
                      error={errors.licenseExpiry}
                    />
                  </div>
                  <TextField
                    label="Licence Class (optional)"
                    name="licenseClass"
                    placeholder="Professional"
                    value={form.licenseClass}
                    onChange={update('licenseClass')}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Vehicle Nickname"
                      name="vehicleNickname"
                      placeholder="Blue BaoBao"
                      value={form.vehicleNickname}
                      onChange={update('vehicleNickname')}
                      error={errors.vehicleNickname}
                    />
                    <TextField
                      label="Plate Number"
                      name="plateNumber"
                      placeholder="BB 2048"
                      value={form.plateNumber}
                      onChange={update('plateNumber')}
                      error={errors.plateNumber}
                    />
                    <TextField
                      label="Make"
                      name="vehicleMake"
                      placeholder="BaoBao"
                      value={form.vehicleMake}
                      onChange={update('vehicleMake')}
                      error={errors.vehicleMake}
                    />
                    <TextField
                      label="Model"
                      name="vehicleModel"
                      placeholder="Tuktuk"
                      value={form.vehicleModel}
                      onChange={update('vehicleModel')}
                      error={errors.vehicleModel}
                    />
                    <TextField
                      label="Colour"
                      name="vehicleColor"
                      placeholder="Blue"
                      value={form.vehicleColor}
                      onChange={update('vehicleColor')}
                      error={errors.vehicleColor}
                    />
                  </div>
                  <Notice tone="primary" icon="file-check">
                    Your licence and vehicle documents are reviewed by the safety desk before you receive any ride
                    requests.
                  </Notice>
                </div>
              ) : null}

              {error ? (
                <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] text-danger" role="alert">
                  {error}
                </p>
              ) : null}

              <Field>
                <Button type="submit" loading={pending} block trailingIcon="arrow-right">
                  Create Account
                </Button>
              </Field>

              <p className="text-center text-[13px] text-muted">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

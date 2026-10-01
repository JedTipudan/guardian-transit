import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { initials } from '../lib/format';

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'navy';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'gt-btn-primary',
  secondary: 'gt-btn-secondary',
  danger: 'gt-btn-danger',
  ghost: 'gt-btn-ghost',
  navy: 'gt-btn-navy',
};

const sizeClass: Record<Size, string> = {
  sm: 'gt-btn-sm',
  md: '',
  lg: 'gt-btn-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  icon?: string;
  trailingIcon?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    icon,
    trailingIcon,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'gt-btn',
        variantClass[variant],
        sizeClass[size],
        block ? 'gt-btn-block' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
      {trailingIcon && !loading ? <Icon name={trailingIcon} size={size === 'sm' ? 15 : 17} /> : null}
    </button>
  );
});

export interface LinkButtonProps {
  to: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: string;
  trailingIcon?: string;
  className?: string;
  children: ReactNode;
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  trailingIcon,
  className = '',
  children,
}: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={['gt-btn', variantClass[variant], sizeClass[size], block ? 'gt-btn-block' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={size === 'sm' ? 15 : 17} /> : null}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Spinner / status                                                            */
/* -------------------------------------------------------------------------- */

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-muted">
      <Spinner size={26} className="text-primary" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}

export function Skeleton({ className = '', height = 16 }: { className?: string; height?: number }) {
  return <div className={`gt-skeleton ${className}`} style={{ height }} />;
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

type BadgeTone = 'primary' | 'success' | 'danger' | 'neutral' | 'warning' | 'navy';

const badgeClass: Record<BadgeTone, string> = {
  primary: 'gt-badge-primary',
  success: 'gt-badge-success',
  danger: 'gt-badge-danger',
  neutral: 'gt-badge-neutral',
  warning: 'gt-badge-warning',
  navy: 'gt-badge-navy',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className = '',
}: {
  tone?: BadgeTone;
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={['gt-badge', badgeClass[tone], className].filter(Boolean).join(' ')}>
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export function Avatar({
  name,
  src,
  size = 40,
  tone = 'primary',
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: number;
  tone?: 'primary' | 'navy' | 'success';
  className?: string;
}) {
  const bg =
    tone === 'navy' ? 'bg-navy text-white' : tone === 'success' ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary';
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${bg} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Form field                                                                  */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className = '',
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={['gt-field', className].filter(Boolean).join(' ')}>
      {label ? (
        <label className="gt-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <p className="gt-error-text">{error}</p> : hint ? <p className="gt-hint">{hint}</p> : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string | null;
  leadingIcon?: string;
  trailing?: ReactNode;
  wrapClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, leadingIcon, trailing, wrapClassName, id, className = '', ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  const input = leadingIcon ? (
    <span className="gt-input-icon">
      <span className="gt-input-lead">
        <Icon name={leadingIcon} size={17} />
      </span>
      <input
        ref={ref}
        id={inputId}
        className={`gt-input ${className}`}
        aria-invalid={error ? 'true' : undefined}
        {...rest}
      />
      {trailing ? <span className="gt-input-trail">{trailing}</span> : null}
    </span>
  ) : (
    <span className="relative flex w-full items-center">
      <input
        ref={ref}
        id={inputId}
        className={`gt-input ${className}`}
        aria-invalid={error ? 'true' : undefined}
        {...rest}
      />
      {trailing ? <span className="gt-input-trail">{trailing}</span> : null}
    </span>
  );

  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId} className={wrapClassName}>
      {input}
    </Field>
  );
});

export function TextareaField({
  label,
  hint,
  error,
  className = '',
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
}) {
  const id = rest.id ?? rest.name;
  return (
    <div className="gt-field">
      {label ? (
        <label className="gt-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <textarea
        id={id}
        className={`gt-input min-h-[110px] resize-y ${className}`}
        aria-invalid={error ? 'true' : undefined}
        {...rest}
      />
      {error ? <p className="gt-error-text">{error}</p> : hint ? <p className="gt-hint">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  className = '',
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
}) {
  const id = rest.id ?? rest.name;
  return (
    <div className="gt-field">
      {label ? (
        <label className="gt-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <select id={id} className={`gt-input appearance-none ${className}`} {...rest}>
        {children}
      </select>
      {error ? <p className="gt-error-text">{error}</p> : hint ? <p className="gt-hint">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Notices, empty & error states                                               */
/* -------------------------------------------------------------------------- */

export function Notice({
  tone = 'primary',
  icon = 'info',
  title,
  children,
  className = '',
}: {
  tone?: 'primary' | 'success' | 'danger' | 'neutral';
  icon?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const toneClass = {
    primary: 'gt-notice-primary',
    success: 'gt-notice-success',
    danger: 'gt-notice-danger',
    neutral: 'gt-notice-neutral',
  }[tone];
  const iconColor =
    tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : tone === 'neutral' ? 'text-muted' : 'text-primary';

  return (
    <div className={['gt-notice', toneClass, className].filter(Boolean).join(' ')}>
      <span className={`mt-0.5 shrink-0 ${iconColor}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        {title ? <p className="mb-1 font-bold text-heading">{title}</p> : null}
        <div className="[&_a]:font-semibold [&_a]:text-primary">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-border bg-surface px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="text-[15px] font-bold text-heading">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  title = 'We could not load this',
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-border bg-surface px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-danger-soft text-danger">
        <Icon name="alert-triangle" size={22} />
      </span>
      <div>
        <p className="text-[15px] font-bold text-heading">{title}</p>
        <p className="mt-1 max-w-sm text-[13px] text-muted">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" icon="refresh-cw" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`gt-fade-in relative z-10 max-h-[92vh] w-full ${width} overflow-y-auto rounded-t-[20px] border border-border bg-surface shadow-pop sm:rounded-[20px]`}
      >
        {title ? (
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-[17px] font-bold text-heading">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] text-muted transition hover:bg-canvas-alt hover:text-heading"
              aria-label="Close"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        ) : null}
        <div className="px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative flex h-6 w-11 shrink-0 items-center rounded-full p-[3px] transition ${
        checked ? 'bg-primary' : 'bg-border'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className={`h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-[12px] px-3 py-2 text-[12px] font-semibold transition ${
            value === option.value
              ? 'bg-primary-soft text-primary'
              : 'bg-surface text-muted border border-border hover:text-heading'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'icon';

const BASE =
  'inline-flex items-center justify-center gap-xs rounded-lg font-semibold select-none whitespace-nowrap ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out ' +
  'motion-safe:active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary shadow-primary-md hover:bg-primary-container',
  secondary: 'border border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container',
  ghost: 'text-primary hover:bg-primary/5',
  danger: 'bg-error text-on-error hover:bg-on-error-container',
  gold: 'border border-tertiary-container bg-tertiary-fixed text-on-tertiary-fixed-variant hover:bg-tertiary-fixed-dim',
};

// Heights keep every target >= 32px (WCAG 2.5.8 asks for 24px).
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-sm py-xs text-body-sm',
  md: 'min-h-10 px-md py-sm text-body-sm',
  icon: 'h-9 w-9 p-0',
};

/** Classes for a button-styled element (use on <Link> too). */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Material Symbols name shown before the label. */
  icon?: string;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, cn(icon && size !== 'icon' ? 'pl-sm' : undefined, className))}
      {...rest}
    >
      {loading ? (
        <Icon name="progress_activity" size={18} className="motion-safe:animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={18} />
      ) : null}
      {children}
    </button>
  );
}

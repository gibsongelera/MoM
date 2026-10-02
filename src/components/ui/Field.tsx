'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Text input / select / textarea styling. The border uses `outline`
 * (#8e706c, ~4.5:1 on white) so the field boundary is visible
 * (WCAG 1.4.11 needs 3:1); the old outline-variant border was ~1.7:1.
 */
export const inputClass =
  'w-full rounded-lg border border-outline bg-surface-container-lowest px-md py-sm font-body-sm text-body-sm ' +
  'text-on-surface placeholder:text-on-surface-variant/80 focus:border-primary focus:ring-1 focus:ring-primary ' +
  'disabled:opacity-60';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

/**
 * Label + control + hint + error, wired together for assistive tech:
 * the label is bound with htmlFor, hint and error are referenced by
 * aria-describedby, and an error sets aria-invalid.
 *
 *   <Field label="Title" required>
 *     {(p) => <input {...p} className={inputClass} value={…} onChange={…} />}
 *   </Field>
 */
export function Field({
  id: fixedId,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  /** Stable control id (e.g. to focus the first invalid field); generated otherwise. */
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const autoId = useId();
  const id = fixedId ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-xs', className)}>
      <label htmlFor={id} className="font-label-caps text-label-caps uppercase text-on-surface-variant">
        {label}
        {required ? (
          <span className="text-error" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {hint ? (
        <p id={hintId} className="font-caption text-caption text-on-surface-variant">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="font-caption text-caption text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

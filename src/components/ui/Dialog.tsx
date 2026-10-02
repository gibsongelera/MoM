'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { Icon } from './Icon';

/**
 * Modal dialog on the native <dialog> element.
 *
 * showModal() gives us, for free: a focus trap, Escape to close, an inert
 * background, the ::backdrop, top-layer stacking, and focus returning to the
 * opener on close. Enter/exit motion lives in globals.css (.sm-dialog):
 * 180ms ease-out in, 120ms out, and it collapses under reduced motion.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** false while a save is in flight: Escape / backdrop / X won't close it. */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const width = size === 'sm' ? 'max-w-[440px]' : size === 'lg' ? 'max-w-[760px]' : 'max-w-[560px]';

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'sm-dialog w-[calc(100%-32px)] rounded-xl p-0 bg-surface-container-lowest text-on-surface shadow-primary-lg',
        width,
      )}
      onCancel={(e) => {
        // Escape. Keep control in React state rather than letting the element close itself.
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        // A click whose target is the <dialog> itself landed on the backdrop.
        if (dismissible && e.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between gap-md rounded-t-xl bg-primary px-lg py-md text-on-primary">
          <h2 id={titleId} className="flex items-center gap-sm font-h3 text-h3">
            {icon ? <Icon name={icon} size={24} /> : null}
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close dialog"
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-50"
          >
            <Icon name="close" size={24} />
          </button>
        </div>
        <div className="overflow-y-auto p-lg">
          {description ? (
            <p id={descId} className="mb-md font-body-sm text-body-sm text-on-surface-variant">
              {description}
            </p>
          ) : null}
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-sm border-t border-outline-variant px-lg py-md">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}

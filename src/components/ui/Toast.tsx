'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { Icon } from './Icon';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ReactNode;
  leaving: boolean;
}

interface ToastApi {
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 4000;
const EXIT_MS = 150;

/**
 * App-wide toasts.
 *
 * Two always-mounted live regions (polite for success/info, assertive for
 * errors) so screen readers announce new messages (WCAG 4.1.3). Errors stay
 * until dismissed; others auto-dismiss after 4s, paused while hovered or
 * focused (WCAG 2.2.1).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback((kind: ToastKind, message: ReactNode) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-3), { id, kind, message, leaving: false }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  const polite = items.filter((t) => t.kind !== 'error');
  const assertive = items.filter((t) => t.kind === 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        data-toast-region
        className="pointer-events-none fixed right-md top-[80px] z-[60] flex w-[min(380px,calc(100%-32px))] flex-col gap-sm"
      >
        <div role="alert" aria-live="assertive" className="flex flex-col gap-sm">
          {assertive.map((t) => (
            <ToastCard key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </div>
        <div role="status" aria-live="polite" className="flex flex-col gap-sm">
          {polite.map((t) => (
            <ToastCard key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (item.kind === 'error' || paused || item.leaving) return;
    const timer = window.setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, item.kind, item.leaving, paused, onDismiss]);

  const accent =
    item.kind === 'success' ? 'border-l-success' : item.kind === 'error' ? 'border-l-error' : 'border-l-primary';
  const icon = item.kind === 'success' ? 'check_circle' : item.kind === 'error' ? 'error' : 'info';
  const iconColor = item.kind === 'success' ? 'text-success' : item.kind === 'error' ? 'text-error' : 'text-primary';

  return (
    <div
      data-leaving={item.leaving}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'sm-toast pointer-events-auto flex items-start gap-sm rounded-lg border-l-4 bg-surface-container-lowest px-md py-sm',
        'font-body-sm text-body-sm text-on-surface shadow-[0_8px_24px_rgba(0,0,0,0.12)]',
        accent,
      )}
    >
      <Icon name={icon} size={20} className={iconColor} />
      <div className="min-w-0 flex-1">{item.message}</div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="-my-xs -mr-xs flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

/** Toast API. Falls back to no-ops outside the provider (e.g. auth pages). */
export function useToast(): ToastApi {
  return (
    useContext(ToastContext) ?? {
      success: () => {},
      error: () => {},
      info: () => {},
    }
  );
}

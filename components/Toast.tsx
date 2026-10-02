'use client';

// Toast system — React port of SmartMin.toast() from assets/js/shared.js.
// Renders into a fixed #toast-stack using the same .toast classes as the
// original so the look/animation is identical.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'ai' | 'info';

interface ToastItem {
  id: string;
  message: ReactNode;
  type: ToastType;
}

type ToastFn = (message: ReactNode, type?: ToastType, timeout?: number) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastCtx);
}

function iconFor(type: ToastType): string {
  return type === 'success'
    ? 'check_circle'
    : type === 'error'
      ? 'error'
      : type === 'ai'
        ? 'auto_awesome'
        : 'info';
}

function iconColor(type: ToastType): string {
  return type === 'ai'
    ? 'text-tertiary-container'
    : type === 'error'
      ? 'text-error'
      : type === 'success'
        ? 'text-success'
        : 'text-primary';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((x) => x.filter((i) => i.id !== id));
  }, []);

  const toast = useCallback<ToastFn>(
    (message, type = 'success', timeout = 4000) => {
      const id = Math.random().toString(36).slice(2);
      setItems((x) => [...x, { id, message, type }]);
      window.setTimeout(() => dismiss(id), timeout);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toast-stack">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.type}`}>
            <span className={`material-symbols-outlined text-[20px] ${iconColor(i.type)}`}>
              {iconFor(i.type)}
            </span>
            <div className="flex-1 text-on-surface">{i.message}</div>
            <button
              className="text-on-surface-variant hover:text-on-surface"
              onClick={() => dismiss(i.id)}
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

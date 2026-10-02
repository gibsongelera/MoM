'use client';

// Reusable modal overlay — matches the maroon-header overlay idiom used across
// the original app (users, departments, schedule, pre-print).

import { useEffect, type ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  maxWidth = 'max-w-[560px]',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-gutter"
      onClick={onClose}
    >
      <div
        className={`bg-surface-container-lowest rounded-xl shadow-primary-lg w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-primary text-on-primary px-lg py-md flex items-center justify-between rounded-t-xl sticky top-0">
          <h3 className="font-h3 text-h3 flex items-center gap-sm">
            {icon ? <span className="material-symbols-outlined">{icon}</span> : null}
            {title}
          </h3>
          <button onClick={onClose} className="hover:opacity-80" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-lg">{children}</div>
      </div>
    </div>
  );
}

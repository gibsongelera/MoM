import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { Icon } from './Icon';

/**
 * Empty state: what this is, why it's empty, how to start.
 * Static on purpose — no looping animation on something people see often.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: string;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-lg py-xl text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="font-h3 text-h3 text-on-surface">{title}</h3>
      {children ? <div className="max-w-md font-body-sm text-body-sm text-on-surface-variant">{children}</div> : null}
      {action ? <div className="mt-sm">{action}</div> : null}
    </div>
  );
}

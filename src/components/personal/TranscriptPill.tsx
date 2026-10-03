import { TRANSCRIPT_LABEL, type TranscriptStatus } from '@/lib/personal/types';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/ui/cn';

const TONE: Record<TranscriptStatus, string> = {
  none: 'pill-pending',
  processing: 'pill-progress',
  completed: 'pill-done',
  failed: 'pill-overdue',
};

/** Status of a personal recording's transcript. The spinner is the only motion, and it stops under reduced motion. */
export function TranscriptPill({ status, className }: { status: TranscriptStatus; className?: string }) {
  return (
    <span className={cn('pill', TONE[status], className)}>
      {status === 'processing' ? <Icon name="progress_activity" size={14} className="motion-safe:animate-spin" /> : null}
      {TRANSCRIPT_LABEL[status]}
    </span>
  );
}

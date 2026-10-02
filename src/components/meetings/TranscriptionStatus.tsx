'use client';

/**
 * Small status chip for the meeting's latest transcription job. Transcription
 * happens in the background (webhook-delivered), so the secretary can take
 * attendance meanwhile; this keeps them informed without blocking.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { TranscriptionStatus as JobStatus } from '@/lib/types/domain';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/ui/cn';

const LABEL: Record<JobStatus, string> = {
  queued: 'Waiting to transcribe',
  uploading: 'Uploading recording',
  processing: 'Transcribing in the background',
  completed: 'Transcript ready',
  failed: 'Transcription failed',
  cancelled: 'Transcription cancelled',
};

const POLL_MS = 6000;
/** Stop polling after 20 minutes; a stuck job shows its last known state. */
const MAX_POLL_MS = 20 * 60 * 1000;

export default function TranscriptionStatus({
  jobId,
  initialStatus,
}: {
  jobId: string | null;
  initialStatus: JobStatus | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus | null>(initialStatus);

  const pending = status === 'queued' || status === 'uploading' || status === 'processing';

  useEffect(() => {
    if (!jobId || !pending) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - started > MAX_POLL_MS) {
        window.clearInterval(timer);
        return;
      }
      const { data } = await supabase.from('transcription_jobs').select('status').eq('id', jobId).maybeSingle();
      const next = data?.status as JobStatus | undefined;
      if (next && next !== status) {
        setStatus(next);
        if (next === 'completed') router.refresh();
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [jobId, pending, router, status, supabase]);

  if (!status) return null;

  const tone =
    status === 'completed'
      ? 'pill-done'
      : status === 'failed' || status === 'cancelled'
        ? 'pill-overdue'
        : 'pill-progress';
  const icon = status === 'completed' ? 'check_circle' : status === 'failed' || status === 'cancelled' ? 'error' : 'graphic_eq';

  return (
    <span role="status" className={cn('pill', tone)}>
      <Icon name={icon} size={14} />
      {LABEL[status]}
    </span>
  );
}

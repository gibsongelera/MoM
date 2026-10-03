'use client';

/**
 * "Add my own recording" on an institutional meeting a faculty member can
 * see. Creates their private personal_meetings entry linked to the meeting
 * (the 0018 trigger re-checks they can see it); the page then shows the
 * recording panel for it. The official recording/transcript is untouched.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function AddMyRecordingButton({
  meeting,
  userId,
}: {
  meeting: { id: string; title: string; starts_at: string; venue: string | null; duration_min: number | null };
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const starts = new Date(meeting.starts_at);
    const { data, error } = await supabase
      .from('personal_meetings')
      .insert({
        user_id: userId,
        meeting_id: meeting.id,
        title: meeting.title,
        meeting_date: starts.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
        meeting_time: starts.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }),
        type: 'Department meeting',
        status: starts.getTime() > Date.now() ? 'scheduled' : 'done',
        mode: 'in_person',
        location: meeting.venue,
        duration_min: meeting.duration_min,
      })
      .select('id');
    setBusy(false);
    if (error || !data?.length) {
      toast.error(`Couldn't start your recording entry. ${error?.message ?? ''}`);
      return;
    }
    router.refresh();
  }

  return (
    <Button icon="mic" onClick={create} loading={busy}>
      Add my own recording
    </Button>
  );
}

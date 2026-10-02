import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import LiveRecordingForm from '@/components/dashboard/LiveRecordingForm';

export const metadata: Metadata = { title: 'Live Recording | ZPPSU SmartMin' };

export default async function SecretaryLiveRecordingPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m: preselect } = await searchParams;
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at, venue')
    .order('starts_at', { ascending: false })
    .limit(50);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Live Recording</h1>
        <p className="font-body-lg text-on-surface-variant">
          Record from this device&apos;s microphone. When you stop, the recording uploads and is transcribed in the background,
          and you go straight to attendance.
        </p>
      </header>
      <LiveRecordingForm meetings={meetings ?? []} preselectId={preselect} />
    </>
  );
}

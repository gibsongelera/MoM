import { createClient } from '@/lib/supabase/server';
import LiveRecordingForm from '@/components/dashboard/LiveRecordingForm';

export default async function SecretaryLiveRecordingPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m: preselect } = await searchParams;
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at, venue')
    .order('starts_at', { ascending: false })
    .limit(50);

  const ordered = preselect
    ? [...(meetings ?? [])].sort((a, b) => (a.id === preselect ? -1 : b.id === preselect ? 1 : 0))
    : (meetings ?? []);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Live Recording</h1>
        <p className="font-body-lg text-on-surface-variant">
          Record directly from your microphone. On stop, the recording uploads and is transcribed automatically.
        </p>
      </header>
      <LiveRecordingForm meetings={ordered} />
    </>
  );
}

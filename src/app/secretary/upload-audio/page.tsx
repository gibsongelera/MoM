import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import UploadAudioForm from '@/components/dashboard/UploadAudioForm';

export const metadata: Metadata = { title: 'Upload Audio | ZPPSU SmartMin' };

export default async function SecretaryUploadAudioPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m: preselect } = await searchParams;
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at')
    .order('starts_at', { ascending: false })
    .limit(50);

  const ordered = preselect
    ? [...(meetings ?? [])].sort((a, b) => (a.id === preselect ? -1 : b.id === preselect ? 1 : 0))
    : (meetings ?? []);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Upload Audio</h1>
        <p className="font-body-lg text-on-surface-variant">
          Recorded somewhere without internet? Upload the file here (or from the meeting&apos;s page). It&apos;s transcribed in the
          background, and the minutes draft themselves once the transcript is ready.
        </p>
      </header>
      <UploadAudioForm meetings={ordered} />
    </>
  );
}

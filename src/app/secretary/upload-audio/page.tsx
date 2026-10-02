import { createClient } from '@/lib/supabase/server';
import UploadAudioForm from '@/components/dashboard/UploadAudioForm';

export default async function SecretaryUploadAudioPage() {
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at')
    .order('starts_at', { ascending: false })
    .limit(50);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Upload Audio</h1>
        <p className="font-body-lg text-on-surface-variant">
          Uploads go straight to Supabase Storage, then to ElevenLabs Scribe v2 for transcription. Minutes and action
          items draft automatically once the transcript is ready.
        </p>
      </header>
      <UploadAudioForm meetings={meetings ?? []} />
    </>
  );
}

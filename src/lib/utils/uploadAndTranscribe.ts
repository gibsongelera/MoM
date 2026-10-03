import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAudioMimeType } from '@/lib/meetings/files';

/**
 * Shared by UploadAudioForm (file picker) and LiveRecordingForm (MediaRecorder
 * blob) - same three-step pipeline either way: signed direct upload to
 * Storage, mark the audio_recordings row uploaded, submit to /api/transcribe.
 * The webhook handles everything after that.
 */
export async function uploadAndTranscribe(
  supabase: SupabaseClient,
  params: { meetingId: string; file: File | Blob; mimeType: string; language: 'auto' | 'eng' | 'fil' | 'ceb' },
): Promise<{ jobId: string }> {
  // Normalise to a type the route and the meeting-audio bucket accept: strips
  // codec parameters (`audio/webm;codecs=opus`) and maps aliases such as the
  // `video/webm` Chrome reports for a saved .webm recording. The bucket checks
  // the uploaded part's Content-Type, so the file is re-labelled too (slice()
  // re-types the Blob without copying it).
  const name = params.file instanceof File ? params.file.name : undefined;
  const mimeType = resolveAudioMimeType({ type: params.mimeType, name });
  if (!mimeType) throw new Error("That file type isn't supported. Use an audio file such as MP3, M4A, WAV, OGG or WEBM.");
  const body = params.file.type === mimeType ? params.file : params.file.slice(0, params.file.size, mimeType);

  const upRes = await fetch('/api/audio/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ meetingId: params.meetingId, mimeType, language: params.language }),
  });
  if (!upRes.ok) throw new Error((await upRes.json().catch(() => null))?.error ?? 'Could not get an upload URL.');
  const { audioId, objectPath, token } = await upRes.json();

  const { error: uploadError } = await supabase.storage.from('meeting-audio').uploadToSignedUrl(objectPath, token, body);
  if (uploadError) throw uploadError;

  const { error: markError } = await supabase
    .from('audio_recordings')
    .update({ storage_path: objectPath, uploaded_at: new Date().toISOString() })
    .eq('id', audioId);
  if (markError) throw markError;

  const subRes = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audioId, language: params.language }),
  });
  if (!subRes.ok) throw new Error((await subRes.json().catch(() => null))?.error ?? 'Could not submit for transcription.');
  const { jobId } = await subRes.json();
  return { jobId };
}

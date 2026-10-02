import type { SupabaseClient } from '@supabase/supabase-js';

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
  // MediaRecorder's negotiated mimeType is a full media-type param string
  // like `audio/webm;codecs=opus` - /api/audio/upload-url validates against a
  // bare-mimeType allowlist (z.enum(['audio/webm', ...])), so the exact
  // string with `;codecs=...` still attached fails validation with a 400.
  // The Blob itself (params.file) keeps the full string as its Content-Type
  // for the actual storage upload; only the JSON sent to our own route needs
  // the base type.
  const baseMimeType = params.mimeType.split(';')[0]?.trim() || params.mimeType;

  const upRes = await fetch('/api/audio/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ meetingId: params.meetingId, mimeType: baseMimeType, language: params.language }),
  });
  if (!upRes.ok) throw new Error((await upRes.json().catch(() => null))?.error ?? 'Could not get an upload URL.');
  const { audioId, objectPath, token } = await upRes.json();

  const { error: uploadError } = await supabase.storage.from('meeting-audio').uploadToSignedUrl(objectPath, token, params.file);
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

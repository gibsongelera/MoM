// Supabase Storage helpers (browser client — RLS enforced by the policies in
// supabase/migrations/0004_storage.sql). Both buckets are private, so display
// URLs are short-lived signed URLs. Object paths carry the authorisation key:
//   avatars/<user_id>/<file>          meeting-audio/<meeting_id>/<audio_id>.<ext>
import { createClient } from '@/lib/supabase/client';

const AVATARS = 'avatars';
const MEETING_AUDIO = 'meeting-audio';
const SIGNED_TTL = 60 * 60; // 1 hour

function extFor(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'webm';
}

/** Convert a data: URL to a Blob (profile page produces a downscaled JPEG dataURL). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ---------------- Avatars ----------------
export async function uploadAvatar(userId: string, file: Blob): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/avatar-${Date.now()}.${extFor(file.type)}`;
  const { error } = await supabase.storage
    .from(AVATARS)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
  if (error) throw error;
  return path; // persisted in profiles.photo_path
}

export async function signedAvatarUrl(path?: string | null): Promise<string> {
  if (!path) return '';
  const { data } = await createClient().storage.from(AVATARS).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? '';
}

/** Batch-resolve many avatar paths to signed URLs, keyed by path. */
export async function signedAvatarUrls(paths: string[]): Promise<Record<string, string>> {
  const clean = Array.from(new Set(paths.filter(Boolean)));
  if (!clean.length) return {};
  const { data } = await createClient().storage.from(AVATARS).createSignedUrls(clean, SIGNED_TTL);
  const map: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.signedUrl && d.path) map[d.path] = d.signedUrl;
  });
  return map;
}

// ---------------- Meeting audio ----------------
/** Batch-resolve meeting-audio object paths to signed playback URLs, keyed by path. */
export async function signedAudioUrls(paths: string[]): Promise<Record<string, string>> {
  const clean = Array.from(new Set(paths.filter(Boolean)));
  if (!clean.length) return {};
  const { data } = await createClient().storage.from(MEETING_AUDIO).createSignedUrls(clean, SIGNED_TTL);
  const map: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.signedUrl && d.path) map[d.path] = d.signedUrl;
  });
  return map;
}


/** Upload a recording to the meeting-audio bucket and register an audio_recordings row. */
export async function uploadRecording(
  meetingId: string,
  audioId: string,
  blob: Blob,
  meta: { durationSec: number; language: string; createdBy: string },
): Promise<{ path: string; id: string | null }> {
  const supabase = createClient();
  const mime = blob.type || 'audio/webm';
  const path = `${meetingId}/${audioId}.${extFor(mime)}`;
  const { error } = await supabase.storage
    .from(MEETING_AUDIO)
    .upload(path, blob, { contentType: mime, upsert: true });
  if (error) throw error;

  const { data, error: rowErr } = await supabase
    .from('audio_recordings')
    .insert({
      meeting_id: meetingId,
      storage_path: path,
      duration_sec: meta.durationSec,
      language: meta.language,
      mime_type: mime,
      uploaded_at: new Date().toISOString(),
      created_by: meta.createdBy,
    })
    .select('id')
    .single();
  if (rowErr) throw rowErr;
  return { path, id: data?.id ?? null };
}

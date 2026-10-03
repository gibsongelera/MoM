/**
 * File rules shared by the browser (early, friendly errors) and the API
 * routes / storage buckets (the actual enforcement). Keep in sync with
 * 0004_storage.sql + 0017_meeting_attachments.sql.
 */

/** What browsers report for common audio files; mirrors the meeting-audio bucket. */
export const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
] as const;
export type AudioMimeType = (typeof ALLOWED_AUDIO_TYPES)[number];

/** 500 MB: a 3-hour meeting at 128 kbps is ~170 MB. */
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export type AttachmentKind = 'attendance_sheet' | 'panel_notes' | 'evidence' | 'other';
export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  attendance_sheet: 'Attendance sheet',
  panel_notes: 'Panel notes',
  evidence: 'Photo / evidence',
  other: 'Other',
};

/** Strips codec parameters: "audio/webm;codecs=opus" -> "audio/webm". */
export function baseMimeType(type: string): string {
  return type.split(';')[0]?.trim().toLowerCase() || type;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Aliases browsers report for files that are really audio we accept. Chrome on
 * Windows labels a saved `.webm` recording `video/webm` (our own "Save
 * recording to this device" output), and phone recorders often produce
 * `video/mp4` / `audio/mp3`. The audio track is what gets transcribed.
 */
const AUDIO_TYPE_ALIASES: Record<string, AudioMimeType> = {
  'video/webm': 'audio/webm',
  'video/ogg': 'audio/ogg',
  'video/mp4': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/m4a': 'audio/x-m4a',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/opus': 'audio/ogg',
};

/** Used when the browser reports no type at all (common for .m4a / .opus on Windows). */
const AUDIO_TYPE_BY_EXTENSION: Record<string, AudioMimeType> = {
  webm: 'audio/webm',
  weba: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/x-m4a',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

/**
 * The accepted audio MIME type for a file, or null if it isn't one. Checks the
 * reported type first, then known aliases, then the file extension.
 */
export function resolveAudioMimeType(file: { type: string; name?: string }): AudioMimeType | null {
  const type = baseMimeType(file.type || '');
  if ((ALLOWED_AUDIO_TYPES as readonly string[]).includes(type)) return type as AudioMimeType;
  if (AUDIO_TYPE_ALIASES[type]) return AUDIO_TYPE_ALIASES[type];
  const ext = file.name?.split('.').pop()?.toLowerCase();
  if ((!type || type === 'application/octet-stream') && ext && AUDIO_TYPE_BY_EXTENSION[ext]) {
    return AUDIO_TYPE_BY_EXTENSION[ext];
  }
  return null;
}

/** Returns a message for the person uploading, or null when the file is fine. */
export function audioFileProblem(file: { type: string; size: number; name?: string }): string | null {
  if (!resolveAudioMimeType(file)) {
    return "That file type isn't supported. Use an audio file such as MP3, M4A, WAV, OGG or WEBM.";
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_AUDIO_BYTES) return `That file is too large. The limit is ${mb(MAX_AUDIO_BYTES)}.`;
  return null;
}

export function attachmentFileProblem(file: { type: string; size: number }): string | null {
  const type = baseMimeType(file.type);
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(type)) {
    return 'Attach a photo (JPG, PNG, WebP) or a PDF.';
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_ATTACHMENT_BYTES) return `That file is too large. The limit is ${mb(MAX_ATTACHMENT_BYTES)}.`;
  return null;
}

/** File extension for an allowed MIME type. */
export function extensionFor(mimeType: string): string {
  const sub = baseMimeType(mimeType).split('/')[1] ?? 'bin';
  if (sub === 'x-m4a') return 'm4a';
  if (sub === 'x-wav') return 'wav';
  if (sub === 'jpeg') return 'jpg';
  if (sub === 'mpeg') return 'mp3';
  return sub;
}

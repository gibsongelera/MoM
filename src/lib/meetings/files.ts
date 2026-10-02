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

/** Returns a message for the person uploading, or null when the file is fine. */
export function audioFileProblem(file: { type: string; size: number; name?: string }): string | null {
  const type = baseMimeType(file.type);
  if (!(ALLOWED_AUDIO_TYPES as readonly string[]).includes(type)) {
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

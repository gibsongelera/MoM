import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, MAX_AUDIO_BYTES, attachmentFileProblem, audioFileProblem, baseMimeType, extensionFor } from './files';

describe('audio file rules', () => {
  it('accepts recorder output with codec parameters', () => {
    expect(audioFileProblem({ type: 'audio/webm;codecs=opus', size: 1000 })).toBeNull();
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
  });

  it('rejects non-audio, empty and oversized files with a readable reason', () => {
    expect(audioFileProblem({ type: 'video/mp4', size: 1000 })).toMatch(/type/);
    expect(audioFileProblem({ type: 'audio/mpeg', size: 0 })).toMatch(/empty/);
    expect(audioFileProblem({ type: 'audio/mpeg', size: MAX_AUDIO_BYTES + 1 })).toMatch(/500 MB/);
  });
});

describe('attachment rules', () => {
  it('accepts photos and PDFs up to 15 MB', () => {
    expect(attachmentFileProblem({ type: 'image/jpeg', size: 2_000_000 })).toBeNull();
    expect(attachmentFileProblem({ type: 'application/pdf', size: MAX_ATTACHMENT_BYTES })).toBeNull();
  });

  it('rejects other types and oversized files', () => {
    expect(attachmentFileProblem({ type: 'image/heic', size: 1000 })).toMatch(/photo/);
    expect(attachmentFileProblem({ type: 'image/png', size: MAX_ATTACHMENT_BYTES + 1 })).toMatch(/15 MB/);
  });
});

describe('extensionFor', () => {
  it('maps common types', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('audio/x-m4a')).toBe('m4a');
    expect(extensionFor('audio/mpeg')).toBe('mp3');
    expect(extensionFor('application/pdf')).toBe('pdf');
  });
});

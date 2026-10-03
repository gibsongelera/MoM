'use client';

/**
 * Read-only transcript: search, copy, download as .txt. Used for a faculty
 * member's own recordings (and anywhere else a plain read view is enough).
 */
import { useId, useMemo, useState } from 'react';
import type { TranscriptSegment } from '@/lib/types/domain';
import { transcriptToText } from '@/lib/personal/types';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/ui/cn';

const SPEAKER_TONES = ['text-primary', 'text-on-tertiary-fixed-variant', 'text-[#1b5e20]', 'text-[#0d47a1]', 'text-[#6a1b9a]', 'text-[#4e342e]'];

function clock(t: number) {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-tertiary-fixed px-[2px] text-on-surface">
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

export default function TranscriptViewer({ title, segments, language }: { title: string; segments: TranscriptSegment[]; language?: string | null }) {
  const toast = useToast();
  const uid = useId();
  const [query, setQuery] = useState('');
  const q = query.trim();

  const speakerTone = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of segments) if (!map.has(s.speaker)) map.set(s.speaker, SPEAKER_TONES[map.size % SPEAKER_TONES.length]);
    return map;
  }, [segments]);
  const shown = q ? segments.filter((s) => s.text.toLowerCase().includes(q.toLowerCase()) || s.speaker.toLowerCase().includes(q.toLowerCase())) : segments;

  async function copy() {
    try {
      await navigator.clipboard.writeText(transcriptToText(title, segments));
      toast.success('Transcript copied.');
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  function download() {
    const blob = new Blob([transcriptToText(title, segments)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase().slice(0, 60) || 'transcript'}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-labelledby={`${uid}-h`} className="rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant p-md">
        <h2 id={`${uid}-h`} className="flex items-center gap-sm font-h3 text-h3">
          <Icon name="closed_caption" className="text-primary" /> Transcript
          <span className="font-caption text-caption font-normal text-on-surface-variant">
            {segments.length} part{segments.length === 1 ? '' : 's'}
            {language ? ` · ${language}` : ''}
          </span>
        </h2>
        <div className="flex flex-wrap gap-xs">
          <Button size="sm" variant="secondary" icon="content_copy" onClick={copy}>
            Copy
          </Button>
          <Button size="sm" variant="secondary" icon="download" onClick={download}>
            Download .txt
          </Button>
        </div>
      </div>
      <div className="border-b border-outline-variant p-md">
        <label className="relative block">
          <span className="sr-only">Search the transcript</span>
          <Icon name="search" size={20} className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or a speaker" className={cn(inputClass, 'pl-xl')} />
        </label>
        {q ? (
          <p className="mt-xs font-caption text-caption text-on-surface-variant" role="status">
            {shown.length} match{shown.length === 1 ? '' : 'es'}
          </p>
        ) : null}
      </div>
      <ol className="max-h-[560px] divide-y divide-outline-variant/60 overflow-y-auto">
        {shown.map((s, i) => (
          <li key={`${s.t}-${i}`} className="flex gap-md px-md py-sm">
            <span className="w-12 shrink-0 pt-[2px] font-caption text-caption tabular-nums text-on-surface-variant">{clock(s.t)}</span>
            <div className="min-w-0">
              <p className={cn('font-label-caps text-label-caps', speakerTone.get(s.speaker))}>{s.speaker}</p>
              <p className="font-body-md leading-relaxed">{highlight(s.text, q)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

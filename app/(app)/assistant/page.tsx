'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireRole } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useData } from '@/components/DataProvider';
import { scopeMeetings } from '@/lib/scope';
import { chatWithFile, type ChatAnswer, type ChatCitation } from '@/lib/ai-client';
import { fmtTime } from '@/lib/utils';
import type { TranscriptSegment } from '@/lib/types';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  found?: boolean;
}

const SUGGESTIONS = [
  'Summarize the key decisions from this meeting.',
  'What tasks were assigned and to whom?',
  'What deadlines were mentioned?',
];

// Deterministic, no-hallucination fallback: only quotes matching segments.
function localGroundedAnswer(question: string, segments: TranscriptSegment[]): ChatAnswer {
  const stop = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'what', 'who', 'when', 'was', 'were', 'is', 'are', 'did', 'this', 'that', 'meeting']);
  const terms = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  const scored = segments
    .map((s, i) => ({ i, s, score: terms.reduce((acc, t) => acc + (s.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (scored.length === 0) {
    return { answer: "I couldn't find anything about that in this file.", found: false, citations: [] };
  }
  return {
    answer: 'Based on this file, the most relevant passages are quoted below. (On-device grounded search — connect the AI service for full conversational answers.)',
    found: true,
    citations: scored.map((x) => ({ segmentIndex: x.i, speaker: x.s.speaker, t: x.s.t, quote: x.s.text })),
  };
}

function Inner() {
  const { user, ready } = useRequireRole();
  usePageTitle('AI Assistant');
  const params = useSearchParams();

  const { meetings: allMeetings, transcripts, ready: dataReady } = useData();
  const meetings = useMemo(
    () => (user ? scopeMeetings(user, allMeetings).filter((m) => m.aiProcessed) : []),
    [user, allMeetings],
  );

  const [activeId, setActiveId] = useState('');
  const [allMode, setAllMode] = useState(false);
  const [tab, setTab] = useState<'summary' | 'notes' | 'transcript'>('summary');
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  // Cross-meeting grounding (rec #10): all processed transcripts, each segment
  // prefixed with its meeting so citations stay traceable.
  const combined = useMemo(() => {
    const segs: TranscriptSegment[] = [];
    const summaries: string[] = [];
    for (const m of meetings) {
      const tr = transcripts.find((t) => t.meetingId === m.id);
      if (!tr) continue;
      if (tr.summary) summaries.push(`${m.title}: ${tr.summary}`);
      for (const s of tr.segments || []) segs.push({ speaker: `${m.title} — ${s.speaker}`, t: s.t, text: s.text });
    }
    return { segments: segs, summary: summaries.join('\n\n') };
  }, [meetings, transcripts]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const segRefs = useRef<Record<number, HTMLDivElement | null>>({});

  if (!ready || !user || !dataReady) return null;

  const effectiveId = activeId || params.get('m') || meetings[0]?.id || '';
  const meeting = meetings.find((m) => m.id === effectiveId);
  const transcript = meeting ? transcripts.find((t) => t.meetingId === meeting.id) : null;
  const segments = transcript?.segments || [];
  const notes = (transcript?.comments || []).map((c) => `${c.name}: ${c.text}`).join('\n') || (meeting?.agenda || []).join('\n');
  // Effective document (single meeting or all meetings) for the view + chat.
  const effSegments = allMode ? combined.segments : segments;
  const effSummary = allMode ? combined.summary : transcript?.summary || '';
  const effTitle = allMode ? `All meetings (${meetings.length})` : meeting?.title || '';
  const canChat = allMode ? combined.segments.length > 0 : !!(meeting && transcript);

  async function send(q: string) {
    const question = q.trim();
    if (!question) return;
    if (!allMode && !transcript) return;
    const doc = allMode
      ? { title: 'All meetings', summary: combined.summary, notes: '', segments: combined.segments }
      : { title: meeting!.title, summary: transcript!.summary, notes, segments };
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    let answer: ChatAnswer;
    try {
      answer = await chatWithFile({
        question,
        document: doc,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      });
    } catch {
      answer = localGroundedAnswer(question, doc.segments);
    }
    setMessages((m) => [...m, { role: 'assistant', content: answer.answer, citations: answer.citations, found: answer.found }]);
    setBusy(false);
  }

  function jumpTo(idx: number) {
    setTab('transcript');
    setHighlight(idx);
    setTimeout(() => {
      segRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="font-h1 text-h1 flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span> AI Assistant
          </h1>
          <p className="font-body-md text-on-surface-variant">Ask about the open meeting — answers are grounded in this file only, with citations.</p>
        </div>
        <div className="flex items-center gap-md">
          <label className="flex items-center gap-xs cursor-pointer" title="Search across every processed meeting">
            <input type="checkbox" checked={allMode} onChange={(e) => { setAllMode(e.target.checked); setMessages([]); }} className="rounded border-outline-variant text-primary focus:ring-primary" />
            <span className="font-body-sm text-on-surface-variant">All meetings</span>
          </label>
          <select value={effectiveId} disabled={allMode} onChange={(e) => { setActiveId(e.target.value); setMessages([]); }} className="bg-surface-container border-transparent focus:border-primary rounded-lg py-sm px-md disabled:opacity-50">
            {meetings.length === 0 ? <option value="">No processed meetings</option> : meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
      </header>

      {!canChat ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center text-on-surface-variant">
          No AI-processed meeting selected. Record or upload a meeting first.
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-lg">
          {/* Document view */}
          <section className="col-span-12 lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden flex flex-col">
            <div className="flex border-b border-outline-variant">
              {(['summary', 'notes', 'transcript'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`px-md py-sm font-label-caps text-label-caps capitalize border-b-2 ${tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-primary'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="p-md overflow-y-auto max-h-[560px]">
              {tab === 'summary' ? (
                <p className="font-body-md text-on-surface whitespace-pre-wrap">{effSummary || 'No summary available.'}</p>
              ) : tab === 'notes' ? (
                <div className="space-y-sm">
                  {!allMode && notes ? notes.split('\n').map((n, i) => <p key={i} className="font-body-sm p-sm bg-surface-container-low rounded-lg">{n}</p>) : <p className="text-on-surface-variant italic">{allMode ? 'Notes show per-meeting; switch off All meetings to view.' : 'No notes or comments.'}</p>}
                </div>
              ) : (
                <div className="space-y-md">
                  {effSegments.map((s, i) => (
                    <div
                      key={i}
                      ref={(el) => { segRefs.current[i] = el; }}
                      className={`border-l-2 pl-md py-xs rounded-r-lg transition-colors ${highlight === i ? 'border-primary bg-tertiary-fixed/50' : 'border-outline-variant'}`}
                    >
                      <div className="font-label-caps text-label-caps text-on-surface-variant mb-xs">{s.speaker} · {fmtTime(s.t)}</div>
                      <p className="font-body-sm text-on-surface">{s.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Chat */}
          <section className="col-span-12 lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col min-h-[560px] max-h-[640px]">
            <div className="px-md py-sm border-b border-outline-variant flex items-center gap-xs">
              <span className="material-symbols-outlined text-primary text-[18px]">description</span>
              <span className="font-label-caps text-label-caps text-on-surface-variant truncate">Using: {effTitle}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-md space-y-md">
              {messages.length === 0 ? (
                <div className="space-y-sm">
                  <p className="font-caption text-caption text-on-surface-variant text-center">Ask anything about this meeting.</p>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="w-full text-left p-sm rounded-lg border border-outline-variant/60 bg-surface hover:border-tertiary-container transition-colors flex items-start gap-sm">
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
                      <span className="font-body-sm text-on-surface-variant">{s}</span>
                    </button>
                  ))}
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start items-start gap-sm'}`}>
                    {m.role === 'assistant' ? (
                      <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center shrink-0 border border-outline-variant/30">
                        <span className="material-symbols-outlined text-primary text-[18px]">smart_toy</span>
                      </div>
                    ) : null}
                    <div className={`max-w-[85%] rounded-2xl p-md font-body-sm ${m.role === 'user' ? 'bg-surface-container-high rounded-tr-sm text-on-surface' : 'bg-surface-container-lowest border border-outline-variant/50 rounded-tl-sm'}`}>
                      <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                      {m.citations && m.citations.length ? (
                        <div className="mt-sm pt-sm border-t border-outline-variant/30 space-y-xs">
                          {m.citations.map((c, j) => (
                            <button key={j} onClick={() => jumpTo(c.segmentIndex)} className="w-full text-left group">
                              <p className="font-caption text-caption italic bg-surface-container-low p-xs rounded line-clamp-2 group-hover:bg-tertiary-fixed/40">&ldquo;{c.quote}&rdquo;</p>
                              <span className="flex items-center gap-xs font-label-caps text-label-caps text-tertiary mt-xs">
                                <span className="material-symbols-outlined text-[14px]">manage_search</span> {c.speaker} · {fmtTime(c.t)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
              {busy ? <p className="font-caption text-caption text-on-surface-variant flex items-center gap-xs"><span className="material-symbols-outlined text-[16px] animate-pulse text-tertiary-container">auto_awesome</span> Thinking…</p> : null}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="p-sm border-t border-outline-variant"
            >
              <div className="flex items-end gap-sm bg-surface-container-lowest border border-outline-variant rounded-xl p-xs focus-within:border-primary transition-colors">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  rows={1}
                  placeholder="Ask anything about this meeting..."
                  className="flex-1 bg-transparent border-none focus:ring-0 resize-none font-body-sm py-sm max-h-[120px]"
                />
                <button type="submit" disabled={busy} className="p-sm bg-primary text-on-primary rounded-lg shadow-md hover:bg-primary-container transition-colors disabled:opacity-40">
                  <span className="material-symbols-outlined text-[20px]">send</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

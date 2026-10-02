'use client';

// Floating, context-aware AI helper (bottom-right on every authenticated page).
// It grounds itself automatically:
//   • If the current route references a meeting/transcript (?m= or ?t=), it
//     answers from THAT file's transcript/summary/notes (cited).
//   • Otherwise it grounds on the signed-in user's scoped workspace (their
//     meetings + tasks) so it can answer "what's pending my approval?" etc.
// Answers go through /api/ai/chat (grounded, no hallucination) with a
// deterministic on-device fallback that only quotes matching passages.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useData } from '@/components/DataProvider';
import { scopeMeetings, scopeTasks } from '@/lib/scope';
import { chatWithFile, type ChatAnswer, type ChatCitation } from '@/lib/ai-client';
import { fmtDate, fmtTime } from '@/lib/utils';
import type { TranscriptSegment } from '@/lib/types';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  found?: boolean;
}

interface Ctx {
  scope: 'meeting' | 'workspace';
  label: string;
  title: string;
  summary?: string;
  notes: string;
  segments: TranscriptSegment[];
}

// Deterministic grounded fallback — only quotes matching segments, never invents.
function localGroundedAnswer(question: string, segments: TranscriptSegment[]): ChatAnswer {
  const stop = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'what', 'who', 'when', 'was', 'were', 'is', 'are', 'did', 'this', 'that', 'my', 'do', 'have']);
  const terms = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  const scored = segments
    .map((s, i) => ({ i, s, score: terms.reduce((acc, t) => acc + (s.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (scored.length === 0) {
    return { answer: "I couldn't find anything about that in this context.", found: false, citations: [] };
  }
  return {
    answer: 'Here are the most relevant items I found (on-device grounded search — connect the AI service for full answers):',
    found: true,
    citations: scored.map((x) => ({ segmentIndex: x.i, speaker: x.s.speaker, t: x.s.t, quote: x.s.text })),
  };
}

function AssistantInner() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const data = useData();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build the grounding context from the current route + data.
  const ctx: Ctx = useMemo(() => {
    const mid = params.get('m');
    const tid = params.get('t');
    let meeting = mid ? data.meetings.find((m) => m.id === mid) : undefined;
    let transcript = mid
      ? data.transcripts.find((t) => t.meetingId === mid)
      : tid
        ? data.transcripts.find((t) => t.id === tid)
        : undefined;
    if (!meeting && transcript) meeting = data.meetings.find((m) => m.id === transcript!.meetingId);

    if (meeting && transcript) {
      const notes =
        (transcript.comments || []).map((c) => `${c.name}: ${c.text}`).join('\n') ||
        (meeting.agenda || []).join('\n');
      return { scope: 'meeting', label: meeting.title, title: meeting.title, summary: transcript.summary, notes, segments: transcript.segments || [] };
    }

    // Workspace context — encode the user's scoped meetings + tasks as segments.
    const meetings = user ? scopeMeetings(user, data.meetings) : [];
    const tasks = user ? scopeTasks(user, data.tasks) : [];
    const segs: TranscriptSegment[] = [
      ...meetings.slice(0, 40).map((m) => {
        const tr = data.transcripts.find((t) => t.meetingId === m.id);
        return {
          speaker: 'Meeting',
          t: 0,
          text: `Meeting "${m.title}" on ${fmtDate(m.date, true)} at ${m.venue || '—'} — status ${String(m.status).replace('_', ' ')}, type ${m.meetingType || 'regular'}.${tr?.summary ? ' Summary: ' + tr.summary : ''}`,
        } as TranscriptSegment;
      }),
      ...tasks.slice(0, 60).map((t) => {
        const a = data.users.find((u) => u.id === t.assigneeId);
        return {
          speaker: 'Task',
          t: 0,
          text: `Task "${t.title}" — status ${String(t.status).replace('_', ' ')}, priority ${t.priority || 'medium'}, due ${t.deadline || 'no deadline'}, assigned to ${a ? a.name : 'unassigned'}.${t.description ? ' ' + t.description : ''}`,
        } as TranscriptSegment;
      }),
    ];
    const summary = `Workspace of ${user?.name || 'the user'} (${user?.role || ''}). ${meetings.length} meeting(s) and ${tasks.length} task(s) in view.`;
    return { scope: 'workspace', label: 'your workspace', title: 'Your SmartMin workspace', summary, notes: '', segments: segs };
  }, [params, pathname, data, user]);

  // Reset the conversation when the grounding context changes.
  useEffect(() => {
    setMessages([]);
  }, [ctx.scope, ctx.label]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const suggestions =
    ctx.scope === 'meeting'
      ? ['Summarize the key decisions.', 'What tasks were assigned and to whom?', 'What deadlines were mentioned?']
      : ['Which of my tasks are overdue?', 'What is pending my approval?', 'What meetings are coming up?'];

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    let answer: ChatAnswer;
    try {
      answer = await chatWithFile({
        question,
        document: { title: ctx.title, summary: ctx.summary, notes: ctx.notes, segments: ctx.segments },
        history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      });
    } catch {
      answer = localGroundedAnswer(question, ctx.segments);
    }
    setMessages((m) => [...m, { role: 'assistant', content: answer.answer, citations: answer.citations, found: answer.found }]);
    setBusy(false);
  }

  if (!user) return null;

  return (
    <>
      {/* Floating action button */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className="fixed bottom-lg right-lg z-40 w-14 h-14 rounded-full bg-primary text-on-primary shadow-primary-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform focus-visible:ring-4 focus-visible:ring-primary/40 no-print"
        >
          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            smart_toy
          </span>
        </button>
      ) : null}

      {/* Chat panel */}
      {open ? (
        <div
          role="dialog"
          aria-label="AI assistant"
          className="fixed bottom-lg right-lg z-50 w-[380px] max-w-[calc(100vw-24px)] h-[560px] max-h-[calc(100vh-96px)] bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-primary-lg flex flex-col overflow-hidden no-print"
        >
          {/* Header */}
          <div className="px-md py-sm bg-gradient-to-r from-primary to-primary-container text-on-primary flex items-center gap-sm">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            <div className="min-w-0 flex-1">
              <p className="font-body-md font-semibold leading-tight">AI Assistant</p>
              <p className="font-caption text-caption opacity-90 truncate flex items-center gap-xs">
                <span className="material-symbols-outlined text-[13px]">
                  {ctx.scope === 'meeting' ? 'description' : 'dashboard'}
                </span>
                Grounded in {ctx.label}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant" className="p-xs hover:opacity-80 rounded focus-visible:ring-2 focus-visible:ring-white/60">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-md space-y-md">
            {messages.length === 0 ? (
              <div className="space-y-sm">
                <div className="bg-tertiary-fixed/40 border border-tertiary-container/30 rounded-lg p-sm flex items-start gap-sm">
                  <span className="material-symbols-outlined text-tertiary-container text-[18px]">info</span>
                  <p className="font-caption text-caption text-on-surface">
                    I only answer from {ctx.scope === 'meeting' ? 'this meeting file' : 'your meetings and tasks'} and cite what I find — no guessing.
                  </p>
                </div>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left p-sm rounded-lg border border-outline-variant/60 bg-surface hover:border-tertiary-container transition-colors flex items-start gap-sm"
                  >
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
                          <div key={j}>
                            <p className="font-caption text-caption italic bg-surface-container-low p-xs rounded line-clamp-3">&ldquo;{c.quote}&rdquo;</p>
                            <span className="flex items-center gap-xs font-label-caps text-label-caps text-tertiary mt-xs">
                              <span className="material-symbols-outlined text-[13px]">manage_search</span> {c.speaker}
                              {c.t ? ` · ${fmtTime(c.t)}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {busy ? (
              <p className="font-caption text-caption text-on-surface-variant flex items-center gap-xs">
                <span className="material-symbols-outlined text-[16px] animate-pulse text-tertiary-container">auto_awesome</span> Thinking…
              </p>
            ) : null}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="p-sm border-t border-outline-variant">
            <div className="flex items-end gap-sm bg-surface-container-lowest border border-outline-variant rounded-xl p-xs focus-within:border-primary transition-colors">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={1}
                placeholder={ctx.scope === 'meeting' ? 'Ask about this meeting…' : 'Ask about your meetings or tasks…'}
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none font-body-sm py-sm max-h-[100px]"
                aria-label="Ask the assistant"
              />
              <button type="submit" disabled={busy || !input.trim()} className="p-sm bg-primary text-on-primary rounded-lg shadow-md hover:opacity-90 transition disabled:opacity-40">
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function FloatingAssistant() {
  return (
    <Suspense fallback={null}>
      <AssistantInner />
    </Suspense>
  );
}

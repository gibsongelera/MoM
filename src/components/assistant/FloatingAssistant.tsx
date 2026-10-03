'use client';

/**
 * SmartMin Assistant — the floating AI helper, back on every dashboard page
 * (it lived in the root app; client asked for it again, including faculty).
 *
 * It grounds itself on where you are:
 *   /secretary/meetings/<id>, /faculty/my-meetings/<id>, or any ?m=<id>
 *        → that meeting (details, attendance, minutes, transcripts)
 *   /faculty/personal-meetings/<id> → that personal meeting and its transcript
 *   anywhere else → your workspace (meetings, tasks, approvals, personal log)
 * The server rebuilds the context with the caller's own permissions
 * (/api/ai/chat), so it can't quote anything they couldn't already open.
 *
 * Other components open it with openAssistant(question?).
 *
 * Motion (Emil-weighted, productivity UI): the panel grows from the button's
 * corner — 180ms ease-out in, 120ms out, opacity + 8px + 0.98 scale; messages
 * don't animate (they arrive often); no pulsing "AI" indicators. All of it
 * collapses under prefers-reduced-motion (globals.css).
 */
import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/ui/cn';

type Scope = { kind: 'workspace' } | { kind: 'meeting'; id: string } | { kind: 'personal'; id: string };

interface Source {
  label: string;
  quote: string;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  found?: boolean;
  error?: boolean;
}

const OPEN_EVENT = 'smartmin:assistant';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Opens the assistant from anywhere; an optional question is sent right away. */
export function openAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question } }));
}

function scopeFromLocation(pathname: string, m: string | null): Scope {
  const meeting = pathname.match(new RegExp(`^/(?:secretary/meetings|faculty/my-meetings|head/meetings)/(${UUID})`, 'i'));
  if (meeting) return { kind: 'meeting', id: meeting[1] };
  const personal = pathname.match(new RegExp(`^/faculty/personal-meetings/(${UUID})`, 'i'));
  if (personal) return { kind: 'personal', id: personal[1] };
  if (m && new RegExp(`^${UUID}$`, 'i').test(m)) return { kind: 'meeting', id: m };
  return { kind: 'workspace' };
}

const SUGGESTIONS: Record<Scope['kind'], string[]> = {
  meeting: ['Summarize the key decisions.', 'What tasks were assigned, and to whom?', 'Who attended?'],
  personal: ['Summarize this meeting.', 'What did we agree on?', 'What should I follow up?'],
  workspace: ['What meetings do I have this week?', 'Which of my tasks are due soon?', 'What is waiting for approval?'],
};

function AssistantInner() {
  const pathname = usePathname();
  const params = useSearchParams();
  const pageScope = useMemo(() => scopeFromLocation(pathname, params.get('m')), [pathname, params]);
  const [useWorkspace, setUseWorkspace] = useState(false);
  const scope: Scope = useMemo(() => (useWorkspace ? { kind: 'workspace' } : pageScope), [useWorkspace, pageScope]);
  const scopeKey = scope.kind === 'workspace' ? 'workspace' : `${scope.kind}:${scope.id}`;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [label, setLabel] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  // New page context → new conversation (answers from another meeting would mislead).
  const [lastScopeKey, setLastScopeKey] = useState(scopeKey);
  if (lastScopeKey !== scopeKey) {
    setLastScopeKey(scopeKey);
    setMessages([]);
    setLabel(null);
  }
  const [lastPageKey, setLastPageKey] = useState(pathname);
  if (lastPageKey !== pathname) {
    setLastPageKey(pathname);
    setUseWorkspace(false);
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || busy) return;
      const history = messages.filter((m) => !m.error).slice(-10).map((m) => ({ role: m.role, content: m.content }));
      setMessages((m) => [...m, { role: 'user', content: question }]);
      setInput('');
      setBusy(true);
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scope, question, history }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) {
          const reason =
            res.status === 503
              ? "The AI service isn't configured on this server yet."
              : res.status === 429
                ? 'The AI service is busy. Try again in a moment.'
                : (body?.error ?? 'Something went wrong. Try again.');
          setMessages((m) => [...m, { role: 'assistant', content: reason, error: true }]);
        } else {
          setLabel(body.contextLabel ?? null);
          setMessages((m) => [...m, { role: 'assistant', content: body.answer, sources: body.sources, found: body.found }]);
        }
      } catch {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: "Couldn't reach SmartMin. Check your internet connection and try again.", error: true },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, scope],
  );

  // openAssistant(question?) from anywhere in the app.
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<{ question?: string }>).detail?.question;
      if (q) void send(q);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [send]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const scopeText =
    scope.kind === 'workspace' ? 'Your meetings, tasks and log' : (label ?? (scope.kind === 'meeting' ? 'This meeting' : 'This personal meeting'));

  return (
    <div className="no-print">
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close SmartMin Assistant' : 'Open SmartMin Assistant'}
        className={cn(
          'fixed bottom-md right-md z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-primary-lg',
          'transition-[background-color,transform] duration-150 ease-out hover:bg-primary-container motion-safe:active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tertiary-container/60 md:bottom-lg md:right-lg',
        )}
      >
        <Icon name={open ? 'close' : 'smart_toy'} size={28} filled={!open} />
      </button>

      <section
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-open={open}
        inert={!open}
        className={cn(
          'sm-assistant-panel fixed bottom-[88px] right-md z-50 flex h-[min(600px,calc(100dvh-112px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden',
          'rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-primary-lg md:bottom-[104px] md:right-lg',
        )}
      >
        <header className="flex items-center gap-sm bg-primary px-md py-sm text-on-primary">
          <Icon name="smart_toy" size={24} filled />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-body-md font-semibold leading-tight">
              SmartMin Assistant
            </h2>
            <p className="flex items-center gap-xs truncate font-caption text-caption opacity-90">
              <Icon name={scope.kind === 'workspace' ? 'dashboard' : 'description'} size={14} />
              <span className="truncate">{scopeText}</span>
            </p>
          </div>
          {messages.length ? (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded-lg px-sm py-xs font-caption text-caption font-semibold hover:bg-white/10"
            >
              New chat
            </button>
          ) : null}
        </header>

        {pageScope.kind !== 'workspace' ? (
          <div className="flex gap-xs border-b border-outline-variant bg-surface-container-low p-xs" role="group" aria-label="What to ask about">
            {[
              { ws: false, text: pageScope.kind === 'meeting' ? 'This meeting' : 'This entry' },
              { ws: true, text: 'Everything' },
            ].map((o) => (
              <button
                key={String(o.ws)}
                type="button"
                aria-pressed={useWorkspace === o.ws}
                onClick={() => setUseWorkspace(o.ws)}
                className={cn(
                  'flex-1 rounded-lg px-sm py-xs font-caption text-caption font-semibold transition-colors duration-150',
                  useWorkspace === o.ws ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {o.text}
              </button>
            ))}
          </div>
        ) : null}

        <div ref={listRef} className="flex-1 space-y-md overflow-y-auto p-md" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 ? (
            <div className="space-y-sm">
              <p className="flex items-start gap-sm rounded-lg bg-tertiary-fixed/40 p-sm font-caption text-caption text-on-surface">
                <Icon name="info" size={18} className="text-on-tertiary-fixed-variant" />
                <span>
                  I answer only from{' '}
                  {scope.kind === 'workspace' ? 'your meetings, tasks and personal log' : scope.kind === 'meeting' ? 'this meeting’s records' : 'this entry and its transcript'}{' '}
                  and show where I found it. English, Filipino or Cebuano.
                </span>
              </p>
              {SUGGESTIONS[scope.kind].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="flex w-full items-start gap-sm rounded-lg border border-outline-variant bg-surface p-sm text-left font-body-sm text-on-surface-variant transition-colors duration-150 hover:border-primary hover:text-on-surface"
                >
                  <Icon name="search" size={18} />
                  {s}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-surface-container-high p-sm font-body-sm text-on-surface">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                    <Icon name={m.error ? 'error' : 'smart_toy'} size={18} />
                  </span>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl rounded-tl-sm border p-sm font-body-sm',
                      m.error ? 'border-error/40 bg-error-container text-on-error-container' : 'border-outline-variant bg-surface-container-lowest',
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    {m.sources?.length ? (
                      <ul className="mt-sm space-y-xs border-t border-outline-variant pt-sm">
                        {m.sources.map((s, j) => (
                          <li key={j}>
                            <p className="line-clamp-3 rounded bg-surface-container-low p-xs font-caption text-caption italic">“{s.quote}”</p>
                            <p className="mt-xs flex items-center gap-xs font-label-caps text-label-caps text-on-tertiary-fixed-variant">
                              <Icon name="manage_search" size={14} /> {s.label}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ),
            )
          )}
          {busy ? (
            <p className="flex items-center gap-xs font-caption text-caption text-on-surface-variant">
              <Icon name="progress_activity" size={16} className="motion-safe:animate-spin" /> Looking through your records…
            </p>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="border-t border-outline-variant p-sm">
          <div className="flex items-end gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-xs transition-colors duration-150 focus-within:border-primary">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={scope.kind === 'workspace' ? 'Ask about your meetings or tasks…' : 'Ask about this meeting…'}
              aria-label="Ask the assistant"
              className="max-h-[100px] flex-1 resize-none border-none bg-transparent py-sm font-body-sm focus:ring-0"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary transition-opacity duration-150 disabled:opacity-40"
            >
              <Icon name="send" size={20} />
            </button>
          </div>
          <p className="mt-xs px-xs font-caption text-caption text-on-surface-variant">AI can be wrong — check the sources before you rely on an answer.</p>
        </form>
      </section>
    </div>
  );
}

export function FloatingAssistant() {
  return (
    <Suspense fallback={null}>
      <AssistantInner />
    </Suspense>
  );
}

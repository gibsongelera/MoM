'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ROLE_DASHBOARDS } from '@/lib/nav';
import { Logo } from '@/components/Logo';

const FEATURES = [
  { icon: 'mic', title: 'Offline-First Recording', body: 'Capture meetings live or upload audio. Recordings queue locally and sync when you reconnect.' },
  { icon: 'auto_awesome', title: 'AI That Analyzes', body: 'Audio → transcript → summary → decisions → tasks → minutes. Not just a transcript viewer.' },
  { icon: 'task_alt', title: 'Task Accountability', body: 'Action items are extracted automatically and delegated with assignees, deadlines, and status.' },
  { icon: 'translate', title: 'Bilingual (EN + TL)', body: 'Transcripts and minutes translate between English and Tagalog on demand.' },
];

const ROLES = [
  { icon: 'admin_panel_settings', title: 'Administrator', body: 'Institution-wide oversight, users, departments, audit, and AI settings.' },
  { icon: 'stars', title: 'Head / Dean', body: 'Approve and sign minutes, delegate tasks, and review department reports.' },
  { icon: 'edit_note', title: 'Secretary', body: 'Record, transcribe, draft CHED-format minutes, and take attendance.' },
  { icon: 'school', title: 'Faculty', body: 'RSVP to meetings, track assigned tasks, and read transcripts.' },
];

const WORKFLOW = ['Record / Upload', 'AI Transcribe', 'Summarize & Extract', 'Draft Minutes', 'Sign & Approve'];

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (
      hash.includes('access_token') &&
      (hash.includes('type=signup') || hash.includes('type=magiclink') || hash.includes('type=email'))
    ) {
      router.replace('/auth/confirm' + hash);
      return;
    }
    if (!loading && user) router.replace(ROLE_DASHBOARDS[user.role] || '/login');
  }, [user, loading, router]);

  return (
    <div className="bg-background min-h-screen">
      <nav className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-container-max mx-auto px-lg py-sm flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <Logo size={40} />
            <span className="font-h3 text-h3 text-primary">ZPPSU SmartMin</span>
          </div>
          <div className="flex items-center gap-sm">
            <a href="#features" className="hidden md:inline font-body-sm text-on-surface-variant hover:text-primary px-sm">Features</a>
            <a href="#roles" className="hidden md:inline font-body-sm text-on-surface-variant hover:text-primary px-sm">Roles</a>
            <a href="#workflow" className="hidden md:inline font-body-sm text-on-surface-variant hover:text-primary px-sm">Workflow</a>
            <Link href="/login" className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md font-label-caps text-label-caps">Sign In</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-container opacity-95" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="relative max-w-container-max mx-auto px-lg py-xxl text-on-primary text-center">
          <span className="ai-badge mb-md"><span className="material-symbols-outlined text-[14px]">auto_awesome</span> AI-Assisted Meeting Governance</span>
          <h1 className="font-display text-display mb-md">Intelligent Governance.</h1>
          <p className="font-body-lg text-body-lg opacity-90 max-w-[720px] mx-auto mb-lg">
            SmartMin turns institutional meetings into transcripts, summaries, decisions, delegated tasks, and CHED-format minutes — with a grounded AI assistant that answers only from your files.
          </p>
          <div className="flex items-center justify-center gap-sm flex-wrap">
            <Link href="/login" className="bg-on-primary text-primary px-lg py-md rounded-lg font-semibold flex items-center gap-sm shadow-lg">
              Get Started <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
            <Link href="/register" className="border border-on-primary/40 text-on-primary px-lg py-md rounded-lg font-semibold hover:bg-white/10">Create Account</Link>
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="max-w-container-max mx-auto px-lg py-xxl">
        <h2 className="font-h1 text-h1 text-center mb-lg">More than transcription</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg">
              <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-md">
                <span className="material-symbols-outlined text-[26px]">{f.icon}</span>
              </div>
              <h3 className="font-h3 text-h3 mb-xs">{f.title}</h3>
              <p className="font-body-sm text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="bg-surface-container-low border-y border-outline-variant">
        <div className="max-w-container-max mx-auto px-lg py-xxl">
          <h2 className="font-h1 text-h1 text-center mb-lg">Built for every role</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
            {ROLES.map((r) => (
              <div key={r.title} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-primary text-on-primary flex items-center justify-center shadow-primary-md mb-md">
                  <span className="material-symbols-outlined text-[28px]">{r.icon}</span>
                </div>
                <h3 className="font-h3 text-h3 mb-xs">{r.title}</h3>
                <p className="font-body-sm text-on-surface-variant">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="max-w-container-max mx-auto px-lg py-xxl">
        <h2 className="font-h1 text-h1 text-center mb-lg">End-to-end meeting workflow</h2>
        <div className="flex flex-wrap items-center justify-center gap-sm">
          {WORKFLOW.map((step, i) => (
            <div key={step} className="flex items-center gap-sm">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl px-md py-sm font-body-sm font-semibold flex items-center gap-sm">
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-bold">{i + 1}</span>
                {step}
              </div>
              {i < WORKFLOW.length - 1 ? <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span> : null}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-container-max mx-auto px-lg pb-xxl">
        <div className="bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-2xl p-xxl text-center shadow-primary-lg">
          <h2 className="font-h1 text-h1 mb-sm">Ready to run smarter meetings?</h2>
          <p className="font-body-lg opacity-90 mb-lg">Sign in with a demo account and try the full workflow.</p>
          <Link href="/login" className="bg-on-primary text-primary px-lg py-md rounded-lg font-semibold inline-flex items-center gap-sm shadow-lg">
            Sign In <span className="material-symbols-outlined">login</span>
          </Link>
        </div>
      </section>

      <footer className="border-t border-outline-variant">
        <div className="max-w-container-max mx-auto px-lg py-lg text-center font-caption text-caption text-on-surface-variant">
          © 2026 Zamboanga Peninsula Polytechnic State University · SmartMin
        </div>
      </footer>
    </div>
  );
}

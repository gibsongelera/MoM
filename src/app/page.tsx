import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Landing page. Port of the legacy index.html.
 *
 * Static server component — no session, no data. The proxy treats "/" as public
 * so this is the front door for signed-out visitors.
 */

export const metadata: Metadata = {
  title: 'SmartMin AI | ZPPSU Institutional Intelligence',
};

const FEATURES = [
  {
    icon: 'wifi_off',
    title: 'Record now, upload later',
    body: 'No internet in the room? Keep the recording and upload it from the meeting once you are back online.',
    accent: 'primary' as const,
  },
  {
    icon: 'translate',
    title: 'Multilingual transcription',
    body: 'Transcribes English, Filipino and Cebuano, including meetings that switch between them.',
    accent: 'tertiary' as const,
  },
  {
    icon: 'assignment_turned_in',
    title: 'Task Accountability',
    body: 'AI auto-extracts action items from transcripts and delegates them with deadlines.',
    accent: 'primary' as const,
  },
  {
    icon: 'lock',
    title: 'Audited & Scoped',
    body: 'Row-level security scopes every record to your role and department. Full audit trail.',
    accent: 'primary' as const,
  },
];

const ROLES = [
  {
    icon: 'admin_panel_settings',
    title: 'Administrator',
    office: 'ICT Office',
    body: 'User & department management, AI model health, audit trail, privacy controls.',
  },
  {
    icon: 'stars',
    title: 'President / Head',
    office: 'Office of the College Dean',
    body: 'Approve minutes, sign reports, delegate tasks, view department analytics.',
  },
  {
    icon: 'edit_note',
    title: 'Secretary',
    office: 'CICS Department',
    body: 'Schedule meetings, record live, edit transcripts, draft CHED-format MoMs.',
  },
  {
    icon: 'school',
    title: 'Faculty',
    office: 'CICS Department',
    body: 'View assigned tasks, read transcripts, attend recorded meetings.',
  },
];

const WORKFLOW = [
  { icon: 'event', step: '1. Schedule', note: 'Secretary creates meeting', gold: false },
  { icon: 'mic', step: '2. Record', note: 'Live, or upload later', gold: false },
  { icon: 'auto_awesome', step: '3. Transcribe', note: 'English, Filipino, Cebuano', gold: true },
  { icon: 'summarize', step: '4. Summarize', note: 'Key points + actions', gold: true },
  { icon: 'description', step: '5. CHED MoM', note: 'Format-ready minutes', gold: false },
  { icon: 'draw', step: '6. Sign', note: 'Digital signatures', gold: false },
];

/** Heights of the ten animated soundwave bars, in order. */
const WAVE = [
  { h: 'h-10', w: 'w-2', bg: 'bg-primary/40' },
  { h: 'h-16', w: 'w-2', bg: 'bg-primary/60' },
  { h: 'h-8', w: 'w-2', bg: 'bg-tertiary-container/60' },
  { h: 'h-20', w: 'w-2', bg: 'bg-primary/80' },
  { h: 'h-14', w: 'w-2', bg: 'bg-primary/60' },
  { h: 'h-24', w: 'w-3', bg: 'bg-primary' },
  { h: 'h-[72px]', w: 'w-2', bg: 'bg-primary/80' },
  { h: 'h-12', w: 'w-2', bg: 'bg-tertiary-container/70' },
  { h: 'h-20', w: 'w-2', bg: 'bg-primary/60' },
  { h: 'h-10', w: 'w-2', bg: 'bg-primary/40' },
];

export default function LandingPage() {
  return (
    <div className="text-on-background antialiased overflow-x-hidden">
      <nav className="fixed top-0 left-0 right-0 flex justify-between items-center px-lg py-sm w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant z-50 shadow-sm">
        <div className="flex items-center gap-sm">
          <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-primary-md">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              account_balance
            </span>
          </div>
          <span className="font-h2 text-h2 font-bold text-primary">SmartMin AI</span>
        </div>
        <div className="hidden md:flex items-center gap-lg">
          <a
            className="font-body-md text-body-md text-primary font-semibold border-b-2 border-primary"
            href="#top"
          >
            Home
          </a>
          <a
            className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors"
            href="#features"
          >
            Features
          </a>
          <a
            className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors"
            href="#roles"
          >
            Roles
          </a>
          <a
            className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors"
            href="#workflow"
          >
            Workflow
          </a>
        </div>
        <div className="flex items-center gap-sm">
          <Link
            href="/login"
            className="bg-primary text-on-primary font-body-sm text-body-sm px-md py-sm rounded-lg shadow-primary-md hover:opacity-90 transition-opacity"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="border border-primary text-primary font-body-sm text-body-sm px-md py-sm rounded-lg hover:bg-primary-fixed/30 transition-colors"
          >
            Register
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section
        id="top"
        className="relative pt-[120px] pb-xxl px-gutter max-w-container-max mx-auto flex flex-col lg:flex-row items-center gap-xl min-h-[700px]"
      >
        <div className="lg:w-1/2 flex flex-col gap-lg z-10">
          <div className="inline-flex items-center gap-sm bg-tertiary-fixed text-on-tertiary-fixed-variant px-sm py-xs rounded-full font-label-caps text-label-caps w-max">
            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
            <span className="uppercase">AI-powered institutional governance</span>
          </div>
          <h1 className="font-display text-display text-on-background leading-[1.1]">
            Transforming <span className="text-primary">ZPPSU</span> Meetings Through AI Automation
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
            Schedule or start meetings, record or upload them, take attendance, and get AI-drafted
            CHED-format minutes with action items and signatures — all in one secure institutional
            platform.
          </p>
          <div className="flex flex-wrap gap-md pt-sm">
            <Link
              href="/login"
              className="bg-primary text-on-primary font-body-md text-body-md px-lg py-md rounded-lg shadow-primary-lg hover:opacity-90 transition-all flex items-center gap-sm"
            >
              Try the Demo <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
            <a
              href="#workflow"
              className="border border-primary text-primary font-body-md text-body-md px-lg py-md rounded-lg hover:bg-primary-fixed/30 transition-all flex items-center gap-sm"
            >
              <span className="material-symbols-outlined">play_circle</span> See Workflow
            </a>
          </div>
          <ul className="flex flex-wrap gap-lg pt-md">
            {[
              ['Attendance', 'built from the meeting, with signatures'],
              ['Minutes', 'drafted by AI, approved by the head'],
              ['Evidence', 'photos and panel notes kept with the record'],
            ].map(([label, note]) => (
              <li key={label}>
                <p className="font-h3 text-h3 font-bold text-primary">{label}</p>
                <p className="font-caption text-caption text-on-surface-variant">{note}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Live-recording preview card */}
        <div className="lg:w-1/2 relative w-full">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-primary-lg p-md">
            <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-md">
              <div className="flex items-center gap-xs">
                <span aria-hidden="true" className="w-3 h-3 rounded-full bg-error record-dot" />
                <span className="font-label-caps text-label-caps text-error uppercase">Recording · 45:12</span>
              </div>
              <span className="ai-badge">Example</span>
            </div>
            <div className="flex items-end gap-xs h-24 mb-md justify-center">
              {WAVE.map((bar, i) => (
                <div key={i} className={`wave-bar ${bar.w} ${bar.h} ${bar.bg} rounded-full`} />
              ))}
            </div>
            <div className="space-y-sm">
              <div className="border-l-2 border-outline-variant pl-md py-xs">
                <div className="font-label-caps text-label-caps text-on-surface-variant mb-xs">
                  Engr. Ricardo Gomez · 42:15
                </div>
                <p className="font-body-sm text-body-sm text-on-surface">
                  Prof. Dela Cruz, can you have the syllabus drafts ready by Thursday?
                </p>
              </div>
              <div className="border-l-2 border-primary pl-md py-xs bg-primary/5 rounded-r-lg">
                <div className="font-label-caps text-label-caps text-primary mb-xs flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                  Action Item Detected
                </div>
                <p className="font-body-sm text-body-sm text-on-surface">
                  Assignee: <strong>Prof. Juan Dela Cruz</strong> · Deadline:{' '}
                  <strong>Thursday next week</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section
        id="features"
        className="bg-surface-container py-xxl px-gutter border-t border-outline-variant"
      >
        <div className="max-w-container-max mx-auto">
          <div className="text-center mb-xl">
            <h2 className="font-h1 text-h1 text-on-background mb-sm">
              Enterprise-Grade Architecture
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              Built for the rigorous demands of institutional governance and ZPPSU privacy
              standards.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`bg-surface-container-lowest border border-outline-variant p-lg rounded-xl shadow-sm${
                  f.accent === 'tertiary' ? ' relative overflow-hidden' : ''
                }`}
              >
                {f.accent === 'tertiary' && (
                  <div className="absolute top-0 right-0 w-16 h-16 bg-tertiary-fixed opacity-30 rounded-bl-full blur-xl" />
                )}
                <div
                  className={`w-12 h-12 ${
                    f.accent === 'tertiary' ? 'bg-tertiary-fixed' : 'bg-primary-fixed'
                  } rounded-lg flex items-center justify-center mb-md`}
                >
                  <span
                    className={`material-symbols-outlined ${
                      f.accent === 'tertiary' ? 'text-tertiary' : 'text-primary'
                    } text-[28px]`}
                  >
                    {f.icon}
                  </span>
                </div>
                <h3 className="font-h3 text-h3 mb-sm">{f.title}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section id="roles" className="py-xxl px-gutter">
        <div className="max-w-container-max mx-auto">
          <div className="text-center mb-xl">
            <h2 className="font-h1 text-h1 text-on-background mb-sm">Built for Every Role</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              Each role gets a tailored dashboard with only the controls they need.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg">
            {ROLES.map((r) => (
              <div
                key={r.title}
                className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg"
              >
                <div className="w-12 h-12 bg-primary text-on-primary rounded-lg flex items-center justify-center mb-md shadow-primary-md">
                  <span className="material-symbols-outlined">{r.icon}</span>
                </div>
                <h3 className="font-h3 text-h3 mb-xs">{r.title}</h3>
                <p className="font-caption text-caption text-on-surface-variant mb-sm">{r.office}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section
        id="workflow"
        className="bg-surface-container py-xxl px-gutter border-t border-outline-variant"
      >
        <div className="max-w-container-max mx-auto">
          <div className="text-center mb-xl">
            <h2 className="font-h1 text-h1 mb-sm">End-to-End Meeting Workflow</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              From scheduling to signed minutes — every step is captured, AI-assisted, and
              auditable.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-md">
            {WORKFLOW.map((w) => (
              <div
                key={w.step}
                className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md text-center"
              >
                <span
                  className={`material-symbols-outlined ${
                    w.gold ? 'text-tertiary-container' : 'text-primary'
                  } text-[36px]`}
                >
                  {w.icon}
                </span>
                <h4 className="font-h3 text-body-md font-semibold mt-sm">{w.step}</h4>
                <p className="font-caption text-caption text-on-surface-variant mt-xs">{w.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-inverse-surface text-inverse-on-surface px-gutter py-xl">
        <div className="max-w-container-max mx-auto flex flex-col md:flex-row justify-between gap-md">
          <div>
            <h3 className="font-h3 text-h3 text-on-primary mb-xs">ZPPSU SmartMin AI</h3>
            <p className="font-caption text-caption opacity-70">
              © 2026 Zamboanga Peninsula Polytechnic State University. Institutional Governance
              Platform.
            </p>
          </div>
          <div className="flex gap-lg text-body-sm">
            <Link href="/login" className="hover:text-tertiary-fixed transition-colors">
              Login
            </Link>
            <Link href="/register" className="hover:text-tertiary-fixed transition-colors">
              Register
            </Link>
            <Link href="/forgot-password" className="hover:text-tertiary-fixed transition-colors">
              Forgot Password
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

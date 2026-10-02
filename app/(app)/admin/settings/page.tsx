'use client';

import { useEffect, useState } from 'react';
import { useRequireRole, useAuth } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { useData } from '@/components/DataProvider';
import { setSettings as saveSettings } from '@/lib/db';

export default function AdminSettings() {
  const { user, ready } = useRequireRole('admin');
  const { logout } = useAuth();
  usePageTitle('System Settings');
  const toast = useToast();
  const { settings: s, ready: dataReady, refresh } = useData();

  const [lang, setLang] = useState('en-US');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [instName, setInstName] = useState('');
  const [instShort, setInstShort] = useState('');

  // Seed the form once settings arrive from Supabase.
  useEffect(() => {
    if (!dataReady) return;
    setLang(s.defaultLanguage || 'en-US');
    setAiEnabled(s.aiEnabled);
    setAutoTranscribe(s.autoTranscribe);
    setAutoSummarize(s.autoSummarize);
    setInstName(s.institutionName);
    setInstShort(s.institutionShort);
  }, [dataReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !user || !dataReady) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await saveSettings({
      aiEnabled,
      autoTranscribe,
      autoSummarize,
      defaultLanguage: lang,
      institutionName: instName,
      institutionShort: instShort,
    });
    await refresh();
    toast('Settings saved', 'success');
  }

  function resetDemo() {
    if (!window.confirm('Sign out of SmartMin? (Demo data now lives in Supabase — reseed with scripts/seed-demo.mjs --reset.)')) return;
    void logout();
  }

  const selCls = 'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg';
  const inCls = 'w-full px-md py-sm bg-surface-container-low border-2 border-transparent focus:border-primary rounded-lg';

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">System Settings</h1>
        <p className="font-body-md text-on-surface-variant">AI model configuration, institutional branding, and language defaults.</p>
      </header>

      <form onSubmit={onSubmit} className="grid grid-cols-12 gap-md">
        <div className="col-span-12 lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-tertiary-container">smart_toy</span> AI Models
          </h3>
          <div className="space-y-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Transcription Engine</label>
              <select className={selCls} defaultValue="Cloud Speech-to-Text">
                <option>Cloud Speech-to-Text</option>
                <option>Web Speech API (browser)</option>
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Summarization Model</label>
              <select className={selCls} defaultValue="Claude (cloud)">
                <option>Claude (cloud)</option>
                <option>Extractive (rule-based fallback)</option>
              </select>
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Default Language</label>
              <select value={lang} onChange={(e) => setLang(e.target.value)} className={selCls}>
                <option value="en-US">English (US)</option>
                <option value="tl-PH">Tagalog (Philippines)</option>
              </select>
            </div>
            <label className="flex items-center gap-xs">
              <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} className="rounded text-primary" />
              <span className="font-body-sm">Enable AI features globally</span>
            </label>
            <label className="flex items-center gap-xs">
              <input type="checkbox" checked={autoTranscribe} onChange={(e) => setAutoTranscribe(e.target.checked)} className="rounded text-primary" />
              <span className="font-body-sm">Auto-transcribe new recordings</span>
            </label>
            <label className="flex items-center gap-xs">
              <input type="checkbox" checked={autoSummarize} onChange={(e) => setAutoSummarize(e.target.checked)} className="rounded text-primary" />
              <span className="font-body-sm">Auto-generate summaries</span>
            </label>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">account_balance</span> Institutional Identity
          </h3>
          <div className="space-y-md">
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Institution Name</label>
              <input value={instName} onChange={(e) => setInstName(e.target.value)} className={inCls} />
            </div>
            <div>
              <label className="block font-label-caps text-label-caps mb-xs">Short Code</label>
              <input value={instShort} onChange={(e) => setInstShort(e.target.value)} className={inCls} />
            </div>
            <div className="p-md bg-tertiary-fixed/40 border-l-4 border-tertiary-container rounded-lg">
              <p className="font-body-sm flex items-center gap-xs">
                <span className="material-symbols-outlined text-tertiary-container">info</span> Changes apply to MoM headers,
                login pages, and exported reports.
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-12 flex justify-end gap-sm">
          <button type="button" onClick={resetDemo} className="border border-error text-error px-md py-sm rounded-lg hover:bg-error/10 flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">restart_alt</span> Reset Demo Data
          </button>
          <button type="submit" className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">save</span> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

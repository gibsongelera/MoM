'use client';

/**
 * local_processing_only is deliberately not exposed here: there is no real
 * local-processing mode implemented (transcription always goes through
 * ElevenLabs, drafting through Anthropic - see README "Privacy &
 * compliance"), so a toggle for it would itself be a misleading control.
 * data_processing_notice is the honest replacement (Phase 0 of the
 * migration plan) - it is the text actually shown to describe the pipeline.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface AppSettingsRow {
  ai_enabled: boolean;
  auto_transcribe: boolean;
  auto_summarize: boolean;
  auto_upload_on_reconnect: boolean;
  retention_days: number;
  default_language: string;
  institution_name: string;
  institution_short: string;
  data_processing_notice: string;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-md p-sm rounded-lg hover:bg-surface-container-low cursor-pointer">
      <span className="font-body-md">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 rounded text-primary focus:ring-primary" />
    </label>
  );
}

export default function SettingsForm({ initial }: { initial: AppSettingsRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  function set<K extends keyof AppSettingsRow>(key: K, value: AppSettingsRow[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from('app_settings').update(values).eq('id', true);
    setSaving(false);
    if (error) {
      setMessage({ tone: 'error', text: error.message });
      return;
    }
    setMessage({ tone: 'success', text: 'Settings saved.' });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-md">
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <h3 className="font-h3 text-h3 mb-sm">AI Processing</h3>
        <Toggle label="AI processing enabled" checked={values.ai_enabled} onChange={(v) => set('ai_enabled', v)} />
        <Toggle label="Auto-transcribe on upload" checked={values.auto_transcribe} onChange={(v) => set('auto_transcribe', v)} />
        <Toggle label="Auto-draft minutes after transcription" checked={values.auto_summarize} onChange={(v) => set('auto_summarize', v)} />
        <Toggle label="Auto-upload recordings on reconnect" checked={values.auto_upload_on_reconnect} onChange={(v) => set('auto_upload_on_reconnect', v)} />
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md grid grid-cols-1 md:grid-cols-2 gap-md">
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Institution name</label>
          <input
            value={values.institution_name}
            onChange={(e) => set('institution_name', e.target.value)}
            className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm"
          />
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Short name</label>
          <input
            value={values.institution_short}
            onChange={(e) => set('institution_short', e.target.value)}
            className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm"
          />
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Default language</label>
          <input
            value={values.default_language}
            onChange={(e) => set('default_language', e.target.value)}
            className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm"
          />
        </div>
        <div>
          <label className="font-label-caps text-label-caps text-on-surface-variant">Retention (days)</label>
          <input
            type="number"
            min={1}
            value={values.retention_days}
            onChange={(e) => set('retention_days', Number(e.target.value))}
            className="w-full rounded-lg border-outline-variant bg-surface-container mt-xs font-body-sm"
          />
        </div>
      </section>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
        <h3 className="font-h3 text-h3 mb-sm flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary">privacy_tip</span> Data Processing Notice
        </h3>
        <p className="font-caption text-caption text-on-surface-variant mb-sm">
          Shown to users to disclose what actually happens to recordings and transcripts. Keep this accurate - it names real
          processors (Supabase, ElevenLabs, Anthropic), not a placeholder.
        </p>
        <textarea
          value={values.data_processing_notice}
          onChange={(e) => set('data_processing_notice', e.target.value)}
          rows={4}
          className="w-full rounded-lg border-outline-variant bg-surface-container font-body-sm"
        />
      </section>

      {message ? (
        <div className={`font-body-sm rounded-lg p-sm ${message.tone === 'error' ? 'text-error bg-error-container' : 'text-success bg-success-container'}`}>
          {message.text}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="bg-primary text-on-primary px-lg py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}
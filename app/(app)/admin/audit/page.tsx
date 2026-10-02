'use client';

import { useEffect, useState } from 'react';
import { useRequireRole, useAuth } from '@/lib/auth';
import { usePageTitle } from '@/components/AppShell';
import { useToast } from '@/components/Toast';
import { useData } from '@/components/DataProvider';
import { logAudit, setSettings as saveSettings } from '@/lib/db';
import { fmtDate } from '@/lib/utils';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="w-11 h-6 bg-surface-variant rounded-full peer peer-focus:ring-2 peer-focus:ring-primary peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

export default function AdminAudit() {
  const { user, ready } = useRequireRole('admin');
  const { logout } = useAuth();
  usePageTitle('Audit & Privacy');
  const toast = useToast();
  const {
    settings: s,
    audit: auditRows,
    departments,
    users,
    meetings,
    tasks,
    transcripts,
    minutes,
    personalMeetings,
    ready: dataReady,
    refresh,
  } = useData();

  const [local, setLocal] = useState(false);
  const [auto, setAuto] = useState(true);
  const [sync, setSync] = useState(true);
  const [retention, setRetention] = useState(365);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!dataReady) return;
    setLocal(s.localProcessingOnly);
    setAuto(s.autoTranscribe);
    setSync(s.autoUploadOnReconnect);
    setRetention(s.retentionDays);
  }, [dataReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !user || !dataReady) return null;

  async function save(patch: Record<string, unknown>) {
    await saveSettings(patch);
    await refresh();
    toast('Privacy settings saved', 'success');
  }

  let logs = auditRows;
  if (query) logs = logs.filter((l) => `${l.action} ${l.detail} ${l.userName}`.toLowerCase().includes(query.toLowerCase()));

  function exportAll() {
    const data = { departments, users, meetings, tasks, transcripts, minutes, personalMeetings, audit: auditRows };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `smartmin-backup-${Date.now()}.json`;
    a.click();
    void logAudit('data_export', 'Full backup');
  }
  function exportAudit() {
    const all = auditRows;
    const csv = ['Time,Action,Detail,User,Role']
      .concat(
        all.map((l) =>
          [fmtDate(l.ts, true), l.action, (l.detail || '').replace(/"/g, '""'), l.userName, l.role]
            .map((v) => `"${v}"`)
            .join(','),
        ),
      )
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `audit-${Date.now()}.csv`;
    a.click();
    void logAudit('audit_export', `${all.length} rows`);
  }
  function wipeData() {
    if (!window.confirm('Sign out of SmartMin? (Data now lives in Supabase — use scripts/seed-demo.mjs --reset to reseed.)')) return;
    void logout();
  }

  return (
    <div className="p-lg max-w-container-max mx-auto w-full">
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Audit &amp; Privacy</h1>
        <p className="font-body-md text-on-surface-variant">
          Every action in SmartMin is logged for institutional accountability.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-md mb-lg">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
          <h3 className="font-h3 text-h3 mb-md flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">security</span> Privacy Controls
          </h3>
          <div className="space-y-md">
            {[
              { title: 'Keep Data On-Premises', sub: 'Prefer institutional infrastructure for audio & transcript storage.', v: local, set: (x: boolean) => { setLocal(x); save({ localProcessingOnly: x }); } },
              { title: 'Auto-process Recordings', sub: 'Automatically transcribe & summarize new audio uploads.', v: auto, set: (x: boolean) => { setAuto(x); save({ autoTranscribe: x }); } },
              { title: 'Auto-sync on Reconnect', sub: 'When the device reconnects, queued offline recordings sync & transcribe.', v: sync, set: (x: boolean) => { setSync(x); save({ autoUploadOnReconnect: x }); } },
            ].map((row) => (
              <div key={row.title} className="flex items-center justify-between p-md bg-surface-container-low rounded-lg">
                <div>
                  <p className="font-body-md font-semibold">{row.title}</p>
                  <p className="font-caption text-caption text-on-surface-variant">{row.sub}</p>
                </div>
                <Toggle checked={row.v} onChange={row.set} />
              </div>
            ))}
            <div className="p-md bg-surface-container-low rounded-lg">
              <div className="flex items-center justify-between mb-sm">
                <p className="font-body-md font-semibold">Retention Period</p>
                <span className="font-h3 text-h3 text-primary">{retention} days</span>
              </div>
              <input
                type="range"
                min={30}
                max={730}
                step={30}
                value={retention}
                onChange={(e) => setRetention(parseInt(e.target.value, 10))}
                onMouseUp={() => save({ retentionDays: retention })}
                className="w-full accent-primary"
              />
              <p className="font-caption text-caption text-on-surface-variant mt-xs">
                Audio &amp; transcripts older than this will be auto-deleted.
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col gap-md">
          <h3 className="font-h3 text-h3 flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">policy</span> Data Actions
          </h3>
          <button onClick={exportAll} className="bg-primary text-on-primary px-md py-sm rounded-lg shadow-primary-md flex items-center justify-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">download</span> Export Full Backup
          </button>
          <button onClick={exportAudit} className="border border-outline-variant px-md py-sm rounded-lg hover:bg-surface-container flex items-center justify-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">receipt_long</span> Export Audit Log (CSV)
          </button>
          <button onClick={wipeData} className="border border-error text-error px-md py-sm rounded-lg hover:bg-error/10 flex items-center justify-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">delete_forever</span> Local Data Wipe
          </button>
          <div className="bg-tertiary-fixed/50 border border-tertiary-container/30 p-sm rounded-lg">
            <p className="font-caption text-caption text-on-tertiary-fixed-variant">
              <strong>Compliance:</strong> Aligned with the ZPPSU Data Privacy Manual and the Data Privacy Act of 2012
              (RA 10173).
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-md border-b border-outline-variant flex flex-col md:flex-row md:items-center justify-between gap-sm">
          <h3 className="font-h3 text-h3">Audit Trail</h3>
          <div className="flex gap-sm flex-1 md:max-w-md">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by action or user"
              className="flex-1 px-md py-sm bg-surface-container border-transparent focus:border-primary focus:ring-0 rounded-lg"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Time', 'Action', 'Detail', 'User', 'Role'].map((h) => (
                  <th key={h} className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-xl text-center text-on-surface-variant">
                    No matching audit entries.
                  </td>
                </tr>
              ) : (
                logs.slice(0, 200).map((a) => (
                  <tr key={a.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                    <td className="py-sm px-md text-on-surface-variant whitespace-nowrap">{fmtDate(a.ts, true)}</td>
                    <td className="py-sm px-md">
                      <span className="pill pill-ai">{a.action}</span>
                    </td>
                    <td className="py-sm px-md">{a.detail || ''}</td>
                    <td className="py-sm px-md">{a.userName || '—'}</td>
                    <td className="py-sm px-md capitalize">{a.role || ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

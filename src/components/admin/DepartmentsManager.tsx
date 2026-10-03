'use client';

/**
 * Admin → Departments & Offices: full create / read / update / delete.
 *
 * Writes go straight through the browser client; RLS (departments_write,
 * 0002) is the gate — only admins can change anything. Every write asks for
 * the row back (`.select('id')`) because an RLS-denied UPDATE/DELETE is a
 * silent 0-row "success".
 *
 * Deleting a department that still has meetings is refused by the database
 * (meetings.department_id ... on delete restrict); the dialog explains that
 * before trying, and members are simply left without a department.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/ui/cn';

export interface DepartmentRow {
  id: string;
  name: string;
  short: string;
  type: 'college' | 'office';
  office_location: string | null;
  head_id: string | null;
  members: number;
  meetings: number;
}

export interface HeadOption {
  id: string;
  name: string;
  role: string;
  department_short: string | null;
}

type Draft = { name: string; short: string; type: 'college' | 'office'; office_location: string; head_id: string };
type DialogState = { mode: 'create' } | { mode: 'edit'; row: DepartmentRow } | { mode: 'delete'; row: DepartmentRow } | null;

const EMPTY: Draft = { name: '', short: '', type: 'college', office_location: '', head_id: '' };
const FORM_ID = 'department-form';

export default function DepartmentsManager({ rows, heads }: { rows: DepartmentRow[]; heads: HeadOption[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'college' | 'office'>('all');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [busy, setBusy] = useState(false);

  const headName = useMemo(() => new Map(heads.map((h) => [h.id, h.name])), [heads]);
  const visible = rows.filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.short.toLowerCase().includes(q) || (r.office_location ?? '').toLowerCase().includes(q);
  });

  function openCreate() {
    setDraft(EMPTY);
    setErrors({});
    setDialog({ mode: 'create' });
  }
  function openEdit(row: DepartmentRow) {
    setDraft({ name: row.name, short: row.short, type: row.type, office_location: row.office_location ?? '', head_id: row.head_id ?? '' });
    setErrors({});
    setDialog({ mode: 'edit', row });
  }
  function close() {
    if (!busy) setDialog(null);
  }

  function validate(d: Draft) {
    const e: Partial<Record<keyof Draft, string>> = {};
    if (d.name.trim().length < 3) e.name = 'Enter the full name (at least 3 characters).';
    const short = d.short.trim().toUpperCase();
    if (!/^[A-Z0-9&-]{2,10}$/.test(short)) e.short = 'Use 2–10 letters or numbers, e.g. CICS.';
    else if (rows.some((r) => r.short.toUpperCase() === short && (dialog?.mode !== 'edit' || r.id !== dialog.row.id))) {
      e.short = `${short} is already used by another department.`;
    }
    return e;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!dialog || dialog.mode === 'delete') return;
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    const body = {
      name: draft.name.trim(),
      short: draft.short.trim().toUpperCase(),
      type: draft.type,
      office_location: draft.office_location.trim() || null,
      head_id: draft.head_id || null,
    };
    const { data, error } =
      dialog.mode === 'create'
        ? await supabase.from('departments').insert(body).select('id')
        : await supabase.from('departments').update(body).eq('id', dialog.row.id).select('id');
    setBusy(false);
    if (error || !data?.length) {
      toast.error(
        error?.code === '23505'
          ? `${body.short} is already used by another department.`
          : `Couldn't save the department. ${error?.message ?? 'Only administrators can change departments.'}`,
      );
      return;
    }
    toast.success(dialog.mode === 'create' ? `${body.short} added.` : `${body.short} updated.`);
    setDialog(null);
    router.refresh();
  }

  async function remove() {
    if (dialog?.mode !== 'delete') return;
    const row = dialog.row;
    setBusy(true);
    const { data, error } = await supabase.from('departments').delete().eq('id', row.id).select('id');
    setBusy(false);
    if (error || !data?.length) {
      toast.error(
        error?.code === '23503'
          ? `${row.short} still has meetings, so it can't be deleted. Keep it, or move its meetings first.`
          : `Couldn't delete ${row.short}. ${error?.message ?? ''}`,
      );
      return;
    }
    toast.success(`${row.short} deleted.`);
    setDialog(null);
    router.refresh();
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <div className="mb-md flex flex-col gap-sm md:flex-row md:items-end md:justify-between">
        <div className="flex flex-1 flex-col gap-sm sm:flex-row">
          <label className="relative flex-1 sm:max-w-sm">
            <span className="sr-only">Search departments</span>
            <Icon name="search" size={20} className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, code or location"
              className={cn(inputClass, 'pl-xl')}
            />
          </label>
          <div className="flex gap-xs" role="group" aria-label="Filter by type">
            {(['all', 'college', 'office'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'min-h-10 rounded-lg border px-md font-body-sm font-semibold capitalize transition-colors duration-150',
                  typeFilter === t ? 'border-primary bg-primary text-on-primary' : 'border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container',
                )}
              >
                {t === 'all' ? 'All' : `${t}s`}
              </button>
            ))}
          </div>
        </div>
        <Button icon="add" onClick={openCreate}>
          Add department
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="domain"
          title={rows.length ? 'No department matches' : 'No departments yet'}
          action={
            rows.length ? (
              <Button variant="secondary" onClick={() => { setQuery(''); setTypeFilter('all'); }}>
                Clear filters
              </Button>
            ) : (
              <Button icon="add" onClick={openCreate}>
                Add department
              </Button>
            )
          }
        >
          {rows.length ? 'Try another search or filter.' : 'Add the colleges and offices that meetings and people belong to.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full min-w-[760px] text-left text-body-sm">
            <caption className="sr-only">Departments and offices</caption>
            <thead className="border-b border-outline-variant bg-surface-container-low">
              <tr>
                {['Name', 'Code', 'Type', 'Head', 'Location', 'People', 'Meetings'].map((h) => (
                  <th key={h} scope="col" className="px-md py-sm font-label-caps text-label-caps text-on-surface-variant">
                    {h}
                  </th>
                ))}
                <th scope="col" className="px-md py-sm text-right font-label-caps text-label-caps text-on-surface-variant">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id} className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low">
                  <th scope="row" className="px-md py-sm font-semibold">
                    {d.name}
                  </th>
                  <td className="px-md py-sm font-semibold text-primary">{d.short}</td>
                  <td className="px-md py-sm capitalize">{d.type}</td>
                  <td className="px-md py-sm">
                    {d.head_id ? headName.get(d.head_id) ?? 'Assigned' : <span className="text-on-surface-variant">Not set</span>}
                  </td>
                  <td className="px-md py-sm text-on-surface-variant">{d.office_location ?? '—'}</td>
                  <td className="px-md py-sm tabular-nums">{d.members}</td>
                  <td className="px-md py-sm tabular-nums">{d.meetings}</td>
                  <td className="px-md py-sm">
                    <div className="flex justify-end gap-xs">
                      <Button variant="secondary" size="sm" icon="edit" onClick={() => openEdit(d)} aria-label={`Edit ${d.name}`}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="delete"
                        className="text-error hover:bg-error/5"
                        onClick={() => setDialog({ mode: 'delete', row: d })}
                        aria-label={`Delete ${d.name}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-sm font-caption text-caption text-on-surface-variant">
        {visible.length} of {rows.length} shown. The head set here is who approves and signs the department&apos;s minutes.
      </p>

      <Dialog
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        onClose={close}
        dismissible={!busy}
        icon="domain"
        title={dialog?.mode === 'edit' ? `Edit ${dialog.row.short}` : 'Add department'}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} icon="check" loading={busy}>
              {dialog?.mode === 'edit' ? 'Save changes' : 'Add department'}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={save} noValidate className="grid grid-cols-1 gap-md sm:grid-cols-3">
          <Field label="Name" required error={errors.name} className="sm:col-span-3">
            {(p) => (
              <input {...p} className={inputClass} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="College of Information and Computing Sciences" />
            )}
          </Field>
          <Field label="Short code" required error={errors.short} hint="Shown on badges and minutes.">
            {(p) => <input {...p} className={cn(inputClass, 'uppercase')} value={draft.short} onChange={(e) => set('short', e.target.value)} placeholder="CICS" maxLength={10} />}
          </Field>
          <Field label="Type">
            {(p) => (
              <select {...p} className={inputClass} value={draft.type} onChange={(e) => set('type', e.target.value as Draft['type'])}>
                <option value="college">College</option>
                <option value="office">Office</option>
              </select>
            )}
          </Field>
          <Field label="Location">
            {(p) => <input {...p} className={inputClass} value={draft.office_location} onChange={(e) => set('office_location', e.target.value)} placeholder="Bldg A, 4F" />}
          </Field>
          <Field label="Department head" hint="Approves and signs this department's minutes." className="sm:col-span-3">
            {(p) => (
              <select {...p} className={inputClass} value={draft.head_id} onChange={(e) => set('head_id', e.target.value)}>
                <option value="">Not set</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                    {h.department_short ? ` — ${h.department_short}` : ''}
                    {h.role !== 'head' ? ` (${h.role})` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={dialog?.mode === 'delete'}
        onClose={close}
        dismissible={!busy}
        size="sm"
        icon="delete"
        title={dialog?.mode === 'delete' ? `Delete ${dialog.row.short}?` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon="delete" onClick={remove} loading={busy} disabled={dialog?.mode === 'delete' && dialog.row.meetings > 0}>
              Delete
            </Button>
          </>
        }
      >
        {dialog?.mode === 'delete' ? (
          dialog.row.meetings > 0 ? (
            <p className="font-body-sm">
              <strong>{dialog.row.name}</strong> has {dialog.row.meetings} meeting{dialog.row.meetings === 1 ? '' : 's'} on record. Meeting records are kept, so
              a department with meetings can&apos;t be deleted. You can rename it instead.
            </p>
          ) : (
            <p className="font-body-sm">
              <strong>{dialog.row.name}</strong> will be removed.
              {dialog.row.members > 0
                ? ` Its ${dialog.row.members} member${dialog.row.members === 1 ? '' : 's'} will have no department until you assign one in User Management.`
                : ''}{' '}
              This can&apos;t be undone.
            </p>
          )
        ) : null}
      </Dialog>
    </>
  );
}

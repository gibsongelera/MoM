'use client';

/**
 * Evidence kept with a meeting (client request: photos of the paper attendance
 * sheet, other pictures, and the photographed handwritten panel notes).
 *
 * Files go straight to the private meeting-attachments bucket under
 * <meetingId>/<uuid>.<ext>; the row in meeting_attachments is written after
 * the upload succeeds. Both are authorised by the same edit-rights rule.
 */
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ATTACHMENT_KIND_LABEL, attachmentFileProblem, extensionFor, type AttachmentKind } from '@/lib/meetings/files';
import { downscaleImage } from '@/lib/meetings/image';
import { fmtManila } from '@/lib/utils/datetime';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { inputClass } from '@/components/ui/Field';
import { useOnline } from '@/lib/hooks/useOnline';
import { useToast } from '@/components/ui/Toast';

export interface AttachmentItem {
  id: string;
  kind: AttachmentKind;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  storage_path: string;
  created_at: string;
  /** Signed, time-limited URL (the bucket is private). */
  url: string | null;
}

export default function AttachmentsPanel({
  meetingId,
  items,
  canEdit,
  defaultKind = 'attendance_sheet',
}: {
  meetingId: string;
  items: AttachmentItem[];
  canEdit: boolean;
  defaultKind?: AttachmentKind;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const fileId = useId();
  const kindId = useId();
  const captionId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<AttachmentKind>(defaultKind);
  const [caption, setCaption] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setProblem(null);
    const prepared = await downscaleImage(file);
    const issue = attachmentFileProblem(prepared);
    if (issue) {
      setProblem(issue);
      setBusy(false);
      return;
    }
    const path = `${meetingId}/${crypto.randomUUID()}.${extensionFor(prepared.type)}`;
    const { error: upErr } = await supabase.storage
      .from('meeting-attachments')
      .upload(path, prepared, { contentType: prepared.type, upsert: false });
    if (upErr) {
      setBusy(false);
      setProblem(`The file didn't upload. ${upErr.message}`);
      return;
    }
    const { error: rowErr } = await supabase.from('meeting_attachments').insert({
      meeting_id: meetingId,
      kind,
      storage_path: path,
      file_name: file.name.slice(0, 255),
      mime_type: prepared.type,
      size_bytes: prepared.size,
      caption: caption.trim() || null,
    });
    if (rowErr) {
      // Don't leave an orphaned object behind.
      await supabase.storage.from('meeting-attachments').remove([path]);
      setBusy(false);
      setProblem(`The file didn't save. ${rowErr.message}`);
      return;
    }
    setBusy(false);
    setFile(null);
    setCaption('');
    setInputKey((k) => k + 1);
    toast.success(`${ATTACHMENT_KIND_LABEL[kind]} attached.`);
    router.refresh();
  }

  async function remove(item: AttachmentItem) {
    if (!window.confirm(`Remove "${item.file_name}" from this meeting? This can't be undone.`)) return;
    const { error } = await supabase.from('meeting_attachments').delete().eq('id', item.id);
    if (error) {
      toast.error(`Couldn't remove the file. ${error.message}`);
      return;
    }
    await supabase.storage.from('meeting-attachments').remove([item.storage_path]);
    toast.success('Attachment removed.');
    router.refresh();
  }

  return (
    <section aria-labelledby="attachments-heading" className="flex flex-col gap-md">
      <h2 id="attachments-heading" className="font-h3 text-h3">
        Attachments and evidence
      </h2>

      {canEdit ? (
        <form
          onSubmit={upload}
          className="grid grid-cols-1 gap-sm rounded-xl border border-outline-variant bg-surface-container-low p-md md:grid-cols-[2fr_1fr_2fr_auto] md:items-end"
        >
          <div>
            <label htmlFor={fileId} className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Photo or PDF
            </label>
            <input
              key={inputKey}
              id={fileId}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setProblem(null);
              }}
              className="mt-xs block w-full font-body-sm file:mr-sm file:min-h-8 file:rounded-lg file:border file:border-outline file:bg-surface-container-lowest file:px-sm file:font-semibold file:text-on-surface"
              aria-describedby={problem ? `${fileId}-problem` : undefined}
            />
          </div>
          <div>
            <label htmlFor={kindId} className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Type
            </label>
            <select id={kindId} className={`${inputClass} mt-xs`} value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
              {(Object.keys(ATTACHMENT_KIND_LABEL) as AttachmentKind[]).map((k) => (
                <option key={k} value={k}>
                  {ATTACHMENT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={captionId} className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Caption (optional)
            </label>
            <input id={captionId} className={`${inputClass} mt-xs`} maxLength={500} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <Button type="submit" icon="upload" loading={busy} disabled={!file || !online}>
            Attach
          </Button>
          {problem ? (
            <p id={`${fileId}-problem`} role="alert" className="font-caption text-caption text-error md:col-span-4">
              {problem}
            </p>
          ) : null}
          {!online ? (
            <p className="font-caption text-caption text-on-surface-variant md:col-span-4">
              You&apos;re offline. Attaching files needs an internet connection.
            </p>
          ) : null}
        </form>
      ) : null}

      {items.length === 0 ? (
        <EmptyState icon="photo_library" title="No attachments yet">
          Attach a photo of the signed paper attendance sheet, pictures from the meeting, or the panel&apos;s handwritten notes.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <li key={a.id} className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
              {a.mime_type.startsWith('image/') && a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-surface-container">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed private-bucket URL */}
                  <img src={a.url} alt={a.caption || `${ATTACHMENT_KIND_LABEL[a.kind]}: ${a.file_name}`} className="h-full w-full object-cover" />
                </a>
              ) : (
                <a
                  href={a.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex aspect-[4/3] items-center justify-center bg-surface-container text-primary"
                >
                  <Icon name="picture_as_pdf" size={48} />
                  <span className="sr-only">Open {a.file_name}</span>
                </a>
              )}
              <div className="flex flex-1 flex-col gap-xs p-sm">
                <span className="pill pill-regular self-start">{ATTACHMENT_KIND_LABEL[a.kind]}</span>
                <p className="truncate font-body-sm font-semibold" title={a.file_name}>
                  {a.caption || a.file_name}
                </p>
                <p className="font-caption text-caption text-on-surface-variant">{fmtManila(a.created_at)}</p>
                {canEdit ? (
                  <Button variant="ghost" size="sm" icon="delete" className="mt-auto self-start text-error" onClick={() => remove(a)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

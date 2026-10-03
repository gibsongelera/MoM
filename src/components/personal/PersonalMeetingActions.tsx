'use client';

/** Edit / archive / delete / ask-AI buttons on a personal meeting's own page. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { PersonalMeeting } from '@/lib/personal/types';
import { openAssistant } from '@/components/assistant/FloatingAssistant';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import PersonalMeetingForm, { type LinkableMeeting } from './PersonalMeetingForm';

const FORM_ID = 'personal-meeting-edit';

export default function PersonalMeetingActions({ row, userId, linkable }: { row: PersonalMeeting; userId: string; linkable: LinkableMeeting[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggleArchive() {
    const archived_at = row.archived_at ? null : new Date().toISOString();
    const { data, error } = await supabase.from('personal_meetings').update({ archived_at }).eq('id', row.id).select('id');
    if (error || !data?.length) {
      toast.error(`Couldn't update it. ${error?.message ?? ''}`);
      return;
    }
    toast.success(archived_at ? 'Archived. Find it under Personal Meetings → Archived.' : 'Restored to your active log.');
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const { data, error } = await supabase.from('personal_meetings').delete().eq('id', row.id).select('id');
    if (!error && data?.length && row.audio_path) await supabase.storage.from('personal-audio').remove([row.audio_path]);
    setBusy(false);
    if (error || !data?.length) {
      toast.error(`Couldn't delete it. ${error?.message ?? ''}`);
      return;
    }
    toast.success('Deleted.');
    router.push('/faculty/personal-meetings');
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-sm">
        <Button variant="gold" icon="smart_toy" onClick={() => openAssistant()}>
          Ask AI
        </Button>
        <Button variant="secondary" icon="edit" onClick={() => setDialog('edit')}>
          Edit
        </Button>
        <Button variant="secondary" icon={row.archived_at ? 'unarchive' : 'archive'} onClick={toggleArchive}>
          {row.archived_at ? 'Restore' : 'Archive'}
        </Button>
        <Button variant="secondary" icon="delete" className="text-error" onClick={() => setDialog('delete')}>
          Delete
        </Button>
      </div>

      <Dialog
        open={dialog === 'edit'}
        onClose={() => !busy && setDialog(null)}
        dismissible={!busy}
        size="lg"
        icon="edit"
        title="Edit entry"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} icon="check" loading={busy}>
              Save changes
            </Button>
          </>
        }
      >
        {dialog === 'edit' ? (
          <PersonalMeetingForm
            formId={FORM_ID}
            userId={userId}
            initial={row}
            linkable={linkable}
            onBusyChange={setBusy}
            onSaved={() => {
              setDialog(null);
              toast.success('Changes saved.');
              router.refresh();
            }}
            onError={(m) => toast.error(m)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onClose={() => !busy && setDialog(null)}
        dismissible={!busy}
        size="sm"
        icon="delete"
        title="Delete this entry?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon="delete" onClick={remove} loading={busy}>
              Delete
            </Button>
          </>
        }
      >
        <p className="font-body-sm">
          <strong>{row.title}</strong>
          {row.audio_path ? ', its recording and its transcript' : ''} will be permanently deleted. Archive it instead if you may need it later.
        </p>
      </Dialog>
    </>
  );
}

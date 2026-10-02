import { createClient } from '@/lib/supabase/server';
import ApprovalsList, { type PendingApproval } from '@/components/dashboard/ApprovalsList';

export default async function HeadApprovalsPage() {
  const supabase = await createClient();
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, starts_at, minutes(id, document_title)')
    .eq('status', 'pending_approval')
    .order('starts_at', { ascending: false });

  const pending: PendingApproval[] = (meetings ?? [])
    .map((m) => {
      const minutes = Array.isArray(m.minutes) ? m.minutes[0] : m.minutes;
      if (!minutes) return null;
      return {
        meetingId: m.id,
        minutesId: minutes.id,
        title: m.title,
        startsAt: m.starts_at,
        documentTitle: minutes.document_title,
      };
    })
    .filter((x): x is PendingApproval => x !== null);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Approvals &amp; Signing</h1>
        <p className="font-body-lg text-on-surface-variant">
          Signing calls the same sign_minutes() / lock_minutes() database functions the rest of the system uses -
          approving here locks the document and clears it from this list.
        </p>
      </header>
      <ApprovalsList pending={pending} />
    </>
  );
}

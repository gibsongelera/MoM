import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadPrintableMeeting } from '@/lib/meetings/printable';
import { fileNameFor } from '@/lib/ai/doc-title';
import MinutesDocument from '@/components/meetings/MinutesDocument';
import PrintToolbar from '@/components/meetings/PrintToolbar';

export default async function PrintMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const { autoprint } = await searchParams;
  const supabase = await createClient();
  const data = await loadPrintableMeeting(supabase, id);
  if (!data) notFound();

  const fileName = fileNameFor({
    title: data.meeting.title,
    meeting_type: data.meeting.meeting_type,
    sub_type: data.meeting.sub_type,
    project_title: data.meeting.project_title,
    starts_at: data.meeting.starts_at,
  });

  return (
    <>
      <PrintToolbar autoPrint={autoprint === '1'} fileName={fileName} />
      <MinutesDocument data={data} />
    </>
  );
}

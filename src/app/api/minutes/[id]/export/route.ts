/**
 * Download the minutes as PDF or Word: GET /api/minutes/<meetingId>/export?format=pdf|docx
 *
 * Read through the caller's RLS-scoped client (loadPrintableMeeting), so a
 * user can only download minutes they could already open on screen. Both
 * formats render the same CHED-format tree as the print view
 * (src/lib/minutes/ched.ts); drafts carry the DRAFT mark.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/ai/guard';
import { loadPrintableMeeting } from '@/lib/meetings/printable';
import { buildChedDocument } from '@/lib/minutes/ched';
import { renderMinutesPdf } from '@/lib/minutes/pdf';
import { renderMinutesDocx } from '@/lib/minutes/docx';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { id } = await params;
  const format = new URL(request.url).searchParams.get('format') === 'docx' ? 'docx' : 'pdf';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown meeting.' }, { status: 404 });

  const supabase = await createClient();
  const data = await loadPrintableMeeting(supabase, id);
  if (!data) return NextResponse.json({ error: "That meeting wasn't found, or you can't open it." }, { status: 404 });

  const doc = buildChedDocument(data);
  try {
    const buffer = format === 'docx' ? await renderMinutesDocx(doc) : await renderMinutesPdf(doc);
    const ext = format === 'docx' ? 'docx' : 'pdf';
    const type = format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
    const name = `${doc.fileName}${doc.draft ? '_DRAFT' : ''}.${ext}`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'content-type': type,
        'content-disposition': `attachment; filename="${name.replace(/[^\w.-]+/g, '_')}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error(`[minutes-export] ${JSON.stringify({ id, format, error: err instanceof Error ? err.message : String(err) })}`);
    return NextResponse.json({ error: `Couldn't create the ${format.toUpperCase()} file. Try again.` }, { status: 500 });
  }
}

'use client';

import { useEffect } from 'react';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

/**
 * Print / close controls above the document (hidden when printing). With
 * autoPrint, the browser's print dialog opens once the page has rendered —
 * the "Print now" path from the save prompt and the meeting hub.
 */
export default function PrintToolbar({ autoPrint, fileName, meetingId }: { autoPrint: boolean; fileName: string; meetingId: string }) {
  useEffect(() => {
    // The PDF "Save as" name comes from the document title.
    document.title = fileName;
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint, fileName]);

  return (
    <div className="no-print mx-auto mb-md flex max-w-[850px] flex-wrap items-center justify-between gap-sm">
      <p className="font-body-sm text-on-surface-variant">Preview of the minutes (CHED format). Print, or download a PDF or Word copy.</p>
      <div className="flex flex-wrap gap-sm">
        <a href={`/api/minutes/${meetingId}/export?format=pdf`} className={buttonClasses('secondary', 'md', 'pl-sm')}>
          <Icon name="picture_as_pdf" size={18} /> PDF
        </a>
        <a href={`/api/minutes/${meetingId}/export?format=docx`} className={buttonClasses('secondary', 'md', 'pl-sm')}>
          <Icon name="description" size={18} /> Word
        </a>
        <Button variant="secondary" icon="close" onClick={() => window.close()}>
          Close
        </Button>
        <Button icon="print" className="print-keep" onClick={() => window.print()}>
          Print
        </Button>
      </div>
    </div>
  );
}

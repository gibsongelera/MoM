'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Print / close controls above the document (hidden when printing). With
 * autoPrint, the browser's print dialog opens once the page has rendered —
 * the "Print now" path from the save prompt and the meeting hub.
 */
export default function PrintToolbar({ autoPrint, fileName }: { autoPrint: boolean; fileName: string }) {
  useEffect(() => {
    // The PDF "Save as" name comes from the document title.
    document.title = fileName;
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint, fileName]);

  return (
    <div className="no-print mx-auto mb-md flex max-w-[850px] flex-wrap items-center justify-between gap-sm">
      <p className="font-body-sm text-on-surface-variant">Preview. Use Print, then choose a printer or “Save as PDF”.</p>
      <div className="flex gap-sm">
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

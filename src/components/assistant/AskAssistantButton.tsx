'use client';

import { Button } from '@/components/ui/Button';
import { openAssistant } from './FloatingAssistant';

/** Opens the floating assistant, grounded on the current page (e.g. this meeting). */
export default function AskAssistantButton({ label = 'Ask AI about this meeting', question }: { label?: string; question?: string }) {
  return (
    <Button variant="gold" icon="smart_toy" onClick={() => openAssistant(question)}>
      {label}
    </Button>
  );
}

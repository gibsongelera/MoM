'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fmtManilaDate } from '@/lib/utils/datetime';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import SignaturePad from './SignaturePad';

export interface PendingApproval {
  meetingId: string;
  minutesId: string;
  title: string;
  startsAt: string;
  documentTitle: string | null;
}

export default function ApprovalsList({ pending, initialOpenId }: { pending: PendingApproval[]; initialOpenId?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [openId, setOpenId] = useState<string | null>(
    initialOpenId && pending.some((p) => p.meetingId === initialOpenId) ? initialOpenId : null,
  );
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve(item: PendingApproval) {
    if (!signature) {
      setError('Sign in the box (or type your name) before approving.');
      return;
    }
    setSaving(true);
    setError(null);
    // One RPC signs as approver and locks atomically, so a signed document is
    // never left unlocked if the second step of a two-call flow failed.
    const { error: approveError } = await supabase.rpc('approve_minutes', {
      p_minutes_id: item.minutesId,
      p_data_url: signature,
    });
    setSaving(false);
    if (approveError) {
      setError(approveError.message);
      return;
    }
    setOpenId(null);
    setSignature(null);
    router.refresh();
  }

  if (pending.length === 0) {
    return (
      <EmptyState icon="task_alt" title="Nothing to approve">
        Minutes that secretaries route to you for approval appear here.
      </EmptyState>
    );
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
      {pending.map((item) => (
        <div key={item.meetingId} className="p-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Icon name="description" size={24} />
              </div>
              <div>
                <p className="font-body-md font-semibold">{item.documentTitle || item.title}</p>
                <p className="font-caption text-caption text-on-surface-variant">
                  {fmtManilaDate(item.startsAt)} · Minutes ready for approval
                </p>
              </div>
            </div>
            <Button
              size="sm"
              icon={openId === item.meetingId ? 'expand_less' : 'draw'}
              aria-expanded={openId === item.meetingId}
              aria-controls={`approve-${item.meetingId}`}
              onClick={() => {
                setOpenId(openId === item.meetingId ? null : item.meetingId);
                setError(null);
              }}
            >
              {openId === item.meetingId ? 'Close' : 'Review and sign'}
            </Button>
          </div>

          {openId === item.meetingId ? (
            <div id={`approve-${item.meetingId}`} className="mt-md pt-md border-t border-outline-variant flex flex-col gap-sm">
              <p className="font-body-sm text-on-surface-variant">
                Read the full minutes first — attendance, discussion, action items and attachments.
              </p>
              <a href={`/print/meetings/${item.meetingId}`} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'md', 'self-start')}>
                <Icon name="visibility" size={18} /> Read the minutes
              </a>
              <SignaturePad onChange={setSignature} label="Your signature" />
              {error ? (
                <p role="alert" className="text-error font-body-sm">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button icon="verified" onClick={() => approve(item)} loading={saving}>
                  Approve and sign
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
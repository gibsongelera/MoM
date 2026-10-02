'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import SignaturePad from './SignaturePad';

export interface PendingApproval {
  meetingId: string;
  minutesId: string;
  title: string;
  startsAt: string;
  documentTitle: string | null;
}

export default function ApprovalsList({ pending }: { pending: PendingApproval[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve(item: PendingApproval) {
    if (!signature) {
      setError('Sign above before approving.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: signError } = await supabase.rpc('sign_minutes', {
      p_minutes_id: item.minutesId,
      p_role_label: 'Head',
      p_data_url: signature,
    });
    if (signError) {
      setSaving(false);
      setError(signError.message);
      return;
    }
    const { error: lockError } = await supabase.rpc('lock_minutes', { p_minutes_id: item.minutesId });
    setSaving(false);
    if (lockError) {
      setError(lockError.message);
      return;
    }
    setOpenId(null);
    setSignature(null);
    router.refresh();
  }

  if (pending.length === 0) {
    return <div className="p-md text-on-surface-variant text-center bg-surface-container-lowest border border-outline-variant rounded-xl">No documents awaiting your signature.</div>;
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl divide-y divide-outline-variant">
      {pending.map((item) => (
        <div key={item.meetingId} className="p-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined">description</span>
              </div>
              <div>
                <p className="font-body-md font-semibold">{item.documentTitle || item.title}</p>
                <p className="font-caption text-caption text-on-surface-variant">
                  {new Date(item.startsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · MoM ready for approval
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setOpenId(openId === item.meetingId ? null : item.meetingId);
                setError(null);
              }}
              className="bg-primary text-on-primary px-md py-xs rounded-lg shadow-primary-md flex items-center gap-xs font-semibold text-body-sm"
            >
              <span className="material-symbols-outlined text-[16px]">draw</span> {openId === item.meetingId ? 'Close' : 'Review'}
            </button>
          </div>

          {openId === item.meetingId ? (
            <div className="mt-md pt-md border-t border-outline-variant">
              <SignaturePad onChange={setSignature} />
              {error ? <p className="text-error font-body-sm mt-sm">{error}</p> : null}
              <div className="flex justify-end mt-sm">
                <button
                  onClick={() => approve(item)}
                  disabled={saving}
                  className="bg-primary text-on-primary px-lg py-sm rounded-lg shadow-primary-md font-semibold disabled:opacity-60"
                >
                  {saving ? 'Approving...' : 'Approve & Sign'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
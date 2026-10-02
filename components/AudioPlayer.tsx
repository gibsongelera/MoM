'use client';

// Compact player for a meeting's stored recording(s). Streams the private
// meeting-audio object via the short-lived signed URL resolved in DataProvider.
import { useData } from '@/components/DataProvider';
import { fmtTime } from '@/lib/utils';

export function AudioPlayer({ meetingId, compact = false }: { meetingId?: string; compact?: boolean }) {
  const { audioRecordings } = useData();
  if (!meetingId) return null;
  const recs = audioRecordings
    .filter((a) => a.meetingId === meetingId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (recs.length === 0) return null;

  const primary = recs[0];

  if (compact) {
    return primary.url ? (
      <div className="flex items-center gap-sm mt-sm">
        <span className="material-symbols-outlined text-[16px] text-primary">graphic_eq</span>
        <audio controls preload="none" src={primary.url} className="h-8 max-w-full" />
      </div>
    ) : null;
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
      <h3 className="font-h3 text-h3 flex items-center gap-sm mb-sm">
        <span className="material-symbols-outlined text-primary">graphic_eq</span> Meeting Recording
        {recs.length > 1 ? (
          <span className="font-caption text-caption text-on-surface-variant">({recs.length} takes)</span>
        ) : null}
      </h3>
      {primary.url ? (
        <audio controls preload="none" src={primary.url} className="w-full" />
      ) : (
        <p className="font-body-sm text-on-surface-variant italic">Preparing playback link…</p>
      )}
      <p className="font-caption text-caption text-on-surface-variant mt-xs">
        {primary.durationSec ? `Duration ${fmtTime(primary.durationSec)} · ` : ''}
        {(primary.language || 'en-US').toUpperCase()} · stored in institutional Storage
      </p>
      {recs.length > 1 ? (
        <div className="mt-sm space-y-xs">
          {recs.slice(1).map((r) =>
            r.url ? (
              <div key={r.id} className="flex items-center gap-sm">
                <span className="font-caption text-caption text-on-surface-variant shrink-0">
                  {r.durationSec ? fmtTime(r.durationSec) : '—'}
                </span>
                <audio controls preload="none" src={r.url} className="h-8 flex-1" />
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

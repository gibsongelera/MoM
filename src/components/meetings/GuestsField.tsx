'use client';

import type { MeetingGuest } from '@/lib/types/domain';
import { MAX_GUESTS } from '@/lib/meetings/people';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';

/**
 * Participants who don't have an account: typed by name, office optional.
 * Client request: "What if wala [account]? … puwede lang siya mag-type ng
 * name … optional siya dito sa baba." They are not notified (no account).
 */
export default function GuestsField({
  value,
  onChange,
  error,
}: {
  value: MeetingGuest[];
  onChange: (next: MeetingGuest[]) => void;
  error?: string;
}) {
  const errorId = error ? 'guests-error' : undefined;

  function update(id: string, patch: Partial<MeetingGuest>) {
    onChange(value.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  return (
    <fieldset className="flex flex-col gap-sm" aria-describedby={errorId}>
      <legend className="mb-xs font-label-caps text-label-caps uppercase text-on-surface-variant">
        People without an account <span className="normal-case font-normal">(optional)</span>
      </legend>
      {value.length === 0 ? (
        <p className="font-caption text-caption text-on-surface-variant">
          Add guests, visitors or anyone else attending who doesn&apos;t use SmartMin. They appear on the attendance sheet and minutes.
        </p>
      ) : null}
      {value.map((g, i) => (
        <div key={g.id} className="grid grid-cols-[1fr_auto] gap-sm sm:grid-cols-[2fr_1.5fr_auto]">
          <div>
            <label htmlFor={`guest-name-${g.id}`} className="sr-only">
              Guest {i + 1} name
            </label>
            <input
              id={`guest-name-${g.id}`}
              className={inputClass}
              placeholder="Full name"
              maxLength={120}
              value={g.name}
              onChange={(e) => update(g.id, { name: e.target.value })}
            />
          </div>
          <div className="col-span-1 row-start-2 sm:row-start-auto">
            <label htmlFor={`guest-aff-${g.id}`} className="sr-only">
              Guest {i + 1} office or school (optional)
            </label>
            <input
              id={`guest-aff-${g.id}`}
              className={inputClass}
              placeholder="Office / school (optional)"
              maxLength={120}
              value={g.affiliation ?? ''}
              onChange={(e) => update(g.id, { affiliation: e.target.value })}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove guest ${i + 1}`}
            onClick={() => onChange(value.filter((x) => x.id !== g.id))}
          >
            <Icon name="close" size={20} />
          </Button>
        </div>
      ))}
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon="person_add"
          onClick={() => onChange([...value, { id: crypto.randomUUID(), name: '' }])}
          disabled={value.length >= MAX_GUESTS}
        >
          Add someone without an account
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="font-caption text-caption text-error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

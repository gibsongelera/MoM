'use client';

import { useId, useMemo, useState } from 'react';
import { ROLE_LABEL, type PersonOption } from '@/lib/types/domain';
import { inputClass } from '@/components/ui/Field';

/**
 * Participants with accounts (they are invited and notified). Lists the
 * department's active accounts with a filter box, as in the demo the client
 * reviewed ("Makita mo lahat 'yong mga account nila dito").
 */
export default function ParticipantsPicker({
  people,
  selected,
  onChange,
  lockedIds = [],
}: {
  people: PersonOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Already on the meeting through a role (e.g. the approving head); shown checked. */
  lockedIds?: string[];
}) {
  const filterId = useId();
  const [filter, setFilter] = useState('');
  const chosen = new Set([...selected, ...lockedIds]);

  const visible = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('en');
    return q ? people.filter((p) => p.name.toLocaleLowerCase('en').includes(q)) : people;
  }, [people, filter]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="mb-xs font-label-caps text-label-caps uppercase text-on-surface-variant">
        Participants with accounts{' '}
        <span className="normal-case font-normal">({chosen.size} selected — they&apos;ll be notified)</span>
      </legend>
      <label htmlFor={filterId} className="sr-only">
        Filter people
      </label>
      <input
        id={filterId}
        type="search"
        className={inputClass}
        placeholder="Filter by name"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="grid max-h-56 grid-cols-1 gap-xs overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-low p-sm sm:grid-cols-2">
        {visible.length === 0 ? (
          <li className="col-span-full py-sm text-center font-body-sm text-on-surface-variant">No one matches &ldquo;{filter}&rdquo;.</li>
        ) : (
          visible.map((p) => {
            const locked = lockedIds.includes(p.id);
            return (
              <li key={p.id}>
                <label className="flex min-h-8 cursor-pointer items-center gap-sm rounded-md px-xs hover:bg-surface-container">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-outline text-primary"
                    checked={chosen.has(p.id)}
                    disabled={locked}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="min-w-0 flex-1 truncate font-body-sm">{p.name}</span>
                  <span className="shrink-0 font-caption text-caption text-on-surface-variant">
                    {locked ? 'Approver' : p.role ? ROLE_LABEL[p.role].split(' ')[0] : ''}
                  </span>
                </label>
              </li>
            );
          })
        )}
      </ul>
    </fieldset>
  );
}

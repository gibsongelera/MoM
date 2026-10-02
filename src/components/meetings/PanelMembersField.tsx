'use client';

import type { PanelMember, PersonOption } from '@/lib/types/domain';
import { MAX_PANEL } from '@/lib/meetings/people';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import PersonField from './PersonField';

/**
 * Capstone panel: usually two members, sometimes three or four ("add item").
 * Each row is a typed name that may be linked to an account.
 */
export default function PanelMembersField({
  value,
  onChange,
  options,
  error,
}: {
  value: PanelMember[];
  onChange: (next: PanelMember[]) => void;
  options: PersonOption[];
  error?: string;
}) {
  const errorId = error ? 'panel-members-error' : undefined;

  function update(index: number, next: PanelMember) {
    onChange(value.map((row, i) => (i === index ? next : row)));
  }

  return (
    <fieldset className="flex flex-col gap-sm" aria-describedby={errorId}>
      <legend className="mb-xs font-label-caps text-label-caps uppercase text-on-surface-variant">Panel members</legend>
      {value.map((row, i) => (
        <div key={i} className="flex items-start gap-sm">
          <label htmlFor={`panel-member-${i}`} className="sr-only">
            Panel member {i + 1}
          </label>
          <div className="min-w-0 flex-1">
            <PersonField
              id={`panel-member-${i}`}
              value={{ name: row.name, userId: row.userId ?? null }}
              onChange={(p) => update(i, { ...row, name: p.name, userId: p.userId ?? null })}
              options={options}
              placeholder={`Panel member ${i + 1} — type a name`}
              invalid={!!error}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove panel member ${i + 1}`}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            disabled={value.length <= 1}
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
          onClick={() => onChange([...value, { name: '' }])}
          disabled={value.length >= MAX_PANEL}
        >
          Add panel member
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

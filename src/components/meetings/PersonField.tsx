'use client';

/**
 * Type any name, or pick a suggested account (hybrid input, client request:
 * external panelists and other colleges must be typeable).
 *
 * ARIA combobox pattern: role=combobox on the input, a listbox of options,
 * Arrow keys move, Enter picks, Escape closes. Suggestions come from the
 * department list passed in, plus the search_people RPC (cross-college,
 * staff only) once two characters are typed. Opening is instant: it is
 * keyboard-driven, so it gets no animation.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PersonOption } from '@/lib/types/domain';
import { normalizeName } from '@/lib/meetings/people';
import { Icon } from '@/components/ui/Icon';
import { inputClass } from '@/components/ui/Field';
import { cn } from '@/lib/ui/cn';

export interface PersonValue {
  name: string;
  userId?: string | null;
}

const MAX_OPTIONS = 8;

export default function PersonField({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchDirectory = true,
  describedBy,
  invalid,
}: {
  id?: string;
  value: PersonValue;
  onChange: (next: PersonValue) => void;
  options: PersonOption[];
  placeholder?: string;
  /** Also search other colleges via search_people. */
  searchDirectory?: boolean;
  describedBy?: string;
  invalid?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<PersonOption[]>([]);
  const blurTimer = useRef<number | undefined>(undefined);

  const query = normalizeName(value.name);

  useEffect(() => {
    if (!searchDirectory || query.length < 2 || value.userId) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      supabase.rpc('search_people', { p_query: query, p_limit: MAX_OPTIONS }).then(({ data }) => {
        if (alive) setRemote((data as PersonOption[] | null) ?? []);
      });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, searchDirectory, supabase, value.userId]);

  const suggestions = useMemo(() => {
    const q = query.toLocaleLowerCase('en');
    const local = q ? options.filter((o) => o.name.toLocaleLowerCase('en').includes(q)) : options;
    const seen = new Set(local.map((o) => o.id));
    const merged = [...local, ...(q.length >= 2 ? remote.filter((r) => !seen.has(r.id)) : [])];
    return merged.slice(0, MAX_OPTIONS);
  }, [options, remote, query]);

  const exactMatch = suggestions.some((s) => s.name.toLocaleLowerCase('en') === query.toLocaleLowerCase('en'));
  const showTyped = query.length > 0 && !exactMatch;
  const total = suggestions.length + (showTyped ? 1 : 0);

  function pick(index: number) {
    if (index < suggestions.length) {
      const p = suggestions[index];
      onChange({ name: p.name, userId: p.id });
    } else if (showTyped) {
      onChange({ name: query, userId: null });
    }
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (total ? (i + 1) % total : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (total ? (i <= 0 ? total - 1 : i - 1) : -1));
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  const activeId = open && active >= 0 ? `${inputId}-opt-${active}` : undefined;

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && total > 0}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          maxLength={120}
          placeholder={placeholder}
          value={value.name}
          onChange={(e) => {
            onChange({ name: e.target.value, userId: null });
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          className={cn(inputClass, value.userId ? 'pr-[7.5rem]' : undefined)}
        />
        {value.userId ? (
          <span className="pointer-events-none absolute right-sm top-1/2 inline-flex -translate-y-1/2 items-center gap-xs rounded-full bg-primary/10 px-sm py-[2px] font-caption text-caption text-primary">
            <Icon name="link" size={14} /> Linked account
          </span>
        ) : null}
      </div>
      {open && total > 0 ? (
        <ul
          id={listId}
          role="listbox"
          onMouseDown={() => window.clearTimeout(blurTimer.current)}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest py-xs shadow-primary-lg"
        >
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={`${inputId}-opt-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-sm px-md py-sm font-body-sm',
                active === i ? 'bg-primary/10' : 'hover:bg-surface-container-low',
              )}
            >
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 font-caption text-caption text-on-surface-variant">
                {[p.department_short, p.position].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
          {showTyped ? (
            <li
              id={`${inputId}-opt-${suggestions.length}`}
              role="option"
              aria-selected={active === suggestions.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(suggestions.length)}
              className={cn(
                'flex cursor-pointer items-center gap-sm border-t border-outline-variant px-md py-sm font-body-sm',
                active === suggestions.length ? 'bg-primary/10' : 'hover:bg-surface-container-low',
              )}
            >
              <Icon name="edit" size={16} className="text-on-surface-variant" />
              Use &ldquo;{query}&rdquo; (no account)
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

import type { CSSProperties } from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Material Symbols icon.
 *
 * The glyph is a text ligature, so without care screen readers announce
 * "mic", browser translation rewrites it, and the raw word flashes before the
 * font loads. Always aria-hidden + translate="no", with a fixed box so nothing
 * shifts while the font is loading. Give the parent control the accessible name.
 */
export function Icon({
  name,
  size = 20,
  filled = false,
  className,
}: {
  name: string;
  size?: 14 | 16 | 18 | 20 | 24 | 28 | 32 | 36 | 48;
  filled?: boolean;
  className?: string;
}) {
  const style: CSSProperties = {
    fontSize: size,
    width: size,
    height: size,
    overflow: 'hidden',
    ...(filled ? { fontVariationSettings: "'FILL' 1" } : null),
  };
  return (
    <span aria-hidden="true" translate="no" className={cn('material-symbols-outlined shrink-0 leading-none', className)} style={style}>
      {name}
    </span>
  );
}

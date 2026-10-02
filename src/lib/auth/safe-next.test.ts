import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/secretary/meetings')).toBe('/secretary/meetings');
    expect(safeNextPath('/secretary/meetings/abc?step=attendance')).toBe('/secretary/meetings/abc?step=attendance');
  });

  it('rejects protocol-relative and backslash tricks that leave the site', () => {
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('/\\evil.example')).toBeNull();
  });

  it('rejects absolute URLs, empty values and control characters', () => {
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath('/ok\n/x')).toBeNull();
  });
});

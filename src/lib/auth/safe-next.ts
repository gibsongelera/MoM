/**
 * Validates a post-login `?next=` target.
 *
 * Only same-origin absolute paths are allowed. `//evil.com` and `/\evil.com`
 * look like paths but browsers treat them as protocol-relative URLs to another
 * host, which turns the login page into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || next.length > 512) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  return next;
}

/**
 * Plain utility, deliberately outside any 'use client' module. Sidebar.tsx
 * (a Client Component) and the dashboard pages (Server Components) both
 * call this - a 'use client' directive marks the whole file client-only, so
 * a Server Component importing a plain function from one throws at render
 * ("Attempted to call X from the server but X is on the client"), even
 * though the function itself has no React/DOM dependency.
 */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  );
}

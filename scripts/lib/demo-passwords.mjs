/**
 * Demo account passwords come from the environment, never from the repo
 * (it is public, and the accounts exist on the live project).
 *
 * Set in .env.local:
 *   DEMO_PASSWORD_ADMIN=...  DEMO_PASSWORD_HEAD=...
 *   DEMO_PASSWORD_SECRETARY=...  DEMO_PASSWORD_FACULTY=...
 */
const VARS = {
  admin: 'DEMO_PASSWORD_ADMIN',
  head: 'DEMO_PASSWORD_HEAD',
  secretary: 'DEMO_PASSWORD_SECRETARY',
  faculty: 'DEMO_PASSWORD_FACULTY',
};

/** Password for a demo account of the given role; exits with a clear message if unset. */
export function demoPassword(role) {
  const name = VARS[role];
  const value = name ? process.env[name] : undefined;
  if (!value) {
    console.error(
      `${name ?? `DEMO_PASSWORD_${String(role).toUpperCase()}`} is not set.\n` +
        'Add the demo passwords to .env.local (see .env.example). They are not stored in the repo.',
    );
    process.exit(1);
  }
  return value;
}

/**
 * Connection-string helpers shared by the database scripts.
 *
 * Supabase's direct host (db.<ref>.supabase.co) is IPv6-only, so on networks
 * without IPv6 it fails with ENOTFOUND. Setting SUPABASE_POOLER_HOST (e.g.
 * aws-0-ap-southeast-1.pooler.supabase.com — not a secret) reroutes the same
 * credentials through the Supavisor *session* pooler on port 5432, which keeps
 * session semantics (transactions, SET LOCAL) intact.
 */

/** Rewrites a direct Supabase connection string to the session pooler when configured. */
export function viaPoolerIfConfigured(connectionString, poolerHost = process.env.SUPABASE_POOLER_HOST) {
  if (!poolerHost) return connectionString;
  const url = new URL(connectionString);
  const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (!direct) return connectionString;
  const ref = direct[1];
  url.hostname = poolerHost;
  url.port = '5432';
  if (!url.username.includes('.')) url.username = `${url.username || 'postgres'}.${ref}`;
  return url.toString();
}

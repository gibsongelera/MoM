import { createClient } from '@/lib/supabase/server';

export default async function AdminAuditPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('audit_log')
    .select('id, action, detail, user_name, role, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Audit &amp; Privacy</h1>
        <p className="font-body-lg text-on-surface-variant">
          Every mutation in the system, appended by <code>log_audit()</code> - the actor comes from the session, never the
          caller, so this trail cannot be spoofed. Most recent 100 entries.
        </p>
      </header>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">When</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Actor</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Action</th>
              <th className="py-sm px-md font-label-caps text-label-caps text-on-surface-variant">Detail</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="py-md px-md text-center text-on-surface-variant">
                  No activity yet.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-outline-variant hover:bg-surface-container-low">
                  <td className="py-sm px-md text-on-surface-variant whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-sm px-md">
                    {r.user_name ?? 'System'} {r.role ? <span className="text-on-surface-variant capitalize">({r.role})</span> : null}
                  </td>
                  <td className="py-sm px-md">
                    <span className="pill pill-regular">{r.action.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="py-sm px-md text-on-surface-variant">{r.detail ?? ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

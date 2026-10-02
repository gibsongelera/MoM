import { createClient } from '@/lib/supabase/server';
import SettingsForm from '@/components/dashboard/SettingsForm';

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('app_settings')
    .select(
      'ai_enabled, auto_transcribe, auto_summarize, auto_upload_on_reconnect, retention_days, default_language, institution_name, institution_short, data_processing_notice',
    )
    .eq('id', true)
    .single();

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">System Settings</h1>
        <p className="font-body-lg text-on-surface-variant">Institution-wide AI processing and privacy configuration.</p>
      </header>
      {settings ? (
        <SettingsForm initial={settings} />
      ) : (
        <p className="text-error">
          No app_settings row found - the 0001_schema.sql migration should have inserted one. Run{' '}
          <code>npm run db:seed-users-only</code> or check the migration.
        </p>
      )}
    </>
  );
}

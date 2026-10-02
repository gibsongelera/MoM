import { requireRole } from '@/lib/auth/requireRole';
import ScheduleMeetingForm from '@/components/dashboard/ScheduleMeetingForm';

export default async function SecretarySchedulePage() {
  const user = await requireRole('secretary');

  return (
    <>
      <header className="mb-lg">
        <h1 className="font-h1 text-h1">Meeting Schedule</h1>
        <p className="font-body-lg text-on-surface-variant">Create a new meeting for your department.</p>
      </header>
      {user.department_id ? (
        <ScheduleMeetingForm departmentId={user.department_id} />
      ) : (
        <p className="text-error">
          Your profile has no department assigned - ask an administrator to set one before you can schedule meetings.
        </p>
      )}
    </>
  );
}

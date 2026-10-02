import { redirect } from 'next/navigation';

/** "Meeting Schedule" was renamed to "Meetings" (client request); keep old links working. */
export default function SecretarySchedulePage() {
  redirect('/secretary/meetings');
}

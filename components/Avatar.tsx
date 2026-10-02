// Avatar — React port of avatarMarkup() in assets/js/shared.js.
// Shows the user's photo when present, otherwise an initials circle.

import { initials } from '@/lib/utils';
import type { User } from '@/lib/types';

export function Avatar({
  user,
  size = 'w-9 h-9 text-body-sm',
}: {
  user: Pick<User, 'name' | 'photoDataUrl'> | null | undefined;
  size?: string;
}) {
  if (user && user.photoDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.photoDataUrl}
        alt={user.name || 'avatar'}
        className={`${size} rounded-full object-cover border border-outline-variant`}
      />
    );
  }
  return (
    <div
      className={`${size} rounded-full bg-primary text-on-primary flex items-center justify-center font-bold`}
    >
      {initials(user?.name || '')}
    </div>
  );
}

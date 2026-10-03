import Image from 'next/image';
import { cn } from '@/lib/ui/cn';

/**
 * The university seal. The source PNG is 446px square (~280 KB); next/image
 * serves a resized copy, so a 40px sidebar mark doesn't download the original.
 */
export function Logo({
  size = 40,
  className,
  alt = 'Zamboanga Peninsula Polytechnic State University seal',
  priority = false,
}: {
  size?: number;
  className?: string;
  /** Pass "" when the name is already written next to the logo. */
  alt?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/assets/images/ZppsuLogo.png"
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={cn('shrink-0 rounded-full object-contain', className)}
    />
  );
}

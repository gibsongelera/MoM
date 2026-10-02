import { cx } from '@/lib/utils';

const SRC = '/assets/images/ZppsuLogo.png';

export function Logo({
  size = 64,
  className,
  alt = 'ZPPSU Institutional Logo',
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC}
      alt={alt}
      width={size * 2}
      height={size * 2}
      className={cx('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

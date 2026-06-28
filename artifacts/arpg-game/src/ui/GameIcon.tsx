import { resolveGameIcon } from '@/lib/assetUrl';

interface GameIconProps {
  src: string;
  alt?: string;
  size?: number;
  className?: string;
}

/** Renders a game icon PNG from the R2 manifest (not raw path text). */
export function GameIcon({ src, alt = '', size = 32, className }: GameIconProps) {
  const url = resolveGameIcon(src);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      className={className}
      draggable={false}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}
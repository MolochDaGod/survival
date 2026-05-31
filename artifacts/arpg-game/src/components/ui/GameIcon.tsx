import React from 'react';

/**
 * GameIcon — renders a pixel-art icon from a path or falls back to emoji text.
 *
 * Usage:
 *   <GameIcon icon="/icons/cyberpunk-weapons/Icon1_16.png" size={24} />
 *   <GameIcon icon="🔥" size={24} />  // legacy emoji fallback
 */

interface GameIconProps {
  /** Path (starts with / or http) or emoji string. */
  icon: string;
  /** Pixel size (width = height). Default 24. */
  size?: number;
  /** Optional alt text for accessibility. */
  alt?: string;
  /** Extra class name. */
  className?: string;
  /** Extra inline styles. */
  style?: React.CSSProperties;
}

function isImagePath(icon: string): boolean {
  return icon.startsWith('/') || icon.startsWith('http') || icon.startsWith('.');
}

const GameIcon: React.FC<GameIconProps> = ({ icon, size = 24, alt = '', className, style }) => {
  if (isImagePath(icon)) {
    return (
      <img
        src={icon}
        alt={alt}
        width={size}
        height={size}
        className={className}
        draggable={false}
        style={{
          imageRendering: 'pixelated',
          objectFit: 'contain',
          verticalAlign: 'middle',
          ...style,
        }}
      />
    );
  }

  // Emoji fallback
  return (
    <span
      className={className}
      role="img"
      aria-label={alt}
      style={{
        fontSize: size * 0.75,
        lineHeight: `${size}px`,
        display: 'inline-block',
        width: size,
        height: size,
        textAlign: 'center',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {icon}
    </span>
  );
};

export default GameIcon;

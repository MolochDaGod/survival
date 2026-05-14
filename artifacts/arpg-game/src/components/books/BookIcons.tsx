/**
 * BookIcons — text-only / SVG glyphs used inside the book UI.
 *
 * Replaces the emoji that previously sat in book components (close X,
 * page-turn arrows, threat pips, learned check, equipment slot icons,
 * track marks, item placeholder). Emoji rendered inconsistently across
 * platforms, broke the parchment aesthetic, and was forbidden by user
 * direction — this module centralises every glyph instead.
 *
 * All icons accept a `size` prop and inherit `currentColor` so they
 * tint to whatever color the parent is using. They render as inline
 * SVG so they scale crisply on any DPR.
 */

import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

const base = (size = 16): CSSProperties => ({
  display: 'inline-block',
  width: size,
  height: size,
  verticalAlign: 'middle',
  flexShrink: 0,
});

export function CloseGlyph({ size = 18, color = 'currentColor', style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} className={className} aria-hidden>
      <path
        d="M6 6 L18 18 M18 6 L6 18"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArrowLeftGlyph({ size = 24, color = 'currentColor', style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} className={className} aria-hidden>
      <path
        d="M15 5 L8 12 L15 19"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function ArrowRightGlyph({ size = 24, color = 'currentColor', style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} className={className} aria-hidden>
      <path
        d="M9 5 L16 12 L9 19"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function CheckGlyph({ size = 14, color = 'currentColor', style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} className={className} aria-hidden>
      <path
        d="M5 12 L10 17 L19 7"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** A row of filled/empty diamond pips used for threat ratings 1..5. */
export function ThreatPips({ level, color = 'currentColor', size = 12 }: { level: number; color?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }} aria-label={`Threat ${level} of 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} viewBox="0 0 12 12" width={size} height={size} aria-hidden>
          <path
            d="M6 1 L11 6 L6 11 L1 6 Z"
            fill={i <= level ? color : 'none'}
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

/* ── Track marks for the four perk tracks ─────────────────────────────────
 * Plain SVG glyphs in lieu of the previous heart / sword / sparkle / hammer
 * emoji. Each is monochrome and tints to its track color via currentColor.
 */

export function HeartMark({ size = 14, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path
        d="M12 21 C12 21 4 14 4 8.5 C4 5.5 6 3.5 8.5 3.5 C10 3.5 11.3 4.3 12 5.5 C12.7 4.3 14 3.5 15.5 3.5 C18 3.5 20 5.5 20 8.5 C20 14 12 21 12 21 Z"
        fill={color}
      />
    </svg>
  );
}

export function SwordMark({ size = 14, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path
        d="M14 3 L21 3 L21 10 L11 20 L8 20 L8 17 L18 7 L14 7 Z M3 17 L7 21 M5 19 L9 15"
        fill={color}
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SparkleMark({ size = 14, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path
        d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z"
        fill={color}
      />
    </svg>
  );
}

export function HammerMark({ size = 14, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path
        d="M14 3 L21 8 L18 11 L13 8 L11 10 L4 17 L7 20 L14 13 L16 11 L21 14 L18 17 L21 21"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <rect x="11" y="2" width="11" height="6" rx="1" fill={color} transform="rotate(35 16 5)" />
    </svg>
  );
}

/* ── Equipment slot glyphs ────────────────────────────────────────────── */

export function HelmGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M5 14 C5 8 8 5 12 5 C16 5 19 8 19 14 L19 17 L5 17 Z M9 17 L9 20 L11 20 L11 17 M13 17 L13 20 L15 20 L15 17"
        fill={color} />
    </svg>
  );
}

export function ChestplateGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M5 6 L9 4 L12 6 L15 4 L19 6 L19 19 L5 19 Z M9 6 L9 19 M15 6 L15 19" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export function LegsGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M7 4 L17 4 L17 11 L14 21 L11 21 L12 12 L10 12 L10 21 L7 21 Z" fill={color} />
    </svg>
  );
}

export function BootsGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M5 14 L5 6 L11 6 L11 12 L19 12 L19 18 L5 18 Z" fill={color} />
    </svg>
  );
}

export function AmuletGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M6 4 C9 8 15 8 18 4 M12 8 L12 13 M9 17 A3 3 0 1 1 15 17 A3 3 0 1 1 9 17 Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export function RingGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx={12} cy={15} r={5.5} fill="none" stroke={color} strokeWidth={2} />
      <path d="M9 9 L12 4 L15 9 Z" fill={color} />
    </svg>
  );
}

export function ShieldGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M12 3 L20 6 L20 12 C20 17 16 20 12 21 C8 20 4 17 4 12 L4 6 Z" fill={color} />
    </svg>
  );
}

export function MainhandGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return SwordMark({ size, color, style });
}

export function BoxGlyph({ size = 26, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M4 8 L12 4 L20 8 L20 18 L12 22 L4 18 Z M4 8 L12 12 L20 8 M12 12 L12 22" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export function PersonGlyph({ size = 100, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <circle cx={12} cy={6} r={3} fill={color} />
      <path d="M5 22 C5 16 8 13 12 13 C16 13 19 16 19 22 Z" fill={color} />
    </svg>
  );
}

/** Hud book button glyphs — used in HUD and per-book identity. */
export function BookGlyph({ size = 22, color = 'currentColor', style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} aria-hidden>
      <path d="M4 5 C4 4 5 3 6 3 L19 3 L19 19 L6 19 C5 19 4 20 4 21 Z M19 19 L19 21 L6 21 C5 21 4 20 4 19" fill={color} />
      <path d="M8 7 L15 7 M8 10 L15 10 M8 13 L13 13" stroke="rgba(255,255,255,0.45)" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}

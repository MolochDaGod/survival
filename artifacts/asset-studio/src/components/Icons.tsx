/**
 * Inline SVG icon set. We deliberately roll our own here instead of
 * pulling from lucide-react / heroicons / etc. because the task spec
 * forbids any third-party icon CDN or library — every glyph in the
 * studio must come from local SVG. Each icon takes a `className` so
 * Tailwind sizing/colour utilities work the same as a remote library.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  );
}

export function CopyIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function DownloadIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 4v12" />
      <path d="m6 12 6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function RefreshIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function ExternalIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M20 14v6H4V4h6" />
    </svg>
  );
}

export function CubeIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="m12 3 9 5v8l-9 5-9-5V8z" />
      <path d="M3 8 12 13" />
      <path d="M21 8 12 13" />
      <path d="M12 13v10" />
    </svg>
  );
}

export function ImageIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 17-5-5L5 21" />
    </svg>
  );
}

export function FilmIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" />
    </svg>
  );
}

export function MusicIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export function FileIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

export function TagIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M21 12 12 21l-9-9V3h9z" />
      <circle cx="7.5" cy="7.5" r="1.25" />
    </svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

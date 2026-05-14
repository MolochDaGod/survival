/**
 * Tiny preview tile for an asset card. Cheap variant: just an <img>,
 * <video poster> or kind icon — never a Three.js scene. Heavy GLB
 * preview is saved for the detail panel where the user has explicitly
 * picked one model. This keeps a 200-card grid fluid even on phones.
 */
import { useState } from "react";
import type { StudioAsset } from "@workspace/api-client-react";
import {
  CubeIcon,
  FileIcon,
  FilmIcon,
  ImageIcon,
  MusicIcon,
} from "./Icons";

interface Props {
  asset: StudioAsset;
}

export function AssetThumbnail({ asset }: Props) {
  const [errored, setErrored] = useState(false);
  const url = asset.publicUrl;

  if (url && asset.kind === "texture" && !errored) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950/60 p-1">
        <img
          src={url}
          alt={asset.filename}
          loading="lazy"
          className="max-h-full max-w-full object-contain"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  if (url && asset.kind === "vfx" && !errored) {
    if (asset.ext === "webm" || asset.ext === "mp4" || asset.ext === "mov") {
      return (
        <video
          src={url}
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full bg-zinc-950 object-cover"
          onMouseEnter={(e) => {
            void e.currentTarget.play().catch(() => {
              /* autoplay blocked — silent */
            });
          }}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
          onError={() => setErrored(true)}
        />
      );
    }
  }

  return <KindGlyph kind={asset.kind} ext={asset.ext} />;
}

function KindGlyph({ kind, ext }: { kind: StudioAsset["kind"]; ext: string }) {
  const iconClass = "h-10 w-10";
  let Icon = FileIcon;
  let tone = "text-zinc-500";
  switch (kind) {
    case "model":
      Icon = CubeIcon;
      tone = "text-emerald-400/80";
      break;
    case "texture":
      Icon = ImageIcon;
      tone = "text-sky-400/80";
      break;
    case "vfx":
      Icon = FilmIcon;
      tone = "text-fuchsia-400/80";
      break;
    case "audio":
      Icon = MusicIcon;
      tone = "text-amber-400/80";
      break;
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-950/60 text-zinc-400">
      <Icon className={`${iconClass} ${tone}`} />
      <span className="font-mono text-[10px] uppercase tracking-wider">.{ext || "?"}</span>
    </div>
  );
}

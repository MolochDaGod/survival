import type { StudioAsset } from "@workspace/api-client-react";
import { formatBytes } from "../lib/format";
import { AssetThumbnail } from "./AssetThumbnail";
import { TagIcon } from "./Icons";

interface Props {
  asset: StudioAsset;
  tagged: boolean;
  selected: boolean;
  onSelect: (asset: StudioAsset) => void;
}

const KIND_BADGE: Record<StudioAsset["kind"], string> = {
  model: "bg-emerald-950/60 text-emerald-300 border-emerald-700/50",
  texture: "bg-sky-950/60 text-sky-300 border-sky-700/50",
  vfx: "bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-700/50",
  audio: "bg-amber-950/60 text-amber-300 border-amber-700/50",
  other: "bg-zinc-800/60 text-zinc-300 border-zinc-700/50",
};

export function AssetCard({ asset, tagged, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      data-testid={`asset-card-${asset.key}`}
      className={[
        "hover-enlarge group relative flex flex-col overflow-hidden rounded-lg border bg-zinc-900/80 text-left",
        selected
          ? "border-emerald-500 ring-emerald-glow"
          : "border-zinc-800 hover:border-emerald-700/60",
      ].join(" ")}
    >
      <div className="aspect-square w-full overflow-hidden">
        <AssetThumbnail asset={asset} />
      </div>

      <div className="flex flex-col gap-1 p-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND_BADGE[asset.kind]}`}
          >
            {asset.ext || asset.kind}
          </span>
          {tagged ? (
            <span
              className="inline-flex items-center gap-0.5 rounded border border-emerald-600/60 bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
              title="Has local tags"
            >
              <TagIcon className="h-3 w-3" />
            </span>
          ) : null}
          <span className="ml-auto text-[10px] text-zinc-500">{formatBytes(asset.size)}</span>
        </div>
        <div
          className="truncate text-xs font-medium text-zinc-100"
          title={asset.filename}
        >
          {asset.filename}
        </div>
        <div
          className="truncate font-mono text-[10px] text-zinc-500"
          title={asset.key}
        >
          {asset.key}
        </div>
      </div>
    </button>
  );
}

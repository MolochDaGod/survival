/**
 * Gallery tab — the original asset-browsing experience.
 *
 * Kept structurally identical to the pre-tab layout so existing muscle
 * memory and tests survive. The outer page shell now owns the catalog
 * header/export controls; this component just renders the toolbar, the
 * paginated kind-sections, and the inline detail panel.
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import type {
  StudioAsset,
  StudioAssetKind,
  StudioGroup,
} from "@workspace/api-client-react";
import { AssetCard } from "../components/AssetCard";
import { AssetDetailPanel } from "../components/AssetDetailPanel";
import {
  CubeIcon,
  FileIcon,
  FilmIcon,
  ImageIcon,
  MusicIcon,
  SearchIcon,
} from "../components/Icons";
import { formatBytes, formatCount } from "../lib/format";
import { useTagStore, type TagMap } from "../lib/tags";

const KIND_FILTERS: Array<{ kind: "all" | StudioAssetKind; label: string }> = [
  { kind: "all", label: "All" },
  { kind: "model", label: "Models" },
  { kind: "texture", label: "Textures" },
  { kind: "vfx", label: "VFX" },
  { kind: "audio", label: "Audio" },
  { kind: "other", label: "Other" },
];

const PAGE_SIZE = 96;

const KIND_ICON: Record<StudioAssetKind, (p: { className?: string }) => ReactElement> = {
  model: (p) => <CubeIcon {...p} />,
  texture: (p) => <ImageIcon {...p} />,
  vfx: (p) => <FilmIcon {...p} />,
  audio: (p) => <MusicIcon {...p} />,
  other: (p) => <FileIcon {...p} />,
};

interface Props {
  groups: StudioGroup[];
}

export function GalleryTab({ groups }: Props) {
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<"all" | StudioAssetKind>("all");
  const [pageSizes, setPageSizes] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<StudioAsset | null>(null);
  const [taggedOnly, setTaggedOnly] = useState(false);
  const { tags, setTag, clearTag } = useTagStore();

  useEffect(() => { setPageSizes({}); }, [query, activeKind, taggedOnly]);

  const visibleGroups = useMemo<StudioGroup[]>(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => activeKind === "all" || g.kind === activeKind)
      .map((g) => {
        const filtered = g.assets.filter((a) => {
          if (taggedOnly && !tags[a.key]) return false;
          if (!q) return true;
          return (
            a.filename.toLowerCase().includes(q) ||
            a.key.toLowerCase().includes(q) ||
            a.ext.toLowerCase() === q
          );
        });
        return { ...g, assets: filtered, count: filtered.length };
      })
      .filter((g) => g.assets.length > 0);
  }, [groups, query, activeKind, taggedOnly, tags]);

  return (
    <div className="flex flex-1 flex-col">
      <Toolbar query={query} onQuery={setQuery} activeKind={activeKind} onKind={setActiveKind} groups={groups} taggedOnly={taggedOnly} onTaggedOnly={setTaggedOnly} />
      <main className="flex-1 px-4 pb-12 pt-2 sm:px-6">
        {visibleGroups.length === 0 ? (
          <EmptyState query={query} taggedOnly={taggedOnly} />
        ) : (
          <div className="space-y-10">
            {visibleGroups.map((g) => (
              <KindSection key={g.kind} group={g} visible={pageSizes[g.kind] ?? PAGE_SIZE} onShowMore={() => setPageSizes((p) => ({ ...p, [g.kind]: (p[g.kind] ?? PAGE_SIZE) + PAGE_SIZE }))} tags={tags} selectedKey={selected?.key ?? null} onSelect={setSelected} />
            ))}
          </div>
        )}
      </main>
      {selected ? (
        <AssetDetailPanel asset={selected} tag={tags[selected.key]} onClose={() => setSelected(null)} onSaveTag={setTag} onClearTag={clearTag} />
      ) : null}
    </div>
  );
}

function KindSection({ group, visible, onShowMore, tags, selectedKey, onSelect }: { group: StudioGroup; visible: number; onShowMore: () => void; tags: TagMap; selectedKey: string | null; onSelect: (a: StudioAsset) => void }) {
  const slice = group.assets.slice(0, visible);
  const Icon = KIND_ICON[group.kind];
  return (
    <section data-testid={`group-${group.kind}`}>
      <header className="mb-3 flex items-end justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{group.label}</h2>
          <span className="text-xs text-zinc-500">{formatCount(group.count)} matching · {formatBytes(group.totalBytes)} total</span>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {slice.map((asset) => (
          <AssetCard key={asset.key} asset={asset} tagged={!!tags[asset.key]} selected={selectedKey === asset.key} onSelect={onSelect} />
        ))}
      </div>
      {group.assets.length > visible ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={onShowMore} className="rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-zinc-200 hover:border-emerald-700 hover:bg-zinc-800" data-testid={`load-more-${group.kind}`}>
            Show {Math.min(PAGE_SIZE, group.assets.length - visible)} more
            <span className="ml-2 text-zinc-500">({formatCount(visible)} / {formatCount(group.assets.length)})</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Toolbar({ query, onQuery, activeKind, onKind, groups, taggedOnly, onTaggedOnly }: { query: string; onQuery: (v: string) => void; activeKind: "all" | StudioAssetKind; onKind: (k: "all" | StudioAssetKind) => void; groups: StudioGroup[]; taggedOnly: boolean; onTaggedOnly: (v: boolean) => void }) {
  const counts = new Map<StudioAssetKind, number>();
  let total = 0;
  for (const g of groups) { counts.set(g.kind, g.count); total += g.count; }
  const countFor = (k: "all" | StudioAssetKind): number => k === "all" ? total : (counts.get(k) ?? 0);
  return (
    <div className="sticky top-[112px] z-20 border-b border-zinc-800 bg-zinc-950/80 px-4 py-2 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 max-w-md">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search filename, path, or extension…" data-testid="search" className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-600 focus:outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {KIND_FILTERS.map((f) => {
            const active = activeKind === f.kind;
            return (
              <button key={f.kind} type="button" onClick={() => onKind(f.kind)} data-testid={`filter-${f.kind}`} className={["rounded-md border px-2.5 py-1 text-xs", active ? "border-emerald-600 bg-emerald-600/15 text-emerald-200" : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"].join(" ")}>
                {f.label}<span className="ml-1.5 text-[10px] text-zinc-500">{formatCount(countFor(f.kind))}</span>
              </button>
            );
          })}
        </div>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={taggedOnly} onChange={(e) => onTaggedOnly(e.target.checked)} data-testid="tagged-only" className="h-3.5 w-3.5 accent-emerald-500" />
          Tagged only
        </label>
      </div>
    </div>
  );
}

function EmptyState({ query, taggedOnly }: { query: string; taggedOnly: boolean }) {
  return (
    <div className="mx-auto mt-12 max-w-md text-center text-sm text-zinc-500">
      {taggedOnly ? <>No tagged assets match the current filter.</> : query ? <>No assets match <span className="font-mono text-zinc-300">{query}</span>.</> : <>Bucket is empty.</>}
    </div>
  );
}

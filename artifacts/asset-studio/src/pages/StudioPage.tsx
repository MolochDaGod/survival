/**
 * Asset Studio root view. Shows the entire R2 catalog grouped by kind,
 * with search/filter controls, an inline detail panel, and a JSON
 * export button that bundles the catalog with locally-saved tags.
 *
 * Performance notes
 * -----------------
 * The bucket currently holds ~31k objects. To stay snappy we:
 *   • show one section per kind, not a single mega-grid;
 *   • paginate each section with a "Load more" button (default 96);
 *   • skip GLB rendering on cards (only the detail panel uses Three.js).
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  useGetStudioCatalog,
  type StudioAsset,
  type StudioAssetKind,
  type StudioGroup,
} from "@workspace/api-client-react";
import { AssetCard } from "../components/AssetCard";
import { AssetDetailPanel } from "../components/AssetDetailPanel";
import {
  CubeIcon,
  DownloadIcon,
  FileIcon,
  FilmIcon,
  ImageIcon,
  MusicIcon,
  RefreshIcon,
  SearchIcon,
  TagIcon,
} from "../components/Icons";
import { formatBytes, formatCount } from "../lib/format";
import { useTagStore } from "../lib/tags";

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

export function StudioPage() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useGetStudioCatalog();

  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<"all" | StudioAssetKind>("all");
  const [pageSizes, setPageSizes] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<StudioAsset | null>(null);
  const [taggedOnly, setTaggedOnly] = useState(false);

  const { tags, count: tagCount, setTag, clearTag, clearAll } = useTagStore();

  // Reset pagination when the user changes search/filter.
  useEffect(() => {
    setPageSizes({});
  }, [query, activeKind, taggedOnly]);

  const groups = data?.groups ?? [];

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

  const exportCatalog = (): void => {
    if (!data) return;
    const merged = {
      generatedAt: data.generatedAt,
      bucket: data.bucket,
      publicUrlBase: data.publicUrlBase,
      totalCount: data.totalCount,
      totalBytes: data.totalBytes,
      truncated: data.truncated,
      tagCount: Object.keys(tags).length,
      assets: data.groups.flatMap((g) =>
        g.assets.map((a) => ({
          key: a.key,
          filename: a.filename,
          kind: a.kind,
          ext: a.ext,
          size: a.size,
          lastModified: a.lastModified,
          contentType: a.contentType,
          publicUrl: a.publicUrl,
          tag: tags[a.key] ?? null,
        })),
      ),
    };
    const blob = new Blob([JSON.stringify(merged, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-studio-catalog-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        catalogTotalCount={data?.totalCount ?? 0}
        catalogTotalBytes={data?.totalBytes ?? 0}
        truncated={data?.truncated ?? false}
        bucket={data?.bucket}
        tagCount={tagCount}
        onRefresh={() => void refetch()}
        onExport={exportCatalog}
        onClearAllTags={clearAll}
        refreshing={isFetching}
        canExport={!!data}
      />

      <Toolbar
        query={query}
        onQuery={setQuery}
        activeKind={activeKind}
        onKind={setActiveKind}
        groups={groups}
        taggedOnly={taggedOnly}
        onTaggedOnly={setTaggedOnly}
      />

      <main className="flex-1 px-4 pb-12 pt-2 sm:px-6">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? "Failed to load catalog"} />
        ) : visibleGroups.length === 0 ? (
          <EmptyState query={query} taggedOnly={taggedOnly} />
        ) : (
          <div className="space-y-10">
            {visibleGroups.map((g) => {
              const visible = pageSizes[g.kind] ?? PAGE_SIZE;
              const slice = g.assets.slice(0, visible);
              const Icon = KIND_ICON[g.kind];
              return (
                <section key={g.kind} data-testid={`group-${g.kind}`}>
                  <header className="mb-3 flex items-end justify-between border-b border-zinc-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-emerald-400" />
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
                        {g.label}
                      </h2>
                      <span className="text-xs text-zinc-500">
                        {formatCount(g.count)} matching • {formatBytes(g.totalBytes)} total
                      </span>
                    </div>
                  </header>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {slice.map((asset) => (
                      <AssetCard
                        key={asset.key}
                        asset={asset}
                        tagged={!!tags[asset.key]}
                        selected={selected?.key === asset.key}
                        onSelect={setSelected}
                      />
                    ))}
                  </div>
                  {g.assets.length > visible ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          setPageSizes((p) => ({
                            ...p,
                            [g.kind]: visible + PAGE_SIZE,
                          }))
                        }
                        className="rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-zinc-200 hover:border-emerald-700 hover:bg-zinc-800"
                        data-testid={`load-more-${g.kind}`}
                      >
                        Show {Math.min(PAGE_SIZE, g.assets.length - visible)} more
                        <span className="ml-2 text-zinc-500">
                          ({formatCount(visible)} / {formatCount(g.assets.length)})
                        </span>
                      </button>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {selected ? (
        <AssetDetailPanel
          asset={selected}
          tag={tags[selected.key]}
          onClose={() => setSelected(null)}
          onSaveTag={setTag}
          onClearTag={clearTag}
        />
      ) : null}
    </div>
  );
}

function Header({
  catalogTotalCount,
  catalogTotalBytes,
  truncated,
  bucket,
  tagCount,
  onRefresh,
  onExport,
  onClearAllTags,
  refreshing,
  canExport,
}: {
  catalogTotalCount: number;
  catalogTotalBytes: number;
  truncated: boolean;
  bucket: string | undefined;
  tagCount: number;
  onRefresh: () => void;
  onExport: () => void;
  onClearAllTags: () => void;
  refreshing: boolean;
  canExport: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-50">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-700/40">
              <CubeIcon className="h-4 w-4" />
            </span>
            Asset Studio
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {bucket ? (
              <>
                <span className="font-mono">{bucket}</span>
                {" • "}
                {formatCount(catalogTotalCount)} assets •{" "}
                {formatBytes(catalogTotalBytes)}
                {truncated ? (
                  <span className="ml-2 rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] text-amber-300">
                    truncated at 50,000
                  </span>
                ) : null}
              </>
            ) : (
              "loading catalog…"
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tagCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Clear all ${tagCount} saved tags?`)) onClearAllTags();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-rose-800/60 bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-900/60"
              data-testid="clear-all-tags"
            >
              <TagIcon className="h-3.5 w-3.5" />
              Clear {formatCount(tagCount)} tags
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 disabled:opacity-50"
            data-testid="refresh"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!canExport}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-50 shadow hover:bg-emerald-500 disabled:opacity-50"
            data-testid="export"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            Export catalog JSON
          </button>
        </div>
      </div>
    </header>
  );
}

function Toolbar({
  query,
  onQuery,
  activeKind,
  onKind,
  groups,
  taggedOnly,
  onTaggedOnly,
}: {
  query: string;
  onQuery: (v: string) => void;
  activeKind: "all" | StudioAssetKind;
  onKind: (k: "all" | StudioAssetKind) => void;
  groups: StudioGroup[];
  taggedOnly: boolean;
  onTaggedOnly: (v: boolean) => void;
}) {
  const counts = new Map<StudioAssetKind, number>();
  let total = 0;
  for (const g of groups) {
    counts.set(g.kind, g.count);
    total += g.count;
  }
  const countFor = (k: "all" | StudioAssetKind): number =>
    k === "all" ? total : (counts.get(k) ?? 0);

  return (
    <div className="sticky top-[68px] z-20 border-b border-zinc-800 bg-zinc-950/80 px-4 py-2 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 max-w-md">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search filename, path, or extension…"
            data-testid="search"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {KIND_FILTERS.map((f) => {
            const active = activeKind === f.kind;
            return (
              <button
                key={f.kind}
                type="button"
                onClick={() => onKind(f.kind)}
                data-testid={`filter-${f.kind}`}
                className={[
                  "rounded-md border px-2.5 py-1 text-xs",
                  active
                    ? "border-emerald-600 bg-emerald-600/15 text-emerald-200"
                    : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700",
                ].join(" ")}
              >
                {f.label}
                <span className="ml-1.5 text-[10px] text-zinc-500">
                  {formatCount(countFor(f.kind))}
                </span>
              </button>
            );
          })}
        </div>

        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={taggedOnly}
            onChange={(e) => onTaggedOnly(e.target.checked)}
            data-testid="tagged-only"
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Tagged only
        </label>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
      Loading catalog…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-lg border border-rose-800/50 bg-rose-950/30 p-4 text-sm text-rose-200">
      <div className="font-semibold">Catalog failed to load</div>
      <div className="mt-1 text-xs text-rose-300/80">{message}</div>
    </div>
  );
}

function EmptyState({ query, taggedOnly }: { query: string; taggedOnly: boolean }) {
  return (
    <div className="mx-auto mt-12 max-w-md text-center text-sm text-zinc-500">
      {taggedOnly ? (
        <>No tagged assets match the current filter.</>
      ) : query ? (
        <>
          No assets match <span className="font-mono text-zinc-300">{query}</span>.
        </>
      ) : (
        <>Bucket is empty.</>
      )}
    </div>
  );
}

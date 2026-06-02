/**
 * StudioPage — top-level shell for the Asset Studio.
 *
 * Owns the persistent catalog header (refresh, export, tag-clear) and a
 * tab bar that switches between three workspaces:
 *
 *   • Gallery     — the original kind-grouped paginated browser.
 *   • Canvas      — free-form 3D inspection of any model with helpers.
 *   • Animations  — character + animation clip retargeting preview.
 *
 * Selected tab is mirrored in the URL hash (#gallery / #canvas /
 * #animations) so links survive reloads and can be shared.
 */
import { useEffect, useState } from "react";
import { useGetStudioCatalog } from "@workspace/api-client-react";
import { CubeIcon, DownloadIcon, RefreshIcon, TagIcon } from "../components/Icons";
import { formatBytes, formatCount } from "../lib/format";
import { useTagStore } from "../lib/tags";
import { GalleryTab } from "./GalleryTab";
import { CanvasTab } from "./CanvasTab";
import { AnimationsTab } from "./AnimationsTab";

type TabId = "gallery" | "canvas" | "animations";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "gallery", label: "Gallery" },
  { id: "canvas", label: "Canvas" },
  { id: "animations", label: "Animations" },
];

function readHashTab(): TabId {
  const h = window.location.hash.replace(/^#/, "");
  if (h === "canvas" || h === "animations" || h === "gallery") return h;
  return "gallery";
}

export function StudioPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useGetStudioCatalog();
  const { tags, count: tagCount, clearAll } = useTagStore();
  const [tab, setTab] = useState<TabId>(() => readHashTab());

  useEffect(() => {
    const onHash = (): void => setTab(readHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchTab = (next: TabId): void => {
    setTab(next);
    if (window.location.hash.replace(/^#/, "") !== next) {
      window.history.replaceState(null, "", `#${next}`);
    }
  };

  const groups = data?.groups ?? [];

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
      assets: data.groups.flatMap((g) => g.assets.map((a) => ({
        key: a.key, filename: a.filename, kind: a.kind, ext: a.ext, size: a.size,
        lastModified: a.lastModified, contentType: a.contentType, publicUrl: a.publicUrl,
        tag: tags[a.key] ?? null,
      }))),
    };
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
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
      <TabBar tab={tab} onTab={switchTab} />
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message ?? "Failed to load catalog"} />
      ) : tab === "gallery" ? (
        <GalleryTab groups={groups} />
      ) : tab === "canvas" ? (
        <CanvasTab groups={groups} />
      ) : (
        <AnimationsTab groups={groups} />
      )}
    </div>
  );
}

function Header(props: {
  catalogTotalCount: number; catalogTotalBytes: number; truncated: boolean;
  bucket: string | undefined; tagCount: number;
  onRefresh: () => void; onExport: () => void; onClearAllTags: () => void;
  refreshing: boolean; canExport: boolean;
}) {
  const { catalogTotalCount, catalogTotalBytes, truncated, bucket, tagCount, onRefresh, onExport, onClearAllTags, refreshing, canExport } = props;
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-50">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-700/40"><CubeIcon className="h-4 w-4" /></span>
            Asset Studio
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {bucket ? (<><span className="font-mono">{bucket}</span>{" · "}{formatCount(catalogTotalCount)} assets · {formatBytes(catalogTotalBytes)}{truncated ? <span className="ml-2 rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] text-amber-300">truncated at 50,000</span> : null}</>) : "loading catalog…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tagCount > 0 ? (
            <button type="button" onClick={() => { if (window.confirm(`Clear all ${tagCount} saved tags?`)) onClearAllTags(); }} className="inline-flex items-center gap-1 rounded-md border border-rose-800/60 bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-900/60" data-testid="clear-all-tags">
              <TagIcon className="h-3.5 w-3.5" />Clear {formatCount(tagCount)} tags
            </button>
          ) : null}
          <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 disabled:opacity-50" data-testid="refresh">
            <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={onExport} disabled={!canExport} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-50 shadow hover:bg-emerald-500 disabled:opacity-50" data-testid="export">
            <DownloadIcon className="h-3.5 w-3.5" />Export catalog JSON
          </button>
        </div>
      </div>
    </header>
  );
}

function TabBar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <nav className="sticky top-[68px] z-20 flex items-center gap-1 border-b border-zinc-800 bg-zinc-950/85 px-4 py-1.5 backdrop-blur sm:px-6" data-testid="studio-tabs">
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button key={t.id} type="button" onClick={() => onTab(t.id)} data-testid={`tab-${t.id}`} className={["rounded-md px-3 py-1 text-xs font-medium transition-colors", active ? "bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-700/50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"].join(" ")}>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

function LoadingState() {
  return <div className="flex h-64 items-center justify-center text-sm text-zinc-400">Loading catalog…</div>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-lg border border-rose-800/50 bg-rose-950/30 p-4 text-sm text-rose-200">
      <div className="font-semibold">Catalog failed to load</div>
      <div className="mt-1 text-xs text-rose-300/80">{message}</div>
    </div>
  );
}

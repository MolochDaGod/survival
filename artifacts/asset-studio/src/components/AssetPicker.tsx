/**
 * AssetPicker — compact sidebar list used by the Canvas and Animations
 * tabs to pick a single asset (or model from a hint-filtered subset of
 * the catalog) out of the ~31k-entry library. Provides:
 *
 *   - Free-text filename/path search.
 *   - Optional `kindFilter` that restricts to one asset kind.
 *   - Optional `nameRegex` that further narrows by filename pattern
 *     (e.g. /\.glb$/ or /(idle|walk|run|jump)/i for animation guesses).
 *   - Virtualised-feel by capping to N rows with a Show-more button —
 *     React can comfortably render 250 rows at a time on this dataset
 *     without juddering, and a full virtual list would over-engineer it.
 */
import { useMemo, useState } from "react";
import type { StudioAsset, StudioAssetKind, StudioGroup } from "@workspace/api-client-react";
import { formatBytes } from "../lib/format";
import { SearchIcon } from "./Icons";

interface Props {
  groups: StudioGroup[];
  kindFilter?: StudioAssetKind;
  /** Filename regex applied on top of the user query. */
  nameRegex?: RegExp;
  /** Currently selected key (highlighted). */
  selectedKey?: string | null;
  onPick: (asset: StudioAsset) => void;
  title?: string;
  placeholder?: string;
  /** Optional extra footer text describing the list scope. */
  hint?: string;
  /** Max rows visible before "Show more". Defaults to 200. */
  pageSize?: number;
  className?: string;
}

export function AssetPicker({
  groups,
  kindFilter,
  nameRegex,
  selectedKey,
  onPick,
  title,
  placeholder = "Search filename…",
  hint,
  pageSize = 200,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(pageSize);

  const all = useMemo<StudioAsset[]>(() => {
    const pool = groups
      .filter((g) => !kindFilter || g.kind === kindFilter)
      .flatMap((g) => g.assets);
    const q = query.trim().toLowerCase();
    return pool.filter((a) => {
      if (nameRegex && !nameRegex.test(a.filename)) return false;
      if (!q) return true;
      return (
        a.filename.toLowerCase().includes(q) ||
        a.key.toLowerCase().includes(q) ||
        a.ext.toLowerCase() === q
      );
    });
  }, [groups, kindFilter, nameRegex, query]);

  const slice = all.slice(0, visible);

  return (
    <aside
      className={[
        "flex h-full min-h-0 flex-col border-zinc-800 bg-zinc-950/60",
        className ?? "",
      ].join(" ")}
      data-testid="asset-picker"
    >
      {title ? (
        <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
          {title}
        </div>
      ) : null}
      <div className="border-b border-zinc-800 p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(pageSize);
            }}
            placeholder={placeholder}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-7 pr-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500">
          <span>{all.length.toLocaleString()} results</span>
          {hint ? <span className="truncate text-zinc-600">{hint}</span> : null}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {slice.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            No matching assets.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {slice.map((asset) => {
              const active = selectedKey === asset.key;
              return (
                <li key={asset.key}>
                  <button
                    type="button"
                    onClick={() => onPick(asset)}
                    className={[
                      "block w-full px-3 py-2 text-left text-xs transition-colors",
                      active
                        ? "bg-emerald-900/30 text-emerald-100"
                        : "text-zinc-200 hover:bg-zinc-900",
                    ].join(" ")}
                    title={asset.key}
                    data-testid={`asset-picker-item-${asset.key}`}
                  >
                    <div className="truncate font-medium">{asset.filename}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0 font-mono uppercase">
                        {asset.ext || asset.kind}
                      </span>
                      <span>{formatBytes(asset.size)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {all.length > visible ? (
          <div className="p-2 text-center">
            <button
              type="button"
              onClick={() => setVisible((v) => v + pageSize)}
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:border-emerald-700"
            >
              Show {Math.min(pageSize, all.length - visible)} more
              <span className="ml-1 text-zinc-500">
                ({visible.toLocaleString()} / {all.length.toLocaleString()})
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

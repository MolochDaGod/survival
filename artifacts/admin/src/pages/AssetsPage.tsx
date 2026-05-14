import { useEffect, useState, type ChangeEvent, type MouseEvent } from "react";
import { adminFetch } from "../lib/adminFetch";
import { AssetViewerModal } from "../components/AssetViewerModal";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";

/** Source 3D formats we can convert into game-ready GLB via the server's assimp pipeline. */
const CONVERTIBLE_EXTS = new Set([
  "fbx",
  "obj",
  "dae",
  "3ds",
  "ply",
  "stl",
  "blend",
  "gltf",
  "x",
  "ms3d",
  "lwo",
  "md5mesh",
]);

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

function withGlb(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > 0 ? `${path.slice(0, dot)}.glb` : `${path}.glb`;
}

interface ConvertResponse {
  ok: boolean;
  targetKey?: string;
  targetPath?: string;
  sizeBytes?: number;
  durationMs?: number;
  warnings?: string | null;
  warning?: string;
  catalogError?: string;
  error?: string;
}

type AssetRow = {
  id: string;
  path: string;
  source?: string | null;
  r2_bucket?: string | null;
  r2_key?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  public_url?: string | null;
  updated_at?: number | null;
  tags?: string[];
};

type ListResponse = { rows: AssetRow[]; total: number };

type UploadResponse = {
  id: string;
  key: string;
  bucket: string;
  url: string;
  expiresIn: number;
  headers: Record<string, string>;
  catalog: string;
};

type BridgeStatus = {
  available: boolean;
  reason?: string | null;
  d1?: { databaseId?: string | null; accountId?: string | null };
};

type R2BucketInfo = {
  available: boolean;
  buckets?: { assets?: string | null; objectstore?: string | null };
  reason?: string | null;
};

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export function AssetsPage() {
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [r2, setR2] = useState<R2BucketInfo | null>(null);
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState<"all" | "gcs" | "r2">("all");

  const [uploadKey, setUploadKey] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [previewing, setPreviewing] = useState<AssetRow | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: AssetRow } | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  function openContextMenu(e: MouseEvent<HTMLTableRowElement>, row: AssetRow): void {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, row });
  }

  async function handleConvert(row: AssetRow): Promise<void> {
    setConvertingId(row.id);
    setError(null);
    setNotice(`Converting ${row.path} to GLB…`);
    try {
      const res = await adminFetch<ConvertResponse>(
        `/assets/${encodeURIComponent(row.id)}/convert`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (res.ok) {
        const sec = res.durationMs ? (res.durationMs / 1000).toFixed(1) : "?";
        setNotice(
          `Converted → ${res.targetPath} (${fmtBytes(res.sizeBytes ?? 0)} in ${sec}s)` +
            (res.warnings ? " · with warnings (see server log)" : ""),
        );
      } else {
        setError(res.warning ?? res.error ?? "conversion failed");
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConvertingId(null);
    }
  }

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (tag) params.set("tag", tag);
      if (source !== "all") params.set("source", source);
      params.set("limit", "100");
      const data = await adminFetch<ListResponse>(
        `/assets?${params.toString()}`,
      );
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        setBridge(await adminFetch<BridgeStatus>("/assets/bridge/status"));
      } catch (err) {
        setBridge({
          available: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        setR2(await adminFetch<R2BucketInfo>("/assets/storage/r2/buckets"));
      } catch (err) {
        setR2({
          available: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      void refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(): Promise<void> {
    if (!uploadFile) {
      setError("Select a file first.");
      return;
    }
    const key = (uploadKey || uploadFile.name).trim();
    if (!key) {
      setError("Object key is required.");
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const presign = await adminFetch<UploadResponse>("/assets/upload", {
        method: "POST",
        body: JSON.stringify({
          key,
          contentType: uploadFile.type || "application/octet-stream",
        }),
      });
      const putRes = await fetch(presign.url, {
        method: "PUT",
        headers: presign.headers,
        body: uploadFile,
      });
      if (!putRes.ok) {
        throw new Error(
          `R2 PUT failed: ${putRes.status} ${putRes.statusText}`,
        );
      }
      await adminFetch("/assets/upload/complete", {
        method: "POST",
        body: JSON.stringify({ id: presign.id }),
      });
      setNotice(`Uploaded ${key} (${fmtBytes(uploadFile.size)})`);
      setUploadKey("");
      setUploadFile(null);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm(`Delete asset "${id}"? Object stays in R2.`)) return;
    try {
      await adminFetch(`/assets/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setNotice(`Deleted ${id}`);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    if (file && !uploadKey) {
      setUploadKey(file.name);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatusCard
          title="Catalog (D1)"
          ok={bridge?.available ?? false}
          detail={
            bridge?.available
              ? `account ${bridge.d1?.accountId ?? "?"} / db ${bridge.d1?.databaseId ?? "?"}`
              : (bridge?.reason ?? "checking…")
          }
        />
        <StatusCard
          title="R2"
          ok={r2?.available ?? false}
          detail={
            r2?.available
              ? `assets=${r2.buckets?.assets ?? "—"}, objectstore=${r2.buckets?.objectstore ?? "—"}`
              : (r2?.reason ?? "checking…")
          }
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Upload to R2</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Suggested layout:{" "}
          <code className="text-zinc-300">
            models/{`{kind}`}/{`{prefab_id}`}/model.glb
          </code>
          ,{" "}
          <code className="text-zinc-300">
            textures/{`{prefab_id}`}/diffuse.png
          </code>
          ,{" "}
          <code className="text-zinc-300">vfx/{`{prefab_id}`}/spark.png</code>
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="file"
            onChange={handleFileChange}
            className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-200 hover:file:bg-zinc-700"
          />
          <input
            value={uploadKey}
            onChange={(e) => setUploadKey(e.target.value)}
            placeholder="object key (e.g. models/monster/clown/model.glb)"
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !uploadFile}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-200">
            Catalog · {total.toLocaleString()} rows
          </h3>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search path"
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            />
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="tag"
              className="w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            />
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "all" | "gcs" | "r2")
              }
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            >
              <option value="all">all sources</option>
              <option value="r2">r2</option>
              <option value="gcs">gcs</option>
            </select>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <p className="mx-4 my-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="mx-4 my-3 rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {notice}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950/40 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2">Path</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Size</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No assets.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onContextMenu={(e) => openContextMenu(e, row)}
                  className={`border-t border-zinc-900 text-zinc-300 ${
                    convertingId === row.id ? "bg-amber-950/20" : ""
                  }`}
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    {row.public_url ? (
                      <a
                        href={row.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        {row.path}
                      </a>
                    ) : (
                      row.path
                    )}
                    {convertingId === row.id ? (
                      <span className="ml-2 text-[10px] text-amber-400">
                        converting…
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs">{row.source ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">
                    {row.content_type ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {fmtBytes(row.size_bytes)}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {fmtDate(row.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewing(row)}
                        disabled={!row.public_url}
                        className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                        title={row.public_url ? "Preview" : "No public URL"}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        className="rounded border border-red-700 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/30"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {previewing && previewing.public_url ? (
        <AssetViewerModal
          url={previewing.public_url}
          filename={previewing.path.split("/").pop() ?? previewing.path}
          title={previewing.path}
          onClose={() => setPreviewing(null)}
        />
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={
            <span className="font-mono normal-case">
              {menu.row.path.split("/").pop()}
            </span>
          }
          items={buildAssetMenu(menu.row, {
            onPreview: (row) => setPreviewing(row),
            onConvert: (row) => void handleConvert(row),
            onCopyPath: (row) => void navigator.clipboard.writeText(row.path),
            onCopyUrl: (row) =>
              row.public_url
                ? void navigator.clipboard.writeText(row.public_url)
                : undefined,
            onDelete: (row) => void handleDelete(row.id),
            convertingId,
          })}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}

interface AssetMenuHandlers {
  onPreview: (row: AssetRow) => void;
  onConvert: (row: AssetRow) => void;
  onCopyPath: (row: AssetRow) => void;
  onCopyUrl: (row: AssetRow) => void;
  onDelete: (row: AssetRow) => void;
  convertingId: string | null;
}

/** Build the per-row context menu, gating each entry on what the row supports. */
function buildAssetMenu(
  row: AssetRow,
  h: AssetMenuHandlers,
): ContextMenuItem[] {
  const ext = extOf(row.path);
  const isSourceMesh = CONVERTIBLE_EXTS.has(ext);
  const targetGlb = isSourceMesh ? withGlb(row.path) : null;
  const isConverting = h.convertingId === row.id;
  return [
    {
      label: "Preview",
      hint: row.public_url ? undefined : "no public URL",
      disabled: !row.public_url,
      onSelect: () => h.onPreview(row),
    },
    {
      label: isConverting ? "Converting…" : "Convert to GLB (game-ready)",
      hint: isSourceMesh
        ? `→ ${targetGlb}`
        : `not a convertible source format (.${ext || "?"})`,
      disabled: !isSourceMesh || isConverting || !row.r2_key,
      onSelect: () => h.onConvert(row),
    },
    {
      label: "Copy path",
      hint: row.path,
      onSelect: () => h.onCopyPath(row),
    },
    {
      label: "Copy public URL",
      hint: row.public_url ?? "no public URL",
      disabled: !row.public_url,
      onSelect: () => h.onCopyUrl(row),
    },
    {
      label: "Delete from R2 + catalog",
      danger: true,
      onSelect: () => h.onDelete(row),
    },
  ];
}

function StatusCard({
  title,
  ok,
  detail,
}: {
  title: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
        />
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <span className="ml-auto text-xs text-zinc-500">
          {ok ? "ok" : "unavailable"}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

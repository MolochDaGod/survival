import { useEffect, useMemo, useState } from "react";
import {
  useListPrefabs,
  useCreatePrefab,
  useUpdatePrefab,
  useDeletePrefab,
  getListPrefabsQueryKey,
  type Prefab,
  type PrefabKind,
  type UpsertPrefabRequest,
} from "@workspace/api-client-react";
import { AssetViewerModal } from "../components/AssetViewerModal";

const KINDS: PrefabKind[] = [
  "monster",
  "npc",
  "player_body",
  "item",
  "vfx",
  "container",
  "structure",
];

type EditableState = {
  id: string;
  kind: PrefabKind;
  name: string;
  description: string;
  modelPath: string;
  texturePath: string;
  scale: string;
  tagsCsv: string;
  draft: boolean;
  dataJson: string;
};

function blankState(): EditableState {
  return {
    id: "",
    kind: "monster",
    name: "",
    description: "",
    modelPath: "",
    texturePath: "",
    scale: "1",
    tagsCsv: "",
    draft: true,
    dataJson: "{}",
  };
}

function toEditable(p: Prefab): EditableState {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    description: p.description ?? "",
    modelPath: p.modelPath ?? "",
    texturePath: p.texturePath ?? "",
    scale: String(p.scale),
    tagsCsv: (p.tags ?? []).join(", "),
    draft: p.draft,
    dataJson: JSON.stringify(p.data ?? {}, null, 2),
  };
}

function buildRequest(s: EditableState): UpsertPrefabRequest | { error: string } {
  if (!s.id.trim()) return { error: "id is required" };
  if (!s.name.trim()) return { error: "name is required" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(s.dataJson || "{}");
  } catch (err) {
    return {
      error: `data is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  const scaleNum = Number(s.scale);
  if (Number.isNaN(scaleNum) || scaleNum <= 0) {
    return { error: "scale must be a positive number" };
  }
  return {
    id: s.id.trim(),
    kind: s.kind,
    name: s.name.trim(),
    description: s.description.trim() || null,
    modelPath: s.modelPath.trim() || null,
    texturePath: s.texturePath.trim() || null,
    scale: scaleNum,
    data: parsed,
    tags: s.tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
    draft: s.draft,
  };
}

export function PrefabsPage() {
  const [kindFilter, setKindFilter] = useState<PrefabKind | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditableState>(blankState);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);

  const listParams = {
    ...(kindFilter !== "all" && { kind: kindFilter }),
    includeDrafts: true,
  };
  const list = useListPrefabs(listParams, {
    query: {
      queryKey: getListPrefabsQueryKey(listParams),
      refetchOnWindowFocus: false,
    },
  });

  const createMut = useCreatePrefab();
  const updateMut = useUpdatePrefab();
  const deleteMut = useDeletePrefab();

  const filteredRows = useMemo(() => {
    const rows = list.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }, [list.data, search]);

  useEffect(() => {
    if (!selectedId) return;
    const found = (list.data ?? []).find((p) => p.id === selectedId);
    if (found) {
      setEditor(toEditable(found));
      setMode("edit");
    }
  }, [selectedId, list.data]);

  function handleNew(): void {
    setSelectedId(null);
    setEditor(blankState());
    setMode("create");
    setError(null);
    setNotice(null);
  }

  async function handleSave(): Promise<void> {
    setError(null);
    setNotice(null);
    const built = buildRequest(editor);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    try {
      if (mode === "create") {
        const created = await createMut.mutateAsync({ data: built });
        setNotice(`Created ${created.id}`);
        setSelectedId(created.id);
        setMode("edit");
      } else {
        const updated = await updateMut.mutateAsync({
          id: editor.id,
          data: built,
        });
        setNotice(`Saved ${updated.id} (v${updated.version})`);
      }
      await list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(): Promise<void> {
    if (mode !== "edit" || !editor.id) return;
    if (!window.confirm(`Delete prefab "${editor.id}"? This cannot be undone.`))
      return;
    setError(null);
    setNotice(null);
    try {
      await deleteMut.mutateAsync({ id: editor.id });
      setNotice(`Deleted ${editor.id}`);
      handleNew();
      await list.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-12 gap-4 px-6 py-6">
      <aside className="col-span-12 md:col-span-4 lg:col-span-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <h2 className="text-sm font-semibold text-zinc-200">Prefabs</h2>
            <button
              type="button"
              onClick={handleNew}
              className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500"
            >
              + New
            </button>
          </div>
          <div className="space-y-2 px-3 py-2">
            <select
              value={kindFilter}
              onChange={(e) =>
                setKindFilter(e.target.value as PrefabKind | "all")
              }
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            >
              <option value="all">All kinds</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search id or name"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
            />
          </div>
          <div className="max-h-[70vh] overflow-y-auto border-t border-zinc-800">
            {list.isLoading && (
              <p className="px-3 py-4 text-sm text-zinc-500">Loading…</p>
            )}
            {list.isError && (
              <p className="px-3 py-4 text-sm text-red-400">
                {(list.error as Error).message}
              </p>
            )}
            {!list.isLoading && filteredRows.length === 0 && (
              <p className="px-3 py-4 text-sm text-zinc-500">No prefabs.</p>
            )}
            <ul>
              {filteredRows.map((p) => {
                const active = p.id === selectedId;
                const iconUrl = iconUrlOf(p);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-start gap-2 border-b border-zinc-900 px-3 py-2 text-left text-sm ${
                        active
                          ? "bg-zinc-800/70 text-zinc-50"
                          : "text-zinc-300 hover:bg-zinc-900/60"
                      }`}
                    >
                      <PrefabIcon url={iconUrl} kind={p.kind} size={32} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex w-full items-center gap-2">
                          <span className="truncate font-medium">{p.name}</span>
                          {p.draft && (
                            <span className="ml-auto rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
                              draft
                            </span>
                          )}
                        </span>
                        <span className="truncate text-xs text-zinc-500">
                          {p.kind} · {p.id}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </aside>

      <section className="col-span-12 md:col-span-8 lg:col-span-9">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <PrefabIcon
                url={
                  mode === "edit"
                    ? iconUrlOf(
                        (list.data ?? []).find((p) => p.id === editor.id) ?? {
                          data: {},
                        } as Prefab,
                      )
                    : null
                }
                kind={editor.kind}
                size={56}
              />
              <h2 className="truncate text-lg font-semibold text-zinc-100">
                {mode === "create" ? "New prefab" : `Edit ${editor.id}`}
              </h2>
            </div>
            <div className="flex gap-2">
              {mode === "edit" && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMut.isPending}
                  className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>

          {error && (
            <p className="mb-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-3 rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
              {notice}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="ID (slug)">
              <input
                value={editor.id}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, id: e.target.value }))
                }
                disabled={mode === "edit"}
                placeholder="monster_clown"
                className={inputCls}
              />
            </Field>
            <Field label="Kind">
              <select
                value={editor.kind}
                onChange={(e) =>
                  setEditor((s) => ({
                    ...s,
                    kind: e.target.value as PrefabKind,
                  }))
                }
                className={inputCls}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input
                value={editor.name}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="Sad Clown"
                className={inputCls}
              />
            </Field>
            <Field label="Scale">
              <input
                value={editor.scale}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, scale: e.target.value }))
                }
                inputMode="decimal"
                className={inputCls}
              />
            </Field>
            <Field label="Model path">
              <div className="flex gap-2">
                <input
                  value={editor.modelPath}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, modelPath: e.target.value }))
                  }
                  placeholder="models/monster/monster_clown/model.glb"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() =>
                    editor.modelPath.trim() &&
                    setPreview({
                      url: `/api/assets/public/${editor.modelPath.trim()}`,
                      filename: editor.modelPath.trim(),
                    })
                  }
                  disabled={!editor.modelPath.trim()}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Preview
                </button>
              </div>
            </Field>
            <Field label="Texture path">
              <div className="flex gap-2">
                <input
                  value={editor.texturePath}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, texturePath: e.target.value }))
                  }
                  placeholder="textures/monster_clown/diffuse.png"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() =>
                    editor.texturePath.trim() &&
                    setPreview({
                      url: `/api/assets/public/${editor.texturePath.trim()}`,
                      filename: editor.texturePath.trim(),
                    })
                  }
                  disabled={!editor.texturePath.trim()}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Preview
                </button>
              </div>
            </Field>
            <Field label="Tags (comma-separated)" wide>
              <input
                value={editor.tagsCsv}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, tagsCsv: e.target.value }))
                }
                placeholder="boss, ranged, undead"
                className={inputCls}
              />
            </Field>
            <Field label="Description" wide>
              <textarea
                value={editor.description}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, description: e.target.value }))
                }
                rows={2}
                className={inputCls}
              />
            </Field>
            <Field label="Draft">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={editor.draft}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, draft: e.target.checked }))
                  }
                  className="h-4 w-4 accent-emerald-500"
                />
                hidden from non-admin clients
              </label>
            </Field>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
              data (JSON)
            </label>
            <textarea
              value={editor.dataJson}
              onChange={(e) =>
                setEditor((s) => ({ ...s, dataJson: e.target.value }))
              }
              rows={18}
              spellCheck={false}
              className="w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-xs text-emerald-300 outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </section>

      {preview ? (
        <AssetViewerModal
          url={preview.url}
          filename={preview.filename}
          title={preview.filename}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-50";

function iconUrlOf(p: Prefab): string | null {
  const data = p.data as Record<string, unknown> | null | undefined;
  const url = data?.iconUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

const KIND_ACCENT: Record<string, string> = {
  monster: "bg-red-900/60 text-red-200",
  npc: "bg-blue-900/60 text-blue-200",
  player_body: "bg-emerald-900/60 text-emerald-200",
  item: "bg-amber-900/60 text-amber-200",
  vfx: "bg-fuchsia-900/60 text-fuchsia-200",
  container: "bg-cyan-900/60 text-cyan-200",
  structure: "bg-zinc-700/60 text-zinc-200",
};

function PrefabIcon({
  url,
  kind,
  size,
}: {
  url: string | null;
  kind: string;
  size: number;
}) {
  const accent = KIND_ACCENT[kind] ?? "bg-zinc-800 text-zinc-300";
  const dim = `${size}px`;
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [url]);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        onError={() => setBroken(true)}
        style={{ width: dim, height: dim }}
        className="shrink-0 rounded border border-zinc-800 bg-zinc-950 object-contain"
      />
    );
  }
  return (
    <span
      style={{ width: dim, height: dim }}
      className={`flex shrink-0 items-center justify-center rounded border border-zinc-800 text-[10px] uppercase ${accent}`}
    >
      {kind.slice(0, 2)}
    </span>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? "md:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

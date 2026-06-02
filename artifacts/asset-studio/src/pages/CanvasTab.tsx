/**
 * CanvasTab — free-form 3D inspection workspace.
 *
 * Left: filterable list of model assets from the catalog. Picking a
 * model loads it as the primary character in the centre SceneCanvas;
 * shift-clicking adds it to the "extras" group so multiple assets can
 * be staged side-by-side (e.g. weapon next to a hand mesh).
 *
 * Right: scene controls (helpers, background, screenshot) and live
 * mesh/triangle/FPS stats reported back from SceneCanvas.
 */
import { useMemo, useRef, useState } from "react";
import type { StudioAsset, StudioGroup } from "@workspace/api-client-react";
import { AssetPicker } from "../components/AssetPicker";
import { SceneCanvas, type SceneCanvasHandle, type SceneStats } from "../components/SceneCanvas";
import { DownloadIcon } from "../components/Icons";
import { formatCount } from "../lib/format";

const MODEL_EXT = /\.(glb|gltf)$/i;

interface Props {
  groups: StudioGroup[];
}

export function CanvasTab({ groups }: Props) {
  const sceneRef = useRef<SceneCanvasHandle | null>(null);
  const [primary, setPrimary] = useState<StudioAsset | null>(null);
  const [extras, setExtras] = useState<StudioAsset[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showBones, setShowBones] = useState(false);
  const [background, setBackground] = useState<"studio" | "black" | "transparent">("studio");
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extraUrls = useMemo(
    () => extras.map((a) => a.publicUrl).filter((u): u is string => typeof u === "string"),
    [extras],
  );

  const pickAsset = (asset: StudioAsset, shift: boolean): void => {
    if (shift && primary) {
      setExtras((prev) => (prev.find((p) => p.key === asset.key) ? prev : [...prev, asset]));
    } else {
      setPrimary(asset);
    }
  };

  return (
    <div className= "grid h-[calc(100vh-112px)] min-h-0 grid-cols-[300px_1fr_280px]" >
    <AssetPicker
        groups={ groups }
  kindFilter = "model"
  nameRegex = { MODEL_EXT }
  selectedKey = { primary?.key ?? null
}
onPick = {(a) => pickAsset(a, false)}
title = "Models"
placeholder = "Search models…"
hint = "Shift-click to add as extra"
className = "border-r"
  />
  <div className="relative flex min-h-0 flex-col" >
    <CanvasToolbar
          onFit={ () => sceneRef.current?.fitCamera() }
onScreenshot = {() => sceneRef.current?.screenshot(`${primary?.filename ?? "scene"}.png`)}
background = { background }
onBackground = { setBackground }
showGrid = { showGrid }
onShowGrid = { setShowGrid }
showAxes = { showAxes }
onShowAxes = { setShowAxes }
showWireframe = { showWireframe }
onShowWireframe = { setShowWireframe }
showBones = { showBones }
onShowBones = { setShowBones }
extras = { extras }
onClearExtras = {() => setExtras([])}
onRemoveExtra = {(key) => setExtras((p) => p.filter((a) => a.key !== key))}
        />
  < div className = "relative flex-1 bg-zinc-950" >
    <SceneCanvas
            ref={ sceneRef }
characterUrl = { primary?.publicUrl ?? null}
extraUrls = { extraUrls }
playing = { true}
loopMode = "loop"
playbackRate = { 1}
showGrid = { showGrid }
showAxes = { showAxes }
showBones = { showBones }
showWireframe = { showWireframe }
background = { background }
className = "h-full w-full"
onStats = { setStats }
onError = { setError }
  />
  { primary == null ? (
    <div className= "pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-500" >
Pick a model on the left to begin.
            </div>
          ) : null}
</div>
  </div>
  < StatsPanel asset = { primary } stats = { stats } error = { error } extrasCount = { extras.length } />
    </div>
  );
}

function CanvasToolbar(props: {
  onFit: () => void;
  onScreenshot: () => void;
  background: "studio" | "black" | "transparent";
  onBackground: (b: "studio" | "black" | "transparent") => void;
  showGrid: boolean; onShowGrid: (v: boolean) => void;
  showAxes: boolean; onShowAxes: (v: boolean) => void;
  showWireframe: boolean; onShowWireframe: (v: boolean) => void;
  showBones: boolean; onShowBones: (v: boolean) => void;
  extras: StudioAsset[];
  onClearExtras: () => void;
  onRemoveExtra: (key: string) => void;
}) {
  const { onFit, onScreenshot, background, onBackground, showGrid, onShowGrid, showAxes, onShowAxes, showWireframe, onShowWireframe, showBones, onShowBones, extras, onClearExtras, onRemoveExtra } = props;
  return (
    <div className= "flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300" >
    <button type="button" onClick = { onFit } className = "rounded border border-zinc-800 bg-zinc-900 px-2 py-1 hover:border-emerald-700" > Fit camera </button>
      < button type = "button" onClick = { onScreenshot } className = "inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 hover:border-emerald-700" > <DownloadIcon className="h-3.5 w-3.5" /> PNG </button>
        < span className = "mx-1 h-4 w-px bg-zinc-800" />
          <Toggle label="Grid" value = { showGrid } onChange = { onShowGrid } />
            <Toggle label="Axes" value = { showAxes } onChange = { onShowAxes } />
              <Toggle label="Bones" value = { showBones } onChange = { onShowBones } />
                <Toggle label="Wire" value = { showWireframe } onChange = { onShowWireframe } />
                  <span className="mx-1 h-4 w-px bg-zinc-800" />
                    <label className="inline-flex items-center gap-1" > BG
                      < select value = { background } onChange = {(e) => onBackground(e.target.value as "studio" | "black" | "transparent")
} className = "rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5" >
  <option value="studio" > Studio </option>
    < option value = "black" > Black </option>
      < option value = "transparent" > Transparent </option>
        </select>
        </label>
{
  extras.length > 0 ? (
    <div className= "ml-auto flex flex-wrap items-center gap-1" >
    <span className="text-[10px] text-zinc-500" > Extras({ extras.length }): </span>
  {
    extras.map((e) => (
      <button key= { e.key } type = "button" onClick = {() => onRemoveExtra(e.key)} title = "Remove" className = "rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 hover:border-rose-700 hover:text-rose-300" > { e.filename } ×</button>
          ))
}
<button type="button" onClick = { onClearExtras } className = "rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 hover:border-rose-700" > Clear all </button>
  </div>
      ) : null}
</div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className= "inline-flex cursor-pointer items-center gap-1" >
    <input type="checkbox" checked = { value } onChange = {(e) => onChange(e.target.checked)
} className = "h-3 w-3 accent-emerald-500" />
  { label }
  </label>
  );
}

function StatsPanel({ asset, stats, error, extrasCount }: { asset: StudioAsset | null; stats: SceneStats | null; error: string | null; extrasCount: number }) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Selection</div>
      {asset ? (
        <div className="mt-2 space-y-1">
          <div className="truncate font-medium text-zinc-100" title={asset.filename}>{asset.filename}</div>
          <div className="break-all font-mono text-[10px] text-zinc-500">{asset.key}</div>
        </div>
      ) : <div className="mt-2 text-zinc-500">None</div>}
      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">Scene</div>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-[11px]">
        <dt className="text-zinc-500">FPS</dt><dd>{stats?.fps ?? "—"}</dd>
        <dt className="text-zinc-500">Meshes</dt><dd>{stats ? formatCount(stats.meshes) : "—"}</dd>
        <dt className="text-zinc-500">Vertices</dt><dd>{stats ? formatCount(stats.vertices) : "—"}</dd>
        <dt className="text-zinc-500">Triangles</dt><dd>{stats ? formatCount(stats.triangles) : "—"}</dd>
        <dt className="text-zinc-500">Extras</dt><dd>{extrasCount}</dd>
        <dt className="text-zinc-500">Clips</dt><dd>{stats?.clipNames.length ?? 0}</dd>
      </dl>
      {stats && stats.clipNames.length > 0 ? (
        <ul className="mt-1 max-h-32 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/50 p-1 text-[10px] text-zinc-400">
          {stats.clipNames.map((n, i) => <li key={`${n}-${i}`} className="truncate">{n}</li>)}
        </ul>
      ) : null}
      {error ? <div className="mt-3 rounded border border-rose-800/60 bg-rose-950/40 p-2 text-[11px] text-rose-200">{error}</div> : null}
      <div className="mt-auto pt-3 text-[10px] text-zinc-500">Tip: Shift-click in the picker to add an extra model alongside the primary one.</div>
    </aside>
  );
}

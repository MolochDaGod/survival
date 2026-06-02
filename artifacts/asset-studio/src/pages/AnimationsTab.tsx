/**
 * AnimationsTab — dedicated retargeting / animation-preview workspace.
 *
 * Layout:
 *   ┌──────────────┬───────────────────────────┬──────────────┐
 *   │ Characters   │       SceneCanvas         │  Clips       │
 *   │ (left list)  │  (centre 3D viewport)     │ (right list) │
 *   └──────────────┴───────────────────────────┴──────────────┘
 *
 * Clicking a character loads it as the rig. Clicking a clip GLB loads
 * its first animation, retargets the Mixamo "mixamorig:" prefix if the
 * character rig uses bare bone names, and plays it on the mixer.
 *
 * The clip picker pre-filters to GLB files whose names match common
 * animation hints (idle/walk/run/jump/attack/dance/etc.) so it isn't
 * polluted by full-mesh character GLBs, while still letting the user
 * search freely.
 */
import { useMemo, useRef, useState } from "react";
import type { StudioAsset, StudioGroup } from "@workspace/api-client-react";
import { AssetPicker } from "../components/AssetPicker";
import { SceneCanvas, type LoopMode, type SceneCanvasHandle, type SceneStats } from "../components/SceneCanvas";

const GLB_EXT = /\.(glb|gltf)$/i;
/** Heuristic: clip GLBs typically carry an action name. Players can clear
 *  the regex via the picker's search box if they want unfiltered listing. */
const ANIMATION_HINT = /(idle|walk|run|sprint|jump|fall|land|crouch|attack|swing|slash|stab|shoot|reload|aim|hit|stun|death|die|dance|emote|sit|stand|roll|dodge|cast|spell|throw)/i;

interface Props {
  groups: StudioGroup[];
}

export function AnimationsTab({ groups }: Props) {
  const sceneRef = useRef<SceneCanvasHandle | null>(null);
  const [character, setCharacter] = useState<StudioAsset | null>(null);
  const [clip, setClip] = useState<StudioAsset | null>(null);
  const [availableClips, setAvailableClips] = useState<string[]>([]);
  const [activeClipName, setActiveClipName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [loopMode, setLoopMode] = useState<LoopMode>("loop");
  const [rate, setRate] = useState(1);
  const [showBones, setShowBones] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClipsAvailable = (clips: string[]): void => {
    setAvailableClips(clips);
    if (clips.length > 0 && (!activeClipName || !clips.includes(activeClipName))) {
      setActiveClipName(clips[0]);
    } else if (clips.length === 0) {
      setActiveClipName(null);
    }
  };

  const subtitle = useMemo(() => {
    if (!character) return "Pick a character on the left.";
    if (!clip && availableClips.length === 0) return "Pick an animation GLB on the right.";
    if (availableClips.length === 0) return "Loaded character has no clips and no clip selected.";
    return `${availableClips.length} clip${availableClips.length === 1 ? "" : "s"} loaded`;
  }, [character, clip, availableClips]);

  return (
    <div className="grid h-[calc(100vh-112px)] min-h-0 grid-cols-[260px_1fr_280px]">
      <AssetPicker
        groups={groups}
        kindFilter="model"
        nameRegex={GLB_EXT}
        selectedKey={character?.key ?? null}
        onPick={(a) => { setCharacter(a); setClip(null); setActiveClipName(null); setAvailableClips([]); }}
        title="Characters"
        placeholder="Search characters…"
        hint="GLB models"
        className="border-r"
      />
      <div className="flex min-h-0 flex-col">
        <AnimToolbar
          subtitle={subtitle}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
          loopMode={loopMode}
          onLoopMode={setLoopMode}
          rate={rate}
          onRate={setRate}
          activeClipName={activeClipName}
          availableClips={availableClips}
          onActiveClipName={setActiveClipName}
          showBones={showBones}
          onShowBones={setShowBones}
          showGrid={showGrid}
          onShowGrid={setShowGrid}
          onFit={() => sceneRef.current?.fitCamera()}
          onScreenshot={() => sceneRef.current?.screenshot(`${character?.filename ?? "anim"}.png`)}
        />
        <div className="relative flex-1 bg-zinc-950">
          <SceneCanvas
            ref={sceneRef}
            characterUrl={character?.publicUrl ?? null}
            clipUrl={clip?.publicUrl ?? null}
            clipName={activeClipName}
            playing={playing}
            loopMode={loopMode}
            playbackRate={rate}
            showGrid={showGrid}
            showAxes={false}
            showBones={showBones}
            showWireframe={false}
            background="studio"
            className="h-full w-full"
            onClipsAvailable={onClipsAvailable}
            onStats={setStats}
            onError={setError}
          />
          {character == null ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
              Pick a character to begin.
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-x-0 bottom-0 border-t border-rose-800/50 bg-rose-950/60 px-3 py-1.5 text-xs text-rose-200">{error}</div>
          ) : null}
        </div>
        {stats ? (
          <div className="border-t border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-[11px] text-zinc-400">
            FPS {stats.fps} · Meshes {stats.meshes} · Tris {stats.triangles.toLocaleString()} · Clips {stats.clipNames.length}
          </div>
        ) : null}
      </div>
      <AssetPicker
        groups={groups}
        kindFilter="model"
        nameRegex={ANIMATION_HINT}
        selectedKey={clip?.key ?? null}
        onPick={(a) => setClip(a)}
        title="Animations"
        placeholder="Search animations…"
        hint="Filter: idle/walk/attack/…"
        className="border-l"
      />
    </div>
  );
}

function AnimToolbar(props: {
  subtitle: string;
  playing: boolean; onTogglePlay: () => void;
  loopMode: LoopMode; onLoopMode: (m: LoopMode) => void;
  rate: number; onRate: (v: number) => void;
  activeClipName: string | null; availableClips: string[]; onActiveClipName: (n: string) => void;
  showBones: boolean; onShowBones: (v: boolean) => void;
  showGrid: boolean; onShowGrid: (v: boolean) => void;
  onFit: () => void; onScreenshot: () => void;
}) {
  const { subtitle, playing, onTogglePlay, loopMode, onLoopMode, rate, onRate, activeClipName, availableClips, onActiveClipName, showBones, onShowBones, showGrid, onShowGrid, onFit, onScreenshot } = props;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-300">
      <button type="button" onClick={onTogglePlay} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 hover:border-emerald-700">{playing ? "Pause" : "Play"}</button>
      <select value={loopMode} onChange={(e) => onLoopMode(e.target.value as LoopMode)} className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1">
        <option value="loop">Loop</option>
        <option value="once">Once</option>
        <option value="pingpong">Ping-pong</option>
      </select>
      <label className="inline-flex items-center gap-1">Speed
        <input type="range" min={0.1} max={2} step={0.05} value={rate} onChange={(e) => onRate(parseFloat(e.target.value))} className="w-20" />
        <span className="w-8 text-right tabular-nums">{rate.toFixed(2)}×</span>
      </label>
      {availableClips.length > 0 ? (
        <select value={activeClipName ?? ""} onChange={(e) => onActiveClipName(e.target.value)} className="max-w-[14rem] truncate rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1">
          {availableClips.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : null}
      <span className="mx-1 h-4 w-px bg-zinc-800" />
      <label className="inline-flex cursor-pointer items-center gap-1"><input type="checkbox" checked={showBones} onChange={(e) => onShowBones(e.target.checked)} className="h-3 w-3 accent-emerald-500" />Bones</label>
      <label className="inline-flex cursor-pointer items-center gap-1"><input type="checkbox" checked={showGrid} onChange={(e) => onShowGrid(e.target.checked)} className="h-3 w-3 accent-emerald-500" />Grid</label>
      <span className="mx-1 h-4 w-px bg-zinc-800" />
      <button type="button" onClick={onFit} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 hover:border-emerald-700">Fit</button>
      <button type="button" onClick={onScreenshot} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 hover:border-emerald-700">PNG</button>
      <span className="ml-auto truncate text-[11px] text-zinc-500">{subtitle}</span>
    </div>
  );
}

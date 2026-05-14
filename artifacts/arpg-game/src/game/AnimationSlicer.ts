import * as THREE from 'three';
import { AnimationUtils } from 'three';

/**
 * AnimationSlicer
 *
 * Many open-source enemy GLBs ship with a single long named timeline
 * (e.g. "Motion", "Scene", "tposeidlewalk") that is actually a reel of
 * multiple sub-clips concatenated end-to-end with rest poses between them.
 *
 * THREE.AnimationUtils.subclip operates on integer FRAME ranges; this
 * module wraps it so callers can describe sub-clips in SECONDS and group
 * them into per-asset manifests that live next to the planning docs.
 *
 * Time values in every SliceSpec below were derived by sampling each
 * source clip at 30 Hz and looking for "rest pose" frames where the
 * total per-bone rotation delta drops below ~5% of peak activity for at
 * least 100 ms. Labels are best-guess interpretations of what each burst
 * is (idle / walk / attack / death) — verify them in-engine before
 * shipping. See docs/anim-slicing-plan.md for the full per-asset notes.
 */

// ─── Public types ──────────────────────────────────────────────────────────

export interface SliceSpec {
  /** Name to give the resulting sub-clip (e.g. 'idle', 'attack_a'). */
  name: string;
  /** Start time in SECONDS within the source clip. */
  startSec: number;
  /** End time in SECONDS within the source clip. */
  endSec: number;
  /**
   * Loop hint for AnimationAction setup. Loop is a property of
   * AnimationAction, not AnimationClip, so consumers apply this when
   * they call mixer.clipAction(...).setLoop(...).
   * Default: false (one-shot).
   */
  loop?: boolean;
  /** Override the default frame rate for time → frame conversion. */
  fps?: number;
}

export interface SliceManifest {
  /** Name of the source AnimationClip in the loaded GLTF. */
  sourceClip: string;
  /** Sample rate used to convert seconds → frames when SliceSpec.fps is unset. */
  defaultFps: number;
  /** Sub-clips to extract from sourceClip. */
  slices: SliceSpec[];
  /** Optional human-readable comment for tooling / docs. */
  notes?: string;
}

// ─── Core utility ──────────────────────────────────────────────────────────

/**
 * Slice a single sub-range out of a source AnimationClip.
 *
 * AnimationUtils.subclip mutates per-track sample data into the
 * [startFrame, endFrame) window and resets the clip's start time to 0.
 * The returned clip can be played as if it were authored standalone.
 */
export function sliceClip(
  source: THREE.AnimationClip,
  spec: SliceSpec,
  defaultFps = 30,
): THREE.AnimationClip {
  const fps = spec.fps ?? defaultFps;
  // Floor the start and ceil the end so the resulting sub-clip always
  // covers the full requested time range (inclusive on both sides). Using
  // round on both sides could shift either boundary by up to half a frame
  // and silently drop content at clip edges.
  const startFrame = Math.max(0, Math.floor(spec.startSec * fps));
  const endFrame = Math.max(startFrame + 1, Math.ceil(spec.endSec * fps));
  return AnimationUtils.subclip(source, spec.name, startFrame, endFrame, fps);
}

/**
 * Apply a manifest to the animations array of a loaded GLTF.
 * Returns a Map of sub-clip name → AnimationClip.
 *
 * @throws if manifest.sourceClip is not present in the animations array.
 */
export function applySliceManifest(
  animations: readonly THREE.AnimationClip[],
  manifest: SliceManifest,
): Map<string, THREE.AnimationClip> {
  const out = new Map<string, THREE.AnimationClip>();
  // Empty manifests are documented no-ops (e.g. assets that ship already
  // discrete). Don't require the source clip to be present in that case.
  if (manifest.slices.length === 0) return out;
  const source = animations.find((c) => c.name === manifest.sourceClip);
  if (!source) {
    const available = animations.map((a) => a.name).join(', ') || '(none)';
    throw new Error(
      `AnimationSlicer: source clip "${manifest.sourceClip}" not found. ` +
        `Available: ${available}`,
    );
  }
  for (const spec of manifest.slices) {
    out.set(spec.name, sliceClip(source, spec, manifest.defaultFps));
  }
  return out;
}

/**
 * Apply multiple manifests to the same animations array (e.g. when an
 * asset has more than one source clip that needs sub-slicing, like
 * Stoneform Sleeve's `jump` and `attack`).
 */
export function applySliceManifests(
  animations: readonly THREE.AnimationClip[],
  manifests: readonly SliceManifest[],
): Map<string, THREE.AnimationClip> {
  const out = new Map<string, THREE.AnimationClip>();
  for (const m of manifests) {
    for (const [name, clip] of applySliceManifest(animations, m)) {
      out.set(name, clip);
    }
  }
  return out;
}

/**
 * Read loop hints out of a manifest. Loop is a property of AnimationAction
 * (not AnimationClip), so the consumer sets it when creating the action:
 *
 *   const flags = getLoopFlags(manifest);
 *   const action = mixer.clipAction(clip);
 *   action.setLoop(flags.get(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
 */
export function getLoopFlags(manifest: SliceManifest): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const s of manifest.slices) out.set(s.name, s.loop ?? false);
  return out;
}

/**
 * Like getLoopFlags but for the merged result of applySliceManifests —
 * combines loop hints across multiple manifests for assets that sub-slice
 * more than one source clip (e.g. Stoneform Sleeve's `jump` + `attack`).
 *
 * If two manifests produce the same sub-clip name, the later one wins —
 * matches applySliceManifests' last-write-wins merge behavior.
 */
export function getLoopFlagsForManifests(
  manifests: readonly SliceManifest[],
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const m of manifests) {
    for (const s of m.slices) out.set(s.name, s.loop ?? false);
  }
  return out;
}

// ─── Per-asset slice manifests ─────────────────────────────────────────────
//
// Slice times below are derived from rotation-activity analysis of each
// reel (per-frame rest-pose detection). Labels are best-guess
// interpretations; verify in-engine before shipping. See
// docs/anim-slicing-plan.md for the full activity tables.

export const LAVA_CORPS_SANCHO_SLICES: SliceManifest = {
  sourceClip: 'Motion',
  defaultFps: 30,
  notes:
    'Single 18.65 s reel from Vasian-Digital3D (CC-BY-4.0). 13 detected ' +
    'segments; cleanest five extracted as the playable set.',
  slices: [
    { name: 'idle',     startSec:  0.00, endSec:  0.77, loop: true },
    { name: 'attack_a', startSec:  2.25, endSec:  4.82 },
    { name: 'attack_b', startSec:  4.82, endSec:  7.46 },
    { name: 'walk',     startSec: 11.03, endSec: 12.91, loop: true },
    { name: 'special',  startSec: 15.78, endSec: 17.88 },
  ],
};

export const SKELETON_SLICES: SliceManifest = {
  sourceClip: 'Motion',
  defaultFps: 30,
  notes:
    'Single 29.98 s reel from Vasian-Digital3D (CC-BY-4.0). Activity analysis ' +
    'found 18 segments; six surface as functional clips (death/idle/walk/attack combo).',
  slices: [
    { name: 'death',    startSec:  0.00, endSec:  2.25 },
    { name: 'idle',     startSec:  2.25, endSec:  8.62, loop: true },
    { name: 'walk_in',  startSec:  9.86, endSec: 11.31 },
    { name: 'walk',     startSec: 13.94, endSec: 16.81, loop: true },
    { name: 'attack_a', startSec: 25.88, endSec: 26.73 },
    { name: 'attack_b', startSec: 26.73, endSec: 28.08 },
  ],
};

export const SKELETON_LORD_SLICES: SliceManifest = {
  sourceClip: 'tposeidlewalk',
  defaultFps: 30,
  notes:
    'Single 4.33 s reel from DJMaesen (CC-BY-4.0). Name says T-pose + idle + ' +
    'walk; we skip the T-pose intro and surface walk + tail idle. Will need ' +
    'Mixamo retargets for attack / death / hit moves.',
  slices: [
    { name: 'walk', startSec: 1.53, endSec: 3.72, loop: true },
    { name: 'idle', startSec: 3.72, endSec: 4.33, loop: true },
  ],
};

export const NEUTRAL_BANDIT_SLICES: SliceManifest = {
  sourceClip: 'Scene',
  defaultFps: 30,
  notes:
    'Single 16.77 s reel from ZakRenat (CC-BY-4.0). First 7.23 s is a dead ' +
    'T-pose hold; the only real animation lives in the back half. Plan for ' +
    'Mixamo retarget for the rest of the move set.',
  slices: [
    { name: 'main',    startSec:  7.23, endSec: 15.60 },
    { name: 'closing', startSec: 15.60, endSec: 16.77 },
  ],
};

// Stoneform Sleeve ships 5 already-discrete clips (idle/walk/jump/attack/Death)
// from author elarix (CC-BY-4.0), but the `jump` and `attack` clips each
// begin with a long T-pose hold and then a single continuous action burst.
// Trimming the T-pose is mechanical; sub-slicing the continuous action
// (windup → strike → recover) is PROVISIONAL because there are no internal
// rest frames to anchor the cuts — verify and tune in-engine.

export const STONEFORM_SLEEVE_JUMP_SLICES: SliceManifest = {
  sourceClip: 'jump',
  defaultFps: 30,
  notes:
    "8.67 s clip; first 3.33 s is a T-pose hold. Action runs 3.33–8.25 s. " +
    'Sub-cuts below are PROVISIONAL — tune in-engine by scrubbing the clip.',
  slices: [
    { name: 'jump_windup',   startSec: 3.33, endSec: 4.20 },
    { name: 'jump_launch',   startSec: 4.20, endSec: 5.20 },
    { name: 'jump_air',      startSec: 5.20, endSec: 6.40, loop: true },
    { name: 'jump_land',     startSec: 6.40, endSec: 7.40 },
    { name: 'jump_recover',  startSec: 7.40, endSec: 8.25 },
  ],
};

export const STONEFORM_SLEEVE_ATTACK_SLICES: SliceManifest = {
  sourceClip: 'attack',
  defaultFps: 30,
  notes:
    "11.33 s clip; first 5.13 s is a T-pose hold. Action runs 5.13–11.33 s and " +
    'reads as a two-swing combo (peak activity 0.63, spread out). Sub-cuts ' +
    'below are PROVISIONAL — tune in-engine.',
  slices: [
    { name: 'attack_a_windup',  startSec:  5.13, endSec:  6.30 },
    { name: 'attack_a_strike',  startSec:  6.30, endSec:  7.30 },
    { name: 'attack_a_recover', startSec:  7.30, endSec:  8.30 },
    { name: 'attack_b_windup',  startSec:  8.30, endSec:  9.30 },
    { name: 'attack_b_strike',  startSec:  9.30, endSec: 10.50 },
    { name: 'attack_b_recover', startSec: 10.50, endSec: 11.33 },
  ],
};

// Glow Whale ships 20 already-discrete named clips from gavinpgamer1
// (CC-BY-4.0); no slicing required. Documented here as a no-op for
// completeness so the registry symmetrically lists every audited asset.
export const GLOW_WHALE_SLICES: SliceManifest = {
  sourceClip: 'gloWh_Death',
  defaultFps: 30,
  notes:
    'Glow Whale ships 20 already-discrete named clips; no slicing required. ' +
    'Entry kept as a no-op so the registry symmetrically lists every audited asset.',
  slices: [],
};

// ─── Master registry ───────────────────────────────────────────────────────

/**
 * Per-enemy slice manifest lookup. Some enemies (Stoneform Sleeve) need
 * multiple manifests because more than one source clip is sub-sliced;
 * those are arrays.
 */
export const ENEMY_SLICE_MANIFESTS = {
  lava_corps_sancho: [LAVA_CORPS_SANCHO_SLICES],
  skeleton:          [SKELETON_SLICES],
  skeleton_lord:     [SKELETON_LORD_SLICES],
  neutral_bandit:    [NEUTRAL_BANDIT_SLICES],
  stoneform_sleeve:  [STONEFORM_SLEEVE_JUMP_SLICES, STONEFORM_SLEEVE_ATTACK_SLICES],
  glow_whale:        [GLOW_WHALE_SLICES],
} as const satisfies Record<string, readonly SliceManifest[]>;

export type EnemyTag = keyof typeof ENEMY_SLICE_MANIFESTS;

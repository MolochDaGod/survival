# Animation slicing plan

Many of the enemy GLBs we've audited follow the same pattern: a single
long named timeline ("Motion", "Scene", "tposeidlewalk") that is actually
a reel of multiple sub-clips concatenated end-to-end with brief rest poses
between them. Rather than asking each enemy plan to redo the same slice
math, we extract that knowledge into one shared utility plus a per-asset
slice manifest.

- **Utility:** `src/game/AnimationSlicer.ts` (`sliceClip`, `applySliceManifest`,
  `applySliceManifests`, `getLoopFlags`, `getLoopFlagsForManifests`).
- **Manifests:** the same file, exported by name (`LAVA_CORPS_SANCHO_SLICES`,
  `SKELETON_SLICES`, etc.) and grouped into `ENEMY_SLICE_MANIFESTS`.

## How the slice points were derived

For each long reel I sampled the source clip at 30 Hz and computed a
per-frame "rotation activity" score equal to the sum of `1 - |dot(qPrev,
qCur)|` across every rotation channel. That gives a single curve over
time whose minima correspond to rest poses (the natural cut points
between sub-clips) and whose maxima correspond to peak action moments.

I then:

1. Detected runs of frames where activity dropped below ~5% of peak for
   at least 100 ms — these are the rest-pose windows.
2. Cut the reel at the **midpoint** of each rest window.
3. Labelled each resulting segment as `[idle]`, `[medium]`, or `[action]`
   based on its peak activity (< 0.20, < 0.50, ≥ 0.50 of reel max).

Labels in the manifests are best-guess interpretations of what each
burst represents (idle / walk / attack / death) — they need to be
verified in-engine before shipping.

## Per-asset notes

### Lava Corps Sancho (Vasian-Digital3D, CC-BY-4.0)

Single `Motion` reel, 18.65 s, 273 channels. Activity analysis found 13
segments. Five extracted as the playable set:

| Sub-clip   | Range       | Peak | Why                                |
|------------|-------------|------|------------------------------------|
| `idle`     | 0.00–0.77 s | 0.18 | Hold pose at the start of the reel |
| `attack_a` | 2.25–4.82 s | 0.86 | Largest action burst in the reel   |
| `attack_b` | 4.82–7.46 s | 0.69 | Adjacent second action burst       |
| `walk`     | 11.03–12.91 s | 0.25 | Sustained medium-activity loop  |
| `special`  | 15.78–17.88 s | 1.00 | Strongest motion in the reel — likely a jump or death |

The mid-reel low-activity segments (~7.5–15 s) are a series of subtle
idle holds; they don't surface as standalone clips.

### Skeleton (Vasian-Digital3D, CC-BY-4.0)

Single `Motion` reel, 29.98 s, 547 channels (140 bones × ~4 paths each).
Activity analysis found 18 segments. Six extracted as functional clips:

| Sub-clip   | Range         | Peak | Why                              |
|------------|---------------|------|----------------------------------|
| `death`    | 0.00–2.25 s   | 1.00 | Biggest action burst — at very start, suggests reel opens with the death |
| `idle`     | 2.25–8.62 s   | 0.15 | Long subtle idle reel             |
| `walk_in`  | 9.86–11.31 s  | 0.25 | Walk-into-stride transition       |
| `walk`     | 13.94–16.81 s | 0.22 | Walk loop                         |
| `attack_a` | 25.88–26.73 s | 0.72 | First swing of an attack combo    |
| `attack_b` | 26.73–28.08 s | 0.68 | Adjacent second swing             |

Frames 17–25 are a long rest hold (likely intentional padding between
the walk and attack reels in the source).

### Skeleton Lord (DJMaesen, CC-BY-4.0)

Single `tposeidlewalk` reel, 4.33 s. The clip name is the manifest:
T-pose → idle → walk. Detection saw three segments; we skip the T-pose
intro and surface the back two:

| Sub-clip | Range        | Why                          |
|----------|--------------|------------------------------|
| `walk`   | 1.53–3.72 s  | Main locomotion loop         |
| `idle`   | 3.72–4.33 s  | Tail idle frames             |

Skeleton Lord ships **no attack, hit, or death** in this reel — those
will need Mixamo retargets onto the 89-bone rig if we want a full move
set.

### Neutral Bandit (ZakRenat, CC-BY-4.0)

Single `Scene` reel, 16.77 s, 1882 channels (662 bones × ~3 paths). The
detected first segment (0–7.23 s) shows zero activity — the reel opens
with a flat T-pose hold and only starts animating in the back half:

| Sub-clip  | Range          | Peak | Why                              |
|-----------|----------------|------|----------------------------------|
| `main`    | 7.23–15.60 s   | 0.93 | The only real animation in the reel |
| `closing` | 15.60–16.77 s  | 1.00 | Strong final motion — possibly death |

The 662-bone rig is suspicious (likely cloth + IK helpers baked in);
worth profiling before committing to this asset.

### Stoneform Sleeve (elarix, CC-BY-4.0)

Stoneform ships 5 already-discrete clips (`idle`, `walk`, `jump`,
`attack`, `Death`). Two of them — `jump` (8.67 s) and `attack`
(11.33 s) — each begin with a long T-pose hold followed by a single
**continuous** action burst (no internal rest frames). The T-pose trim
is mechanical; the sub-slicing of the action is **provisional** and must
be tuned visually because there are no rest poses to anchor the cuts.

`jump` source — action runs 3.33–8.25 s (4.92 s of motion):

| Sub-clip       | Range       | Notes (provisional)         |
|----------------|-------------|------------------------------|
| `jump_windup`  | 3.33–4.20 s | First ~17% of action — crouch |
| `jump_launch`  | 4.20–5.20 s | Push-off into the air         |
| `jump_air`     | 5.20–6.40 s | Mid-air sustain (looping)     |
| `jump_land`    | 6.40–7.40 s | Impact + initial absorb       |
| `jump_recover` | 7.40–8.25 s | Settle back to neutral        |

`attack` source — action runs 5.13–11.33 s (6.20 s of motion). Peak
activity is 0.63 and spread out, suggesting a two-swing combo:

| Sub-clip          | Range          | Notes (provisional)        |
|-------------------|----------------|-----------------------------|
| `attack_a_windup` | 5.13–6.30 s    | First swing wind-up         |
| `attack_a_strike` | 6.30–7.30 s    | First contact frame area    |
| `attack_a_recover`| 7.30–8.30 s    | Brief reset between hits    |
| `attack_b_windup` | 8.30–9.30 s    | Second swing wind-up        |
| `attack_b_strike` | 9.30–10.50 s   | Second contact frame area   |
| `attack_b_recover`| 10.50–11.33 s  | Settle back to neutral      |

These will be wrong on first run. Plan to scrub the clip in a debug
viewer (Three.js editor or `<r3f>` test scene) and adjust the times
based on visible foot plants and weapon-tip arcs.

### Glow Whale (gavinpgamer1, CC-BY-4.0)

20 already-discrete named clips covering directional movement (move
f/b/l/r/u/d), surfacing variants (surface, surface_l, surface_r,
breach), feeding (gulp), idle (breath), six "Call" calls, death, and
two "player_*" interaction clips. **No slicing required.** Documented
in the manifest as a no-op so the registry lists every audited asset.

## Usage

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  applySliceManifests,
  getLoopFlags,
  ENEMY_SLICE_MANIFESTS,
} from '@/game/AnimationSlicer';

const gltf = await new GLTFLoader().loadAsync('/models/enemies/skeleton.glb');
const clipsByName = applySliceManifests(
  gltf.animations,
  ENEMY_SLICE_MANIFESTS.skeleton,
);

// Build mixer + actions as usual.
const mixer = new THREE.AnimationMixer(gltf.scene);
const loopFlags = getLoopFlagsForManifests(ENEMY_SLICE_MANIFESTS.skeleton);
for (const [name, clip] of clipsByName) {
  const action = mixer.clipAction(clip);
  action.setLoop(loopFlags.get(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
}
```

## Future work

- **Internal slicing of continuous action bursts** (Stoneform's
  `jump`/`attack`) needs a different heuristic — root bone Y dips for
  foot plants, weapon-bone speed peaks for impact frames, etc. The
  rest-pose detector that drives the rest of this file does not find
  anchors inside a continuous burst. Until that lands, the provisional
  cuts above must be tuned by eye.
- **Mixamo retarget pipeline** for Skeleton Lord (no attacks / death in
  source), Neutral Bandit (only one usable reel), and the bumstrum
  Terrorist / Enemy1 pair (rig-only, no anims). All four have similar
  enough humanoid skeletons to share the retarget setup.

# Enemies — Design Plans (Consolidated)

This document consolidates the design plans for every enemy currently
audited for Grudge Nexus. Each enemy was previously documented in its
own ~500-line file (`bear-enemy-plan.md`, `cravel-enemy-plan.md`,
`crocodile-enemy-plan.md`, `sleeve-enemy-plan.md`,
`stoneform-sleeve-enemy-plan.md`) — those files have been merged here.
The shared boilerplate (asset pipeline, hitbox conventions, AI
archetypes, integration steps) is extracted once at the top, then
each enemy gets a tight per-section block with only its specifics.

If you want the original long-form rationale for any single enemy, it
lives in this file's git history at the path above.

> **Companion docs (still standalone)**
> - `anim-slicing-plan.md` — how single-reel GLBs are sliced into
>   sub-clips and the activity-score method used to find cut points.
> - `inventory/README.md` — CSV registry index (creatures, weapons,
>   gear, recipes, etc.). The bestiary entries referenced in §I.7
>   live in `inventory/creatures.csv`.
> - `../ASSET_CATALOG.md` — full per-mesh asset registry on disk.

---

## Part I — Shared conventions

These conventions apply to every enemy in the project. Per-enemy
sections (Part II) only call out where they differ.

### I.1 Asset pipeline

- **Format:** keep source `.glb` files unmodified, route through the
  shared `AssetManager` GLB loader. Do not re-export or rescale at
  build time — runtime scale via `EnemyArchetype.scale` only.
- **Path layout:** `artifacts/arpg-game/public/models/enemies/<key>/<key>.glb`.
  When a separate animation bundle is needed (Mixamo retargets,
  sliced sub-clips packaged separately), use `<key>-anims.glb` next
  to the mesh.
- **Pivot handling:** `AssetManager` auto-computes `footOffsetY` from
  the model's lowest mesh Y after scale and adds it as a transform
  offset. This handles "pivot at top of head" (Stoneform), "pivot at
  belly" (Crocodile), and standard "pivot at feet" rigs uniformly.
  Set `yOffset = 0` and trust the auto-compute; only override for
  exotic cases.
- **Forward axis:** rigs vary (Maya/C4D/3DS Max default to different
  axes; glTF conversion sometimes rotates). The `EnemyArchetype` type
  carries a `forwardAxis: '+z' | '-z' | '+x' | '-x'` flag that the
  spawn code applies at load time. **Verify visually at integration**
  for every new enemy — drop one in the test arena, check which way
  the navel points, set the flag.
- **Material upgrade pattern:** post-process the existing material at
  load time rather than swapping it (preserves ND-licensed assets,
  avoids duplicating textures). Standard tweak:

  ```ts
  group.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    m.envMapIntensity = 0.4..0.6;   // dial per material
    m.roughness = max(0.55, m.roughness);
    m.metalness = 0.0;
  });
  ```

- **Animation slicing:** many shipped GLBs contain a single long
  "demo reel" timeline rather than named sub-clips. The shared
  `AnimationSlicer` (`src/game/AnimationSlicer.ts`) plus per-asset
  slice manifests handle this. See `anim-slicing-plan.md` for the
  activity-score method used to find rest-pose cut points.

### I.2 Collider conventions

Three layers, applied consistently:

1. **Broad body capsule** — for YUKA collision and projectile
   pre-pass. Single capsule for upright bipeds; multi-capsule
   (torso + tail, etc.) for long-bodied creatures.
2. **Per-bone hitboxes** — sphere/capsule attached to named bones,
   used for all damage resolution. Each carries a `tag` (`head`,
   `torso_top`, `limb`, `weak_spot_*`, …) and a `crit mult` which
   the damage pipeline multiplies into incoming damage.
3. **Active attack hitboxes** — short-lived volumes attached to the
   attacker's bones during specific frame windows of an attack. The
   attack data (§I.5) declares `start`/`end` windows in seconds and
   the damage pipeline activates the volume only inside that window.

Damage direction modifiers (armoured up, soft belly, etc.) ride on
the broad body capsule using a dot product against `+Y` or the
attacker's local axis — see Crocodile (§II.3) for the canonical
example.

### I.3 Animation graph archetype

All enemies share a base state machine; per-enemy plans only add
states that are unique to them.

```
IDLE  →  ALERT  →  PURSUE_*  →  COMBAT  ↔  HIT_REACT
                                  ↓             ↓
                                 (move-      (light/heavy)
                                  specific)
                                  ↓
                                DEATH (terminal)
```

Optional states some enemies add: `STALK`/`SURFACE` (water ambush),
`ROLL` (grab + DoT), `CRACK` (armor-break one-shot), `RETREAT`
(post-miss), `INJURED` mode swap (low-HP variant).

Notes that apply across the board:

- Cross-fade between states defaults to **0.20 s**; bump to 0.30 s
  for heavy/slow creatures.
- Hit reactions split light/heavy by a `staggerPoiseThreshold`. Some
  enemies (Stoneform) shrug off light hits entirely.
- Death clips use `clamp` (not loop, not reverse) — body holds the
  final pose, then either despawns or persists as cover.
- `mixer.timeScale` per-state is allowed for "uncanny" pacing tweaks
  (Sleeve idle jitter) and is **not** a license-bearing modification.

### I.4 AI archetypes

| Archetype | Examples | Defining behavior |
|---|---|---|
| `quad_pack` | Cravel | Pack hunter, pounces, flees at low HP |
| `quad_heavy` | Bear | Solo apex, telegraphed combos, never flees |
| `water_ambush` | Crocodile | Submerged stalk → surface → lunge → bleed grab |
| `biped_brute` | Sleeve | Fast frantic bruiser, pack-stagger active |
| `biped_tank` | Stoneform | Slow armored anchor, weak-spot puzzle |

All use YUKA for steering with shared behaviors (`WanderBehavior`,
`PursuitBehavior`, `FleeBehavior`, `SeparationBehavior`,
`ObstacleAvoidanceBehavior`). Differences are tuning + which
behaviors are wired.

**Pack staggering** (introduced for Sleeve, reusable): when ≥ 2
enemies of the same family are alive within a 12 m bubble, an
`ActiveAttackerSlot` ticket on `EnemyManager` keyed by
distance-to-player ensures only one swings at a time; others flank.

**Script-driven motion** (introduced for Cravel pounce, reused by
Crocodile lunge and Stoneform slam-jump): a generic
`ScriptedAttackRunner` interpolates root + named-bone transforms
over a duration, bypassing YUKA for the attack window. This is the
shared mechanism for any "lunge" / "leap" / "ballistic pursuit".

### I.5 Combat data shape (`EnemyArchetype`)

Every enemy ships a single TypeScript const that is the source of
truth for stats, body, hitboxes, moves, animation routing, and loot.
Per-enemy specifics live in §II; the shape is:

```ts
export interface EnemyArchetype {
  key: string;
  modelPath: string;
  animsPath?: string;             // optional separate clip bundle
  scale: number;
  yOffset: number;
  forwardAxis: '+z' | '-z' | '+x' | '-x';
  archetype: 'quad_pack' | 'quad_heavy' | 'water_ambush'
           | 'biped_brute' | 'biped_tank';
  family?: string;                // groups variants (e.g. 'sleeve')

  // Stats
  maxHealth: number;
  damageMultiplier: number;
  expReward: number;
  tier: 1 | 2 | 3 | 4 | 5;

  // Movement
  walkSpeed?: number; runSpeed?: number; swimSpeed?: number;
  turnRate: number;
  bigTurnThreshold?: number;      // → turn-in-place clip when |Δyaw| exceeds

  // Combat ranges
  alertRange: number;
  alertHoldTime?: number;         // telegraph duration before commit
  engageRange: number;
  fleeHpRatio: number;            // 0 = never flees
  poiseMax?: number; poiseRegenPerSec?: number;
  staggerPoiseThreshold?: number;

  // Body
  capsule?: { axis; radius; length; offset };
  body?: { capsules: […]; armoured?: { up; down } };  // multi-capsule

  // Hitboxes (per-bone)
  hitboxes: HitboxDef[];

  // Optional armor / weak-spot system
  armor?: {
    default: number;
    weakSpotBone: string;
    crackThresholdHits: number;
    crackThresholdDamage: number;
    crackedMultipliers: { chest: number; head: number };
  };

  // Moves — keyed by move name; each has clip OR script,
  // duration, cooldown, and one or more damage windows.
  moves: Record<string, MoveDef>;

  // Animation routing — maps semantic states to clip names
  anims: { idle; walk; run?; alert?; hit?; death; … };

  // Region constraint (optional)
  requires?: { region: 'water' | 'land' };

  // Loot
  lootTableId: string;
}
```

### I.6 Cross-cutting integration steps

These are needed once and reused by every enemy. None are per-enemy
work after the first introduction:

1. **GLB loader extension** in `AssetManager` (introduced for Cravel).
2. **`forwardAxis` support** in `EnemyArchetype` + spawn code
   (introduced for Bear).
3. **Auto `footOffsetY`** computation (introduced for Cravel,
   exercised by Stoneform's top-pivot quirk).
4. **`ScriptedAttackRunner`** for non-clip-driven attacks
   (introduced for Cravel pounce, reused by Crocodile + Stoneform).
5. **Pack-stagger `ActiveAttackerSlot`** on `EnemyManager`
   (introduced for Sleeve).
6. **`EnemyArmor` weak-spot/crack module** (introduced for Stoneform).
7. **Directional hit-react picker** — `pickDirectionalClip(angle,
   light/heavy)` — introduced for Bear.
8. **Mirror-attack helper** — flips `model.scale.x = -1` for an
   action's duration without breaking shadows; introduced for Bear.
9. **`WaterRegion` subsystem** + `clampToShoreline` — required for
   Crocodile (§II.3), gates that enemy until it lands.
10. **Material wrapper pattern** (§I.1) — reuse for every enemy.

### I.7 Bestiary registration

Every enemy adds an entry to `src/data/bestiary.ts` AND a row to
`docs/inventory/creatures.csv` (the asset registry). Family-grouped
variants (Sleeve + Stoneform Sleeve) share one bestiary entry with
sub-rows.

---

## Part II — Per-enemy plans

Each enemy below uses the same nine-line micro-structure: license,
asset audit, scale/orientation, colliders, animation graph,
AI behaviors, pathfinding, combat data block, and quick reference
card. Anything not called out follows the conventions in Part I.

> Enemies are listed in tier order: Sleeve (T2), Cravel (T2),
> Crocodile (T3), Stoneform (T3), Bear (T4).

---

### II.1 Sleeve — biped brute, horror swarm (tier 2)

**License — clean ✅** *Monster* by Jody3981 (Sketchfab),
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
[link](https://sketchfab.com/3d-models/monster-1097d80c4dc34f4499beb42c3d80928b).
Add `CREDITS.md` line: "*Sleeve* model — *Monster* by Jody3981
(Sketchfab), CC-BY-4.0."

#### II.1.1 Asset audit

`attached_assets/monster_1777416055663.glb` — 7.5 MB, 1 mesh, 3,605
verts, 1 skin / 69 humanoid bones, 1 PBR material with 3 textures.
**1 clip** — `CINEMA_4D_Main` (17.33 s, 114 channels). Bbox
(C4D cm): X 256 · Y 296 · Z 138.

Hierarchy is clean: `_rootJoint → hips_01 → spine_012 → chest_013
→ neck_061 → head_062 → jaw_065`, plus L/R shoulder→arm→elbow→wrist
chains and 5 fingers per hand (index uses `Joint_3*` naming — not
`index1/2/3`). `jaw_065` is rigged separately, drives snarl/grin
windups.

**The animation problem:** 114 channels (≈ a third of full
keyframing) suggests either (A) a multi-segment demo reel sliced via
`AnimationUtils.subclip` or (B) breathing-only idle that needs
Mixamo retarget for everything else. v1 plan **assumes (B)** and
budgets a Mixamo retarget pipeline; if (A) yields usable segments at
inspection, slot them in for free.

#### II.1.2 Scale / orientation

C4D centimetres → target world height ~2.4 m → **`scale: 0.008`**.
`yOffset: 0`, pivot at feet, `forwardAxis: '+z'` (verify visually).

#### II.1.3 Colliders

Vertical biped capsule: `r 0.55 × L 1.8`, offset `(0, 1.0, 0)`.
YUKA `boundingRadius = 0.6`. Treated as "large humanoid" — existing
combat code handles it without new logic.

Per-bone hitboxes:

| Bone | Tag | Crit |
|---|---|---|
| `head_062` | `head` | ×2.0 |
| `jaw_065` (open) | `head` (open) | **×3.0** during grin window |
| `chest_013` | `torso_top` | ×1.0 |
| `spine_012` | `torso_mid` | ×1.0 |
| `hips_01` | `torso_bot` | ×1.0 |
| L/R `arm` | `limb` | ×0.6 |
| L/R `leg` | `limb` | ×0.6 |

The grin-wider jaw window (~0.4 s before bite) shifts head crit
×2.0 → ×3.0 — deliberate punish opportunity.

Active attack hitboxes:

| Move | Anchor | Shape | Window | Tag |
|---|---|---|---|---|
| Claw L | `L_wrist_017` | capsule r 0.30 × L 0.7 | 0.30–0.50 | `claw` |
| Claw R | `R_wrist` | capsule r 0.30 × L 0.7 | 0.55–0.75 | `claw` |
| Bite lunge | `jaw_065` | sphere r 0.35 sweep | 0.40–0.65 | `bite` |
| Stomp | `R_foot_010` | cylinder r 0.45 × h 0.2 | 0.40–0.55 | `blunt` (AOE) |

#### II.1.4 Animation graph

Standard archetype (§I.3) with: `idle_grin` ambient (random every
8–14 s), `alert` 1.5 s grin telegraph (no commit yet — player can
back off), `walk` at 0.85× speed for uncanny shamble, head-track
toward player during IDLE/ALERT/PURSUE.

Mixamo source map: idle=Idle, walk="Zombie walk", run="Zombie run",
claw="Zombie attack" or "Bear swipe", bite="Standing biting torso",
stomp="Jumping down", hit reactions = "Hit reaction" / "Hit
reaction 2", death = "Falling back death", turn90L/R = "Turn 90
degree". All Mixamo clips are CC0.

#### II.1.5 AI

`biped_brute`. Aggro at 14 m. PURSUE_WALK ≤ 6 m at 1.7 m/s,
PURSUE_RUN > 6 m at 5.5 m/s. COMBAT picks: claw (70%), bite (20%
when player guard up in last 0.5 s), stomp (10% when 2+ Sleeves
adjacent — AOE, friendly-fire-safe). **Never flees.** Pack-stagger
active when ≥ 2 in 12 m bubble (§I.4).

#### II.1.6 Pathfinding

YUKA biped: `maxSpeed 5.5`, `maxForce 22`, `mass 2`, `boundingRadius
0.6`. Low-priority `ObstacleAvoidanceBehavior` (panic-chase bonks
into things). Small `SeparationBehavior` (weight 0.4) so packs
spread instead of stacking.

#### II.1.7 Combat data (`SleeveDef.ts`)

```ts
export const SLEEVE: EnemyArchetype = {
  key: 'sleeve', archetype: 'biped_brute',
  modelPath: '/models/enemies/sleeve/sleeve.glb',
  animsPath: '/models/enemies/sleeve/sleeve-anims.glb',
  scale: 0.008, yOffset: 0, forwardAxis: '+z',
  maxHealth: 180, damageMultiplier: 1.0, expReward: 60, tier: 2,
  walkSpeed: 1.7, runSpeed: 5.5, turnRate: 4.0, bigTurnThreshold: 1.57,
  alertRange: 14, alertHoldTime: 1.5, engageRange: 1.6,
  fleeHpRatio: 0.0, poiseMax: 80, poiseRegenPerSec: 25,
  capsule: { axis: 'y', radius: 0.55, length: 1.8, offset: [0, 1.0, 0] },
  hitboxes: [/* see §II.1.3 */],
  moves: {
    claw: { clip: 'sleeve_claw_combo', dur: 0.95, cd: 1.4,
      windows: [
        { start: 0.30, end: 0.50, dmg: 28, kb: 5, poise: 30,
          anchor: 'L_wrist_017', shape: 'capsule', radius: 0.30, length: 0.7, tag: 'claw' },
        { start: 0.55, end: 0.75, dmg: 28, kb: 5, poise: 30,
          anchor: 'R_wrist', shape: 'capsule', radius: 0.30, length: 0.7, tag: 'claw' },
      ] },
    bite: { clip: 'sleeve_bite', dur: 0.85, cd: 3.0,
      windows: [{ start: 0.40, end: 0.65, dmg: 42, kb: 4, poise: 50,
        anchor: 'jaw_065', shape: 'sphere', radius: 0.35, tag: 'bite' }],
      conditions: { playerBlockingWithin: 0.5 } },
    stomp: { clip: 'sleeve_stomp', dur: 0.80, cd: 5.0,
      windows: [{ start: 0.40, end: 0.55, dmg: 22, kb: 8, poise: 40,
        anchor: 'R_foot_010', shape: 'cylinder', radius: 0.45, height: 0.2,
        tag: 'blunt', aoe: true }],
      conditions: { otherSleevesAdjacent: 2 } },
  },
  anims: {
    idle: 'sleeve_idle', idleAmbient: ['sleeve_idle_grin'],
    alert: 'sleeve_alert', walk: 'sleeve_walk', run: 'sleeve_run',
    turn90Lft: 'sleeve_turn_L', turn90Rgt: 'sleeve_turn_R',
    hit: { light: 'sleeve_hit_light', heavy: 'sleeve_hit_heavy' },
    death: ['sleeve_death'],
  },
  lootTableId: 'tier2-flesh',
};
```

#### II.1.8 Quick ref

```
Sleeve · tier 2 · biped brute / horror swarm
HP 180  ·  Walk 1.7 / Run 5.5 m/s  ·  scale 0.008  ·  ~2.4 m
Crit: head ×2.0 · open jaw ×3.0 (windup window)
Moves: Claw 1-2 (28d × 2) · Bite 42d · Stomp 22d AOE
Telegraph: 1.5 s grin alert · Pack-stagger when ≥2 in range
Anims: 1 mystery clip → Mixamo retarget · LICENSE: CC-BY-4.0 ✅
```

#### II.1.9 Follow-ups (out of v1)

Eye-socket emissive accent (true black + soft red rim glow), grin
breath VFX (jaw-bone particle puff every 1.2 s), Pale/Bloated/
Withered recolor variants, jumpscare reveal (first sight plays
`idle_grin` at full speed + audio sting + screen shake), "burst"
death (ragdoll + viscera, gore-setting gated).

---

### II.2 Cravel — quadruped pack hunter (tier 2)

**License — clean ✅** *Cravel* (Quaternius animal pack, CC0). No
attribution required; credits line is a courtesy.

> The original Cravel doc covered the pack-hunter archetype and
> introduced the **GLB loader extension**, **auto `footOffsetY`**,
> and **`ScriptedAttackRunner`** that the rest of the enemies reuse
> (§I.6). Cross-references in other enemy plans like "see Cravel
> plan §X" all map to sections of Part I now.

#### II.2.1 Asset audit (summary)

Mid-poly quadruped, single skin, ~30 bones (typical Quaternius
mammal rig). Ships a usable clip set (idle, walk, run, attack, hit,
death) — the project's **first enemy with full motion out of the
box**. No slicing required.

#### II.2.2 Scale / orientation

`scale: 1.0`, `yOffset: 0`, `forwardAxis: '-z'`. Pivot at feet.
Auto `footOffsetY` introduced here.

#### II.2.3 Colliders

Quad capsule: `r 0.40 × L 1.2` along Z, offset `(0, 0.5, 0)`. YUKA
`boundingRadius = 0.5`. Per-bone hitboxes: head ×1.6, neck ×1.2,
torso ×1.0, hindquarters ×0.9, limbs ×0.6.

#### II.2.4 Animation graph

Standard archetype, all states map to shipped clips. Pounce uses
the **`ScriptedAttackRunner`** introduced here — root translation
+ a slight crouch lerp on the spine, no rig modification.

#### II.2.5 AI

`quad_pack`. Wanders → STALK on aggro → PURSUE → POUNCE (script) →
COMBAT (claw + bite) → RETREAT on miss. **Flees at 30% HP** (the
only enemy with a non-zero `fleeHpRatio` so far). When ≥ 2 Cravels
exist in a 14 m bubble, they coordinate flank approach (precursor to
the Sleeve pack-stagger system).

#### II.2.6 Pathfinding

YUKA quad: `maxSpeed 6.0`, `maxForce 25`, `mass 2`,
`boundingRadius 0.5`. Standard `WanderBehavior` + `PursuitBehavior`
+ `FleeBehavior`. Exercises `GroundSampler.sampleHeight` per frame
on slopes.

#### II.2.7 Combat data (`CravelDef.ts`)

```ts
export const CRAVEL: EnemyArchetype = {
  key: 'cravel', archetype: 'quad_pack',
  modelPath: '/models/enemies/cravel/cravel.glb',
  scale: 1.0, yOffset: 0, forwardAxis: '-z',
  maxHealth: 140, damageMultiplier: 1.0, expReward: 50, tier: 2,
  walkSpeed: 2.2, runSpeed: 6.0, turnRate: 4.5,
  alertRange: 16, engageRange: 2.0, fleeHpRatio: 0.30,
  poiseMax: 60, poiseRegenPerSec: 30,
  capsule: { axis: 'z', radius: 0.40, length: 1.2, offset: [0, 0.5, 0] },
  hitboxes: [/* see §II.2.3 */],
  moves: {
    pounce: { script: 'pounce', dur: 0.75, cd: 6.0,
      windows: [{ start: 0.20, end: 0.55, dmg: 35, kb: 6, poise: 40,
        anchor: 'jaw', shape: 'sphere', radius: 0.4, tag: 'bite' }] },
    claw: { clip: 'cravel_attack', dur: 0.70, cd: 1.6,
      windows: [{ start: 0.20, end: 0.45, dmg: 22, kb: 4, poise: 25,
        anchor: 'fr_paw', shape: 'capsule', radius: 0.20, length: 0.4, tag: 'claw' }] },
  },
  anims: {
    idle: 'cravel_idle', walk: 'cravel_walk', run: 'cravel_run',
    hit: { light: 'cravel_hit', heavy: 'cravel_hit' },
    death: ['cravel_death'],
  },
  lootTableId: 'tier2-mammal',
};
```

#### II.2.8 Quick ref

```
Cravel · tier 2 · quad pack hunter
HP 140  ·  Walk 2.2 / Run 6.0 m/s  ·  scale 1.0
Body capsule: quad r 0.40 × L 1.2
Moves: Pounce 35d (bite, scripted) · Claw 22d
Telegraph: low — short crouch before pounce
HP-flee at 30% · Pack flank coordination when ≥2 in range
Anims: full clip set ✅ · LICENSE: CC0 ✅
```

#### II.2.9 Follow-ups

Pack-howl ambient one-shot, gore variants, juvenile/alpha scale
variation, den system.

---

### II.3 Crocodile — water ambush predator (tier 3)

> **⚠️ License — CC-BY-NC-ND-4.0 (placeholder only).** *Nile
> Crocodile Swimming* by Monster (Sketchfab),
> [link](https://sketchfab.com/3d-models/nile-crocodile-swimming-8bdc3a1551fb4d9d9a58e56b9385bd22).
> NC = no commercial use; ND = no derivatives (no rescale, no rig
> changes, no remerging). **In-engine display as-is is the safest
> read.** Replace before any release with a CC0 / CC-BY /
> commissioned crocodile (Quaternius animal pack, KayKit, or
> Mixamo). The design here is portable to any croc model — only
> file paths change.

#### II.3.1 Asset audit

`attached_assets/nile_crocodile_swimming_1777413055087.glb` —
17.1 MB (largest enemy), 17 meshes (1 body + teethUpper + teethLower
+ 2 eyes + 12 nail meshes), 32 skins (main rig 79 bones, others are
tiny per-nail rigs), 10,656 verts on body, 1 Maya **Blinn** material
(non-PBR), 3 embedded textures. **1 clip** — `Swim` (5.00 s, 632
channels). Bbox: X 2.76 · Y 1.30 · Z 10.15 (real-world ~10 m).

Skeleton highlights: Maya namespacing (`crocodile_v01:`), 7-segment
tail (`Tail0..Tail6`), 4 legs × 4 toe-chains × 3-4 phalanges
(very high detail), separate eye/eyelid bones (4 lid + 2 eyeballs),
**fat-roll bones** for jiggle (`neckFat*`, `fatSide1/2/3`,
`fatMid1/2`). The 12 nail submeshes ride per-nail sub-rigs — cannot
remerge under ND, just `frustumCulled = true` and accept the
overhead.

**The animation problem:** `Swim` is the only clip — continuous
4-leg paddling, *not* the alternating gait used on land. No walk,
run, bite, lunge, death, hit, idle, or turn clips. ND blocks
authoring new ones. Two ethical paths:

- **A — Water-only ambush enemy** (recommended, this plan ships A):
  croc *only* appears in water, where `Swim` is the correct gait.
  Attacks become "lunge from underwater" via script + bite VFX.
  Death = `Swim` paused at 0×, root rotated belly-up. No bone edits.
- **B — Replace the model** (only path to a shippable game).

#### II.3.2 Scale / orientation

Already real-world Nile-croc scale → **`scale: 1.0`** (no rescale,
ND-safe). `yOffset: 0` (auto `footOffsetY` plants belly).
`forwardAxis: '-z'` (head at min Z, matches Three.js convention).

Material upgrade: cannot swap (ND); tweak the existing material at
load time only — `envMapIntensity 0.4`, `roughness 0.85`,
`metalness 0`. If runtime material isn't `MeshStandardMaterial`,
fall back to `envMap` + `lightMapIntensity` adjustments.

**Water clamp:** body Y clamped to `waterLevel - 0.1` (just
submerged, dorsal ridge visible); briefly emerges to
`waterLevel + 0.4` during ambush. v1 stub: designer-placed circular
"water zone" (radius + center). v2: read from `WaterRegion`
subsystem once it lands.

#### II.3.3 Colliders

**Two-capsule torso + tail rig** (single capsule fits poorly):

| Capsule | Axis | Radius | Length | Offset |
|---|---|---|---|---|
| Torso | Z | 0.55 | 2.4 | (0, 0.4, -0.6) |
| Tail | Z, tilt -10° | 0.30 | 3.6 | (0, 0.35, 2.2) |

**Armoured top, soft underside.** Dorsal hits (incoming dot vs `+Y`
> 0.3) get **×0.4**; ventral hits on `torso_*` get **×1.5**. This
is what makes crocs feel right.

Per-bone hitboxes (selected): `Head_059` ×1.6, `Jaw_060` ×2.5
(open-mouth window), `Chest_032` ×1.0, `Tail0..3` ×0.8, `Tail4..6`
×0.4, hip bones ×0.6.

Active attack hitboxes (all script-driven, see §II.3.4):

| Move | Anchor | Shape | Window | Tag |
|---|---|---|---|---|
| Lunge bite | `Jaw_060` | sphere r 0.5 sweep | 0.20–0.55 of LUNGE | `bite` |
| Tail swat | `Tail3_027` | capsule r 0.4 × L 1.5 | 0.40–0.80 of TAIL | `blunt` |
| Death roll | `Jaw_060` (held on player) | sphere r 0.4 DoT | 1.5 s after grab | `bleed` |

#### II.3.4 Animation graph

**Single mixer clip + script-driven everything else.** `Swim` plays
underneath at per-state `mixer.timeScale`: IDLE 0.4×, STALK 0.7×,
PURSUIT 1.4×, LUNGE 1.0× (mostly hidden by script), TAIL 1.6×,
ROLL 1.0× (root twist dominates), DEATH 0.0× (paused).

Lunge: lerp root forward 1.4 m over 0.55 s, lerp `Jaw_060` rotation
0 → 0.9 rad over 0.20 s, hold 0.15 s, close 0.20 s. Tail: lerp root
yaw ±0.6 rad over 0.6 s; tail bones rely on `Swim` at 1.5×.

This is **not** a derivative — `Swim` is unmodified; we pose-blend
root transforms in script, which ND does not restrict.

Death: pause mixer, lerp root rotation belly-up over 1.5 s, sink
Y -= 0.6 m over another 1.5 s, despawn. No bone edits. Hit-react:
`mixer.timeScale = 0` for 0.1 s freeze-frame + emissive red flash;
no visible flinch.

#### II.3.5 AI

`water_ambush`. States: IDLE (drift, figure-8) → STALK (player in
WaterRegion OR within 6 m of edge) → SURFACE (1.0 s telegraph,
audio hiss) → LUNGE (script, 0.55 s) → on hit: ROLL (lock to
player, ±2.5 rad twice over 1.5 s, bleed DoT, mash-to-break QTE
gated by `player.strength`); on miss: TAIL or RETREAT (3 s away
then back to STALK; never fully flees — apex). DEATH terminal.

Counter-play: SURFACE always 1.0 s telegraph (audio + ripple);
underbelly ×1.5 visible only during ROLL or LUNGE-airtime; mash-
break tied to Strength stat.

#### II.3.6 Pathfinding

YUKA: `maxSpeed 4.5` (water), `maxForce 18`, `mass 4`,
`boundingRadius 1.4` (largest so far). **Custom region clamp**
each frame — project vehicle position onto nearest WaterRegion
polygon (~10 lines, not a new behavior class). No land traversal.

#### II.3.7 Combat data (`CrocodileDef.ts`)

```ts
export const CROCODILE: EnemyArchetype = {
  key: 'crocodile', archetype: 'water_ambush',
  modelPath: '/models/enemies/crocodile/crocodile.glb',
  scale: 1.0, yOffset: 0, forwardAxis: '-z',
  maxHealth: 320, damageMultiplier: 1.0, expReward: 90, tier: 3,
  swimSpeed: 4.5, turnRate: 2.5,
  alertRange: 18, engageRange: 4.0, fleeHpRatio: 0.0,
  /* surfaceTelegraph: 1.0, landAlertRange: 6.0, lungeSpeed: 11.0 */
  body: {
    capsules: [
      { axis: 'z', radius: 0.55, length: 2.4, offset: [0, 0.4, -0.6] },
      { axis: 'z', radius: 0.30, length: 3.6, offset: [0, 0.35, 2.2], tiltDegrees: -10 },
    ],
    armoured: { up: 0.4, down: 1.5 },
  },
  hitboxes: [/* see §II.3.3 */],
  moves: {
    lunge: { script: 'lunge', dur: 0.55, cd: 5.0,
      windows: [{ start: 0.20, end: 0.55, dmg: 55, kb: 4, poise: 80,
        anchor: 'crocodile_v01:Jaw_060', shape: 'sphere', radius: 0.5, tag: 'bite' }] },
    tail: { script: 'tail', dur: 0.80, cd: 4.0,
      windows: [{ start: 0.40, end: 0.80, dmg: 30, kb: 12, poise: 60,
        anchor: 'crocodile_v01:Tail3_027', shape: 'capsule', radius: 0.4, length: 1.5, tag: 'blunt' }] },
    roll: { script: 'roll', dur: 1.50, cd: 0,
      windows: [{ start: 0.0, end: 1.5, dmg: 12, dmgInterval: 0.25, kb: 0, poise: 0,
        anchor: 'crocodile_v01:Jaw_060', shape: 'sphere', radius: 0.4, tag: 'bleed', grab: true }],
      breakChecks: { stat: 'strength', threshold: 80, perPress: 12 } },
  },
  anims: { idle: 'Swim', move: 'Swim', death: null, hit: null },
  requires: { region: 'water' },
  lootTableId: 'tier3-reptile',
};
```

#### II.3.8 Quick ref

```
Crocodile · tier 3 · water ambush
HP 320  ·  Swim 4.5 / Lunge 11 m/s  ·  scale 1.0 (~10 m real-world)
Body: two capsules (torso + tail), dorsal ×0.4, belly ×1.5
Crit: head ×1.6, open jaw ×2.5
Moves: Lunge 55d bite · Tail 30d blunt · Death-Roll 12d/tick bleed grab
Telegraph: 1.0 s surface breach before lunge
Region: water-only · HP-flee: never
Anims: 1 clip (Swim); death/hit/attacks all script-driven
LICENSE: CC-BY-NC-ND ⚠️ — placeholder, NOT for release
```

#### II.3.9 Follow-ups

Replace model (only release path); land traversal once non-ND model
available; pack hunt of 2-3 crocs surrounding a player; underwater
POV tint when grabbed.

---

### II.4 Stoneform Sleeve — biped tank, armored anchor (tier 3)

**License — clean ✅** *Rock Monster* by elarix (Sketchfab),
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
[link](https://sketchfab.com/3d-models/rock-monster-e8c6a0ce29e142078d63f8871b943953).
Add `CREDITS.md` line: "*Stoneform Sleeve* model — *Rock Monster*
by elarix (Sketchfab), CC-BY-4.0."

> Family-grouped with Sleeve (II.1). Lore framing: a Sleeve that
> survived long enough to calcify — same wide-shouldered hunched
> long-armed silhouette so players read both as "Sleeve danger"
> instantly. Tankier, slower, damage-resistant.

#### II.4.1 Asset audit

`attached_assets/rock_monster_1777416040361.glb` — 4.78 MB
(smallest enemy in project), 1 mesh, 3,054 verts (low-poly chunky),
1 skin / 71 bones (3DS Max **Biped** rig — universally retargetable),
1 PBR material (2 textures: color + normal). **5 clips ✅** all
named: `idle` 1.33 s · `walk` 5.33 s · `jump` 8.67 s · `attack`
11.33 s · `Death` 15.33 s. Bbox: X 30 · Y 36 · Z 13.

**No `jaw` bone** — face is a single solid mesh; no expressions at
runtime. Standard 3DS Max Biped naming (`Bip001 Pelvis`,
`Bip001 Spine`, `Bip001 R UpperArm`, `Bip001 L Toe0`, etc.) — most
common rigged-character format on the internet.

The `jump` and `attack` clips are unusually long (8.67 s and 11.33 s)
because they're **multi-segment timelines** in a single source clip
(common 3DS Max workflow). Slice via `THREE.AnimationUtils.subclip()`
into ~9 effective sub-clips (§II.4.4).

Visual character (from concept image): chunky low-poly stone golem,
sandstone/tan, carved abstract face (no eyes / no mouth opening),
hunched ape-like stance with very long arms reaching toward knees,
**asymmetric shoulders** (left smaller, right larger) — silhouette
asymmetry drives the weak-spot hook (§II.4.3). **Cloth sash** over
left shoulder to right hip (the only soft element).

#### II.4.2 Scale / orientation

**Pivot quirk:** `bbox.min.y = -35.97`, `bbox.max.y = 0` — pivot at
**top of head**, model extends downward. Use the auto `footOffsetY`
(it already handles Cravel's quirky pivot — same code path).

Target world height ~2.6 m → **`scale: 0.072`**. `forwardAxis: '+z'`
(verify; 3DS Max Biped rigs face +Y in Max but glTF conversion
usually rotates).

Material: high roughness for matte stone — `envMapIntensity 0.5`,
`roughness 0.92`, `metalness 0`. Cloth sash = part of the same mesh,
no separate cloth-sim practical; ship as-is, post-v1 wind-jiggle via
shader noise on the sash vertex group.

#### II.4.3 Colliders

Vertical biped, bulkier than Sleeve: `r 0.70 × L 1.9`, offset
`(0, 1.1, 0)`. YUKA `boundingRadius = 0.8`.

Per-bone hitboxes (note inverted multipliers — most bones are
**armored** rather than crit-multiplied):

| Bone | Tag | Mult |
|---|---|---|
| `Head_07` | `head` (stone) | **×0.6** armored |
| `Spine2_05` (chest) | `chest` (stone) | **×0.4** heavily armored |
| `Spine_03` | `torso_mid` | ×0.5 |
| `Pelvis_02` | `torso_bot` | ×0.5 |
| **`L UpperArm_010`** (small shoulder) | **`weak_spot_L`** | **×2.0** ★ |
| `R UpperArm_034` (large shoulder) | `armored_arm` | ×0.4 |
| L/R `Forearm` | `limb` | ×0.7 |
| L/R `Calf` | `limb` | ×0.7 |

**The smaller left shoulder is the weak spot.** Hit it 3 times in a
row OR cumulative 150 dmg → CRACK state: spawn crackle decal + tint
the bone group black via per-bone material modulation, **chest
multiplier shifts ×0.4 → ×1.2**, head ×0.6 → ×1.5 for the rest of
the fight. Players who don't read the silhouette burn forever
hitting the chest; players who do, kill it cleanly.

Active attack hitboxes:

| Move | Anchor | Shape | Window | Tag |
|---|---|---|---|---|
| Boulder hammer (1) | `R Hand_036` | sphere r 0.50 sweep | 0.25–0.50 | `blunt` |
| Boulder hammer (2) | `L Hand_012` | sphere r 0.50 | 0.55–0.80 | `blunt` |
| Slam landing | `Pelvis_02` | sphere r 1.4 radial AOE | 0.05 s at impact frame | `blunt` (AOE) |

#### II.4.4 Animation graph (with sub-clip slicing plan)

The 5 shipped clips slice into ~9 effective sub-clips. Names below
are tentative, locked in at integration via frame-by-frame inspection.

| Source clip | Sub-clips |
|---|---|
| `idle` (1.33 s) | `idle_loop` (full, looped) |
| `walk` (5.33 s) | `walk_loop` (one cycle ~1.33 s, looped — dodge start/end ramp) |
| `jump` (8.67 s) | `jump_windup` 0–1.5 · `jump_launch` 1.5–3.5 · `jump_air` 3.5–5.0 (loop) · `jump_land` 5.0–6.5 · `jump_recover` 6.5–8.7 |
| `attack` (11.33 s) | `attack_windup` 0–1.0 · `attack_strike1` 1.0–2.5 · `attack_strike2` 2.5–4.0 · `attack_recover` 4.0–6.0 |
| `Death` (15.33 s) | `death_main` 0–4.0 · `death_settle` 4.0–8.0 (clamps frozen) |

**No turn-in-place clips** ship — just lerp model rotation at 1.5
rad/s during PURSUE. On a heavy slow creature, the lack of leg
shuffle reads as "powerful pivot".

#### II.4.5 AI

`biped_tank`. ALERT = silent 0.7 s head-turn telegraph (no grin,
no vocal — silent menace). PURSUE_WALK at 1.4 m/s only — never
runs. COMBAT picks: hammer 1-2 (70%), slam-jump (25%, used at 4-7 m
as a closing tool), shove (5%, point-blank counter to player block).

**Damage model:** uncracked → most hits chip at ~30% effectiveness;
cracked → ~3× more vulnerable. Whole fight hinges on solving the
silhouette puzzle.

**HIT_REACT** = NONE while uncracked (light hits don't flinch);
heavy hits (poise damage > 50) trigger `hit_heavy`. After CRACK,
light hits register normally.

**Pairs with Sleeve packs as the "anchor".** Stoneform never enters
the pack-stagger system — it always swings on its own cooldown,
constant pressure source while Sleeves take turns. This creates the
intended "swarm + anchor" encounter shape.

No flee, no rage. Constant at 100% HP and 1% HP — its gimmick is
the crack state, not a low-HP buff.

#### II.4.6 Pathfinding

YUKA very heavy: `maxSpeed 1.4`, `maxForce 40` (high inertia),
`mass 8`, `boundingRadius 0.8`. Low-priority avoidance — plows
through small props (future destructible-prop pass: literally
crushes them).

**Slam-jump** = ballistic script-driven motion (same pattern as
Cravel pounce / Crocodile lunge): YUKA off for clip duration,
parabolic arc to player's XZ + 0.4 s velocity prediction, YUKA on
at landing.

#### II.4.7 Combat data (`StoneformDef.ts`)

```ts
export const STONEFORM: EnemyArchetype = {
  key: 'stoneform', archetype: 'biped_tank', family: 'sleeve',
  modelPath: '/models/enemies/stoneform/stoneform.glb',
  scale: 0.072, yOffset: 0, forwardAxis: '+z',
  maxHealth: 420, damageMultiplier: 1.0, expReward: 110, tier: 3,
  walkSpeed: 1.4, runSpeed: 1.4, turnRate: 1.5, bigTurnThreshold: Infinity,
  alertRange: 16, alertHoldTime: 0.7, engageRange: 2.0, fleeHpRatio: 0.0,
  poiseMax: 200, poiseRegenPerSec: 50, staggerPoiseThreshold: 50,
  capsule: { axis: 'y', radius: 0.70, length: 1.9, offset: [0, 1.1, 0] },
  armor: {
    default: 0.4,
    weakSpotBone: 'Bip001 L UpperArm_010',
    crackThresholdHits: 3, crackThresholdDamage: 150,
    crackedMultipliers: { chest: 1.2, head: 1.5 },
  },
  hitboxes: [/* see §II.4.3 */],
  moves: {
    hammer: { clip: 'attack_strike1', followupClip: 'attack_strike2',
      dur: 1.40, cd: 2.5,
      windows: [
        { start: 0.25, end: 0.50, dmg: 55, kb: 10, poise: 80,
          anchor: 'Bip001 R Hand_036', shape: 'sphere', radius: 0.50, tag: 'blunt' },
        { start: 0.55, end: 0.80, dmg: 55, kb: 10, poise: 80,
          anchor: 'Bip001 L Hand_012', shape: 'sphere', radius: 0.50, tag: 'blunt' },
      ] },
    slamJump: { script: 'ballistic_pursuit',
      clipChain: ['jump_windup', 'jump_launch', 'jump_air', 'jump_land', 'jump_recover'],
      dur: 4.5, cd: 8.0,
      windows: [{ start: 3.45, end: 3.50, dmg: 70, kb: 18, poise: 120,
        anchor: 'Bip001 Pelvis_02', shape: 'sphere', radius: 1.4, tag: 'blunt', aoe: true }],
      conditions: { distance: [4, 7] } },
    shove: { clip: 'attack_strike1', timeScale: 1.3, dur: 0.85, cd: 4.0,
      windows: [{ start: 0.30, end: 0.55, dmg: 25, kb: 25, poise: 60,
        anchor: 'Bip001 R Hand_036', shape: 'sphere', radius: 0.45, tag: 'blunt' }],
      conditions: { playerBlockingWithin: 0.5 } },
  },
  anims: {
    idle: 'idle_loop', walk: 'walk_loop', run: 'walk_loop',
    hit: { light: null, heavy: 'jump_recover' },
    death: ['death_main'], crack: 'jump_recover',
  },
  lootTableId: 'tier3-stone',
};
```

#### II.4.8 Quick ref

```
Stoneform Sleeve · tier 3 · biped tank / armored
HP 420  ·  Walk 1.4 m/s  ·  scale 0.072  ·  ~2.6 m
Damage model: uncracked chest ×0.4, head ×0.6, weak L-shoulder ×2.0
              cracked → chest ×1.2, head ×1.5 (after 3 hits or 150 dmg)
Moves: Hammer 1-2 (55d × 2) · Slam-jump 70d AOE · Shove 25d (block-counter)
Telegraph: 0.7 s silent head-turn · long swing windups
HP-flee: never · Pairs with Sleeve packs as anchor
Anims: 5 source → ~9 sliced sub-clips · LICENSE: CC-BY-4.0 ✅
```

#### II.4.9 Follow-ups

Cloth-sash wind-jiggle, sandstone variant (texture swap), cracked-
state crumble VFX (rocky-chunk shatter on death), 2× scale mini-
boss with shockwave move, "awakening" intro (uncurls from rock pile,
re-uses death clip in reverse).

---

### II.5 Bear — heavy melee apex (tier 4)

> **⚠️ License — CC-BY-NC (ripped IP).** Fixture only; **NOT for
> release.** Replace before any commercial / monetized build with a
> properly-licensed bear. The integration is wired so swapping the
> model is a one-line change in `BearDef.modelPath`; if the
> replacement rig has the same bone names it Just Works, otherwise
> a small remap table.

#### II.5.1 Asset audit

Big rig: full Three.js GLB, large-mammal skeleton with directional
hit/death + 5-way jumps + turn-in-place clips. **81 clips ✅** —
the most motion-rich enemy in the project. Includes idle (multiple
ambient variants), walk, canter, run, charge, maul 1-2 (combo
swipe), body slam, jump-cut dodges (5 directions), turn-in-place
left/right, alert-bark telegraph, hit reactions front/back/lft/rgt
(light + heavy), and 4 directional death clips
(`bear_dead_reaction_lft_01/02`, `_rgt_01/02`).

#### II.5.2 Scale / orientation

`scale: 1.0` (real-world bear), `yOffset: 0`, `forwardAxis: '+z'`
(verify) — this enemy is what introduced the `forwardAxis` field
in `EnemyArchetype` (§I.6).

#### II.5.3 Colliders

Quadruped capsule: `r 0.45 × L 1.4`, extends to biped on
stand-oneoff clips. Per-bone hitboxes: head ×2.0, chest during
bark/stand window ×2.5 (deliberate punish opportunity), torso ×1.0,
limbs ×0.6.

Active attack hitboxes:

| Move | Anchor | Shape | Window | Tag |
|---|---|---|---|---|
| Maul swipe (1) | `L_paw` | sphere r 0.40 sweep | 0.30–0.55 of maul | `claw` |
| Maul swipe (2) | `R_paw` | sphere r 0.40 sweep | 0.55–0.80 of maul | `claw` |
| Body slam | `chest` | sphere r 0.60 | 0.40–0.55 of slam | `blunt` |

#### II.5.4 Animation graph

Standard archetype, but enriched: directional hit-react picker
chooses `front/back/lft` (mirror lft → rgt via `model.scale.x = -1`
helper, restored on `finished` callback). Bank additive overlays on
walk/run loops weighted by yawRate via `AnimationAction.setEffectiveWeight`
+ a separate additive action. Turn-in-place clips fire when YUKA's
heading delta exceeds `bigTurnThreshold` — vehicle freezes, one-shot
turn clip plays with manual yaw lerp (the helper introduced here is
generic and reused by any future enemy).

#### II.5.5 AI

`quad_heavy`. Solo apex. Telegraphed `alert_bark` (2.3 s) before
commit — **gives player a de-aggro window**. Charge / jump-cut
dodge AI reads `player.isDodging` and player velocity to pick a
jump clip. **Injured mode** at `hp < injuredHpRatio = 0.30`: swap
walk/run clip handles, +20% damage taken, -10% damage dealt.
**Never flees.**

#### II.5.6 Pathfinding

YUKA heavy mammal: `maxSpeed 7.5` (run), high `maxForce` for
explosive accel, `mass 6`, `boundingRadius 0.8`. Standard ground
sampling per frame.

#### II.5.7 Combat data (`BearDef.ts`)

```ts
export const BEAR: EnemyArchetype = {
  key: 'bear', archetype: 'quad_heavy',
  modelPath: '/models/enemies/bear/bear.glb',
  scale: 1.0, yOffset: 0, forwardAxis: '+z',
  maxHealth: 540, damageMultiplier: 1.0, expReward: 180, tier: 4,
  walkSpeed: 2.5, runSpeed: 7.5, /* canter 4.5 */
  turnRate: 3.0, bigTurnThreshold: 1.57,
  alertRange: 22, alertHoldTime: 2.3, engageRange: 2.4,
  fleeHpRatio: 0.0, /* injuredHpRatio: 0.30 */
  poiseMax: 150, poiseRegenPerSec: 35,
  capsule: { axis: 'z', radius: 0.45, length: 1.4, offset: [0, 0.6, 0] },
  hitboxes: [/* see §II.5.3 */],
  moves: {
    maul: { clip: 'bear_maul_01', followupClip: 'bear_maul_02',
      dur: 1.30, cd: 2.0,
      windows: [
        { start: 0.30, end: 0.55, dmg: 48, kb: 8, poise: 60,
          anchor: 'L_paw', shape: 'sphere', radius: 0.40, tag: 'claw' },
        { start: 0.55, end: 0.80, dmg: 48, kb: 8, poise: 60,
          anchor: 'R_paw', shape: 'sphere', radius: 0.40, tag: 'claw' },
      ] },
    slam: { clip: 'bear_body_slam', dur: 0.95, cd: 4.0,
      windows: [{ start: 0.40, end: 0.55, dmg: 36, kb: 14, poise: 90,
        anchor: 'chest', shape: 'sphere', radius: 0.60, tag: 'blunt' }] },
  },
  anims: {
    idle: 'bear_idle', walk: 'bear_walk', run: 'bear_run',
    alert: 'bear_alert_bark',
    turn90Lft: 'bear_turn_L', turn90Rgt: 'bear_turn_R',
    hit: { /* directional pick: front/back/lft → mirror for rgt */ },
    death: ['bear_dead_reaction_lft_01', 'bear_dead_reaction_lft_02',
            'bear_dead_reaction_rgt_01', 'bear_dead_reaction_rgt_02'],
  },
  lootTableId: 'tier4-mammal',
};
```

#### II.5.8 Quick ref

```
Bear · tier 4 · heavy melee
HP 540  ·  Walk 2.5 / Canter 4.5 / Run 7.5 m/s  ·  scale 1.0
Body capsule: quad r 0.45 × L 1.4 (extends to biped on stand-oneoffs)
Crit: head ×2.0 · chest during bark/stand ×2.5
Moves: Maul 1-2 (48d × 2) · Body slam 36d · Jump-cut dodge
Telegraph: 2.3 s alerted-bark (de-aggro window)
HP-flee: never · Injured mode at 30% (-10% dmg dealt, +20% taken)
Anims: 81 clips — full directional hit/death + 5-way jumps + turns
LICENSE: CC-BY-NC (ripped IP) ⚠️ — fixture only, NOT for release
```

#### II.5.9 Follow-ups

Replace model (non-negotiable for release); cub/mother dynamic
(permanent RUN_CHARGE when player near cub); climb/dig (no clips —
out of scope); den system; honey lure stealth path.

---

## Appendix A — License summary

| Enemy | License | Shippable? |
|---|---|---|
| Sleeve | CC-BY-4.0 | ✅ with attribution |
| Cravel | CC0 (Quaternius) | ✅ no attribution required |
| Stoneform Sleeve | CC-BY-4.0 | ✅ with attribution |
| Crocodile | CC-BY-NC-ND-4.0 | ⚠️ placeholder only |
| Bear | CC-BY-NC (ripped IP) | ⚠️ fixture only |

Two of the five current enemies (Crocodile, Bear) **must be
replaced** before any commercial / monetized release. All design
work is portable — only `modelPath` (and possibly a bone-name remap
table) changes.

## Appendix B — Reusable systems checklist

Cross-cutting systems introduced by these plans, in the order an
implementation backlog should tackle them:

- [ ] GLB loader extension in `AssetManager` (Cravel)
- [ ] Auto `footOffsetY` computation (Cravel)
- [ ] `forwardAxis` support in `EnemyArchetype` + spawn (Bear)
- [ ] `ScriptedAttackRunner` (Cravel pounce, Crocodile lunge,
      Stoneform slam-jump)
- [ ] Directional hit-react picker `pickDirectionalClip` (Bear)
- [ ] Mirror-attack helper `model.scale.x = -1` w/ shadow-safe
      restore (Bear)
- [ ] Pack-stagger `ActiveAttackerSlot` on `EnemyManager` (Sleeve)
- [ ] `EnemyArmor` weak-spot/crack module (Stoneform)
- [ ] `WaterRegion` subsystem + `clampToShoreline` (Crocodile)
- [ ] Material wrapper pattern (every enemy)
- [ ] `EnemyGrab` system (player-bone lock + mash QTE) (Crocodile)
- [ ] Mixamo retarget pipeline (`scripts/retarget-mixamo.ts`)
      (Sleeve)

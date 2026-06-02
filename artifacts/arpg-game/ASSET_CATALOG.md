# Grudge Nexus — Asset Catalog
*Last updated: May 3, 2026*

---

## Grudge Studio ObjectStore — Cross-Project Asset API
*The single source of truth for item, enemy, and skill definitions across all 35+ Grudge Studio repos (Grudge Nexus ARPG, GRUDA-Wars, GDevelop projects, Warlord Crafting Suite, Asset Studio).*

**Base URL:** `https://molochdagod.github.io/ObjectStore`
**Auth:** none — static JSON served from GitHub Pages.

---

### 🏷️ Slug Convention
URL-safe, lowercase, hyphenated identifiers. Stable across data updates — display names may change, slugs do not.

| Entity | Pattern | Example |
|--------|---------|---------|
| Weapon | `{category}/{item-id}` | `swords/bloodfeud-blade` |
| Weapon (tiered) | `{category}/{item-id}/t{tier}` | `swords/bloodfeud-blade/t5` |
| Material | `materials/{category}/{item-id}` | `materials/ore/iron-ore` |
| Armor | `armor/{material}/{item-id}` | `armor/metal/helm-iron-sentinel` |
| Consumable | `consumables/{category}/{item-id}` | `consumables/redFoods/grilled-steak` |
| Enemy | `enemies/{category}/{item-id}` | `enemies/beasts/dire-wolf` |
| Boss | `bosses/{boss-id}` | `bosses/malachar-the-undying` |

**Helper:** `toSlug(name)` — lowercases, replaces spaces and specials with hyphens.

---

### 🆔 GRUDGE UUID System
Deterministic, prefixed UUIDs for every persistent entity instance. Slugs identify *definitions*; UUIDs identify *instances*.

```
{PREFIX}-{TIMESTAMP}-{SEQUENCE}-{HASH}
```

| Prefix | Entity Type |
|--------|-------------|
| `ITEM` | weapon · armor · consumable |
| `MAT ` | crafting material |
| `HERO` | player hero |
| `MOB ` | enemy · boss |
| `SKIL` | ability · skill |
| `SPRT` | sprite · icon asset |
| `MISS` | mission · quest |

```ts
import { generateGrudgeUUID } from '@grudgstudio/core';
const uuid = generateGrudgeUUID('ITEM');
// → ITEM-20260306080000-000001-F3A9C2E7
```

> **Note:** The local `Attribute.uuid` field in `artifacts/api-server/src/stats/catalog.ts` already follows the `ATTR-{TIMESTAMP}-{SEQUENCE}-{HASH}` pattern and is wire-compatible with this scheme.

---

### 📦 ObjectStore API Endpoints

| Endpoint | Count | Slug Pattern |
|----------|-------|--------------|
| `/api/v1/weapons.json` | 119 weapons (17 categories × 6 items × 8 tiers) | `weapons/{category}/{item-id}` |
| `/api/v1/armor.json` | 150 armor items (cloth · leather · metal · gem) | `armor/{material}/{item-id}` |
| `/api/v1/materials.json` | 112 crafting materials (ore · wood · cloth · leather · gems) | `materials/{category}/{item-id}` |
| `/api/v1/consumables.json` | 132 consumables (foods · potions · engineer items) | `consumables/{category}/{item-id}` |
| `/api/v1/enemies.json` | 38 enemies across 8 tiers | `enemies/{category}/{item-id}` |
| `/api/v1/bosses.json` | 12 bosses with multi-phase mechanics | `bosses/{boss-id}` |
| `/api/v1/weaponSkills.json` | 473 weapon skills with icons + cooldowns | `skills/{weapon-type}/{skill-id}` |
| `/api/v1/sprites.json` | 500+ sprite paths by category | `sprites/{category}/{filename}` |
| `/api/v1/spriteMaps.json` | 246 sprite path mappings | `sprite-maps/{item-id}` |
| `/api/v1/skills.json` | 47 weapon skills (legacy format) | `skills/{skill-id}` |
| `/api/v1/races.json` | 6 playable races | `races/{race-id}` |
| `/api/v1/classes.json` | 4 classes with abilities | `classes/{class-id}` |
| `/api/v1/factions.json` | 3 factions with lore | `factions/{faction-id}` |
| `/api/v1/attributes.json` | 8 attributes with formulas | `attributes/{attr-id}` |
| `/api/v1/professions.json` | 11 professions, 363+ recipes | `professions/{profession-id}` |
| `/api/v1/effectSprites.json` | 147 VFX sprite sheets | `vfx/{effect-id}` |
| `/api/v1/abilityEffects.json` | 209 battle abilities with effect chains | `abilities/{ability-id}` |
| `/api/v1/factionUnits.json` | 19 RTS faction units | `units/{faction}/{unit-id}` |
| `/api/v1/ai.json` | AI behavior trees + entity states | `ai/{behavior-id}` |
| `/api/v1/terrain.json` | 5 procedural biome presets | `terrain/{biome-id}` |

---

### ⚡ Integration Snippets

**Browser / Vanilla JS**
```js
const BASE = 'https://molochdagod.github.io/ObjectStore';

const weapons = await fetch(`${BASE}/api/v1/weapons.json`).then(r => r.json());
const swords = weapons.categories.swords.items;

const iconUrl  = `${BASE}/icons/weapons/bloodfeud-blade.png`;        // named
const fallback = `${BASE}/icons/wcs/weapons/Sword_01.png`;           // pack fallback
```

**NPM / Node (via `@grudgstudio/core`)**
```ts
import { initGrudgeStudio } from '@grudgstudio/core';
const api = await initGrudgeStudio({ objectStoreUrl: 'https://molochdagod.github.io/ObjectStore' });

const results = await api.search('bloodfeud');
const item = api.createItem({ type: 'weapon', name: 'Bloodfeud Blade', tier: 5 });
console.log(item.uuid); // ITEM-2026...-...-...
console.log(item.slug); // swords/bloodfeud-blade/t5
```

**Unity (C#)**
```csharp
using GrudgeStudio;
var api = new GrudgeStudioAPI("https://molochdagod.github.io/ObjectStore");
var sword = await api.GetWeapon("swords/bloodfeud-blade");
var tex   = await api.LoadIcon("weapons/bloodfeud-blade.png");
```

---

### ✅ Best Practices

- **Reference by slug, never by name** — slugs are stable, names drift.
- **Cache JSON aggressively** — files only change on repo pushes; use `localStorage` / `IndexedDB` and `If-None-Match` headers.
- **UUIDs for instances** — player inventory, crafted items, hero saves must use `generateGrudgeUUID()`. Slugs for definitions, UUIDs for instances.
- **Tier-aware icon resolution** — try `icons/weapons/{item-id}.png` first, fall back to `icons/wcs/weapons/{iconBase}_{NN}.png` using each weapon category's `iconBase` / `iconOffset` / `noPad` fields.
- **Pixelated sprites** — apply `image-rendering: pixelated` (CSS) or `Filter Mode: Point` (Unity).
- **Lazy-load by category** — weapons alone is 119 items × 8 tiers; never bulk-fetch every endpoint on boot. Use `api.search()` for targeted lookups.

### ❌ Don't

- Hardcode icon paths — resolve through `sprites.json` or the SDK's icon resolver.
- Fetch every endpoint upfront — page-load budget will collapse.
- Mint your own UUIDs — always go through `generateGrudgeUUID(prefix)` so the timestamp/sequence/hash stay collision-resistant across services.

---

## Core Systems (April 28, 2026 session)

### Skills Created
| Skill | Location | Summary |
|-------|----------|---------|
| `tundra-terrain-shader` | `.agents/skills/tundra-terrain-shader/SKILL.md` | Frozen wasteland GLSL shader for tundra biome — triangle noise, ice SSS, crystalline spec, frost cracks, animated ice-storm fog |
| `raymarching-math` | `.agents/skills/raymarching-math/SKILL.md` | FPI sphere-trace for terrain collision, LOS queries, slope math, GLSL SDF primitives |

### New Source Modules
| Module | Path | Purpose |
|--------|------|---------|
| `TerrainRaycast` | `src/game/math/TerrainRaycast.ts` | CPU-side FPI heightfield raycaster — `terrainRaycast()`, `downCast()`, `hasLOS()`, `terrainSlope()` |
| `SpatialTracker` | `src/game/SpatialTracker.ts` | 2D grid spatial partitioning for all entities — O(1) insert/remove, O(k) radius query, singleton factory |
| `NPCBrain` | `src/game/ai/NPCBrain.ts` | YUKA Vehicle + goal stack + sentiment map. Goals: IDLE, WANDER, GOTO, VENDOR, SLEEP, ATTACK, INTERPOSE, FLEE. Flocking, seek, arrive, flee, wander behaviors |
| `NPCManager` | `src/game/ai/NPCManager.ts` | World-level NPC lifecycle — YUKA EntityManager, flock groups, 100m render culling, day/night routing, sentiment dispersal, scriptable day-phase rules |
| `BuildingSystem` | `src/game/buildings/BuildingSystem.ts` | Procedural multi-story buildings — archetypes (outpost/tradingPost/tower/grandHall), per-floor zones (vendor/camp/storage/shrine), stairs, windows, doors, NPC population |
| `AssetRegistry` | `src/game/AssetRegistry.ts` | UUID-keyed asset catalog + cache-aware loader — lookup by id/path/name/category, prewarm batches, remote URL override for object storage CDN |
| `yuka.d.ts` | `src/types/yuka.d.ts` | TypeScript type declarations for YUKA 0.7.8 |

### Building Archetypes
| Key | Floors | Floor 1 | Upper Floors |
|-----|--------|---------|-------------|
| `outpost` | 2 | 1 friendly vendor | 1 camp (2 neutral) |
| `tradingPost` | 3 | 2 friendly vendors | storage + guard camp (3) |
| `tower` | 4 | empty | 2 hostile camps + shrine |
| `grandHall` | 3 | 5 vendors (mix) | 2 neutral camps |

### NPC AI Goals
| Goal | Trigger | Behavior |
|------|---------|----------|
| IDLE | default between tasks | stand still N seconds |
| WANDER | day / no assignment | YUKA WanderBehavior within area |
| GOTO | routing | YUKA ArriveBehavior to target, stuck detection |
| VENDOR | floor 1 vendor zone | stand at stall, maxSpeed=0.8 |
| SLEEP | night phase | maxSpeed=0, 8h duration |
| ATTACK | threat detected via LOS | SeekBehavior at run speed |
| INTERPOSE | defend order | ArriveBehavior to midpoint of two agents |
| FLEE | fear/retreat | FleeBehavior, 8s duration |

### Object Storage
- Bucket provisioned: `replit-objstore-e1525d32-fd56-4de9-a931-00ac73c62c1d`
- Asset manifest: `src/game/asset-manifest.json` — 482 assets, UUID v5 keys
- Regenerate: `pnpm --filter @workspace/arpg-game run gen:asset-manifest`

### Packages Added
| Package | Version | Use |
|---------|---------|-----|
| `yuka` | 0.7.8 | AI steering behaviors (seek, arrive, flee, wander, flock, interpose) |
| `uuid` | ^14.0.0 | UUID v4 generation for building instance IDs |

---


All archives from `attached_assets/` have been extracted and cataloged here.
Assets that are **web-ready** (GLB/GLTF) have been copied into `public/models/` and `public/icons/`.
Assets in FBX/BLEND format are documented as **source-only** — they require conversion before use in Three.js.

---

## Table of Contents
1. [In-Game Models (Currently Active)](#in-game-models-currently-active)
2. [Characters](#characters)
3. [Animations](#animations)
4. [Environment & Props](#environment--props)
5. [Weapons](#weapons)
6. [Monsters / NPCs](#monsters--npcs)
7. [Icons & UI Sprites](#icons--ui-sprites)
8. [VFX](#vfx)
9. [Raw Source Packs (Needs Conversion)](#raw-source-packs-needs-conversion)
10. [Unconvertible / Reference Only](#unconvertible--reference-only)

---

## In-Game Models (Currently Active)
**Location:** `public/models/`

| File | Type | Description |
|------|------|-------------|
| `characters/Casual.gltf` | Character | Female survivor (default character creation preview) |
| `characters/Casual_2.gltf` | Character | Male survivor (default character creation preview) |
| `characters/male_survivor_1.glb` | Character | Male Survivor variant 1 – used in MainPanel preview |
| `characters/Female Survivor 1.glb` | Character | Retro low-poly female survivor, 512×512 texture |
| `characters/Female Survivor 2.glb` | Character | Retro low-poly female survivor variant 2 |
| `characters/Male Survivor 1.glb` | Character | Retro low-poly male survivor |
| `characters/Male Survivor 2.glb` | Character | Retro low-poly male survivor variant 2 |
| `hairstyles/` | Hair meshes | ~12 hairstyle GLBs for CharacterCreation |
| `animations/` | Locomotion | Mixamo FBX + GLB: Idle, Walk, Run, Strafe ×4, Turn ×2, Jump |
| `base/` | Base mesh | Nude base rig used for outfit preview |
| `enemies/` | Enemies | Spider, zombie-type enemy GLBs |
| `weapons/` | Weapons | Stylized swords, axes, staffs |
| `Stylized_Guns.fbx` | Weapons | Stylized gun pack (FBX, has BaseColor/Normal/Roughness PNG textures) |
| `fists_fp.glb` | FP Hands | First-person hands + animations for FP combat mode |
| `survival/` | Survival props | Loot, crafting objects |

---

## Characters

### Retro Survivors Pack ★ Web-Ready GLB
**Source:** `attached_assets/Retro_Survivors_(3)_1776383056875.zip`
**Copied to:** `public/models/characters/`
**Quality:** Low-poly stylized, 512×512 texture atlas per model
**Poly count:** ~2 000–4 000 tris each

| File | Gender | Texture |
|------|--------|---------|
| `Female Survivor 1 .glb` | F | `F Surv 1 512x512.png` |
| `Female Survivor 2 .glb` | F | `F Surv 2 512x512.png` |
| `Male Survivor 1 .glb` | M | `Surv 1 512x512.png` |
| `Male Survivor 2 .glb` | M | `Surv 2 512x512.png` |

---

### Universal Base Characters ★ Source (GLTF/FBX)
**Source:** `attached_assets/Universal_Base_Characters[Standard]_1777381797465.zip` (128 MB)
**Status:** Source files, **not copied** to game yet (large — copy selectively)
**Quality:** High-quality humanoid base with proper UVs, suitable for rigging
**Formats:** `.gltf` (Godot/UE) + `.fbx` (Unity)

| Model | Notes |
|-------|-------|
| `Superhero_Female_FullBody.gltf` | Full body female base, 18 hairstyle variants available |
| `Superhero_Male_FullBody.gltf` | Full body male base, same hairstyle set |
| **Hairstyles (shared M+F):** | Eyebrows_Female, Eyebrows_Regular, Hair_Beard, Hair_Buns, Hair_Buzzed, Hair_BuzzedFemale, Hair_Long, Hair_SimpleParted |

> **Note:** Files are in `/tmp/asset_catalog/Universal_Base_Characters[Standard]/` — copy needed gltf files to `public/models/characters/universal_base/`.

---

### Ultimate Modular Men & Women ★ Source (FBX/GLTF)
**Source:** `Ultimate_Modular_Men-_Feb_2022-20260428T125922Z-3-001_1777381802126.zip` (54 MB)
         `Ultimate_Modular_Women_-_April_2022-20260428T125619Z-3-001_1777381136515.zip` (45 MB)
**Status:** Source files in `/tmp/asset_catalog/`
**Quality:** AAA-grade modular body part system, PBR textures
**Formats:** `.gltf` (11 M / 10 F) + `.fbx` (72 M / 66 F) + `.blend` (25 M / 22 F)
**Use case:** Full modular character customization — swap heads, torso, legs, arms per character.

---

### Low-Poly Character Customization Pack ★ Source (FBX)
**Source:** `Low_Poly_-_Character_Customization_1776387704792.zip` (10 MB)
**Status:** Source FBX — not web-ready
**Content:** 40 FBX modular body parts + 145 PNG textures
**Use case:** Alternative low-poly character builder

---

### Female / Male Lowpoly Mesh (7z)
**Source:** `Female_Lowpoly_Mesh_1776382341990.7z`, `Male_lowpoly_Mesh_1776382339892.7z`
**Extracted to:** `/tmp/asset_catalog/Female_Lowpoly_Mesh/`, `/tmp/asset_catalog/Male_Lowpoly_Mesh/`
**Quality:** Very low-poly base mesh, useful as collision/LOD
**Status:** Source only — inspect and convert if needed

---

## Animations

### Mixamo Locomotion Set ★ In-Game Now
**Location:** `public/models/animations/`
**Format:** FBX + GLB pairs
**Clips:** idle, walking, standard_run, left_strafe, right_strafe, left_strafe_walking, right_strafe_walking, left_turn_90, right_turn_90, jump

---

### Universal Animation Library 1 ★ Web-Ready GLB
**Source:** `Universal_Animation_Library[Standard]_(2)_1777382065366.zip` (8 MB)
**Copied to:** `public/models/animations/universal/UAL1_Standard.glb` (7.7 MB)
**Format:** Single GLB with many named animation clips embedded
**Rigged to:** Universal Base Characters skeleton (compatible with UAL2)
**Clip count:** Large library — covers full locomotion, combat, social, and death animations
**Use:** Retarget to any humanoid model; load clips by name in Three.js AnimationMixer

---

### Universal Animation Library 2 (Female) ★ Web-Ready GLB
**Source:** `Universal_Animation_Library_2[Standard]_(2)_1777382045327.zip` (10 MB)
**Copied to:** `public/models/animations/universal/UAL2_Standard.glb` (7.7 MB)
**Includes:** Female mannequin (`Mannequin_F.glb`) + full animation set
**Use:** Female-specific animation variants (hip walk, etc.)

---

### Quaternius Standard Free — 42 Animation Clips ★ In UAL1/UAL2
**Location in GLB:** Embedded in `UAL1_Standard.glb` / `UAL2_Standard.glb`
**Registry:** `src/game/AnimationRegistry.ts` — complete typed mapping of all 42 clips
**Format:** All clip names use UPPER_SNAKE_CASE exactly as stored in the GLB

| Clip Name | Game Key | Category | Loop | Duration |
|-----------|----------|----------|------|----------|
| `CHEST OPEN` | open_chest | interaction | once | 1.5s |
| `CLIMBUP 1M` | climbup_1m | traversal | once | 1.2s |
| `CONSUME` | consume | survival | once | 1.8s |
| `HARVEST` | harvest | survival | once | 1.5s |
| `PLANT SEED` | plant_seed | survival | once | 2.0s |
| `WATERING` | watering | survival | once | 1.8s |
| `TREECHOPPING` | chop_tree | survival | once | 1.3s |
| `WALK_CARRY` | walk_carry | locomotion | loop | — |
| `KNOCKBACK` | hit_knockback | combat | once | 0.4s |
| `KNOCKBACK_RM` | hit_knockback_recovery | combat | once | 0.28s |
| `MELEE_HOOK` | unarmed_hook | combat_unarmed | once | 0.5s |
| `MELEE_HOOK_REC` | unarmed_hook_recovery | combat_unarmed | once | 0.3s |
| `OVERHAND THROW` | throw_overhand | combat_throw | once | 0.7s |
| `SWORD_REGULAR_A` | sword_attack_a | combat_sword | once | 0.58s |
| `SWORD_REGULAR_B` | sword_attack_b | combat_sword | once | 0.55s |
| `SWORD_REGULAR_C` | sword_attack_c | combat_sword | once | 0.6s |
| `SWORD_REGULAR_A_REC` | sword_attack_a_recovery | combat_sword | once | 0.28s |
| `SWORD_REGULAR_B_REC` | sword_attack_b_recovery | combat_sword | once | 0.28s |
| `SWORD_REGULAR_COMBO` | sword_combo_finisher | combat_sword | once | 1.0s |
| `SWORD_BLOCK` | sword_block | combat_sword | once | 0.5s |
| `SWORD_DASH` | sword_dash_attack | combat_sword | once | 0.55s |
| `SHIELD_DASH` | shield_dash | combat_shield | once | 0.55s |
| `SHIELD_ONESHOT` | shield_bash | combat_shield | once | 0.6s |
| `IDLE_SHIELD` | idle_shield | combat_shield | loop | — |
| `IDLE_SHIELD BREAK` | shield_break | combat_shield | once | 0.6s |
| `NINJAJUMP_START` | wall_jump_start | traversal | once | 0.32s |
| `NINJAJUMP_IDLE` | wall_hang_idle | traversal | loop | — |
| `NINJAJUMP_LAND` | wall_jump_land | traversal | once | 0.45s |
| `SLIDE_START` | slide_start | traversal | once | 0.3s |
| `SLIDE_LOOP` | slide_loop | traversal | loop | — |
| `SLIDE_EXIT` | slide_exit | traversal | once | 0.38s |
| `IDLE_FOLD ARMS` | idle_arms_folded | idle_variant | loop | — |
| `IDLE_LANTERN` | idle_lantern | idle_variant | loop | — |
| `IDLE_NO` | idle_no | idle_variant | once | 1.1s |
| `IDLE_RAIL CALL` | idle_rail_call | idle_variant | loop | — |
| `IDLE_RAIL` | idle_rail | idle_variant | loop | — |
| `IDLE_TALKING PHONE` | idle_phone | idle_variant | loop | — |
| `LAYTOIDLE` | lay_to_idle | idle_variant | once | 1.2s |
| `YES` | idle_yes | idle_variant | once | 1.0s |
| `ZOMBIE_IDLE` | enemy_zombie_idle | enemy | loop | — |
| `ZOMBIE_SCRATCH` | enemy_zombie_attack | enemy | once | 0.9s |
| `ZOMBIE_WALK_FWD` | enemy_zombie_walk | enemy | loop | — |

**Weapon → Attack clip routing** (auto-resolved in `PlayerController.playAnimation`):
- sword/dagger/knife → `SWORD_REGULAR_A` (then B→C→COMBO chain)
- axe/hatchet → `TREECHOPPING`
- unarmed/fists → `MELEE_HOOK`
- throwable/javelin → `OVERHAND THROW`
- shield → `SHIELD_ONESHOT`

---

### First-Person Fists Animations ★ In-Game Now
**File:** `public/models/fists_fp.glb` (23 MB)
**Source:** `fists_2025__first_person_animations_1777385383051.glb`
**Clips:** Idle + Punch (confirmed loaded in PlayerController `loadFPHands()`)
**Use:** Active — plays in first-person camera mode on LMB attack

---

## Environment & Props

### KayKit Dungeon Pack ★ Web-Ready GLB (185 meshes)
**Source:** `KayKit_Dungeon_Pack_1.0_1776382336084.zip` (86 MB)
**Copied to:** `public/models/environment/kaykit_dungeon/` (185 GLBs)
**Quality:** Stylized low-poly dungeon + RPG props, consistent art style
**Texture:** Atlas-based (shared per pack, minimal draw calls)
**License:** KayKit standard (attribution required)

**Categories:**
- **Tiles/Floors:** tileBrickA/B (small/medium/large), tileSpikes, floorDecoration variants (10 meshes)
- **Walls:** wall, wallCorner, wallSingle, wallSplit, wallIntersection, wallDecorationA/B, wall_door, wall_window, wall_gate, wall_broken variants (18 meshes)
- **Stairs / Platforms:** stairs, stairs_wide, scaffold variants S/M/L/High/Low + corner + railing (38 meshes)
- **Containers:** barrel, barrelDark, chest_common/rare/uncommon + mimic variants, crate, crateDark (14 meshes)
- **Furniture:** bench, bookcase (6 variants), bookOpenA/B, chair, stool, tableLarge/Medium/Small (15 meshes)
- **Weapons/Loot Props:** arrow, axe/axeDouble/crossbow/dagger/hammer/shield/staff/sword (common/uncommon/rare each), weaponRack, quiver variants (40+ meshes)
- **Potions/Items:** potionSmall/Medium/Large (red/green/blue), coin, coins (S/M/L), artifact, spellBook (18 meshes)
- **Environment:** banner, pillar/broken, torch, torchWall, door, door_gate, trapdoor, bricks, bucket, mug, pot variants (20 meshes)
- **Books:** bookA–F, bookOpenA/B (8 meshes)

---

### KayKit ResourceBits ★ Web-Ready GLTF (76 meshes)
**Source:** `resources_1776382358835.zip` (8 MB)
**Copied to:** `public/models/props/resources/` (76 GLTF files)
**Quality:** Low-poly, atlas-textured, stylized
**Use:** Crafting resources, loot drops, world props

**Includes:**
- **Metals:** Copper/Iron/Gold/Silver — Bar, Bars, Stack_S/M/L, Nugget_S/M/L, Nuggets (9 each × 4 metals = 36)
- **Fuel:** Barrel/Dirty/Barrels/Jerrycan × 3 variants A/B/C (12)
- **Wood:** Log_A/B, Stack, Plank_A/B/C, Planks_S/M/L (9)
- **Stone:** Brick, Stack_S/M/L, Chunks_S/L (5)
- **Textiles:** Textiles_A/B/C, Stack_S/L, Stack_Large_Colored (6)
- **Parts:** Cog, Pile_S/M/L (4)
- **Other:** Pallet_Wood, Pallet_Covered_A/B (3)

---

### KayKit RPG Tools ★ Web-Ready GLTF (49 meshes)
**Source:** `tools_1776382369990.zip` (7 MB)
**Copied to:** `public/models/props/tools/` (49 GLTF)
**Includes:** anvil, axe, blueprint, bucket_metal, chisel, compass, file, grindstone, hammer, handdrill, handplane, journal_closed/open, knife, lantern, magnifying_glass, mallet, map, and more

---

### Build Materials — Containers ★ Web-Ready GLB (8 meshes)
**Source:** `buildmaterials_1776382399594.zip` (1.3 MB)
**Copied to:** `public/models/props/containers/`

| File | Description |
|------|-------------|
| `Barrel_closed.glb` | Sealed wooden barrel |
| `Barrel_open.glb` | Open barrel |
| `Sack_flour.glb` | Flour sack |
| `Wicker_basket.glb` | Wicker basket |
| `Wooden_chest_closed.glb` | Classic treasure chest |
| `Wooden_chest_open.glb` | Open treasure chest |
| `Wooden_crate_closed.glb` | Wooden crate |
| `Wooden_crate_open.glb` | Open crate |

---

### Quaternius Fantasy Props MegaKit ★ Web-Ready GLTF (94 props)
**Source:** `Fantasy_Props_MegaKit[Standard]_1777390553366.zip`
**Copied to:** `public/models/props/quaternius/` (94 GLTF + 94 .bin files)
**Textures:** `public/models/props/quaternius/textures/` (13 PNG trim-sheet textures)
**Texture sets:** Cloth · Furniture · Metal · Props — each with BaseColor / Normal / ORM
**License:** CC0 (free for commercial use)
**Style:** Stylized low-poly, matches Quaternius nature pack and character pack art style

| Category | Assets |
|----------|--------|
| **Weapons** | `Axe_Bronze.gltf`, `Pickaxe_Bronze.gltf`, `Sword_Bronze.gltf`, `Shield_Wooden.gltf` |
| **Furniture** | `Bed_Twin1/2`, `Bench`, `Cabinet`, `Chair_1`, `Nightstand_Shelf`, `Shelf_Arch/Simple/Small_Bottles`, `Stool`, `Table_Large`, `Bookcase_2`, `BookStand`, `Workbench`, `Workbench_Drawers` |
| **Storage** | `Barrel`, `Barrel_Apples`, `Barrel_Holder`, `Chest_Wood`, `Crate_Metal`, `Crate_Wooden`, `Bag`, `Pouch_Large`, `Cage_Small` |
| **Books** | `Book_5`, `Book_7`, `BookGroup_Medium_1/2/3`, `BookGroup_Small_1/2/3`, `Book_Simplified_Single`, `Book_Stack_1/2`, `Scroll_1/2` |
| **Light** | `Candle_1/2`, `CandleStick`, `CandleStick_Stand`, `CandleStick_Triple`, `Chandelier`, `Lantern_Wall`, `Torch_Metal` |
| **Food & Farm** | `Barrel_Apples`, `Carrot`, `FarmCrate_Apple`, `FarmCrate_Carrot`, `FarmCrate_Empty` |
| **Crafting** | `Anvil`, `Anvil_Log`, `Cauldron`, `Dummy` (training), `Peg_Rack`, `Whetstone`, `WeaponStand` |
| **Market** | `Stall_Empty`, `Stall_Cart_Empty`, `Peg_Rack` |
| **Tableware** | `Chalice`, `Mug`, `Pot_1`, `Pot_1_Lid`, `Table_Fork`, `Table_Knife`, `Table_Plate`, `Table_Spoon`, `Bucket_Metal`, `Bucket_Wooden_1` |
| **Potions** | `Potion_1`, `Potion_2`, `Potion_4`, `Bottle_1`, `SmallBottle`, `SmallBottles_1` |
| **Decor** | `Banner_1`, `Banner_1_Cloth`, `Banner_2`, `Banner_2_Cloth`, `Vase_2`, `Vase_4`, `Vase_Rubble_Medium`, `Chain_Coil`, `Rope_1/2/3` |
| **Currency** | `Coin`, `Coin_Pile`, `Coin_Pile_2`, `Key_Gold`, `Key_Metal` |

**Interaction mappings** (from `AnimationRegistry.ts`):
- `Chest_Wood.gltf` → triggers `CHEST OPEN` animation on E-interact
- `WeaponStand.gltf` → weapon equip/store UI prompt
- `Workbench.gltf` / `Anvil.gltf` → crafting station interaction

---

### Craftpix Environment Props ★ Source (FBX, needs conversion)
**Source:** `craftpix-908976-environment-props-3d-low-poly-pack_1777385264023.zip` (685 KB)
**Status:** FBX — needs conversion to GLTF/GLB
**Quality:** Low-poly stylized, single shared texture PNG
**Meshes (23):** barrel, barrel_2, boat, box, bridge, bucket, Bulletin_board, cart_1/2/3 (+ wheel variants), Fense_1/2, gallows, gate_1/2, Ledder (ladder), pads, pointer_1/2, warning_bell
**Texture:** Single 1 texture atlas (`Texture/Texture.png`)

---

### Raft
**Source:** `raft_1776382374708.zip` (4 MB)
**Status:** GLB + FBX + OBJ available
**Content:** 1 raft mesh, multi-format. GLB is directly usable.
**Location:** `/tmp/asset_catalog/raft/`
> Copy `raft.glb` to `public/models/environment/` if needed.

---

### DEMO Lords of Pain — Isometric Sprites
**Source:** `(DEMO)_Lords_Of_Pain_-_Old_School_Isometric_Assets_1776387727761.zip` (8.6 MB)
**Status:** 539 PNG sprites — 2D isometric assets
**Use:** UI icons, map tiles, or sprite-based elements — not suitable for 3D world

---

## Weapons

### Animated Weapon Viewmodels ★ Web-Ready GLTF
**Source:** `knife_animated`, `pistol_animated`, `rifle_animated` zips (19–26 MB each)
**Copied to:** `public/models/weapons/animated/<weapon>/`
**Format:** `.gltf` + `.bin` + PBR texture pack (baseColor, metallicRoughness, normal)
**Quality:** High-quality first-person viewmodels with PBR textures (1024×1024)
**Note:** These include ARMS + weapon mesh — designed for FP view

| Weapon | Arms Texture | Weapon Texture | Animations |
|--------|-------------|----------------|------------|
| `knife/scene.gltf` | `arms_baseColor.png` | `knife_baseColor.png` | Yes (embedded) |
| `pistol/scene.gltf` | `arms_baseColor.png` | `pistol1_baseColor.png` | Yes (embedded) |
| `rifle/scene.gltf` | `arms_baseColor.png` | `rifle1_baseColor.png` | Yes (embedded) |

> **Integration tip:** Load these instead of `fists_fp.glb` when specific weapon viewmodels are needed. All have matching arm textures for seamless blending.

---

### Stylized Guns (FBX + Textures) ★ In-Game Source
**File:** `public/models/Stylized_Guns.fbx` (currently in game folder)
**Textures:** `Stylized_Guns_BaseColor.png`, `Stylized_Guns_Normal.png`, `Stylized_Guns_Roughness.png`
**Status:** FBX in public folder — Three.js can load via FBXLoader

---

### Max Weapon Pack 1 (Wp-Pack) ★ Source FBX
**Source:** `Max'Wp-Pack_1777372798401.zip` (15 MB)
**Format:** FBX — needs conversion or runtime FBXLoader
**Quality:** Realistic low-poly survival weapons, no textures included (untextured)

| Category | Models |
|----------|--------|
| **Melee** | Axe, Bat, Crewdriver, Crowbar, Frying-pan, Knife-A, Knife-B, Pickaxe, Shovel |
| **Pistols** | MS-C96, Revolver-A, Revolver-B |
| **Rifles** | AHKN-LV, PTSK, TMS-1909 |
| **Shotguns** | CSO, PMPSG, SASG |
| **SMGs** | LCHSTRGN, M3GG, R2014-2806 |
| **Specials** | Bazooka, CrossBow, Gatling |
| **Ammo** | 8 bullet types (BLT-308/357/45ACP/556/762/9mm/CHV/SLG), cartridges (full+empty) |
| **Explosives** | Dynamite, Grenade-01 to -04, Molotov |
| **Arrows/Rockets** | Arrow, Box, CLP-9mm, RCKT-A/B |

---

### Max Weapon Pack 2 (Wp-Pack-2) ★ Source FBX
**Source:** `Wp-Pack-2_1777372800526.zip` (13 MB)
**Format:** FBX (88 models) + blend file
**Quality:** Modular weapon system — same weapons as Pack 1 but with **length variants** (Short/Medium/Long/Twisted)
**New in Pack 2:**
- Pistols with 3–4 barrel length variants
- BoltAction Rifles (A/B × Long/Medium/Short)
- Lever Rifles, Revolver Rifles
- Pump/Lever/Hunter/Semi-auto/Carabine Shotguns
- 4 scope attachments (Scope1–4)
- PPSH (drum + standard), Lanchester Gun

> **Integration note:** Wp-Pack-2 is strictly a superset of Pack 1 with more modular variants. Use Pack 2 for weapons that need visual progression (crafting upgrades, durability worn look).

---

### Free Stylized Guns 3D ★ Source (FBX + Textures)
**Source:** `Free_Stylized_Guns_3D_Models_1776387693634.zip` (87 MB)
**Format:** 1 FBX (multi-mesh scene) + 56 PNG textures + 1 BLEND
**Quality:** Stylized cartoony, PBR-ready textures
**Use:** Best for arcade-style or stylized game aesthetic

---

## Monsters / NPCs

### Battle Monsters Pack ★ Source FBX + Animations
**Source:** `battle_monsters_1776394675473.zip` (44 MB)
**Format:** FBX — 10 creature meshes + per-creature animation sets
**Status:** Source only — convert each FBX to GLB for runtime use

| Monster | Animations Available |
|---------|---------------------|
| `bug/bug.FBX` | alerted_forward, alerted_left (+ more) |
| `diatryma/diatryma.FBX` | Full set |
| `dragonewt/dragonewt.FBX` | Full set |
| `fish/fish.FBX` | Swim variants |
| `horns/horns.FBX` | Full set |
| `mini_wyvern/mini_wyvern.FBX` | Full set |
| `needles/needles.FBX` | Full set |
| `plant_monster/plant.FBX` | Full set |
| `sloth/sloth.FBX` | Full set |
| `undead_serpent/serpent.FBX` | alerted_fwd/left/right, bite, death_float, die (4 dirs), idle, idle2, slash, stagger (4 dirs), swim, swim_fast |

> **Each monster has:** alerted, idle, attack, die, stagger animations. The undead_serpent is the most complete with 18 clips.

---

### GLB Character Pack (Modular Base Bodies)
**Source:** `GLB_Files_1776387721819.zip` (172 MB)
**Content:** 9 nested zip bundles, each with `base_basic_pbr.glb` + `base_basic_shaded.glb`
**Variants:** cdias, Fbw, Fdwwat, fwo, fwwhh, fwws, gfcwcf, grdlc, Wioga (9 body variants)
**Quality:** Two shader modes per body: PBR (realistic) and Shaded (toon/flat)
**Status:** Extracted to `/tmp/asset_catalog/GLB_nested/`
> Copy specific variants to `public/models/characters/base_variants/` as needed

---

### Killers Pack (RAR — failed extraction)
**Source:** `Killers_Pack_By_Dime_1776386309713.rar` (99 MB)
**Status:** RAR extraction failed (may be password-protected or corrupted)
**Action needed:** Try alternative RAR tool or check if password-protected

---

## Icons & UI Sprites

### Perk Icon Packs ★ Web-Ready PNG (120 icons total across 4 tracks)
**Copied to:** `public/icons/perks/<track>/` — 30 PNG per track (numbered `1.png`–`30.png`)

| Track folder | PSD name | Theme | In-game stat track |
|-------------|----------|-------|--------------------|
| `perks/hero/` | RPG Weapon achievements icons | Class/weapon mastery | Hero vitals (HP, Stamina, Resilience) |
| `perks/warrior/` | RPG Weapon achievements icons | Combat/strength feats | Warrior (Melee/Ranged damage, Combat) |
| `perks/smarts/` | RPG Game achievements icons | Intelligence/stealth | Smarts (Medicine, Stealth, Tactics) |
| `perks/maker/` | RPG Profession achievements icons 2 | Crafting/building | Maker (Crafting, Building, Resources) |

**Icon usage tiers:**
- Icons `1–6`: Used for Tier 1 perks (unlock at 3 stat points)
- Icons `7–12`: Tier 2 (5 pts)
- Icons `13–18`: Tier 3 (8 pts)
- Icons `19–24`: Tier 4 (13 pts) — reserved for future tiers
- Icons `25–30`: Tier 5 (20 pts) — reserved for legendary perks
- Icons `16–18` from each pack: Used for cross-stat combo perks

**Full perk definitions:** `src/game/progression/PerkSystem.ts`
**Old path:** `public/icons/achievements/` — same hero icons, kept for compatibility

---

### DEMO Lords of Pain — 2D Isometric Sprites
**Source:** `(DEMO)_Lords_Of_Pain_-_Old_School_Isometric_Assets_1776387727761.zip` (8.6 MB)
**Content:** 539 PNG sprites — classic isometric game tiles and characters
**Use:** 2D map, UI elements, or inventory icons (not 3D world)

---

## VFX

### Magic Projectiles VFX
**Source:** `MagicProjectilesVFX_1776394729267.zip` (604 KB)
**Content:** 1 PNG sprite sheet + 128 PNG individual frames (animated)
**Use:** Spell projectiles, abilities, particle effects in UI/game
**Format:** PNG sprite frames — requires sprite animation playback system

---

### Portal
**Source:** `portal_1776394741169.zip` (248 KB)
**Content:** 15 files — 1 PNG texture + metadata files
**Use:** Portal/teleport VFX reference

---

### Toon Shading Reference
**Source:** `toonshading_1776394745319.zip` (8 KB)
**Content:** Shader reference material only — no meshes

---

## Raw Source Packs (Needs Conversion)

### ARPG WebGL Reference Build
**Source:** `ARPG_1.21.8_WebGL_1776387483499.zip` (110 MB × 2 copies)
**Content:** Full compiled Unity WebGL build of reference ARPG game
**Use:** Play reference — do NOT copy assets directly; used to study game design

### MDA Hatchery CP1
**Source:** `MDA_Hatchery_CP1_1776394675472.zip` (105 MB)
**Content:** Large Unity/Blender scene package

### Blend Files (Blender Source)
**Source:** `Blend_Files_1776387672266.zip` (38 MB × 2 copies)
**Content:** 6 `.blend` files — Blender source scenes
**Use:** Open in Blender 3.x+ to export to GLTF

### Classic 64 Asset Pack (failed extraction)
**Source:** `-_Classic_64_Asset_Pack_0.6_1776394734771.zip` (27 MB)
**Status:** Extraction produced 0 files — may be nested or requires password

### Horror Game Floor Generator
**Source:** `horror-game-floor-generator-free_1776387690175.zip` (67 MB)
**Content:** Floor mesh generator (Unity package + shaders)
**Use:** Not directly usable — Unity-specific tooling

### ActionCharacter APKs
**Source:** `ActionCharacter_1776415754548.apk`, `ActionCharacter_GuzmanAssets_Placeholders_1776415718552.apk`
**Content:** Android APK builds — reference applications only

### Testing Overhead
**Source:** `TestingOverhead_1776415713497.zip` (67 MB)
**Content:** Overhead camera testing build

### Just Survive (RAR — needs re-extraction)
**Source:** `Just_Survive_1777372821168.rar` + `Just_Survive_1777383717329.rar` (23 MB each, duplicates)
**Status:** Failed extraction — RAR may need `unrar` native tool or password
**Content:** Likely a survival game reference or asset pack based on name

---

## Unconvertible / Reference Only

| File | Type | Notes |
|------|------|-------|
| `mainpanel_1777385016494.html` | HTML Reference | MainPanel UI design reference (dark stone/gold theme) |
| `UIlayer_1777385016494.html` | HTML Reference | HUD/overlay UI design reference |
| `bosslogo_1777385024721.png` | Branding | Boss logo — used as favicon + MainPanel logo |
| `Pasted-*.txt` | Text notes | Various design notes and references |
| `image_*.png` | Reference images | Screenshots/mockups from design process |
| `19dc7a*.png` | Reference images | Design reference screenshots |

---

## Project Public Folder Structure

```
public/
├── bosslogo.png                    ← favicon + entrance logo
├── favicon.svg                     ← legacy (replaced by bosslogo.png)
├── models/
│   ├── fists_fp.glb               ← FP hands (ACTIVE)
│   ├── Stylized_Guns.fbx          ← Stylized guns source
│   ├── Stylized_Guns_*.png        ← Gun textures
│   ├── animations/
│   │   ├── universal/
│   │   │   ├── UAL1_Standard.glb  ← Universal Animation Library 1
│   │   │   └── UAL2_Standard.glb  ← Universal Animation Library 2 (female)
│   │   ├── idle.glb, walking.glb, standard_run.glb
│   │   ├── left_strafe.glb, right_strafe.glb
│   │   ├── left_strafe_walking.glb, right_strafe_walking.glb
│   │   ├── left_turn_90.glb, right_turn_90.glb
│   │   └── jump.glb
│   ├── base/                      ← Nude base mesh + materials
│   ├── characters/                ← Player models + Retro Survivors
│   ├── enemies/                   ← Enemy GLBs
│   ├── environment/
│   │   └── kaykit_dungeon/        ← 185 dungeon prop GLBs ★ NEW
│   ├── hairstyles/                ← Hair mesh variants
│   ├── monsters/                  ← (empty — FBX source only)
│   ├── props/
│   │   ├── containers/            ← 8 barrel/chest/crate GLBs ★ NEW
│   │   ├── resources/             ← 76 KayKit resource GLTF ★ NEW
│   │   └── tools/                 ← 49 KayKit tool GLTF ★ NEW
│   ├── survival/                  ← Survival item models
│   └── weapons/
│       ├── animated/
│       │   ├── knife/scene.gltf   ← FP knife viewmodel + PBR textures ★ NEW
│       │   ├── pistol/scene.gltf  ← FP pistol viewmodel + PBR textures ★ NEW
│       │   └── rifle/scene.gltf   ← FP rifle viewmodel + PBR textures ★ NEW
│       └── (other weapon GLBs)
└── icons/
    └── achievements/              ← 30 RPG achievement PNGs (1.png–30.png) ★ NEW
```

---

## Priority Recommendations

### Immediately usable (web-ready, already copied):
1. **KayKit Dungeon Pack** (`public/models/environment/kaykit_dungeon/`) — 185 GLBs covering all dungeon prop/tile/weapon needs
2. **KayKit Resources** (`public/models/props/resources/`) — 76 loot/crafting resource GLTFs
3. **KayKit Tools** (`public/models/props/tools/`) — 49 tool/item GLTFs for crafting
4. **Build Containers** (`public/models/props/containers/`) — 8 barrel/chest/crate GLBs
5. **Animated Weapons** (`public/models/weapons/animated/`) — knife, pistol, rifle FP viewmodels with PBR textures
6. **Universal Animations** (`public/models/animations/universal/`) — UAL1 + UAL2 rich animation libraries
7. **Achievement Icons** (`public/icons/achievements/`) — 30 RPG icons

### Needs conversion (high value, convert when needed):
1. **Battle Monsters** — 10 FBX creatures with full animation sets → convert to GLB via Blender/gltf-pipeline
2. **Modular Characters** (Ultimate Modular Men/Women) — high-quality modular body system
3. **Weapon Packs** (Max Wp-Pack 1 + 2) — survival weapon library (Axe, Crowbar, Grenades, etc.)
4. **Craftpix Props** — boat, bridge, gallows, carts (good open-world props)

### Requires investigation:
1. **Killers Pack RAR** — 99 MB, extraction failed
2. **Just Survive RARs** — may need password or native unrar
3. **Classic 64 Pack** — extraction returned 0 files

---

## 🧱 Prefab Pack — `public/models/prefabs/`

27-asset GLB pack (~5.12M triangles total) registered as world-spawnable
prefabs through `src/data/prefabs.ts` and instantiated by
`src/game/world/PrefabSystem.ts`. Drop the listed files into
`public/models/prefabs/` to enable each entry; missing files warn once and
are skipped.

### Registry ↔ file map

| id              | file                                                          | kind            | role                              |
| --------------- | ------------------------------------------------------------- | --------------- | --------------------------------- |
| `smeltery`      | `stylized_smeltery_setup.glb`                                 | crafting        | smelter station                   |
| `weaponsmith`   | `stylized_weaponsmith.glb`                                    | crafting        | weapon forge                      |
| `bakery`        | `stylized_bakery.glb`                                         | building        | cooking station                   |
| `woodcutter`    | `stylised_medieval_buildings_-_woodcutter_hut.glb`            | building        | wood-processing hut               |
| `house_human`   | `rts_human_house_lv2_-_proto_series.glb`                      | building        | settler home (human factions)     |
| `house_orc`     | `rts_orc_house_lv2_-_proto_series.glb`                        | building        | orc dwelling (hollow lords)       |
| `medieval_city` | `medieval_modular_city_realistic_-_wip.glb`                   | city            | NPC-populated capital             |
| `pirate_island` | `stylized_pirate_island_pack__low_poly_3d_assets.glb`         | biome pack      | coast/drowned-quarter dressing    |
| `galleon`       | `galleon.glb`                                                 | vehicle         | large ship                        |
| `raft`          | `the_raft.glb`                                                | vehicle         | starter raft                      |
| `caravan`       | `stylized_caravan.glb`                                        | interactable    | **market / auction access node**  |
| `ore_crystals`  | `ore_and_crystals.glb`                                        | resource_node   | ore + crystal vein                |
| `tree_log`      | `low_poly_tree_log_and_stump.glb`                             | resource_node   | fallen log                        |
| `hemp`          | `hemp.glb`                                                    | resource_node   | hemp plant                        |
| `scrap_pile`    | `pile_of_scrap_metal_tools_rubbish_garbage.glb`               | resource_node   | scrap (junkyards)                 |
| `pines_snowy`   | `snowy_pine_trees_pack__ps1_low_poly.glb`                     | vegetation      | snow biome trees                  |
| `tree_stylized` | `stylize22d_tree.glb`                                         | vegetation      | generic tree                      |
| `plants_set`    | `plants_asset_set.glb`                                        | vegetation      | undergrowth scatter               |
| `brick_wall`    | `medieval_wall_of_bricks_assets.glb`                          | building        | modular brick wall kit            |
| `populate`      | `populate_models.glb`                                         | biome pack      | city/crowd dressing               |
| `campfire`      | `campfire_fbx.glb`                                            | prop            | camp fire                         |
| `camp_stove`    | `camping_stove.glb`                                           | prop            | camp stove (cook)                 |
| `camp_shovel`   | `camping_shovel.glb`                                          | prop            | shovel                            |
| `plinth`        | `low_poly_hand_painted_dungeon_plinth.glb`                    | prop            | dungeon altar                     |
| `fruits_veg`    | `lowpoly_fruits__vegetables.glb`                              | resource_node   | forageable produce                |
| `rts_target`    | `rts_target.glb`                                              | target          | combat training dummy             |
| `spider`        | `spider._low_poly.glb`                                        | enemy           | cave spider                       |
| `stealth_wasp`  | `stealth_wasp_2.0.glb`                                        | enemy           | flying insect                     |
| `skeleton` / `skeleton_axe` / `skeleton_sword` | (multiple `*.glb`)             | enemy           | undead humanoids                  |
| `ncr_ranger`    | `ncr_ranger-fallout.glb`                                      | enemy           | wasteland ranger                  |
| `terrain_quick` | `free_quick_terrain_test.glb`                                 | terrain_patch   | test patch (80 m core / 40 m ring)|
| `terrain_snow_mtn` | `snowy_mountain_-_terrain.glb`                             | terrain_patch   | snowy mountain (200 / 80)         |
| `terrain_cg_misty` / `terrain_cg_western` / `terrain_cg_encamp` / `terrain_cg_bigfarm` / `terrain_cg_town2f` / `terrain_cg_town3f` | (`chicken_gun_*.glb`) | terrain_patch | town / camp / farm patches |
| `post_apoc_city` / `city_pack_free` / `snowy_village` | (`*.glb`)               | city            | NPC-populated settlement props    |
| `training_gym`  | `training_gym.glb`                                            | building        | XP training facility              |
| `temple_ancient`| `ancient_x_temple-i.glb`                                      | building        | temple / dungeon entry            |
| `anta_grande`   | `anta_grande_do_zambujeiro.glb`                               | building        | megalith ruin                     |
| `psx_industrial`| `psx_industrial_pack.glb`                                     | biome_pack      | industrial/urban modular kit      |
| `crystal_gems`  | `stylized_crystal_gem_pack_-_handpainted.glb`                 | resource_node   | hand-painted gem nodes            |
| `mat_*`         | PBR/material packs (medieval, jungle, biomasse, sand, lava, ground) | material  | shader / surface references       |
| `fx_sphere_explosion` | `sphere_explosion.glb`                                  | fx              | explosion VFX prop                |

### Wiring summary

- **Settlements** — `FeaturePlacer.decorateSettlementWithPrefabs` rings each
  town with smeltery + weaponsmith + bakery + woodcutter + two houses, then
  parks a caravan at the south gate. Outposts get a target dummy + caravan.
- **Caravan = market/auction** — proximity (4 m) shows `Press [E] · Trade
  Caravan`; pressing INTERACT fires `engine.onPrefabInteract('market:auction',
  'caravan')`, which GameCanvas forwards as a `prefab:interact` DOM event.
- **Terrain patches** — `terrainPatches.place('terrain_snow_mtn', cx, cz)`
  loads the GLB, samples 64 perimeter heights, blends procedurally:
  `r ≤ rCore` → patch height verbatim; `rCore < r < rOuter` → smoothstep
  procedural↔perimeter; `r ≥ rOuter` → pure `worldHeight()`. Render mesh
  *and* Rapier heightfield use the same `getBlendedHeight()` so no seams.
  Existing chunks within the patch radius are auto-evicted and rebuilt.
- **Resource nodes / vegetation** — registered but not auto-scattered yet;
  call `prefabs.place(id, x, z)` from biome scatter code when ready.
- **Repeat-the-pattern recipe** — see `public/models/prefabs/README.md` for
  the 3-step add-a-prefab guide.

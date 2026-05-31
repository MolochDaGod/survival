/**
 * BuildingPropPatterns — attach Fantasy_Props_MegaKit (and a sci-fi fallback
 * via Sci-Fi_Essentials_Kit) props onto procedurally generated buildings.
 *
 * Wiring:
 *   • BuildingSystem._buildGeometry() calls decorateFloor() per zone after
 *     primitives are placed. Loads are async + cached so floors render
 *     immediately and the props pop in as the GLTF cache fills.
 *   • Pattern selection is keyed by (archetype, zoneType). Archetype overrides
 *     trump the zone defaults; "shrine" / "camp" / "vendor" / "storage" fall
 *     back to the generic palette.
 *
 * Adding new patterns: extend PROP_PATTERNS or ARCHETYPE_OVERRIDES — no
 * BuildingSystem changes required. Paths are root-relative under public/.
 */
import * as THREE from 'three';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import type { BuildingDef, FloorZoneDef, FloorZoneType } from './BuildingSystem';

const FANTASY = '/models/props/fantasy_megakit/Exports/glTF/';
const SCIFI   = '/models/scifi/essentials_kit/glTF/';

/** Curated paths from fantasy_megakit, grouped by gameplay role. */
const PROPS = {
  workbench:  [FANTASY + 'Workbench.gltf', FANTASY + 'Workbench_Drawers.gltf'],
  anvil:      [FANTASY + 'Anvil.gltf', FANTASY + 'Anvil_Log.gltf'],
  bed:        [FANTASY + 'Bed_Twin1.gltf', FANTASY + 'Bed_Twin2.gltf'],
  table:      [FANTASY + 'Table_Large.gltf'],
  chair:      [FANTASY + 'Chair_1.gltf', FANTASY + 'Stool.gltf', FANTASY + 'Bench.gltf'],
  barrel:     [FANTASY + 'Barrel.gltf', FANTASY + 'Barrel_Apples.gltf', FANTASY + 'Barrel_Holder.gltf'],
  crate:      [FANTASY + 'Crate_Wooden.gltf', FANTASY + 'Crate_Metal.gltf', FANTASY + 'FarmCrate_Apple.gltf'],
  chest:      [FANTASY + 'Chest_Wood.gltf'],
  bookcase:   [FANTASY + 'Bookcase_2.gltf', FANTASY + 'Shelf_Arch.gltf', FANTASY + 'Shelf_Simple.gltf'],
  bookpile:   [FANTASY + 'Book_Stack_1.gltf', FANTASY + 'Book_Stack_2.gltf', FANTASY + 'BookGroup_Medium_1.gltf'],
  candle:     [FANTASY + 'Candle_1.gltf', FANTASY + 'CandleStick.gltf', FANTASY + 'Lantern_Wall.gltf'],
  banner:     [FANTASY + 'Banner_1.gltf', FANTASY + 'Banner_2.gltf'],
  shrineProp: [FANTASY + 'Cauldron.gltf', FANTASY + 'Chalice.gltf', FANTASY + 'CandleStick_Triple.gltf'],
  stallEmpty: [FANTASY + 'Stall_Empty.gltf', FANTASY + 'Stall_Cart_Empty.gltf'],
  weaponRack: [FANTASY + 'WeaponStand.gltf', FANTASY + 'Peg_Rack.gltf'],
  scifiCrate: [SCIFI + 'Prop_Crate.gltf', SCIFI + 'Prop_Crate_Large.gltf', SCIFI + 'Prop_Crate_Tarp.gltf'],
  scifiDesk:  [SCIFI + 'Prop_Desk_Medium.gltf', SCIFI + 'Prop_Desk_L.gltf', SCIFI + 'Prop_Desk_Small.gltf'],
} as const;

/** Place spec relative to the floor's local origin. */
export interface PropPlacement {
  paths:  readonly string[];     // one path is chosen deterministically per seed
  /** Relative XZ offset as a fraction of (width, depth). Range -0.5..+0.5. */
  rx:     number;
  rz:     number;
  rotY?:  number;
  /** Optional uniform target size in metres (long-side fit). Skipped if 0. */
  fit?:   number;
  /** Probability gate (0..1) — letting some props skip for variety. */
  chance?: number;
}

/** Default per-zone dressing. */
const PROP_PATTERNS: Record<FloorZoneType, PropPlacement[]> = {
  vendor: [
    { paths: PROPS.stallEmpty, rx: -0.30, rz: -0.20, rotY: 0,         fit: 2.5 },
    { paths: PROPS.stallEmpty, rx:  0.30, rz: -0.20, rotY: 0,         fit: 2.5 },
    { paths: PROPS.barrel,     rx: -0.36, rz:  0.30, fit: 1.0 },
    { paths: PROPS.crate,      rx:  0.36, rz:  0.30, fit: 1.0 },
    { paths: PROPS.banner,     rx:  0.00, rz: -0.46, rotY: 0, fit: 2.4 },
  ],
  camp: [
    { paths: PROPS.bed,        rx: -0.32, rz: -0.28, rotY: Math.PI/2, fit: 2.0 },
    { paths: PROPS.bed,        rx:  0.32, rz: -0.28, rotY: -Math.PI/2,fit: 2.0 },
    { paths: PROPS.table,      rx:  0.00, rz:  0.05, fit: 1.8 },
    { paths: PROPS.chair,      rx: -0.10, rz:  0.18, fit: 0.8 },
    { paths: PROPS.chair,      rx:  0.10, rz: -0.10, fit: 0.8 },
    { paths: PROPS.candle,     rx:  0.00, rz:  0.05, fit: 0.5 },
    { paths: PROPS.crate,      rx: -0.38, rz:  0.34, fit: 0.9, chance: 0.7 },
  ],
  storage: [
    { paths: PROPS.crate,      rx: -0.30, rz: -0.30, fit: 1.1 },
    { paths: PROPS.crate,      rx:  0.00, rz: -0.30, fit: 1.1 },
    { paths: PROPS.crate,      rx:  0.30, rz: -0.30, fit: 1.1 },
    { paths: PROPS.barrel,     rx: -0.30, rz:  0.30, fit: 1.1 },
    { paths: PROPS.barrel,     rx:  0.00, rz:  0.30, fit: 1.1 },
    { paths: PROPS.chest,      rx:  0.30, rz:  0.30, fit: 1.2 },
  ],
  shrine: [
    { paths: PROPS.shrineProp, rx:  0.00, rz:  0.10, fit: 1.6 },
    { paths: PROPS.candle,     rx: -0.20, rz:  0.10, fit: 0.5 },
    { paths: PROPS.candle,     rx:  0.20, rz:  0.10, fit: 0.5 },
    { paths: PROPS.banner,     rx: -0.40, rz: -0.40, fit: 2.6 },
    { paths: PROPS.banner,     rx:  0.40, rz: -0.40, fit: 2.6 },
    { paths: PROPS.bookpile,   rx:  0.00, rz: -0.20, fit: 0.7 },
  ],
  empty: [
    { paths: PROPS.barrel,     rx: -0.40, rz: -0.40, fit: 1.0, chance: 0.5 },
    { paths: PROPS.crate,      rx:  0.40, rz: -0.40, fit: 1.0, chance: 0.5 },
  ],
};

/**
 * Per-archetype patches (additive). Use these to swap palettes
 * (e.g. tower → weaponRack on guard floors, grandHall → bookcase on vendors).
 */
const ARCHETYPE_OVERRIDES: Record<string, Partial<Record<FloorZoneType, PropPlacement[]>>> = {
  tower: {
    camp: [
      { paths: PROPS.weaponRack, rx: -0.36, rz: -0.30, fit: 1.4 },
      { paths: PROPS.weaponRack, rx:  0.36, rz: -0.30, fit: 1.4 },
      { paths: PROPS.bed,        rx:  0.00, rz:  0.32, rotY: Math.PI, fit: 2.0 },
      { paths: PROPS.crate,      rx: -0.34, rz:  0.30, fit: 0.9 },
      { paths: PROPS.candle,     rx:  0.00, rz: -0.05, fit: 0.5 },
    ],
  },
  grandHall: {
    vendor: [
      { paths: PROPS.bookcase,   rx: -0.42, rz:  0.00, rotY: Math.PI/2,  fit: 2.5 },
      { paths: PROPS.bookcase,   rx:  0.42, rz:  0.00, rotY: -Math.PI/2, fit: 2.5 },
      { paths: PROPS.table,      rx:  0.00, rz:  0.10, fit: 2.4 },
      { paths: PROPS.bookpile,   rx:  0.00, rz:  0.10, fit: 0.8 },
      { paths: PROPS.candle,     rx: -0.10, rz:  0.10, fit: 0.6 },
      { paths: PROPS.candle,     rx:  0.10, rz:  0.10, fit: 0.6 },
      { paths: PROPS.banner,     rx: -0.30, rz: -0.46, fit: 3.0 },
      { paths: PROPS.banner,     rx:  0.30, rz: -0.46, fit: 3.0 },
    ],
  },
  // Sci-fi outposts get crates+desks instead of barrels+benches.
  scifiOutpost: {
    storage: [
      { paths: PROPS.scifiCrate, rx: -0.30, rz: -0.30, fit: 1.4 },
      { paths: PROPS.scifiCrate, rx:  0.00, rz: -0.30, fit: 1.4 },
      { paths: PROPS.scifiCrate, rx:  0.30, rz: -0.30, fit: 1.4 },
      { paths: PROPS.scifiDesk,  rx:  0.00, rz:  0.30, fit: 2.0 },
    ],
  },
};

// ── Loader / cache ─────────────────────────────────────────────────────────────

const _loader = createGLTFLoader();
const _cache = new Map<string, Promise<THREE.Group | null>>();

function loadCached(path: string): Promise<THREE.Group | null> {
  let p = _cache.get(path);
  if (p) return p;
  p = new Promise<THREE.Group | null>((resolve) => {
    _loader.load(
      path,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn(`[BuildingPropPatterns] failed: ${path}`, err);
        resolve(null);
      },
    );
  });
  _cache.set(path, p);
  return p;
}

// ── Seeded RNG (so a given building always dresses the same) ──────────────────

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Fit `group`'s longest XZ extent into `target` metres, applied uniformly. */
function fitUniform(group: THREE.Group, target: number): void {
  if (target <= 0) return;
  const bbox = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const longest = Math.max(size.x, size.z, size.y * 0.5);
  if (longest < 1e-4) return;
  const s = target / longest;
  group.scale.multiplyScalar(s);
}

function enableShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the prop list for (archetype, zoneType). Archetype overrides
 * win when defined; otherwise the generic PROP_PATTERNS entry is used.
 */
export function getPattern(archetype: string, zoneType: FloorZoneType): PropPlacement[] {
  const override = ARCHETYPE_OVERRIDES[archetype]?.[zoneType];
  if (override) return override;
  return PROP_PATTERNS[zoneType] ?? [];
}

/**
 * Decorate a floor zone with prop GLTFs. Fire-and-forget — caller does NOT
 * await; the floor renders immediately and props pop in as they finish.
 *
 * `floorGroup` must be the per-floor THREE.Group whose local origin sits at
 * the centre of the floor slab (matches BuildingSystem._buildGeometry).
 */
export function decorateFloor(
  floorGroup: THREE.Group,
  def: BuildingDef,
  zone: FloorZoneDef,
  buildingSeed: string,
): void {
  const pattern = getPattern(def.archetype, zone.type);
  if (pattern.length === 0) return;

  const seed = hash32(`${buildingSeed}/${zone.type}`);

  for (let i = 0; i < pattern.length; i++) {
    const spec = pattern[i];
    const r0 = (seed ^ (i * 2654435761)) >>> 0;
    if (spec.chance !== undefined && (r0 / 0xffffffff) > spec.chance) continue;

    const path = pick(spec.paths, r0);

    // Capture per-spec values so the async resolution still has them.
    void loadCached(path).then((src) => {
      if (!src) return;
      const node = src.clone(true);
      const x = spec.rx * def.width;
      const z = spec.rz * def.depth;
      node.position.set(x, 0.11, z);          // 0.11 = just above 0.2-thick slab
      if (spec.rotY !== undefined) node.rotation.y = spec.rotY;
      if (spec.fit  !== undefined) fitUniform(node, spec.fit);
      enableShadows(node);
      floorGroup.add(node);
    });
  }
}

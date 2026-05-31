/**
 * Client-side prefab registry.
 *
 * On boot the game GETs /api/prefabs and caches the result in localStorage so
 * subsequent loads (and offline play) work without the server. Every gameplay
 * system that needs entity definitions (EnemyManager, AssetManager, TownshipSystem,
 * EnemyManager, ItemSystem, BuildingSystem, NPCSystem) goes through this registry
 * instead of hardcoding lists.
 *
 * The registry never throws — if both the server and the cache fail, callers
 * fall back to the in-game hardcoded constants (ENEMY_DEFS, BODY_TYPES, ...).
 */

// ─── Scripted role ────────────────────────────────────────────────────────────

/** What role this prefab plays in the simulation. */
export type ScriptedRole =
  | 'enemy'       // Hostile AI-driven unit
  | 'npc'         // Neutral/friendly AI-driven character
  | 'player'      // Controllable avatar
  | 'item'        // World-space pickup / interactable item
  | 'building'    // Placeable structure (walls, foundations, crafting stations)
  | 'vehicle'     // Driveable / mountable entity
  | 'projectile'  // Bullet / arrow / spell bolt
  | 'fx'          // Pure visual / audio effect emitter
  | 'trigger';    // Invisible logic zone (spawn volumes, quest triggers, cutscene launchers)

// ─── Animation ───────────────────────────────────────────────────────────────

export type AnimBlendMode = 'override' | 'additive' | 'lower-body';

export interface AnimClip {
  /** Logical name used by game code, e.g. "walk", "attack_1h", "death". */
  name: string;
  /** Path to the animation file (FBX/GLB/GLTF binary), relative to /assets/. */
  clipPath: string;
  /** Whether the animation loops continuously. Default: false. */
  loop?: boolean;
  /** Animation layer blend mode. Default: 'override'. */
  blendMode?: AnimBlendMode;
  /** Playback speed multiplier. Default: 1.0. */
  speed?: number;
  /** Frame at which to loop back (for partial loops like locomotion cycles). */
  loopFrame?: number;
  /** Root-motion extraction: true means the animation drives translation. */
  rootMotion?: boolean;
}

// ─── LOD ─────────────────────────────────────────────────────────────────────

export interface LODLevel {
  /** Path to the LOD mesh, relative to /assets/. */
  modelPath: string;
  /** Camera distance (world units) at which this LOD becomes active. */
  maxDistance: number;
}

// ─── Audio ───────────────────────────────────────────────────────────────────

export type AudioEvent =
  | 'spawn'
  | 'death'
  | 'attack'
  | 'hit'
  | 'idle'
  | 'footstep'
  | 'interact'
  | 'build'
  | 'destroy'
  | 'ambient';

export interface AudioCue {
  /** Which game event triggers this sound. */
  event: AudioEvent;
  /** Path to the audio file, relative to /assets/audio/. */
  path: string;
  /** Volume scalar 0–1. Default: 1.0. */
  volume?: number;
  /** Whether this is a 3-D positional sound. Default: true. */
  spatial?: boolean;
  /** Randomised pitch range [min, max]. Default: [1, 1]. */
  pitchRange?: [number, number];
  /** Maximum audible radius in world units (spatial only). Default: 40. */
  maxDistance?: number;
}

// ─── Physics collider ─────────────────────────────────────────────────────────

export type ColliderShape = 'box' | 'capsule' | 'sphere' | 'cylinder' | 'mesh' | 'convex';

export interface ColliderDef {
  shape: ColliderShape;
  /** Box: [halfX, halfY, halfZ]. Capsule/Cylinder: [radius, halfHeight]. Sphere: [radius]. */
  size: [number, number, number?];
  /** Offset from the entity's origin. Default: [0,0,0]. */
  offset?: [number, number, number];
  /** Physics material — affects friction and restitution. */
  physicsMaterial?: 'default' | 'metal' | 'wood' | 'flesh' | 'stone' | 'water';
  /** If true, the collider is trigger-only (no collision response). */
  isTrigger?: boolean;
  /** Collision layer mask (bit field). */
  layer?: number;
  /** Layers this collider will interact with (bit field). */
  mask?: number;
}

// ─── Interaction UI ───────────────────────────────────────────────────────────

export type InteractionUIType =
  | 'pickup'       // Item pick-up (inventory transfer)
  | 'examine'      // Read lore / inspect stats
  | 'talk'         // NPC dialogue tree entry
  | 'craft'        // Crafting station
  | 'trade'        // Merchant shop UI
  | 'repair'       // Weapon / armour repair bench
  | 'build'        // Place / upgrade building
  | 'unlock'       // Door / chest that requires key/skill
  | 'fast-travel'  // Waypoint portal
  | 'custom';      // Driven by scriptedRole data

export interface InteractionUIDef {
  type: InteractionUIType;
  /** Text shown in the interaction prompt, e.g. "Press [E] to loot". */
  promptText: string;
  /** Activation radius in world units. */
  range: number;
  /** Optional conditions expressed as a simple key:value map.
   *  e.g. { "minLevel": 5, "requiredItem": "key_iron" }
   */
  conditions?: Record<string, string | number | boolean>;
  /** Custom data forwarded to the UI layer (varies by type). */
  payload?: Record<string, unknown>;
}

// ─── Textures ─────────────────────────────────────────────────────────────────

export interface TextureSet {
  /** Diffuse / albedo map, relative to /assets/. */
  albedo?: string;
  /** Normal map. */
  normal?: string;
  /** PBR roughness-metalness map (R=roughness, G=metalness). */
  roughnessMetal?: string;
  /** Emissive colour map. */
  emissive?: string;
  /** Ambient occlusion map. */
  ao?: string;
  /** Opacity / alpha mask. */
  opacity?: string;
  /** Optional tint colour override as 0xRRGGBB. */
  tintColor?: number;
}

// ─── AI hints ────────────────────────────────────────────────────────────────

export type AIStimulusGroup = 'undead' | 'beast' | 'humanoid' | 'construct' | 'horror' | 'neutral';

export interface AIHints {
  /** Aggro detection radius (world units). */
  aggroRange?: number;
  /** Leash / patrol radius around spawn point (world units). */
  patrolRadius?: number;
  /** Faction tag — used for friendly-fire and reputation checks. */
  faction?: string;
  /** Threat group for ability targeting logic. */
  threatGroup?: AIStimulusGroup;
  /** Difficulty scalar applied to stat calculations. */
  difficulty?: number;
  /** Whether this unit can call reinforcements. */
  callsForHelp?: boolean;
  /** Override behaviour tree ID (maps to an AI script asset). */
  behaviourTree?: string;
}

// ─── Spawn rules ──────────────────────────────────────────────────────────────

export interface SpawnRules {
  /** Relative frequency weight for procedural placement (higher = more common). */
  spawnWeight?: number;
  minGroupSize?: number;
  maxGroupSize?: number;
  /** Biome tags where this prefab is valid to spawn. */
  allowedBiomes?: string[];
  /** Time-of-day range [startHour, endHour] (24h). Omit for always. */
  timeOfDayRange?: [number, number];
  /** Minimum player level before this prefab is eligible to spawn. */
  minPlayerLevel?: number;
}

// ─── Material override ────────────────────────────────────────────────────────

export interface MaterialOverride {
  /** Name of the mesh/submesh to target (matches glTF material name). */
  meshName: string;
  textures: TextureSet;
  /** emissive colour intensity multiplier. */
  emissiveIntensity?: number;
}

// ─── Core Prefab interface ─────────────────────────────────────────────────────

export interface Prefab {
  // Identity
  id: string;
  kind: string;
  name: string;
  description: string | null;
  version: number;
  draft: boolean;
  tags: string[];

  // Role
  scriptedRole: ScriptedRole;

  // Visual — primary mesh
  modelPath: string | null;
  /** World-uniform scale. Default: 1.0. */
  scale: number;
  /** Per-axis scale override; overrides `scale` if present. */
  scaleXYZ?: [number, number, number];

  // Textures
  texturePath: string | null;        // legacy single-texture, kept for back-compat
  textures?: TextureSet;             // full PBR set
  materialOverrides?: MaterialOverride[]; // per-submesh overrides (variants, damage states)

  // Skeleton & rig
  /** Path to the skeleton/rig file if separate from the model. */
  skeletonPath?: string | null;
  /** Animation clips associated with this prefab. */
  animations?: AnimClip[];
  /** Default animation to play on spawn. */
  defaultAnimation?: string;

  // LODs
  lods?: LODLevel[];
  /** Distance beyond which the entity is culled entirely. Default: derived from last LOD. */
  cullDistance?: number;

  // Physics
  collider?: ColliderDef;
  /** Mass in kg (0 = kinematic/static). Default: 70. */
  mass?: number;
  /** Whether this entity is affected by gravity. Default: true. */
  useGravity?: boolean;

  // Interaction
  interactionUI?: InteractionUIDef;

  // Audio
  audioCues?: AudioCue[];

  // AI
  aiHints?: AIHints;

  // Spawning
  spawnRules?: SpawnRules;

  // Stats baseline (game-specific numeric properties forwarded to gameplay systems)
  stats?: {
    hp?: number;
    maxHp?: number;
    moveSpeed?: number;
    attackDamage?: number;
    attackRange?: number;
    xpValue?: number;
    armor?: number;
    [key: string]: number | undefined;
  };

  // Arbitrary extra data for system-specific extensions
  data: Record<string, unknown>;
}

const CACHE_KEY = "grudge:prefab_cache:v1";
const FETCH_TIMEOUT_MS = 4000;

class PrefabRegistry {
  private prefabs: Map<string, Prefab> = new Map();
  private loaded = false;
  private loading: Promise<void> | null = null;

  /** Idempotent — safe to await from many call sites. */
  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<void> {
    // 1. Server (live + cached).
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch("/api/prefabs", { signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = (await res.json()) as Prefab[];
        this.ingest(data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          /* quota or private mode — ignore */
        }
        console.info(
          `[PrefabRegistry] loaded ${data.length} prefabs from server`,
        );
        return;
      }
      console.warn(`[PrefabRegistry] server returned HTTP ${res.status}`);
    } catch (err) {
      console.warn("[PrefabRegistry] server fetch failed:", err);
    }

    // 2. localStorage cache (offline / first-paint replay).
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as Prefab[];
        this.ingest(data);
        console.info(
          `[PrefabRegistry] loaded ${data.length} prefabs from cache (offline)`,
        );
        return;
      }
    } catch {
      /* corrupt cache — ignore */
    }

    // 3. Nothing — callers must fall back to hardcoded defaults.
    console.warn(
      "[PrefabRegistry] no prefabs available — game will use hardcoded fallbacks",
    );
  }

  private ingest(rows: Prefab[]) {
    this.prefabs.clear();
    for (const r of rows) this.prefabs.set(r.id, r);
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getAll(): Prefab[] {
    return Array.from(this.prefabs.values());
  }

  getByKind(kind: Prefab["kind"]): Prefab[] {
    return this.getAll().filter((p) => p.kind === kind);
  }

  getById(id: string): Prefab | undefined {
    return this.prefabs.get(id);
  }

  /** Return all prefabs whose `scriptedRole` matches. */
  getByRole(role: ScriptedRole): Prefab[] {
    return this.getAll().filter((p) => p.scriptedRole === role);
  }

  /**
   * Return all prefabs that include **every** tag in `tags`.
   * Pass a single-element array to filter by one tag.
   */
  getByTags(tags: string[]): Prefab[] {
    if (tags.length === 0) return this.getAll();
    return this.getAll().filter((p) =>
      tags.every((t) => p.tags.includes(t)),
    );
  }
}

export const prefabRegistry = new PrefabRegistry();

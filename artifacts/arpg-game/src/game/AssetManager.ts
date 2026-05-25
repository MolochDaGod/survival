import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGLTFLoader, configureKTX2WithRenderer } from '@/game/loaders/createGLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CharacterConfig, STARTING_MODEL, DEFAULT_CHARACTER_CONFIG, BODY_TYPES } from './CharacterConfig';
import { prefabRegistry, type Prefab } from './PrefabRegistry';
import { assetUrl } from '@/lib/assetUrl';

/**
 * Compute the Y offset needed to plant a model's lowest point at y=0
 * inside its parent group. Returns `-bbox.min.y` so callers can do
 * `model.position.y = footOffsetY` and have feet sit on the ground.
 *
 * Internally uses Box3.setFromObject which traverses every child mesh
 * and accumulates world-space bounds, so any per-mesh translation/scale
 * baked into the rig is included. Must be called *after* any group-level
 * `.scale.setScalar(...)` so the bbox is in final units.
 */
function computeFootOffset(group: THREE.Object3D): number {
  // Make sure transforms are flushed to world matrices before the bbox
  // pass — Box3.setFromObject reads world matrices, not local positions.
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (!isFinite(box.min.y)) return 0;
  return -box.min.y;
}

/**
 * Inspect a list of bone names and report which Mixamo-prefix style they
 * use. The three styles seen in the wild are:
 *   - `colon`  — `mixamorig:Hips`     (raw Mixamo / FBX import)
 *   - `plain`  — `mixamorigHips`      (Blender import that strips `:`)
 *   - `none`   — `Hips`               (Quaternius / hand-rigged exports)
 *
 * Falls back to `'none'` if the list is empty or no bone matches the
 * `mixamorig` prefix at all.
 */
function detectPrefixStyle(boneNames: string[]): 'colon' | 'plain' | 'none' {
  for (const n of boneNames) {
    if (/^mixamorig:/i.test(n)) return 'colon';
    if (/^mixamorig/i.test(n))  return 'plain';
  }
  return 'none';
}

export interface EnemyModelDef {
  key: string;
  fbxPath: string;
  texturePath: string;
  scale: number;
  yOffset: number;
  color: number;
}

export interface LoadedEnemyTemplate {
  group: THREE.Group;
  animations: THREE.AnimationClip[];
  scale: number;
  yOffset: number;
  /**
   * Distance to add to the model's local Y so its lowest point sits at
   * y=0 in its parent group. Computed once from the model's bounding box
   * after `.scale` has been applied. Without this, FBX/GLB rigs whose
   * origin is at the hips end up half-buried when planted at the ground.
   */
  footOffsetY: number;
}

export interface LoadedPlayerTemplate {
  group: THREE.Group;
  animations: THREE.AnimationClip[];
  /** See LoadedEnemyTemplate.footOffsetY. */
  footOffsetY: number;
}

export interface TextureLoadOpts {
  /** Treat as color (sRGB) vs data (linear). Defaults to false (linear). */
  srgb?: boolean;
  /** UV repeat factor — applied to both s and t. */
  repeat?: number;
  /** Use max anisotropic filtering. Defaults to true. */
  anisotropy?: boolean;
  /** Wrap mode. Defaults to RepeatWrapping when repeat is set, else ClampToEdge. */
  wrap?: THREE.Wrapping;
}

/**
 * Hardcoded fallback enemy defs. Used when the PrefabRegistry can't reach the
 * server AND has no localStorage cache (i.e. genuine cold start with no API).
 * Prefer reading from `assetManager.enemyDefs` after `loadAll()` has run —
 * it'll be the live server list when the API is up.
 */
/**
 * Default enemy roster — derived from the canonical creature registry
 * in `src/data/creatures.ts` (sourced from `docs/inventory/creatures.csv`).
 *
 * We pull only `hostile-*` roles for the wave spawner / boot loader —
 * `huntable-*` farm + fish are loaded lazily by the ambient spawner
 * (Phase 2/4) so we don't pay the FBX cost up front for animals the
 * player may never see.
 *
 * The keys here MUST match `enemyKey` values in bestiary.ts so the
 * Bestiary book can link entries. Adding/removing rows here is safe —
 * unknown bestiary keys auto-synthesize stub pages.
 *
 * (We briefly swapped these for an "easy_animated" creature pack to fix
 * a perceived T-pose issue — that swap broke the bestiary linkage AND
 * caused a worse T-pose because the creature pack's clip names didn't
 * match the EnemyClipSet binding logic. Reverted, then properly wired
 * via the registry — both packs now coexist as separate creature rows
 * with their own keys.)
 */
import { getHostileCreatures, type CreatureDef } from '../data/creatures';

function creatureToEnemyDef(c: CreatureDef): EnemyModelDef {
  return {
    key:         c.key,
    fbxPath:     c.fbxPath,
    texturePath: c.texturePath ?? '',
    scale:       c.scale,
    yOffset:     c.yOffset,
    color:       c.tintColor,
  };
}

export const ENEMY_DEFS: EnemyModelDef[] =
  getHostileCreatures().map(creatureToEnemyDef);

/**
 * Convert a monster prefab row into the legacy EnemyModelDef shape used by
 * the loader/AI. Returns null when the prefab has no `data.legacyKey` (so we
 * skip the 80 draft attached_assets monsters that aren't wired up yet).
 */
function prefabToEnemyDef(p: Prefab): EnemyModelDef | null {
  const data = (p.data ?? {}) as { legacyKey?: string; tintColor?: number };
  if (!data.legacyKey || !p.modelPath || !p.texturePath) return null;
  return {
    key: data.legacyKey,
    fbxPath: p.modelPath,
    texturePath: p.texturePath,
    scale: p.scale,
    yOffset: 0,
    color: data.tintColor ?? 0xffffff,
  };
}

/**
 * Centralized asset hub. Owns the only LoadingManager in the app.
 *
 * Every loader in the codebase (GLTF, FBX, Texture) routes through this
 * class so that:
 *   - load progress is unified for the boot screen
 *   - textures are de-duplicated (cache by key)
 *   - all textures get the renderer's max anisotropy automatically
 *   - colorSpace is set explicitly (sRGB for color maps, linear for data)
 */
export class AssetManager {
  private renderer: THREE.WebGLRenderer;
  private loadingManager: THREE.LoadingManager;
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;
  private textureLoader: THREE.TextureLoader;
  private maxAnisotropy: number;

  enemyTemplates: Map<string, LoadedEnemyTemplate> = new Map();
  playerTemplate: LoadedPlayerTemplate | null = null;
  stylizedGunsTemplate: THREE.Group | null = null;

  /**
   * Resolved enemy defs for this run — populated by loadAll() from the
   * PrefabRegistry, falling back to the hardcoded ENEMY_DEFS when the
   * registry has nothing live.
   */
  enemyDefs: EnemyModelDef[] = ENEMY_DEFS;

  /** Generated IBL environment map (RoomEnvironment via PMREM). */
  envMap: THREE.Texture | null = null;

  private texCache: Map<string, THREE.Texture> = new Map();
  private allTextures: THREE.Texture[] = [];
  private allGeometries: THREE.BufferGeometry[] = [];
  private allMaterials: THREE.Material[] = [];

  onProgress: ((fraction: number, url: string) => void) | null = null;
  onError: ((url: string) => void) | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    this.loadingManager = new THREE.LoadingManager(
      () => {},
      (url, loaded, total) => {
        this.onProgress?.(loaded / total, url);
      },
      (url) => {
        // FBXLoader tries to resolve embedded texture references that no longer
        // exist on disk (we ship renamed/optimized versions and override the
        // material anyway). Silence those — log everything else.
        if (!/Stylized Gun Models|Stylized Guns Models/.test(url)) {
          console.warn(`[AssetManager] Load error: ${url}`);
        }
        this.onError?.(url);
      }
    );

    // Route all asset loads through the CDN when VITE_ASSET_CDN_URL is set.
    // This single hook covers every GLTFLoader, FBXLoader, and TextureLoader
    // call that uses this manager — no need to patch individual call sites.
    this.loadingManager.setURLModifier((url) => assetUrl(url));

    this.gltfLoader = createGLTFLoader(this.loadingManager);
    configureKTX2WithRenderer(this.renderer);
    this.fbxLoader = new FBXLoader(this.loadingManager);
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);

    THREE.Cache.enabled = true;
  }

  /** Expose the shared loading manager for external loaders (e.g. GLBLocationSystem). */
  getLoadingManager(): THREE.LoadingManager {
    return this.loadingManager;
  }

  /**
   * Generate a synthetic IBL from RoomEnvironment. Done at construction
   * because it doesn't need any disk I/O — pure render-target work.
   */
  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  /**
   * Load every asset the game needs. Resolves once all are settled.
   * Failed loads warn but don't reject (graceful degradation to fallbacks).
   */
  async loadAll(onProgress?: (fraction: number) => void, characterConfig: CharacterConfig = DEFAULT_CHARACTER_CONFIG): Promise<void> {
    this.onProgress = onProgress ? (f) => onProgress(f) : null;

    // Pull live entity defs from the server before we start GPU loads. Falls
    // back to hardcoded ENEMY_DEFS if both /api/prefabs and the local cache
    // are unreachable.
    await prefabRegistry.ensureLoaded();
    const liveDefs = prefabRegistry
      .getByKind('monster')
      .filter((p) => !p.draft)
      .map(prefabToEnemyDef)
      .filter((d): d is EnemyModelDef => d !== null);
    this.enemyDefs = liveDefs.length > 0 ? liveDefs : ENEMY_DEFS;
    console.info(
      `[AssetManager] using ${this.enemyDefs.length} enemy defs ` +
        `(${liveDefs.length > 0 ? 'from registry' : 'hardcoded fallback'})`,
    );

    const tasks: Promise<unknown>[] = [
      this.loadCharacterGLTF(characterConfig),
      ...this.enemyDefs.map((def) => this.loadEnemyFBX(def)),

      // Horror floor pack
      this.loadTexture('floor_albedo',     '/textures/horror/floor_albedo.jpg',    { srgb: true,  repeat: 60 }),
      this.loadTexture('floor_normal',     '/textures/horror/floor_normal.png',    { srgb: false, repeat: 60 }),
      this.loadTexture('floor_roughness',  '/textures/horror/floor_roughness.jpg', { srgb: false, repeat: 60 }),
      this.loadTexture('arena_albedo',     '/textures/horror/floor_albedo.jpg',    { srgb: true,  repeat: 12 }),
      this.loadTexture('arena_normal',     '/textures/horror/floor_normal.png',    { srgb: false, repeat: 12 }),
      this.loadTexture('arena_roughness',  '/textures/horror/floor_roughness.jpg', { srgb: false, repeat: 12 }),
      this.loadTexture('wall_albedo',      '/textures/horror/wall_albedo.jpg',     { srgb: true,  repeat: 1 }),
      this.loadTexture('wall_normal',      '/textures/horror/wall_normal.png',     { srgb: false, repeat: 1 }),
      this.loadTexture('wall_roughness',   '/textures/horror/wall_roughness.jpg',  { srgb: false, repeat: 1 }),

      // Stylized guns FBX (single mesh, all guns staggered on shared atlas)
      this.loadStylizedGunsFBX(),
    ];

    await Promise.allSettled(tasks);
  }

  /**
   * Promise-based texture loader. Caches by key; subsequent calls with the
   * same key return the cached texture even if `url`/`opts` differ.
   *
   * Color maps must pass `srgb: true`. Data maps (normal/roughness/metallic)
   * must omit it (or set false) so values aren't gamma-corrected.
   */
  loadTexture(key: string, url: string, opts: TextureLoadOpts = {}): Promise<THREE.Texture> {
    const cached = this.texCache.get(key);
    if (cached) return Promise.resolve(cached);

    return new Promise<THREE.Texture>((resolve, reject) => {
      this.textureLoader.load(
        url,
        (tex) => {
          tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          if (opts.repeat !== undefined) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(opts.repeat, opts.repeat);
          } else if (opts.wrap !== undefined) {
            tex.wrapS = tex.wrapT = opts.wrap;
          }
          if (opts.anisotropy !== false) {
            tex.anisotropy = this.maxAnisotropy;
          }
          tex.needsUpdate = true;

          this.texCache.set(key, tex);
          this.allTextures.push(tex);
          resolve(tex);
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager] Texture failed (${key} <- ${url}):`, err);
          reject(err);
        }
      );
    });
  }

  getTexture(key: string): THREE.Texture | null {
    return this.texCache.get(key) ?? null;
  }

  /**
   * Load the player character GLTF selected during character creation.
   * Renames animation clips to match the LocomotionAnimator's expected names,
   * applies skin/hair/eye color tints to materials, and stores the result as
   * the playerTemplate.
   */
  private loadCharacterGLTF(config: CharacterConfig): Promise<void> {
    // Resolve the GLTF path from the player's chosen body-type FIRST. This
    // is what makes the player's character-creation pick (Adventurer / King
    // / Swat / etc.) actually load in-game; before this lookup, every save
    // silently fell back to STARTING_MODEL[gender] and shipped without
    // clothing. We import BODY_TYPES lazily to avoid a circular ref at
    // module init.
    const bodyTypeCfg = BODY_TYPES.find(
      b => b.id === config.bodyProportion && b.gender === config.gender,
    );
    const gltfPath = bodyTypeCfg?.gltfPath ?? STARTING_MODEL[config.gender];

    // Animation name mapping: GLTF clip name → engine clip name
    // The LocomotionAnimator expects: Idle, Walk, Run, StrafeLeft, StrafeRight,
    // StrafeLeftWalk, StrafeRightWalk. One-shots: Attack, Jump, Death, Hit.
    const ANIM_MAP: Record<string, string> = {
      'Idle':         'Idle',
      'Idle_Neutral': 'Idle',
      'Walk':         'Walk',
      'Run':          'Run',
      'Run_Left':     'StrafeLeft',
      'Run_Right':    'StrafeRight',
      'Roll':         'Jump',
      'Sword_Slash':  'Attack',
      'Punch_Left':   'Attack',
      'Death':        'Death',
      'HitRecieve':   'Hit',
      'HitRecieve_2': 'Hit',
      'Interact':     'Interact',
      'Wave':         'Wave',
      // Unreal-mannequin (UAL) clip names — used by UAL1_Standard.glb.
      // Loaded as a companion-clip pack when the player rig matches the
      // Unreal mannequin (bones like `root`/`pelvis`/`spine_01`) but
      // ships with zero clips, e.g. the base/male.gltf body.
      'Idle_Loop':     'Idle',
      'Walk_Loop':     'Walk',
      'Jog_Fwd_Loop':  'Run',
      'Sprint_Loop':   'Sprint',
      'Jump_Start':    'Jump',
      'Jump_Loop':     'JumpLoop',
      'Jump_Land':     'JumpLand',
      // Drop the duplicate T-pose hold the UAL packs ship at the head of
      // their clip lists — bound to '' so the merge loop skips it.
      'A_TPose':       '',
    };

    return new Promise<void>((resolve) => {
      this.gltfLoader.load(gltfPath, async (gltf) => {
        const group = gltf.scene as THREE.Group;

        group.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            this.upgradeToStandard(child);
            if (child instanceof THREE.SkinnedMesh && child.geometry) {
              child.geometry.computeBoundingBox();
              child.geometry.computeBoundingSphere();
            }
          }
        });

        this.applyCharacterColors(group, config.skinColor, config.hairColor, config.eyeColor);

        const merged: THREE.AnimationClip[] = [];
        const usedTargetNames = new Set<string>();

        // Some character GLBs (Quaternius/Blender exports) ship clips
        // named like NLA tracks: "NlaTrack", "NlaTrack.001", "Action",
        // "Action.001"... none of which match the LocomotionAnimator's
        // expected semantic names. When *no* clip name matches ANIM_MAP
        // and the clips look like an unnamed Blender export, remap them
        // by index using the canonical export order the artists use:
        // 0=Idle, 1=Walk, 2=Run, 3=StrafeLeft, 4=StrafeRight, ... etc.
        // Without this fallback the rig stays in T-pose because the
        // LocomotionAnimator can't find any clip by name.
        const NLA_ORDER = ['Idle', 'Walk', 'Run', 'StrafeLeft', 'StrafeRight', 'Attack', 'Jump', 'Death', 'Hit'];
        const anySemantic = gltf.animations.some(c => ANIM_MAP[c.name] !== undefined);
        const looksLikeUnnamed = gltf.animations.every(c =>
          /^(NlaTrack|Action|AnimationClip|Take 001|mixamo\.com)([.\d]*)$/i.test(c.name) || c.name === '',
        );
        const remapByIndex = !anySemantic && looksLikeUnnamed && gltf.animations.length > 0;
        if (remapByIndex) {
          console.warn(
            `[AssetManager] Character GLB clips have no semantic names (${gltf.animations.map(c => c.name).join(', ')});`
            + ` remapping by index → ${NLA_ORDER.slice(0, gltf.animations.length).join(', ')}`,
          );
        }

        gltf.animations.forEach((clip, idx) => {
          const targetName = remapByIndex
            ? (NLA_ORDER[idx] ?? clip.name)
            : (ANIM_MAP[clip.name] ?? clip.name);
          const cloned = clip.clone();
          cloned.name = targetName;
          const stripped = this.stripRootMotion(cloned);

          if (!usedTargetNames.has(targetName)) {
            merged.push(stripped);
            usedTargetNames.add(targetName);
          }
        });

        // Many character GLTFs ship the rig but ZERO animation clips — the
        // asset is intended to be paired with a separate animation pack.
        // The two flavours we see in this project's assets:
        //
        //   - Unreal-mannequin rigs (bones: root/pelvis/spine_01/clavicle_l
        //     /upperarm_l/...). The matching clip pack is UAL1_Standard.glb
        //     in /models/animations/, which uses identical bone names so
        //     tracks bind 1:1 with no prefix gymnastics.
        //
        //   - Mixamo-style rigs (bones: mixamorigHips / Hips / etc.). The
        //     matching clip pack is the per-clip *.glb files in the same
        //     animations directory.
        //
        // We sniff the rig's bone names, pick the right companion pack,
        // and merge those clips onto the character's skeleton. Three.js
        // binds tracks to bones by exact-name match, so for the Mixamo
        // pack we also normalise the `mixamorig:` prefix style first.
        let bindableTrackCount = 0;
        let charBoneCount = 0;
        if (merged.length === 0) {
          const charBones = new Set<string>();
          group.traverse((o) => { if ((o as THREE.Bone).isBone) charBones.add(o.name); });
          charBoneCount = charBones.size;
          const targetStyle = detectPrefixStyle([...charBones]);
          // Unreal-mannequin rigs uniformly use lowercase 'pelvis' AND
          // 'spine_01' AND have NO mixamorig prefix anywhere — combining
          // all three as the heuristic avoids false-positives on any rig
          // that happens to contain just one of those bone names.
          const looksUnreal =
            targetStyle === 'none' &&
            charBones.has('pelvis') &&
            charBones.has('spine_01');
          console.warn(
            `[AssetManager] Character GLB '${gltfPath}' ships with no animation clips; ` +
            `merging ${looksUnreal ? 'UAL1 (Unreal-mannequin)' : 'Mixamo'} clips onto its rig.`,
          );
          try {
            // For Unreal-mannequin rigs we need BOTH UAL packs:
            //  - UAL1: locomotion, idles, pistol, spell, swim, roll, hit reactions
            //  - UAL2: sword combos, melee, shield, slide, throw, farm/harvest,
            //          ninja-jump, knockback, zombie set, walk-carry
            // Loaded in parallel; clips concatenated into one array. The
            // ANIM_MAP rename + dedup-by-name merge below handles the
            // duplicate A_TPose that ships in both packs.
            const extClips = looksUnreal
              ? (await Promise.all([
                  this.loadCompanionClipsFromGLTF('/models/animations/UAL1_Standard.glb'),
                  this.loadCompanionClipsFromGLTF('/models/animations/UAL2_Standard.glb'),
                ])).flat()
              : await this.loadLocomotionClipsOnly();
            let totalTracks = 0;
            for (const raw of extClips) {
              // For Mixamo packs, normalise the prefix; UAL clips keep
              // their bone names verbatim (they already match the rig).
              const fixed = looksUnreal
                ? raw
                : this.normaliseMixamoTrackPrefix(raw, targetStyle);
              for (const t of fixed.tracks) {
                totalTracks++;
                const dot = t.name.indexOf('.');
                if (dot < 0) continue;
                if (charBones.has(t.name.slice(0, dot))) bindableTrackCount++;
              }
              // Apply ANIM_MAP so UAL's `Idle_Loop` / `Walk_Loop` / etc.
              // become the engine's semantic names before they're handed
              // to LocomotionAnimator. ANIM_MAP entries that map to ''
              // (e.g. A_TPose) are dropped entirely. Everything else
              // passes through unchanged so AnimationRegistry's exact
              // GLB-name lookups (Sword_Regular_A, Melee_Hook, etc.) hit.
              const mapped = ANIM_MAP[fixed.name] ?? fixed.name;
              if (mapped === '') continue;
              if (usedTargetNames.has(mapped)) continue;
              fixed.name = mapped;
              merged.push(this.stripRootMotion(fixed));
              usedTargetNames.add(mapped);
            }
            console.log(
              `[AssetManager] Locomotion-merge bind report: ` +
              `${bindableTrackCount}/${totalTracks} tracks resolved → bones ` +
              `(target prefix style: '${targetStyle}', char bones: ${charBoneCount}, ` +
              `pack: ${looksUnreal ? 'UAL1+UAL2' : 'Mixamo'}, ` +
              `clips merged: ${merged.length}).`,
            );
            if (charBoneCount > 0 && bindableTrackCount < charBoneCount) {
              const sample = [...charBones].slice(0, 16).join(', ');
              console.warn(
                `[AssetManager] Companion clips don't meaningfully bind to '${gltfPath}' rig ` +
                `(${bindableTrackCount}/${totalTracks} tracks for ${charBoneCount} bones). ` +
                `Character bones (sample): ${sample}. ` +
                `Player will be visible but stuck in T-pose — pick a different body type.`,
              );
            }
          } catch (err) {
            console.warn('[AssetManager] Could not load companion clips for character rig:', err);
          }
        }

        // Duplicate strafes as walk variants if not present
        const sl = merged.find(c => c.name === 'StrafeLeft');
        const sr = merged.find(c => c.name === 'StrafeRight');
        if (sl && !usedTargetNames.has('StrafeLeftWalk')) {
          const slw = sl.clone(); slw.name = 'StrafeLeftWalk'; merged.push(slw);
        }
        if (sr && !usedTargetNames.has('StrafeRightWalk')) {
          const srw = sr.clone(); srw.name = 'StrafeRightWalk'; merged.push(srw);
        }

        // The previous "swap to Mixamo skeleton" fallback was removed: the
        // Mixamo /models/animations/idle.glb file is bones-only (zero
        // meshes), so swapping it in produced an INVISIBLE player —
        // strictly worse than a visible T-pose. Now we keep the visible
        // character mesh and let the warning above surface the rig
        // mismatch so the user can pick another body type.

        const footOffsetY = computeFootOffset(group);
        this.playerTemplate = { group, animations: merged, footOffsetY };
        console.log(
          `[AssetManager] Character GLTF loaded (${gltfPath}):`,
          merged.map(c => c.name).join(', ') || '(no clips)',
          `(footOffsetY=${footOffsetY.toFixed(3)})`,
        );
        resolve();
      }, undefined, (err) => {
        console.warn(`[AssetManager] Character GLTF load failed (${gltfPath}):`, err);
        // Fall back to Mixamo locomotion clips if character GLTF fails
        this.loadPlayerLocomotion().then(resolve, resolve);
      });
    });
  }

  /**
   * Load a single GLTF/GLB and return only its AnimationClip[] (the
   * scene/skin/mesh are dropped). Used as a "companion clip pack"
   * loader: e.g. UAL1_Standard.glb supplies 45 clips for the matching
   * Unreal-mannequin rig that the character GLTF ships unrigged-for-
   * animation. The first call's result is cached because the file is
   * ~1 MB and we only need its tracks.
   */
  private companionClipsCache = new Map<string, Promise<THREE.AnimationClip[]>>();
  private loadCompanionClipsFromGLTF(path: string): Promise<THREE.AnimationClip[]> {
    let p = this.companionClipsCache.get(path);
    if (!p) {
      p = new Promise<THREE.AnimationClip[]>((resolve) => {
        this.gltfLoader.load(
          path,
          (gltf) => resolve(gltf.animations ?? []),
          undefined,
          (err) => {
            console.warn(`[AssetManager] Companion clip pack load failed (${path}):`, err);
            resolve([]);
          },
        );
      });
      this.companionClipsCache.set(path, p);
    }
    return p;
  }

  /**
   * Load every clip out of `/models/animations/*.glb` and return them as
   * AnimationClip[] without any associated skinned mesh. Used to layer
   * Mixamo locomotion onto a character GLTF that ships without clips.
   *
   * Track names are kept verbatim — callers are expected to normalise
   * the `mixamorig:` bone-name prefix before binding.
   */
  private loadLocomotionClipsOnly(): Promise<THREE.AnimationClip[]> {
    const base = '/models/animations/';
    const clipMap: { name: string; path: string }[] = [
      { name: 'Idle',            path: base + 'idle.glb' },
      { name: 'Walk',            path: base + 'walking.glb' },
      { name: 'Run',             path: base + 'run.glb' },
      { name: 'Jump',            path: base + 'jump.glb' },
      { name: 'StrafeLeft',      path: base + 'left_strafe.glb' },
      { name: 'StrafeRight',     path: base + 'right_strafe.glb' },
      { name: 'StrafeLeftWalk',  path: base + 'left_strafe_walk.glb' },
      { name: 'StrafeRightWalk', path: base + 'right_strafe_walk.glb' },
      { name: 'TurnLeft',        path: base + 'left_turn.glb' },
      { name: 'TurnRight',       path: base + 'right_turn.glb' },
    ];
    const loadOne = (path: string) =>
      new Promise<THREE.AnimationClip[]>((res) => {
        this.gltfLoader.load(
          path,
          (gltf) => res(gltf.animations ?? []),
          undefined,
          (err) => { console.warn(`[AssetManager] Locomotion clip load failed (${path}):`, err); res([]); },
        );
      });
    return Promise.all(
      clipMap.map(async (entry) => {
        const clips = await loadOne(entry.path);
        const c = clips[0];
        if (!c) return null;
        const cloned = c.clone();
        cloned.name = entry.name;
        return cloned;
      }),
    ).then((arr) => arr.filter((c): c is THREE.AnimationClip => c !== null));
  }

  /**
   * Rewrite a clip's track bone names so the `mixamorig:` / `mixamorig`
   * / no-prefix style matches the target rig EXACTLY. Three.js binds
   * tracks to bones by string-equal match on the slice before the first
   * `.`, so even a missing `:` between `mixamorig` and `Hips` makes the
   * track silently fail to bind and leaves the rig in T-pose.
   *
   * The `targetStyle` argument is one of `'colon'` (`mixamorig:Hips`),
   * `'plain'` (`mixamorigHips`) or `'none'` (`Hips`), as detected from
   * the character's actual bone names by `detectPrefixStyle()`.
   *
   * Tracks are mutated by name only (KeyframeTrack.name is a public
   * property); times, values, and interpolation metadata are kept on
   * the original track object, so we don't have to assume anything
   * about the KeyframeTrack subclass constructor signature.
   */
  private normaliseMixamoTrackPrefix(
    clip: THREE.AnimationClip,
    targetStyle: 'colon' | 'plain' | 'none',
  ): THREE.AnimationClip {
    const cloned = clip.clone();
    for (const t of cloned.tracks) {
      const dot = t.name.indexOf('.');
      if (dot < 0) continue;
      const bone = t.name.slice(0, dot);
      const prop = t.name.slice(dot);
      // Strip whatever prefix style the clip currently uses, then
      // re-apply the target style. This handles all 3×3 source/target
      // combinations uniformly.
      let bare: string;
      if (/^mixamorig:/i.test(bone))      bare = bone.replace(/^mixamorig:/i, '');
      else if (/^mixamorig/i.test(bone))  bare = bone.replace(/^mixamorig/i, '');
      else                                bare = bone;
      let next: string;
      if      (targetStyle === 'colon') next = `mixamorig:${bare}`;
      else if (targetStyle === 'plain') next = `mixamorig${bare}`;
      else                              next = bare;
      if (next !== bone) t.name = next + prop;
    }
    return cloned;
  }

  /**
   * Apply skin, hair, and eye color tints to the loaded character mesh.
   * Materials are matched by name convention: "Skin" → skin color,
   * "Hair*" / "Eyebrows" → hair color, "Eye" → eye color.
   */
  private applyCharacterColors(group: THREE.Group, skinHex: string, hairHex: string, eyeHex: string) {
    const skin = new THREE.Color(skinHex);
    const hair = new THREE.Color(hairHex);
    const eye  = new THREE.Color(eyeHex);

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        const n = (mat.name ?? '').toLowerCase();
        if (n === 'skin' || n.includes('skin'))                  mat.color.copy(skin);
        else if (n.startsWith('hair') || n === 'eyebrows')       mat.color.copy(hair);
        else if (n === 'eye' || n === 'eyes' || n.includes('iris')) {
          // Quaternius Eye material has a baked iris texture; mat.color
          // multiplies it, so the player's chosen colour shows up as a
          // tint over brown unless we clear .map. Materials are shared
          // across the GLTF cache, so clone before mutating to avoid
          // affecting other characters that reuse the same cached
          // material instance. This mirrors applyColorTints() in
          // CharacterCreation.tsx — keep these two paths in sync.
          if (mat.map) {
            const cloned = mat.clone();
            cloned.map = null;
            cloned.needsUpdate = true;
            cloned.color.copy(eye);
            mats[i] = cloned;
          } else {
            mat.color.copy(eye);
          }
        }
      }
      child.material = Array.isArray(child.material) ? mats : mats[0];
    });
  }

  /**
   * Load the player skeleton from idle.glb and merge animation clips from
   * the other locomotion GLBs (walking, run, strafes, jump, turns). All
   * clips use the same Mixamo bone hierarchy so they play on the same
   * mixer with no retargeting.
   *
   * Root motion (Hips position track) is stripped from every clip — the
   * controller drives world position itself, so a baked-in hip translate
   * would make the model slide away from where it should be.
   */
  private loadPlayerLocomotion(): Promise<void> {
    const base = '/models/animations/';
    const clipMap: { name: string; path: string }[] = [
      { name: 'Idle',             path: base + 'idle.glb' },
      { name: 'Walk',             path: base + 'walking.glb' },
      { name: 'Run',              path: base + 'run.glb' },
      { name: 'Jump',             path: base + 'jump.glb' },
      { name: 'StrafeLeft',       path: base + 'left_strafe.glb' },
      { name: 'StrafeRight',      path: base + 'right_strafe.glb' },
      { name: 'StrafeLeftWalk',   path: base + 'left_strafe_walk.glb' },
      { name: 'StrafeRightWalk',  path: base + 'right_strafe_walk.glb' },
      { name: 'TurnLeft',         path: base + 'left_turn.glb' },
      { name: 'TurnRight',        path: base + 'right_turn.glb' },
    ];

    const loadOne = (path: string) =>
      new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((res, rej) => {
        this.gltfLoader.load(
          path,
          (gltf) => res({ scene: gltf.scene, animations: gltf.animations }),
          undefined,
          (err) => rej(err),
        );
      });

    return (async () => {
      try {
        // First file is idle — it provides the skinned mesh whose bone
        // hierarchy matches every other locomotion clip (all are Mixamo
        // exports). Trying to use a non-Mixamo-rigged character mesh
        // here means the animation tracks fail to bind (the model just
        // stands in T-pose), so we keep this skeleton authoritative.
        const first = await loadOne(clipMap[0].path);
        const group = first.scene;
        group.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            this.upgradeToStandard(child);
            if (child instanceof THREE.SkinnedMesh && child.geometry) {
              child.geometry.computeBoundingBox();
              child.geometry.computeBoundingSphere();
            }
          }
        });

        const merged: THREE.AnimationClip[] = [];
        if (first.animations[0]) {
          const c = first.animations[0].clone();
          c.name = 'Idle';
          merged.push(this.stripRootMotion(c));
        }

        const rest = await Promise.all(
          clipMap.slice(1).map(async (entry) => {
            try {
              const g = await loadOne(entry.path);
              const c = g.animations[0];
              if (!c) return null;
              const cloned = c.clone();
              cloned.name = entry.name;
              return this.stripRootMotion(cloned);
            } catch (err) {
              console.warn(`[AssetManager] Locomotion clip ${entry.name} failed:`, err);
              return null;
            }
          }),
        );
        for (const c of rest) if (c) merged.push(c);

        const footOffsetY = computeFootOffset(group);
        this.playerTemplate = { group, animations: merged, footOffsetY };
        console.log(
          '[AssetManager] Player locomotion loaded:',
          merged.map((c) => c.name).join(', '),
          `(footOffsetY=${footOffsetY.toFixed(3)})`,
        );
      } catch (err) {
        console.warn('[AssetManager] Player locomotion failed (using procedural fallback):', err);
      }
    })();
  }

  /**
   * Remove translation tracks on the root/hips bone so animation playback
   * doesn't displace the model in world space. Rotation tracks on the same
   * bone are preserved (they're how the spine bends/leans).
   */
  private stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
    // Track names look like 'mixamorigHips.position' or 'Armature.position'.
    // Only strip translation on the actual root bone — not, e.g., a child
    // 'LeftHipExtra' joint that happens to contain 'hip'. Anchoring on
    // word-boundary 'Hips' or 'Root' (and the explicit 'Armature' root
    // common in non-Mixamo rigs) is safer than a broad /hip|root/.
    clip.tracks = clip.tracks.filter((t) => {
      const isRootBone = /(^|[._:|])(mixamorigHips|Hips|Root|Armature)\.position$/i.test(t.name);
      return !isRootBone;
    });
    return clip;
  }

  /**
   * Load a creature model template. Despite the historical name, this
   * accepts both `.fbx` and `.glb` — the loader is picked by extension:
   *   - `.glb` / `.gltf`  → GLTFLoader (preferred; smaller, PBR-friendly)
   *   - anything else     → FBXLoader  (legacy Quaternius / Mixamo rigs)
   *
   * Farm + fish huntables ship as GLB now (converted from the original
   * Quaternius OBJ). Hostile rigs that need skinned animation still come
   * in as FBX. The post-load pipeline (tint material, foot-offset, shadow
   * flags) is shared so callers don't care which loader ran.
   */
  private loadEnemyFBX(def: EnemyModelDef): Promise<void> {
    return new Promise<void>((resolve) => {
      // Texture is optional — the easy_animated creature pack ships
      // texture-less and relies on a flat tint, while the legacy humanoid
      // rigs each have their own albedo PNG. Empty `texturePath` skips
      // the load entirely so we don't spam 404s into the console.
      let texture: THREE.Texture | null = null;
      if (def.texturePath) {
        texture = this.textureLoader.load(def.texturePath);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.anisotropy = this.maxAnisotropy;
        this.allTextures.push(texture);
      }

      const finish = (root: THREE.Object3D, animations: THREE.AnimationClip[], isGlb: boolean) => {
        // ── Auto-normalize scale for GLB enemies ───────────────────────────
        // FBX creatures use hand-tuned scales from creatures.ts (0.012, 0.014,
        // etc.). GLB models from attached_assets export at wildly varying
        // units — the lava_monster is 60 m tall while the snail_monster is
        // 0.3 m. When def.scale === 1.0 (the GLB default in creatures.ts),
        // auto-normalize so the creature fits a target height envelope based
        // on its threat level. Otherwise trust the hand-tuned scale.
        if (def.scale === 1.0 && isGlb) {
          root.scale.setScalar(1.0);
          root.updateMatrixWorld(true);
          const rawBox = new THREE.Box3().setFromObject(root);
          const rawH = rawBox.max.y - rawBox.min.y;
          // Threat-scaled target height: TL1 = 1.0m, TL2 = 1.4m, TL3 = 1.8m, TL4 = 2.4m, TL5 = 3.2m
          const threatLevel = (this.enemyDefs.find(d => d.key === def.key) as any)?.threatLevel ?? 3;
          const targetH = [1.0, 1.0, 1.4, 1.8, 2.4, 3.2][Math.min(threatLevel, 5)];
          const fitScale = rawH > 0.01 ? targetH / rawH : 1.0;
          root.scale.setScalar(fitScale);
          console.log(`[AssetManager] Auto-scale GLB '${def.key}': rawH=${rawH.toFixed(2)}m → targetH=${targetH}m (scale=${fitScale.toFixed(4)})`);
        } else {
          root.scale.setScalar(def.scale);
        }

        // ── Material setup ─────────────────────────────────────────────────
        // For GLB models: preserve their embedded PBR materials and textures
        // instead of replacing with a flat tint. Only FBX creatures (which
        // often have no proper materials) get the override material. GLB
        // models from Sketchfab ship with full PBR setups that look much
        // better when preserved.
        if (isGlb && !texture) {
          // Preserve GLB materials — just enable shadows and track geometry
          root.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // Upgrade Lambert/Phong to Standard for PBR consistency
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              for (let i = 0; i < mats.length; i++) {
                const m = mats[i];
                if (m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial) {
                  const std = new THREE.MeshStandardMaterial({
                    color: (m as any).color,
                    map: (m as any).map,
                    roughness: 0.8,
                    metalness: 0.05,
                    envMapIntensity: 0.5,
                  });
                  if (Array.isArray(child.material)) (child.material as THREE.Material[])[i] = std;
                  else child.material = std;
                  this.allMaterials.push(std);
                  m.dispose();
                }
              }
              if (child.geometry) this.allGeometries.push(child.geometry);
            }
          });
        } else {
          // FBX path or explicit texture override — replace all materials
          const mat = new THREE.MeshStandardMaterial({
            map:             texture ?? undefined,
            color:           texture ? 0xffffff : (def.color ?? 0xaaaaaa),
            roughness:       0.82,
            metalness:       0.05,
            envMapIntensity: 0.5,
          });
          this.allMaterials.push(mat);

          root.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (Array.isArray(child.material)) {
                child.material = child.material.map(() => mat);
              } else {
                child.material = mat;
              }
              if (child.geometry) this.allGeometries.push(child.geometry);
            }
          });
        }

        // Measured *after* scale.setScalar above, so the bbox is in
        // post-scale local units. Saves us from re-measuring per spawn.
        const footOffsetY = computeFootOffset(root);
        this.enemyTemplates.set(def.key, {
          group: root as THREE.Group,
          animations,
          scale: def.scale,
          yOffset: def.yOffset,
          footOffsetY,
        });
        resolve();
      };

      const isGltf = /\.(glb|gltf)$/i.test(def.fbxPath);
      if (isGltf) {
        this.gltfLoader.load(
          def.fbxPath,
          (gltf) => finish(gltf.scene, gltf.animations ?? [], true),
          undefined,
          (err) => {
            console.warn(`[AssetManager] GLB failed (${def.key}):`, err);
            resolve();
          },
        );
      } else {
        this.fbxLoader.load(
          def.fbxPath,
          (fbx) => finish(fbx, fbx.animations, false),
          undefined,
          (err) => {
            console.warn(`[AssetManager] FBX failed (${def.key}):`, err);
            resolve();
          },
        );
      }
    });
  }

  /**
   * Stylized Guns FBX is a single mesh with all guns on a shared atlas.
   * We load it as a template; weapon code can clone + sub-mesh-extract later.
   */
  private loadStylizedGunsFBX(): Promise<void> {
    return new Promise<void>((resolve) => {
      Promise.allSettled([
        this.loadTexture('guns_albedo',    '/models/Stylized_Guns_BaseColor.png', { srgb: true }),
        this.loadTexture('guns_normal',    '/models/Stylized_Guns_Normal.png',    { srgb: false }),
        this.loadTexture('guns_roughness', '/models/Stylized_Guns_Roughness.png', { srgb: false }),
      ]).then(() => {
        this.fbxLoader.load(
          '/models/Stylized_Guns.fbx',
          (fbx) => {
            const mat = new THREE.MeshStandardMaterial({
              map: this.getTexture('guns_albedo') ?? undefined,
              normalMap: this.getTexture('guns_normal') ?? undefined,
              roughnessMap: this.getTexture('guns_roughness') ?? undefined,
              roughness: 0.85,
              metalness: 0.45,
              envMapIntensity: 1.0,
            });
            this.allMaterials.push(mat);

            fbx.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = mat;
                if (child.geometry) this.allGeometries.push(child.geometry);
              }
            });

            this.stylizedGunsTemplate = fbx;
            resolve();
          },
          undefined,
          (err) => {
            console.warn('[AssetManager] Stylized Guns FBX failed:', err);
            resolve();
          }
        );
      });
    });
  }

  private upgradeToStandard(mesh: THREE.Mesh | THREE.SkinnedMesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m, i) => {
      if (m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial) {
        // MeshPhysicalMaterial gives us a `sheen` channel — perfect for cloth.
        // The character is a survivor in fabric clothing, so a soft warm sheen
        // catches grazing light convincingly without needing custom shaders.
        const std = new THREE.MeshPhysicalMaterial({
          color: (m as THREE.MeshLambertMaterial).color,
          map: (m as THREE.MeshLambertMaterial).map,
          roughness: 0.78,
          metalness: 0.05,
          envMapIntensity: 0.7,
          sheen: 0.55,
          sheenRoughness: 0.85,
          sheenColor: new THREE.Color(0xffd9b0),
          clearcoat: 0.05,
          clearcoatRoughness: 0.8,
        });
        if ((m as THREE.MeshLambertMaterial).map) {
          (m as THREE.MeshLambertMaterial).map!.colorSpace = THREE.SRGBColorSpace;
        }
        if (Array.isArray(mesh.material)) {
          (mesh.material as THREE.Material[])[i] = std;
        } else {
          mesh.material = std;
        }
        this.allMaterials.push(std);
        m.dispose();
      }
    });
  }

  clonePlayerTemplate(): {
    group: THREE.Group;
    mixer: THREE.AnimationMixer | null;
    animations: THREE.AnimationClip[];
    footOffsetY: number;
  } | null {
    if (!this.playerTemplate) return null;
    // SkeletonUtils.clone is required for SkinnedMesh — the default
    // Object3D.clone() copies bone Object3Ds but leaves the cloned
    // SkinnedMesh.skeleton.bones array pointing at the *original* bones.
    // The mixer would then animate the new clones while the mesh renders
    // the original bind pose (character looks frozen/invisible).
    const cloned = SkeletonUtils.clone(this.playerTemplate.group) as THREE.Group;
    const mixer = this.playerTemplate.animations.length > 0
      ? new THREE.AnimationMixer(cloned)
      : null;
    return {
      group: cloned,
      mixer,
      animations: this.playerTemplate.animations,
      footOffsetY: this.playerTemplate.footOffsetY,
    };
  }

  cloneEnemyTemplate(key: string): {
    group: THREE.Group;
    mixer: THREE.AnimationMixer | null;
    animations: THREE.AnimationClip[];
    footOffsetY: number;
  } | null {
    const template = this.enemyTemplates.get(key);
    if (!template) return null;
    // SkeletonUtils handles SkinnedMesh skeleton remapping automatically
    // (see clonePlayerTemplate for why this matters). The previous manual
    // re-bind worked for some FBX rigs but mis-rendered others.
    const cloned = SkeletonUtils.clone(template.group) as THREE.Group;
    const mixer = template.animations.length > 0 ? new THREE.AnimationMixer(cloned) : null;
    return {
      group: cloned,
      mixer,
      animations: template.animations,
      footOffsetY: template.footOffsetY,
    };
  }

  getLoadedEnemyKeys(): string[] {
    return Array.from(this.enemyTemplates.keys());
  }

  dispose() {
    this.allTextures.forEach((t) => t.dispose());
    this.allGeometries.forEach((g) => g.dispose());
    this.allMaterials.forEach((m) => m.dispose());
    this.envMap?.dispose();
    this.allTextures = [];
    this.allGeometries = [];
    this.allMaterials = [];
    this.texCache.clear();
    this.enemyTemplates.clear();
    this.playerTemplate = null;
    this.stylizedGunsTemplate = null;
    this.envMap = null;
  }
}

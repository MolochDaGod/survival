import * as THREE from 'three';
import { SceneBuilder } from './SceneBuilder';
import { PlayerController } from './PlayerController';
import { EnemyManager } from './EnemyManager';
import { AbilitySystem } from './AbilitySystem';
import { AssetManager } from './AssetManager';
import { installBVH, buildBVHsForScene, collectOccluders } from './BVHRaycast';
import { setGroundScene } from './GroundSampler';
import { PerfMonitor } from './PerfMonitor';
import { PortraitRenderer } from './PortraitRenderer';
import { PlayerStats, GameState } from './types';
import { INITIAL_PLAYER_STATS, KEYBINDS, ABILITIES } from './constants';
import { Inventory } from './Inventory';
import { LootManager } from './LootManager';
import { ItemDef } from './Items';
import { AudioManager } from './AudioManager';
import { DamageNumbers } from './DamageNumbers';
import { GamepadInput } from './GamepadInput';
import { DebugPanel } from './DebugPanel';
import { TUNING_THIRD_PERSON, TUNING_ARPG } from './ThirdPersonCamera';
import { CombatFX } from './CombatFX';
import { CharacterConfig, DEFAULT_CHARACTER_CONFIG, getStartingLoadout } from './CharacterConfig';
import { WEAPONS } from './constants';
import type { WeaponStats } from './types';
import { FogSystem } from './world/FogSystem';
import { RainSystem } from './world/RainSystem';
import { WeatherSystem } from './world/WeatherSystem';
import { getFogOfWar } from './world/FogOfWar';
import { getResourceSystem } from './world/ResourceSystem';
import { getNPCManager } from './ai/NPCManager';
import { getSaveGameService } from './SaveGameService';
import { ProfessionsService } from './progression/ProfessionsService';
import { StatProgressionService } from './progression/StatProgressionService';
import { ModularBuilding, SurvivalProvider, ModularBuildingSnapshot } from './building/ModularBuilding';
import { DoorSystem } from './world/DoorSystem';
import { InteriorPortalSystem } from './world/InteriorPortalSystem';
import { SwimController } from './world/water/SwimController';
import { FishingSystem } from './world/water/FishingSystem';
import { BoatSystem } from './world/water/BoatSystem';
import { ClimbController } from './world/ClimbController';
import { groundY } from './GroundSampler';
import { CitySpawner } from './ai/CitySpawner';
import { initPhysics, PhysicsWorld } from './physics/PhysicsWorld';
import { buildMapColliders, MapColliderHandle } from './physics/MapColliders';
import { BreakableWallSystem } from './world/BreakableWallSystem';
import { MultiplayerSystem } from './net/MultiplayerSystem';
import { ProjectileSystem } from './projectiles/ProjectileSystem';
import { getBulletTemplate, DEFAULT_BULLET_OPTS } from './projectiles/Bullets';
import { MuzzleFlash } from './vfx/MuzzleFlash';
import { ImpactSparks } from './vfx/ImpactSparks';
import { SlashVFX } from './vfx/SlashVFX';
import { ShockwaveVFX } from './vfx/ShockwaveVFX';
import { TelegraphField } from './vfx/TelegraphField';
import { SplineProjectileField } from './vfx/SplineProjectileField';
import { SlashWaveField } from './vfx/SlashWaveField';
import { SectorDeployment } from './world/SectorDeployment';
import type { CombatVfxBridge } from './CombatVfxBridge';
import { SurvivorSpawner, type SurvivorSpawnerSnapshot } from './township/SurvivorSpawner';
import { getQuestSystem } from './quest/QuestSystem';
import {
  createIntroQuest,
  createSectorQuests,
  createFactionPledgeQuests,
  ENCAMPMENT_NPCS,
} from './quest/EncampmentIntro';
import { EnemyCampSystem } from './world/EnemyCampSystem';
/** SURVIVAL era only — claim flag / benches / camp building buffs (not Warlords). */
import { CampClaimSystem, type CampClaimSnapshot } from './survival/camp';
import {
  bootstrapMiddleStarterCamp,
  middleCampPadWorld,
} from './world/MiddleCampBootstrap';
import { toonDef, isToonBodyId } from './toon/ToonSurvivalRoster';
import { normalizeToonHeight } from './toon/toonBoneRetarget';
import { loadRetargetedToonClips } from './toon/loadToonClips';
import { createGLTFLoader } from './loaders/createGLTFLoader';
import { BODY_TYPES } from './CharacterConfig';
import { getHandToolDef, harvestMultFor } from './HandToolCatalog';
import { GameModeController, type GameModeId } from './mode/GameModeController';
import { CinemaDirector } from './cinema/CinemaDirector';
import { AfkController } from './ai/AfkController';
import { EngagementRewards } from './progression/EngagementRewards';
import { runSurvivalRemakeBootstrap } from './remake/SurvivalRemakeBootstrap';
import { AllyCombatSystem } from './ai/AllyCombatSystem';
import { REMAKE_SPAWN_LORE } from './remake/SurvivalRemakeConfig';
import { LoreGameLoop } from './lore/LoreGameLoop';
import { getUnlockedCodex } from './lore/LoreCodex';
import { getReputationService } from './faction/ReputationService';
import { FactionAiDirector } from './faction/FactionAiDirector';
import type { FactionId } from '../data/factions';
import {
  applyOutdoorEnvironment,
  loadPolyHavenEnvironment,
} from './world/polyhaven/PolyHavenEnvironment';
import { getMilestoneEffects, mergeEffectBags, readEffect, type MilestoneEffectBag } from '@workspace/game-systems/perks';
import { sumPassives, getUnlockedPerks, getUnlockedCombos, type StatTrack } from './progression/PerkSystem';
import { engineAssets } from './EngineAssets';
import { preloadCompressedDecoders } from './loaders/createGLTFLoader';

export class GameEngine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  assetManager: AssetManager;
  sceneBuilder!: SceneBuilder;
  player!: PlayerController;
  enemyManager!: EnemyManager;
  abilitySystem: AbilitySystem;
  perfMonitor!: PerfMonitor;
  inventory!: Inventory;
  lootManager!: LootManager;
  audio: AudioManager;
  combatFX: CombatFX = new CombatFX();
  damageNumbers!: DamageNumbers;
  gamepad!: GamepadInput;
  debugPanel!: DebugPanel;
  fogSystem!: FogSystem;
  rainSystem!: RainSystem;
  weatherSystem!: WeatherSystem;
  /** Modular building system (foundation, walls, doors, roofs, ...). */
  modularBuilding?: ModularBuilding;
  /** Open/close interaction for map doors + placed mb_door pieces. */
  doorSystem?: DoorSystem;
  /** Tracks "Enter Building / Exit Building" portal state per door proxy
   *  and toggles LAYERS.INTERIOR on the camera when crossing thresholds. */
  interiorPortalSystem?: InteriorPortalSystem;
  /** Ambient rigged NPCs in the starter city — wander, react, talk. */
  citySpawner?: CitySpawner;
  /** Handles damage, fracture animation, and resource drops for GLB walls/ceilings. */
  breakableWallSystem?: BreakableWallSystem;
  /** RTS survivor camp system — spawns wild survivors, manages camp production + raids. */
  survivorSpawner?: SurvivorSpawner;
  /**
   * Survival-era claim flag / benches / building buffs.
   * Spawns unarmed race-variant guardian on claim. Not used by Warlords.
   */
  campClaim?: CampClaimSystem;
  /** Procedural enemy camps (200–500 m from player) with raid missions. */
  enemyCampSystem?: EnemyCampSystem;
  /** Central play-mode authority (combat / harvest / build / cinema / afk / ui). */
  gameMode = new GameModeController();
  /** Cinematic camera rails + MediaRecorder capture. */
  cinema?: CinemaDirector;
  /** AFK auto-defend / harvest / camp scripts. */
  afk?: AfkController;
  /** Session streaks, milestones, mode mastery rewards. */
  engagement = new EngagementRewards();
  /** Recruited allies engage hostiles (living-NPC combat assist). */
  allyCombat = new AllyCombatSystem();
  /** Survivor's loop + settlement buffs + recruit lore. */
  loreLoop: LoreGameLoop | null = null;
  /** Factions are AI players — world event pressure. */
  factionAi = new FactionAiDirector();
  private _remakeReady = false;
  private _gameTimeSec = 0;
  private _pendingCampSnapshot: CampClaimSnapshot | null = null;
  private _pendingRepSnapshot: import('./faction/ReputationService').ReputationSnapshot | null = null;
  /** HUD: mode / AFK / cinema / toast. */
  onGameModeChange: ((mode: GameModeId, label: string) => void) | null = null;
  onEngagementToast: ((title: string, body: string) => void) | null = null;
  onCinemaRecordReady: ((url: string) => void) | null = null;
  /** Intro / cinema lore title cards for HUD. */
  onCinemaTitleCard: ((title: string, subtitle: string) => void) | null = null;
  private _modeKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _modeMasteryTimer = 0;
  /** Aggregated perk effect bag — refreshed once per second, read every frame. */
  perkEffects: MilestoneEffectBag = {};
  /**
   * Called by BreakableWallSystem when a wall breaks and drops resources.
   * GameCanvas wires this to append items to the survivalStacks React state.
   */
  onSurvivalLootDrop: ((itemId: string, count: number) => void) | null = null;
  /** UI subscribes to interaction prompts. The label is a free-form string
   *  that may embed a "Press X" hint (consumed by GameCanvas to render the
   *  right keycap glyph). Resolved through resolveInteractionPrompt() with
   *  priority portal > door > NPC. */
  onInteractionPrompt: ((label: string | null) => void) | null = null;
  /** Fires when the player presses INTERACT next to a PrefabSystem instance
   *  with a non-null `interaction` id. The UI wires this to open market /
   *  craft / vehicle panels (e.g. 'market:auction' on the caravan). */
  onPrefabInteract: ((interaction: string, prefabId: string) => void) | null = null;
  private _lastDoorLabel: string | null = null;
  private _lastNpcLabel: string | null = null;
  private _lastBoatLabel: string | null = null;
  private _lastFishLabel: string | null = null;
  private _lastPrefabLabel: string | null = null;
  private _lastCampLabel: string | null = null;
  private _lastEmittedPrompt: string | null = null;

  /** Water-layer subsystems — built after player + sceneBuilder exist.
   *  swim drives wading/swimming/oxygen; fishing handles cast→bite→reel
   *  on the existing LMB pipeline; boat listens on the unified INTERACT
   *  key (KeyE) for board/disembark. */
  private swimController: SwimController | null = null;
  private climbController: ClimbController | null = null;
  private fishingSystem: FishingSystem | null = null;
  private boatSystem: BoatSystem | null = null;
  /** Survival provider passed into ModularBuilding; UI swaps it in via setSurvivalProvider. */
  private survivalProvider: SurvivalProvider = {
    getCount: () => 0,
    consumeOne: () => false,
  };
  /** Snapshot waiting to be restored once the building system is ready. */
  private _pendingBuildingSnapshot: ModularBuildingSnapshot | null = null;

  /** Rapier physics world. Owns the player capsule + static map colliders.
   * Initialised asynchronously during boot — `physics` is null until the
   * Rapier WASM blob has been instantiated. NPCs / projectiles / doors /
   * loot still use the BVH path; only the player is on Rapier today. */
  physics: PhysicsWorld | null = null;
  /** Disposer for the static trimesh colliders baked from the loaded map.
   * Held so we can rebuild colliders cleanly if the map ever swaps. */
  private mapColliders: MapColliderHandle | null = null;

  /** Off-screen "portrait camera" — the equipment book mounts this
   * renderer's 2D canvas to show a live render of the player from in
   * front of them. Only renders while it's been activated, so cost is
   * zero when no book is open. */
  portraitRenderer: PortraitRenderer;

  /** Catches container size changes that don't fire window 'resize'
   * (mobile chrome collapse, iframe resize, devtools toggle). */
  private resizeObs: ResizeObserver | null = null;

  playerStats: PlayerStats;
  gameState: GameState;

  animFrameId: number = 0;
  lastTime: number = 0;
  private _perkRefreshTimer: number = 0;
  wave: number = 1;
  waveTimer: number = 0;
  waveCooldown: number = 15;
  private projectileSystem!: ProjectileSystem;
  private muzzleFlash!: MuzzleFlash;
  private impactSparks!: ImpactSparks;
  private slashVFX!: SlashVFX;
  private shockwaveVFX!: ShockwaveVFX;
  private telegraphField!: TelegraphField;
  private splineField!: SplineProjectileField;
  private slashWaveField!: SlashWaveField;
  private sectorDeployment = new SectorDeployment();
  private sectorBeatTimer = 0;
  private bulletTemplate: THREE.Object3D | null = null;
  assetsLoaded: boolean = false;

  onStatsUpdate: ((stats: PlayerStats) => void) | null = null;
  onGameStateUpdate: ((state: GameState) => void) | null = null;
  onAbilityCooldown: ((id: string, remaining: number) => void) | null = null;
  onCameraModeChange: ((mode: string) => void) | null = null;
  onLoadProgress: ((fraction: number) => void) | null = null;
  onAssetsLoaded: (() => void) | null = null;
  onInventoryUpdate: (() => void) | null = null;
  onItemPickup: ((def: ItemDef) => void) | null = null;

  characterConfig: CharacterConfig;

  /**
   * Captured during async asset load between `getStarterSpawn()` and the
   * `EnemyManager` constructor — applied via `setSpawnAnchor()` once the
   * manager exists. Lets us forbid spawns inside the encampment.
   */
  private _pendingSpawnAnchor: THREE.Vector3 | null = null;
  /** Cached mixers for named encampment NPCs — avoids scene.traverse every frame. */
  private _namedNpcMixers: THREE.AnimationMixer[] = [];
  /** Set true for one frame when the player presses interact near a quest NPC. */
  private _questInteractPressed = false;

  constructor(canvas: HTMLCanvasElement, characterConfig: CharacterConfig = DEFAULT_CHARACTER_CONFIG) {
    this.characterConfig = characterConfig;
    this.playerStats = { ...INITIAL_PLAYER_STATS };
    this.gameState = {
      paused: false,
      mainMenuOpen: true,
      skillTreeOpen: false,
      inventoryOpen: false,
      killCount: 0,
      score: 0,
      wave: 1,
      gameStarted: false,
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was deprecated in three r178+. PCF + shadow.radius
    // gives equivalent softness on most hardware without the deprecation warning.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Terrain streams in dynamically, so shadows must update every frame.
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    installBVH();
    this.perfMonitor = new PerfMonitor();
    this.audio = new AudioManager();
    this.gamepad = new GamepadInput(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c14);

    // Mount the co-op multiplayer remotes group early so RemotePlayer
    // instances created by the network layer (which can arrive before the
    // first frame) have somewhere visible to live.
    this.scene.add(MultiplayerSystem.remotesRoot);
    // Register the scene with the central ground sampler so all systems
    // (player, enemies, props) BVH-raycast against the same world.
    setGroundScene(this.scene);
    // Fog aura — wraps the 100 m player bubble; also manages gloom atmosphere.
    this.fogSystem  = new FogSystem(this.scene);
    this.rainSystem = new RainSystem(this.scene);
    // Weather scheduler — keeps the world dry most of the time and only
    // runs rain ~10% of the play session (see WeatherSystem.ts for math).
    this.weatherSystem = new WeatherSystem(this.rainSystem, this.fogSystem, 'dry');
    // Three-layer scene graph (World / Harvest / Actors / Vfx) + resources.
    import('./world/SceneGraphLayers').then(({ ensureSceneGraph }) => {
      ensureSceneGraph(this.scene);
    }).catch(() => {});
    // Initialise the resource system for this scene (singleton).
    const resSys = getResourceSystem(this.scene);
    // Wire SWG-style profession XP onto every harvest. Node id determines
    // which profession gets the XP; the chemistry side-grant covers
    // herbs/fish (intermediate inputs for cooking and brewing).
    resSys.onHarvest = (node /*, _loot */) => {
      const id = node.defId;
      let prof: import('./progression/Professions').Profession = 'gathering';
      let amount = 8;
      switch (id) {
        case 'timber_log':       prof = 'gathering'; amount = 6;  break;
        case 'wild_herbs':       prof = 'gathering'; amount = 5;
          ProfessionsService.gainXp('chemistry', 4);
          break;
        case 'hemp_plant':       prof = 'gathering'; amount = 6;  break;
        case 'scrap_pile':       prof = 'gathering'; amount = 9;  break;
        case 'iron_ore':         prof = 'gathering'; amount = 10; break;
        case 'permafrost_ore':   prof = 'gathering'; amount = 12; break;
        case 'copper_deposit':   prof = 'gathering'; amount = 8;  break;
        case 'flint_outcrop':    prof = 'gathering'; amount = 4;  break;
        case 'frozen_pond':      prof = 'hunting';   amount = 8;
          ProfessionsService.gainXp('chemistry', 4);
          break;
        default:                 prof = 'gathering'; amount = 5;
      }
      ProfessionsService.gainXp(prof, amount);
    };
    // Initialise the NPC manager's player-position array.
    getNPCManager().playerPositions = [];
    // Far plane extended for open-world terrain (7×7 chunks, ~900 m radius).
    // Fog (density=0.0018) hides everything past ~600 m, so the extra range
    // only costs frustum-cull overhead, which is cheap.
    {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      this.camera = new THREE.PerspectiveCamera(75, w / h, 0.05, 1400);
    }

    this.assetManager = new AssetManager(this.renderer);
    this.assetManager.buildEnvironment();
    this.scene.environment = this.assetManager.envMap;

    // Live "paperdoll" portrait — UI grabs `portraitRenderer.canvas`
    // and mounts it. Constructed early so the canvas reference exists
    // before the player asset boot finishes; the update tick no-ops
    // until both `setActive(true)` is called *and* the player exists.
    this.portraitRenderer = new PortraitRenderer(
      this.renderer,
      this.scene,
      () => this.player ? { playerGroup: this.player.playerGroup, bodyYaw: this.player.bodyYaw } : null,
    );

    this.abilitySystem = new AbilitySystem(this.scene, this.camera);
    this.abilitySystem.onAbilityUsed = (id, remaining) => {
      this.onAbilityCooldown?.(id, remaining);
    };

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    // ResizeObserver catches container size changes that don't fire a
    // window resize event — e.g. mobile browser chrome collapsing, the
    // Replit preview iframe being resized, devtools opening, or the
    // HUD strip CSS var changing. Without this the renderer would
    // stretch/squash until the user manually resized the window.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.onResize());
      this.resizeObs.observe(this.renderer.domElement);
    }
    document.addEventListener('keydown', this.handleAbilityKey);
    document.addEventListener('keydown', this.handleMenuKey);
    // R rotates the active build ghost. Capture so it runs before any other
    // listener that may swallow R for its own purposes.
    document.addEventListener('keydown', this.handleBuildRotateKey);
    // Capture-phase left-click placement: when build mode is active we
    // intercept the click before PlayerController.startAttack fires.
    document.addEventListener('mousedown', this.handleBuildPlaceClick, true);
    // Same capture-phase trick for fishing rod LMB. When the rod is the
    // active tool and the player is looking at water, the click drives the
    // fishing minigame instead of a weapon swing.
    document.addEventListener('mousedown', this.handleFishingClick, true);

    // Pre-warm Draco/Basis paths + Nexus engine manifest *before* GLB boot
    // so compressed models and camera/controller profiles are ready.
    // Capture locals so TS definite-assignment is happy inside the async chain.
    const bootAssetManager = this.assetManager;
    const bootCharacterConfig = this.characterConfig;
    const bootAfterAssets = async (): Promise<void> => {
      try {
        await Promise.all([
          engineAssets.boot(),
          preloadCompressedDecoders(),
        ]);
      } catch (err) {
        console.warn('[GameEngine] EngineAssets / decoder preload degraded:', err);
      }

      await bootAssetManager.loadAll((fraction) => {
        this.onLoadProgress?.(fraction);
      }, bootCharacterConfig);

      this.assetsLoaded = true;

      // Bring up Rapier BEFORE SceneBuilder. The WASM blob is ~600 KB and
      // cached aggressively (init typically <100 ms after first visit), so
      // the parallelism we used to chase here was negligible compared to
      // GLB loading inside buildEnvironment(). Initialising up-front lets
      // TerrainBuilder + WorldChunkManager bake matching Rapier colliders
      // for the arena disk and every streamed heightfield as the world is
      // assembled — no second pass needed.
      try {
        await initPhysics();
        this.physics = new PhysicsWorld();
        // Harvestables get PROP colliders + sensors once physics is live.
        getResourceSystem(this.scene).setPhysics(this.physics);
      } catch (err) {
        // Don't crash the boot — PlayerController falls back to its
        // legacy BVH-raycast path when physics is null. We just lose the
        // real-walls/real-ground behaviour.
        console.error('[GameEngine] Rapier init failed; continuing without physics:', err);
      }

      this.sceneBuilder = new SceneBuilder(this.scene, this.assetManager, this.physics);
      // Awaiting ensures all 4 GLB world locations are in the scene before
      // gameplay starts. GLB progress is reported via assetManager.onProgress.
      await this.sceneBuilder.buildEnvironment();

      const outdoor = await loadPolyHavenEnvironment(this.renderer);
      if (outdoor) {
        applyOutdoorEnvironment(this.scene, outdoor, { backgroundBlend: 0.5 });
        this.assetManager.envMap = outdoor.envMap;
        console.info('[GameEngine] Poly Haven outdoor HDR IBL active');
      }

      // With both the map and the physics world ready, bake static trimesh
      // colliders against every mesh in the loaded starter map root. This
      // is what makes "ground", "wall", "tree" actually mean something to
      // the player capsule instead of being heuristic raycast hits.
      const mapRoot = this.sceneBuilder.getStarterMapRoot();
      if (this.physics && mapRoot) {
        this.mapColliders = buildMapColliders(this.physics, mapRoot);
        console.log(`[GameEngine] Rapier map colliders baked: ${this.mapColliders.count} trimeshes`);
      }

      // Floating damage numbers + runtime debug GUI live alongside the scene.
      this.damageNumbers = new DamageNumbers(this.scene);
      // Projectile system replaces the inline bullet array.
      this.projectileSystem = new ProjectileSystem(this.scene);
      this.muzzleFlash = new MuzzleFlash(this.scene);
      this.impactSparks = new ImpactSparks(this.scene);
      this.slashVFX = new SlashVFX(this.scene);
      this.shockwaveVFX = new ShockwaveVFX(this.scene);
      this.telegraphField = new TelegraphField(this.scene);
      this.splineField = new SplineProjectileField(this.scene);
      this.slashWaveField = new SlashWaveField(this.scene, (pos, color, scale) => {
        this.impactSparks?.burst(pos, null, color, scale);
      });
      this.sectorDeployment.attachFog(this.fogSystem);
      this.sectorDeployment.onSectorEnter = (beat) => {
        this.gameState.sectorTitle = beat.title;
        this.gameState.sectorObjective = beat.objective;
        this.sectorBeatTimer = 5.5;
        this.onGameStateUpdate?.({ ...this.gameState });
      };
      this.abilitySystem.vfxBridge = this._buildCombatVfxBridge();
      getBulletTemplate().then(tmpl => { this.bulletTemplate = tmpl; }).catch(() => { });
      this.debugPanel = new DebugPanel({
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        // Hand the live tuning singletons to the debug panel — they're the
        // exact same object PlayerController reads each frame, so slider
        // edits are immediately visible in the camera.
        tpTuning:   TUNING_THIRD_PERSON,
        arpgTuning: TUNING_ARPG,
        forceShadowUpdate: () => { this.renderer.shadowMap.needsUpdate = true; },
        resetPlayer: () => {
          if (!this.player) return;
          // Use teleportTo so the kinematic Rapier body is yanked to the
          // new origin too — a bare position.set() leaves the body at its
          // last simulated translation and the player visually snaps back
          // on the next physics step.
          const origin = new THREE.Vector3(0, 0, 0);
          if (this.physics) {
            this.player.teleportTo(origin);
          } else {
            this.player.position.copy(origin);
          }
        },
      });

      // BVH-accelerate every static collider for cheap raycasts (camera
      // occlusion, melee, click-to-move). Skinned/dynamic meshes are skipped.
      buildBVHsForScene(this.scene);

      // Force one shadow render now that lights + casters are in place,
      // then leave shadowMap.autoUpdate = false (set on the renderer above).
      this.renderer.shadowMap.needsUpdate = true;

      this.inventory = new Inventory();
      this.inventory.onPickup = (def) => this.onItemPickup?.(def);

      // Resolve starting weapons from the chosen Origin (background) so
      // gameplay actually reflects the player's character-creation choice.
      // Falls back to the historical sword + dagger pair if the loadout
      // references a weapon id that's no longer in WEAPONS.
      const loadout = getStartingLoadout(this.characterConfig.backgroundId);
      const findWeapon = (id: string): WeaponStats =>
        WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
      const startingWeapons: [WeaponStats, WeaponStats] = [
        findWeapon(loadout.weapons[0]),
        findWeapon(loadout.weapons[1]),
      ];

      this.player = new PlayerController(
        this.scene,
        this.camera,
        this.playerStats,
        this.assetManager,
        this.inventory,
        startingWeapons,
        this.physics,
      );

      // Seed inventory bag + equip primary melee so hand bones show the tool
      // and the Equipment panel can swap hatchet/pickaxe/etc.
      {
        const { makeUid } = await import('./Items');
        const primaryId = loadout.weapons[0];
        if (this.inventory && primaryId) {
          this.inventory.equipped.mainhand = { uid: makeUid(), defId: primaryId };
          for (const toolId of ['hatchet', 'pickaxe', 'knife'] as const) {
            if (toolId === primaryId) continue;
            this.inventory.addToBag({ uid: makeUid(), defId: toolId });
          }
          this.player.buildWeaponMesh();
        }
      }

      // ── Mode / cinema / engagement (AFK needs enemyManager — wired below) ─
      this.wireGameModesAndSystems();

      // TPS remake defaults (camera + tuning). Full remake runs after camp ready.
      runSurvivalRemakeBootstrap({
        player: this.player,
        sceneBuilder: this.sceneBuilder,
        campClaim: null,
        cinema: this.cinema,
        gameMode: this.gameMode,
        playArrivalCinema: false,
      });

      // If the handcrafted starter map is active, teleport the player to the
      // marker baked into the source GLB (`player` node). We lift them a
      // couple of metres so they drop onto the actual ground via the next
      // physics step (or GroundSampler tick on the legacy path), regardless
      // of where in Y the marker was placed.
      const starterSpawn = this.sceneBuilder.getStarterSpawn();
      if (starterSpawn) {
        const spawnPos = new THREE.Vector3(
          starterSpawn.x,
          starterSpawn.y + 2,
          starterSpawn.z,
        );
        // teleportTo handles both the position write AND the kinematic
        // body sync when physics is wired in. Falls back to a plain
        // position set when there's no Rapier body.
        if (this.physics) {
          this.player.teleportTo(spawnPos);
        } else {
          this.player.position.copy(spawnPos);
        }
      }

      // Tell the enemy manager where the player landed so it can carve a
      // safe zone around the encampment (no spawns within ~22m of this
      // anchor, even later in the run). Set BEFORE startGameplay() since
      // that is what kicks off the first wave.
      // (enemyManager is constructed a few lines below — anchor is applied
      // there once it exists.)
      this._pendingSpawnAnchor = starterSpawn ? starterSpawn.clone() : null;

      // BVH-backed occluders for camera dolly + wall-climb probes.
      const occluders = collectOccluders(this.scene);
      this.player.tpCamera.setOccluders(occluders);
      this.player.onStatChange = () => this.onStatsUpdate?.(this.playerStats);

      // wire inventory change → notify UI (after player is set so applyEquipmentStats fires first)
      const playerOnInvChange = this.inventory.onChange;
      this.inventory.onChange = () => {
        playerOnInvChange?.();
        this.onInventoryUpdate?.();
      };

      this.lootManager = new LootManager(this.scene, this.inventory);

      // ── Water-layer wiring ────────────────────────────────────────────
      // SwimController writes player.isSwimming/isSubmerged + externalSpeedMultiplier
      // each frame. Uses GroundSampler.groundY for the seabed/terrain height.
      this.swimController = new SwimController(
        this.player,
        this.sceneBuilder.water,
      );
      // Wire perk effects → swim stats (BIO → oxygen, ENT → regen, KIN → speed)
      this.swimController.readStat = (key) => readEffect(this.perkEffects, key);
      this.swimController.onSplash = (pos) => this.sceneBuilder?.splashFX.splash(pos);

      // ClimbController: raycast-based wall climbing tied to KIN/GRA stats.
      this.climbController = new ClimbController(this.player, this.camera);
      this.climbController.readStat = (key) => readEffect(this.perkEffects, key);
      this.climbController.setOccluders(occluders);

      // FishingSystem: triggered through handleFishingClick (LMB capture).
      this.fishingSystem = new FishingSystem(
        this.scene,
        this.sceneBuilder.water,
        this.player,
        this.inventory,
        this.camera,
      );
      this.fishingSystem.onSplash = (pos) => this.sceneBuilder?.splashFX.splash(pos);
      this.fishingSystem.onPrompt = (label) => {
        this._lastFishLabel = label;
        this.resolveInteractionPrompt();
      };

      // BoatSystem: own KeyE listener (mirrors DoorSystem). Attach now so
      // boards/disembarks work as soon as boats are spawned.
      this.boatSystem = new BoatSystem(this.scene, this.sceneBuilder.water);
      this.boatSystem.setPlayer(this.player);
      this.boatSystem.onPrompt = (label) => {
        this._lastBoatLabel = label;
        this.resolveInteractionPrompt();
      };
      this.boatSystem.attach();
      const deployBoat = this.sceneBuilder.getDeployGateBoatSpawn();
      const basePath = import.meta.env.BASE_URL;
      this.boatSystem.preload(basePath).then(() => {
        if (deployBoat) {
          this.boatSystem?.spawn({
            id: 'deploy-gate-boat',
            position: deployBoat,
            yaw: Math.PI,
            color: 0x5a4030,
            hasCabin: false,
          });
        }
      });

      this.enemyManager = new EnemyManager(this.scene, this.assetManager);
      // MMO sector combat: wave/trickle spawns prefer hostiles for active grid cell
      this.enemyManager.setHostilePoolProvider(() =>
        this.sectorDeployment.getHostileTypes(),
      );
      // AFK controller needs enemies + optional camp claim
      this.afk = new AfkController({
        player: this.player,
        enemyManager: this.enemyManager,
        campClaim: this.campClaim,
      });
      this.afk.onTickReward = (kind) => {
        if (kind === 'afk_minute') this.engagement.onAfkMinute();
      };
      // Apply the spawn anchor we captured earlier — the encampment hub
      // becomes a permanent no-spawn zone of ~22m radius.
      if (this._pendingSpawnAnchor) {
        this.enemyManager.setSpawnAnchor(this._pendingSpawnAnchor);
      }
      // Open a 20-second intro grace so the player can get oriented before
      // anything wanders in. `startGameplay()` calls `spawnWave(1)` and the
      // per-frame trickle ticks immediately — both are gated on this timer.
      // Extended intro grace for encampment — player needs time to meet NPCs
      // and accept the intro quest before enemies wander in.
      this.enemyManager.setIntroGrace(this.sceneBuilder.isStarterMapMode() ? 45 : 20);
      this.enemyCampSystem = new EnemyCampSystem(
        this.scene,
        this.sceneBuilder.prefabs,
        this.enemyManager,
      );
      {
        const questSys = getQuestSystem();
        const priorComplete = questSys.onQuestComplete;
        questSys.onQuestComplete = (qid, reward) => {
          priorComplete?.(qid, reward);
          this.grantQuestRewards(qid, reward);
        };
      }
      this.enemyManager.onEnemyKilledAt = (exp, position, tier) => {
        this.gameState.killCount++;
        this.gameState.score += 100 + this.wave * 25;
        this.player.gainExperience(exp);
        this.engagement.onKill();
        this.lootManager.dropFromEnemy(position, tier);
        this.audio.play('kill');
        this.damageNumbers.spawn(position, exp, { color: 0x69f0ae });
        // SWG-style Hunting XP. Bosses are big-game, electives a step up.
        const baseHuntXp = tier === 'boss' ? 50 : tier === 'elite' ? 15 : 5;
        const huntXpBonus = ProfessionsService.getEffect('bountyXpBonus');
        ProfessionsService.gainXp('hunting', Math.round(baseHuntXp * (1 + huntXpBonus)));
        // Survival XP — staying alive long enough to make a kill counts.
        ProfessionsService.gainXp('survival', Math.max(1, Math.round(baseHuntXp * 0.4)));
        // Combat XP — credited per kill. Signature weapon (matches a learned
        // Combat branch) earns the spec's +25% bonus.
        const baseCombatXp = tier === 'boss' ? 40 : tier === 'elite' ? 12 : 4;
        const activeType = this.player.equippedWeapons[this.player.activeWeaponIndex]?.type ?? 'unarmed';
        const isSignature = ProfessionsService.isSignatureCombatWeapon(activeType);
        ProfessionsService.gainXp('combat', Math.round(baseCombatXp * (isSignature ? 1.25 : 1)));
        // Weapon XP — each kill feeds the unallocated pool that the player
        // routes onto the 8 Grudge Stats from the MainPanel.
        const weaponXp = tier === 'boss' ? 60 : tier === 'elite' ? 25 : 10;
        StatProgressionService.addWeaponXp(weaponXp);
        this.onGameStateUpdate?.(this.gameState);

        // Feed kill into quest system for kill-step tracking
        getQuestSystem().onEnemyKilled();
      };
      // Hook every damage event for floating numbers + impact SFX.
      this.enemyManager.onEnemyDamaged = (pos, dmg) => {
        this.damageNumbers.spawn(pos, dmg);
        this.audio.play('hit');
      };
      this.enemyManager.onEnemyShotHit = (dmg) => {
        this.player.takeDamage(dmg);
        this.audio.play('damage');
        this.onStatsUpdate?.(this.playerStats);
        this.abilitySystem.flashNoiseSphere(
          this.player.position.clone().add(new THREE.Vector3(0, 1, 0)),
          'damage', 0.5,
        );
      };
      // Loot pickup audio.
      const prevPickup = this.onItemPickup;
      this.onItemPickup = (def) => {
        this.audio.play('pickup');
        prevPickup?.(def);
      };

      // ── Modular building system ────────────────────────────────────────────
      // Pre-loads the kaykit_dungeon kit (foundation, wall, wall_door, door,
      // wall_window, wall_corner, floor, stairs, roof) so first placement is
      // instant. Survival counts live in the UI's React state — the engine
      // calls through `survivalProvider`, swapped in by GameCanvas at mount.
      this.modularBuilding = new ModularBuilding(this.scene, this.camera, this.survivalProvider);
      this.modularBuilding.preload(import.meta.env.BASE_URL).catch((e) => {
        console.warn('[GameEngine] modular building preload failed', e);
      }).then(() => {
        // Restore previously placed pieces (cloud save) if a snapshot was
        // queued during early hydration.
        if (this._pendingBuildingSnapshot && this.modularBuilding) {
          this.modularBuilding.restore(this._pendingBuildingSnapshot);
          this._pendingBuildingSnapshot = null;
        }
      });

      // ── Door interaction ──────────────────────────────────────────────────
      // Doors come from two sources: meshes inside the city GLB whose name
      // matches door/gate/entrance keywords (registered via SceneBuilder),
      // and player-placed mb_door pieces (registered here on every place).
      this.doorSystem = new DoorSystem();
      // Register any map doors that the GLBLocationSystem already discovered.
      const mapDoors = this.sceneBuilder.getDoorProxies();
      for (const d of mapDoors) {
        this.doorSystem.registerMeshDoor(d.mesh);
      }

      // ── Interior portals ─────────────────────────────────────────────────
      // Wraps every map door in a trigger volume, exposes nearDoorLabel for
      // the HUD, and toggles LAYERS.INTERIOR on the main camera as the
      // player crosses thresholds.
      this.interiorPortalSystem = new InteriorPortalSystem(this.scene, mapDoors);
      this.interiorPortalSystem.setCamera(this.camera);

      // Door + portal callbacks both feed into the prompt arbitrator
      // (resolveInteractionPrompt) so we always emit the highest-priority
      // label at the time of any change. Priority is portal > door > NPC.
      this.doorSystem.onProximityChange = (label) => {
        this._lastDoorLabel = label;
        this.resolveInteractionPrompt();
      };
      // Survival camp claim — claim flag → unarmed race guardian, benches, building buffs
      this.campClaim = new CampClaimSystem(this.scene);
      this.campClaim.setPlayerConfig(this.characterConfig ?? DEFAULT_CHARACTER_CONFIG);
      // Late-bind AFK + engagement (created before campClaim in boot order)
      if (this.afk) this.afk.campClaim = this.campClaim;
      {
        const prevClaim = this.campClaim.onClaimed;
        this.campClaim.onClaimed = (pos, race) => {
          prevClaim?.(pos, race);
          this.engagement.onFirstClaim();
        };
      }
      let restoredClaim = false;
      if (this._pendingCampSnapshot) {
        restoredClaim = true;
        this.campClaim.restore(this._pendingCampSnapshot).catch((e) =>
          console.warn('[GameEngine] camp claim restore failed', e),
        );
        this._pendingCampSnapshot = null;
      }

      // Quest 'claim' steps complete when CampClaimSystem has authority
      getQuestSystem().setClaimPredicate(() => this.campClaim?.isClaimed() === true);

      // Hook future placed doors so they become interactive immediately.
      // Also feed Survival CampClaimSystem (flags / benches / buildings).
      if (this.modularBuilding) {
        this.modularBuilding.onPlace = (pieceId, pos, group) => {
          if (pieceId === 'mb_door' || pieceId === 'mb_wall_door') {
            this.doorSystem?.registerPlacedDoor(group);
          }
          this.campClaim?.onStructurePlaced(pieceId, pos, group);
        };
      }

      // ── Ambient rigged NPCs in the city ──────────────────────────────────
      // Spawns a dozen wandering citizens around the player's spawn point,
      // each with idle/walk animation, YUKA wander steering, and a barker
      // line when the player walks up. They turn hostile if attacked
      // (NPCBrain.onPlayerAngered flips faction → ATTACK goal).
      this.citySpawner = new CitySpawner(this.scene, getNPCManager(), this.assetManager);
      this.citySpawner.campClaim = this.campClaim ?? null;
      this.citySpawner.onRecruit = () => {
        this.engagement.onFirstRecruit();
        this.loreLoop?.update(0);
      };
      // Lore game loop — survivor stages, cooking pot regen, smooth talker
      this.loreLoop = new LoreGameLoop(this.player, this.playerStats);
      this.loreLoop.attach(this.campClaim ?? null, this.citySpawner);
      this.loreLoop.onToast = (t, b) => this.onEngagementToast?.(t, b);
      this.loreLoop.onStageChange = (stage, blurb) => {
        this.gameState.sectorObjective = blurb;
        this.gameState.sectorBeatAge = 5;
        this.onGameStateUpdate?.({ ...this.gameState });
        this.onEngagementToast?.(`Loop: ${stage}`, blurb);
      };
      getReputationService().onToast = (t, b) => this.onEngagementToast?.(t, b);
      if (this._pendingRepSnapshot) {
        getReputationService().restore(this._pendingRepSnapshot);
        this._pendingRepSnapshot = null;
      }
      this.allyCombat.getAiAbilityMult = () => this.campClaim?.getAiAbilityMultiplier() ?? 1;
      const cityCentre = this._pendingSpawnAnchor ?? new THREE.Vector3();
      // In encampment mode, spawn fewer generic NPCs (named NPCs fill the key roles).
      // In open-world mode, keep the original 6.
      const genericCount = this.sceneBuilder.isStarterMapMode() ? 3 : 6;
      this.citySpawner.populate(cityCentre, genericCount, 35);
      this.citySpawner.onTalkPrompt = (label) => {
        this._lastNpcLabel = label;
        this.resolveInteractionPrompt();
      };

      // ── Middle-sector starter camp pad (Convergence Nexus origin) ────────
      // Fresh starts auto-claim so the player has authority immediately;
      // saved claims are left as-is. Structures register for benches/buffs.
      if (this.sceneBuilder.isStarterMapMode() && this.campClaim) {
        bootstrapMiddleStarterCamp({
          centre: cityCentre,
          campClaim: this.campClaim,
          autoClaim: !restoredClaim,
          alreadyClaimed: restoredClaim,
          prefabs: this.sceneBuilder.prefabs,
        }).catch((e) => console.warn('[GameEngine] Middle camp bootstrap failed:', e));
      }

      // ── Named encampment NPCs (toon operators from lore roster) ─────────
      // Spawned at fixed positions from EncampmentIntro.ts. Each gets a
      // unique id that the QuestSystem references in 'talk'/'return' steps.
      if (this.sceneBuilder.isStarterMapMode()) {
        const campPad = middleCampPadWorld(cityCentre);
        for (const npcDef of ENCAMPMENT_NPCS) {
          const pos = new THREE.Vector3(
            cityCentre.x + npcDef.offset.x,
            cityCentre.y,
            cityCentre.z + npcDef.offset.z,
          );
          const brain = getNPCManager().spawn({
            id: npcDef.id,
            faction: 'friendly' as any,
            walkSpeed: 0.4,
            runSpeed: 2,
            visionRange: 20,
            homePosition: pos.clone(),
          });
          // Named NPCs stand still near their post
          brain.setPosition(pos.x, pos.y, pos.z);
          brain.vehicle.maxSpeed = 0;

          // Prefer CDN toon mesh for lore cast; fall back to enemy template
          this.spawnNamedNpcMesh(npcDef.id, npcDef.bodyId, pos, brain).catch((err) => {
            console.warn(`[GameEngine] Toon NPC "${npcDef.id}" mesh failed:`, err);
            const tplKey = [...(this.assetManager.enemyTemplates.keys())][0];
            if (!tplKey) return;
            const tpl = this.assetManager.cloneEnemyTemplate(tplKey);
            if (!tpl) return;
            const wrapper = new THREE.Group();
            wrapper.name = npcDef.id;
            tpl.group.position.y = tpl.footOffsetY;
            wrapper.add(tpl.group);
            wrapper.position.copy(pos);
            this.scene.add(wrapper);
            brain.mesh = wrapper;
            if (tpl.mixer && tpl.animations.length > 0) {
              const idleClip =
                tpl.animations.find((a) => /idle|stand/i.test(a.name)) ?? tpl.animations[0];
              tpl.mixer.clipAction(idleClip).play();
              this._namedNpcMixers.push(tpl.mixer);
            }
          });
        }

        // Register + activate the intro quest, then sector quests on completion
        const questSys = getQuestSystem();
        questSys.register(createIntroQuest(cityCentre, this.enemyManager, campPad));
        // Pre-register sector + faction pledge quests (inactive until intro finishes)
        const sectorQuests = createSectorQuests();
        for (const sq of sectorQuests) questSys.register(sq);
        const pledgeQuests = createFactionPledgeQuests();
        for (const pq of pledgeQuests) questSys.register(pq);
        const priorComplete = questSys.onQuestComplete;
        questSys.onQuestComplete = (qid, reward) => {
          priorComplete?.(qid, reward);
          // When the intro quest finishes, unlock sector roads + banner paths
          if (qid === 'encampment_intro') {
            for (const sq of sectorQuests) {
              questSys.activate(sq.id);
              console.log(`[Quest] Activated sector quest: ${sq.title}`);
            }
            for (const pq of pledgeQuests) {
              questSys.activate(pq.id);
              console.log(`[Quest] Activated pledge quest: ${pq.title}`);
            }
          }
          // Completing a pledge quest suggests the oath — player confirms via API
          if (qid.startsWith('pledge_')) {
            const map: Record<string, FactionId> = {
              pledge_keepers: 'keepers',
              pledge_scavengers: 'tech_scavengers',
              pledge_hollow: 'hollow_lords',
              pledge_network: 'network',
              pledge_forgotten: 'forgotten',
            };
            const fid = map[qid];
            if (fid) {
              this.onEngagementToast?.(
                'Oath ready',
                `Call engine.pledgeFaction('${fid}') or use the camp banner panel to swear.`,
              );
            }
          }
        };
      }
      // Wire recruit key (F) — when near an NPC, pressing interact recruits
      // them as a follower using the FollowBrain system.
      document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyF' && !e.repeat && this.gameState.gameStarted && !this.gameState.paused) {
          if (this.citySpawner?.recruitNearest(this.player.position)) {
            this.audio.play('pickup');
          }
        }
        // E (interact) near a quest NPC — flag for quest system check this frame
        if (e.code === KEYBINDS.INTERACT && !e.repeat && this.gameState.gameStarted && !this.gameState.paused) {
          this._questInteractPressed = true;
        }
      });

      // ── Breakable wall system ──────────────────────────────────────────────
      // Registers all wall/ceiling meshes already tagged by GLBLocationSystem.
      // Must run after buildEnvironment() so getBreakableMeshes() is populated.
      {
        const breakableMeshes = this.sceneBuilder.getBreakableMeshes();
        if (breakableMeshes.length > 0) {
          this.breakableWallSystem = new BreakableWallSystem(this.scene, breakableMeshes);
          this.breakableWallSystem.onSurvivalDrop = (itemId, count) => {
            this.onSurvivalLootDrop?.(itemId, count);
          };
          console.info(`[GameEngine] BreakableWallSystem: ${breakableMeshes.length} wall(s) registered.`);
        }
      }

      // ── RTS Survivor Camp System ────────────────────────────────────────────
      // Spawns wild survivors, manages camp production ticks, triggers raids.
      this.survivorSpawner = new SurvivorSpawner(this.citySpawner!, this.enemyManager);
      // Survival claim buildings multiply harvest production (era-isolated).
      this.survivorSpawner.getCampHarvestMult = () =>
        this.campClaim?.getHarvestRateMultiplier() ?? 1;
      this.survivorSpawner.onProduction = (resources) => {
        // Feed produced resources into the survival stacks UI
        for (const [itemId, count] of Object.entries(resources)) {
          if (itemId === 'reputation') continue; // handled by lore loop
          this.onSurvivalLootDrop?.(itemId, count);
        }
        this.loreLoop?.onProductionResources(resources);
      };
      this.survivorSpawner.onRaidStart = (waveSize, tier) => {
        this.onEngagementToast?.(
          `Raid — ${tier}`,
          `${waveSize} hostiles approach your claim. Walls before beds.`,
        );
        // Hostile faction pressure from natural enemies of pledge
        const pledged = getReputationService().getPledged();
        if (pledged) {
          // slight rep hit with random enemy banner
        }
      };
      this.factionAi.attach(this.enemyCampSystem ?? null);
      this.factionAi.onWorldEvent = (t, b) => this.onEngagementToast?.(t, b);
      this.survivorSpawner.onJoinPrompt = (label) => {
        this.onInteractionPrompt?.(label);
      };

      this.onAssetsLoaded?.();
    };
    void bootAfterAssets().catch((err) => {
      console.error('[GameEngine] Boot failed:', err);
    });
  }

  handleAbilityKey = (e: KeyboardEvent) => {
    if (!this.gameState.gameStarted || this.gameState.paused || !this.player) return;
    const abilityKeys: Record<string, string> = {
      'Digit1': 'whirlwind',
      'Digit2': 'fireball',
      'Digit3': 'shield_bash',
      'Digit4': 'berserker_rage',
      'Digit5': 'lightning_strike',
    };
    const abilityId = abilityKeys[e.code];
    if (!abilityId) return;

    const fwd = this.player.getForwardDir();

    this.audio.play('cast');

    this.abilitySystem.use(
      abilityId,
      this.player.position,
      fwd,
      this.playerStats.mana,
      (damage, isAoe) => {
        this.enemyManager.checkPlayerAttack(this.player.position, fwd, 10, damage, isAoe);
      },
      (mana) => {
        this.playerStats.mana = Math.max(0, this.playerStats.mana - mana);
        this.onStatsUpdate?.(this.playerStats);
      },
      () => {
        this.player.activateBerserker();
      }
    );
  };

  handleMenuKey = (e: KeyboardEvent) => {
    if (!this.player) return;
    if (e.code === KEYBINDS.PAUSE) {
      if (!this.gameState.gameStarted) return;
      if (this.gameState.skillTreeOpen) {
        this.gameState.skillTreeOpen = false;
        this.onGameStateUpdate?.(this.gameState);
        return;
      }
      this.gameState.paused = !this.gameState.paused;
      this.onGameStateUpdate?.(this.gameState);
      if (this.gameState.paused) {
        document.exitPointerLock();
      } else {
        this.renderer.domElement.requestPointerLock();
      }
    }
    if (e.code === KEYBINDS.SKILL_TREE && this.gameState.gameStarted) {
      this.gameState.skillTreeOpen = !this.gameState.skillTreeOpen;
      this.gameState.paused = this.gameState.skillTreeOpen;
      this.onGameStateUpdate?.(this.gameState);
      if (this.gameState.paused) document.exitPointerLock();
    }
    if (e.code === KEYBINDS.INVENTORY && this.gameState.gameStarted) {
      this.gameState.inventoryOpen = !this.gameState.inventoryOpen;
      this.gameState.paused = this.gameState.inventoryOpen || this.gameState.skillTreeOpen;
      this.onGameStateUpdate?.(this.gameState);
      if (this.gameState.paused) document.exitPointerLock();
      else this.renderer.domElement.requestPointerLock();
    }
  };

  startGame() {
    this.gameState.mainMenuOpen = false;
    this.gameState.gameStarted = true;
    this.gameState.paused = false;
    this.onGameStateUpdate?.(this.gameState);
    this.startGameplay();

    // Activate the encampment intro quest after a short delay
    // so the player has time to see the world load in.
    if (this.sceneBuilder?.isStarterMapMode()) {
      setTimeout(() => {
        getQuestSystem().activate('encampment_intro');
      }, 3000);
    }

    // Begin cloud save auto-save loop, and hydrate any persisted SWG-style
    // profession state. This is additive on top of the existing engine
    // bootstrap — the rest of the snapshot (wave/score/inventory) is left
    // alone since this codebase doesn't restore those at runtime today.
    const saveSvc = getSaveGameService();
    saveSvc.onLoaded = (data) => {
      ProfessionsService.hydrate(data?.professions);
      if (data && typeof data === 'object' && 'reputation' in (data as object)) {
        this.restoreReputation(
          (data as { reputation?: import('./faction/ReputationService').ReputationSnapshot })
            .reputation,
        );
      }
    };
    saveSvc.load().catch(() => { /* no save yet — fresh start */ });
    saveSvc.startAutoSave(() => this._collectSaveData());
  }

  startGameplay() {
    if (!this.enemyManager) return;
    this.enemyManager.spawnWave(1);

    // Finalize remake once camp + world exist
    if (!this._remakeReady && this.player && this.sceneBuilder) {
      this._remakeReady = true;
      const remake = runSurvivalRemakeBootstrap({
        player: this.player,
        sceneBuilder: this.sceneBuilder,
        campClaim: this.campClaim,
        cinema: this.cinema,
        gameMode: this.gameMode,
        playArrivalCinema: true,
      });
      this.gameState.sectorTitle = remake.lore.title;
      this.gameState.sectorObjective = remake.lore.line;
      this.gameState.sectorBeatAge = 6;
      this.onGameStateUpdate?.({ ...this.gameState });
      this.onEngagementToast?.(REMAKE_SPAWN_LORE.title, REMAKE_SPAWN_LORE.modeHint);
      // Chain cinema end → free mode + TPS (preserve prior handlers)
      if (this.cinema) {
        const prevEnd = this.cinema.onClipEnd;
        this.cinema.onClipEnd = (id) => {
          prevEnd?.(id);
          if (this.gameMode.getMode() === 'cinema') this.gameMode.set('free');
          this.player?.setCameraMode('third-person');
        };
      }
    }

    try {
      const lockResult = this.renderer.domElement.requestPointerLock();
      if (lockResult instanceof Promise) lockResult.catch(() => {});
    } catch (_) {}
  }

  fireBullet(spread: number = 0) {
    if (!this.player) return;
    const weapon = this.player.equippedWeapons[this.player.activeWeaponIndex];
    const isShotgun = weapon.id === 'hellfire_shotgun';
    const dir = this.player.getForwardDir();
    if (spread > 0) {
      dir.x += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();
    }

    const origin = this.player.position.clone().add(new THREE.Vector3(0, 1.1, 0))
      .add(dir.clone().multiplyScalar(0.8));
    const speed = isShotgun ? 28 : 45;
    const damage = weapon.damage;

    // Procedural muzzle flash (billboard + ring + sparks) — no GLB required.
    this.muzzleFlash?.spawn(origin, dir, isShotgun);

    this.projectileSystem.spawn({
      ...DEFAULT_BULLET_OPTS,
      origin,
      direction: dir,
      speed,
      damage,
      lifetime: weapon.range / speed,
      meshTemplate: this.bulletTemplate ?? new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 5, 5),
        new THREE.MeshBasicMaterial({ color: isShotgun ? 0xff6600 : 0xffff44 }),
      ),
      tracer: weapon.type === 'smg',
      tracerColor: 0xffffaa,
      owner: 'player',
      getTargets: () => this.enemyManager
        ? this.enemyManager.enemies.filter(e => e.state !== 'dead').map(e => e.mesh)
        : [],
      onHit: (_hit, _p) => {
        // Impact sparks at the hit point, reflected along the world-space surface normal.
        const worldNormal = _hit.normal
          ? _hit.normal.clone().transformDirection(_hit.object.matrixWorld)
          : null;
        this.impactSparks?.burst(
          _hit.point,
          worldNormal,
          isShotgun ? 0xff6600 : 0xffee88,
          isShotgun ? 1.3 : 1.0,
        );
        // Find the enemy whose mesh was hit
        if (!this.enemyManager) return;
        const hitMesh = _hit.object;
        const enemy = this.enemyManager.enemies.find(e => {
          let found = false;
          e.mesh.traverse(c => { if (c === hitMesh) found = true; });
          return found;
        });
        if (!enemy || enemy.state === 'dead') return;
        enemy.health -= damage;
        this.damageNumbers?.spawn(enemy.mesh.position, damage);
        this.audio.play('hit');
        this.enemyManager.onEnemyDamaged?.(enemy.mesh.position, damage);
        if (enemy.health <= 0) this.enemyManager.killEnemy(enemy);
      },
    });
  }

  updateBullets(dt: number) {
    this.projectileSystem.update(dt, this.camera);
    this.telegraphField?.update(dt);
    const splineImpacts = this.splineField?.update(dt, this.camera) ?? [];
    for (const imp of splineImpacts) {
      this.shockwaveVFX?.fire(imp.point, {
        radius: imp.radius,
        color: this.sectorDeployment.getVfxPalette().impact,
      });
      this.combatFX.shake(0.12, 0.14);
      if (imp.owner === 'player' && this.enemyManager) {
        for (const enemy of this.enemyManager.enemies) {
          if (enemy.state === 'dead') continue;
          const d = enemy.mesh.position.distanceTo(imp.point);
          if (d <= imp.radius + 1.2) {
            enemy.health -= imp.damage;
            this.damageNumbers?.spawn(enemy.mesh.position, imp.damage);
            if (enemy.health <= 0) this.enemyManager.killEnemy(enemy);
          }
        }
      }
    }
    const waveHits = this.slashWaveField?.update(
      dt,
      this.enemyManager
        ? this.enemyManager.enemies
            .filter(e => e.state !== 'dead')
            .map((e, i) => ({
              id: `e_${i}`,
              position: e.mesh.position,
              alive: true,
            }))
        : [],
    ) ?? [];
    for (const wh of waveHits) {
      if (!this.enemyManager) continue;
      const idx = parseInt(wh.enemyId.replace('e_', ''), 10);
      const enemy = this.enemyManager.enemies[idx];
      if (!enemy || enemy.state === 'dead') continue;
      enemy.health -= wh.damage;
      this.damageNumbers?.spawn(enemy.mesh.position, wh.damage);
      if (enemy.health <= 0) this.enemyManager.killEnemy(enemy);
    }
    this.muzzleFlash?.update(dt);
    this.impactSparks?.update(dt);
  }

  onResize = () => {
    // Read the canvas's actual rendered size rather than window dimensions —
    // the canvas is letterboxed above the bottom HUD strip so window dims
    // would over-stretch the projection and put the character behind the HUD.
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.player) {
      this.player.fpCamera.aspect = w / h;
      this.player.fpCamera.updateProjectionMatrix();
    }
  };

  loop = (time: number) => {
    this.animFrameId = requestAnimationFrame(this.loop);
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    if (!this.gameState.paused) {
      if (this.assetsLoaded && this.gameState.gameStarted && this.player && this.enemyManager) {
        this.update(dt);
      }
    }

    this.render(time);
  };

  update(dt: number) {
    // Always tick FX timers, even during hitstop, so the freeze actually
    // ends. While frozen, skip every gameplay system but still render.
    this.combatFX.update(dt);
    if (this.combatFX.isFrozen()) return;

    // Poll gamepad first so synthesized key events arrive before player.update.
    this.gamepad.poll();
    // Step the physics world BEFORE the player updates so the character
    // controller queries against an up-to-date set of contacts. Today the
    // world only contains static map colliders + the player's kinematic
    // capsule, so a single fixed-step pass per frame is plenty.
    this.physics?.step(dt);

    // Cinema / AFK run before player when they own control
    const caps = this.gameMode.getCaps();
    if (caps.cinemaCamera && this.cinema?.isPlaying()) {
      this.cinema.update(dt);
    }
    if (caps.afkScript && this.afk?.enabled) {
      this.afk.update(dt);
    }

    // Apply mode gates to player input
    if (this.player) {
      this.player.inputEnabled = caps.playerInput;
      this.player.allowPrimaryAction = caps.primaryAction;
      this.player.allowFocusRmb = caps.focusRmb;
      this.player.allowDodge = caps.dodge;
    }

    this.player.update(dt);

    // Feed aim pitch into locomotion additive layer for responsive ADS
    if (this.player.locomotion && this.player.isAiming) {
      // cameraAngleV is ~0.05–1.4; map around rest 0.3 to -1..1
      const norm = THREE.MathUtils.clamp((this.player.cameraAngleV - 0.3) / 0.7, -1, 1);
      this.player.locomotion.setAimPitch(norm);
    }

    this.abilitySystem.update(dt);

    this._gameTimeSec += dt;

    // Ally combat assist — recruited followers engage nearby hostiles
    if (this.citySpawner && this.enemyManager && this.player) {
      this.allyCombat.update(
        dt,
        this.citySpawner.getFollowers(),
        this.player.position,
        this.enemyManager,
      );
    }

    // Survivor's loop buffs, recruit lore, faction day ticks
    this.loreLoop?.update(dt);
    this.factionAi.update(dt, this._gameTimeSec);

    // Keep campClaim wired on city spawner (boot order safe)
    if (this.citySpawner && this.campClaim && !this.citySpawner.campClaim) {
      this.citySpawner.campClaim = this.campClaim;
      this.loreLoop?.attach(this.campClaim, this.citySpawner);
    }

    // Engagement session + mode mastery
    this.engagement.update(dt, this.gameMode.getMode());
    this._modeMasteryTimer -= dt;
    if (this._modeMasteryTimer <= 0) {
      this._modeMasteryTimer = 5;
      this.engagement.checkModeMastery(this.gameMode.getMode());
    }

    // Co-op presence — interpolate remotes & push local state at ~20 Hz.
    // No-ops cheaply when the player isn't in a room.
    MultiplayerSystem.tick(dt);
    {
      const p = this.player.position;
      MultiplayerSystem.pushLocalState({
        x: p.x, y: p.y, z: p.z,
        ry: this.player.bodyYaw,
        hp: this.playerStats.maxHealth > 0
          ? this.playerStats.health / this.playerStats.maxHealth
          : 1,
      });
    }
    const nowSec = Date.now() * 0.001;
    this.sceneBuilder?.animateFlames(nowSec);
    this.sceneBuilder?.updateWater(nowSec, this.camera.position, dt);
    // Water-layer ticks: swim band + oxygen, fishing minigame state,
    // boat buoyancy + steering. All cheap; early-out internally if idle.
    if (this.swimController) {
      const p = this.player.position;
      this.swimController.update(dt, groundY(p.x, p.z));
    }
    this.climbController?.update(dt);
    this.fishingSystem?.update(dt);
    this.boatSystem?.update(dt);
    this.sceneBuilder?.updateSky(nowSec, this.camera.aspect);
    this.damageNumbers?.update(dt, this.camera);
    // Stream terrain chunks around the player. The manager early-outs when
    // the player hasn't crossed a chunk boundary, so this is essentially
    // free most frames.
    this.sceneBuilder?.updateStreaming(this.player.position.x, this.player.position.z);

    // Grass overlay — single uniform write per frame drives sway + the
    // per-blade "push out from under the player" deformation in shader.
    this.sceneBuilder?.grass.tick(this.player.position);

    // ── Weather scheduler ────────────────────────────────────────────────────
    // Runs before FogSystem so any storm-level change this frame propagates
    // through fog density + gloom uniforms in the same render.
    this.weatherSystem.update(dt);

    // ── Fog aura + gloom ─────────────────────────────────────────────────────
    this.fogSystem.update(dt, this.player.position, this.camera.position, nowSec);

    // ── 9-sector deployment — fog palette, VFX colors, UI beats ─────────────
    this.sectorDeployment.update(this.player.position.x, this.player.position.z);
    if (this.sectorBeatTimer > 0) {
      this.sectorBeatTimer = Math.max(0, this.sectorBeatTimer - dt);
      this.gameState.sectorBeatAge = this.sectorBeatTimer;
      if (this.sectorBeatTimer === 0) {
        this.gameState.sectorBeatAge = 0;
      }
    }

    // ── Rain (early-outs when WeatherSystem currently has it disabled) ──────
    this.rainSystem.update(dt, this.camera.position, this.player.position.y);

    // ── Fog of war — reveal around player ────────────────────────────────────
    getFogOfWar().reveal(this.player.position.x, this.player.position.z);

    // ── Resource nodes — mesh visibility within 100 m ─────────────────────────
    getResourceSystem().update(
      this.player.position.x, this.player.position.z, Date.now(),
    );

    // ── Enemy camps — procedural raid nodes 200–500 m from player ───────────
    this.enemyCampSystem?.update(
      dt,
      this.player.position.x,
      this.player.position.z,
    );

    // ── NPC manager — goals + render culling ─────────────────────────────────
    const npcMgr = getNPCManager();
    npcMgr.playerPositions[0] = this.player.position;
    npcMgr.update(dt);

    // ── Survival camp claim (guardian idle anim, flag buffs) ─────────────────
    this.campClaim?.update(dt);

    // Keep the shadow-casting sun centred on the player so shadows don't
    // pop out of view at ±70m from the world origin.
    this.sceneBuilder?.followPlayer(
      this.player.position.x,
      this.player.position.y,
      this.player.position.z,
    );
    this.enemyManager.update(dt, this.player.position, this.wave);

    // Update build-mode ghost (cheap when no blueprint is active).
    this.modularBuilding?.tick(this.player.position);

    // Door open/close + interaction prompt highlighting.
    this.doorSystem?.update(dt, this.player.position);

    // Building entry/exit triggers — must run AFTER doorSystem so the prompt
    // label reflects the latest open/closed state.
    if (this.interiorPortalSystem) {
      const prevNear = this.interiorPortalSystem.nearDoor;
      const prevLabel = this.interiorPortalSystem.nearDoorLabel;
      this.interiorPortalSystem.update(dt, this.player.position);
      if (
        this.interiorPortalSystem.nearDoor !== prevNear ||
        this.interiorPortalSystem.nearDoorLabel !== prevLabel
      ) {
        this.resolveInteractionPrompt();
      }
    }

    // Ambient city NPC mixers + talk-prompt picker.
    this.citySpawner?.update(dt, this.player.position);

    // Named NPC mixer ticks — uses cached array instead of scene.traverse
    // to avoid walking the entire scene graph (thousands of GLB meshes) every frame.
    if (this._namedNpcMixers) {
      for (const mx of this._namedNpcMixers) mx.update(dt);
    }

    // Enemy camp raid prompt (position-based — works before GLB streams in).
    {
      const camp = this.enemyCampSystem?.getCampNear(
        this.player.position.x,
        this.player.position.z,
        12,
      );
      let campLabel: string | null = null;
      if (camp && !camp.cleared && !camp.missionActive) {
        campLabel = 'Press [E] · Raid Enemy Camp';
        if (this._questInteractPressed) {
          this.enemyCampSystem?.acceptCampMission(camp);
        }
      }
      if (campLabel !== this._lastCampLabel) {
        this._lastCampLabel = campLabel;
        this.resolveInteractionPrompt();
      }
    }

    // Prefab interaction proximity sweep — surfaces the caravan/market
    // and any other interactable prefab (training dummy, vehicles, …).
    // Runs every frame in any map mode so the prompt UI is consistent.
    {
      const prefabs = this.sceneBuilder?.prefabs.getInteractables() ?? [];
      let nearestLabel: string | null = null;
      let triggered: { interaction: string; id: string } | null = null;
      const RADIUS_SQ = 4 * 4;
      for (const inst of prefabs) {
        const dx = this.player.position.x - inst.position.x;
        const dz = this.player.position.z - inst.position.z;
        if (dx * dx + dz * dz < RADIUS_SQ) {
          nearestLabel = `Press [E] · ${inst.label}`;
          if (this._questInteractPressed && inst.interaction) {
            triggered = { interaction: inst.interaction, id: inst.id };
          }
          break;
        }
      }
      if (nearestLabel !== this._lastPrefabLabel) {
        this._lastPrefabLabel = nearestLabel;
        this.resolveInteractionPrompt();
      }
      if (triggered) {
        if (triggered.interaction === 'mission:enemy_camp') {
          const camp = this.enemyCampSystem?.getCampNear(
            this.player.position.x,
            this.player.position.z,
            15,
          );
          if (camp) this.enemyCampSystem?.acceptCampMission(camp);
        }
        this.onPrefabInteract?.(triggered.interaction, triggered.id);
      }
    }

    // Quest system proximity checks — NPC talk requires pressing E (interact)
    let nearNpcId: string | null = null;
    if (this.sceneBuilder?.isStarterMapMode()) {
      // Show NPC name/role prompt when player is within 5m of a named NPC
      let nearestNpcLabel: string | null = null;
      for (const npcDef of ENCAMPMENT_NPCS) {
        const brain = getNPCManager().getBrain(npcDef.id);
        if (!brain) continue;
        const dx = this.player.position.x - brain.vehicle.position.x;
        const dz = this.player.position.z - brain.vehicle.position.z;
        if (dx * dx + dz * dz < 5 * 5) {
          nearestNpcLabel = `Press [E] · ${npcDef.label}`;
          if (this._questInteractPressed) {
            nearNpcId = npcDef.id;
          }
          break;
        }
      }
      this._questInteractPressed = false;

      // Emit NPC prompt (feeds into the resolveInteractionPrompt priority chain)
      if (nearestNpcLabel !== this._lastNpcLabel) {
        this._lastNpcLabel = nearestNpcLabel;
        this.resolveInteractionPrompt();
      }

    }

    getQuestSystem().update(this.player.position, nearNpcId);

    // Breakable wall physics (fragment gravity, fade-out).
    this.breakableWallSystem?.update(dt);

    // ── RTS survivor camp ────────────────────────────────────────────────────
    this.survivorSpawner?.update(dt, this.player.position);

    // ── Perk effects (refreshed once per second for perf) ────────────────────
    this._perkRefreshTimer -= dt;
    if (this._perkRefreshTimer <= 0) {
      this._perkRefreshTimer = 1.0;
      this.refreshPerkEffects();
    }

    const activeWeapon = this.player.equippedWeapons[this.player.activeWeaponIndex];
    const isGun = activeWeapon.type === 'gun';

    if (isGun && this.player.gunFirePending) {
      this.player.gunFirePending = false;
      const isShotgun = activeWeapon.id === 'hellfire_shotgun';
      if (isShotgun) {
        for (let i = 0; i < 6; i++) this.fireBullet(0.28);
      } else {
        this.fireBullet(0);
      }
    }

    this.updateBullets(dt);
    this.slashVFX?.update(dt, this.camera);
    this.shockwaveVFX?.update(dt);

    if (this.lootManager) {
      this.lootManager.update(dt, performance.now() * 0.001, this.player.position);
    }

    // Melee swing: combat damage + harvest tool strike during the hit window.
    // Per-combo-step parameters (arc, range, damage) come from the player.
    if (!isGun && this.player.isAttacking && this.player.meleeHitPending) {
      // Gate damage to the hit-frame window defined per combo step (normalised 0-1).
      const elapsed = this.player.attackAnimTimer > 0
        ? 1 - (this.player.attackTimer / this.player.attackAnimTimer)
        : 0;
      const { hitFrameStart, hitFrameEnd } = this.player.getComboHitFrames();
      if (elapsed >= hitFrameStart && elapsed <= hitFrameEnd) {
        const fwd = this.player.getForwardDir();
        const combo = this.player.getComboParams();
        const isHeavy = activeWeapon.type === 'axe' || activeWeapon.type === 'mace' || activeWeapon.range >= 3;
        const knockback = (isHeavy ? 7 : 3) * (combo.isFinisher ? 1.6 : 1);
        // Use weapon bone world position as sweep origin if available, else player position.
        const weaponBone = this.player.weaponAttachment?.getAttached('mainhand')?.bone;
        const sweepOrigin = weaponBone
          ? weaponBone.getWorldPosition(new THREE.Vector3())
          : this.player.position;
        const modeCaps = this.gameMode.getCaps();
        const hits = modeCaps.combat
          ? this.enemyManager.checkPlayerAttack(
              sweepOrigin, fwd,
              this.player.getAttackRange() * combo.rangeMul,
              this.player.getAttackDamage() * combo.damageMul,
              false,
              knockback,
              combo.arcDot,
            )
          : 0;

        // ── Harvest: same swing chips resource nodes in reach ─────────────
        const harvested = modeCaps.harvest
          ? this.tryMeleeHarvest(
              sweepOrigin,
              fwd,
              this.player.getAttackRange() * combo.rangeMul,
              this.player.getAttackDamage() * combo.damageMul,
            )
          : false;

        if (hits > 0 || harvested) {
          // Only consume the swing on a hit so an enemy sliding into range
          // mid-swing still gets clipped — a single swing still only hits any
          // given enemy once because checkPlayerAttack is called per-enemy
          // within one frame.
          this.player.meleeHitPending = false;

          // ── Slash VFX at the weapon bone position (annihilate SwordBlink) ─
          if (hits > 0 && this.slashVFX) {
            const slashPos = weaponBone
              ? weaponBone.getWorldPosition(new THREE.Vector3())
              : this.player.position.clone().add(fwd.clone().multiplyScalar(1.5));
            const pal = this.sectorDeployment.getVfxPalette();
            const slashColor = isHeavy ? pal.meleeSlash : combo.isFinisher ? pal.impact : pal.meleeSlash;
            this.slashVFX.fire(slashPos, slashColor, isHeavy ? 1.4 : 1.0);
            if (combo.isFinisher && this.slashWaveField) {
              this.slashWaveField.spawn(slashPos, fwd, {
                damage: this.player.getAttackDamage() * combo.damageMul * 0.65,
                color: pal.meleeSlash,
                range: this.player.getAttackRange() * 2.2,
              });
            }
          }

          // Hitstop only on heavy weapons or the finisher of the combo —
          // light hits stay snappy. Shake scales with weight so a finisher
          // really thumps.
          if (isHeavy || combo.isFinisher) {
            this.combatFX.hitStop(combo.isFinisher ? 5 : 3);
            this.combatFX.shake(0.18 * (combo.isFinisher ? 1.5 : 1), 0.18);

            // ── Knockdown on finishers (annihilate knockDown pattern) ─────
            if (combo.isFinisher) {
              this.enemyManager.knockDownNearby(
                sweepOrigin, fwd,
                this.player.getAttackRange() * combo.rangeMul,
                combo.arcDot,
              );
            }
          } else {
            this.combatFX.shake(0.07, 0.12);
          }
        }
      }
    }
    // Always close the swing window when the swing finishes, even if it
    // never connected, so the next click starts a fresh swing.
    if (!this.player.isAttacking) this.player.meleeHitPending = false;

    // ── Breakable walls ────────────────────────────────────────────────────
    // Same window gate as enemy melee: only the first active window frame
    // deals damage. Consume meleeHitPending on contact so one swing applies
    // damage exactly once — mirroring the enemy melee contract above.
    if (!isGun && this.player.isAttacking && this.player.meleeHitPending) {
      const elapsedW = this.player.attackAnimTimer > 0
        ? 1 - (this.player.attackTimer / this.player.attackAnimTimer)
        : 0;
      const { hitFrameStart: wHitStart, hitFrameEnd: wHitEnd } = this.player.getComboHitFrames();
      if (elapsedW >= wHitStart && elapsedW <= wHitEnd) {
        const fwd = this.player.getForwardDir();
        const hitResult = this.breakableWallSystem?.checkHit(
          this.player.position,
          fwd,
          this.player.getAttackRange() * 1.5,
          this.player.getAttackDamage(),
        );
        if (hitResult) {
          // Consume pending flag so damage is applied once per swing.
          this.player.meleeHitPending = false;
          this.combatFX.shake(0.14, 0.15);
        }
      }
    }

    const enemyDamage = this.enemyManager.checkEnemyAttack(this.player.position);
    if (enemyDamage > 0) {
      this.player.takeDamage(enemyDamage);
      this.audio.play('damage');
      this.onStatsUpdate?.(this.playerStats);
      // Noise sphere damage flash at player position
      this.abilitySystem.flashNoiseSphere(
        this.player.position.clone().add(new THREE.Vector3(0, 1, 0)),
        'damage',
        0.6,
      );
    }

    const activeEnemies = this.enemyManager.enemies.filter(e => e.state !== 'dead');
    const enemyPositions = activeEnemies.map(e => e.mesh.position);
    this.abilitySystem.checkProjectileHits(enemyPositions, (index, damage) => {
      const enemy = activeEnemies[index];
      if (enemy) {
        enemy.health -= damage;
        this.damageNumbers?.spawn(enemy.mesh.position, damage, { crit: true });
        this.audio.play('hit');
        if (enemy.health <= 0) this.enemyManager.killEnemy(enemy);
      }
    });

    // Auto-save tick
    if (this.gameState.gameStarted && !this.gameState.paused) {
      getSaveGameService().tick(dt, () => this._collectSaveData());
    }

    // Wave progression — pause both the timer and the wave-up while the
    // intro grace window is open. Otherwise the timer keeps ticking, the
    // wave counter increments, and `spawnWave()` is no-op'd by the grace
    // gate — leading to "wave 2/3" appearing the moment grace ends. By
    // freezing the timer we ensure the player always sees wave 1 first.
    if (!this.enemyManager.isInIntroGrace()) {
      this.waveTimer += dt;
      if (this.waveTimer >= this.waveCooldown && this.enemyManager.getEnemyCount() < 4) {
        this.wave++;
        this.waveTimer = 0;
        this.gameState.wave = this.wave;
        this.enemyManager.spawnWave(this.wave);
        this.onGameStateUpdate?.(this.gameState);
      }
    }

    this.onCameraModeChange?.(this.player.cameraMode);

    if (this.playerStats.health <= 0) {
      this.gameState.paused = true;
      this.onGameStateUpdate?.(this.gameState);
    }
  }

  render(_time: number) {
    this.perfMonitor.begin();
    // Apply screen shake by temporarily offsetting the camera. Restore
    // afterwards so it doesn't accumulate across frames or interfere with
    // PlayerController's camera math.
    const shake = this.combatFX.getOffset();
    const hasShake = shake.lengthSq() > 0;
    if (hasShake) this.camera.position.add(shake);
    this.renderer.render(this.scene, this.camera);
    if (hasShake) this.camera.position.sub(shake);
    // Live "in front of you" portrait pass — no-op when no UI has it
    // active. Runs *after* the main render so it can capture the same
    // frame's lit + animated state of the player and surroundings.
    this.portraitRenderer.update(_time);
    this.perfMonitor.end();
  }

  start() {
    this.lastTime = performance.now();
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  _collectSaveData() {
    return {
      version:   2,
      sessionId: getSaveGameService().getSessionId(),
      timestamp: Date.now(),
      stats:     { ...this.playerStats },
      wave:      this.wave,
      score:     this.gameState.score,
      position:  { x: this.player?.position.x ?? 0, z: this.player?.position.z ?? 0 },
      character: this.characterConfig,
      inventory: this.inventory
        ? this.inventory.bag.map(item => ({ id: item.defId, qty: 1, uid: item.uid }))
        : [],
      // Player-built structures. Empty when nothing's been placed yet.
      buildings: this.modularBuilding?.serialize() ?? { pieces: [] },
      // SWG-style profession progression (XP per profession + learned skills).
      professions: ProfessionsService.serialize(),
      // RTS camp survivor spawner state.
      survivorSpawner: this.survivorSpawner?.serialize() ?? null,
      // Survival-era claim flag / benches / camp buffs (not Warlords).
      campClaim: this.campClaim?.serialize() ?? null,
      // Five-faction reputation + pledge
      reputation: getReputationService().serialize(),
    };
  }

  /** Pledge to a banner (lore). Returns error string or null on success. */
  pledgeFaction(factionId: FactionId): string | null {
    const r = getReputationService().pledge(factionId);
    if (!r.ok) return r.error ?? 'Pledge failed';
    this.loreLoop?.update(0);
    this.onEngagementToast?.(
      `Pledged: ${factionId}`,
      'Natural enemies are now Hostile. Four banners watch your claim.',
    );
    return null;
  }

  renounceFaction(): string | null {
    const r = getReputationService().renounce();
    if (!r.ok) return r.error ?? 'Renounce failed';
    this.onEngagementToast?.('Banner lowered', 'Seven days before another oath.');
    return null;
  }

  getReputationSnapshot() {
    return getReputationService().serialize();
  }

  getLoreStage() {
    return this.loreLoop?.getStage() ?? 'alone';
  }

  getRecruitGateMessage() {
    return this.loreLoop?.getRecruitGateMessage() ?? '';
  }

  /** Unlocked codex pages from compendium + stage. */
  getCodexEntries() {
    return getUnlockedCodex(this.loreLoop?.getStage() ?? 'alone');
  }

  restoreReputation(snap: import('./faction/ReputationService').ReputationSnapshot | null | undefined): void {
    if (!snap) return;
    try {
      getReputationService().restore(snap);
    } catch {
      this._pendingRepSnapshot = snap;
    }
  }

  /** Restore Survival camp claim (flag + guardian + benches). Safe no-op if missing. */
  restoreCampClaim(snap: CampClaimSnapshot | null | undefined): void {
    if (!snap) return;
    if (this.campClaim) {
      this.campClaim.restore(snap).catch((e) =>
        console.warn('[GameEngine] campClaim restore failed', e),
      );
    } else {
      this._pendingCampSnapshot = snap;
    }
  }

  /**
   * Notify Survival camp of a craft completion (bench profession XP).
   * Call from GameCanvas when crafting finishes at camp.
   */
  onCampCraftComplete(preferredProfession?: import('./progression/Professions').Profession): number {
    if (!this.campClaim || !this.player) return 0;
    return this.campClaim.onCraftCompleted(this.player.position, preferredProfession);
  }

  /**
   * Recipe stations near the player (MainPanel crafting gate).
   * Always includes handcraft; camp benches unlock workbench tiers.
   */
  getNearbyCraftingStations(): import('./survival/Recipes').CraftingStation[] {
    if (!this.player) return ['none'];
    if (this.campClaim) {
      return this.campClaim.getNearbyCraftingStations(this.player.position);
    }
    return ['none'];
  }

  /**
   * Party / ally roster for MainPanel Friends tab (MMO-style living camp).
   * Recruited CitySpawner followers + ambient camp NPCs when claimed.
   */
  getAllyRoster(): Array<{
    name: string;
    level: number;
    status: string;
    online: boolean;
    icon?: string;
  }> {
    const allies: Array<{
      name: string;
      level: number;
      status: string;
      online: boolean;
      icon?: string;
    }> = [];
    const followers = this.citySpawner?.getFollowers() ?? [];
    for (const f of followers) {
      const role = f.role ?? 'survivor';
      allies.push({
        name: role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        level: Math.max(1, this.playerStats?.level ?? 1),
        status: 'In Party · following',
        online: true,
        icon: role.includes('guard') || role.includes('combat') ? '🛡️' : '🧭',
      });
    }
    if (this.campClaim?.isClaimed()) {
      allies.push({
        name: 'Camp Guardian',
        level: Math.max(1, (this.playerStats?.level ?? 1) + 1),
        status: 'Defending claim flag',
        online: true,
        icon: '🚩',
      });
    }
    // Hub crew always listed as online contacts (MMO social surface)
    for (const name of ['Ledger', 'Rivet', 'Ashcoil', 'Bastion', 'Brick']) {
      if (!allies.some((a) => a.name === name)) {
        allies.push({
          name,
          level: 5,
          status: 'Convergence Nexus',
          online: true,
          icon: '📡',
        });
      }
    }
    return allies;
  }

  /** Survival camp buffs for HUD / AI (harvest + AI ability mults). */
  getCampBuffs() {
    if (!this.campClaim || !this.player) return null;
    return this.campClaim.getBuffs(this.player.position);
  }

  // ── Modular building API (public — driven by GameCanvas) ──────────────────

  /** Push a new survival adapter (UI-side stack reads/writes). */
  setSurvivalProvider(p: SurvivalProvider): void {
    this.survivalProvider = p;
    this.modularBuilding?.setSurvivalProvider(p);
  }

  /** Activate or clear a placement blueprint. itemId of `null` clears it. */
  setBuildingBlueprint(itemId: string | null): void {
    this.modularBuilding?.setBlueprint(itemId);
  }

  /** Open / close the runtime debug GUI (lil-gui). The on-screen Admin
   * button in the HUD calls this; the backtick (`) hotkey does the same. */
  toggleDebug(): void {
    this.debugPanel?.toggle();
  }

  /** Restore a previously serialized building snapshot. Safe to call before preload finishes. */
  restoreBuildings(snap: ModularBuildingSnapshot | null | undefined): void {
    if (!snap) return;
    if (this.modularBuilding) this.modularBuilding.restore(snap);
    else this._pendingBuildingSnapshot = snap;
  }

  // ── Building-mode input handlers ──────────────────────────────────────────

  handleBuildRotateKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyR' || e.repeat) return;
    if (!this.modularBuilding?.hasActiveBlueprint()) return;
    this.modularBuilding.rotateBlueprint(90);
  };

  /** Capture-phase LMB intercept for the fishing rod. Runs BEFORE
   *  PlayerController's own mousedown handler. When the rod is the active
   *  tool, the click drives FishingSystem.tryUse() (cast / reel) and we
   *  swallow the event so no weapon swing plays. Build-mode placement has
   *  its own handler registered first and takes precedence. */
  handleFishingClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!this.fishingSystem) return;
    if (this.modularBuilding?.hasActiveBlueprint()) return;
    if (!this.fishingSystem.tryUse()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  handleBuildPlaceClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!this.modularBuilding?.hasActiveBlueprint()) return;
    // Always swallow the click while build mode is active — even if the
    // placement is invalid (out of range, no ground, no items left). Without
    // this, a "miss" would still fire the gun / trigger a melee swing,
    // which makes build mode feel awful.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.modularBuilding.tryPlace()) {
      this.audio.play('pickup');
    }
  };

  /**
   * Melee swing against nearby harvest nodes.
   * Tool type (axe / pickaxe / knife …) multiplies damage via HandToolCatalog.
   * Returns true if any node took damage or yielded loot.
   */
  private tryMeleeHarvest(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    range: number,
    baseDamage: number,
  ): boolean {
    try {
      const resSys = getResourceSystem();
      const reach = Math.max(range, 2.2);
      const nodes = resSys.queryNear(this.player.position.x, this.player.position.z, reach + 1.5);
      if (!nodes.length) return false;

      const att = this.player.weaponAttachment?.getAttached('mainhand');
      const tool =
        att?.toolDef ??
        getHandToolDef(att?.sourceId) ??
        getHandToolDef(this.player.equippedWeapons[this.player.activeWeaponIndex]?.id) ??
        null;

      const now = performance.now();
      let any = false;
      const fwdFlat = new THREE.Vector3(forward.x, 0, forward.z).normalize();

      for (const node of nodes) {
        if (node.respawnAt > 0 || node.hp <= 0) continue;
        const dx = node.position.x - this.player.position.x;
        const dz = node.position.z - this.player.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > reach + 0.8) continue;
        // Must be roughly in front of the player (half-circle)
        if (dist > 0.4) {
          const toNode = new THREE.Vector3(dx, 0, dz).normalize();
          if (toNode.dot(fwdFlat) < 0.15) continue;
        }

        const mult = harvestMultFor(tool, node.defId);
        const dmg = Math.max(1, Math.round(baseDamage * mult * 0.45));
        const loot = resSys.harvest(node.trackId, dmg, now);
        if (loot === null) continue;
        any = true;

        // Feedback pulse on the node mesh
        if (node.mesh) {
          node.mesh.scale.setScalar(0.92);
          setTimeout(() => {
            if (node.mesh) node.mesh.scale.setScalar(1);
          }, 80);
        }

        this.engagement.onHarvest();
        if (loot.length > 0) {
          for (const drop of loot) {
            const count =
              drop.min + Math.floor(Math.random() * Math.max(1, drop.max - drop.min + 1));
            if (count > 0) this.onSurvivalLootDrop?.(drop.itemId, count);
          }
          this.audio.play('pickup');
          this.damageNumbers?.spawn(
            new THREE.Vector3(node.position.x, node.worldY + 1.2, node.position.z),
            dmg,
            { color: 0xc8a050 },
          );
        } else {
          // Chip hit — small number
          this.damageNumbers?.spawn(
            new THREE.Vector3(node.position.x, node.worldY + 1.0, node.position.z),
            dmg,
            { color: 0x88aa66 },
          );
          this.audio.play('hit');
        }
      }
      return any;
    } catch {
      return false;
    }
  }

  /**
   * Wire mode controller, cinema director, focus RMB, engagement toasts, hotkeys.
   * Called after PlayerController exists. AFK is attached once EnemyManager exists.
   */
  private wireGameModesAndSystems(): void {
    this.engagement.onToast = (title, body) => this.onEngagementToast?.(title, body);

    this.cinema = new CinemaDirector({
      camera: this.camera,
      canvas: this.renderer.domElement,
      renderer: this.renderer,
    });
    this.cinema.onClipEnd = () => {
      if (this.gameMode.getMode() === 'cinema') this.gameMode.set('free');
    };
    this.cinema.onRecordReady = (_blob, url) => this.onCinemaRecordReady?.(url);
    this.cinema.onTitleCard = (title, sub) => this.onCinemaTitleCard?.(title, sub);

    this.gameMode.onModeChange = (mode, caps) => {
      if (this.player) {
        this.player.inputEnabled = caps.playerInput;
        this.player.allowPrimaryAction = caps.primaryAction;
        this.player.allowFocusRmb = caps.focusRmb;
        this.player.allowDodge = caps.dodge;
      }
      const labels: Record<GameModeId, string> = {
        free: 'Free',
        combat: 'Combat',
        harvest: 'Harvest',
        build: 'Build',
        cinema: 'Cinema',
        afk: 'AFK',
        ui: 'UI',
      };
      this.onGameModeChange?.(mode, labels[mode]);
    };

    // Mode-aware RMB focus
    this.player.focusRmbHandler = (down: boolean) => {
      const w = this.player.equippedWeapons[this.player.activeWeaponIndex];
      const ranged = !!w && (w.type === 'gun' || w.type === 'rifle' || w.type === 'shotgun'
        || w.type === 'smg' || w.type === 'pistol' || w.type === 'bow' || w.type === 'crossbow');
      const behavior = this.gameMode.resolveFocusRmb(ranged);
      if (!down) {
        this.player.stopAiming();
        this.player.stopBlock();
        return;
      }
      switch (behavior) {
        case 'ads':
          this.player.startAiming();
          break;
        case 'block':
          this.player.startBlock();
          break;
        case 'cancel_build':
          this.modularBuilding?.clearBlueprint();
          this.gameMode.set('free');
          break;
        default:
          break;
      }
    };

    // Hotkeys: M cycle mode · F9 AFK · F10 cinema orbit · F11 record · Esc exit cinema
    this._modeKeyHandler = (e: KeyboardEvent) => {
      if (!this.gameState.gameStarted || this.gameState.paused) return;
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.altKey) {
        // Don't steal M if typing — only when pointer locked
        if (!this.player?.mouseLocked && this.gameMode.getMode() !== 'afk') return;
        e.preventDefault();
        const next = this.gameMode.cyclePlayMode();
        if (next === 'build' && this.modularBuilding) {
          // leave blueprint selection to Build menu; mode just gates combat
        }
        if (next !== 'afk' && this.afk?.enabled) this.afk.stop();
      }
      if (e.code === 'F9' && !e.repeat) {
        e.preventDefault();
        this.toggleAfk();
      }
      if (e.code === 'F10' && !e.repeat) {
        e.preventDefault();
        this.playCinemaOrbit();
      }
      if (e.code === 'F11' && !e.repeat) {
        e.preventDefault();
        this.cinema?.toggleRecording();
      }
      if (e.code === 'Escape' && this.gameMode.getMode() === 'cinema') {
        e.preventDefault();
        this.exitCinema();
      }
    };
    document.addEventListener('keydown', this._modeKeyHandler);
  }

  /** Public: open UI mode (panels) and restore on close. */
  enterUiMode(): void {
    if (this.gameMode.getMode() !== 'ui') this.gameMode.push('ui');
  }

  exitUiMode(): void {
    if (this.gameMode.getMode() === 'ui') this.gameMode.pop();
  }

  setPlayMode(mode: GameModeId): void {
    if (mode === 'afk') {
      this.toggleAfk(true);
      return;
    }
    if (this.afk?.enabled) this.afk.stop();
    this.gameMode.set(mode);
  }

  toggleAfk(forceOn?: boolean): void {
    if (!this.afk) return;
    const turnOn = forceOn ?? !this.afk.enabled;
    if (turnOn) {
      this.gameMode.set('afk');
      this.afk.start('defend');
      this.onEngagementToast?.('AFK Defend', 'Auto-engage hostiles. F9 to cancel. F9+scripts via setAfkScript.');
    } else {
      this.afk.stop();
      this.gameMode.set('free');
    }
  }

  setAfkScript(script: 'defend' | 'harvest' | 'camp' | 'patrol'): void {
    if (!this.afk) return;
    this.afk.setScript(script);
    if (!this.afk.enabled) {
      this.gameMode.set('afk');
      this.afk.start(script);
    }
  }

  playCinemaOrbit(): void {
    if (!this.cinema || !this.player) return;
    this.gameMode.set('cinema');
    this.cinema.playOrbit(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 14, 5, 10);
  }

  playCinemaArrival(): void {
    if (!this.cinema || !this.player) return;
    this.gameMode.set('cinema');
    this.cinema.playArrival(this.player.position.clone(), 5.5);
  }

  exitCinema(): void {
    this.cinema?.stop();
    if (this.gameMode.getMode() === 'cinema') this.gameMode.set('free');
  }

  /** Grant structured quest rewards (profession XP, weapon XP, items). */
  private grantQuestRewards(qid: string, reward: import('./quest/QuestSystem').QuestReward): void {
    console.log(`[Quest] "${qid}" complete!`, reward);
    if (reward.professionXp) {
      for (const [prof, amount] of Object.entries(reward.professionXp)) {
        ProfessionsService.gainXp(prof as import('./progression/Professions').Profession, amount);
      }
    }
    if (reward.weaponXp) {
      StatProgressionService.addWeaponXp(reward.weaponXp);
    }
    if (reward.items?.length) {
      for (const item of reward.items) {
        this.onSurvivalLootDrop?.(item.itemId, item.count);
      }
    }
  }

  /**
   * Load a Survival toon operator GLB for a named hub NPC (CDN toon-soldiers).
   * Falls back via caller if the load rejects.
   */
  private async spawnNamedNpcMesh(
    npcId: string,
    bodyId: string,
    pos: THREE.Vector3,
    brain: { mesh?: THREE.Object3D },
  ): Promise<void> {
    const bodyCfg = BODY_TYPES.find((b) => b.id === bodyId);
    const def = toonDef(bodyId);
    const url =
      bodyCfg?.gltfPath ??
      def?.gltfPath ??
      'https://assets.grudge-studio.com/models/toon-soldiers/infantry/infantry-a.glb';

    const loader = createGLTFLoader(this.assetManager.getLoadingManager());
    const gltf = await loader.loadAsync(url);
    const mesh = gltf.scene;
    mesh.name = `npc_${npcId}_${bodyId}`;

    if (isToonBodyId(bodyId)) {
      normalizeToonHeight(mesh, 1.75);
    } else {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      const h = box.getSize(new THREE.Vector3()).y;
      if (h > 0.1 && h > 3) mesh.scale.multiplyScalar(1.8 / h);
    }

    mesh.position.copy(pos);
    mesh.rotation.y = Math.PI;
    mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    let mixer: THREE.AnimationMixer | null = null;
    if (isToonBodyId(bodyId) && def) {
      try {
        const clips = await loadRetargetedToonClips(mesh, {
          ...def,
          weaponMode: 'pistol',
        });
        const idle = clips.find((c) => c.name === 'Idle') ?? clips[0];
        if (idle) {
          mixer = new THREE.AnimationMixer(mesh);
          const a = mixer.clipAction(idle);
          a.setLoop(THREE.LoopRepeat, Infinity);
          a.play();
        }
      } catch {
        /* idle optional */
      }
    } else if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(mesh);
      const idle =
        gltf.animations.find((c) => /idle/i.test(c.name)) ?? gltf.animations[0];
      mixer.clipAction(idle).play();
    }

    this.scene.add(mesh);
    brain.mesh = mesh;
    if (mixer) this._namedNpcMixers.push(mixer);
  }

  /**
   * Pick the highest-priority interaction prompt and emit it to the UI.
   * Priority: interior portal (Enter/Exit Building) > door (Open/Close Door)
   * > NPC talk prompt. Only emits when the resolved label actually changes
   * to avoid React re-renders on no-op frames.
   */
  private resolveInteractionPrompt(): void {
    const portalLabel = this.interiorPortalSystem?.nearDoor
      ? this.interiorPortalSystem.nearDoorLabel
      : null;
    // Boat board/disembark and fishing cast/reel sit between door and NPC
    // in priority — both are localized to the player so they should beat a
    // distant talk prompt, but lose to an open-doorway portal label.
    const next = portalLabel
      ?? this._lastDoorLabel
      ?? this._lastBoatLabel
      ?? this._lastFishLabel
      ?? this._lastCampLabel
      ?? this._lastPrefabLabel
      ?? this._lastNpcLabel
      ?? null;
    if (next !== this._lastEmittedPrompt) {
      this._lastEmittedPrompt = next;
      this.onInteractionPrompt?.(next);
    }
  }

  /**
   * Refresh the aggregated perk effect bag from both Nexus milestone perks
   * and the 4-track perk tree. Called once per second in update().
   *
   * Key effects applied to PlayerController:
   *   maxHp, maxStamina, meleeDamage, moveSpeed, damageTaken, hpRegen,
   *   staminaRegen, critChance, critMult, bleedResist, toxinResist.
   */
  private refreshPerkEffects(): void {
    if (!this.player) return;

    // Nexus milestone effects from the 8-stat system
    const nexusStats = this.characterConfig.stats;
    const milestoneEffects = nexusStats ? getMilestoneEffects(nexusStats) : {};

    // 4-track perk tree effects (hero/warrior/smarts/maker)
    const trackPoints: Record<StatTrack, number> = {
      hero: 0, warrior: 0, smarts: 0, maker: 0,
    };
    // Track points come from the StatPerkChoices allocation — for now we derive
    // them from the Nexus stats mapping: BIO+VIT → hero, KIN+STR → warrior,
    // NEU+INT → smarts, SYN+ENT → maker. This keeps both systems in sync.
    if (nexusStats) {
      trackPoints.hero    = (nexusStats.bio ?? 0) + (nexusStats.gra ?? 0);
      trackPoints.warrior = (nexusStats.kin ?? 0);
      trackPoints.smarts  = (nexusStats.neu ?? 0) + (nexusStats.qnt ?? 0);
      trackPoints.maker   = (nexusStats.syn ?? 0) + (nexusStats.ent ?? 0);
    }
    const perks = getUnlockedPerks(trackPoints);
    const combos = getUnlockedCombos(trackPoints);
    const trackEffects = sumPassives([...perks, ...combos]);

    // Merge into a single bag
    this.perkEffects = mergeEffectBags(milestoneEffects, trackEffects);

    // Apply key effects to PlayerStats
    const pe = this.perkEffects;
    const base = this.playerStats;
    base.maxHealth  = this.player['baseMaxHealth']  + readEffect(pe, 'maxHp');
    base.maxStamina = (base.maxStamina > 0 ? 100 : 0) + readEffect(pe, 'maxStamina');
    base.maxMana    = this.player['baseMaxMana'] + readEffect(pe, 'maxMana');

    // Movement speed bonus (applied as multiplier in PlayerController)
    const speedBonus = readEffect(pe, 'moveSpeed');
    this.player.moveSpeed = this.player['baseMoveSpeed'] * (1 + speedBonus);
  }

  private _buildCombatVfxBridge(): CombatVfxBridge {
    const engine = this;
    return {
      getTelegraphColor: () => engine.sectorDeployment.getVfxPalette().telegraph,
      getMagicColor: () => engine.sectorDeployment.getVfxPalette().magicCore,
      getArcScale: () => engine.sectorDeployment.getVfxPalette().arcScale,
      showCircleTelegraph(origin, radius, duration) {
        engine.telegraphField?.showCircle(
          origin,
          radius,
          duration,
          engine.sectorDeployment.getVfxPalette().telegraph,
        );
      },
      spawnSplineSpell(origin, target, opts) {
        const pal = engine.sectorDeployment.getVfxPalette();
        engine.splineField?.spawn({
          origin,
          target,
          color: opts.color ?? pal.magicCore,
          speed: opts.speed ?? 22,
          damage: opts.damage,
          arcScale: pal.arcScale,
          owner: 'player',
          scale: 1,
        });
      },
    };
  }

  dispose() {
    getSaveGameService().stopAutoSave();
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    document.removeEventListener('keydown', this.handleAbilityKey);
    document.removeEventListener('keydown', this.handleMenuKey);
    document.removeEventListener('keydown', this.handleBuildRotateKey);
    document.removeEventListener('mousedown', this.handleBuildPlaceClick, true);
    document.removeEventListener('mousedown', this.handleFishingClick, true);
    if (this.boatSystem) { this.boatSystem.dispose(); this.boatSystem = null; }
    if (this.fishingSystem) { this.fishingSystem.dispose(); this.fishingSystem = null; }
    this.swimController = null;
    this.climbController = null;
    if (this.projectileSystem) this.projectileSystem.clear();
    if (this.rainSystem) this.rainSystem.dispose();
    // Player.dispose() removes its own Rapier body from the world; dispose
    // the player BEFORE the world so the cleanup order matches.
    if (this.player) this.player.dispose();
    if (this.mapColliders) { this.mapColliders.dispose(); this.mapColliders = null; }
    if (this.physics) { this.physics.dispose(); this.physics = null; }
    this.abilitySystem.dispose();
    this.telegraphField?.dispose();
    this.splineField?.dispose();
    this.slashWaveField?.dispose();
    if (this.enemyManager) this.enemyManager.dispose();
    if (this.lootManager) this.lootManager.dispose();
    if (this.damageNumbers) this.damageNumbers.dispose();
    if (this.modularBuilding) this.modularBuilding.dispose();
    if (this.doorSystem) this.doorSystem.dispose();
    if (this.interiorPortalSystem) this.interiorPortalSystem.dispose();
    if (this.citySpawner) this.citySpawner.dispose();
    if (this.breakableWallSystem) this.breakableWallSystem.dispose();
    if (this.survivorSpawner) { this.survivorSpawner.dispose(); this.survivorSpawner = undefined; }
    if (this.debugPanel) this.debugPanel.dispose();
    this.gamepad.dispose();
    this.audio.dispose();
    this.assetManager.dispose();
    this.perfMonitor.dispose();
    this.portraitRenderer.dispose();
    this.renderer.dispose();
    try { document.exitPointerLock(); } catch (_) {}
  }
}

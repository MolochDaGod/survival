import * as THREE from 'three';
import { SceneBuilder } from './SceneBuilder';
import { PlayerController } from './PlayerController';
import { EnemyManager } from './EnemyManager';
import { AbilitySystem } from './AbilitySystem';
import { AssetManager } from './AssetManager';
import { installBVH, buildBVHsForScene } from './BVHRaycast';
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
import { SurvivorSpawner, type SurvivorSpawnerSnapshot } from './township/SurvivorSpawner';
import { getMilestoneEffects, mergeEffectBags, readEffect, type MilestoneEffectBag } from '@workspace/game-systems/perks';
import { sumPassives, getUnlockedPerks, getUnlockedCombos, type StatTrack } from './progression/PerkSystem';

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
  private _lastDoorLabel: string | null = null;
  private _lastNpcLabel:  string | null = null;
  private _lastBoatLabel: string | null = null;
  private _lastFishLabel: string | null = null;
  private _lastEmittedPrompt: string | null = null;

  /** Water-layer subsystems — built after player + sceneBuilder exist.
   *  swim drives wading/swimming/oxygen; fishing handles cast→bite→reel
   *  on the existing LMB pipeline; boat listens on the unified INTERACT
   *  key (KeyE) for board/disembark. */
  private swimController: SwimController | null = null;
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

    this.assetManager.loadAll((fraction) => {
      this.onLoadProgress?.(fraction);
    }, this.characterConfig).then(async () => {
      this.assetsLoaded = true;

      // Bring up Rapier in parallel with scene building. The WASM blob is
      // ~600 KB and cached aggressively so this is usually a no-op after
      // the first visit, but doing it here means by the time we wire the
      // PlayerController below, `this.physics` is ready.
      const physicsReady = initPhysics().then(() => {
        this.physics = new PhysicsWorld();
      }).catch((err) => {
        // Don't crash the boot — PlayerController falls back to its
        // legacy BVH-raycast path when physics is null. We just lose the
        // real-walls/real-ground behaviour.
        console.error('[GameEngine] Rapier init failed; continuing without physics:', err);
      });

      this.sceneBuilder = new SceneBuilder(this.scene, this.assetManager);
      // Awaiting ensures all 4 GLB world locations are in the scene before
      // gameplay starts. GLB progress is reported via assetManager.onProgress.
      await this.sceneBuilder.buildEnvironment();
      await physicsReady;

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

      // Feed the third-person camera the world's static colliders so it can
      // dolly inward when a wall, pillar, or hill blocks line-of-sight.
      const occluders: THREE.Object3D[] = [];
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.SkinnedMesh) return;
        if (obj instanceof THREE.Mesh && (obj.geometry as { boundsTree?: unknown }).boundsTree) {
          occluders.push(obj);
        } else if (obj instanceof THREE.InstancedMesh) {
          occluders.push(obj);
        }
      });
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
      this.swimController.onSplash = (pos) => this.sceneBuilder?.splashFX.splash(pos);

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

      this.enemyManager = new EnemyManager(this.scene, this.assetManager);
      // Apply the spawn anchor we captured earlier — the encampment hub
      // becomes a permanent no-spawn zone of ~22m radius.
      if (this._pendingSpawnAnchor) {
        this.enemyManager.setSpawnAnchor(this._pendingSpawnAnchor);
      }
      // Open a 20-second intro grace so the player can get oriented before
      // anything wanders in. `startGameplay()` calls `spawnWave(1)` and the
      // per-frame trickle ticks immediately — both are gated on this timer.
      this.enemyManager.setIntroGrace(20);
      this.enemyManager.onEnemyKilledAt = (exp, position, tier) => {
        this.gameState.killCount++;
        this.gameState.score += 100 + this.wave * 25;
        this.player.gainExperience(exp);
        this.lootManager.dropFromEnemy(position, tier);
        this.audio.play('kill');
        this.damageNumbers.spawn(position, exp, { color: 0x69f0ae });
        // SWG-style Hunting XP. Bosses are big-game, electives a step up.
        const baseHuntXp = tier === 'boss' ? 50 : tier === 'elite' ? 15 : 5;
        const huntXpBonus = ProfessionsService.getEffect('bountyXpBonus');
        ProfessionsService.gainXp('hunting', Math.round(baseHuntXp * (1 + huntXpBonus)));
        // Survival XP — staying alive long enough to make a kill counts.
        ProfessionsService.gainXp('survival', Math.max(1, Math.round(baseHuntXp * 0.4)));
        // Weapon XP — each kill feeds the unallocated pool that the player
        // routes onto the 8 Grudge Stats from the MainPanel.
        const weaponXp = tier === 'boss' ? 60 : tier === 'elite' ? 25 : 10;
        StatProgressionService.addWeaponXp(weaponXp);
        this.onGameStateUpdate?.(this.gameState);
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
      // Hook future placed doors so they become interactive immediately.
      if (this.modularBuilding) {
        this.modularBuilding.onPlace = (pieceId, _pos, group) => {
          if (pieceId === 'mb_door' || pieceId === 'mb_wall_door') {
            this.doorSystem?.registerPlacedDoor(group);
          }
        };
      }

      // ── Ambient rigged NPCs in the city ──────────────────────────────────
      // Spawns a dozen wandering citizens around the player's spawn point,
      // each with idle/walk animation, YUKA wander steering, and a barker
      // line when the player walks up. They turn hostile if attacked
      // (NPCBrain.onPlayerAngered flips faction → ATTACK goal).
      this.citySpawner = new CitySpawner(this.scene, getNPCManager(), this.assetManager);
      const cityCentre = this._pendingSpawnAnchor ?? new THREE.Vector3();
      // 14 ambient NPCs felt like a flea market — dialed back to 6 so the
      // town reads as inhabited but not crowded. Talk-prompt collisions
      // were also a problem at the higher count.
      this.citySpawner.populate(cityCentre, 6, 35);
      this.citySpawner.onTalkPrompt = (label) => {
        this._lastNpcLabel = label;
        this.resolveInteractionPrompt();
      };
      // Wire recruit key (F) — when near an NPC, pressing interact recruits
      // them as a follower using the FollowBrain system.
      document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyF' && !e.repeat && this.gameState.gameStarted && !this.gameState.paused) {
          if (this.citySpawner?.recruitNearest(this.player.position)) {
            this.audio.play('pickup');
          }
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
      this.survivorSpawner.onProduction = (resources) => {
        // Feed produced resources into the survival stacks UI
        for (const [itemId, count] of Object.entries(resources)) {
          this.onSurvivalLootDrop?.(itemId, count);
        }
      };
      this.survivorSpawner.onJoinPrompt = (label) => {
        this.onInteractionPrompt?.(label);
      };

      this.onAssetsLoaded?.();
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

    // Begin cloud save auto-save loop, and hydrate any persisted SWG-style
    // profession state. This is additive on top of the existing engine
    // bootstrap — the rest of the snapshot (wave/score/inventory) is left
    // alone since this codebase doesn't restore those at runtime today.
    const saveSvc = getSaveGameService();
    saveSvc.onLoaded = (data) => {
      ProfessionsService.hydrate(data?.professions);
    };
    saveSvc.load().catch(() => { /* no save yet — fresh start */ });
    saveSvc.startAutoSave(() => this._collectSaveData());
  }

  startGameplay() {
    if (!this.enemyManager) return;
    this.enemyManager.spawnWave(1);
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
    this.player.update(dt);
    this.abilitySystem.update(dt);

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

    // ── Rain (early-outs when WeatherSystem currently has it disabled) ──────
    this.rainSystem.update(dt, this.camera.position, this.player.position.y);

    // ── Fog of war — reveal around player ────────────────────────────────────
    getFogOfWar().reveal(this.player.position.x, this.player.position.z);

    // ── Resource nodes — mesh visibility within 100 m ─────────────────────────
    getResourceSystem().update(
      this.player.position.x, this.player.position.z, Date.now(),
    );

    // ── NPC manager — goals + render culling ─────────────────────────────────
    const npcMgr = getNPCManager();
    npcMgr.playerPositions[0] = this.player.position;
    npcMgr.update(dt);

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

    if (this.lootManager) {
      this.lootManager.update(dt, performance.now() * 0.001, this.player.position);
    }

    // Melee swing: damage applies once per swing during the active window.
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
        const hits = this.enemyManager.checkPlayerAttack(
          sweepOrigin, fwd,
          this.player.getAttackRange() * combo.rangeMul,
          this.player.getAttackDamage() * combo.damageMul,
          false,
          knockback,
          combo.arcDot,
        );
        if (hits > 0) {
          // Only consume the swing on a hit so an enemy sliding into range
          // mid-swing still gets clipped — a single swing still only hits any
          // given enemy once because checkPlayerAttack is called per-enemy
          // within one frame.
          this.player.meleeHitPending = false;
          // Hitstop only on heavy weapons or the finisher of the combo —
          // light hits stay snappy. Shake scales with weight so a finisher
          // really thumps.
          if (isHeavy || combo.isFinisher) {
            this.combatFX.hitStop(combo.isFinisher ? 5 : 3);
            this.combatFX.shake(0.18 * (combo.isFinisher ? 1.5 : 1), 0.18);
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
    };
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
    const nexusStats = this.characterConfig.grudgeStats;
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
    if (this.projectileSystem) this.projectileSystem.clear();
    if (this.rainSystem) this.rainSystem.dispose();
    // Player.dispose() removes its own Rapier body from the world; dispose
    // the player BEFORE the world so the cleanup order matches.
    if (this.player) this.player.dispose();
    if (this.mapColliders) { this.mapColliders.dispose(); this.mapColliders = null; }
    if (this.physics) { this.physics.dispose(); this.physics = null; }
    this.abilitySystem.dispose();
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

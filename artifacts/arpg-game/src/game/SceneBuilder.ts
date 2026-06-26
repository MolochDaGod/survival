import * as THREE from 'three';
import { TerrainBuilder, ArenaMarkers, sampleTerrainHeight, WORLD } from './TerrainBuilder';
import { WorldChunkManager } from './world/WorldChunkManager';
import { GrassSystem } from './world/GrassSystem';
import { WaterSurface } from './world/water/WaterSurface';
import { SplashFX } from './world/water/SplashFX';
import { FeaturePlacer } from './world/FeaturePlacer';
import { PrefabSystem } from './world/PrefabSystem';
import { TerrainPatchSystem, setTerrainPatchSystem } from './world/TerrainPatchSystem';
import { TerrainScatter } from './world/TerrainScatter';
import { RoadSystem } from './world/RoadSystem';
import { GLBLocationSystem, DoorProxy } from './world/GLBLocationSystem';
import { VolumetricSky } from './world/VolumetricSky';
import { StarterMap } from './world/StarterMap';
import { StarterMapGrass } from './world/StarterMapGrass';
import { getWinterTreeSystem } from './world/WinterTreeSystem';
import type { AssetManager } from './AssetManager';
import type { PhysicsWorld } from './physics/PhysicsWorld';
import { LAYERS } from './Layers';

/**
 * The encampment GLB is always loaded as the safe starting zone at the world
 * origin. The procedural open world (chunks, terrain, features, roads) streams
 * around it once the player leaves the encampment perimeter. Both systems
 * coexist: the encampment is a static GLB island planted at (0,0), and the
 * chunk manager fills the rest of the 20 km world procedurally.
 */
const STARTER_MAP_MODE = true;
/** Encampment GLB map. Loaded at world origin as the safe starting zone. */
const STARTER_MAP_NAME = 'encampment';
/**
 * Distance from world origin at which the open-world terrain chunks begin
 * streaming. Must be larger than the encampment's footprint (~200 m) so the
 * procedural terrain doesn't poke through the GLB. The WorldChunkManager
 * starts ticking once the player crosses this radius.
 */
export const OPEN_WORLD_STREAM_RADIUS = 250;

export class SceneBuilder {
  scene: THREE.Scene;
  assets: AssetManager;

  private sharedPillarGeo: THREE.CylinderGeometry;
  private sharedPillarMat: THREE.MeshStandardMaterial;
  private sharedRockMat: THREE.MeshStandardMaterial;

  private terrain: TerrainBuilder;
  private chunks: WorldChunkManager;
  /** Decorative animated grass laid on top of streamed terrain chunks. */
  grass: GrassSystem;
  /** New water layer — swimmable, queryable, drives boats + fishing. */
  water: WaterSurface;
  /** Pooled splash rings. Triggered by SwimController, FishingSystem, BoatSystem. */
  splashFX: SplashFX;
  private features: FeaturePlacer;
  /** GLB prefab loader/registry — exposed for GameEngine proximity scans. */
  prefabs: PrefabSystem;
  /** GLB terrain patches blended into the procedural heightfield. */
  terrainPatches: TerrainPatchSystem;
  /** Biome-aware terrain scatter (craftpix palm trees, stones, mountains). */
  private terrainScatter: TerrainScatter;
  private roads: RoadSystem;
  private markers: ArenaMarkers;
  private sky?: VolumetricSky;
  private glbLocations?: GLBLocationSystem;
  /** Resolves when all 4 GLBs have finished loading (or failed). */
  private glbLocationsReady?: Promise<void>;
  /** The handcrafted starting map (town3f2) when STARTER_MAP_MODE is on. */
  private starterMap?: StarterMap;
  /** Resolves once the starter map's GLB and BVHs are in place. */
  private starterMapReady?: Promise<void>;
  /** Layered InstancedMesh grass scattered on the starter map's lawns. */
  private starterMapGrass?: StarterMapGrass;
  /** False when the encampment GLB failed to load and we fell back to procedural. */
  private starterMapModeActive = STARTER_MAP_MODE;

  /** The shadow-casting key light. Repositioned each frame. */
  private sun!: THREE.DirectionalLight;
  private sunOffset = new THREE.Vector3(100, 160, 100);

  /**
   * Construct the scene builder. `physics` is optional — when null the
   * terrain + chunks skip Rapier collider baking and the player falls
   * back to the legacy BVH-only ground sampler.
   */
  constructor(scene: THREE.Scene, assets: AssetManager, physics: PhysicsWorld | null = null) {
    this.scene = scene;
    this.assets = assets;

    this.sharedPillarGeo = new THREE.CylinderGeometry(0.7, 0.9, 8, 12);
    this.sharedPillarMat = new THREE.MeshStandardMaterial({
      map: assets.getTexture('wall_albedo') ?? undefined,
      normalMap: assets.getTexture('wall_normal') ?? undefined,
      roughnessMap: assets.getTexture('wall_roughness') ?? undefined,
      color: 0x6a6a78,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.7,
    });
    this.sharedRockMat = new THREE.MeshStandardMaterial({
      color: 0x555566,
      roughness: 0.9,
      metalness: 0.02,
      envMapIntensity: 0.5,
    });

    this.terrain = new TerrainBuilder(scene, assets, physics);
    this.chunks = new WorldChunkManager(scene, physics);
    // Grass is created here (so it can register with the chunk manager
    // before the first chunk loads) and ticked from GameEngine.update().
    this.grass    = new GrassSystem(scene);
    this.chunks.setGrassSystem(this.grass);
    this.water    = new WaterSurface(scene);
    this.splashFX = new SplashFX(scene);
    this.prefabs = new PrefabSystem(scene, physics);
    // Terrain patches share scene + loading manager with prefabs. Registering
    // the singleton lets WorldChunkManager.getBlendedHeight() see them, and
    // the onPatchAdded callback evicts overlapping chunks so they rebuild
    // against the new edge profile.
    this.terrainPatches = new TerrainPatchSystem(scene, assets.getLoadingManager());
    setTerrainPatchSystem(this.terrainPatches);
    this.terrainPatches.onPatchAdded(({ cx, cz, rOuter }) => {
      this.chunks.invalidateRegion(cx, cz, rOuter);
    });
    this.features = new FeaturePlacer(scene, physics, this.prefabs);
    this.terrainScatter = new TerrainScatter(scene, physics);
    this.roads    = new RoadSystem(scene);
    this.markers  = new ArenaMarkers(scene);
  }

  async buildEnvironment(): Promise<void> {
    this.addLights();
    this.addFog();
    this.addSkyDome();

    if (STARTER_MAP_MODE) {
      try {
        this.starterMap = new StarterMap(
          this.scene,
          this.assets.getLoadingManager(),
          STARTER_MAP_NAME,
        );
        this.starterMapReady = this.starterMap.load(import.meta.env.BASE_URL);
        await this.starterMapReady;

        if (!this.starterMap.isLoaded()) {
          throw new Error(`Starter map "${STARTER_MAP_NAME}" did not load`);
        }

        const root = this.starterMap.getRoot();
        if (root) {
          this.starterMapGrass = new StarterMapGrass(this.scene);
          try {
            this.starterMapGrass.build(root);
          } catch (err) {
            console.warn('[SceneBuilder] StarterMapGrass build failed:', err);
          }
        }

        this.terrainScatter.scatter(800, 50).catch((err) => {
          console.warn('[SceneBuilder] TerrainScatter failed:', err);
        });
        return;
      } catch (err) {
        console.error(
          '[SceneBuilder] Starter map failed — falling back to procedural world:',
          err,
        );
        this.starterMap?.dispose();
        this.starterMap = undefined;
        this.starterMapReady = undefined;
        this.starterMapModeActive = false;
      }
    }

    // Procedural infinite-world mode (legacy path + starter-map fallback).
    // Await winter tree init before seeding the first chunk so Mountain/SnowPeak
    // chunks have models from the very first load.  On error, log and continue —
    // spawnChunkTrees() returns [] safely so the world still loads without trees.
    try {
      await getWinterTreeSystem(this.scene).init();
    } catch (err) {
      console.warn('[SceneBuilder] Winter tree system failed to load:', err);
    }
    this.terrain.build();
    this.chunks.update(0, 0);
    this.markers.build();
    this.addDungeonElements();
    this.addTorches();
    this.features.buildAll();
    this.roads.buildAll();
    // Scatter craftpix terrain models across the procedural world.
    this.terrainScatter.scatter(2400, 40).catch((err) => {
      console.warn('[SceneBuilder] TerrainScatter failed:', err);
    });

    this.glbLocations = new GLBLocationSystem(
      this.scene,
      this.assets.getLoadingManager(),
    );
    this.glbLocationsReady = this.glbLocations.loadAll(import.meta.env.BASE_URL);
    await this.glbLocationsReady;

    const doors     = this.glbLocations.getDoorProxies();
    const breakable = this.glbLocations.getBreakableMeshes();
    if (doors.length === 0)     console.warn('[SceneBuilder] GLB locations loaded but no door proxies found — check mesh names.');
    if (breakable.length === 0) console.warn('[SceneBuilder] GLB locations loaded but no breakable meshes found — check mesh names.');
  }

  /** Spawn position from the active starter map, or null when in procedural mode. */
  /**
   * Root group of the starter map's loaded GLB. Returned so the physics
   * layer in GameEngine can bake static trimesh colliders against the
   * exact same meshes that GroundSampler / camera occlusion already use.
   */
  getStarterMapRoot(): THREE.Object3D | null {
    return this.starterMap?.isLoaded() ? this.starterMap.getRoot() : null;
  }

  getStarterSpawn(): THREE.Vector3 | null {
    return this.starterMap?.isLoaded() ? this.starterMap.getSpawn() : null;
  }

  /** True when the handcrafted town map is the active world. */
  isStarterMapMode(): boolean {
    return this.starterMapModeActive;
  }

  /**
   * Resolves when all GLB location assets have finished loading (or failed).
   * Door and breakable-wall proxies are valid after this resolves.
   */
  whenGLBsReady(): Promise<void> {
    return this.glbLocationsReady ?? Promise.resolve();
  }

  /** For InteriorPortalSystem — valid after whenGLBsReady() resolves. */
  getDoorProxies(): DoorProxy[] {
    return this.glbLocations?.getDoorProxies() ?? [];
  }

  /** For BreakableWallSystem — valid after buildEnvironment() resolves. */
  getBreakableMeshes(): THREE.Mesh[] {
    return [
      ...(this.starterMap?.getBreakableMeshes() ?? []),
      ...(this.glbLocations?.getBreakableMeshes() ?? []),
    ];
  }

  /**
   * Repositions sun + shadow frustum to track the player.
   * Also updates water shader time + camera position.
   */
  followPlayer(playerX: number, playerY: number, playerZ: number) {
    if (!this.sun) return;
    this.sun.target.position.set(playerX, playerY, playerZ);
    this.sun.target.updateMatrixWorld();
    this.sun.position.set(
      playerX + this.sunOffset.x,
      playerY + this.sunOffset.y,
      playerZ + this.sunOffset.z,
    );
  }

  updateStreaming(playerX: number, playerZ: number) {
    if (this.starterMapModeActive) return;
    this.chunks.update(playerX, playerZ);
    this.glbLocations?.update(playerX, playerZ);
  }

  /** Public terrain sampler for other systems (player Y-snap, prop placement). */
  getTerrainHeight(x: number, z: number): number {
    return sampleTerrainHeight(x, z);
  }

  /**
   * Cinematic three-point dungeon lighting:
   *  - KEY (warm sun): high-angle directional, casts shadows
   *  - FILL (cool moonlight): low-angle directional, no shadows, softens shadow side
   *  - RIM (violet backlight): catches silhouettes from behind
   *  - HEMI: subtle sky/ground tint
   *  - AMBIENT: minimal floor for total darkness prevention
   */
  private addLights() {
    const ambient = new THREE.AmbientLight(0x1a1a2e, 0.35);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x4477aa, 0x1a1208, 0.45);
    hemi.position.set(0, 50, 0);
    this.scene.add(hemi);

    // KEY: warm sun. Both the light and its target follow the player at
    // runtime (see `followPlayer()`), so the shadow camera frustum stays
    // centred on the action — without this, shadows vanish as soon as
    // the player walks past ±70m.
    const sun = new THREE.DirectionalLight(0xffb070, 1.6);
    sun.position.set(50, 80, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // FILL: cool moon, opposite side, no shadows (cheap)
    const fill = new THREE.DirectionalLight(0x6688cc, 0.55);
    fill.position.set(-40, 50, -30);
    this.scene.add(fill);

    // RIM: violet backlight from behind for silhouette pop
    const rim = new THREE.DirectionalLight(0x7744aa, 0.6);
    rim.position.set(0, 30, -80);
    this.scene.add(rim);
  }

  private addFog() {
    // For the open world (DRAW_DISTANCE = 800 m), use a gentle fog so distant
    // terrain is still visible but the world edge is hidden.
    const density = 0.0018;
    this.scene.fog = new THREE.FogExp2(0x0b1020, density);
    this.scene.background = new THREE.Color(0x0b1020);
  }

  private addSkyDome() {
    // Raymarched volumetric fog/cloud sky — replaces the old static sphere+stars.
    // Rendered as a full-screen background quad (renderOrder -1000, no depth
    // write/test) so it sits cleanly behind all scene geometry.
    this.sky = new VolumetricSky(this.scene);
  }

  /**
   * Advance the sky shader time and aspect ratio.
   * Call once per frame from GameEngine.update().
   */
  updateSky(time: number, aspect: number): void {
    this.sky?.update(time, aspect);
  }

  private addDungeonElements() {
    const pillarPositions = [
      { x: 22, z: 0 }, { x: -22, z: 0 },
      { x: 0, z: 22 }, { x: 0, z: -22 },
      { x: 16, z: 16 }, { x: -16, z: 16 },
      { x: 16, z: -16 }, { x: -16, z: -16 },
    ];

    const capGeo = new THREE.BoxGeometry(1.6, 0.5, 1.6);

    pillarPositions.forEach(pos => {
      const pillar = new THREE.Mesh(this.sharedPillarGeo, this.sharedPillarMat);
      pillar.position.set(pos.x, 4, pos.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      pillar.layers.enable(LAYERS.WORLD);
      this.scene.add(pillar);

      const cap = new THREE.Mesh(capGeo, this.sharedPillarMat);
      cap.position.set(pos.x, 8.25, pos.z);
      cap.castShadow = true;
      cap.layers.enable(LAYERS.WORLD);
      this.scene.add(cap);
    });
  }

  private addTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.95, envMapIntensity: 0.4 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1a4d2e, roughness: 0.9, envMapIntensity: 0.5 });

    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Densely scatter trees across the starter zone (visible draw range).
      const r = WORLD.HILL_FALLOFF_START + 8 + Math.random() * (WORLD.STARTER_RADIUS - WORLD.HILL_FALLOFF_START - 8);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const yBase = sampleTerrainHeight(x, z);
      const h = 8 + Math.random() * 12;

      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, h, 6);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, yBase + h / 2, z);
      trunk.castShadow = true;
      trunk.layers.enable(LAYERS.WORLD);
      this.scene.add(trunk);

      for (let j = 0; j < 3; j++) {
        const fr = (3 - j) * 2.5;
        const folGeo = new THREE.ConeGeometry(fr, 4, 7);
        const foliage = new THREE.Mesh(folGeo, foliageMat);
        foliage.position.set(x, yBase + h - 2 + j * 2.5, z);
        foliage.castShadow = true;
        this.scene.add(foliage);
      }
    }
  }

  private addRocks() {
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = WORLD.ARENA_RADIUS + 4 + Math.random() * (WORLD.STARTER_RADIUS - WORLD.ARENA_RADIUS - 4);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const yBase = sampleTerrainHeight(x, z);
      const scale = 0.5 + Math.random() * 2;
      const rockGeo = new THREE.DodecahedronGeometry(scale, 0);
      const rock = new THREE.Mesh(rockGeo, this.sharedRockMat);
      rock.position.set(x, yBase + scale * 0.4, z);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.layers.enable(LAYERS.WORLD);
      this.scene.add(rock);
    }
  }

  private addTorches() {
    const torchPositions = [
      { x: 25, z: 0 }, { x: -25, z: 0 },
      { x: 0, z: 25 }, { x: 0, z: -25 },
      { x: 18, z: 18 }, { x: -18, z: 18 },
      { x: 18, z: -18 }, { x: -18, z: -18 },
    ];

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.95 });
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const headGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.3, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x555544, roughness: 0.85, metalness: 0.1 });
    const flameGeo = new THREE.ConeGeometry(0.12, 0.4, 6);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8822 });

    torchPositions.forEach(pos => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(pos.x, 1.25, pos.z);
      this.scene.add(pole);

      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(pos.x, 2.65, pos.z);
      this.scene.add(head);

      // Higher intensity, physically-correct decay=2 already, longer reach
      const light = new THREE.PointLight(0xff7733, 4.5, 18, 2);
      light.position.set(pos.x, 3, pos.z);
      light.castShadow = false;
      this.scene.add(light);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(pos.x, 3.0, pos.z);
      flame.userData.isFlame = true;
      flame.userData.baseY = 3.0;
      this.scene.add(flame);
    });
  }

  animateFlames(time: number) {
    // Arena torches
    this.scene.traverse((obj) => {
      if (obj.userData.isFlame) {
        obj.position.y = obj.userData.baseY + Math.sin(time * 8 + obj.position.x) * 0.05;
        obj.scale.y = 0.8 + Math.sin(time * 10 + obj.position.z) * 0.2;
        obj.rotation.y = time * 3;
      }
    });
    // World campfires / outpost torches
    this.features.animateFlames(time);
  }

  /** Update water + terrain shaders each frame. `dt` ticks pooled splash FX. */
  updateWater(time: number, camPos: THREE.Vector3, dt: number = 0) {
    this.water.update(time, camPos);
    this.splashFX.update(dt);
    this.chunks.updateShader(time, camPos);
  }

  dispose() {
    this.sharedPillarGeo.dispose();
    this.sharedPillarMat.dispose();
    this.sharedRockMat.dispose();
    this.terrain.dispose();
    this.chunks.dispose();
    this.water.dispose();
    this.splashFX.dispose();
    this.features.dispose();
    this.prefabs.dispose();
    this.roads.dispose();
    this.markers.dispose();
    this.glbLocations?.dispose();
    this.starterMapGrass?.dispose();
  }
}

import * as THREE from 'three';
import type { AssetManager } from './AssetManager';
import { LAYERS } from './Layers';
import { worldHeight, WORLD_HALF } from './world/WorldGen';

/**
 * Authoritative world dimensions.  Now backed by the procedural world system
 * (world/WorldGen.ts).  The full map is 6 400 m × 6 400 m (≈ 4 miles).
 */
export const WORLD = {
  /** Half-extent of the addressable world (full size = 2 × SIZE ≈ 6 400 m). */
  SIZE: WORLD_HALF,
  /** Radius of the flat playable arena (starting camp, always y = 0). */
  ARENA_RADIUS: 30,
  /** Not used for hill generation any more, kept for legacy references. */
  HILL_FALLOFF_START: 32,
  HILL_HEIGHT: 6,
  /** Radius of the starter zone used for prop scatter. */
  STARTER_RADIUS: 200,
  /** Camera far + fog distance.  Generous for the open world. */
  DRAW_DISTANCE: 800,
  FLOOR_Y: 0,
} as const;

/**
 * Proxy through to the procedural world height function.
 * All existing callers (EnemyManager, SceneBuilder prop scatter, etc.) continue
 * to work without modification.
 */
export function sampleTerrainHeight(x: number, z: number): number {
  return worldHeight(x, z);
}

export class TerrainBuilder {
  scene: THREE.Scene;
  assets: AssetManager;
  arenaMesh: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, assets: AssetManager) {
    this.scene = scene;
    this.assets = assets;
  }

  /** Hills are now streamed by TerrainChunkManager — this only builds the arena + rim. */
  build() {
    this.buildArena();
    this.buildArenaRim();
  }

  private buildArena() {
    const geo = new THREE.CircleGeometry(WORLD.ARENA_RADIUS, 96);
    const mat = new THREE.MeshStandardMaterial({
      map: this.assets.getTexture('arena_albedo') ?? undefined,
      normalMap: this.assets.getTexture('arena_normal') ?? undefined,
      roughnessMap: this.assets.getTexture('arena_roughness') ?? undefined,
      color: 0x9a9088,
      roughness: 0.95,
      metalness: 0.05,
      envMapIntensity: 0.7,
    });
    const arena = new THREE.Mesh(geo, mat);
    arena.rotation.x = -Math.PI / 2;
    arena.position.y = 0.02;
    arena.receiveShadow = true;
    arena.layers.enable(LAYERS.WORLD);
    // Walkable surface — let GroundSampler raycasts find it.
    arena.layers.enable(LAYERS.GROUND);
    this.scene.add(arena);
    this.arenaMesh = arena;
  }

  private buildArenaRim() {
    const stoneMat = new THREE.MeshStandardMaterial({
      map: this.assets.getTexture('wall_albedo') ?? undefined,
      normalMap: this.assets.getTexture('wall_normal') ?? undefined,
      roughnessMap: this.assets.getTexture('wall_roughness') ?? undefined,
      roughness: 0.9,
      metalness: 0.05,
      color: 0x6a6a72,
      envMapIntensity: 0.6,
    });

    // Use InstancedMesh for the rim ring (36 stones, perf win + cleaner code).
    const stoneGeo = new THREE.BoxGeometry(2.4, 0.45, 1.6);
    const ringSegments = 36;
    const inst = new THREE.InstancedMesh(stoneGeo, stoneMat, ringSegments);
    inst.castShadow = true;
    inst.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < ringSegments; i++) {
      const angle = (i / ringSegments) * Math.PI * 2;
      const r = WORLD.ARENA_RADIUS + 0.5;
      dummy.position.set(Math.cos(angle) * r, 0.22, Math.sin(angle) * r);
      dummy.rotation.set(0, angle + Math.PI / 2, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.layers.enable(LAYERS.WORLD);
    this.scene.add(inst);
  }

  dispose() {
    if (this.arenaMesh) {
      this.arenaMesh.geometry.dispose();
      (this.arenaMesh.material as THREE.Material).dispose();
    }
  }
}

/**
 * World-axis gizmo and corner coordinate markers.
 */
export class ArenaMarkers {
  scene: THREE.Scene;
  group: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  build() {
    this.addCardinalPillars();
    this.addCenterMarker();
    this.addAxisGizmo();
  }

  private addCardinalPillars() {
    const r = WORLD.ARENA_RADIUS - 0.5;
    const cardinals: { x: number; z: number; color: number; label: string }[] = [
      { x: 0, z: -r, color: 0xff4444, label: 'N' },
      { x: 0, z: r, color: 0x4488ff, label: 'S' },
      { x: r, z: 0, color: 0x44ff66, label: 'E' },
      { x: -r, z: 0, color: 0xffcc44, label: 'W' },
    ];

    for (const c of cardinals) {
      const pillarGeo = new THREE.CylinderGeometry(0.18, 0.22, 5.0, 10);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: c.color,
        emissive: c.color,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        envMapIntensity: 0.8,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(c.x, 2.5, c.z);
      pillar.castShadow = true;
      this.group.add(pillar);

      const light = new THREE.PointLight(c.color, 1.4, 8);
      light.position.set(c.x, 5.2, c.z);
      this.group.add(light);

      const capGeo = new THREE.SphereGeometry(0.35, 12, 12);
      const cap = new THREE.Mesh(capGeo, pillarMat);
      cap.position.set(c.x, 5.4, c.z);
      this.group.add(cap);

      const labelSprite = makeTextSprite(c.label, c.color);
      labelSprite.position.set(c.x, 6.3, c.z);
      labelSprite.scale.set(2, 1, 1);
      this.group.add(labelSprite);
    }
  }

  private addCenterMarker() {
    const ringGeo = new THREE.RingGeometry(1.0, 1.3, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.group.add(ring);

    const beaconGeo = new THREE.ConeGeometry(0.25, 1.2, 8);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xffcc44,
      emissive: 0xffaa22,
      emissiveIntensity: 0.8,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.6, 0);
    this.group.add(beacon);
  }

  private addAxisGizmo() {
    const axes = new THREE.AxesHelper(3);
    axes.position.y = 0.06;
    this.group.add(axes);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

function makeTextSprite(text: string, colorHex: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  ctx.fillText(text, 64, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}

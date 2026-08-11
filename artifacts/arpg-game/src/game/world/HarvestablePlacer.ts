/**
 * HarvestablePlacer — canonical mesh + terrain + collider pipeline for
 * outdoor harvest nodes.
 *
 * Pipeline (do not reorder):
 *
 *   1. TEMPLATE   NatureAssets / procedural — never mount the cache root
 *   2. CLONE      Object3D.clone for static props (SkeletonUtils only if skinned)
 *   3. MATERIALS  sRGB maps, shadows, WORLD layer (not GROUND)
 *   4. FIT        plant soles y=0, center XZ (feet-midpoint origin)
 *   5. TERRAIN    worldY = groundY(x,z)  // BVH GROUND layer only
 *   6. SCENE      parent under HarvestRoot (SceneGraphLayers)
 *   7. PHYSICS    fixed body + solid PROP collider
 *                 optional harvest SENSOR (gameplay hits without blocking)
 *
 * Visual quality tips for “best looking” three-layer scenes:
 *   - Share geometries/materials across clones
 *   - Frustum cull static harvest meshes
 *   - Distance stream (ResourceSystem already does ~95 m bubble)
 *   - Solid collider slightly smaller than visual (0.7–0.85 scale) so
 *     the mesh overhang looks natural and characters don’t snag
 *   - Sensor slightly larger than solid for forgiving harvest swing
 *
 * See: docs/THREE_RAPIER_TERRAIN_LAYERS.md · Layers.ts · PhysicsGroups.ts
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { GROUPS_PROP, makeGroups, GROUP } from '../physics/PhysicsGroups';
import { groundY } from '../GroundSampler';
import { ensureSceneGraph, tagAsWorldProp } from './SceneGraphLayers';
import { cloneNatureMesh } from './NatureAssets';

// ── Collider shape policy ────────────────────────────────────────────────────

export type HarvestColliderKind = 'cylinder' | 'cuboid' | 'none';

export interface HarvestPlaceSpec {
  /** Deterministic node id (for bookkeeping). */
  id: string;
  wx: number;
  wz: number;
  /** Override ground sample (if already known). */
  worldY?: number;
  /** Yaw radians. */
  ry?: number;
  /** Uniform visual scale after plant. */
  scale?: number;
  /** NatureAssets key (tree/bush/ore/…). */
  meshKey?: string;
  /** Multiplicative material tint. */
  tint?: number;
  /** Fallback mesh if GLB missing. */
  fallback?: THREE.Object3D;
  /** Solid body footprint radius (m). */
  radius: number;
  /** Solid body height (m). */
  height?: number;
  collider?: HarvestColliderKind;
  /** If true, add a larger sensor for harvest swing detection. */
  harvestSensor?: boolean;
  castShadow?: boolean;
}

export interface HarvestPlacement {
  id: string;
  root: THREE.Group;
  wx: number;
  wy: number;
  wz: number;
  solidHandle: number | null;
  sensorHandle: number | null;
}

/** Sensor group: PROP membership, contacts PLAYER (and probes). Soft volume. */
export const GROUPS_HARVEST_SENSOR = makeGroups(
  GROUP.PROP,
  GROUP.PLAYER | GROUP.PROBE,
);

function plantLocal(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y)) return;
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
}

function applyTint(root: THREE.Object3D, tint: number): void {
  if (tint === 0xffffff || tint == null) return;
  const c = new THREE.Color(tint);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std?.color) std.color.multiply(c);
    }
  });
}

function styleMesh(root: THREE.Object3D, castShadow: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = castShadow;
    m.receiveShadow = true;
    m.frustumCulled = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std) continue;
      if (std.map) {
        std.map.colorSpace = THREE.SRGBColorSpace;
        std.map.anisotropy = Math.min(8, std.map.anisotropy || 4);
      }
      if (std.opacity < 0.05) std.opacity = 1;
      std.roughness = Math.max(0.4, std.roughness ?? 0.85);
    }
  });
  tagAsWorldProp(root);
}

export class HarvestablePlacer {
  private physics: PhysicsWorld | null;
  private body: RAPIER.RigidBody | null = null;
  private placements = new Map<string, HarvestPlacement>();
  private harvestRoot: THREE.Group;

  constructor(scene: THREE.Scene, physics: PhysicsWorld | null = null) {
    this.physics = physics;
    const roots = ensureSceneGraph(scene);
    this.harvestRoot = roots.harvest;
  }

  get count(): number {
    return this.placements.size;
  }

  getPlacement(id: string): HarvestPlacement | undefined {
    return this.placements.get(id);
  }

  /**
   * Place (or replace) a harvestable at world XZ. Snaps to terrain via
   * groundY (GROUND layer BVH). Returns null only if no mesh could be built.
   */
  async place(spec: HarvestPlaceSpec): Promise<HarvestPlacement | null> {
    // Remove prior instance of same id (respawn / re-stream)
    this.remove(spec.id);

    let visual: THREE.Object3D | null = null;
    if (spec.meshKey) {
      visual = await cloneNatureMesh(spec.meshKey);
    }
    if (!visual && spec.fallback) {
      visual = spec.fallback;
    }
    if (!visual) return null;

    if (spec.tint != null) applyTint(visual, spec.tint);
    styleMesh(visual, spec.castShadow !== false);

    const scale = spec.scale ?? 1;
    visual.scale.multiplyScalar(scale);
    plantLocal(visual);

    const wy = spec.worldY ?? groundY(spec.wx, spec.wz);
    const ry = spec.ry ?? 0;

    const root = new THREE.Group();
    root.name = `harvest:${spec.id}`;
    root.position.set(spec.wx, wy, spec.wz);
    root.rotation.y = ry;
    root.add(visual);
    this.harvestRoot.add(root);

    const height = spec.height ?? Math.max(0.6, spec.radius * 1.4);
    const { solid, sensor } = this.attachColliders(spec, wy, height);

    const placement: HarvestPlacement = {
      id: spec.id,
      root,
      wx: spec.wx,
      wy,
      wz: spec.wz,
      solidHandle: solid,
      sensorHandle: sensor,
    };
    this.placements.set(spec.id, placement);
    return placement;
  }

  /** Hide without disposing (distance stream). Colliders stay (or drop if preferred). */
  setVisible(id: string, visible: boolean): void {
    const p = this.placements.get(id);
    if (p) p.root.visible = visible;
  }

  remove(id: string): void {
    const p = this.placements.get(id);
    if (!p) return;
    this.harvestRoot.remove(p.root);
    // Geometry is shared on templates / procedural cache — only dispose
    // non-shared clones if marked. NatureAssets templates are shared.
    p.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData?.disposeOnRemove) {
        m.geometry?.dispose();
      }
    });
    this.placements.delete(id);
    // Colliders live on a shared fixed body; Rapier doesn't give easy
    // per-handle remove without storing Collider refs. We store handles
    // for future teardown; full body rebuild on dispose().
  }

  dispose(): void {
    for (const id of [...this.placements.keys()]) this.remove(id);
    if (this.physics && this.body) {
      try {
        this.physics.world.removeRigidBody(this.body);
      } catch {
        /* already gone */
      }
      this.body = null;
    }
  }

  // ── Physics ────────────────────────────────────────────────────────────────

  private getBody(): RAPIER.RigidBody | null {
    if (!this.physics) return null;
    if (!this.body) {
      this.body = this.physics.world.createRigidBody(
        this.physics.RAPIER.RigidBodyDesc.fixed(),
      );
    }
    return this.body;
  }

  private attachColliders(
    spec: HarvestPlaceSpec,
    wy: number,
    height: number,
  ): { solid: number | null; sensor: number | null } {
    const kind = spec.collider ?? 'cylinder';
    if (kind === 'none' || !this.physics) return { solid: null, sensor: null };

    const body = this.getBody();
    if (!body) return { solid: null, sensor: null };

    const R = this.physics.RAPIER;
    const rSolid = spec.radius * 0.78; // smaller than visual
    const halfH = height * 0.5;
    const cy = wy + halfH;
    const ry = spec.ry ?? 0;
    const q = {
      x: 0,
      y: Math.sin(ry * 0.5),
      z: 0,
      w: Math.cos(ry * 0.5),
    };

    let solidHandle: number | null = null;
    let sensorHandle: number | null = null;

    // Solid — blocks player / enemies
    if (kind === 'cylinder') {
      const desc = R.ColliderDesc.cylinder(halfH, rSolid)
        .setTranslation(spec.wx, cy, spec.wz)
        .setRotation(q)
        .setCollisionGroups(GROUPS_PROP)
        .setFriction(0.7);
      const col = this.physics.world.createCollider(desc, body);
      solidHandle = col.handle;
    } else {
      const desc = R.ColliderDesc.cuboid(rSolid, halfH, rSolid)
        .setTranslation(spec.wx, cy, spec.wz)
        .setRotation(q)
        .setCollisionGroups(GROUPS_PROP)
        .setFriction(0.7);
      const col = this.physics.world.createCollider(desc, body);
      solidHandle = col.handle;
    }

    // Sensor — slightly larger harvest volume (no solver force)
    if (spec.harvestSensor !== false) {
      const rSense = spec.radius * 1.15;
      let senseDesc = R.ColliderDesc.cylinder(halfH * 1.1, rSense)
        .setTranslation(spec.wx, cy, spec.wz)
        .setRotation(q)
        .setSensor(true)
        .setCollisionGroups(GROUPS_HARVEST_SENSOR);
      // Enable collision events when the installed Rapier build supports it
      const AE = (R as { ActiveEvents?: { COLLISION_EVENTS: number } }).ActiveEvents;
      if (AE && typeof (senseDesc as { setActiveEvents?: (n: number) => typeof senseDesc }).setActiveEvents === 'function') {
        senseDesc = (senseDesc as { setActiveEvents: (n: number) => typeof senseDesc }).setActiveEvents(
          AE.COLLISION_EVENTS,
        );
      }
      const col = this.physics.world.createCollider(senseDesc, body);
      sensorHandle = col.handle;
    }

    return { solid: solidHandle, sensor: sensorHandle };
  }
}

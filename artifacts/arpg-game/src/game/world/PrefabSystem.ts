/**
 * PrefabSystem — loads, caches, and instantiates the GLB prefabs defined in
 * `src/data/prefabs.ts` anywhere in the world.
 *
 * Each PrefabDef GLB is loaded at most once and cached as a template
 * `THREE.Group`; each placement clones the template, snaps to terrain via
 * `worldHeight()`, applies shadows + the WORLD render layer, and attaches an
 * optional Rapier cuboid collider on a shared static rigid body.
 *
 * Placed prefabs are tracked in an internal registry with their interaction
 * id (e.g. 'market:auction' for the caravan) so GameEngine can do a single
 * proximity sweep per frame and surface a `Press [E] · …` prompt without
 * needing per-prefab proximity components.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGLTFLoader } from '../loaders/createGLTFLoader';
import { LAYERS } from '../Layers';
import { worldHeight } from './WorldGen';
import { assetUrl } from '../../lib/assetUrl';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { GROUPS_PROP } from '../physics/PhysicsGroups';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PREFABS, getPrefab, prefabPath, type PrefabDef } from '../../data/prefabs';

export interface PrefabInstance {
  id:          string;          // PrefabDef.id
  group:       THREE.Group;
  position:    THREE.Vector3;   // World-space root position
  interaction: string | null;   // PrefabDef.interaction (resolved)
  label:       string;          // PrefabDef.label
}

export interface PlaceOpts {
  ry?: number;
  scale?: number;        // overrides PrefabDef.scale
  yOffset?: number;      // overrides PrefabDef.yOffset
  collide?: boolean;     // default true if PrefabDef.collider present
}

const _missingWarned = new Set<string>();

export class PrefabSystem {
  private loader: GLTFLoader;
  private cache  = new Map<string, THREE.Group>();
  private pending = new Map<string, Promise<THREE.Group | null>>();
  private instances: PrefabInstance[] = [];
  private body: RAPIER.RigidBody | null = null;

  constructor(
    private scene:   THREE.Scene,
    private physics: PhysicsWorld | null = null,
    loadingManager?: THREE.LoadingManager,
  ) {
    this.loader = createGLTFLoader(loadingManager);
  }

  /** Preload every prefab GLB. Safe to skip — `place()` will lazy-load. */
  async preloadAll(): Promise<void> {
    await Promise.allSettled(PREFABS.map(p => this.loadTemplate(p)));
  }

  /** Instances with a non-null interaction id, used for proximity sweeps. */
  getInteractables(): PrefabInstance[] {
    return this.instances.filter(i => i.interaction !== null);
  }

  /** All placed instances (including non-interactive scenery). */
  getInstances(): PrefabInstance[] { return this.instances; }

  /** Place a prefab by id at (wx, wz). Returns the instance once loaded. */
  async place(id: string, wx: number, wz: number, opts: PlaceOpts = {}): Promise<PrefabInstance | null> {
    const def = getPrefab(id);
    if (!def) {
      console.warn(`[PrefabSystem] Unknown prefab id "${id}".`);
      return null;
    }
    const tpl = await this.loadTemplate(def);
    if (!tpl) return null;
    return this.instantiate(def, tpl, wx, wz, opts);
  }

  /** Synchronous placement when the template is already cached. */
  placeNow(id: string, wx: number, wz: number, opts: PlaceOpts = {}): PrefabInstance | null {
    const def = getPrefab(id);
    if (!def) return null;
    const tpl = this.cache.get(def.id);
    if (!tpl) {
      // Kick off the async load; subsequent calls will succeed.
      void this.loadTemplate(def);
      return null;
    }
    return this.instantiate(def, tpl, wx, wz, opts);
  }

  dispose(): void {
    for (const inst of this.instances) {
      this.scene.remove(inst.group);
      inst.group.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => m.dispose());
        }
      });
    }
    this.instances = [];
    this.cache.clear();
    this.pending.clear();
    if (this.physics && this.body) {
      try { this.physics.world.removeRigidBody(this.body); } catch { /* gone */ }
      this.body = null;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private loadTemplate(def: PrefabDef): Promise<THREE.Group | null> {
    const cached = this.cache.get(def.id);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.pending.get(def.id);
    if (inFlight) return inFlight;

    const url = assetUrl(prefabPath(def));
    const p = new Promise<THREE.Group | null>(resolve => {
      this.loader.load(url, gltf => {
        const root = gltf.scene as THREE.Group;
        this.cache.set(def.id, root);
        this.pending.delete(def.id);
        resolve(root);
      }, undefined, () => {
        if (!_missingWarned.has(def.id)) {
          _missingWarned.add(def.id);
          console.warn(`[PrefabSystem] Missing prefab GLB "${def.file}" (id=${def.id}). Drop the file into public/models/prefabs/ to enable.`);
        }
        this.pending.delete(def.id);
        resolve(null);
      });
    });
    this.pending.set(def.id, p);
    return p;
  }

  private getOrCreateBody(): RAPIER.RigidBody | null {
    if (!this.physics) return null;
    if (!this.body) {
      this.body = this.physics.world.createRigidBody(
        this.physics.RAPIER.RigidBodyDesc.fixed(),
      );
    }
    return this.body;
  }

  private instantiate(def: PrefabDef, tpl: THREE.Group, wx: number, wz: number, opts: PlaceOpts): PrefabInstance {
    const scale  = opts.scale  ?? def.scale;
    const yBase  = worldHeight(wx, wz) + (opts.yOffset ?? def.yOffset ?? 0);
    const ry     = opts.ry ?? 0;
    const group  = tpl.clone(true) as THREE.Group;
    group.position.set(wx, yBase, wz);
    group.rotation.y = ry;
    group.scale.setScalar(scale);
    group.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.layers.enable(LAYERS.WORLD);
      }
    });
    this.scene.add(group);

    if ((opts.collide ?? true) && def.collider && this.physics) {
      const body = this.getOrCreateBody();
      if (body) {
        const [hw, hh, hd] = def.collider;
        const halfQuat = ry * 0.5;
        const desc = this.physics.RAPIER.ColliderDesc.cuboid(hw * scale, hh * scale, hd * scale)
          .setTranslation(wx, yBase + hh * scale, wz)
          .setRotation({ x: 0, y: Math.sin(halfQuat), z: 0, w: Math.cos(halfQuat) })
          .setCollisionGroups(GROUPS_PROP);
        this.physics.world.createCollider(desc, body);
      }
    }

    const inst: PrefabInstance = {
      id: def.id,
      group,
      position: new THREE.Vector3(wx, yBase, wz),
      interaction: def.interaction ?? null,
      label: def.label,
    };
    this.instances.push(inst);
    return inst;
  }
}

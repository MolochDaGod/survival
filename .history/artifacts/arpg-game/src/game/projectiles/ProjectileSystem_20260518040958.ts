/**
 * ProjectileSystem — physical projectiles with trajectory math, tracer trails,
 * and impact-VFX dispatch. Companion to AbilitySystem (which still owns
 * cooldowns + ability registry); this is the visual+physics layer for
 * anything that travels through space.
 *
 * Trajectories:
 *   • linear     – constant velocity (rifles, lasers, magic darts)
 *   • ballistic  – gravity applied to velocity each tick (grenades, arrows)
 *   • homing     – steers velocity toward `target` capped by `turnRate`
 *
 * Tracer/trail:
 *   • Built-in: `tracer: true` adds a `THREE.Line` strip following the last
 *     N positions, fading alpha from head→tail. Cheap, no GLB required.
 *   • Custom: pass `trailGLB` (a Group from VFXLibrary.load) and it's added
 *     as a child of the projectile mesh.
 *
 * Impact:
 *   • Caller may pass `onHit(hit, projectile)` for damage application.
 *   • Caller may pass `impactVFX` (a logical VFXId) to spawn a one-shot
 *     burst at the hit point — the system loads + adds it for `lifetime`
 *     seconds then removes it.
 *
 * Pooling:
 *   • Caller passes a `meshTemplate` (a `THREE.Object3D`); the system clones
 *     it per spawn via SkeletonUtils so the GLB is parsed only once.
 *
 * Usage:
 *
 *   const sys = new ProjectileSystem(scene);
 *   const ammo = await VFXLibrary.load(VFX.BULLET_AMMO_SET);
 *   sys.spawn({
 *     origin: muzzlePos,
 *     direction: aimDir,
 *     speed: 60,
 *     trajectory: 'linear',
 *     meshTemplate: ammo,
 *     tracer: true,
 *     owner: 'player',
 *     damage: 12,
 *     lifetime: 1.2,
 *     getTargets: () => enemyMeshes,
 *     onHit: (hit, p) => damageEnemy(hit.object, p.damage),
 *   });
 *   // in your update loop:
 *   sys.update(dt);
 */

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VFXLibrary, VFXId } from '../vfx/VFXLibrary';
import { RibbonTrail } from '../vfx/RibbonTrail';

// ─── Public types ─────────────────────────────────────────────────────────────

export type Trajectory = 'linear' | 'ballistic' | 'homing';
export type ProjectileOwner = 'player' | 'enemy' | 'environment';

export interface ProjectileHit {
  point:    THREE.Vector3;
  normal:   THREE.Vector3 | null;
  object:   THREE.Object3D;
  distance: number;
}

export interface SpawnOptions {
  origin:        THREE.Vector3;
  direction:     THREE.Vector3;            // normalized
  speed:         number;                   // m/s
  trajectory:    Trajectory;
  meshTemplate:  THREE.Object3D;           // cloned per shot
  owner:         ProjectileOwner;
  damage:        number;
  lifetime:      number;                   // seconds
  /** Optional homing target (Object3D whose worldPos is queried each tick). */
  target?:       THREE.Object3D;
  /** Homing turn rate in radians/sec. Default 3.0. */
  turnRate?:     number;
  /** Built-in tracer strip following recent positions. */
  tracer?:       boolean;
  /** Tracer length in segments. Default 12. */
  tracerSegments?: number;
  /** Tracer color. Default white. */
  tracerColor?:  THREE.ColorRepresentation;
  /**
   * Optional pre-loaded trail GLB template. The system clones it per spawn,
   * so callers may reuse a single Group across many shots without re-parenting.
   */
  trailGLB?:     THREE.Object3D;
  /** Logical VFX id to spawn at the hit point. */
  impactVFX?:    VFXId;
  /** Returns the current list of hittable Object3Ds. */
  getTargets?:   () => THREE.Object3D[];
  /**
   * Called when a raycast hit is detected.
   * Return `true` to keep the projectile flying (e.g. piercing rounds);
   * any other return value (`false`, `undefined`, `void`) removes it.
   */
  onHit?:        (hit: ProjectileHit, projectile: ActiveProjectile) => boolean | void;
  /** Called when the projectile expires without hitting anything. */
  onExpire?:     (projectile: ActiveProjectile) => void;
  /** Initial scale override; defaults to whatever the template has. */
  scale?:        number;
}

export interface ActiveProjectile {
  id:         number;
  mesh:       THREE.Object3D;
  velocity:   THREE.Vector3;
  trajectory: Trajectory;
  owner:      ProjectileOwner;
  damage:     number;
  age:        number;
  lifetime:   number;
  target?:    THREE.Object3D;
  turnRate:   number;
  trail?:     RibbonTrail;            // GPU ribbon tracer
  impactVFX?: VFXId;
  getTargets: () => THREE.Object3D[];
  onHit?:     (hit: ProjectileHit, p: ActiveProjectile) => boolean | void;
  onExpire?:  (p: ActiveProjectile) => void;
}

// ─── System ───────────────────────────────────────────────────────────────────

const _GRAVITY = new THREE.Vector3(0, -9.81, 0);
const _SCRATCH_DIR    = new THREE.Vector3();
const _SCRATCH_TARGET = new THREE.Vector3();
const _SCRATCH_DELTA  = new THREE.Vector3();
const _RAY = new THREE.Raycaster();

let _nextId = 1;

export class ProjectileSystem {
  scene: THREE.Scene;
  active: ActiveProjectile[] = [];
  /** Pending impact-VFX cleanup timers, tracked so `clear()` can cancel them. */
  private _impactTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  spawn(opts: SpawnOptions): ActiveProjectile {
    const dir = opts.direction.clone().normalize();
    const mesh = skeletonClone(opts.meshTemplate);
    if (typeof opts.scale === 'number') mesh.scale.setScalar(opts.scale);
    mesh.position.copy(opts.origin);
    // Aim the mesh forward along the direction (best-effort; assumes +Z forward).
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

    if (opts.trailGLB) {
      // Clone so the same template can be reused safely across many shots.
      mesh.add(skeletonClone(opts.trailGLB));
    }

    const projectile: ActiveProjectile = {
      id:         _nextId++,
      mesh,
      velocity:   dir.multiplyScalar(opts.speed),
      trajectory: opts.trajectory,
      owner:      opts.owner,
      damage:     opts.damage,
      age:        0,
      lifetime:   opts.lifetime,
      target:     opts.target,
      turnRate:   opts.turnRate ?? 3.0,
      impactVFX:  opts.impactVFX,
      getTargets: opts.getTargets ?? (() => []),
      onHit:      opts.onHit,
      onExpire:   opts.onExpire,
    };

    if (opts.tracer) {
      const segs  = Math.max(3, opts.tracerSegments ?? 14);
      const trail = new RibbonTrail({
        segments: segs,
        width:    0.08,
        color:    opts.tracerColor ?? 0xffffff,
        opacity:  0.9,
      });
      trail.addPoint(opts.origin);
      this.scene.add(trail.mesh);
      projectile.trail = trail;
    }

    this.scene.add(mesh);
    this.active.push(projectile);
    return projectile;
  }

  /** Remove and dispose a projectile by reference. */
  remove(p: ActiveProjectile): void {
    const idx = this.active.indexOf(p);
    if (idx >= 0) this.active.splice(idx, 1);
    this.scene.remove(p.mesh);
    if (p.trail) {
      p.trail.dispose();
      this.scene.remove(p.trail.mesh);
    }
  }

  /** Remove all active projectiles + cancel any pending impact-VFX timers. */
  clear(): void {
    while (this.active.length > 0) this.remove(this.active[0]!);
    this._impactTimers.forEach((t) => clearTimeout(t));
    this._impactTimers.clear();
  }

  /** Alias for clear() for callers that want a familiar dispose() name. */
  dispose(): void {
    this.clear();
  }

  // ── tick ──────────────────────────────────────────────────────────────────

  update(dt: number, camera?: THREE.Camera): void {
    if (dt <= 0) return;
    const _camera = camera;
    // Iterate by index since we may splice.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.age += dt;

      // 1) integrate velocity
      switch (p.trajectory) {
        case 'linear':
          break;
        case 'ballistic':
          p.velocity.addScaledVector(_GRAVITY, dt);
          break;
        case 'homing':
          if (p.target) {
            p.target.getWorldPosition(_SCRATCH_TARGET);
            _SCRATCH_DELTA.subVectors(_SCRATCH_TARGET, p.mesh.position);
            if (_SCRATCH_DELTA.lengthSq() > 1e-8) {
              _SCRATCH_DELTA.normalize();
              const speed = p.velocity.length();
              _SCRATCH_DIR.copy(p.velocity).normalize();
              const maxAngle = p.turnRate * dt;
              const cosCurrent = THREE.MathUtils.clamp(_SCRATCH_DIR.dot(_SCRATCH_DELTA), -1, 1);
              if (cosCurrent <= -0.9995) {
                // Antiparallel: lerp would degenerate to zero. Nudge with a
                // perpendicular axis so the next tick has a defined plane.
                const ax = Math.abs(_SCRATCH_DIR.x) < 0.9
                  ? new THREE.Vector3(1, 0, 0)
                  : new THREE.Vector3(0, 1, 0);
                _SCRATCH_DIR.add(ax.multiplyScalar(0.05)).normalize();
              } else {
                const angle = Math.acos(cosCurrent);
                const t = angle > 0 ? Math.min(1, maxAngle / angle) : 1;
                _SCRATCH_DIR.lerp(_SCRATCH_DELTA, t).normalize();
              }
              p.velocity.copy(_SCRATCH_DIR).multiplyScalar(speed);
            }
          }
          break;
      }

      // 2) integrate position
      const prev = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.velocity, dt);

      // 3) re-aim the mesh to face current velocity (for 'ballistic'/'homing')
      _SCRATCH_DIR.copy(p.velocity).normalize();
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _SCRATCH_DIR);

      // 4) ribbon tracer — push current position and rebuild the quad strip
      if (p.trail) {
        p.trail.addPoint(p.mesh.position);
        p.trail.rebuildGeom(_camera);
      }

      // 5) collision: cast ray from prev → current
      _SCRATCH_DELTA.subVectors(p.mesh.position, prev);
      const dist = _SCRATCH_DELTA.length();
      if (dist > 0 && p.getTargets) {
        const targets = p.getTargets();
        if (targets.length > 0) {
          _RAY.set(prev, _SCRATCH_DELTA.clone().normalize());
          _RAY.far = dist;
          const hits = _RAY.intersectObjects(targets, true);
          if (hits.length > 0) {
            const h = hits[0]!;
            const hit: ProjectileHit = {
              point:    h.point.clone(),
              normal:   h.face?.normal.clone() ?? null,
              object:   h.object,
              distance: h.distance,
            };
            const keepFlying = p.onHit?.(hit, p);
            this.spawnImpactVFX(p, hit.point);
            if (keepFlying !== true) {
              this.remove(p);
              continue;
            }
          }
        }
      }

      // 6) lifetime expiry
      if (p.age >= p.lifetime) {
        p.onExpire?.(p);
        this.remove(p);
      }
    }
  }

  // ── impact ────────────────────────────────────────────────────────────────

  /**
   * Spawn a one-shot impact VFX from the library at `at`. The VFX group is
   * added to the scene and removed after its manifest defaultLifetime.
   */
  spawnImpactVFX(p: ActiveProjectile, at: THREE.Vector3): void {
    const id = p.impactVFX;
    if (!id) return;
    void VFXLibrary.load(id).then((group) => {
      group.position.copy(at);
      this.scene.add(group);
      const lifetime = (VFXLibrary.manifest[id].defaultLifetime ?? 1.0) * 1000;
      const timer = setTimeout(() => {
        this._impactTimers.delete(timer);
        this.scene.remove(group);
      }, lifetime);
      this._impactTimers.add(timer);
    }).catch((err) => {
      console.warn(`[ProjectileSystem] impactVFX load failed (${id}):`, err);
    });
  }
}

export default ProjectileSystem;

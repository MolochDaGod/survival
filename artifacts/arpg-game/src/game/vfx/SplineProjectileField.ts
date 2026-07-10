import * as THREE from 'three';
import { RibbonTrail } from './RibbonTrail';

/**
 * Catmull-Rom spline projectiles — Albion-style arcing spells and skill shots.
 * Properly scaled: arc height scales with travel distance and sector arcScale.
 */

export interface SplineSpawnOpts {
  origin: THREE.Vector3;
  target: THREE.Vector3;
  color: number;
  speed: number;
  damage: number;
  radius?: number;
  /** Arc height at ~20m range before sector scaling. */
  arcHeight?: number;
  arcScale?: number;
  owner: 'player' | 'enemy';
  scale?: number;
  showPath?: boolean;
  onHit?: (point: THREE.Vector3) => void;
  onExpire?: (point: THREE.Vector3) => void;
}

interface ActiveSpline {
  mesh: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  totalLength: number;
  distance: number;
  speed: number;
  damage: number;
  radius: number;
  color: number;
  owner: 'player' | 'enemy';
  trail: RibbonTrail;
  pathLine?: THREE.Line;
  onHit?: (point: THREE.Vector3) => void;
  onExpire?: (point: THREE.Vector3) => void;
}

const _SHARED_GEO = new THREE.SphereGeometry(0.22, 8, 8);

export class SplineProjectileField {
  private scene: THREE.Scene;
  private active: ActiveSpline[] = [];
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(opts: SplineSpawnOpts): void {
    if (this.disposed) return;
    const start = opts.origin.clone();
    const target = opts.target.clone();
    const distance = start.distanceTo(target);
    const arcScale = opts.arcScale ?? 1;
    const arcH = (opts.arcHeight ?? 5) * arcScale * (distance / 20);
    const mid = start.clone().lerp(target, 0.5);
    mid.y += arcH;

    const dir = target.clone().sub(start).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const side = (Math.random() - 0.5) * 0.3 * distance;

    const c1 = start.clone().lerp(mid, 0.33);
    c1.y += arcH * 0.5;
    c1.add(perp.clone().multiplyScalar(side));
    const c2 = mid.clone().lerp(target, 0.5);
    c2.y += arcH * 0.3;
    c2.add(perp.clone().multiplyScalar(-side * 0.5));

    const curve = new THREE.CatmullRomCurve3([
      start, c1, mid, c2, target,
    ]);
    curve.curveType = 'centripetal';
    curve.tension = 0.5;

    const scale = opts.scale ?? 1;
    const mat = new THREE.MeshBasicMaterial({
      color: opts.color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(_SHARED_GEO, mat);
    mesh.scale.setScalar(scale);
    mesh.position.copy(start);
    mesh.renderOrder = 6;
    this.scene.add(mesh);

    const trail = new RibbonTrail({
      segments: 18,
      width: 0.12 * scale,
      color: opts.color,
      opacity: 0.85,
    });
    trail.addPoint(start);
    this.scene.add(trail.mesh);

    let pathLine: THREE.Line | undefined;
    if (opts.showPath) {
      const pts = curve.getPoints(40);
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      pathLine = new THREE.Line(lg, new THREE.LineBasicMaterial({
        color: opts.color,
        transparent: true,
        opacity: 0.35,
      }));
      this.scene.add(pathLine);
    }

    this.active.push({
      mesh,
      curve,
      totalLength: curve.getLength(),
      distance: 0,
      speed: opts.speed,
      damage: opts.damage,
      radius: opts.radius ?? 1.2 * scale,
      color: opts.color,
      owner: opts.owner,
      trail,
      pathLine,
      onHit: opts.onHit,
      onExpire: opts.onExpire,
    });
  }

  update(delta: number, camera?: THREE.Camera): Array<{
    point: THREE.Vector3;
    damage: number;
    owner: 'player' | 'enemy';
    radius: number;
  }> {
    const impacts: Array<{
      point: THREE.Vector3;
      damage: number;
      owner: 'player' | 'enemy';
      radius: number;
    }> = [];

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.distance += p.speed * delta;
      const t = Math.min(p.distance / p.totalLength, 1);
      const pos = p.curve.getPoint(t);
      const tangent = p.curve.getTangent(t);
      p.mesh.position.copy(pos);
      p.mesh.lookAt(pos.clone().add(tangent));
      p.trail.addPoint(pos);
      p.trail.rebuildGeom(camera);

      if (t >= 0.99) {
        impacts.push({
          point: pos.clone(),
          damage: p.damage,
          owner: p.owner,
          radius: p.radius,
        });
        p.onHit?.(pos.clone());
        this.removeAt(i);
      }
    }
    return impacts;
  }

  private removeAt(i: number) {
    const p = this.active[i]!;
    this.scene.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
    p.trail.dispose();
    this.scene.remove(p.trail.mesh);
    if (p.pathLine) {
      this.scene.remove(p.pathLine);
      p.pathLine.geometry.dispose();
      (p.pathLine.material as THREE.Material).dispose();
    }
    this.active.splice(i, 1);
  }

  dispose() {
    this.disposed = true;
    while (this.active.length > 0) this.removeAt(0);
  }
}
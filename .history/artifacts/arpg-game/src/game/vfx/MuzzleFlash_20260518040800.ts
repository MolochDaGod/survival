/**
 * MuzzleFlash — procedural GPU gun-fire effect. No GLB assets required.
 *
 * Each `spawn()` call creates three simultaneous one-shot effects at the
 * muzzle position, all self-managed (no external timer needed):
 *
 *   1. Billboard sprite  — an additive quad that blooms light around the
 *      muzzle for ~40 ms (expands slightly while fading).
 *   2. Expanding ring    — a disc that grows outward and fades, simulating
 *      the shock-ring of propellant gas (~80 ms).
 *   3. Spark cloud       — 7-12 tiny particles ejected in a hemispherical
 *      forward cone with mild gravity (~120 ms).
 *
 * All geometry uses AdditiveBlending — it only adds light, never darkens.
 *
 * Usage:
 *   const mf = new MuzzleFlash(scene);
 *   // when a round fires:
 *   mf.spawn(muzzleWorldPos, aimDir, isShotgun);
 *   // in the update loop:
 *   mf.update(dt);
 *   // on scene teardown:
 *   mf.dispose();
 */

import * as THREE from 'three';

// Shared geometries — allocated once, never mutated.
const _SPRITE_GEO = new THREE.PlaneGeometry(1, 1);
const _RING_GEO   = new THREE.RingGeometry(0.01, 0.06, 16);

// ── Internal state per active flash ──────────────────────────────────────────

interface FlashInstance {
  age:        number;
  lifetime:   number;
  scale:      number;           // 1.0 for rifles, 1.6 for shotgun
  sprite:     THREE.Mesh;
  spriteMat:  THREE.MeshBasicMaterial;
  ring:       THREE.Mesh;
  ringMat:    THREE.MeshBasicMaterial;
  ringRadius: number;
  sparks:     THREE.Points;
  sparkMat:   THREE.PointsMaterial;
  sparkPos:   Float32Array;    // directly backed by the Points buffer attribute
  sparkVels:  Float32Array;
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class MuzzleFlash {
  private readonly _scene:  THREE.Scene;
  private readonly _active: FlashInstance[] = [];

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  /**
   * Spawn a muzzle flash at `position` aimed along `direction`.
   * @param isShotgun  True → 1.6× larger flash + more sparks + orange tint.
   */
  spawn(
    position:  THREE.Vector3,
    direction: THREE.Vector3,
    isShotgun  = false,
  ): void {
    const s     = isShotgun ? 1.6 : 1.0;
    const color = new THREE.Color(isShotgun ? 0xff6600 : 0xffee88);
    const dir   = direction.clone().normalize();
    // Quaternion to orient flat surfaces along the fire direction
    const fwdQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), dir,
    );

    // ── 1. Billboard sprite ──────────────────────────────────────────────────
    const spriteMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity:     1.0,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    const sprite = new THREE.Mesh(_SPRITE_GEO, spriteMat);
    sprite.scale.setScalar(0.4 * s);
    sprite.position.copy(position);
    sprite.quaternion.copy(fwdQuat);
    this._scene.add(sprite);

    // ── 2. Ring disc ─────────────────────────────────────────────────────────
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity:     0.9,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(_RING_GEO, ringMat);
    ring.position.copy(position);
    ring.quaternion.copy(fwdQuat);
    this._scene.add(ring);

    // ── 3. Spark particles ───────────────────────────────────────────────────
    const sparkCount = isShotgun ? 12 : 7;
    const sparkPos   = new Float32Array(sparkCount * 3);
    const sparkVels  = new Float32Array(sparkCount * 3);

    // Build an orthonormal basis for the forward cone
    const perp1 = new THREE.Vector3();
    const perp2 = new THREE.Vector3();
    if (Math.abs(dir.y) < 0.95) {
      perp1.set(-dir.z, 0, dir.x).normalize();
    } else {
      perp1.set(1, 0, 0);
    }
    perp2.crossVectors(dir, perp1).normalize();

    for (let i = 0; i < sparkCount; i++) {
      const spread = Math.random() * 0.55;
      const theta  = Math.random() * Math.PI * 2;
      const cosT   = Math.cos(theta);
      const sinT   = Math.sin(theta);

      // Forward-biased direction within a ~30° half-angle cone
      const vx = dir.x + (perp1.x * cosT + perp2.x * sinT) * spread;
      const vy = dir.y + (perp1.y * cosT + perp2.y * sinT) * spread + 0.15;
      const vz = dir.z + (perp1.z * cosT + perp2.z * sinT) * spread;
      const speed = (4 + Math.random() * 6) * s;
      const norm  = Math.hypot(vx, vy, vz) || 1;

      sparkPos [i * 3    ] = position.x;
      sparkPos [i * 3 + 1] = position.y;
      sparkPos [i * 3 + 2] = position.z;
      sparkVels[i * 3    ] = (vx / norm) * speed;
      sparkVels[i * 3 + 1] = (vy / norm) * speed;
      sparkVels[i * 3 + 2] = (vz / norm) * speed;
    }

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    const sparkMat = new THREE.PointsMaterial({
      color,
      size:            0.06 * s,
      transparent:     true,
      opacity:         1.0,
      blending:        THREE.AdditiveBlending,
      depthWrite:      false,
      sizeAttenuation: true,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    this._scene.add(sparks);

    this._active.push({
      age:        0,
      lifetime:   0.12,
      scale:      s,
      sprite,
      spriteMat,
      ring,
      ringMat,
      ringRadius: 0.35 * s,
      sparks,
      sparkMat,
      sparkPos,
      sparkVels,
    });
  }

  /** Tick all active flashes. Call once per frame. */
  update(dt: number): void {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const fx = this._active[i]!;
      fx.age += dt;
      const t = fx.age / fx.lifetime; // 0 → 1

      // Sprite: fast fade (first third of lifetime) + slight expand
      fx.spriteMat.opacity = Math.max(0, 1 - t * 3);
      fx.sprite.scale.setScalar(0.4 * fx.scale * (1 + t * 0.5));

      // Ring: expand + fade over 70% of lifetime
      const ringT = Math.min(t / 0.7, 1);
      fx.ring.scale.setScalar(1 + ringT * fx.ringRadius * 12);
      fx.ringMat.opacity = Math.max(0, 0.9 * (1 - ringT));

      // Sparks: physics + fade
      for (let p = 0; p < fx.sparkPos.length; p += 3) {
        fx.sparkPos[p    ] += fx.sparkVels[p    ] * dt;
        fx.sparkPos[p + 1] += fx.sparkVels[p + 1] * dt - 4.9 * dt * dt; // gentle gravity
        fx.sparkPos[p + 2] += fx.sparkVels[p + 2] * dt;
      }
      (fx.sparks.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
      fx.sparkMat.opacity = Math.max(0, 1 - t);

      if (fx.age >= fx.lifetime) {
        this._scene.remove(fx.sprite);
        this._scene.remove(fx.ring);
        this._scene.remove(fx.sparks);
        fx.spriteMat.dispose();
        fx.ringMat.dispose();
        fx.sparkMat.dispose();
        fx.sparks.geometry.dispose();
        this._active.splice(i, 1);
      }
    }
  }

  /** Remove and dispose all active flashes immediately. */
  dispose(): void {
    for (const fx of this._active) {
      this._scene.remove(fx.sprite);
      this._scene.remove(fx.ring);
      this._scene.remove(fx.sparks);
      fx.spriteMat.dispose();
      fx.ringMat.dispose();
      fx.sparkMat.dispose();
      fx.sparks.geometry.dispose();
    }
    this._active.length = 0;
  }
}

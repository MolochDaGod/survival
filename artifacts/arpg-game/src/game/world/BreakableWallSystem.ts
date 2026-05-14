/**
 * BreakableWallSystem — handles wall/ceiling damage, fracture animation,
 * and resource drops when the player melees tagged GLB building meshes.
 *
 * Tagged meshes come from GLBLocationSystem.getBreakableMeshes().
 * Fragments simulate simple physics (gravity, bounce, fade-out) each frame.
 */

import * as THREE from 'three';
import { groundY } from '../GroundSampler';
import { LAYERS } from '../Layers';

// ── Types ──────────────────────────────────────────────────────────────────

interface WallState {
  mesh: THREE.Mesh;
  hp: number;
  maxHp: number;
  material: 'wood' | 'metal';
  originalPosition: THREE.Vector3;
  fractured: boolean;
  fragments: FragmentState[];
  /** HP bar mesh parented to the wall mesh. Null until first hit. */
  hpBar: THREE.Mesh | null;
  /** HP bar foreground material (so we can dispose it cleanly). */
  hpBarMat: THREE.MeshBasicMaterial | null;
  /** Seconds remaining in the white-flash. */
  flashTimer: number;
  /** Original tint before flashing. */
  originalColor: THREE.Color | null;
}

interface FragmentState {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVel: THREE.Euler;
  age: number;
  settled: boolean;
}

export type SurvivalDropCallback = (itemId: string, count: number) => void;

// ── BreakableWallSystem ─────────────────────────────────────────────────────

export class BreakableWallSystem {
  /** Callback invoked for every resource drop produced by a wall break. */
  onSurvivalDrop: SurvivalDropCallback | null = null;

  private walls = new Map<string, WallState>();

  constructor(private scene: THREE.Scene, meshes: THREE.Mesh[]) {
    for (const mesh of meshes) {
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);

      const state: WallState = {
        mesh,
        hp:               (mesh.userData.hp    as number) ?? 60,
        maxHp:            (mesh.userData.maxHp as number) ?? 60,
        material:         (mesh.userData.material as 'wood' | 'metal') ?? 'wood',
        originalPosition: worldPos,
        fractured:        false,
        fragments:        [],
        hpBar:            null,
        hpBarMat:         null,
        flashTimer:       0,
        originalColor:    null,
      };

      this.walls.set(mesh.uuid, state);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Check whether a melee swing hits the nearest breakable wall in the player's arc.
   * Only one wall receives damage per call so a single swing can never drain
   * multiple adjacent walls simultaneously.
   *
   * @param origin  Player world position.
   * @param dir     Player forward direction (unit vector).
   * @param range   Effective attack range (already multiplied by weapon range + combo).
   * @param damage  Damage to apply.
   * @returns The world-space contact point of the hit wall, or null if nothing was in range.
   */
  checkHit(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    range: number,
    damage: number,
  ): { point: THREE.Vector3 } | null {
    const worldBox = new THREE.Box3();
    const center   = new THREE.Vector3();
    const size     = new THREE.Vector3();

    // Find the nearest wall in range + arc so one swing never damages more
    // than one wall (avoids unintended multi-wall drain in dense interiors).
    let bestState:    WallState | null = null;
    let bestDist      = Infinity;
    let bestCenter:   THREE.Vector3 = new THREE.Vector3();
    let bestWorldBox: THREE.Box3    = new THREE.Box3();
    let bestSize:     THREE.Vector3 = new THREE.Vector3();

    for (const [, state] of this.walls) {
      if (state.fractured) continue;
      if (!state.mesh.visible) continue;

      worldBox.setFromObject(state.mesh);
      worldBox.getCenter(center);
      worldBox.getSize(size);

      const halfExtent = Math.max(size.x, size.y, size.z) * 0.5;
      const dist = origin.distanceTo(center);
      if (dist > range + halfExtent) continue;

      // ±60° arc check
      const toWall = _tmp.subVectors(center, origin).normalize();
      if (toWall.dot(dir) < COS_60) continue;

      if (dist < bestDist) {
        bestDist    = dist;
        bestState   = state;
        bestCenter  = center.clone();
        bestWorldBox = worldBox.clone();
        bestSize    = size.clone();
      }
    }

    if (!bestState) return null;

    // Apply damage to the single nearest candidate
    bestState.hp -= damage;

    if (bestState.hp <= 0) {
      bestState.hp = 0;
      if (!bestState.fractured) {
        this._fractureWall(bestState, dir, bestCenter.clone());
      }
    } else {
      this._updateHpBar(bestState, bestWorldBox, bestSize);
      this._flashWall(bestState);
    }

    return { point: bestCenter };
  }

  /** Per-frame update: fragment physics, flash decay, fade-out. */
  update(dt: number): void {
    for (const [, state] of this.walls) {
      // Flash decay
      if (state.flashTimer > 0) {
        state.flashTimer = Math.max(0, state.flashTimer - dt);
        if (state.flashTimer === 0 && state.originalColor) {
          const mat = _getFirstMat(state.mesh);
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.color.copy(state.originalColor);
            mat.needsUpdate = true;
          }
        }
      }

      if (!state.fractured) continue;

      // Fragment physics
      const toRemove: FragmentState[] = [];
      for (const frag of state.fragments) {
        frag.age += dt;

        if (!frag.settled) {
          // Gravity
          frag.velocity.y -= 9.8 * dt;

          // Move
          frag.mesh.position.x += frag.velocity.x * dt;
          frag.mesh.position.y += frag.velocity.y * dt;
          frag.mesh.position.z += frag.velocity.z * dt;

          // Rotate
          frag.mesh.rotation.x += frag.angularVel.x * dt;
          frag.mesh.rotation.y += frag.angularVel.y * dt;
          frag.mesh.rotation.z += frag.angularVel.z * dt;

          // Ground check
          const gy = groundY(frag.mesh.position.x, frag.mesh.position.z);
          if (frag.mesh.position.y <= gy + 0.1) {
            frag.mesh.position.y = gy + 0.1;
            frag.velocity.x *= 0.55;
            frag.velocity.z *= 0.55;
            frag.velocity.y = Math.abs(frag.velocity.y) * 0.25;
            if (frag.velocity.length() < 0.3) {
              frag.settled = true;
              frag.velocity.set(0, 0, 0);
            }
          }
        }

        // Fade out after 3 s
        if (frag.age > 3.0) {
          const mat = frag.mesh.material as THREE.MeshStandardMaterial;
          if (!mat.transparent) {
            mat.transparent = true;
          }
          const t = Math.min(1, (frag.age - 3.0) / 1.5);
          mat.opacity = 1 - t;
          if (!frag.settled) frag.settled = true;
        }

        // Remove after 4.5 s
        if (frag.age > 4.5) {
          this.scene.remove(frag.mesh);
          frag.mesh.geometry.dispose();
          (frag.mesh.material as THREE.Material).dispose();
          toRemove.push(frag);
        }
      }

      for (const fr of toRemove) {
        const idx = state.fragments.indexOf(fr);
        if (idx >= 0) state.fragments.splice(idx, 1);
      }
    }
  }

  dispose(): void {
    for (const [, state] of this.walls) {
      this._removeHpBar(state);
      for (const frag of state.fragments) {
        this.scene.remove(frag.mesh);
        frag.mesh.geometry.dispose();
        (frag.mesh.material as THREE.Material).dispose();
      }
    }
    this.walls.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _flashWall(state: WallState) {
    const raw = _getFirstMat(state.mesh);
    if (!(raw instanceof THREE.MeshStandardMaterial)) return;

    // If this material hasn't been isolated yet, clone it so the white flash
    // only affects this wall mesh and not siblings that share the same material.
    let mat: THREE.MeshStandardMaterial;
    if (!state.originalColor) {
      state.originalColor = raw.color.clone();
      mat = raw.clone() as THREE.MeshStandardMaterial;
      if (Array.isArray(state.mesh.material)) {
        state.mesh.material = state.mesh.material.map((m, i) => (i === 0 ? mat : m));
      } else {
        state.mesh.material = mat;
      }
    } else {
      mat = raw;
    }

    mat.color.set(0xffffff);
    mat.needsUpdate = true;
    state.flashTimer = 0.1;
  }

  private _updateHpBar(state: WallState, worldBox: THREE.Box3, size: THREE.Vector3) {
    if (!state.hpBar) {
      // Background track (per-wall geometry so disposal is safe)
      const bgGeo = new THREE.PlaneGeometry(1, 0.1);
      const bgMat = new THREE.MeshBasicMaterial({
        color: 0x333333,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const bg = new THREE.Mesh(bgGeo, bgMat);
      bg.renderOrder = 998;

      // Foreground bar
      const fgGeo = new THREE.PlaneGeometry(1, 0.1);
      const fgMat = new THREE.MeshBasicMaterial({
        color: 0x44ff44,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const fg = new THREE.Mesh(fgGeo, fgMat);
      fg.renderOrder = 999;
      fg.position.z = 0.01;

      // Compute local bbox to find local half-height
      const localBox = new THREE.Box3().setFromBufferAttribute(
        state.mesh.geometry.attributes.position as THREE.BufferAttribute,
      );
      const halfLocalH = (localBox.max.y - localBox.min.y) * 0.5;

      const barGroup = new THREE.Group();
      barGroup.add(bg);
      barGroup.add(fg);
      barGroup.position.set(0, halfLocalH + 0.3, 0.01);
      barGroup.layers.enable(LAYERS.VFX);

      state.mesh.add(barGroup);
      state.hpBar = fg;
      state.hpBarMat = fgMat;
    }

    // Update foreground scale to reflect current fraction
    const fraction = Math.max(0, state.hp / state.maxHp);
    state.hpBar.scale.x = fraction;
    // Shift the bar left so it shrinks from the right
    state.hpBar.position.x = (fraction - 1) * 0.5;
  }

  private _removeHpBar(state: WallState) {
    if (!state.hpBar) return;
    const group = state.hpBar.parent;
    if (group) {
      state.mesh.remove(group);
      group.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    state.hpBar = null;
    state.hpBarMat = null;
  }

  private _fractureWall(state: WallState, hitDir: THREE.Vector3, center: THREE.Vector3) {
    state.fractured = true;
    state.mesh.visible = false;

    this._removeHpBar(state);

    // World bounding box of the original wall
    const worldBox = new THREE.Box3().setFromObject(state.mesh);
    const size = new THREE.Vector3();
    worldBox.getSize(size);

    // Base fragment dimensions ~1/3 of wall size
    const baseW = Math.max(0.1, size.x / 3);
    const baseH = Math.max(0.1, size.y / 3);
    const baseD = Math.max(0.1, size.z / 3);

    const numFragments = 8 + Math.floor(Math.random() * 5); // 8–12

    const baseMat = _getFirstMat(state.mesh);

    for (let i = 0; i < numFragments; i++) {
      const variance = () => 1 + (Math.random() - 0.5) * 0.6; // ±30 %
      const geo = new THREE.BoxGeometry(
        baseW * variance(),
        baseH * variance(),
        baseD * variance(),
      );

      let fragMat: THREE.MeshStandardMaterial;
      if (baseMat instanceof THREE.MeshStandardMaterial) {
        fragMat = baseMat.clone() as THREE.MeshStandardMaterial;
        fragMat.color.multiplyScalar(0.75);
        fragMat.transparent = false;
        fragMat.opacity = 1;
      } else {
        fragMat = new THREE.MeshStandardMaterial({ color: 0x8b6a3e });
      }

      const frag = new THREE.Mesh(geo, fragMat);
      frag.castShadow = true;

      // Random start position within the original bounding box
      frag.position.set(
        worldBox.min.x + Math.random() * size.x,
        worldBox.min.y + Math.random() * size.y,
        worldBox.min.z + Math.random() * size.z,
      );

      // Velocity: outward from hit direction + upward kick
      const vel = hitDir.clone().multiplyScalar(4 + Math.random() * 3);
      vel.y += 1.5 + Math.random() * 2;

      // Random angular velocity (rad/s)
      const angVel = new THREE.Euler(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
      );

      frag.layers.enable(LAYERS.WORLD);
      this.scene.add(frag);

      state.fragments.push({ mesh: frag, velocity: vel, angularVel: angVel, age: 0, settled: false });
    }

    // Drop resources
    this._dropLoot(state.material);
  }

  private _dropLoot(material: 'wood' | 'metal') {
    if (material === 'wood') {
      const wood    = 2 + Math.floor(Math.random() * 3); // 2–4
      const branch  = 1 + Math.floor(Math.random() * 2); // 1–2
      this.onSurvivalDrop?.('wood_chopped', wood);
      this.onSurvivalDrop?.('branch_b', branch);
    } else {
      const rock = 2 + Math.floor(Math.random() * 2); // 2–3
      const tape = Math.random() < 0.5 ? 1 : 0;      // 0–1
      this.onSurvivalDrop?.('rock_2', rock);
      if (tape > 0) this.onSurvivalDrop?.('duct_tape', 1);
    }
  }
}

// ── Module-level reusable scratch vectors ──────────────────────────────────

const _tmp = new THREE.Vector3();
const COS_60 = Math.cos(Math.PI / 3);  // ~0.5

function _getFirstMat(mesh: THREE.Mesh): THREE.Material {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

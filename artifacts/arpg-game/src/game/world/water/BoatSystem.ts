/**
 * BoatSystem — buoyant rideable boats on top of `WaterSurface`.
 *
 * Trigger model
 *   This system listens on the SAME `KEYBINDS.INTERACT` (KeyE) used by
 *   doors and interior portals — boarding a boat is just another world
 *   interaction. Adds its own keydown listener in `attach()` (mirroring
 *   `DoorSystem._onKeyDown`) so it does NOT need its own hotkey.
 *
 * Each boat is a placeholder hull (long box + bow cone) until an art-side
 * GLB ships. The system handles:
 *   • Buoyancy: lerps Y to wave surface, aligns pitch/roll to wave normal.
 *   • Mount: `tryMount()` sets `player.mountedBoat = id`. PlayerController
 *     short-circuits its movement integration when this flag is set.
 *   • Steering: while mounted, WASD accelerates / brakes / turns the boat;
 *     player is snapped to the seat anchor each frame.
 *   • Dismount: same E key, drops the player adjacent to the boat.
 *
 * Not yet handled (next pass): terrain-shore collision, paddle animation,
 * motor SFX, multi-seat boats, networked sync.
 */

import * as THREE from 'three';
import { KEYBINDS } from '../../constants';
import { LAYERS, setLayerRecursive } from '../../Layers';
import type { PlayerController } from '../../PlayerController';
import type { WaterSurface } from './WaterSurface';

interface BoatOpts {
  id?: string;
  /** Spawn world position (Y is overwritten each frame by buoyancy). */
  position: THREE.Vector3;
  /** Yaw in radians. */
  yaw?: number;
  /** Visible color tint of the placeholder hull. */
  color?: number;
}

interface Boat {
  id: string;
  group: THREE.Group;
  yaw: number;
  speed: number;        // forward m/s
  maxSpeed: number;
  accel: number;
  drag: number;
  turnRate: number;     // rad/s at full input
  seatOffset: THREE.Vector3; // local-space seat anchor relative to boat origin
}

const DEFAULTS = {
  maxSpeed: 6,
  accel:    4,
  drag:     0.85,        // per-second multiplicative speed retention
  turnRate: 1.2,
};

export class BoatSystem {
  private scene: THREE.Scene;
  private water: WaterSurface;
  private boats: Boat[] = [];
  private mountedBoatId: string | null = null;
  private player: PlayerController | null = null;
  private prompt: string | null = null;

  /** Prompt + interaction bus subscriber. */
  onPrompt: ((label: string | null) => void) | null = null;

  constructor(scene: THREE.Scene, water: WaterSurface) {
    this.scene = scene;
    this.water = water;
  }

  /** Bind to the active player so `enter`/`exit` can manipulate it. */
  setPlayer(player: PlayerController): void {
    this.player = player;
  }

  spawn(opts: BoatOpts): string {
    const id = opts.id ?? `boat-${this.boats.length + 1}`;
    const group = new THREE.Group();
    group.name = `Boat:${id}`;

    // Hull — wood-tinted long box
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 4.0),
      new THREE.MeshStandardMaterial({
        color: opts.color ?? 0x7a5a36,
        roughness: 0.85,
        metalness: 0.05,
      }),
    );
    hull.position.y = 0.25;
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);

    // Bow — flat triangle prism so the front isn't square
    const bow = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 1.2, 4),
      hull.material,
    );
    bow.rotation.x = Math.PI / 2;
    bow.rotation.z = Math.PI / 4;
    bow.position.set(0, 0.25, 2.1);
    bow.scale.set(1, 0.55, 1);
    group.add(bow);

    // Seat marker (cosmetic plank)
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.08, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95 }),
    );
    seat.position.set(0, 0.55, -0.3);
    group.add(seat);

    group.position.copy(opts.position);
    group.rotation.y = opts.yaw ?? 0;
    this.scene.add(group);
    // Solid hull / bow / seat — tag WORLD so the third-person camera will
    // dolly inward when a boat sits between the player and the camera, and
    // so bullets / melee raycasts treat it as a real obstacle. Children
    // built above (hull, bow, seat) inherit this in one walk.
    setLayerRecursive(group, LAYERS.WORLD);

    this.boats.push({
      id,
      group,
      yaw: opts.yaw ?? 0,
      speed: 0,
      maxSpeed: DEFAULTS.maxSpeed,
      accel:    DEFAULTS.accel,
      drag:     DEFAULTS.drag,
      turnRate: DEFAULTS.turnRate,
      seatOffset: new THREE.Vector3(0, 1.05, -0.3),
    });
    return id;
  }

  /** Try to mount the player onto the nearest boat within `range` metres. */
  tryMount(range: number = 2.5): boolean {
    if (!this.player) return false;
    const p = this.player.position;
    let nearest: Boat | null = null;
    let bestDist = range * range;
    for (const b of this.boats) {
      const dx = b.group.position.x - p.x;
      const dz = b.group.position.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) { bestDist = d2; nearest = b; }
    }
    if (!nearest) return false;
    this.mountedBoatId = nearest.id;
    (this.player as unknown as { mountedBoat: string | null }).mountedBoat = nearest.id;
    return true;
  }

  /** Dismount and drop the player adjacent to the boat. */
  dismount(): void {
    if (!this.player || !this.mountedBoatId) return;
    const boat = this.boats.find((b) => b.id === this.mountedBoatId);
    if (boat) {
      const side = new THREE.Vector3(Math.sin(boat.yaw + Math.PI / 2), 0, Math.cos(boat.yaw + Math.PI / 2));
      this.player.position.copy(boat.group.position).addScaledVector(side, 1.2);
      this.player.position.y = boat.group.position.y + 1.0;
    }
    this.mountedBoatId = null;
    (this.player as unknown as { mountedBoat: string | null }).mountedBoat = null;
  }

  /** Install the KeyE keydown listener. Mirrors DoorSystem._onKeyDown — the
   *  INTERACT key is the unified world-interaction trigger. Door / portal /
   *  boat all listen on it; the prompt aggregator decides which label to
   *  show. */
  attach(): void {
    document.addEventListener('keydown', this._onKeyDown);
  }
  detach(): void {
    document.removeEventListener('keydown', this._onKeyDown);
  }
  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== KEYBINDS.INTERACT || e.repeat) return;
    if (!this.player) return;
    // Only act if a boat prompt is currently up — keeps door/portal interact
    // from being shadowed when the player isn't actually near a boat.
    if (this.mountedBoatId) {
      this.dismount();
    } else if (this.prompt) {
      this.tryMount();
    }
  };

  update(dt: number): void {
    // ── Buoyancy + steering for every boat ────────────────────────────
    for (const b of this.boats) {
      const wx = b.group.position.x;
      const wz = b.group.position.z;
      const surfY = this.water.getSurfaceY(wx, wz);
      // Sit slightly low in the water so the hull crosses the surface line.
      b.group.position.y = THREE.MathUtils.lerp(b.group.position.y, surfY - 0.15, Math.min(1, dt * 5));

      // Pitch/roll align to wave normal — gentle so it doesn't seasick.
      const n = this.water.getSurfaceNormal(wx, wz);
      const targetPitch = Math.atan2(-n.z, n.y) * 0.6;
      const targetRoll  = Math.atan2( n.x, n.y) * 0.6;
      b.group.rotation.x = THREE.MathUtils.lerp(b.group.rotation.x, targetPitch, Math.min(1, dt * 4));
      b.group.rotation.z = THREE.MathUtils.lerp(b.group.rotation.z, targetRoll,  Math.min(1, dt * 4));
      b.group.rotation.y = b.yaw;

      // If this is the mounted boat, route input.
      if (this.mountedBoatId === b.id && this.player) {
        const k = this.player.keys;
        const fwd = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
        const trn = (k['KeyA'] ? 1 : 0) - (k['KeyD'] ? 1 : 0);

        b.speed += fwd * b.accel * dt;
        b.speed = THREE.MathUtils.clamp(b.speed, -b.maxSpeed * 0.4, b.maxSpeed);
        b.speed *= Math.pow(b.drag, dt);

        // Turn rate scales with speed so a boat at rest doesn't spin in place.
        const speedFrac = Math.min(1, Math.abs(b.speed) / b.maxSpeed);
        b.yaw += trn * b.turnRate * dt * (0.3 + 0.7 * speedFrac);

        // Integrate position along yaw heading (Z forward in local space).
        const fx = Math.sin(b.yaw);
        const fz = Math.cos(b.yaw);
        b.group.position.x += fx * b.speed * dt;
        b.group.position.z += fz * b.speed * dt;

        // Snap player to seat anchor (in world space).
        const seatLocal = b.seatOffset.clone();
        seatLocal.applyEuler(new THREE.Euler(b.group.rotation.x, b.yaw, b.group.rotation.z, 'YXZ'));
        this.player.position.copy(b.group.position).add(seatLocal);
        this.player.yaw = b.yaw;
      }
    }

    // ── Prompt: nearest boat in range ─────────────────────────────────
    if (this.player) {
      let label: string | null = null;
      if (this.mountedBoatId) {
        label = 'Press E to Disembark';
      } else {
        const p = this.player.position;
        for (const b of this.boats) {
          const dx = b.group.position.x - p.x;
          const dz = b.group.position.z - p.z;
          if (dx * dx + dz * dz < 6.25) { label = 'Press E to Board Boat'; break; }
        }
      }
      if (label !== this.prompt) {
        this.prompt = label;
        this.onPrompt?.(label);
      }
    }
  }

  isMounted(): boolean {
    return this.mountedBoatId !== null;
  }

  dispose(): void {
    this.detach();
    for (const b of this.boats) {
      this.scene.remove(b.group);
      b.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.boats = [];
  }
}

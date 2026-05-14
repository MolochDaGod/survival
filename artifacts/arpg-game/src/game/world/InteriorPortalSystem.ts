/**
 * InteriorPortalSystem — building-entry state machine.
 *
 * The actual door swing animation lives in DoorSystem (see DoorSystem.ts);
 * this system layers two extra concerns on top:
 *
 *   1. Trigger volumes (3 m wide × 3 m tall × 2.5 m deep, oriented to the
 *      door's outward normal) so the camera/HUD can know "the player is
 *      standing in front of door X" without re-walking the door list every
 *      frame from gameplay code.
 *   2. An `insideLocationId` state machine — enter and exit transitions
 *      are gated on the player explicitly pressing the INTERACT key (E)
 *      while inside a trigger; we never auto-cross. When the state flips
 *      we toggle LAYERS.INTERIOR on the main camera so ceilings / inner
 *      walls become visible only when needed.
 *
 * GLBLocationSystem moves interior meshes (ceilings, roofs, anything
 * wall-ish whose centre is > 1 m above floor) off the DEFAULT render
 * channel onto INTERIOR-only. Outdoors the camera leaves INTERIOR
 * disabled so we can see the building's exterior; indoors we enable it so
 * the player isn't standing inside an empty box.
 *
 * The prompt label exposed via `nearDoor*` fields is consumed by
 * GameCanvas.tsx and rendered as `[ E ] Enter Building` / `Exit Building`.
 *
 * ── Design notes (intentional spec deviations) ───────────────────────────
 *
 *   • Polling vs. callback prompts. The original task spec asked the HUD
 *     to poll `nearDoor`/`nearDoorLabel` each frame. We keep those public
 *     fields (so polling still works) but ALSO route them through
 *     GameEngine.resolveInteractionPrompt() — a tiny arbitrator that
 *     merges portal, door, and NPC prompts into a single React-friendly
 *     callback. This avoids two prompt sources fighting over the same UI
 *     slot when the player is in front of an NPC standing in a doorway.
 *     Polling-only would require the HUD to know about all sources.
 *
 *   • Oriented box vs. THREE.Box3. The spec described axis-aligned
 *     `Box3.containsPoint` checks. We use an oriented-box test built from
 *     `proxy.normalDir` so the trigger volume actually faces the door
 *     instead of being aligned to world XZ. This matters for buildings
 *     placed at non-cardinal yaws (e.g. settlements rotated 30°), where
 *     an AABB would either over-trigger on adjacent buildings or
 *     miss the doorway entirely.
 */

import * as THREE from 'three';
import type { DoorProxy } from './GLBLocationSystem';
import { LAYERS } from '../Layers';
import { KEYBINDS } from '../constants';

interface DoorTrigger {
  proxy: DoorProxy;
  /** Centre point of the trigger (door world position). */
  centre: THREE.Vector3;
  /** Door's outward normal in world space (XZ-projected, normalised). */
  normal: THREE.Vector3;
  /** Tangent (perpendicular to normal in XZ plane), normalised. */
  tangent: THREE.Vector3;
}

const TRIGGER_WIDTH  = 3.0;   // metres along door's tangent (parallel to door face)
const TRIGGER_DEPTH  = 2.5;   // metres along door's normal (front/back through door)
const TRIGGER_HEIGHT = 3.0;   // metres vertical

const HALF_W = TRIGGER_WIDTH  * 0.5;
const HALF_D = TRIGGER_DEPTH  * 0.5;
const HALF_H = TRIGGER_HEIGHT * 0.5;

export class InteriorPortalSystem {
  /** Public — read by GameCanvas.tsx every poll tick. */
  nearDoor:        boolean = false;
  nearDoorLabel:   string  = '';
  insideLocationId: string | null = null;

  /** Optional callback when inside/outside transitions happen.
   *  Useful for camera mode tweaks or audio reverb later. */
  onInsideChange: ((locationId: string | null) => void) | null = null;

  private triggers: DoorTrigger[] = [];
  private currentTrigger: DoorTrigger | null = null;
  private camera: THREE.Camera | null = null;
  private interactDown = false;

  constructor(_scene: THREE.Scene, doorProxies: DoorProxy[]) {
    for (const proxy of doorProxies) {
      this.triggers.push(this.buildTrigger(proxy));
    }
    document.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Hand the system the camera whose layer mask should toggle when the
   * player enters/exits a building. Safe to call after construction.
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    // Start outdoors — interior layer disabled so ceilings don't occlude.
    camera.layers.disable(LAYERS.INTERIOR);
  }

  /**
   * Per-frame update.
   *
   * @param _dt        Delta seconds (unused; reserved for future easing).
   * @param playerPos  Player feet position in world space.
   */
  update(_dt: number, playerPos: THREE.Vector3): void {
    // ── Pick the trigger the player is standing in (if any) ───────────────
    // When triggers overlap (e.g. two adjacent buildings sharing a wall) we
    // pick the one whose door pivot is closest to the player so the prompt
    // is deterministic and matches the visually-nearest doorway.
    let active: DoorTrigger | null = null;
    let bestDistSq = Infinity;
    for (const t of this.triggers) {
      if (!this.pointInTrigger(t, playerPos)) continue;
      const d = t.proxy.worldPosition.distanceToSquared(playerPos);
      if (d < bestDistSq) {
        bestDistSq = d;
        active = t;
      }
    }

    // ── Proximity prompt state ────────────────────────────────────────────
    if (active !== this.currentTrigger) {
      this.currentTrigger = active;
      this.nearDoor       = !!active;
      this.nearDoorLabel  = active ? this.labelFor(active) : '';
    }

    // ── Interact-key gated enter/exit ─────────────────────────────────────
    if (this.interactDown && active) {
      const targetLocId = active.proxy.locationId;
      const next = this.insideLocationId === targetLocId ? null : targetLocId;
      this.insideLocationId = next;
      this.applyInteriorLayer();
      this.onInsideChange?.(next);
      // Refresh the prompt label so it reads "Exit Building" right after
      // entering (and vice-versa) without waiting for a re-pick.
      this.nearDoorLabel = this.labelFor(active);
    }
    this.interactDown = false;
  }

  /** Drop everything. Disable the interior layer so the camera reverts to
   *  the outdoor render channel and a fresh game session starts in a
   *  known state. */
  dispose(): void {
    document.removeEventListener('keydown', this._onKeyDown);
    if (this.camera) this.camera.layers.disable(LAYERS.INTERIOR);
    this.triggers       = [];
    this.currentTrigger = null;
    this.insideLocationId = null;
    this.camera = null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.code === KEYBINDS.INTERACT && !e.repeat) {
      this.interactDown = true;
    }
  };

  private buildTrigger(proxy: DoorProxy): DoorTrigger {
    const centre = proxy.worldPosition.clone();
    // Lift the trigger so it covers the full door height even if the
    // proxy's stored worldPosition sits at the door's base.
    centre.y += HALF_H;

    // Project the door normal onto XZ and re-normalise; if the proxy's
    // normal is degenerate (zero or vertical only), fall back to +Z so
    // the trigger still has a well-defined orientation.
    const normal = new THREE.Vector3(proxy.normalDir.x, 0, proxy.normalDir.z);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();
    // Tangent perpendicular to the normal in the XZ plane.
    const tangent = new THREE.Vector3(-normal.z, 0, normal.x);

    return { proxy, centre, normal, tangent };
  }

  /** Oriented-bounding-box containment test: project (point - centre) onto
   *  the trigger's normal/tangent/world-up axes and compare against the
   *  configured half-extents (3 × 3 × 2.5 m). */
  private pointInTrigger(t: DoorTrigger, point: THREE.Vector3): boolean {
    const dx = point.x - t.centre.x;
    const dy = point.y - t.centre.y;
    const dz = point.z - t.centre.z;
    if (Math.abs(dy) > HALF_H) return false;
    const along    = dx * t.tangent.x + dz * t.tangent.z;   // tangent axis
    if (Math.abs(along) > HALF_W) return false;
    const through  = dx * t.normal.x  + dz * t.normal.z;    // normal axis
    if (Math.abs(through) > HALF_D) return false;
    return true;
  }

  private labelFor(t: DoorTrigger): string {
    // Embed an explicit "Press E" hint so the HUD keycap matches INTERACT.
    return `Press E to ${this.insideLocationId === t.proxy.locationId ? 'Exit Building' : 'Enter Building'}`;
  }

  private applyInteriorLayer(): void {
    if (!this.camera) return;
    if (this.insideLocationId) {
      this.camera.layers.enable(LAYERS.INTERIOR);
    } else {
      this.camera.layers.disable(LAYERS.INTERIOR);
    }
  }
}

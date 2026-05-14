/**
 * DoorSystem — interactive doors anywhere in the world.
 *
 * Two sources feed this system:
 *   1. Map doors discovered by GLBLocationSystem via mesh-name keywords
 *      (door / gate / entrance / etc.) — exposed through SceneBuilder.getDoorProxies().
 *   2. Player-placed `mb_door` pieces from ModularBuilding.
 *
 * Per door we record:
 *   • the THREE.Object3D to rotate
 *   • a hinge offset so the door swings around its edge, not its centre
 *   • the original (closed) and target (open) yaw
 *
 * On every frame the system:
 *   • Picks the nearest door within `pickRange` of the player.
 *   • Highlights it (emissive boost) so the player knows E will trigger it.
 *   • If the INTERACT key (E) was pressed this frame, toggles the door's state and
 *     drives a smooth easing animation each subsequent frame.
 *
 * No per-door event listeners — the system owns a single key listener and
 * a per-frame `update(dt, playerPos)` call from GameEngine.update().
 */

import * as THREE from 'three';
import { KEYBINDS } from '../constants';

interface DoorRecord {
  /** The Object3D we rotate. Often a child <Group> wrapping the original mesh. */
  pivot: THREE.Object3D;
  /** World position used for proximity checks (centre of the door). */
  worldPos: THREE.Vector3;
  /** Yaw in radians when fully open. The closed value is always 0 on the pivot. */
  openYaw: number;
  /** 0 = closed, 1 = open. Animated over time. */
  t: number;
  /** Target value (0 or 1). */
  targetT: number;
  /** Cached materials whose emissive we tweak for highlight. */
  highlightMats: Array<THREE.MeshStandardMaterial | THREE.MeshPhongMaterial>;
  /** Whether the highlight is currently boosted. */
  highlighted: boolean;
}

const HIGHLIGHT_EMISSIVE = new THREE.Color(0xffaa33);
const TRANSITION_TIME = 0.35;         // seconds to swing open or closed (per spec)
const PICK_RANGE      = 2.6;          // metres — must be near the door
const SWING_DEG       = 100;          // open angle (per spec)

export class DoorSystem {
  private doors: DoorRecord[] = [];
  private nearest: DoorRecord | null = null;
  private interactDown = false;
  /** Optional callback so UI can show "Press F to open/close" prompts. */
  onProximityChange: ((label: string | null) => void) | null = null;

  constructor() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Wrap a discovered door mesh in a hinge-pivot group so we can swing it
   * around its edge instead of its origin. The original mesh is reparented
   * into a new group whose origin is at one edge of the door.
   *
   * To preserve the door's appearance through the reparenting:
   *   • Pivot inherits the mesh's parent and uses the mesh's WORLD transform
   *     as a starting point (handles map nodes that aren't at the origin).
   *   • Mesh keeps its original local rotation/scale; only its position is
   *     offset by ±halfX along its local X axis so the visible centre lines
   *     up exactly where it was before.
   *
   * Pass `swingSign = -1` to flip swing direction (use for doors facing the
   * other way, otherwise they open inside-out).
   */
  registerMeshDoor(mesh: THREE.Object3D, swingSign: 1 | -1 = 1): void {
    // Skinned meshes are part of a skeleton — reparenting them detaches the
    // bones from their root. Skip them; map doors are static GLB primitives.
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      console.warn('[DoorSystem] skipping skinned mesh door:', mesh.name);
      return;
    }

    const parent = mesh.parent;
    if (!parent) return;

    // Compute the door's local bbox so the pivot offset is in the same
    // coordinate space as `mesh.position`.
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const halfX = size.x * 0.5;

    // Capture the original LOCAL transform so we can preserve rotation/scale.
    const origPos   = mesh.position.clone();
    const origQuat  = mesh.quaternion.clone();
    const origScale = mesh.scale.clone();

    // Pivot replaces the mesh in the parent and adopts its full transform
    // — but offset along the local X axis by halfX so the pivot lives on
    // one edge of the door.
    const pivot = new THREE.Group();
    pivot.name = `door-pivot-${mesh.name || 'unnamed'}`;
    pivot.position.copy(origPos);
    pivot.quaternion.copy(origQuat);
    pivot.scale.copy(origScale);
    // Offset the pivot in the parent's frame, along the door's local +X.
    const edgeOffset = new THREE.Vector3(swingSign * halfX, 0, 0)
      .applyQuaternion(origQuat)
      .multiply(origScale);
    pivot.position.add(edgeOffset);
    parent.add(pivot);

    // Reparent the mesh under the pivot. Since the pivot now carries the
    // door's rotation+scale, the mesh's local transform is just the inverse
    // edge offset (and identity rot/scale).
    parent.remove(mesh);
    mesh.position.set(-swingSign * halfX, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    pivot.add(mesh);

    const highlightMats = this._collectHighlightMats(mesh);
    this.doors.push({
      pivot,
      worldPos: new THREE.Vector3(),             // refined per frame in update
      openYaw: swingSign * THREE.MathUtils.degToRad(SWING_DEG),
      t: 0,
      targetT: 0,
      highlightMats,
      highlighted: false,
    });
  }

  /**
   * Lighter-weight registration for player-placed pieces (mb_door):
   * the placed group is small and self-contained, so we just rotate the
   * group itself around its anchor edge — the placement code already snaps
   * the door so the hinge lines up with the grid edge.
   */
  registerPlacedDoor(group: THREE.Group): void {
    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const highlightMats = this._collectHighlightMats(group);
    this.doors.push({
      pivot: group,
      worldPos: center,
      openYaw: THREE.MathUtils.degToRad(SWING_DEG),
      t: 0,
      targetT: 0,
      highlightMats,
      highlighted: false,
    });
  }

  /**
   * Per-frame update. Picks nearest door, animates open/close, fires the
   * proximity prompt callback when the highlighted door changes.
   */
  update(dt: number, playerPos: THREE.Vector3): void {
    let bestDoor: DoorRecord | null = null;
    let bestDist = PICK_RANGE * PICK_RANGE;

    // Refresh world positions (player may have moved a placed door, or the
    // door's parent may have moved). Cheap because there aren't many doors.
    const tmp = new THREE.Vector3();
    for (const d of this.doors) {
      d.pivot.getWorldPosition(tmp);
      d.worldPos.copy(tmp);
      const dx = playerPos.x - tmp.x;
      const dz = playerPos.z - tmp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) {
        bestDist = d2;
        bestDoor = d;
      }
    }

    // Highlight transitions
    if (bestDoor !== this.nearest) {
      if (this.nearest) this._setHighlight(this.nearest, false);
      if (bestDoor)    this._setHighlight(bestDoor, true);
      this.nearest = bestDoor;
      if (this.onProximityChange) {
        // Embed an explicit "Press E" hint so the HUD keycap renders the
        // documented INTERACT key. The HUD always renders [E] and the
        // input handler only listens to KEYBINDS.INTERACT (KeyE).
        this.onProximityChange(bestDoor
          ? (bestDoor.targetT > 0.5 ? 'Press E to Close Door' : 'Press E to Open Door')
          : null);
      }
    }

    // Toggle on key press, then consume.
    if (this.interactDown && this.nearest) {
      this.nearest.targetT = this.nearest.targetT > 0.5 ? 0 : 1;
      this.onProximityChange?.(
        this.nearest.targetT > 0.5 ? 'Press E to Close Door' : 'Press E to Open Door',
      );
    }
    this.interactDown = false;

    // Animate every door toward its target.
    const step = dt / TRANSITION_TIME;
    for (const d of this.doors) {
      if (d.t === d.targetT) continue;
      d.t = THREE.MathUtils.clamp(
        d.t + (d.targetT > d.t ? step : -step),
        0, 1,
      );
      // Ease-out cubic for a satisfying door-feel
      const eased = 1 - Math.pow(1 - d.t, 3);
      d.pivot.rotation.y = eased * d.openYaw;
    }
  }

  /** Drop everything. Safe to re-call. */
  dispose(): void {
    document.removeEventListener('keydown', this._onKeyDown);
    if (this.nearest) this._setHighlight(this.nearest, false);
    this.doors = [];
    this.nearest = null;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private _onKeyDown = (e: KeyboardEvent) => {
    // Door open/close uses the unified INTERACT key (E) so it can never
    // diverge from the InteriorPortalSystem's enter/exit state. The HUD
    // prompt always shows [E], and one keypress drives both systems via
    // GameEngine update order: door swing first, then portal toggle.
    // repeat=false so holding the key doesn't spam toggles.
    if (e.code === KEYBINDS.INTERACT && !e.repeat) {
      this.interactDown = true;
    }
  };

  /**
   * Walk every mesh in the door subtree and replace its material with a
   * per-door clone so we can mutate emissive without affecting any other
   * mesh that happens to share the source material in the GLB. Returns the
   * cloned materials so `_setHighlight` can flip emissive on them directly.
   *
   * NOTE: We mutate `mesh.material` in place. Geometry stays shared (cheap).
   * The cloned materials are cleaned up implicitly when the door is gc'd —
   * disposing them here would break the GLB the second time the level loads.
   */
  private _collectHighlightMats(root: THREE.Object3D): Array<THREE.MeshStandardMaterial | THREE.MeshPhongMaterial> {
    const out: Array<THREE.MeshStandardMaterial | THREE.MeshPhongMaterial> = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (Array.isArray(o.material)) {
        const cloned = o.material.map((m) =>
          m && 'emissive' in m ? (m as THREE.MeshStandardMaterial).clone() : m
        );
        o.material = cloned;
        for (const m of cloned) {
          if (m && 'emissive' in m) out.push(m as THREE.MeshStandardMaterial);
        }
      } else if (o.material && 'emissive' in o.material) {
        const cloned = (o.material as THREE.MeshStandardMaterial).clone();
        o.material = cloned;
        out.push(cloned);
      }
    });
    return out;
  }

  private _setHighlight(door: DoorRecord, on: boolean): void {
    if (door.highlighted === on) return;
    door.highlighted = on;
    for (const m of door.highlightMats) {
      // Materials are per-door clones (see _collectHighlightMats) so we can
      // mutate emissive directly without affecting other doors or scene meshes.
      const stored = (m as THREE.MeshStandardMaterial & { _origEmissive?: THREE.Color });
      if (on) {
        if (!stored._origEmissive) stored._origEmissive = m.emissive.clone();
        m.emissive.copy(HIGHLIGHT_EMISSIVE);
      } else if (stored._origEmissive) {
        m.emissive.copy(stored._origEmissive);
      }
    }
  }
}

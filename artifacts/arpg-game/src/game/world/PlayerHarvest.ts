/**
 * PlayerHarvest — RMB approach + swing on ResourceSystem nodes.
 *
 * Flow (Mine-Loader harvest pattern, Grudges ResourceSystem SSOT):
 *   1. RMB picks a harvest node (ray → nearest in front)
 *   2. Auto-walk to node (PlayerController move target)
 *   3. In range → Farm_Harvest / TreeChopping one-shot
 *   4. Damage node → loot via onLoot
 *
 * Does not invent a second harvest world — only drives ResourceSystem.
 */
import * as THREE from 'three';
import {
  getResourceSystem,
  type ResourceNode,
  type ResourceLoot,
} from './ResourceSystem';
import type { PlayerController } from '../PlayerController';
import { INTERACT_CLIP } from '../AnimationRegistry';

/** Stop + swing when this close to node centre (metres). */
export const HARVEST_REACH_M = 2.15;
/** Max click/ray distance to claim a node. */
export const HARVEST_PICK_M = 48;
/** Prefer nearest node in front within this cone if ray misses. */
export const HARVEST_FRONT_M = 22;
/** Damage per successful swing (nodes ~30–60 HP). */
export const HARVEST_DAMAGE = 18;
/** Seconds between swings (matches Farm_Harvest ~1.5s). */
export const HARVEST_SWING_S = 1.45;

export type HarvestLootFn = (itemId: string, count: number) => void;
export type HarvestPromptFn = (label: string | null) => void;

export class PlayerHarvest {
  private targetId: string | null = null;
  private swingCd = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2(0, 0);
  private readonly _fwd = new THREE.Vector3();

  onLoot: HarvestLootFn | null = null;
  onPrompt: HarvestPromptFn | null = null;
  onSwingFx: (() => void) | null = null;

  get activeTargetId(): string | null {
    return this.targetId;
  }

  isHarvesting(): boolean {
    return this.targetId !== null;
  }

  clear(player?: PlayerController | null): void {
    this.targetId = null;
    this.swingCd = 0;
    player?.clearMoveTarget();
    this.onPrompt?.(null);
  }

  /**
   * RMB entry: pick node under reticle or nearest in front, then set move target.
   * Returns true when a harvest job started (caller should suppress ADS).
   */
  tryBeginFromRmb(
    player: PlayerController,
    camera: THREE.Camera,
  ): boolean {
    if (!player.mouseLocked) return false;
    const res = getResourceSystem();
    const px = player.position.x;
    const pz = player.position.z;

    // Centre-screen ray first (pointer lock reticle)
    this.raycaster.setFromCamera(this._ndc, camera);
    this.raycaster.far = HARVEST_PICK_M;
    let node = res.pickByRay(this.raycaster, HARVEST_PICK_M);

    if (!node) {
      // Nearest alive in forward cone
      const fwd = player.getForwardDir();
      this._fwd.set(fwd.x, 0, fwd.z).normalize();
      const candidates = res.queryNear(px, pz, HARVEST_FRONT_M);
      let best: ResourceNode | null = null;
      let bestScore = -1;
      for (const n of candidates) {
        if (n.respawnAt > 0) continue;
        const dx = n.position.x - px;
        const dz = n.position.z - pz;
        const dist = Math.hypot(dx, dz) || 0.001;
        const ndx = dx / dist;
        const ndz = dz / dist;
        const dot = ndx * this._fwd.x + ndz * this._fwd.z;
        if (dot < 0.35) continue; // not in front
        const score = dot * 2 - dist * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = n;
        }
      }
      node = best;
    }

    if (!node) return false;

    this.targetId = node.trackId;
    const stopR = Math.max(0.9, (res.getDef(node.defId)?.radius ?? 1) * 0.55);
    player.setMoveTarget(node.position.x, node.position.z, stopR);
    player.faceToward(node.position.x, node.position.z);
    const def = res.getDef(node.defId);
    this.onPrompt?.(def ? `Harvest ${def.label}` : 'Harvest');
    return true;
  }

  /** E-key: harvest nearest alive in reach or start walk if slightly farther. */
  tryBeginNearest(player: PlayerController): boolean {
    const res = getResourceSystem();
    const near = res.nearestAlive(player.position.x, player.position.z, HARVEST_FRONT_M * 0.55);
    if (!near) return false;
    this.targetId = near.trackId;
    const stopR = Math.max(0.9, (res.getDef(near.defId)?.radius ?? 1) * 0.55);
    player.setMoveTarget(near.position.x, near.position.z, stopR);
    player.faceToward(near.position.x, near.position.z);
    const def = res.getDef(near.defId);
    this.onPrompt?.(def ? `Harvest ${def.label}` : 'Harvest');
    return true;
  }

  /**
   * Per-frame: keep move target, swing when in reach, grant loot when broken.
   */
  update(dt: number, player: PlayerController): void {
    if (!this.targetId) return;
    const res = getResourceSystem();
    const node = res.getNode(this.targetId);
    if (!node || node.respawnAt > 0 || !node.active) {
      this.clear(player);
      return;
    }

    // WASD cancels auto-walk but keeps target if still close enough to swing
    if (player.hasManualMoveInput()) {
      player.clearMoveTarget();
    } else {
      const stopR = Math.max(0.9, (res.getDef(node.defId)?.radius ?? 1) * 0.55);
      player.setMoveTarget(node.position.x, node.position.z, stopR);
    }

    const dx = node.position.x - player.position.x;
    const dz = node.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    const reach = HARVEST_REACH_M + (res.getDef(node.defId)?.radius ?? 1) * 0.35;

    this.swingCd = Math.max(0, this.swingCd - dt);
    if (dist > reach) return;
    if (this.swingCd > 0) return;
    if (player.isAttacking || player.isRolling) return;

    // In range — face + swing anim + damage
    player.clearMoveTarget();
    player.faceToward(node.position.x, node.position.z);
    this.playHarvestAnim(player, node.defId);
    this.swingCd = HARVEST_SWING_S;
    this.onSwingFx?.();

    const now = Date.now();
    // Delay damage slightly into the swing (0.35s into clip)
    const nodeId = node.trackId;
    window.setTimeout(() => {
      if (this.targetId !== nodeId) return;
      const loot = res.harvest(nodeId, HARVEST_DAMAGE, now);
      if (loot === null) {
        this.clear(player);
        return;
      }
      if (loot.length > 0) {
        for (const L of loot) {
          const count = L.min + Math.floor(Math.random() * Math.max(1, L.max - L.min + 1));
          this.onLoot?.(L.itemId, Math.max(1, count));
        }
        this.clear(player);
      }
      // empty loot array = chip damage, keep harvesting
    }, 350);
  }

  private playHarvestAnim(player: PlayerController, defId: string): void {
    // timber → chop; plants/herbs → farm harvest; ore → pick-style chop
    let clip = INTERACT_CLIP.plant_node;
    if (defId.includes('timber') || defId.includes('log') || defId.includes('tree')) {
      clip = INTERACT_CLIP.tree;
    } else if (
      defId.includes('ore') ||
      defId.includes('deposit') ||
      defId.includes('flint') ||
      defId.includes('stone')
    ) {
      clip = INTERACT_CLIP.tree; // TreeChopping_Loop doubles as pick/chop
    }
    player.playInteractClip(clip);
  }
}

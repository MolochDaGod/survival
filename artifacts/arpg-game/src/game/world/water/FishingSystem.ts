/**
 * FishingSystem — rod-and-line fishing minigame on top of `WaterSurface`.
 *
 * Trigger model
 *   This system has NO hotkey of its own. It's triggered through the
 *   game's existing primary-action (LMB) pipeline whenever the player's
 *   currently-equipped tool is a `fishing_rod`. GameEngine intercepts the
 *   click before `PlayerController.startAttack()` (same capture-phase
 *   pattern used by build-mode placement) and calls `tryUse()` here. If
 *   `tryUse()` returns true the click is consumed and no weapon swing
 *   plays.
 *
 * Loop
 *   1. Rod is the active tool + camera-forward raycast hits water within
 *      `castRange` → contextual prompt: "Cast Line".
 *   2. LMB → bobber placed at hit point; bobs with `getSurfaceY`.
 *   3. Random `[biteMin, biteMax]` seconds, shortened by `fishingYieldBonus`.
 *   4. Bite!  (jiggle + prompt "Reel In!").  LMB within `reactionWindow`
 *      catches; otherwise the line goes slack and no fish.
 *   5. On catch: roll fish loot, multiply qty by `1 + fishingYieldBonus`,
 *      damage rod durability by 1, add `fish_raw` to inventory.
 *
 * Integration
 *   • Prompt    — `onPrompt` callback into the engine's prompt bus.
 *   • Splash    — `onSplash` on cast and reel for `SplashFX`.
 *   • Catch     — `onCatch(itemId, qty)` for UI toast / SFX.
 *   • Perks     — `ProfessionsService.getEffect('fishingYieldBonus')` via
 *                  lazy import (no cyclic dep).
 *
 * The existing `frozen_pond` ResourceSystem nodes keep working — that's the
 * harvest-style fishing path; this is the skill-based one.
 */

import * as THREE from 'three';
import type { Inventory } from '../../Inventory';
import type { PlayerController } from '../../PlayerController';
import { LAYERS } from '../../Layers';
import type { WaterSurface } from './WaterSurface';

type FishingState =
  | { kind: 'idle' }
  | { kind: 'casting' }
  | { kind: 'waiting'; bobber: THREE.Mesh; biteAt: number }
  | { kind: 'biting';  bobber: THREE.Mesh; expiresAt: number };

interface Cfg {
  /** Max horizontal distance from player to water for the cast prompt. */
  castMaxDistance: number;
  /** Max range of the cast raycast (forward from camera). */
  castRange: number;
  /** Bite-wait window in seconds. */
  biteMin: number;
  biteMax: number;
  /** Reaction window when the bite happens. */
  reactionWindow: number;
  /** Base fish-raw quantity per successful catch. */
  baseQty: [number, number];
}

const DEFAULT_CFG: Cfg = {
  castMaxDistance: 8,
  castRange:       40,
  biteMin:         4,
  biteMax:         10,
  reactionWindow:  1.5,
  baseQty:         [1, 3],
};

let _ProfessionsService: typeof import('../../progression/ProfessionsService').ProfessionsService | null = null;
import('../../progression/ProfessionsService')
  .then((m) => { _ProfessionsService = m.ProfessionsService; })
  .catch(() => { /* fishing still works without progression */ });

export class FishingSystem {
  private scene: THREE.Scene;
  private water: WaterSurface;
  private player: PlayerController;
  private inventory: Inventory;
  private camera: THREE.Camera;
  private cfg: Cfg;
  private state: FishingState = { kind: 'idle' };
  private now = 0;
  private prompt: string | null = null;

  /** Subscriber for prompt changes — typically the GameEngine prompt bus. */
  onPrompt: ((label: string | null) => void) | null = null;
  /** Subscriber for splash events (cast + reel). */
  onSplash: ((pos: THREE.Vector3, intensity: number) => void) | null = null;
  /** Subscriber for catch events — UI toast / sound trigger. */
  onCatch: ((itemId: string, qty: number) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    water: WaterSurface,
    player: PlayerController,
    inventory: Inventory,
    camera: THREE.Camera,
    cfg: Partial<Cfg> = {},
  ) {
    this.scene     = scene;
    this.water     = water;
    this.player    = player;
    this.inventory = inventory;
    this.camera    = camera;
    this.cfg       = { ...DEFAULT_CFG, ...cfg };
  }

  /**
   * GameEngine asks "is the rod the active tool?" via this hook. The main
   * Inventory shape (Items.ts) and the SurvivalItems shape both store rods
   * differently, so we accept a caller-supplied predicate. Default falls
   * back to inventory.bag scan for the survival item id.
   *
   * NOTE: assumes the caller has wired a real "active tool" check from the
   * survival hotbar; the bag-scan is a safety net so the system isn't
   * silent during early integration.
   */
  isRodActive: () => boolean = () => {
    type SurvivalBag = { bag?: Array<{ id: string; count?: number }> };
    const bag = (this.inventory as unknown as SurvivalBag).bag;
    if (bag && bag.some((it) => it.id === 'fishing_rod' && (it.count ?? 1) > 0)) return true;
    type MainEquip = { equipped?: { mainhand?: { defId?: string } } };
    return (this.inventory as unknown as MainEquip).equipped?.mainhand?.defId === 'fishing_rod';
  };

  /**
   * Called from GameEngine's capture-phase mousedown handler. Returns true
   * when the click was consumed by fishing — the caller MUST then prevent
   * `PlayerController.startAttack()` from firing this frame.
   */
  tryUse(): boolean {
    if (!this.isRodActive()) return false;
    switch (this.state.kind) {
      case 'idle':
        if (!this.canCast()) return false;
        this.beginCast();
        return true;
      case 'biting':
        this.attemptCatch();
        return true;
      // mid-cast or waiting — swallow the click so it doesn't trigger an
      // attack swing while the rod is busy.
      case 'casting':
      case 'waiting':
        return true;
    }
  }

  update(dt: number): void {
    this.now += dt;

    // Animate bobber Y while it's in the world
    if (this.state.kind === 'waiting' || this.state.kind === 'biting') {
      const b = this.state.bobber;
      b.position.y = this.water.getSurfaceY(b.position.x, b.position.z) + 0.05;
      // Tiny jiggle while biting
      if (this.state.kind === 'biting') {
        b.position.y += Math.sin(this.now * 30) * 0.06;
      }
    }

    // State transitions
    if (this.state.kind === 'waiting' && this.now >= this.state.biteAt) {
      this.state = { kind: 'biting', bobber: this.state.bobber, expiresAt: this.now + this.cfg.reactionWindow };
      this.setPrompt('Reel In!');
    } else if (this.state.kind === 'biting' && this.now >= this.state.expiresAt) {
      // Missed the window
      this.cleanupBobber(this.state.bobber);
      this.state = { kind: 'idle' };
      this.setPrompt(null);
    }

    // Idle: only show "Cast" when the rod is the active tool and we have
    // a valid water target in front of the camera. Hotkey is *not* shown —
    // the player's existing primary-action button (LMB) is what fires.
    if (this.state.kind === 'idle') {
      this.setPrompt(this.isRodActive() && this.canCast() ? 'Cast Line' : null);
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private canCast(): boolean {
    if (!this.isRodActive()) return false;
    const p = this.player.position;
    const surfY = this.water.getSurfaceY(p.x, p.z);
    // Player must be within castMaxDistance of water level (height-based proxy
    // — works for the world-spanning sea plane; for ponds we'd want a per-body
    // proximity test, but with one global plane height alone is sufficient).
    return Math.abs(p.y - surfY - 1.65) < this.cfg.castMaxDistance;
  }

  private beginCast(): void {
    // Forward raycast from camera → water mesh
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);

    const ray = new THREE.Raycaster(origin, dir, 0, this.cfg.castRange);
    const hits = ray.intersectObject(this.water.getMesh(), false);
    if (hits.length === 0) return;

    const hit = hits[0]!.point.clone();
    const bobber = this.makeBobber(hit);
    this.scene.add(bobber);
    this.onSplash?.(hit, 1.0);

    const yieldBonus = _ProfessionsService?.getEffect('fishingYieldBonus') ?? 0;
    // More bonus = shorter wait, with a floor.
    const t = THREE.MathUtils.lerp(this.cfg.biteMin, this.cfg.biteMax, Math.random());
    const biteWait = Math.max(2, t * (1 - Math.min(0.6, yieldBonus * 0.5)));

    this.state = { kind: 'waiting', bobber, biteAt: this.now + biteWait };
    this.setPrompt('Waiting for a bite…');
  }

  private attemptCatch(): void {
    if (this.state.kind !== 'biting') return;
    const bobber = this.state.bobber;
    this.onSplash?.(bobber.position, 1.4);
    this.cleanupBobber(bobber);

    const yieldBonus = _ProfessionsService?.getEffect('fishingYieldBonus') ?? 0;
    const [lo, hi] = this.cfg.baseQty;
    const baseRoll = lo + Math.floor(Math.random() * (hi - lo + 1));
    const qty = Math.max(1, Math.round(baseRoll * (1 + yieldBonus)));

    type Adder = { addItem?: (id: string, n: number) => void };
    const inv = this.inventory as unknown as Adder;
    inv.addItem?.('fish_raw', qty);
    this.onCatch?.('fish_raw', qty);

    // Consume 1 durability from the rod (best-effort — Inventory may not
    // expose durability mutation; ignored if missing).
    type Bag = { bag?: Array<{ id: string; durability?: number }> };
    const bag = (this.inventory as unknown as Bag).bag;
    const rod = bag?.find((b) => b.id === 'fishing_rod');
    if (rod && typeof rod.durability === 'number') rod.durability = Math.max(0, rod.durability - 1);

    this.state = { kind: 'idle' };
    this.setPrompt(null);
  }

  private makeBobber(at: THREE.Vector3): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.12, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4422 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(at);
    m.position.y = this.water.getSurfaceY(at.x, at.z) + 0.05;
    m.name = 'FishingBobber';
    // Bobber is a render-only marker — VFX layer keeps it out of camera
    // occlusion + bullet/melee hit raycasts.
    m.layers.set(LAYERS.VFX);
    return m;
  }

  private cleanupBobber(b: THREE.Mesh): void {
    this.scene.remove(b);
    b.geometry.dispose();
    (b.material as THREE.Material).dispose();
  }

  private setPrompt(label: string | null): void {
    if (label === this.prompt) return;
    this.prompt = label;
    this.onPrompt?.(label);
  }

  dispose(): void {
    if (this.state.kind === 'waiting' || this.state.kind === 'biting') {
      this.cleanupBobber(this.state.bobber);
    }
    this.state = { kind: 'idle' };
    this.onPrompt?.(null);
  }
}

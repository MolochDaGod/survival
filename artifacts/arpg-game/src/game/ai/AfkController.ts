/**
 * AfkController — scripted AFK loops for engagement without constant input.
 *
 * Scripts (selectable):
 *   defend   — auto-engage nearest hostiles in radius
 *   harvest  — path toward resource nodes and swing
 *   camp     — stand near claim flag; production continues passively
 *   patrol   — wander around camp center
 *
 * Injects synthetic intents into PlayerController (move keys / attack)
 * when GameMode is 'afk'. Does not replace hireling Township AI.
 */

import * as THREE from 'three';
import type { PlayerController } from '../PlayerController';
import type { EnemyManager } from '../EnemyManager';
import { getResourceSystem } from '../world/ResourceSystem';
import type { CampClaimSystem } from '../survival/camp/CampClaimSystem';

export type AfkScriptId = 'defend' | 'harvest' | 'camp' | 'patrol';

export interface AfkControllerOpts {
  player: PlayerController;
  enemyManager: EnemyManager;
  campClaim?: CampClaimSystem | null;
}

export class AfkController {
  private player: PlayerController;
  private enemyManager: EnemyManager;
  campClaim: CampClaimSystem | null;

  script: AfkScriptId = 'defend';
  enabled = false;
  /** Metres to seek hostiles / nodes. */
  radius = 28;
  private attackCd = 0;
  private patrolAngle = 0;
  private home: THREE.Vector3 | null = null;

  /** Engagement: seconds spent AFK this session. */
  sessionSeconds = 0;
  onTickReward: ((kind: string, amount: number) => void) | null = null;

  constructor(opts: AfkControllerOpts) {
    this.player = opts.player;
    this.enemyManager = opts.enemyManager;
    this.campClaim = opts.campClaim ?? null;
  }

  start(script: AfkScriptId = 'defend'): void {
    this.script = script;
    this.enabled = true;
    this.home = this.player.position.clone();
    this.sessionSeconds = 0;
    console.info(`[AFK] Started script="${script}"`);
  }

  stop(): void {
    this.enabled = false;
    this.clearSyntheticKeys();
    console.info(`[AFK] Stopped after ${this.sessionSeconds.toFixed(0)}s`);
  }

  setScript(script: AfkScriptId): void {
    this.script = script;
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.sessionSeconds += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);

    // Soft engagement reward every 60s of AFK
    if (Math.floor(this.sessionSeconds) > 0 && Math.floor(this.sessionSeconds) % 60 === 0) {
      // debounce via fractional window
      if (this.sessionSeconds - Math.floor(this.sessionSeconds) < dt * 1.5) {
        this.onTickReward?.('afk_minute', 1);
      }
    }

    switch (this.script) {
      case 'defend':
        this.runDefend(dt);
        break;
      case 'harvest':
        this.runHarvest(dt);
        break;
      case 'camp':
        this.runCamp(dt);
        break;
      case 'patrol':
        this.runPatrol(dt);
        break;
    }
  }

  private runDefend(_dt: number): void {
    const threat = this.findNearestEnemy();
    if (!threat) {
      this.clearSyntheticKeys();
      // Face home
      return;
    }
    this.moveToward(threat, 2.2);
    if (this.attackCd <= 0 && this.distTo(threat) < 3.5) {
      this.player.startAttack();
      this.attackCd = 0.55;
    }
  }

  private runHarvest(_dt: number): void {
    try {
      const res = getResourceSystem();
      const nodes = res.queryNear(this.player.position.x, this.player.position.z, this.radius);
      const live = nodes.filter((n) => n.respawnAt === 0 && n.hp > 0);
      if (!live.length) {
        this.clearSyntheticKeys();
        return;
      }
      live.sort((a, b) => {
        const da = (a.position.x - this.player.position.x) ** 2 + (a.position.z - this.player.position.z) ** 2;
        const db = (b.position.x - this.player.position.x) ** 2 + (b.position.z - this.player.position.z) ** 2;
        return da - db;
      });
      const n = live[0];
      const target = new THREE.Vector3(n.position.x, this.player.position.y, n.position.z);
      this.moveToward(target, 1.8);
      if (this.attackCd <= 0 && this.distTo(target) < 2.8) {
        this.player.startAttack();
        this.attackCd = 0.7;
      }
    } catch {
      this.clearSyntheticKeys();
    }
  }

  private runCamp(_dt: number): void {
    const flag = this.campClaim?.getFlagPosition() ?? this.home;
    if (!flag) {
      this.clearSyntheticKeys();
      return;
    }
    const d = this.distTo(flag);
    if (d > 6) this.moveToward(flag, 1.5);
    else this.clearSyntheticKeys();
  }

  private runPatrol(dt: number): void {
    const center = this.campClaim?.getFlagPosition() ?? this.home;
    if (!center) return;
    this.patrolAngle += dt * 0.35;
    const r = 10;
    const target = new THREE.Vector3(
      center.x + Math.cos(this.patrolAngle) * r,
      this.player.position.y,
      center.z + Math.sin(this.patrolAngle) * r,
    );
    this.moveToward(target, 1.2);
  }

  private findNearestEnemy(): THREE.Vector3 | null {
    const list = this.enemyManager.enemies ?? [];
    let best: THREE.Vector3 | null = null;
    let bestD = this.radius * this.radius;
    for (const e of list) {
      if (e.state === 'dead' || e.health <= 0) continue;
      const p = e.mesh.position;
      const dx = p.x - this.player.position.x;
      const dz = p.z - this.player.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = new THREE.Vector3(p.x, this.player.position.y, p.z);
      }
    }
    return best;
  }

  private moveToward(target: THREE.Vector3, stopDist: number): void {
    const dx = target.x - this.player.position.x;
    const dz = target.z - this.player.position.z;
    const d = Math.hypot(dx, dz);
    this.clearSyntheticKeys();
    if (d < stopDist) return;

    // Face target
    this.player.yaw = Math.atan2(dx, dz);

    // Synthetic WASD relative to yaw — walk mostly forward
    this.player.keys['KeyW'] = true;
  }

  private distTo(p: THREE.Vector3): number {
    const dx = p.x - this.player.position.x;
    const dz = p.z - this.player.position.z;
    return Math.hypot(dx, dz);
  }

  private clearSyntheticKeys(): void {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) {
      this.player.keys[k] = false;
    }
  }
}

/**
 * AllyCombatSystem — recruited followers fight near the player.
 *
 * Living-NPC rule (lore): allies use the same combat math family as the player
 * (simplified). Mercenaries / sentries / captains engage hostiles; harvesters flee.
 *
 * Does not pathfind — drives FollowBrain target toward nearest threat or player.
 */

import * as THREE from 'three';
import type { EnemyManager } from '../EnemyManager';
import type { FollowBrain } from './FollowBrain';
import type { NPCRole } from '../township/TownshipSystem';
import { ALLY_COMBAT_RADIUS_M, ALLY_MELEE_DAMAGE } from '../remake/SurvivalRemakeConfig';
import { computeTownshipState, getMoraleDamageMultiplier } from '../township/TownshipSystem';
import { computeSettlementBuffs } from '../township/SettlementBuffs';

export interface AllyRecord {
  mesh: THREE.Object3D;
  followBrain?: FollowBrain;
  role?: NPCRole | string;
}

const COMBAT_ROLES = new Set([
  'sentry',
  'gate_guard',
  'gunner',
  'turret_gunner',
  'captain',
  'mercenary',
  'guard',
  // default followers with no role still fight
]);

const HARVEST_ROLES = new Set([
  'woodcutter',
  'miner',
  'farmer',
  'forager',
  'trapper',
]);

export class AllyCombatSystem {
  private attackCd = new Map<FollowBrain, number>();
  private _tmp = new THREE.Vector3();
  /** Optional AI ability mult from CampClaim buildings. */
  getAiAbilityMult: (() => number) | null = null;

  /**
   * @param allies  Recruited followers from CitySpawner
   * @param playerPos Player world position
   * @param enemyManager Live hostiles
   */
  update(
    dt: number,
    allies: AllyRecord[],
    playerPos: THREE.Vector3,
    enemyManager: EnemyManager,
  ): void {
    if (!allies.length) return;

    const state = computeTownshipState(allies.length);
    const buffs = computeSettlementBuffs(state);
    const moraleMul = getMoraleDamageMultiplier(state.morale);
    const aiMul = this.getAiAbilityMult?.() ?? 1;
    const dmg = ALLY_MELEE_DAMAGE * buffs.hireDamageMult * moraleMul * aiMul;

    const threat = this.nearestHostile(playerPos, enemyManager);
    for (const ally of allies) {
      const brain = ally.followBrain;
      if (!brain) continue;

      const role = ally.role ?? 'mercenary';
      const isHarvester = HARVEST_ROLES.has(role);
      const isFighter = !isHarvester || COMBAT_ROLES.has(role);

      const cd = (this.attackCd.get(brain) ?? 0) - dt;
      this.attackCd.set(brain, cd);

      if (isHarvester && threat) {
        // Flee toward player if threat is close
        const dThreat = ally.mesh.position.distanceTo(threat);
        if (dThreat < 12) {
          brain.setTarget(playerPos);
          brain.setMode('follow');
        }
        continue;
      }

      if (!isFighter || !threat) {
        brain.setTarget(playerPos);
        continue;
      }

      const dPlayer = ally.mesh.position.distanceTo(playerPos);
      const dThreat = ally.mesh.position.distanceTo(threat);

      // Stick with player if too far; engage if both near
      if (dPlayer > ALLY_COMBAT_RADIUS_M) {
        brain.setTarget(playerPos);
        brain.setMode('follow');
        continue;
      }

      if (dThreat < ALLY_COMBAT_RADIUS_M) {
        brain.setTarget(threat);
        if (dThreat < 2.4 && cd <= 0) {
          this.swingAt(enemyManager, ally.mesh.position, dmg);
          this.attackCd.set(brain, 0.85 + Math.random() * 0.35);
        }
      } else {
        brain.setTarget(playerPos);
      }
    }
  }

  private nearestHostile(
    playerPos: THREE.Vector3,
    em: EnemyManager,
  ): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestD = ALLY_COMBAT_RADIUS_M * ALLY_COMBAT_RADIUS_M;
    for (const e of em.enemies) {
      if (e.state === 'dead' || e.health <= 0) continue;
      const p = e.mesh.position;
      const dx = p.x - playerPos.x;
      const dz = p.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = this._tmp.set(p.x, playerPos.y, p.z).clone();
      }
    }
    return best;
  }

  private swingAt(em: EnemyManager, origin: THREE.Vector3, damage: number): void {
    // Proximity strike in all directions (allies face via FollowBrain steering)
    const fwd = new THREE.Vector3(0, 0, 1);
    em.checkPlayerAttack(origin, fwd, 2.6, damage, true, 2.5, -1);
  }
}

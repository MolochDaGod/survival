/**
 * SafeZoneSystem — production no-hostile / no-AI-camp zones for hybrid world.
 *
 * CRITICAL DESIGN (no mismatches):
 *
 * 1) **Combat spawn safety** (`isCombatSafe`) = circular zones only
 *    - Hub encampment footprint (HUB_SAFE_ZONE_RADIUS_M, default 200 m)
 *    - Claimed player camp (CAMP_CLAIM_RADIUS_M, default 80 m)
 *    - Custom circles (events, trials)
 *    Does NOT use full 6.7 km grid cells — that would ban all hostiles
 *    in the entire Convergence macro sector and break MMO combat.
 *
 * 2) **AI camp / faction seeding** (`isAiCampForbidden`) = also blocks
 *    macro sectors with `isSafeZone: true` (Convergence Nexus political
 *    capital). Used by EnemyCampSystem seed paths only.
 *
 * 3) **Map UI** still paints Convergence gold via WORLD_GRID_SECTORS.
 *
 * Single source of radii: SurvivalRemakeConfig.
 */

import * as THREE from 'three';
import { getGridSectorAt } from '../../data/worldGridSectors';
import {
  CAMP_CLAIM_RADIUS_M,
  HUB_SAFE_ZONE_RADIUS_M,
  REMAKE_OPEN_WORLD_STREAM_M,
} from '../remake/SurvivalRemakeConfig';

export type SafeZoneKind = 'hub' | 'camp' | 'custom';

export interface SafeZone {
  id: string;
  kind: SafeZoneKind;
  x: number;
  z: number;
  radius: number;
  label: string;
  active: boolean;
}

/** Re-export so spawn rings and remake config never diverge. */
export { HUB_SAFE_ZONE_RADIUS_M, CAMP_CLAIM_RADIUS_M, REMAKE_OPEN_WORLD_STREAM_M };

/** Enemy spawn ring outside hub combat safe zone (metres from hub centre). */
export const HUB_SPAWN_RING_INNER_M = HUB_SAFE_ZONE_RADIUS_M + 28;
export const HUB_SPAWN_RING_OUTER_M = HUB_SAFE_ZONE_RADIUS_M + 140;

function zoneContains(z: SafeZone, x: number, zWorld: number): boolean {
  if (!z.active) return false;
  const dx = x - z.x;
  const dz = zWorld - z.z;
  return dx * dx + dz * dz <= z.radius * z.radius;
}

export class SafeZoneSystem {
  private zones = new Map<string, SafeZone>();

  setHub(
    center: THREE.Vector3 | { x: number; z: number },
    radiusM: number = HUB_SAFE_ZONE_RADIUS_M,
  ): void {
    const x = center.x;
    const z = 'z' in center ? center.z : (center as THREE.Vector3).z;
    this.zones.set('hub', {
      id: 'hub',
      kind: 'hub',
      x,
      z,
      radius: radiusM,
      label: 'Convergence Hub',
      active: true,
    });
  }

  setCamp(
    center: THREE.Vector3 | { x: number; z: number } | null,
    radiusM: number = CAMP_CLAIM_RADIUS_M,
  ): void {
    if (!center) {
      this.zones.delete('camp');
      return;
    }
    const x = center.x;
    const z = 'z' in center ? center.z : (center as THREE.Vector3).z;
    this.zones.set('camp', {
      id: 'camp',
      kind: 'camp',
      x,
      z,
      radius: radiusM,
      label: 'Claimed Camp',
      active: true,
    });
  }

  setCustom(zone: SafeZone): void {
    this.zones.set(zone.id, { ...zone });
  }

  clear(id: string): void {
    this.zones.delete(id);
  }

  list(): SafeZone[] {
    return [...this.zones.values()].filter((z) => z.active);
  }

  getHub(): SafeZone | null {
    return this.zones.get('hub') ?? null;
  }

  getCamp(): SafeZone | null {
    return this.zones.get('camp') ?? null;
  }

  /**
   * Combat / wave / trickle / default spawn: circular zones only.
   * Prefer this for EnemyManager.
   */
  isCombatSafe(x: number, z: number): boolean {
    for (const zone of this.zones.values()) {
      if (zoneContains(zone, x, z)) return true;
    }
    return false;
  }

  /**
   * AI island / faction camp seeding: combat circles + political safe sectors.
   */
  isAiCampForbidden(x: number, z: number): boolean {
    if (this.isCombatSafe(x, z)) return true;
    const cell = getGridSectorAt(x, z);
    return !!cell?.isSafeZone;
  }

  /**
   * @deprecated Use isCombatSafe for spawns. Kept as alias so call sites
   * that meant “no hostiles here” stay correct after the sector-cell fix.
   */
  isSafe(x: number, z: number): boolean {
    return this.isCombatSafe(x, z);
  }

  /** Signed distance to nearest combat-safe circle boundary (neg = inside). */
  signedDistanceToBoundary(x: number, z: number): number {
    let best = Infinity;
    for (const zone of this.zones.values()) {
      if (!zone.active) continue;
      const d = Math.hypot(x - zone.x, z - zone.z) - zone.radius;
      if (d < best) best = d;
    }
    return best === Infinity ? 9999 : best;
  }

  describeAt(x: number, z: number): {
    combatSafe: boolean;
    aiCampForbidden: boolean;
    label: string | null;
    politicalSector: string | null;
  } {
    for (const zone of this.zones.values()) {
      if (zoneContains(zone, x, z)) {
        const cell = getGridSectorAt(x, z);
        return {
          combatSafe: true,
          aiCampForbidden: true,
          label: zone.label,
          politicalSector: cell?.isSafeZone ? cell.name : null,
        };
      }
    }
    const cell = getGridSectorAt(x, z);
    if (cell?.isSafeZone) {
      return {
        combatSafe: false,
        aiCampForbidden: true,
        label: null,
        politicalSector: cell.name,
      };
    }
    return {
      combatSafe: false,
      aiCampForbidden: false,
      label: null,
      politicalSector: null,
    };
  }
}

export const safeZones = new SafeZoneSystem();

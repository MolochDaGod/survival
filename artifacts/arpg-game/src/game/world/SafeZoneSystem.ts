/**
 * SafeZoneSystem — production no-hostile zones for the hybrid world map.
 *
 * Layers (union — if any zone contains the point, it is safe):
 *   1. Hub encampment circle (baked starter map footprint)
 *   2. Claimed player camp (CampClaimSystem radius)
 *   3. Macro sector flag (Convergence Nexus is_safe_zone on the 3×3 grid)
 *
 * Used by EnemyManager (spawn reject), EnemyCampSystem (skip AI camps),
 * and WorldMapOverlay (gold safe cells).
 */

import * as THREE from 'three';
import { getGridSectorAt } from '../../data/worldGridSectors';
import {
  CAMP_CLAIM_RADIUS_M,
  HUB_SAFE_ZONE_RADIUS_M as HUB_SAFE_FROM_CONFIG,
  REMAKE_OPEN_WORLD_STREAM_M,
} from '../remake/SurvivalRemakeConfig';

export type SafeZoneKind = 'hub' | 'camp' | 'sector' | 'custom';

export interface SafeZone {
  id: string;
  kind: SafeZoneKind;
  /** World XZ centre. */
  x: number;
  z: number;
  /** Radius in metres. */
  radius: number;
  label: string;
  /** If false, zone is registered but not enforced (debug). */
  active: boolean;
}

/**
 * Hub no-hostile radius — covers the encampment GLB + soft approach ring.
 * Slightly under OPEN_WORLD_STREAM so combat can begin as the open world
 * starts streaming (stream edge ≈ 0.85 × 250 m).
 */
export const HUB_SAFE_ZONE_RADIUS_M = HUB_SAFE_FROM_CONFIG ?? Math.min(200, REMAKE_OPEN_WORLD_STREAM_M * 0.8);

/** Min/max enemy spawn distance from hub anchor (outside safe zone). */
export const HUB_SPAWN_RING_INNER_M = HUB_SAFE_ZONE_RADIUS_M + 28;
export const HUB_SPAWN_RING_OUTER_M = HUB_SAFE_ZONE_RADIUS_M + 140;

export class SafeZoneSystem {
  private zones = new Map<string, SafeZone>();

  /** Register or replace the baked-map hub circle. */
  setHub(center: THREE.Vector3 | { x: number; z: number }, radiusM = HUB_SAFE_ZONE_RADIUS_M): void {
    this.zones.set('hub', {
      id: 'hub',
      kind: 'hub',
      x: center.x,
      z: 'z' in center ? center.z : (center as THREE.Vector3).z,
      radius: radiusM,
      label: 'Convergence Nexus',
      active: true,
    });
  }

  /** Update claimed camp circle (call when claim flag moves / restores). */
  setCamp(
    center: THREE.Vector3 | { x: number; z: number } | null,
    radiusM = CAMP_CLAIM_RADIUS_M,
  ): void {
    if (!center) {
      this.zones.delete('camp');
      return;
    }
    this.zones.set('camp', {
      id: 'camp',
      kind: 'camp',
      x: center.x,
      z: 'z' in center ? center.z : (center as THREE.Vector3).z,
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

  /**
   * True if (x,z) is inside any active circular zone OR the macro grid
   * sector is marked isSafeZone (full cell — Convergence Nexus).
   */
  isSafe(x: number, z: number): boolean {
    for (const z0 of this.zones.values()) {
      if (!z0.active) continue;
      const dx = x - z0.x;
      const dz = z - z0.z;
      if (dx * dx + dz * dz <= z0.radius * z0.radius) return true;
    }
    const cell = getGridSectorAt(x, z);
    if (cell?.isSafeZone) return true;
    return false;
  }

  /** Smallest distance to any active zone boundary (negative = inside). */
  signedDistanceToBoundary(x: number, z: number): number {
    let best = Infinity;
    for (const z0 of this.zones.values()) {
      if (!z0.active) continue;
      const d = Math.hypot(x - z0.x, z - z0.z) - z0.radius;
      if (d < best) best = d;
    }
    // Sector cells: treat as large radius from cell centre for HUD distance only
    const cell = getGridSectorAt(x, z);
    if (cell?.isSafeZone) {
      // Inside safe sector → negative distance heuristic
      best = Math.min(best, -50);
    }
    return best === Infinity ? 9999 : best;
  }

  /** HUD helper */
  describeAt(x: number, z: number): { safe: boolean; label: string | null } {
    for (const z0 of this.zones.values()) {
      if (!z0.active) continue;
      const dx = x - z0.x;
      const dz = z - z0.z;
      if (dx * dx + dz * dz <= z0.radius * z0.radius) {
        return { safe: true, label: z0.label };
      }
    }
    const cell = getGridSectorAt(x, z);
    if (cell?.isSafeZone) {
      return { safe: true, label: cell.name };
    }
    return { safe: false, label: null };
  }
}

/** Singleton used by engine systems (reset on hard scene teardown if needed). */
export const safeZones = new SafeZoneSystem();

/**
 * SectorDeployment — runtime 9-sector context manager.
 *
 * Tracks which grid cell the player occupies, applies canonical fog palette,
 * exposes VFX palette + flow beats to combat systems, and fires sector-entry
 * callbacks for UI overlays (island-3d inspired deploy funnel).
 */

import type { FogSystem } from './FogSystem';
import { getActiveSectorCanonAt, type SectorCanonEntry, type SectorVfxPalette } from '../../data/sectorCanon';

export interface SectorBeat {
  gridId: string;
  title: string;
  subtitle: string;
  objective: string;
  factionColor: string | null;
}

export class SectorDeployment {
  private fog: FogSystem | null = null;
  private active: SectorCanonEntry | null = null;
  private beat: SectorBeat | null = null;

  /** Fires when player crosses into a new grid sector. */
  onSectorEnter: ((beat: SectorBeat, canon: SectorCanonEntry) => void) | null = null;

  attachFog(fog: FogSystem) {
    this.fog = fog;
  }

  getActive(): SectorCanonEntry | null {
    return this.active;
  }

  getVfxPalette(): SectorVfxPalette {
    return this.active?.vfx ?? {
      telegraph: 0xff8844,
      meleeSlash: 0xffcc66,
      rangedTrail: 0xaaddff,
      magicCore: 0xcc66ff,
      impact: 0xffeedd,
      arcScale: 1,
    };
  }

  getBeat(): SectorBeat | null {
    return this.beat;
  }

  /** Call each frame with player world XZ. */
  update(x: number, z: number) {
    const canon = getActiveSectorCanonAt(x, z);
    if (!canon) return;
    if (this.active?.gridId === canon.gridId) return;

    this.active = canon;
    if (this.fog) {
      this.fog.setBiome(canon.terrainPalette);
    }

    const factionColor = canon.faction
      ? ({ keepers: '#d4b870', tech_scavengers: '#c87060', hollow_lords: '#7a2828', network: '#60a8c8', forgotten: '#3a8a6a' } as Record<string, string>)[canon.faction] ?? null
      : null;

    this.beat = {
      gridId: canon.gridId,
      title: canon.flow.title,
      subtitle: canon.flow.subtitle,
      objective: canon.flow.objective,
      factionColor,
    };
    this.onSectorEnter?.(this.beat, canon);
  }

  /** Hostile type pool for the current sector (falls back to generic). */
  getHostileTypes(): string[] {
    if (this.active?.hostiles.length) return this.active.hostiles;
    return this.active?.territory?.hostileTypes ?? ['wild_dog_pack'];
  }
}
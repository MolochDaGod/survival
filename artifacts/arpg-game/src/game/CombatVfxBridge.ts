import * as THREE from 'three';

/**
 * Optional bridge from GameEngine → AbilitySystem for Albion-style VFX.
 * Wired after async boot when telegraph + spline fields are ready.
 */
export interface CombatVfxBridge {
  getTelegraphColor(): number;
  getMagicColor(): number;
  getArcScale(): number;
  showCircleTelegraph(origin: THREE.Vector3, radius: number, duration: number): void;
  spawnSplineSpell(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    opts: { damage: number; speed?: number; color?: number },
  ): void;
}
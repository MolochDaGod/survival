/**
 * CapsuleBody — shared metres-space helpers for the player kinematic capsule.
 *
 * Logical player position (`PlayerController.position`) is the historical
 * "ground + PLAYER_HEIGHT" anchor (feet at y - height). Rapier kinematic
 * bodies store the capsule *centre*. Keep every conversion here so
 * teleport, spawn, mantle, and multiplayer sync never diverge.
 *
 * Capsule total height = 2 * (halfHeight + radius)  (metres).
 */

export interface CapsuleShape {
  /** Half-height of the cylindrical section (not including hemispheres). */
  halfHeight: number;
  /** Hemisphere / cylinder radius. */
  radius: number;
  /** Full character height used by logical position (usually 1.8 m). */
  playerHeight: number;
}

/** Default humanoid capsule matching PlayerController. */
export const DEFAULT_PLAYER_CAPSULE: CapsuleShape = {
  halfHeight: 0.5,
  radius: 0.4,
  playerHeight: 1.8,
};

/** Distance from capsule centre down to soles. */
export function capsuleFeetOffset(shape: CapsuleShape = DEFAULT_PLAYER_CAPSULE): number {
  return shape.halfHeight + shape.radius;
}

/** Full geometric capsule height (metres). */
export function capsuleTotalHeight(shape: CapsuleShape = DEFAULT_PLAYER_CAPSULE): number {
  return 2 * (shape.halfHeight + shape.radius);
}

/**
 * Logical position.y → capsule centre Y.
 * Logical: feet at (y - playerHeight). Centre sits feet + (halfHeight + radius).
 */
export function logicalYToCentreY(
  logicalY: number,
  shape: CapsuleShape = DEFAULT_PLAYER_CAPSULE,
): number {
  const feetY = logicalY - shape.playerHeight;
  return feetY + capsuleFeetOffset(shape);
}

/** Capsule centre Y → logical position.y. */
export function centreYToLogicalY(
  centreY: number,
  shape: CapsuleShape = DEFAULT_PLAYER_CAPSULE,
): number {
  const feetY = centreY - capsuleFeetOffset(shape);
  return feetY + shape.playerHeight;
}

/** XYZ helper for setNextKinematicTranslation / setTranslation. */
export function logicalPosToCentre(
  x: number,
  logicalY: number,
  z: number,
  shape: CapsuleShape = DEFAULT_PLAYER_CAPSULE,
): { x: number; y: number; z: number } {
  return { x, y: logicalYToCentreY(logicalY, shape), z };
}

/** Inverse of logicalPosToCentre for reading simulation back into game state. */
export function centrePosToLogical(
  x: number,
  centreY: number,
  z: number,
  shape: CapsuleShape = DEFAULT_PLAYER_CAPSULE,
): { x: number; y: number; z: number } {
  return { x, y: centreYToLogicalY(centreY, shape), z };
}

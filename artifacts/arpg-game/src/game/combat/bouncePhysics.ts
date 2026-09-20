/**
 * Shared bounce / MM knock feel for all weapons & skills (survival ARPG).
 * Mirrors @workspace/game-content bouncePhysics — keep scalars in sync.
 */

export type BounceWeaponFamily =
  | "melee_1h"
  | "melee_2h"
  | "spear"
  | "staff"
  | "shield"
  | "throwable"
  | "bullet"
  | "arrow"
  | "magic"
  | "default";

export interface BounceProfile {
  restitution: number;
  maxBounces: number;
  minBounceSpeed: number;
  energyRetain: number;
  upBias: number;
  knockImpulse: number;
  knockUp: number;
  knockRadius: number;
}

export const DEFAULT_BOUNCE: BounceProfile = {
  restitution: 0.42,
  maxBounces: 2,
  minBounceSpeed: 2.5,
  energyRetain: 0.78,
  upBias: 0.35,
  knockImpulse: 8,
  knockUp: 2.2,
  knockRadius: 2.4,
};

export const BOUNCE_BY_FAMILY: Record<BounceWeaponFamily, BounceProfile> = {
  melee_1h: { ...DEFAULT_BOUNCE, maxBounces: 0, knockImpulse: 9, knockUp: 1.8, knockRadius: 2.2 },
  melee_2h: { ...DEFAULT_BOUNCE, maxBounces: 0, knockImpulse: 12, knockUp: 3.0, knockRadius: 3.2 },
  spear: {
    restitution: 0.38,
    maxBounces: 1,
    minBounceSpeed: 3,
    energyRetain: 0.7,
    upBias: 0.2,
    knockImpulse: 10,
    knockUp: 1.5,
    knockRadius: 1.8,
  },
  staff: { ...DEFAULT_BOUNCE, maxBounces: 0, knockImpulse: 11, knockUp: 2.8, knockRadius: 3.5, restitution: 0.5 },
  shield: {
    restitution: 0.55,
    maxBounces: 3,
    minBounceSpeed: 2,
    energyRetain: 0.82,
    upBias: 0.45,
    knockImpulse: 14,
    knockUp: 2.5,
    knockRadius: 4.0,
  },
  throwable: {
    restitution: 0.5,
    maxBounces: 3,
    minBounceSpeed: 1.8,
    energyRetain: 0.8,
    upBias: 0.5,
    knockImpulse: 10,
    knockUp: 2.0,
    knockRadius: 2.0,
  },
  bullet: {
    restitution: 0.28,
    maxBounces: 1,
    minBounceSpeed: 40,
    energyRetain: 0.55,
    upBias: 0.05,
    knockImpulse: 4,
    knockUp: 0.4,
    knockRadius: 0.6,
  },
  arrow: {
    restitution: 0.15,
    maxBounces: 0,
    minBounceSpeed: 8,
    energyRetain: 0.4,
    upBias: 0.1,
    knockImpulse: 6,
    knockUp: 0.8,
    knockRadius: 1.0,
  },
  magic: {
    restitution: 0.6,
    maxBounces: 2,
    minBounceSpeed: 2,
    energyRetain: 0.85,
    upBias: 0.6,
    knockImpulse: 9,
    knockUp: 2.4,
    knockRadius: 3.0,
  },
  default: DEFAULT_BOUNCE,
};

export function bounceFamilyForWeapon(weaponType: string): BounceWeaponFamily {
  const t = weaponType.toLowerCase();
  if (t === "sword" || t === "dagger" || t === "knife" || t === "mace") return "melee_1h";
  if (t === "axe" || t === "hammer" || t === "greatsword" || t === "greataxe") return "melee_2h";
  if (t === "spear" || t === "javelin") return "spear";
  if (t === "staff" || t === "wand" || t === "tome") return "staff";
  if (t === "shield" || t === "sword_shield") return "shield";
  if (t === "throwable" || t === "grenade") return "throwable";
  if (t === "pistol" || t === "gun" || t === "rifle" || t === "smg" || t === "shotgun") return "bullet";
  if (t === "bow" || t === "crossbow") return "arrow";
  return "default";
}

export function bounceProfileForWeapon(weaponType: string): BounceProfile {
  return BOUNCE_BY_FAMILY[bounceFamilyForWeapon(weaponType)];
}

export function reflectVelocity(
  vx: number,
  vy: number,
  vz: number,
  nx: number,
  ny: number,
  nz: number,
  profile: BounceProfile,
  bounceIndex: number,
): { x: number; y: number; z: number } | null {
  if (bounceIndex >= profile.maxBounces) return null;
  const speed = Math.hypot(vx, vy, vz);
  if (speed < profile.minBounceSpeed) return null;

  const nLen = Math.hypot(nx, ny, nz) || 1;
  const nnx = nx / nLen;
  const nny = ny / nLen;
  const nnz = nz / nLen;

  const dot = vx * nnx + vy * nny + vz * nnz;
  let rx = (vx - 2 * dot * nnx) * profile.restitution * profile.energyRetain;
  let ry = (vy - 2 * dot * nny) * profile.restitution * profile.energyRetain;
  let rz = (vz - 2 * dot * nnz) * profile.restitution * profile.energyRetain;
  ry += profile.upBias * Math.min(1, speed / 10);
  return { x: rx, y: ry, z: rz };
}

/**
 * Creatures — shared combat unit defs usable without Three.js.
 *
 * Skinned hostile FBX/GLB creature rows (carnival, bestiary) stay in the
 * arpg-game client (`src/data/creatures.ts`) because they carry mesh paths
 * and animation binding. This module re-exports deployable combat entities
 * (mechs, drones, turrets) that double as hostile / allied unit defs on the
 * server and in catalog APIs.
 */
import {
  DEPLOYABLES,
  type DeployableDef,
} from './deployables.js';

export {
  DEPLOYABLES,
  DEPLOYABLE_KINDS,
  ENTITY_ROLES,
  ROLE_AI_GOALS,
  ROLE_COLORS,
  getDeployable,
  getDeployablesByKind,
  getDeployablesByUnlock,
  getUnlockedDeployables,
  scaleDeployableStats,
  type DeployableDef,
  type DeployableKind,
  type DeployableAnimSet,
  type EntityRole,
} from './deployables.js';

/** Deployables that can act as hostile combat units. */
export function getCombatDeployables(): DeployableDef[] {
  return DEPLOYABLES.filter(
    (d) =>
      d.kind === 'mech' ||
      d.kind === 'turret' ||
      d.kind === 'combat_drone' ||
      d.allowedRoles.includes('enemy'),
  );
}

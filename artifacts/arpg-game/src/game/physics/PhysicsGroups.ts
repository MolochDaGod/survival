/**
 * PhysicsGroups — Rapier `InteractionGroups` constants used by every
 * collider and raycast in the game.
 *
 * Rapier packs a single u32 into "membership" (upper 16 bits) and
 * "filter" (lower 16 bits). Two colliders A and B contact only when
 * `A.membership & B.filter` AND `B.membership & A.filter` are both
 * non-zero. The same packing is accepted by ray/shape queries as their
 * `filterGroups` argument — there the ray itself is treated as a
 * collider with the supplied membership/filter.
 *
 * Using named groups (rather than every collider sharing the default
 * `0xFFFFFFFF`) lets us:
 *   - Make the LedgeProbe raycasts skip dynamic enemy bodies cleanly,
 *     without relying on per-call exclusion lists for every entity.
 *   - Add future filtered queries (camera occlusion, AI line-of-sight,
 *     bullet sweeps) by composing memberships instead of rewriting
 *     callers.
 *   - Keep contact pairs the same as before by always including
 *     the targets each kind of collider used to hit implicitly, so
 *     introducing this layer is a zero-behaviour-change refactor.
 */

/** Single-bit membership flags. Up to 16 layers (bits 0..15). */
export const GROUP = {
  /** The player's kinematic capsule. */
  PLAYER:  1 << 0,
  /** Walkable / world-shell static geometry — terrain heightfields,
   *  arena disk, baked map trimeshes. */
  TERRAIN: 1 << 1,
  /** Static scenery colliders — buildings, towers, rocks, tree trunks. */
  PROP:    1 << 2,
  /** Enemy bodies (future — currently enemies are gameplay-only and
   *  not in the Rapier world, but reserving the bit keeps masks stable
   *  when they migrate over). */
  ENEMY:   1 << 3,
  /** Synthetic "membership" used by query rays so trimesh/heightfield
   *  filters that explicitly accept PROBE can distinguish them from
   *  ordinary collider-vs-collider contacts. */
  PROBE:   1 << 4,
} as const;

/** Membership covering anything a foot/character query should land on. */
export const SOLID_WORLD = GROUP.TERRAIN | GROUP.PROP;

/**
 * Pack a Rapier `InteractionGroups` u32 from a membership mask and a
 * filter mask. `membership` is what the collider *is*; `filter` is what
 * it *interacts with*.
 */
export function makeGroups(membership: number, filter: number): number {
  // Mask to 16 bits to make accidental high-bit usage a no-op rather
  // than a silent collision with the membership half of the word.
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** Player capsule: belongs to PLAYER, contacts world+props+enemies. */
export const GROUPS_PLAYER = makeGroups(
  GROUP.PLAYER,
  SOLID_WORLD | GROUP.ENEMY,
);

/** Terrain: belongs to TERRAIN, contacts player+enemies, and accepts
 *  probe rays so ground/ledge queries land on it. */
export const GROUPS_TERRAIN = makeGroups(
  GROUP.TERRAIN,
  GROUP.PLAYER | GROUP.ENEMY | GROUP.PROBE,
);

/** Props: same intent as terrain — solid to characters, visible to
 *  probes (so a wall in front of the player registers as a ledge). */
export const GROUPS_PROP = makeGroups(
  GROUP.PROP,
  GROUP.PLAYER | GROUP.ENEMY | GROUP.PROBE,
);

/** Filter for "find ground / find ledge" raycasts — only hit static
 *  world geometry, never the player capsule or other probe traffic. */
export const GROUPS_PROBE_WORLD = makeGroups(GROUP.PROBE, SOLID_WORLD);

/**
 * factions — re-export of shared SSOT from `@workspace/game-systems`.
 *
 * Client systems (sectors, WorldMap, ReputationService) import from here
 * so paths stay stable; definitions live in game-systems for API parity.
 */
export {
  FACTIONS,
  FACTION_IDS,
  REP_TIERS,
  getRepTier,
  newReputationVector,
  type FactionId,
  type FactionDef,
  type RepTier,
  type RepTierDef,
  type ReputationVector,
} from '@workspace/game-systems/world/factions';

/**
 * Grudges — cross-faction player guilds.
 *
 * Grudges are NOT a sixth faction. They are player-formed guilds that may
 * recruit from any of the five canon factions (Keepers, Tech-Scavengers,
 * Hollow Lords, Network, Forgotten). A character keeps their birth-faction
 * standing while joining a grudge; grudge-vs-grudge conflict layers on top
 * of faction-vs-faction conflict.
 *
 * Server is the source of truth for grudge membership, claims, and treaty
 * state. This module defines the wire-shape types only; persistence sits
 * in the api-server's Drizzle schema.
 */
import type { FactionId } from './factions.js';

/** Grudge tier — drives member cap, claim cap, and storage quotas. */
export type GrudgeTier = 'crew' | 'warband' | 'house' | 'banner' | 'dynasty';

/** Per-tier limits. Authoritative server-side; client uses for UI gating. */
export const GRUDGE_TIER_LIMITS: Record<GrudgeTier, {
  /** Max members including the founder. */
  memberCap: number;
  /** Max simultaneous territory claims. */
  claimCap: number;
  /** Shared storage slots. */
  storageSlots: number;
  /** Prestige (member XP sum) required to advance to this tier. */
  prestigeRequired: number;
}> = {
  crew:    { memberCap: 5,   claimCap: 0, storageSlots: 50,  prestigeRequired: 0 },
  warband: { memberCap: 15,  claimCap: 1, storageSlots: 200, prestigeRequired: 2_500 },
  house:   { memberCap: 40,  claimCap: 3, storageSlots: 500, prestigeRequired: 12_000 },
  banner:  { memberCap: 100, claimCap: 6, storageSlots: 1500, prestigeRequired: 50_000 },
  dynasty: { memberCap: 250, claimCap: 12, storageSlots: 4000, prestigeRequired: 200_000 },
};

/** Member role inside a grudge. Drives bank/claim/recruit permissions. */
export type GrudgeRole = 'founder' | 'officer' | 'veteran' | 'member' | 'recruit';

/** Diplomatic stance between two grudges. */
export type GrudgeStance = 'allied' | 'truce' | 'neutral' | 'feud' | 'blood_feud';

export interface GrudgeMember {
  /** Player id — the api-server's accounts.id. */
  playerId: string;
  /** Display name at time of join (refreshed on logon). */
  displayName: string;
  /** Birth faction the player belongs to (a grudge is cross-faction). */
  factionId: FactionId;
  role: GrudgeRole;
  /** Epoch ms when the member joined. */
  joinedAt: number;
  /** Lifetime prestige contribution from this member. */
  prestige: number;
}

export interface GrudgeClaim {
  /** Sector id this claim is anchored in (see SECTOR_GRID.id). */
  sectorId: string;
  /** Claim centre in world coords. */
  center: { x: number; z: number };
  /** Claim radius in metres. Server clamps against tier limits. */
  radius: number;
  /** Epoch ms when the claim was placed. */
  placedAt: number;
  /** Epoch ms after which the claim expires unless renewed. */
  expiresAt: number;
}

export interface Grudge {
  /** UUID v4 — server-assigned. */
  id: string;
  /** Display name. Unique per shard. */
  name: string;
  /** 2-5 char tag shown in nameplates and on the world map. */
  tag: string;
  /** Founder's player id. Cannot be transferred without server confirm. */
  founderId: string;
  tier: GrudgeTier;
  /** Lifetime prestige — drives tier eligibility. */
  prestige: number;
  members: GrudgeMember[];
  claims: GrudgeClaim[];
  /** Diplomatic stances keyed by other grudge id. */
  stances: Record<string, GrudgeStance>;
  /** Sector-tinted accent colour rendered on banners and the M-map. */
  bannerColor: string;
  /** Optional motto, shown in the codex and on guildhall plaques. */
  motto?: string;
  createdAt: number;
}

/** Whether a role can perform a given action. Server enforces; UI mirrors. */
export const GRUDGE_PERMISSIONS: Record<GrudgeRole, {
  recruit: boolean;
  promote: boolean;
  claim: boolean;
  bank: boolean;
  diplomacy: boolean;
  disband: boolean;
}> = {
  founder: { recruit: true, promote: true, claim: true, bank: true, diplomacy: true, disband: true },
  officer: { recruit: true, promote: true, claim: true, bank: true, diplomacy: true, disband: false },
  veteran: { recruit: true, promote: false, claim: false, bank: true, diplomacy: false, disband: false },
  member:  { recruit: false, promote: false, claim: false, bank: true, diplomacy: false, disband: false },
  recruit: { recruit: false, promote: false, claim: false, bank: false, diplomacy: false, disband: false },
};

/** Compute current tier from prestige. Server is authoritative. */
export function grudgeTierForPrestige(prestige: number): GrudgeTier {
  if (prestige >= GRUDGE_TIER_LIMITS.dynasty.prestigeRequired) return 'dynasty';
  if (prestige >= GRUDGE_TIER_LIMITS.banner.prestigeRequired) return 'banner';
  if (prestige >= GRUDGE_TIER_LIMITS.house.prestigeRequired) return 'house';
  if (prestige >= GRUDGE_TIER_LIMITS.warband.prestigeRequired) return 'warband';
  return 'crew';
}

/** Hostility check between two grudges. Used by friendly-fire and AI target filters. */
export function isHostileGrudge(
  a: Grudge | null | undefined,
  b: Grudge | null | undefined,
): boolean {
  if (!a || !b || a.id === b.id) return false;
  const stance = a.stances[b.id] ?? b.stances[a.id] ?? 'neutral';
  return stance === 'feud' || stance === 'blood_feud';
}

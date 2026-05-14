/**
 * Stats catalog — single source of truth for the Grudges character system.
 *
 * Mirrors the canonical client-side definition in
 * `artifacts/arpg-game/src/game/CharacterConfig.ts` (STAT_META + GrudgeStats).
 *
 *   - 8 primary stats: BIO / NEU / KIN / QNT / SYN / CHR / ENT / GRA
 *   - Effect keys (88+): the modifier vocabulary used by perks across
 *     `progression/Professions.ts` and `progression/PerkSystem.ts`.
 *     These are NOT a fantasy-style "derived stat" list — they are the
 *     additive/multiplicative passive keys the runtime applies to player
 *     and world systems (combat, survival, harvesting, economy, etc.).
 *   - Diminishing returns: full points 1–25, half 26–50, quarter 51+.
 *
 * Served read-only over /api/stats/* so the game client, admin panel, and
 * tooling all share one definition. Any balance change should land here
 * first, then be mirrored in CharacterConfig.STAT_META if metadata moves.
 *
 * NOT included (this is a sci-fi survival ARPG, not a fantasy ARPG):
 *   - mana / spellblock / magicDefense
 *   - block / crit / dodge as fixed derived stats
 *   - √-defense damage formula
 *   These were inherited from a generic ARPG template and have been removed.
 */

// ─── Primary stats — 8 sci-fi attributes ──────────────────────────────────

export type StatKey = "bio" | "neu" | "kin" | "qnt" | "syn" | "chr" | "ent" | "gra";

export interface PrimaryStat {
  key: StatKey;
  abbr: string;
  label: string;
  color: string;
  icon: string;
  description: string;
  /** Short archetype hint for build planning UI. */
  archetype: string;
  /** Effect keys this stat tends to bias when allocated heavily. Used by the
   *  client to colour-code perks and to surface "spend points here to boost X"
   *  recommendations. NOT a hard balance contract — perks define their own
   *  numeric effects; this is just the affinity grouping. */
  affinityEffects: EffectKey[];
}

// ─── Effect keys — the full passive vocabulary ────────────────────────────

/**
 * Every passive/effect key the runtime understands. Sourced 1:1 from the
 * perk and profession data. To add a new effect, add the key here AND wire
 * a consumer (e.g. `Inventory`, `LootManager`, `EnemyManager`, survival
 * regen tick, harvest yield computation).
 *
 * Keep this union flat — perks reference these as plain string keys via
 * `passive: { [key]: number }`, so adding a key requires a string match
 * but no schema migration.
 */
export type EffectKey =
  // ── BIO — biology, regen, food, environmental resist ──
  | "maxHpBonus"
  | "oocHealRate"
  | "allyAuraHealRate"
  | "foodBuffDurationBonus"
  | "foodEffectBonus"
  | "cookingYieldBonus"
  | "harvestYieldBonus"
  | "harvestRareBonus"
  | "harvestSpeedBonus"
  | "skinningYieldBonus"
  | "fishingYieldBonus"
  | "baitDurationBonus"
  | "treeRegrowSpeedBonus"
  | "coldResistBonus"
  | "heatResistBonus"
  | "radResistBonus"
  | "weaponPoisonOnHit"
  | "poisonArmourPenetration"
  | "potionPotencyBonus"
  | "distillYieldBonus"
  | "biomeDamageBonus"
  // ── NEU — focus, perception, gadgets, stealth, accuracy ──
  | "gadgetCooldownReduction"
  | "gadgetCritBonus"
  | "gadgetCritChance"
  | "gadgetEffectBonus"
  | "trapRareDropBonus"
  | "trapTriggerBonus"
  | "passiveTrapXpRate"
  | "stealthBonus"
  | "lockpickSpeedBonus"
  | "pickpocketYieldBonus"
  | "backstabDamageBonus"
  | "nightHerbVisionRange"
  | "fogRevealRange"
  | "spyglassZoomBonus"
  | "crystalDetectRange"
  | "minimapEnemyRange"
  | "permafrostMinimapRange"
  | "npcAlertRange"
  | "rifleAccuracyBonus"
  | "rifleHeadshotBonus"
  // ── KIN — combat damage, mobility, stamina ──
  | "bladeAttackSpeedBonus"
  | "bladeCritDamageBonus"
  | "bladeUseDamageBonus"
  | "bladesmithDamageBonus"
  | "hammerUseDamageBonus"
  | "gunsmithDamageBonus"
  | "pistolCritBonus"
  | "pistolDamageBonus"
  | "pistolReloadSpeedBonus"
  | "rifleDamageBonus"
  | "explosionDamageBonus"
  | "explosionRadiusBonus"
  | "staggerChanceBonus"
  | "parryStaminaBonus"
  | "sprintCostReduction"
  | "staminaRegenBonus"
  | "oocSpeedBonus"
  | "shieldBreakBonus"
  | "damageReductionBonus"
  | "armourDefenseBonus"
  | "bloodTrailDuration"
  // ── QNT — anomalies, rare-loot, yield doublers ──
  | "anomalyShardBonus"
  | "crystalYieldBonus"
  | "derelictDoubleDropChance"
  | "veinDoubleYieldChance"
  | "ironYieldBonus"
  | "copperYieldBonus"
  | "salvageYieldBonus"
  | "smeltYieldBonus"
  | "permafrostYieldBonus"
  // ── SYN — turrets, building, hires, economy, faction ──
  | "turretDamageBonus"
  | "buildingHpBonus"
  | "wallHpBonus"
  | "buildCostReduction"
  | "craftCostReduction"
  | "craftQualityBonus"
  | "recruitCapBonus"
  | "followerSlots"
  | "campMoraleBonus"
  | "bountyContractSlots"
  | "bountyGoldBonus"
  | "bountyXpBonus"
  | "bountyMissionXpBonus"
  | "bountyRareContractBonus"
  | "sellGoldBonus"
  | "passiveGoldRate"
  | "reputationGainBonus";
// ── CHR / ENT / GRA — reserved for future content (no perks reference these yet)

export interface EffectMeta {
  key: EffectKey;
  /** Which primary stat the effect is grouped under in the UI. */
  domain: StatKey;
  /** Short human label for tooltips. */
  label: string;
  /** Whether the value is multiplicative (e.g. 0.10 = +10 %) or flat. */
  kind: "pct" | "flat";
}

// ─── Primary-stat catalog ─────────────────────────────────────────────────

export const PRIMARY_STATS: PrimaryStat[] = [
  {
    key: "bio",
    abbr: "BIO",
    label: "Biomass",
    color: "#4caf50",
    icon: "/icons/stats/bio.png",
    description:
      "Max health, natural healing, toxin resistance, implant compatibility, food and harvest yields.",
    archetype: "Survivor / Forager / Field Medic",
    affinityEffects: [
      "maxHpBonus", "oocHealRate", "allyAuraHealRate",
      "foodBuffDurationBonus", "foodEffectBonus", "cookingYieldBonus",
      "harvestYieldBonus", "harvestRareBonus", "harvestSpeedBonus",
      "skinningYieldBonus", "fishingYieldBonus", "baitDurationBonus",
      "treeRegrowSpeedBonus",
      "coldResistBonus", "heatResistBonus", "radResistBonus",
      "weaponPoisonOnHit", "poisonArmourPenetration",
      "potionPotencyBonus", "distillYieldBonus", "biomeDamageBonus",
    ],
  },
  {
    key: "neu",
    abbr: "NEU",
    label: "Neural Integrity",
    color: "#00bcd4",
    icon: "/icons/stats/neu.png",
    description:
      "Sanity, psionic defense, AI co-processor cap, neural-hack resistance — drives gadgets, stealth, and perception.",
    archetype: "Hacker / Scout / Sniper",
    affinityEffects: [
      "gadgetCooldownReduction", "gadgetCritBonus", "gadgetCritChance", "gadgetEffectBonus",
      "trapRareDropBonus", "trapTriggerBonus", "passiveTrapXpRate",
      "stealthBonus", "lockpickSpeedBonus", "pickpocketYieldBonus", "backstabDamageBonus",
      "nightHerbVisionRange", "fogRevealRange", "spyglassZoomBonus",
      "crystalDetectRange", "minimapEnemyRange", "permafrostMinimapRange", "npcAlertRange",
      "rifleAccuracyBonus", "rifleHeadshotBonus",
    ],
  },
  {
    key: "kin",
    abbr: "KIN",
    label: "Kinetic Efficiency",
    color: "#ff9800",
    icon: "/icons/stats/kin.png",
    description:
      "Movement speed, melee damage, stamina regen, zero-G combat — the warrior stat.",
    archetype: "Bladesman / Gunfighter / Sprinter",
    affinityEffects: [
      "bladeAttackSpeedBonus", "bladeCritDamageBonus", "bladeUseDamageBonus", "bladesmithDamageBonus",
      "hammerUseDamageBonus",
      "gunsmithDamageBonus",
      "pistolCritBonus", "pistolDamageBonus", "pistolReloadSpeedBonus",
      "rifleDamageBonus",
      "explosionDamageBonus", "explosionRadiusBonus",
      "staggerChanceBonus", "parryStaminaBonus", "sprintCostReduction", "staminaRegenBonus",
      "oocSpeedBonus", "shieldBreakBonus",
      "damageReductionBonus", "armourDefenseBonus", "bloodTrailDuration",
    ],
  },
  {
    key: "qnt",
    abbr: "QNT",
    label: "Quantum Aptitude",
    color: "#9c27b0",
    icon: "/icons/stats/qnt.png",
    description:
      "Tech comprehension, quantum-device operation, probability manipulation — biases rare-drop chance.",
    archetype: "Salvager / Anomaly Hunter / Probability Engineer",
    affinityEffects: [
      "anomalyShardBonus", "crystalYieldBonus",
      "derelictDoubleDropChance", "veinDoubleYieldChance",
      "ironYieldBonus", "copperYieldBonus",
      "salvageYieldBonus", "smeltYieldBonus", "permafrostYieldBonus",
    ],
  },
  {
    key: "syn",
    abbr: "SYN",
    label: "Synthetic Affinity",
    color: "#2196f3",
    icon: "/icons/stats/syn.png",
    description:
      "Hacking skill, drone control, AI negotiation, swarm intelligence — drives turrets, building, and hires.",
    archetype: "Architect / Drone Master / Quartermaster",
    affinityEffects: [
      "turretDamageBonus",
      "buildingHpBonus", "wallHpBonus", "buildCostReduction",
      "craftCostReduction", "craftQualityBonus",
      "recruitCapBonus", "followerSlots", "campMoraleBonus",
      "bountyContractSlots", "bountyGoldBonus", "bountyXpBonus",
      "bountyMissionXpBonus", "bountyRareContractBonus",
      "sellGoldBonus", "passiveGoldRate", "reputationGainBonus",
    ],
  },
  {
    key: "chr",
    abbr: "CHR",
    label: "Chronal Stability",
    color: "#ffeb3b",
    icon: "/icons/stats/chr.png",
    description:
      "Temporal anomaly resistance, time perception, causality protection — content reserved for chronal perks.",
    archetype: "Chrono-Operative / Echo Reader",
    affinityEffects: [],
  },
  {
    key: "ent",
    abbr: "ENT",
    label: "Entropic Resistance",
    color: "#f44336",
    icon: "/icons/stats/ent.png",
    description:
      "Equipment durability, resource preservation, decay resistance — content reserved for entropy perks.",
    archetype: "Reclaimer / Preserver",
    affinityEffects: [],
  },
  {
    key: "gra",
    abbr: "GRA",
    label: "Gravitic Harmony",
    color: "#009688",
    icon: "/icons/stats/gra.png",
    description:
      "Fall damage reduction, zero-G adaptation, spatial force manipulation — content reserved for gravitic perks.",
    archetype: "Orbital Specialist",
    affinityEffects: [],
  },
];

// ─── Effect-key catalog (flat list) ───────────────────────────────────────

export const EFFECTS: EffectMeta[] = (() => {
  const out: EffectMeta[] = [];
  const pctSuffix = /(Bonus|Rate|Chance|Reduction|Duration|Range|Speed)$/;
  for (const stat of PRIMARY_STATS) {
    for (const key of stat.affinityEffects) {
      out.push({
        key,
        domain: stat.key,
        label: humanize(key),
        kind: pctSuffix.test(key) ? "pct" : "flat",
      });
    }
  }
  return out;
})();

function humanize(camel: string): string {
  return camel
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ─── Diminishing returns ──────────────────────────────────────────────────

export const DIMINISHING_RETURNS = {
  fullCap: 25,
  halfCap: 50,
  halfMultiplier: 0.5,
  quarterMultiplier: 0.25,
} as const;

/** Effective points after diminishing-returns scaling. */
export function effectivePoints(actual: number): number {
  const { fullCap, halfCap, halfMultiplier, quarterMultiplier } = DIMINISHING_RETURNS;
  if (actual <= fullCap) return actual;
  if (actual <= halfCap) return fullCap + (actual - fullCap) * halfMultiplier;
  return (
    fullCap
    + (halfCap - fullCap) * halfMultiplier
    + (actual - halfCap) * quarterMultiplier
  );
}

// ─── Snapshot ─────────────────────────────────────────────────────────────

export function buildCatalogSnapshot() {
  return {
    version: 2,
    system: "grudges-scifi",
    primaryStats: PRIMARY_STATS,
    effects: EFFECTS,
    diminishingReturns: DIMINISHING_RETURNS,
  } as const;
}

/**
 * @workspace/game-systems — Diablo-style Affix Loot Generation
 *
 * Every dropped item gets randomized affixes based on its tier (T1–T8).
 * Tier determines:
 *   - Number of affixes (1 at T1, up to 6 at T6+)
 *   - Value range multiplier (higher tier = bigger rolls)
 *   - Access to rarer affix pools (T5+ unlocks unique affixes)
 *
 * The same base item (e.g. "Iron Helm") can drop with completely different
 * stats each time. This makes every loot drop worth checking.
 *
 * Design principles:
 *   - Fun, not game-breaking: affixes are bonuses, not multipliers
 *   - Tier 6 with 6 affixes feels powerful but doesn't trivialize content
 *   - Rolls are transparent: tooltip shows each affix and its value
 *   - Scriptable: add new affixes by appending to AFFIX_POOL
 */

// ── Affix Definitions ───────────────────────────────────────────────────────

export type AffixSlotType = 'prefix' | 'suffix';

export type AffixSlotRestriction = 'any' | 'weapon' | 'armor';

export interface AffixDef {
  id: string;
  name: string;
  type: AffixSlotType;
  /** Which stat this modifies (key into ItemStats or combat stats). */
  stat: string;
  /** Display format: 'flat' = "+12", 'pct' = "+12%" */
  format: 'flat' | 'pct';
  /** Min/max roll range at T1. Scaled by tier multiplier. */
  minBase: number;
  maxBase: number;
  /** Minimum tier required to roll this affix. */
  minTier: number;
  /** Relative weight in the roll pool (higher = more common). */
  weight: number;
  /** Human-readable description template. {value} is replaced with the roll. */
  desc: string;
  /**
   * Slot restriction for this affix:
   *   'weapon' = only rolls on mainhand/offhand
   *   'armor'  = only rolls on helm/chest/legs/boots/cape
   *   'any'    = rolls on any slot (default if omitted)
   */
  slots?: AffixSlotRestriction;
}

/**
 * The master affix pool. Add new affixes here — the roller picks from this
 * list automatically. Weight controls how common each affix is.
 */
export const AFFIX_POOL: AffixDef[] = [
  // ── PREFIXES: BASE COMBAT (weapon-only) ─────────────────────────────
  { id: 'sharp',       name: 'Sharp',        type: 'prefix', stat: 'damage',         format: 'flat', minBase: 2,  maxBase: 8,   minTier: 1, weight: 20, desc: '+{value} Damage', slots: 'weapon' },
  { id: 'fierce',      name: 'Fierce',       type: 'prefix', stat: 'damage',         format: 'flat', minBase: 6,  maxBase: 18,  minTier: 3, weight: 12, desc: '+{value} Damage', slots: 'weapon' },
  { id: 'quick',       name: 'Quick',        type: 'prefix', stat: 'attackSpeed',    format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 1, weight: 15, desc: '+{value}% Attack Speed', slots: 'weapon' },
  { id: 'precise',     name: 'Precise',      type: 'prefix', stat: 'critChance',     format: 'pct',  minBase: 1,  maxBase: 5,   minTier: 2, weight: 12, desc: '+{value}% Critical Chance' },
  { id: 'brutal',      name: 'Brutal',       type: 'prefix', stat: 'critDamage',     format: 'pct',  minBase: 5,  maxBase: 20,  minTier: 3, weight: 10, desc: '+{value}% Critical Damage', slots: 'weapon' },
  { id: 'piercing',    name: 'Piercing',     type: 'prefix', stat: 'armorPen',       format: 'pct',  minBase: 2,  maxBase: 10,  minTier: 3, weight: 8,  desc: '+{value}% Armor Penetration', slots: 'weapon' },
  { id: 'staggering',  name: 'Staggering',   type: 'prefix', stat: 'stagger',        format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 3, weight: 8,  desc: '+{value}% Stagger Chance', slots: 'weapon' },

  // ── PREFIXES: ARMOR-EXCLUSIVE ──────────────────────────────────────────
  { id: 'reinforced',  name: 'Reinforced',   type: 'prefix', stat: 'armor',          format: 'flat', minBase: 4,  maxBase: 16,  minTier: 1, weight: 20, desc: '+{value} Armor', slots: 'armor' },
  { id: 'plated',      name: 'Plated',       type: 'prefix', stat: 'armor',          format: 'flat', minBase: 10, maxBase: 30,  minTier: 3, weight: 12, desc: '+{value} Armor', slots: 'armor' },
  { id: 'padded',      name: 'Padded',       type: 'prefix', stat: 'health',         format: 'flat', minBase: 8,  maxBase: 30,  minTier: 1, weight: 18, desc: '+{value} Health', slots: 'armor' },
  { id: 'warded_arm',  name: 'Warded',       type: 'prefix', stat: 'magicResist',    format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 2, weight: 10, desc: '+{value}% Magic Resistance', slots: 'armor' },
  { id: 'tempered',    name: 'Tempered',     type: 'prefix', stat: 'tenacity',       format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 3, weight: 8,  desc: '+{value}% Crowd Control Reduction', slots: 'armor' },
  { id: 'fortified',   name: 'Fortified',    type: 'prefix', stat: 'blockChance',    format: 'pct',  minBase: 2,  maxBase: 6,   minTier: 2, weight: 10, desc: '+{value}% Block Chance', slots: 'armor' },
  { id: 'nimble',      name: 'Nimble',       type: 'prefix', stat: 'evasion',        format: 'pct',  minBase: 2,  maxBase: 6,   minTier: 2, weight: 10, desc: '+{value}% Evasion', slots: 'armor' },
  { id: 'insulating',  name: 'Insulating',   type: 'prefix', stat: 'temperature',    format: 'flat', minBase: 3,  maxBase: 10,  minTier: 1, weight: 8,  desc: '+{value} Cold Resistance', slots: 'armor' },
  { id: 'vented',      name: 'Vented',       type: 'prefix', stat: 'heatResist',     format: 'flat', minBase: 3,  maxBase: 10,  minTier: 1, weight: 8,  desc: '+{value} Heat Resistance', slots: 'armor' },

  // ── PREFIXES: DAMAGE TYPES (weapon-only) ──────────────────────────────
  { id: 'blazing',     name: 'Blazing',      type: 'prefix', stat: 'fireDamage',     format: 'flat', minBase: 3,  maxBase: 12,  minTier: 2, weight: 8,  desc: '+{value} Fire Damage', slots: 'weapon' },
  { id: 'frozen',      name: 'Frozen',       type: 'prefix', stat: 'iceDamage',      format: 'flat', minBase: 3,  maxBase: 12,  minTier: 2, weight: 8,  desc: '+{value} Ice Damage', slots: 'weapon' },
  { id: 'shocking',    name: 'Shocking',     type: 'prefix', stat: 'lightningDamage',format: 'flat', minBase: 3,  maxBase: 12,  minTier: 2, weight: 8,  desc: '+{value} Lightning Damage', slots: 'weapon' },
  { id: 'arcane',      name: 'Arcane',       type: 'prefix', stat: 'arcaneDamage',   format: 'flat', minBase: 3,  maxBase: 12,  minTier: 3, weight: 7,  desc: '+{value} Arcane Damage', slots: 'weapon' },
  { id: 'holy',        name: 'Blessed',      type: 'prefix', stat: 'holyDamage',     format: 'flat', minBase: 3,  maxBase: 12,  minTier: 3, weight: 6,  desc: '+{value} Holy Damage', slots: 'weapon' },
  { id: 'toxic',       name: 'Venomous',     type: 'prefix', stat: 'natureDamage',   format: 'flat', minBase: 3,  maxBase: 10,  minTier: 2, weight: 7,  desc: '+{value} Nature/Poison Damage', slots: 'weapon' },

  // ── PREFIXES: PROC EFFECTS (weapon-only) ──────────────────────────────
  { id: 'vampiric',    name: 'Vampiric',     type: 'prefix', stat: 'drainHealth',    format: 'pct',  minBase: 1,  maxBase: 4,   minTier: 4, weight: 6,  desc: '+{value}% Life Steal', slots: 'weapon' },
  { id: 'igniting',    name: 'Igniting',     type: 'prefix', stat: 'procBurn',       format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 3, weight: 6,  desc: '{value}% chance to Burn on hit (3s)', slots: 'weapon' },
  { id: 'freezing',    name: 'Chilling',     type: 'prefix', stat: 'procFreeze',     format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 3, weight: 5,  desc: '{value}% chance to Slow on hit (2s)', slots: 'weapon' },
  { id: 'shocking_p',  name: 'Arcing',       type: 'prefix', stat: 'procChainLightning', format: 'pct', minBase: 2, maxBase: 6, minTier: 4, weight: 4,  desc: '{value}% chance to Chain Lightning (2 targets)', slots: 'weapon' },
  { id: 'bleeding',    name: 'Serrated',     type: 'prefix', stat: 'procBleed',      format: 'pct',  minBase: 4,  maxBase: 15,  minTier: 2, weight: 8,  desc: '{value}% chance to Bleed on hit (4s)', slots: 'weapon' },
  { id: 'poisoning',   name: 'Toxic',        type: 'prefix', stat: 'procPoison',     format: 'pct',  minBase: 3,  maxBase: 10,  minTier: 3, weight: 6,  desc: '{value}% chance to Poison on hit (5s)', slots: 'weapon' },
  { id: 'exploding',   name: 'Volatile',     type: 'prefix', stat: 'procExplode',    format: 'pct',  minBase: 1,  maxBase: 4,   minTier: 5, weight: 3,  desc: '{value}% chance to Explode on kill (AoE)', slots: 'weapon' },

  // ── PREFIXES: NEXUS ATTRIBUTE BONUSES (always +1, no tier scaling) ────
  { id: 'bio_boost',   name: 'Vital',        type: 'prefix', stat: 'bio',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 5,  desc: '+1 Biomass (BIO)' },
  { id: 'neu_boost',   name: 'Focused',      type: 'prefix', stat: 'neu',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 5,  desc: '+1 Neural Integrity (NEU)' },
  { id: 'kin_boost',   name: 'Kinetic',      type: 'prefix', stat: 'kin',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 5,  desc: '+1 Kinetic Efficiency (KIN)' },
  { id: 'qnt_boost',   name: 'Quantum',      type: 'prefix', stat: 'qnt',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 4,  desc: '+1 Quantum Aptitude (QNT)' },
  { id: 'syn_boost',   name: 'Synthetic',    type: 'prefix', stat: 'syn',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 4,  desc: '+1 Synthetic Affinity (SYN)' },
  { id: 'chr_boost',   name: 'Chronal',      type: 'prefix', stat: 'chr',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 3,  desc: '+1 Chronal Stability (CHR)' },
  { id: 'ent_boost',   name: 'Entropic',     type: 'prefix', stat: 'ent',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 3,  desc: '+1 Entropic Resistance (ENT)' },
  { id: 'gra_boost',   name: 'Gravitic',     type: 'prefix', stat: 'gra',            format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 3,  desc: '+1 Gravitic Harmony (GRA)' },

  // ── PREFIXES: PERK LEVEL BONUSES (always +1, no tier scaling) ─────────
  { id: 'hero_perk',   name: 'Heroic',       type: 'prefix', stat: 'perkHero',       format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 2,  desc: '+1 Hero Perk Level' },
  { id: 'warrior_perk',name: 'Warlord\'s',   type: 'prefix', stat: 'perkWarrior',    format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 2,  desc: '+1 Warrior Perk Level' },
  { id: 'smarts_perk', name: 'Sage\'s',      type: 'prefix', stat: 'perkSmarts',     format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 2,  desc: '+1 Smarts Perk Level' },
  { id: 'maker_perk',  name: 'Artisan\'s',   type: 'prefix', stat: 'perkMaker',      format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 2,  desc: '+1 Maker Perk Level' },

  // ── PREFIXES: SPELL & ABILITY ───────────────────────────────────────
  { id: 'cdr',         name: 'Swift',        type: 'prefix', stat: 'cooldownReduction', format: 'pct', minBase: 2, maxBase: 8,  minTier: 3, weight: 8,  desc: '+{value}% Cooldown Reduction' },
  { id: 'spellpower',  name: 'Empowered',    type: 'prefix', stat: 'spellDamage',    format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 3, weight: 7,  desc: '+{value}% Spell Damage' },
  { id: 'manacost',    name: 'Efficient',    type: 'prefix', stat: 'abilityCostRed',  format: 'pct', minBase: 2,  maxBase: 8,   minTier: 3, weight: 6,  desc: '-{value}% Ability Cost' },
  { id: 'nexus',       name: 'Nexus-Forged', type: 'prefix', stat: 'allDamage',      format: 'pct',  minBase: 2,  maxBase: 6,   minTier: 5, weight: 3,  desc: '+{value}% All Damage' },

  // ── SUFFIXES: DEFENSE & SURVIVAL ────────────────────────────────────
  { id: 'sturdy',      name: 'of Fortitude',  type: 'suffix', stat: 'health',        format: 'flat', minBase: 5,  maxBase: 25,  minTier: 1, weight: 20, desc: '+{value} Health' },
  { id: 'iron',        name: 'of Iron',       type: 'suffix', stat: 'armor',         format: 'flat', minBase: 3,  maxBase: 15,  minTier: 1, weight: 18, desc: '+{value} Armor' },
  { id: 'agile',       name: 'of the Wind',   type: 'suffix', stat: 'moveSpeed',     format: 'pct',  minBase: 1,  maxBase: 5,   minTier: 1, weight: 12, desc: '+{value}% Movement Speed' },
  { id: 'wise',        name: 'of Wisdom',     type: 'suffix', stat: 'mana',          format: 'flat', minBase: 5,  maxBase: 20,  minTier: 1, weight: 12, desc: '+{value} Mana' },
  { id: 'blocking',    name: 'of the Shield', type: 'suffix', stat: 'blockChance',   format: 'pct',  minBase: 1,  maxBase: 5,   minTier: 2, weight: 10, desc: '+{value}% Block Chance' },
  { id: 'dodging',     name: 'of Evasion',    type: 'suffix', stat: 'evasion',       format: 'pct',  minBase: 1,  maxBase: 5,   minTier: 2, weight: 10, desc: '+{value}% Evasion' },
  { id: 'resilient',   name: 'of Resilience', type: 'suffix', stat: 'resistance',    format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 3, weight: 8,  desc: '+{value}% Resistance' },
  { id: 'regenerating',name: 'of Renewal',    type: 'suffix', stat: 'hpRegen',       format: 'flat', minBase: 1,  maxBase: 4,   minTier: 3, weight: 8,  desc: '+{value} HP/sec Regen' },
  { id: 'enduring',    name: 'of Endurance',  type: 'suffix', stat: 'stamina',       format: 'flat', minBase: 5,  maxBase: 15,  minTier: 2, weight: 10, desc: '+{value} Stamina' },

  // ── SUFFIXES: ELEMENTAL RESISTANCE ──────────────────────────────────
  { id: 'fireproof',   name: 'of the Flame',  type: 'suffix', stat: 'fireResist',    format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 2, weight: 7,  desc: '+{value}% Fire Resistance' },
  { id: 'frostproof',  name: 'of Winter',     type: 'suffix', stat: 'iceResist',     format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 2, weight: 7,  desc: '+{value}% Ice Resistance' },
  { id: 'insulated',   name: 'of Grounding',  type: 'suffix', stat: 'lightningResist',format: 'pct', minBase: 3,  maxBase: 12,  minTier: 2, weight: 7,  desc: '+{value}% Lightning Resistance' },
  { id: 'warded',      name: 'of Warding',    type: 'suffix', stat: 'arcaneResist',  format: 'pct',  minBase: 3,  maxBase: 10,  minTier: 3, weight: 5,  desc: '+{value}% Arcane Resistance' },

  // ── SUFFIXES: ATTRIBUTE BONUSES (always +1, no tier scaling) ───────────
  { id: 'of_bio',      name: 'of Biomass',    type: 'suffix', stat: 'bio',           format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 4,  desc: '+1 Biomass (BIO)' },
  { id: 'of_neu',      name: 'of Clarity',    type: 'suffix', stat: 'neu',           format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 4,  desc: '+1 Neural Integrity (NEU)' },
  { id: 'of_kin',      name: 'of Momentum',   type: 'suffix', stat: 'kin',           format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 4,  desc: '+1 Kinetic Efficiency (KIN)' },
  { id: 'of_qnt',      name: 'of Probability',type: 'suffix', stat: 'qnt',           format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 3,  desc: '+1 Quantum Aptitude (QNT)' },
  { id: 'of_syn',      name: 'of Synthesis',  type: 'suffix', stat: 'syn',           format: 'flat', minBase: 1,  maxBase: 1,   minTier: 4, weight: 3,  desc: '+1 Synthetic Affinity (SYN)' },
  { id: 'of_chr',      name: 'of the Timeline', type: 'suffix', stat: 'chr',         format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 2,  desc: '+1 Chronal Stability (CHR)' },
  { id: 'of_ent',      name: 'of Preservation', type: 'suffix', stat: 'ent',         format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 2,  desc: '+1 Entropic Resistance (ENT)' },
  { id: 'of_gra',      name: 'of Orbit',      type: 'suffix', stat: 'gra',           format: 'flat', minBase: 1,  maxBase: 1,   minTier: 5, weight: 2,  desc: '+1 Gravitic Harmony (GRA)' },

  // ── SUFFIXES: HEALTH / STAMINA / MANA GAINS ───────────────────────────
  { id: 'healthOnKill', name: 'of Slaughter',  type: 'suffix', stat: 'healthOnKill',  format: 'flat', minBase: 3,  maxBase: 12,  minTier: 3, weight: 8,  desc: '+{value} Health on Kill' },
  { id: 'manaOnKill',   name: 'of Siphoning',  type: 'suffix', stat: 'manaOnKill',    format: 'flat', minBase: 2,  maxBase: 8,   minTier: 3, weight: 7,  desc: '+{value} Mana on Kill' },
  { id: 'staminaOnHit', name: 'of Vigor',      type: 'suffix', stat: 'staminaOnHit',  format: 'flat', minBase: 1,  maxBase: 4,   minTier: 2, weight: 8,  desc: '+{value} Stamina on Hit' },
  { id: 'healthOnHit',  name: 'of Mending',    type: 'suffix', stat: 'healthOnHit',   format: 'flat', minBase: 1,  maxBase: 3,   minTier: 4, weight: 5,  desc: '+{value} Health on Hit' },
  { id: 'manaRegen',    name: 'of Flow',       type: 'suffix', stat: 'manaRegen',     format: 'flat', minBase: 1,  maxBase: 3,   minTier: 3, weight: 7,  desc: '+{value} Mana/sec Regen' },
  { id: 'staminaRegen', name: 'of Breath',     type: 'suffix', stat: 'staminaRegen',  format: 'pct',  minBase: 3,  maxBase: 10,  minTier: 2, weight: 8,  desc: '+{value}% Stamina Regen' },

  // ── SUFFIXES: RESOURCE GATHERING ────────────────────────────────────
  { id: 'harvest_b',    name: 'of the Harvest',type: 'suffix', stat: 'harvestYield',  format: 'pct',  minBase: 3,  maxBase: 10,  minTier: 2, weight: 8,  desc: '+{value}% Harvest Yield' },
  { id: 'miningBonus',  name: 'of the Vein',   type: 'suffix', stat: 'miningYield',   format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 2, weight: 6,  desc: '+{value}% Mining Yield' },
  { id: 'woodBonus',    name: 'of the Grove',  type: 'suffix', stat: 'woodcutYield',  format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 2, weight: 6,  desc: '+{value}% Woodcutting Yield' },
  { id: 'fishBonus',    name: 'of the Depths', type: 'suffix', stat: 'fishingYield',  format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 2, weight: 5,  desc: '+{value}% Fishing Yield' },
  { id: 'skinBonus',    name: 'of the Hunt',   type: 'suffix', stat: 'skinningYield', format: 'pct',  minBase: 3,  maxBase: 10,  minTier: 2, weight: 5,  desc: '+{value}% Skinning Yield' },
  { id: 'herbBonus',    name: 'of the Wilds',  type: 'suffix', stat: 'herbalismYield',format: 'pct',  minBase: 3,  maxBase: 10,  minTier: 2, weight: 5,  desc: '+{value}% Herbalism Yield' },

  // ── SUFFIXES: RARE UTILITY ─────────────────────────────────────────
  { id: 'eternal',      name: 'of Eternity',   type: 'suffix', stat: 'durability',    format: 'pct',  minBase: 10, maxBase: 30,  minTier: 4, weight: 6,  desc: '+{value}% Durability' },
  { id: 'quantum_f',    name: 'of the Rift',   type: 'suffix', stat: 'rareFind',      format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 5, weight: 3,  desc: '+{value}% Rare Find' },
  { id: 'thorns',       name: 'of Thorns',     type: 'suffix', stat: 'reflectDamage', format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 3, weight: 6,  desc: '+{value}% Damage Reflected' },
  { id: 'absorb',       name: 'of Absorption', type: 'suffix', stat: 'damageAbsorb',  format: 'pct',  minBase: 1,  maxBase: 4,   minTier: 4, weight: 4,  desc: '+{value}% Damage Absorbed as Shield' },
];

// ── Tier → Affix Count ──────────────────────────────────────────────────────

/** Number of affix slots available at each tier.
 *  Aligned with the stats guide:
 *  https://grudges.grudge-studio.com/stats-guide.html */
export const AFFIX_COUNT_BY_TIER: Record<number, number> = {
  1: 2,   // Scrap: 2 affixes — surface salvage, bent rebar
  2: 3,   // Salvaged: 3 affixes — workshop re-bored gear
  3: 4,   // Refined: 4 affixes — faction-armoury issue, one faction-flavoured
  4: 5,   // Forged: 5 affixes — master-crafted, one guaranteed prefix slot
  5: 6,   // Relic: 6 affixes + unique implicit — pre-collapse tech, cannot be crafted
  6: 7,   // Ascendant: 7 affixes + ascendant suffix + corruption mod — rift-binding apex
  7: 7,   // Ancient: 7 affixes + higher value rolls
  8: 7,   // Legendary: 7 affixes + highest value rolls + guaranteed unique
};

/** Value multiplier per tier. T1 = 1.0×, T8 = 3.0×. */
export function tierValueMultiplier(tier: number): number {
  return 1.0 + (Math.min(tier, 8) - 1) * 0.28;
}

// ── Rolled Affix (instance on a specific item) ──────────────────────────────

export interface RolledAffix {
  affixId: string;
  name: string;
  type: AffixSlotType;
  stat: string;
  value: number;
  format: 'flat' | 'pct';
  /** Human-readable line for the tooltip. */
  display: string;
}

// ── Loot Drop (a generated item with rolled affixes) ────────────────────────

export interface LootDrop {
  /** Base item definition ID. */
  baseId: string;
  /** Generated unique ID for this specific drop. */
  uid: string;
  /** Tier of this drop (determines affix count + value scaling). */
  tier: number;
  /** Rolled affixes on this specific drop. */
  affixes: RolledAffix[];
  /** Total bonus stats (sum of all affix values, keyed by stat). */
  bonusStats: Record<string, number>;
  /** Generated name: "Sharp Iron Helm of Fortitude" */
  generatedName: string;
  /**
   * Gear tint colour (hex, e.g. '#a03030'). Applied to the clothing/fabric
   * material channels on the gear mesh — never to skin. Rolled per-drop so
   * identical base items can look distinct. Null = use the mesh's baked colour.
   */
  gearTint: string | null;
}

// ── Rolling Engine ──────────────────────────────────────────────────────────

/** Stats that are capped at their base value (no tier scaling). */
const NO_SCALE_STATS = new Set([
  'bio','neu','kin','qnt','syn','chr','ent','gra',
  'perkHero','perkWarrior','perkSmarts','perkMaker',
]);

/**
 * Roll a single affix value within the tier-scaled range.
 * Attribute and perk stats always roll exactly their base (1) —
 * no tier inflation. Everything else scales with tier.
 */
function rollValue(affix: AffixDef, tier: number): number {
  if (NO_SCALE_STATS.has(affix.stat)) {
    // Flat +1 always. No tier scaling on attributes/perks.
    return affix.minBase;
  }
  const mult = tierValueMultiplier(tier);
  const min = Math.floor(affix.minBase * mult);
  const max = Math.ceil(affix.maxBase * mult);
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Equipment slot categories for affix filtering. */
const WEAPON_SLOTS = new Set(['mainhand', 'offhand']);
const ARMOR_SLOTS  = new Set(['helm', 'chest', 'legs', 'boots', 'cape']);

function slotCategory(slot: string): AffixSlotRestriction {
  if (WEAPON_SLOTS.has(slot)) return 'weapon';
  if (ARMOR_SLOTS.has(slot))  return 'armor';
  return 'any';
}

/**
 * Pick N affixes from the pool using weighted random selection.
 * No duplicate affix IDs. Respects minTier AND slot restrictions.
 */
function pickAffixes(tier: number, count: number, equipSlot?: string): AffixDef[] {
  const cat = equipSlot ? slotCategory(equipSlot) : 'any';
  const eligible = AFFIX_POOL.filter(a => {
    if (tier < a.minTier) return false;
    // Slot filtering: 'any' affixes always eligible. Otherwise must match.
    const affixSlot = a.slots ?? 'any';
    if (affixSlot === 'any') return true;
    if (cat === 'any') return true; // rings/amulets/relic can roll anything
    return affixSlot === cat;
  });
  const picked: AffixDef[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < count && eligible.length > 0; i++) {
    // Weighted random from remaining eligible
    const remaining = eligible.filter(a => !usedIds.has(a.id));
    if (remaining.length === 0) break;

    const totalWeight = remaining.reduce((s, a) => s + a.weight, 0);
    let roll = Math.random() * totalWeight;
    let selected: AffixDef | null = null;

    for (const affix of remaining) {
      roll -= affix.weight;
      if (roll <= 0) {
        selected = affix;
        break;
      }
    }

    if (selected) {
      picked.push(selected);
      usedIds.add(selected.id);
    }
  }

  return picked;
}

// ── Gear Tint Colour Palettes ────────────────────────────────────────────────
// Rolled per-drop so visually identical base items look distinct. Palette is
// tier-aware: low tiers get muted earth tones, high tiers get saturated hues.

const TINT_PALETTE_LOW  = ['#7b6b5a','#6b7b5a','#5a6b7b','#7b5a5a','#6b5a7b','#8a7a6a','#5a7b6b','#7b7b5a'];
const TINT_PALETTE_MID  = ['#8b4513','#2e5a1e','#1e3a5a','#5a1e3a','#3a5a1e','#5a3a1e','#1e5a5a','#4a2e6b'];
const TINT_PALETTE_HIGH = ['#c41e3a','#1e90ff','#9b59b6','#f39c12','#2ecc71','#e74c3c','#3498db','#8e44ad'];

function rollGearTint(tier: number, equipSlot: string): string | null {
  if (!ARMOR_SLOTS.has(equipSlot)) return null; // weapons don't tint
  const palette = tier <= 2 ? TINT_PALETTE_LOW : tier <= 4 ? TINT_PALETTE_MID : TINT_PALETTE_HIGH;
  return palette[Math.floor(Math.random() * palette.length)];
}

/**
 * Generate a loot drop with randomized affixes.
 *
 * @param baseId    ID of the base item definition (e.g. 'iron_helm')
 * @param baseName  Human-readable base item name (e.g. 'Iron Helm')
 * @param tier      Item tier (1-8). Determines affix count + value scaling.
 * @param equipSlot Equipment slot (e.g. 'helm', 'mainhand'). Filters affix pool.
 * @returns         A LootDrop with rolled affixes, generated name, and gear tint.
 */
export function generateLootDrop(baseId: string, baseName: string, tier: number, equipSlot?: string): LootDrop {
  const clampedTier = Math.max(1, Math.min(8, tier));
  const affixCount = AFFIX_COUNT_BY_TIER[clampedTier] ?? 1;

  const selectedAffixes = pickAffixes(clampedTier, affixCount, equipSlot);
  const rolledAffixes: RolledAffix[] = [];
  const bonusStats: Record<string, number> = {};

  let prefixName = '';
  let suffixName = '';

  for (const affix of selectedAffixes) {
    const value = rollValue(affix, clampedTier);
    const display = affix.desc.replace('{value}', value.toString());

    rolledAffixes.push({
      affixId: affix.id,
      name: affix.name,
      type: affix.type,
      stat: affix.stat,
      value,
      format: affix.format,
      display,
    });

    // Accumulate bonus stats
    bonusStats[affix.stat] = (bonusStats[affix.stat] ?? 0) + value;

    // Build generated name from first prefix + last suffix
    if (affix.type === 'prefix' && !prefixName) prefixName = affix.name;
    if (affix.type === 'suffix') suffixName = affix.name;
  }

  // Generated name: "Sharp Iron Helm of Fortitude"
  const generatedName = [prefixName, baseName, suffixName].filter(Boolean).join(' ');

  return {
    baseId,
    uid: `drop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tier: clampedTier,
    affixes: rolledAffixes,
    bonusStats,
    generatedName,
    gearTint: rollGearTint(clampedTier, equipSlot ?? ''),
  };
}

/**
 * Roll a tier for a dropped item based on enemy tier and luck.
 *
 * @param enemyTier  'basic' (T1-2), 'elite' (T2-4), 'boss' (T4-6)
 * @param luckBonus  Bonus from QNT stat / rare-find affixes (0-100)
 */
export function rollDropTier(enemyTier: 'basic' | 'elite' | 'boss', luckBonus: number = 0): number {
  const luckMult = 1 + luckBonus / 100;
  const roll = Math.random() * 100 * luckMult;

  switch (enemyTier) {
    case 'basic':
      if (roll > 98) return 4;
      if (roll > 90) return 3;
      if (roll > 60) return 2;
      return 1;
    case 'elite':
      if (roll > 98) return 5;
      if (roll > 85) return 4;
      if (roll > 50) return 3;
      return 2;
    case 'boss':
      if (roll > 99) return 6;
      if (roll > 90) return 5;
      if (roll > 60) return 4;
      return 3;
    default:
      return 1;
  }
}

/**
 * Format a LootDrop's affixes into tooltip lines.
 */
export function formatAffixTooltip(drop: LootDrop): string[] {
  return drop.affixes.map(a => a.display);
}

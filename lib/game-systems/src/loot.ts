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
}

/**
 * The master affix pool. Add new affixes here — the roller picks from this
 * list automatically. Weight controls how common each affix is.
 */
export const AFFIX_POOL: AffixDef[] = [
  // ── PREFIXES: BASE COMBAT ────────────────────────────────────────────
  { id: 'sharp',       name: 'Sharp',        type: 'prefix', stat: 'damage',         format: 'flat', minBase: 2,  maxBase: 8,   minTier: 1, weight: 20, desc: '+{value} Damage' },
  { id: 'fierce',      name: 'Fierce',       type: 'prefix', stat: 'damage',         format: 'flat', minBase: 6,  maxBase: 18,  minTier: 3, weight: 12, desc: '+{value} Damage' },
  { id: 'quick',       name: 'Quick',        type: 'prefix', stat: 'attackSpeed',    format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 1, weight: 15, desc: '+{value}% Attack Speed' },
  { id: 'precise',     name: 'Precise',      type: 'prefix', stat: 'critChance',     format: 'pct',  minBase: 1,  maxBase: 5,   minTier: 2, weight: 12, desc: '+{value}% Critical Chance' },
  { id: 'brutal',      name: 'Brutal',       type: 'prefix', stat: 'critDamage',     format: 'pct',  minBase: 5,  maxBase: 20,  minTier: 3, weight: 10, desc: '+{value}% Critical Damage' },
  { id: 'piercing',    name: 'Piercing',     type: 'prefix', stat: 'armorPen',       format: 'pct',  minBase: 2,  maxBase: 10,  minTier: 3, weight: 8,  desc: '+{value}% Armor Penetration' },
  { id: 'staggering',  name: 'Staggering',   type: 'prefix', stat: 'stagger',        format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 3, weight: 8,  desc: '+{value}% Stagger Chance' },

  // ── PREFIXES: DAMAGE TYPES (elemental) ───────────────────────────────
  { id: 'blazing',     name: 'Blazing',      type: 'prefix', stat: 'fireDamage',     format: 'flat', minBase: 3,  maxBase: 12,  minTier: 2, weight: 8,  desc: '+{value} Fire Damage' },
  { id: 'frozen',      name: 'Frozen',       type: 'prefix', stat: 'iceDamage',      format: 'flat', minBase: 3,  maxBase: 12,  minTier: 2, weight: 8,  desc: '+{value} Ice Damage' },
  { id: 'shocking',    name: 'Shocking',     type: 'prefix', stat: 'lightningDamage',format: 'flat', minBase: 3,  maxBase: 12,  minTier: 2, weight: 8,  desc: '+{value} Lightning Damage' },
  { id: 'arcane',      name: 'Arcane',       type: 'prefix', stat: 'arcaneDamage',   format: 'flat', minBase: 3,  maxBase: 12,  minTier: 3, weight: 7,  desc: '+{value} Arcane Damage' },
  { id: 'holy',        name: 'Blessed',      type: 'prefix', stat: 'holyDamage',     format: 'flat', minBase: 3,  maxBase: 12,  minTier: 3, weight: 6,  desc: '+{value} Holy Damage' },
  { id: 'toxic',       name: 'Venomous',     type: 'prefix', stat: 'natureDamage',   format: 'flat', minBase: 3,  maxBase: 10,  minTier: 2, weight: 7,  desc: '+{value} Nature/Poison Damage' },

  // ── PREFIXES: PROC EFFECTS (chance-on-hit) ────────────────────────────
  { id: 'vampiric',    name: 'Vampiric',     type: 'prefix', stat: 'drainHealth',    format: 'pct',  minBase: 1,  maxBase: 4,   minTier: 4, weight: 6,  desc: '+{value}% Life Steal' },
  { id: 'igniting',    name: 'Igniting',     type: 'prefix', stat: 'procBurn',       format: 'pct',  minBase: 3,  maxBase: 12,  minTier: 3, weight: 6,  desc: '{value}% chance to Burn on hit (3s)' },
  { id: 'freezing',    name: 'Chilling',     type: 'prefix', stat: 'procFreeze',     format: 'pct',  minBase: 2,  maxBase: 8,   minTier: 3, weight: 5,  desc: '{value}% chance to Slow on hit (2s)' },
  { id: 'shocking_p',  name: 'Arcing',       type: 'prefix', stat: 'procChainLightning', format: 'pct', minBase: 2, maxBase: 6, minTier: 4, weight: 4,  desc: '{value}% chance to Chain Lightning (2 targets)' },
  { id: 'bleeding',    name: 'Serrated',     type: 'prefix', stat: 'procBleed',      format: 'pct',  minBase: 4,  maxBase: 15,  minTier: 2, weight: 8,  desc: '{value}% chance to Bleed on hit (4s)' },
  { id: 'poisoning',   name: 'Toxic',        type: 'prefix', stat: 'procPoison',     format: 'pct',  minBase: 3,  maxBase: 10,  minTier: 3, weight: 6,  desc: '{value}% chance to Poison on hit (5s)' },
  { id: 'exploding',   name: 'Volatile',     type: 'prefix', stat: 'procExplode',    format: 'pct',  minBase: 1,  maxBase: 4,   minTier: 5, weight: 3,  desc: '{value}% chance to Explode on kill (AoE)' },

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

/** Number of affix slots available at each tier. */
export const AFFIX_COUNT_BY_TIER: Record<number, number> = {
  1: 1,   // Common: 1 affix
  2: 2,   // Uncommon: 2 affixes
  3: 3,   // Rare: 3 affixes
  4: 4,   // Epic: 4 affixes
  5: 5,   // Heroic: 5 affixes
  6: 6,   // Mythic: 6 affixes (max — this is the "perfect roll" tier)
  7: 6,   // Ancient: 6 affixes + higher value rolls
  8: 6,   // Legendary: 6 affixes + highest value rolls + guaranteed unique
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

/**
 * Pick N affixes from the pool using weighted random selection.
 * No duplicate affix IDs. Respects minTier requirements.
 */
function pickAffixes(tier: number, count: number): AffixDef[] {
  const eligible = AFFIX_POOL.filter(a => tier >= a.minTier);
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

/**
 * Generate a loot drop with randomized affixes.
 *
 * @param baseId  ID of the base item definition (e.g. 'iron_helm')
 * @param baseName Human-readable base item name (e.g. 'Iron Helm')
 * @param tier    Item tier (1-8). Determines affix count + value scaling.
 * @returns       A LootDrop with rolled affixes and a generated name.
 */
export function generateLootDrop(baseId: string, baseName: string, tier: number): LootDrop {
  const clampedTier = Math.max(1, Math.min(8, tier));
  const affixCount = AFFIX_COUNT_BY_TIER[clampedTier] ?? 1;

  const selectedAffixes = pickAffixes(clampedTier, affixCount);
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

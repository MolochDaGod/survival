export type Gender = 'male' | 'female';

/**
 * Every available body silhouette / starter mesh for the character creator.
 * The mesh files live at `/models/characters/<gender>/<id>.gltf` — sourced
 * from the Quaternius "Ultimate Animated Character" male & female packs.
 *
 * Each id is treated as a "build" the player can pick at creation. When the
 * gear/equipment system lands, equipped items will replace pieces on top of
 * the chosen base mesh; until then each mesh ships with its own baked-in
 * starter clothing.
 */
export type BodyProportionType =
  // Legacy survivor ids kept for save-file migration only — not in BODY_TYPES.
  | 'athletic' | 'lean'
  // Quaternius animated packs — body-type silhouettes with built-in starter clothing
  | 'adventurer' | 'beach' | 'casual' | 'casual-hoodie' | 'farmer'
  | 'formal' | 'king' | 'medieval' | 'punk' | 'scifi'
  | 'soldier' | 'spacesuit' | 'suit' | 'swat' | 'witch' | 'worker';

export interface GrudgeStats {
  bio: number;
  neu: number;
  kin: number;
  qnt: number;
  syn: number;
  chr: number;
  ent: number;
  gra: number;
}

export interface StatMeta {
  key: keyof GrudgeStats;
  label: string;
  abbr: string;
  color: string;
  desc: string;
  /** Path to circular icon PNG (transparent bg) under /public. */
  icon: string;
}

export const STARTING_BUDGET = 20;
export const STAT_MIN = 0;
export const STAT_MAX = 6;
export const STAT_DEFAULT = 0;

export const STAT_COST: number[] = [0, 1, 2, 4, 8, 16, 20];

export function costToReach(level: number): number {
  let total = 0;
  for (let i = 1; i <= level; i++) total += STAT_COST[i];
  return total;
}

export function costForNext(currentLevel: number): number {
  if (currentLevel >= STAT_MAX) return Infinity;
  return STAT_COST[currentLevel + 1];
}

export function computeSpentPoints(stats: GrudgeStats): number {
  return (Object.keys(stats) as (keyof GrudgeStats)[]).reduce(
    (sum, k) => sum + costToReach(stats[k]),
    0,
  );
}

export interface MilestonePerk {
  perkName: string;
  perkDesc: string;
  icon: string;
}

export const STAT_MILESTONE_PERKS: Record<keyof GrudgeStats, MilestonePerk[]> = {
  bio: [
    { perkName: 'Iron Constitution',     perkDesc: '+5 Max HP. Minor bleed resistance.',                                        icon: '🩸' },
    { perkName: 'Cellular Regen',        perkDesc: '+10 Max HP. Toxin Resist I. Natural regen 0.5 HP/s.',                       icon: '🔄' },
    { perkName: 'Augment Compatibility', perkDesc: '+20 Max HP. Implant Slot unlocked. Toxin Resist II.',                        icon: '🔩' },
    { perkName: 'Nanoflesh Matrix',      perkDesc: '+35 Max HP. Rapid Heal I. Disease Immunity.',                                icon: '🧬' },
    { perkName: 'Apex Physiology',       perkDesc: '+55 Max HP. Rapid Heal II. Combat Regen.',                                   icon: '💪' },
    { perkName: 'Undying Protocol',      perkDesc: '+80 Max HP. Death Defiance: survive one lethal blow once per mission.',      icon: '☠️' },
  ],
  neu: [
    { perkName: 'Signal Clarity',        perkDesc: '+5 Sanity. Psionic Shielding I.',                                           icon: '📡' },
    { perkName: 'Neural Firewall',       perkDesc: 'Hack Resist I. AI Co-Processor Tier I unlocked.',                           icon: '🧱' },
    { perkName: 'Deep Focus',            perkDesc: 'Psionic Shielding II. Neural Overclock (temp INT +20%).',                   icon: '🎯' },
    { perkName: 'Synaptic Overdrive',    perkDesc: 'Hack Resist II. AI Co-Proc Tier II. Mind Link with allies.',                icon: '⚡' },
    { perkName: 'Transcendent Logic',    perkDesc: 'Psionic Mastery. Reality Anchor. Neural Dominance.',                        icon: '🌐' },
    { perkName: 'Enlightened Arch.',     perkDesc: 'Full Psionic Immunity. Quantum Cognition. AI Symbiosis.',                   icon: '🧠' },
  ],
  kin: [
    { perkName: 'Fleet Footed',          perkDesc: '+5% movement speed. Minor fall damage resist.',                             icon: '🏃' },
    { perkName: 'Combat Cadence',        perkDesc: '+10% melee damage. Stamina Regen +0.5/s.',                                  icon: '⚔️' },
    { perkName: 'Zero-G Trained',        perkDesc: '+15% movement. Zero-G combat unlock. Dodge window +20ms.',                  icon: '🚀' },
    { perkName: 'Kinetic Amplifier',     perkDesc: '+25% melee damage. Momentum Strikes (combo chain bonus).',                  icon: '💥' },
    { perkName: 'Apex Predator',         perkDesc: 'Sprint never drains stamina. Aerial assault unlocked.',                     icon: '🐆' },
    { perkName: 'Unstoppable Force',     perkDesc: 'Immune to knockback. Ground slam ability. +40% melee damage total.',        icon: '🌪️' },
  ],
  qnt: [
    { perkName: 'Tech Intuition',        perkDesc: 'Quantum devices recognized on scan. +5 tech comprehension.',                icon: '🔭' },
    { perkName: 'Probability Sense',     perkDesc: 'Hazard pre-detection. +1 quantum device slot.',                             icon: '🎲' },
    { perkName: 'Field Theorist',        perkDesc: 'Quantum shield modulator. +2 device slots. Exotic material crafting.',      icon: '🧪' },
    { perkName: 'Phase Manipulator',     perkDesc: 'Phase-step dodge (short blink). Quantum grenade fabrication.',              icon: '🌀' },
    { perkName: 'Reality Weaver',        perkDesc: 'Probability bubble (slow projectiles near you). +3 device slots.',          icon: '🕸️' },
    { perkName: 'Quantum Sovereign',     perkDesc: 'Temporal suspension (stop time for 2s, 1×/mission). Max device slots.',     icon: '⏳' },
  ],
  syn: [
    { perkName: 'Network Aware',         perkDesc: 'Nearby devices show on minimap. +1 drone slot.',                            icon: '📶' },
    { perkName: 'Ghost Protocol',        perkDesc: 'Hack speed +30%. Basic AI negotiation unlocked.',                           icon: '👻' },
    { perkName: 'Swarm Link',            perkDesc: '+2 drone slots. Swarm intel (area scan). Firewall bypass I.',               icon: '🤖' },
    { perkName: 'Neural Mesh',           perkDesc: 'Passive drone repair. AI faction trust +20. Firewall bypass II.',           icon: '🕹️' },
    { perkName: 'Hive Mind Conduit',     perkDesc: 'Direct AI faction diplomacy. Drones inherit combat skills.',                icon: '🧿' },
    { perkName: 'Synthetic Ascension',   perkDesc: 'Become machine-recognized ally. Full drone autonomous control.',            icon: '💎' },
  ],
  chr: [
    { perkName: 'Temporal Grounding',    perkDesc: 'Anomaly resistance +10%. Chronal sickness immunity.',                       icon: '⏱️' },
    { perkName: 'Echo Perception',       perkDesc: 'See 2s into future (danger sense). Causality shield I.',                    icon: '👁️' },
    { perkName: 'Phase Anchor',          perkDesc: 'Cannot be displaced by temporal events. Rewind I (undo last action).',      icon: '⚓' },
    { perkName: 'Paradox Engine',        perkDesc: 'Duplicate self for 5s. Causality shield II. Chrono gear unlock.',           icon: '🔮' },
    { perkName: 'Timeline Bender',       perkDesc: 'Rewind II (15s window). Temporal stasis projectile.',                       icon: '🌊' },
    { perkName: 'Eternal Observer',      perkDesc: 'Outside timeline during death (1×/mission). Perfect chronal immunity.',     icon: '♾️' },
  ],
  ent: [
    { perkName: 'Hardy Materials',       perkDesc: 'Equipment durability +20%. Salvage yield +10%.',                            icon: '🪨' },
    { perkName: 'Decay Shield',          perkDesc: 'Resource spoilage –30%. Corrosion resist I.',                               icon: '🛡️' },
    { perkName: 'Reclamation Expert',    perkDesc: 'Craft from degraded materials. Gear repair costs –25%.',                    icon: '♻️' },
    { perkName: 'Entropy Sink',          perkDesc: 'Absorb environmental decay as energy. Gear never breaks below 10%.',        icon: '🌀' },
    { perkName: 'Void Preservation',     perkDesc: 'Slow entropy field (debuffs enemies in range). Full corrosion immunity.',   icon: '🫙' },
    { perkName: 'Eternal Engine',        perkDesc: 'Gear is indestructible. Entropy absorption heals 1 HP/s passively.',        icon: '⚙️' },
  ],
  gra: [
    { perkName: 'Light Footed',          perkDesc: 'Fall damage –25%. Minor zero-G stability.',                                 icon: '🪶' },
    { perkName: 'Grav Adapted',          perkDesc: 'Fall damage –50%. Zero-G navigation unlock. +5% spatial awareness.',       icon: '🌙' },
    { perkName: 'Force Sense',           perkDesc: 'Detect gravitational anomalies. Grav-pulse push (short range).',            icon: '🎯' },
    { perkName: 'Orbital Mastery',       perkDesc: 'Full zero-G combat. Grav anchor (pin enemies). Wall-running.',             icon: '🛸' },
    { perkName: 'Graviton Weave',        perkDesc: 'Personal gravity manipulation. Launch enemies skyward.',                    icon: '🌌' },
    { perkName: 'Event Horizon Body',    perkDesc: 'Micro singularity ability. Total fall immunity. Gravity reversal field.',   icon: '🕳️' },
  ],
};

export interface Badge {
  statKey: keyof GrudgeStats;
  milestone: number;
  perkName: string;
  perkDesc: string;
  icon: string;
}

export function getBadgesEarned(stats: GrudgeStats): Badge[] {
  const earned: Badge[] = [];
  for (const key of Object.keys(stats) as (keyof GrudgeStats)[]) {
    const val = stats[key];
    for (let m = 1; m <= val; m++) {
      const perk = STAT_MILESTONE_PERKS[key][m - 1];
      earned.push({ statKey: key, milestone: m, ...perk });
    }
  }
  return earned;
}

export function getBadgesPreview(stats: GrudgeStats): Badge[] {
  const preview: Badge[] = [];
  for (const key of Object.keys(stats) as (keyof GrudgeStats)[]) {
    const val = stats[key];
    const next = val + 1;
    if (next <= STAT_MAX) {
      const perk = STAT_MILESTONE_PERKS[key][next - 1];
      preview.push({ statKey: key, milestone: next, ...perk });
    }
  }
  return preview;
}

export const STAT_META: StatMeta[] = [
  { key: 'bio', abbr: 'BIO', label: 'Biomass',            color: '#4caf50', icon: '/icons/stats/bio.png', desc: 'Max health, natural healing, toxin resistance & implant compatibility' },
  { key: 'neu', abbr: 'NEU', label: 'Neural Integrity',   color: '#00bcd4', icon: '/icons/stats/neu.png', desc: 'Sanity, psionic defense, AI co-processor cap & neural hack resistance' },
  { key: 'kin', abbr: 'KIN', label: 'Kinetic Efficiency', color: '#ff9800', icon: '/icons/stats/kin.png', desc: 'Movement speed, melee damage, stamina regen & zero-G combat' },
  { key: 'qnt', abbr: 'QNT', label: 'Quantum Aptitude',   color: '#9c27b0', icon: '/icons/stats/qnt.png', desc: 'Tech comprehension, quantum device operation & probability manipulation' },
  { key: 'syn', abbr: 'SYN', label: 'Synthetic Affinity', color: '#2196f3', icon: '/icons/stats/syn.png', desc: 'Hacking skill, drone control, AI negotiation & swarm intelligence' },
  { key: 'chr', abbr: 'CHR', label: 'Chronal Stability',  color: '#ffeb3b', icon: '/icons/stats/chr.png', desc: 'Temporal anomaly resistance, time perception & causality protection' },
  { key: 'ent', abbr: 'ENT', label: 'Entropic Resistance',color: '#f44336', icon: '/icons/stats/ent.png', desc: 'Equipment durability, resource preservation & decay resistance' },
  { key: 'gra', abbr: 'GRA', label: 'Gravitic Harmony',   color: '#009688', icon: '/icons/stats/gra.png', desc: 'Fall damage reduction, zero-G adaptation & spatial force manipulation' },
];

/**
 * One row per (gender, body-type) combination. The Character Creator's Identity
 * tab pulls from this list to render the body-type picker. Each entry maps to a
 * single mesh on disk under `public/models/characters/<gender>/`.
 *
 * `category` is for the UI to group entries:
 *   - 'survivor' = purpose-built game characters
 *   - 'base'     = true-base bodies for the future equip system
 *   - 'civilian' = Quaternius pack with baked-in starter outfits
 */
export type BodyTypeCategory = 'survivor' | 'base' | 'civilian';

export interface BodyTypeConfig {
  id: BodyProportionType;
  gender: Gender;
  label: string;
  icon: string;
  category: BodyTypeCategory;
  scaleX: number;
  scaleY: number;
  gltfPath: string;
}

/**
 * One canonical mesh per gender — the Quaternius gear-ready "base" body.
 * In-game gear (clothing, armor, etc.) is layered on top of this mesh by the
 * equipment system; the character creator does NOT pick outfits.
 *
 * Body shape variation is driven by sliders (height + build) that live on
 * `CharacterConfig` and feed into `applyBodyScale` in CharacterCreation.tsx,
 * not by swapping meshes. The historical 'athletic' / 'lean' / 'civilian'
 * meshes have been retired from the picker.
 */
export const BODY_TYPES: BodyTypeConfig[] = [
  // ── Male Quaternius variants ─────────────────────────────────────────────
  // Each loads a full clothed GLTF from R2 with 24 baked animation clips.
  { id: 'adventurer',    gender: 'male', label: 'Adventurer', icon: '⚔️',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/adventurer.gltf' },
  { id: 'beach',         gender: 'male', label: 'Scout',      icon: '🏖️', category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/beach.gltf' },
  { id: 'casual',        gender: 'male', label: 'Survivor',   icon: '🧥',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/casual.gltf' },
  { id: 'casual-hoodie', gender: 'male', label: 'Scavenger',  icon: '🪝',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/casual-hoodie.gltf' },
  { id: 'farmer',        gender: 'male', label: 'Settler',    icon: '🌾',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/farmer.gltf' },
  { id: 'king',          gender: 'male', label: 'Warlord',    icon: '👑',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/king.gltf' },
  { id: 'punk',          gender: 'male', label: 'Raider',     icon: '💀',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/punk.gltf' },
  { id: 'spacesuit',     gender: 'male', label: 'Vanguard',   icon: '🚀',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/spacesuit.gltf' },
  { id: 'suit',          gender: 'male', label: 'Commander',  icon: '🕴️', category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/suit.gltf' },
  { id: 'swat',          gender: 'male', label: 'Enforcer',   icon: '🛡️', category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/swat.gltf' },
  { id: 'worker',        gender: 'male', label: 'Builder',    icon: '🔧',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/male/worker.gltf' },
  // ── Female Quaternius variants ───────────────────────────────────────────────
  { id: 'adventurer', gender: 'female', label: 'Adventurer',  icon: '⚔️',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/adventurer.gltf' },
  { id: 'casual',     gender: 'female', label: 'Survivor',    icon: '🧥',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/casual.gltf' },
  { id: 'formal',     gender: 'female', label: 'Diplomat',    icon: '👗',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/formal.gltf' },
  { id: 'medieval',   gender: 'female', label: 'Knight',      icon: '🏰',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/medieval.gltf' },
  { id: 'punk',       gender: 'female', label: 'Raider',      icon: '⚡',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/punk.gltf' },
  { id: 'scifi',      gender: 'female', label: 'Vanguard',    icon: '🚀',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/scifi.gltf' },
  { id: 'soldier',    gender: 'female', label: 'Enforcer',    icon: '🪖',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/soldier.gltf' },
  { id: 'suit',       gender: 'female', label: 'Commander',   icon: '💼',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/suit.gltf' },
  { id: 'witch',      gender: 'female', label: 'Witch',       icon: '🔮',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/witch.gltf' },
  { id: 'worker',     gender: 'female', label: 'Engineer',    icon: '🔧',  category: 'civilian', scaleX: 1.00, scaleY: 1.00, gltfPath: '/models/characters/female/worker.gltf' },
];

/** Body types available for the given gender. */
export function getBodyTypesForGender(gender: Gender): BodyTypeConfig[] {
  return BODY_TYPES.filter(b => b.gender === gender);
}

export interface CharacterBackground {
  id: string;
  label: string;
  icon: string;
  description: string;
  emphasis: string;
  proficiencies: string[];
  /**
   * What the player starts the run with. Drives both the equipped melee/ranged
   * pair and the survival inventory contents. Weapon ids reference WEAPONS
   * in `game/constants.ts`; survival item ids reference SURVIVAL_ITEMS in
   * `game/survival/SurvivalItems.ts`.
   */
  startingLoadout: StartingLoadout;
}

export interface StartingLoadout {
  /** Two equipped weapons — slot 0 is primary (melee), slot 1 is secondary (ranged). */
  weapons: [string, string];
  /** Starting armor (item IDs from ITEM_DATABASE). Gives each Origin a distinct look. */
  armor: { helm?: string; chest?: string; legs?: string; boots?: string };
  /** Survival/consumable items seeded in the bag. */
  survival: Array<{ itemId: string; count: number }>;
}

export const BACKGROUNDS: CharacterBackground[] = [
  {
    id: 'military',
    label: 'Military Veteran',
    icon: '🪖',
    description: 'Hardened by years of conventional and augmented warfare. Trained to survive in hostile environments with minimal resources.',
    emphasis: 'KIN · ENT',
    proficiencies: ['Combat Tactics', 'Survival', 'Weapons Maintenance', 'Field Medicine'],
    startingLoadout: {
      weapons: ['iron_sword', 'iron_pistol'],
      armor: { helm: 'iron_helm', chest: 'iron_breastplate', legs: 'iron_greaves', boots: 'swift_treads' },
      survival: [
        { itemId: 'bandage',     count: 4 },
        { itemId: 'first_aid',   count: 1 },
        { itemId: 'bottle_full', count: 2 },
        { itemId: 'food_can',    count: 2 },
        { itemId: 'knife',       count: 1 },
        { itemId: 'flashlight',  count: 1 },
        { itemId: 'compass',     count: 1 },
      ],
    },
  },
  {
    id: 'scientist',
    label: 'Research Scientist',
    icon: '🔬',
    description: 'A brilliant academic who understands the quantum fabric of reality. Interfaces with advanced technology intuitively.',
    emphasis: 'QNT · NEU',
    proficiencies: ['Quantum Physics', 'Chemistry', 'Data Analysis', 'Lab Fabrication'],
    startingLoadout: {
      weapons: ['shadow_dagger', 'iron_pistol'],
      armor: { chest: 'cloth_tunic', legs: 'leather_pants', boots: 'leather_boots' },
      survival: [
        { itemId: 'bandage',     count: 2 },
        { itemId: 'bottle_full', count: 1 },
        { itemId: 'apple',       count: 3 },
        { itemId: 'duct_tape',   count: 3 },
        { itemId: 'flashlight',  count: 1 },
        { itemId: 'radio',       count: 1 },
      ],
    },
  },
  {
    id: 'medic',
    label: 'Combat Medic',
    icon: '⚕️',
    description: 'Trained to heal under fire. Deep knowledge of biological systems and organic augmentation technology.',
    emphasis: 'BIO · NEU',
    proficiencies: ['Surgery', 'Pharmacology', 'Anatomy', 'Bio-Augmentation'],
    startingLoadout: {
      weapons: ['shadow_dagger', 'iron_pistol'],
      armor: { chest: 'cloth_tunic', legs: 'leather_pants', boots: 'leather_boots' },
      survival: [
        { itemId: 'bandage',     count: 8 },
        { itemId: 'first_aid',   count: 2 },
        { itemId: 'bottle_full', count: 2 },
        { itemId: 'apple',       count: 2 },
        { itemId: 'knife',       count: 1 },
        { itemId: 'flashlight',  count: 1 },
      ],
    },
  },
  {
    id: 'engineer',
    label: 'Systems Engineer',
    icon: '⚙️',
    description: 'Masters of machines and networks. Can repair, build, and hack almost any system encountered in the field.',
    emphasis: 'SYN · ENT',
    proficiencies: ['Electronics', 'Robotics', 'Fabrication', 'Network Intrusion'],
    startingLoadout: {
      weapons: ['thunder_mace', 'iron_pistol'],
      armor: { helm: 'leather_cap', chest: 'iron_breastplate', legs: 'leather_pants', boots: 'leather_boots' },
      survival: [
        { itemId: 'bandage',     count: 2 },
        { itemId: 'bottle_full', count: 1 },
        { itemId: 'duct_tape',   count: 5 },
        { itemId: 'hammer',      count: 1 },
        { itemId: 'saw',         count: 1 },
        { itemId: 'flashlight',  count: 1 },
        { itemId: 'crowbar',     count: 1 },
      ],
    },
  },
  {
    id: 'drifter',
    label: 'Void Drifter',
    icon: '🌌',
    description: 'Spent years in deep space aboard fringe vessels. Adapted to microgravity, extreme cold, and temporal anomalies.',
    emphasis: 'GRA · CHR',
    proficiencies: ['Stellar Navigation', 'Zero-G Operations', 'Ship Systems', 'Temporal Reading'],
    startingLoadout: {
      weapons: ['shadow_dagger', 'iron_pistol'],
      armor: { helm: 'leather_cap', chest: 'cloth_tunic', legs: 'leather_pants', boots: 'swift_treads' },
      survival: [
        { itemId: 'bandage',     count: 3 },
        { itemId: 'bottle_full', count: 3 },
        { itemId: 'food_can',    count: 1 },
        { itemId: 'flashlight',  count: 1 },
        { itemId: 'glow_stick',  count: 4 },
        { itemId: 'compass',     count: 1 },
      ],
    },
  },
  {
    id: 'psionic',
    label: 'Psionic Adept',
    icon: '🧠',
    description: 'Rare individuals whose neural architecture has evolved beyond normal limits. Resistant to mind control and reality distortion.',
    emphasis: 'NEU · QNT',
    proficiencies: ['Neural Hacking', 'Psionic Defense', 'Consciousness Upload', 'Reality Anchoring'],
    startingLoadout: {
      weapons: ['shadow_dagger', 'thunder_mace'],
      armor: { chest: 'mage_robe', legs: 'shadowsilk_pants', boots: 'leather_boots' },
      survival: [
        { itemId: 'bandage',     count: 2 },
        { itemId: 'bottle_full', count: 1 },
        { itemId: 'apple',       count: 2 },
        { itemId: 'flashlight',  count: 1 },
      ],
    },
  },
  {
    id: 'street',
    label: 'Street Survivor',
    icon: '🏚️',
    description: 'Grew up in the collapsed urban sprawls of the 22nd century. Pure instinct, fast reflexes, and a talent for improvisation.',
    emphasis: 'KIN · SYN',
    proficiencies: ['Parkour', 'Black Market Trade', 'Improvised Tech', 'Urban Survival'],
    startingLoadout: {
      weapons: ['shadow_dagger', 'iron_pistol'],
      armor: { helm: 'leather_cap', chest: 'cloth_tunic', legs: 'leather_pants', boots: 'leather_boots' },
      survival: [
        { itemId: 'bandage',      count: 3 },
        { itemId: 'bottle_full',  count: 1 },
        { itemId: 'apple',        count: 2 },
        { itemId: 'wood_chopped', count: 4 },
        { itemId: 'rock_2',       count: 4 },
        { itemId: 'duct_tape',    count: 2 },
        { itemId: 'knife',        count: 1 },
        { itemId: 'lighter',      count: 1 },
        { itemId: 'flashlight',   count: 1 },
        { itemId: 'wt_fence',     count: 4 },
        { itemId: 'wt_barrel',    count: 2 },
        { itemId: 'wt_box',       count: 2 },
        { itemId: 'wt_sign',      count: 1 },
      ],
    },
  },
  {
    id: 'chrono',
    label: 'Chrono-Marine',
    icon: '⏱️',
    description: 'Veteran of temporal warfare campaigns. Has survived multiple timeline resets and carries echoes of erased futures.',
    emphasis: 'CHR · GRA',
    proficiencies: ['Timeline Anchoring', 'Paradox Avoidance', 'Temporal Weapons', 'Gravity Manipulation'],
    startingLoadout: {
      weapons: ['fire_axe', 'hellfire_shotgun'],
      armor: { helm: 'iron_helm', chest: 'void_plate', legs: 'iron_greaves', boots: 'warlords_sabatons' },
      survival: [
        { itemId: 'bandage',     count: 4 },
        { itemId: 'first_aid',   count: 1 },
        { itemId: 'bottle_full', count: 1 },
        { itemId: 'food_can',    count: 2 },
        { itemId: 'flashlight',  count: 1 },
        { itemId: 'compass',     count: 1 },
      ],
    },
  },
];

/**
 * Look up the starting loadout for a chosen origin id. Falls back to the
 * Street Survivor loadout if the id is unknown — that loadout matches the
 * pre-existing hardcoded GameCanvas seed (knife/lighter/flashlight + scrap)
 * so legacy saves don't lose their starter inventory.
 */
/**
 * Construction starter cache appended to every Origin so the modular building
 * system is immediately usable from spawn. Quantities are tuned to let a player
 * stand up a 4×4 cell shelter with door + roof in one session without farming.
 */
const CONSTRUCTION_STARTER: Array<{ itemId: string; count: number }> = [
  { itemId: 'mb_foundation',  count: 6  },
  { itemId: 'mb_wall',        count: 16 },
  { itemId: 'mb_wall_door',   count: 4  },
  { itemId: 'mb_door',        count: 4  },
  { itemId: 'mb_wall_window', count: 4  },
  { itemId: 'mb_wall_corner', count: 4  },
  { itemId: 'mb_floor',       count: 8  },
  { itemId: 'mb_stairs',      count: 2  },
  { itemId: 'mb_roof',        count: 6  },
];

export function getStartingLoadout(backgroundId: string | undefined): StartingLoadout {
  const bg = BACKGROUNDS.find(b => b.id === backgroundId);
  const base = (bg ?? BACKGROUNDS.find(b => b.id === 'street')!).startingLoadout;
  // Append the construction kit unless the background already had it (it
  // doesn't today, but defensive merge keeps this tidy if Origins ever ship
  // their own variants).
  const ownedIds = new Set(base.survival.map(s => s.itemId));
  const extras = CONSTRUCTION_STARTER.filter(c => !ownedIds.has(c.itemId));
  return {
    ...base,
    survival: [...base.survival, ...extras],
  };
}

export interface SkinPreset { id: string; label: string; hex: string; }
export interface HairColorPreset { id: string; label: string; hex: string; }

export interface HairStyle {
  id: string;
  label: string;
  gltfPath: string;
  gender: Gender | 'both';
  icon: string;
}

export interface OutfitPreset {
  id: string;
  label: string;
  icon: string;
  gender: Gender;
  gltfPath: string;
  thumbnail?: string;
}

export const FACE_SHAPES = [
  { id: 'oval',    label: 'Oval' },
  { id: 'round',   label: 'Round' },
  { id: 'square',  label: 'Square' },
  { id: 'heart',   label: 'Heart' },
  { id: 'diamond', label: 'Diamond' },
];

export const SKIN_PRESETS: SkinPreset[] = [
  { id: 'light',       label: 'Fair',    hex: '#FDDBB4' },
  { id: 'medium_fair', label: 'Light',   hex: '#EFC97E' },
  { id: 'medium',      label: 'Medium',  hex: '#D4905A' },
  { id: 'tan',         label: 'Tan',     hex: '#C17A40' },
  { id: 'brown',       label: 'Brown',   hex: '#8B5E3C' },
  { id: 'dark',        label: 'Dark',    hex: '#4A2C1A' },
];

export const HAIR_COLOR_PRESETS: HairColorPreset[] = [
  { id: 'black',    label: 'Raven',    hex: '#1a1008' },
  { id: 'brown',    label: 'Chestnut', hex: '#5C3317' },
  { id: 'auburn',   label: 'Auburn',   hex: '#922B1E' },
  { id: 'blonde',   label: 'Blonde',   hex: '#D4A847' },
  { id: 'platinum', label: 'Platinum', hex: '#E8DACC' },
  { id: 'white',    label: 'Silver',   hex: '#C8C8C8' },
  { id: 'red',      label: 'Crimson',  hex: '#8B1A1A' },
  { id: 'blue',     label: 'Sapphire', hex: '#1A3A6B' },
  { id: 'teal',     label: 'Teal',     hex: '#1A5F5F' },
  { id: 'purple',   label: 'Violet',   hex: '#4B1A7A' },
];

export const EYE_COLOR_PRESETS = [
  { id: 'brown',  label: 'Brown',  hex: '#5C3D11' },
  { id: 'blue',   label: 'Blue',   hex: '#2E6EAA' },
  { id: 'green',  label: 'Green',  hex: '#2E7D32' },
  { id: 'hazel',  label: 'Hazel',  hex: '#8B6914' },
  { id: 'grey',   label: 'Grey',   hex: '#6B7C8B' },
  { id: 'amber',  label: 'Amber',  hex: '#B85C1A' },
  { id: 'violet', label: 'Violet', hex: '#6B3A8B' },
  { id: 'red',    label: 'Red',    hex: '#8B1A1A' },
];

export const HAIR_STYLES: HairStyle[] = [
  { id: 'none',              label: 'Bald',        gltfPath: '',                                                    gender: 'both',   icon: '🧑' },
  { id: 'Hair_Buzzed',       label: 'Buzzed',      gltfPath: '/models/hairstyles/Hair_Buzzed.gltf',                 gender: 'both',   icon: '✂️' },
  { id: 'Hair_SimpleParted', label: 'Parted',      gltfPath: '/models/hairstyles/Hair_SimpleParted.gltf',           gender: 'both',   icon: '💇' },
  { id: 'Hair_Buns',         label: 'Buns',        gltfPath: '/models/hairstyles/Hair_Buns.gltf',                   gender: 'both',   icon: '🎀' },
  { id: 'Hair_Long',         label: 'Long',        gltfPath: '/models/hairstyles/Hair_Long.gltf',                   gender: 'both',   icon: '💁' },
  { id: 'Hair_BuzzedFemale', label: 'Short Crop',  gltfPath: '/models/hairstyles/Hair_BuzzedFemale.gltf',           gender: 'both',   icon: '💆' },
  { id: 'Hair_Beard',        label: 'Beard',       gltfPath: '/models/hairstyles/Hair_Beard.gltf',                  gender: 'both',   icon: '🧔' },
];

/**
 * Legacy "outfit preset" lists (kept for backward-compat with any UI that still
 * surfaces the Quaternius pack as outfits). Going forward, prefer `BODY_TYPES`
 * — every Quaternius variant is also a body type with built-in starter clothing.
 */
export const FEMALE_OUTFITS: OutfitPreset[] = [
  { id: 'adventurer', label: 'Adventurer', icon: '⚔️',  gender: 'female', gltfPath: '/models/characters/female/adventurer.gltf' },
  { id: 'casual',     label: 'Survivor',   icon: '🧥',  gender: 'female', gltfPath: '/models/characters/female/casual.gltf' },
  { id: 'formal',     label: 'Formal',     icon: '👗',  gender: 'female', gltfPath: '/models/characters/female/formal.gltf' },
  { id: 'medieval',   label: 'Medieval',   icon: '🏰',  gender: 'female', gltfPath: '/models/characters/female/medieval.gltf' },
  { id: 'punk',       label: 'Punk',       icon: '⚡',  gender: 'female', gltfPath: '/models/characters/female/punk.gltf' },
  { id: 'scifi',      label: 'Sci-Fi',     icon: '🚀',  gender: 'female', gltfPath: '/models/characters/female/scifi.gltf' },
  { id: 'soldier',    label: 'Soldier',    icon: '🪖',  gender: 'female', gltfPath: '/models/characters/female/soldier.gltf' },
  { id: 'suit',       label: 'Elite',      icon: '💼',  gender: 'female', gltfPath: '/models/characters/female/suit.gltf' },
  { id: 'witch',      label: 'Witch',      icon: '🔮',  gender: 'female', gltfPath: '/models/characters/female/witch.gltf' },
  { id: 'worker',     label: 'Engineer',   icon: '🔧',  gender: 'female', gltfPath: '/models/characters/female/worker.gltf' },
];

export const MALE_OUTFITS: OutfitPreset[] = [
  { id: 'adventurer',    label: 'Adventurer', icon: '⚔️',  gender: 'male', gltfPath: '/models/characters/male/adventurer.gltf' },
  { id: 'beach',         label: 'Scout',      icon: '🏖️', gender: 'male', gltfPath: '/models/characters/male/beach.gltf' },
  { id: 'casual',        label: 'Survivor',   icon: '🧥',  gender: 'male', gltfPath: '/models/characters/male/casual.gltf' },
  { id: 'casual-hoodie', label: 'Scavenger',  icon: '🪝',  gender: 'male', gltfPath: '/models/characters/male/casual-hoodie.gltf' },
  { id: 'farmer',        label: 'Settler',    icon: '🌾',  gender: 'male', gltfPath: '/models/characters/male/farmer.gltf' },
  { id: 'king',          label: 'Warlord',    icon: '👑',  gender: 'male', gltfPath: '/models/characters/male/king.gltf' },
  { id: 'punk',          label: 'Raider',     icon: '💀',  gender: 'male', gltfPath: '/models/characters/male/punk.gltf' },
  { id: 'spacesuit',     label: 'Vanguard',   icon: '🚀',  gender: 'male', gltfPath: '/models/characters/male/spacesuit.gltf' },
  { id: 'suit',          label: 'Commander',  icon: '🕴️', gender: 'male', gltfPath: '/models/characters/male/suit.gltf' },
  { id: 'swat',          label: 'Enforcer',   icon: '🛡️', gender: 'male', gltfPath: '/models/characters/male/swat.gltf' },
  { id: 'worker',        label: 'Builder',    icon: '🔧',  gender: 'male', gltfPath: '/models/characters/male/worker.gltf' },
];

/**
 * Default mesh per gender — the clothed Quaternius "Ultimate Animated
 * Character" adventurer. Each ships with 24 baked-in clips covering the
 * full locomotion + combat set (Idle / Walk / Run / Run_Left / Run_Right
 * / Roll / Sword_Slash / Punch_* / Death / HitRecieve / Interact / Wave),
 * so the LocomotionAnimator wires up directly with no companion-clip
 * merge. Every body-type id in BODY_TYPES resolves to a clothed Quaternius
 * variant under `/models/characters/<gender>/<id>.gltf` — there is no bare
 * "base" gear canvas in the picker.
 */
export const STARTING_MODEL: Record<Gender, string> = {
  female: '/models/characters/female/adventurer.gltf',
  male:   '/models/characters/male/adventurer.gltf',
};

// ── Modular Gear Variants (Quaternius "Ultimate Modular Men") ────────────────
// Each variant maps to 4 modular FBX parts on R2 under
// /models/gear/male/{slot}/{variant}.fbx. The GearVisualManager loads these
// when gear is equipped and rebinds their skeleton to the player's armature.

export type GearVariant =
  | 'adventurer' | 'beach' | 'casual' | 'casual2' | 'casualhoodie' | 'farmer'
  | 'king' | 'punk' | 'spacesuit' | 'suit' | 'swat' | 'worker'
  | 'formal' | 'medieval' | 'scifi' | 'soldier' | 'witch';

export interface GearVariantPaths {
  head:  string;
  chest: string;
  legs:  string;
  feet:  string;
  back?: string;
}

/** Modular gear paths per variant — both male + female packs are extracted. */
export const GEAR_VARIANTS_MALE: Record<string, GearVariantPaths> = {
  adventurer:  { head: '/models/gear/male/head/adventurer.fbx',  chest: '/models/gear/male/chest/adventurer.fbx',  legs: '/models/gear/male/legs/adventurer.fbx',  feet: '/models/gear/male/feet/adventurer.fbx',  back: '/models/gear/male/back/adventurer.fbx' },
  beach:       { head: '/models/gear/male/head/beach.fbx',       chest: '/models/gear/male/chest/beach.fbx',       legs: '/models/gear/male/legs/beach.fbx',       feet: '/models/gear/male/feet/beach.fbx' },
  casual2:     { head: '/models/gear/male/head/casual2.fbx',     chest: '/models/gear/male/chest/casual2.fbx',     legs: '/models/gear/male/legs/casual2.fbx',     feet: '/models/gear/male/feet/casual2.fbx' },
  casualhoodie:{ head: '/models/gear/male/head/casualhoodie.fbx',chest: '/models/gear/male/chest/casualhoodie.fbx',legs: '/models/gear/male/legs/casualhoodie.fbx',feet: '/models/gear/male/feet/casualhoodie.fbx' },
  farmer:      { head: '/models/gear/male/head/farmer.fbx',      chest: '/models/gear/male/chest/farmer.fbx',      legs: '/models/gear/male/legs/farmer.fbx',      feet: '/models/gear/male/feet/farmer.fbx' },
  king:        { head: '/models/gear/male/head/king.fbx',        chest: '/models/gear/male/chest/king.fbx',        legs: '/models/gear/male/legs/king.fbx',        feet: '/models/gear/male/feet/king.fbx' },
  punk:        { head: '/models/gear/male/head/punk.fbx',        chest: '/models/gear/male/chest/punk.fbx',        legs: '/models/gear/male/legs/punk.fbx',        feet: '/models/gear/male/feet/punk.fbx' },
  spacesuit:   { head: '/models/gear/male/head/spacesuit.fbx',   chest: '/models/gear/male/chest/spacesuit.fbx',   legs: '/models/gear/male/legs/spacesuit.fbx',   feet: '/models/gear/male/feet/spacesuit.fbx' },
  suit:        { head: '/models/gear/male/head/suit.fbx',        chest: '/models/gear/male/chest/suit.fbx',        legs: '/models/gear/male/legs/suit.fbx',        feet: '/models/gear/male/feet/suit.fbx' },
  swat:        { head: '/models/gear/male/head/swat.fbx',        chest: '/models/gear/male/chest/swat.fbx',        legs: '/models/gear/male/legs/swat.fbx',        feet: '/models/gear/male/feet/swat.fbx' },
  worker:      { head: '/models/gear/male/head/worker.fbx',      chest: '/models/gear/male/chest/worker.fbx',      legs: '/models/gear/male/legs/worker.fbx',      feet: '/models/gear/male/feet/worker.fbx' },
};

export const GEAR_VARIANTS_FEMALE: Record<string, GearVariantPaths> = {
  adventurer:  { head: '/models/gear/female/head/adventurer.fbx',  chest: '/models/gear/female/chest/adventurer.fbx',  legs: '/models/gear/female/legs/adventurer.fbx',  feet: '/models/gear/female/feet/adventurer.fbx',  back: '/models/gear/female/back/adventurer.fbx' },
  casual:      { head: '/models/gear/female/head/casual.fbx',      chest: '/models/gear/female/chest/casual.fbx',      legs: '/models/gear/female/legs/casual.fbx',      feet: '/models/gear/female/feet/casual.fbx' },
  formal:      { head: '/models/gear/female/head/formal.fbx',      chest: '/models/gear/female/chest/formal.fbx',      legs: '/models/gear/female/legs/formal.fbx',      feet: '/models/gear/female/feet/formal.fbx' },
  medieval:    { head: '/models/gear/female/head/medieval.fbx',    chest: '/models/gear/female/chest/medieval.fbx',    legs: '/models/gear/female/legs/medieval.fbx',    feet: '/models/gear/female/feet/medieval.fbx' },
  punk:        { head: '/models/gear/female/head/punk.fbx',        chest: '/models/gear/female/chest/punk.fbx',        legs: '/models/gear/female/legs/punk.fbx',        feet: '/models/gear/female/feet/punk.fbx' },
  scifi:       { head: '/models/gear/female/head/scifi.fbx',       chest: '/models/gear/female/chest/scifi.fbx',       legs: '/models/gear/female/legs/scifi.fbx',       feet: '/models/gear/female/feet/scifi.fbx' },
  soldier:     { head: '/models/gear/female/head/soldier.fbx',     chest: '/models/gear/female/chest/soldier.fbx',     legs: '/models/gear/female/legs/soldier.fbx',     feet: '/models/gear/female/feet/soldier.fbx' },
  suit:        { head: '/models/gear/female/head/suit.fbx',        chest: '/models/gear/female/chest/suit.fbx',        legs: '/models/gear/female/legs/suit.fbx',        feet: '/models/gear/female/feet/suit.fbx' },
  witch:       { head: '/models/gear/female/head/witch.fbx',       chest: '/models/gear/female/chest/witch.fbx',       legs: '/models/gear/female/legs/witch.fbx',       feet: '/models/gear/female/feet/witch.fbx' },
  worker:      { head: '/models/gear/female/head/worker.fbx',      chest: '/models/gear/female/chest/worker.fbx',      legs: '/models/gear/female/legs/worker.fbx',      feet: '/models/gear/female/feet/worker.fbx' },
};

/** Legacy single-table alias — points to male variants for backward compat. */
export const GEAR_VARIANTS: Record<string, GearVariantPaths> = GEAR_VARIANTS_MALE;

/** Map item rarity → Quaternius gear variant for auto-resolution. */
export function rarityToGearVariant(rarity: string): GearVariant {
  switch (rarity) {
    case 'common':    return 'casual';
    case 'uncommon':  return 'farmer';
    case 'rare':      return 'adventurer';
    case 'epic':      return 'swat';
    case 'legendary': return 'king';
    default:          return 'casual';
  }
}

/** Look up the gear FBX path for a slot, resolving by gender + variant. */
export function getGearPath(
  variant: GearVariant | string,
  slot: 'head' | 'chest' | 'legs' | 'feet' | 'back',
  gender: Gender = 'male',
): string | null {
  const table = gender === 'female' ? GEAR_VARIANTS_FEMALE : GEAR_VARIANTS_MALE;
  return table[variant]?.[slot] ?? GEAR_VARIANTS_MALE[variant]?.[slot] ?? null;
}

export const DEFAULT_STATS: GrudgeStats = {
  bio: STAT_DEFAULT,
  neu: STAT_DEFAULT,
  kin: STAT_DEFAULT,
  qnt: STAT_DEFAULT,
  syn: STAT_DEFAULT,
  chr: STAT_DEFAULT,
  ent: STAT_DEFAULT,
  gra: STAT_DEFAULT,
};

export interface CharacterConfig {
  name: string;
  gender: Gender;
  bodyProportion: BodyProportionType;
  outfitId: string;
  hairStyleId: string;
  skinColor: string;
  hairColor: string;
  eyeColor: string;
  heightCm: number;
  build: number;
  faceShape: string;
  stats: GrudgeStats;
  backgroundId: string;
  /** Pick-1-of-3 selections from the level-up choice tree. Optional for backward compatibility. */
  perkChoices?: PerkChoices;
}

/**
 * Player selections from the tier-4 (active) and tier-5 (passive) choice rows.
 * Tier-6 upgrades are implicit: when stat >= 6, the chosen tier-4 active is upgraded.
 * Maps stat key → chosen perk id.
 */
export interface PerkChoices {
  /** Tier-4 active skill id chosen for each stat that has reached level 4. */
  tier4: { [K in keyof GrudgeStats]?: string };
  /** Tier-5 passive perk id chosen for each stat that has reached level 5. */
  tier5: { [K in keyof GrudgeStats]?: string };
}

export const DEFAULT_PERK_CHOICES: PerkChoices = {
  tier4: {},
  tier5: {},
};

export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  name: 'Survivor',
  gender: 'female',
  bodyProportion: 'adventurer',
  outfitId: 'none',
  hairStyleId: 'Hair_Long',
  skinColor: '#D4905A',
  hairColor: '#5C3317',
  eyeColor: '#2E6EAA',
  heightCm: 168,
  build: 40,
  faceShape: 'oval',
  stats: { ...DEFAULT_STATS },
  backgroundId: 'street',
  perkChoices: { tier4: {}, tier5: {} },
};

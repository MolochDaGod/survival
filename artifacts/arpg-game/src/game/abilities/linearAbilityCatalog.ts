/**
 * Linear skillshot ability catalog for voxel-era Grudges.
 *
 * Source of truth for *what* each cast is:
 *   https://github.com/MolochDaGod/LinearAbiltyCastingThreeJS
 *   (Frost Lance · Storm Lance · Cinder Fall · Nova Beam · Voltaic Snare)
 *
 * This file is the **production profile** layer — ranges, damage, cast shape,
 * variants — not a fork of the GLSL sandbox. Runtime VFX lives in
 * LinearCastRuntime + AbilitySystem VFX (ice shards, noise spheres, shockwaves).
 *
 * Product era: voxel (docs/PRODUCT_ERA_VOXEL.md).
 */

export type LinearCastShape = 'line' | 'zone' | 'arc';

export type LinearAbilityId =
  | 'frost_lance'
  | 'storm_lance'
  | 'cinder_fall'
  | 'nova_beam'
  | 'voltaic_snare';

/** Visual / mechanical variant within one ability family. */
export type LinearVariantId = string;

export interface LinearAbilityVariant {
  id: LinearVariantId;
  label: string;
  /** Multipliers applied to base profile at cast time. */
  damageMul?: number;
  rangeMul?: number;
  aoeMul?: number;
  speedMul?: number;
  cooldownMul?: number;
  manaMul?: number;
  holdDurationMul?: number;
  zoneRadiusMul?: number;
  /** Optional element tint override (#rrggbb). */
  color?: string;
  /** Short design note. */
  note?: string;
}

export interface LinearAbilityProfile {
  id: LinearAbilityId;
  name: string;
  /** Sandbox key (Q/E/R/F/V) — production rebinds to Digit keys. */
  sandboxKey: string;
  /** Production hotkey digit string for AbilityDef. */
  key: string;
  castShape: LinearCastShape;
  element: 'ice' | 'lightning' | 'fire' | 'arcane' | 'voltaic';
  description: string;
  manaCost: number;
  cooldown: number;
  damage: number;
  /** Max aim reach (m). */
  range: number;
  /** Min aim reach (m); 0 = can cast at feet. */
  minRange: number;
  /** Travel speed of front (m/s); beam uses hold duration instead. */
  speed: number;
  /** Zone radius for far casts (m). */
  zoneRadius?: number;
  /** Arc height for lob casts (m). */
  arcHeight?: number;
  /** Hold time after impact for beams (s). */
  holdDuration?: number;
  color: string;
  icon: string;
  /** Unlocked at start for voxel playtest of skillshot stack. */
  unlocked: boolean;
  variants: LinearAbilityVariant[];
  defaultVariant: LinearVariantId;
}

/**
 * Full LinearAbility set + production variants (element path, intensity, control).
 * Variants are data-only — runtime resolves via `resolveLinearProfile`.
 */
export const LINEAR_ABILITY_PROFILES: LinearAbilityProfile[] = [
  {
    id: 'frost_lance',
    name: 'Frost Lance',
    sandboxKey: 'Q',
    key: '6',
    castShape: 'line',
    element: 'ice',
    description:
      'Fracture front races along a line; ice crystals erupt denser near the caster and blade-tall at impact.',
    manaCost: 28,
    cooldown: 5.5,
    damage: 48,
    range: 14,
    minRange: 2,
    speed: 18,
    color: '#7ecbff',
    icon: '/icons/genetics/Icon11_09.png',
    unlocked: true,
    defaultVariant: 'fracture',
    variants: [
      { id: 'fracture', label: 'Fracture', note: 'Default crystal field' },
      { id: 'glacier', label: 'Glacier Crown', damageMul: 1.15, aoeMul: 1.25, speedMul: 0.85, cooldownMul: 1.1, note: 'Wider, slower wall of ice' },
      { id: 'needle', label: 'Needle Lance', damageMul: 1.3, aoeMul: 0.7, rangeMul: 1.1, speedMul: 1.25, note: 'Narrow high-damage spear' },
      { id: 'rime', label: 'Rime Path', damageMul: 0.85, aoeMul: 1.1, note: 'Ground frost linger; control focus' },
    ],
  },
  {
    id: 'storm_lance',
    name: 'Storm Lance',
    sandboxKey: 'E',
    key: '7',
    castShape: 'line',
    element: 'lightning',
    description:
      'Bolt leaves the hand with lightning filaments, restrikes, scorches the floor, ion shell at impact.',
    manaCost: 32,
    cooldown: 6,
    damage: 55,
    range: 16,
    minRange: 2.5,
    speed: 28,
    color: '#fff176',
    icon: '/icons/cyberpunk-weapons/Icon1_10.png',
    unlocked: true,
    defaultVariant: 'bolt',
    variants: [
      { id: 'bolt', label: 'Bolt', note: 'Default restrike bundle' },
      { id: 'chain', label: 'Chain Arc', damageMul: 0.9, aoeMul: 1.4, note: 'Jumps to nearby targets (AoE proxy)' },
      { id: 'overcharge', label: 'Overcharge', damageMul: 1.35, manaMul: 1.2, cooldownMul: 1.15, note: 'Heavy single-line zap' },
      { id: 'static', label: 'Static Field', damageMul: 0.8, aoeMul: 1.2, speedMul: 0.9, note: 'Wider burn strip' },
    ],
  },
  {
    id: 'cinder_fall',
    name: 'Cinder Fall',
    sandboxKey: 'R',
    key: '8',
    castShape: 'arc',
    element: 'fire',
    description:
      'Burning rock lobbed on an arc; detonates into molten cracks and shattered chunks (pinata debris).',
    manaCost: 36,
    cooldown: 7,
    damage: 70,
    range: 18,
    minRange: 4,
    speed: 14,
    arcHeight: 6,
    zoneRadius: 3.5,
    color: '#ff6a22',
    icon: '/icons/cyberpunk-weapons/Icon1_01.png',
    unlocked: true,
    defaultVariant: 'meteor',
    variants: [
      { id: 'meteor', label: 'Meteor', note: 'Default cinder lob' },
      { id: 'cluster', label: 'Cluster Fall', damageMul: 0.85, aoeMul: 1.35, note: 'Multiple small pinata bursts' },
      { id: 'slag', label: 'Slag Bomb', damageMul: 1.2, aoeMul: 0.9, rangeMul: 0.9, note: 'Heavy impact, smaller crater' },
      { id: 'ember_rain', label: 'Ember Rain', damageMul: 0.7, aoeMul: 1.5, speedMul: 0.85, note: 'Wide burn field' },
    ],
  },
  {
    id: 'nova_beam',
    name: 'Nova Beam',
    sandboxKey: 'F',
    key: '9',
    castShape: 'line',
    element: 'arcane',
    description:
      'Charge orb then hold a white-hot column (core + sheath + coils). Burns the ground while held.',
    manaCost: 45,
    cooldown: 10,
    damage: 40,
    range: 20,
    minRange: 3,
    speed: 40,
    holdDuration: 1.2,
    color: '#e0f7ff',
    icon: '/icons/cyberpunk-artifacts/Icon22_09.png',
    unlocked: true,
    defaultVariant: 'column',
    variants: [
      { id: 'column', label: 'Column', note: 'Default hold beam' },
      { id: 'pierce', label: 'Pierce', damageMul: 1.25, aoeMul: 0.6, rangeMul: 1.15, note: 'Thin high-damage drill' },
      { id: 'flare', label: 'Solar Flare', damageMul: 0.9, aoeMul: 1.3, holdDurationMul: 1.3, note: 'Wider sheath' },
      { id: 'pulse', label: 'Pulse Beam', damageMul: 1.1, cooldownMul: 0.9, note: 'Shorter charge, quicker re-fire' },
    ],
  },
  {
    id: 'voltaic_snare',
    name: 'Voltaic Snare',
    sandboxKey: 'V',
    key: '0',
    castShape: 'zone',
    element: 'voltaic',
    description:
      'Far cast: leash of current lands; ring snaps open then pulls back; violet column + rim arcs.',
    manaCost: 38,
    cooldown: 9,
    damage: 42,
    range: 12,
    minRange: 0,
    speed: 22,
    zoneRadius: 4.5,
    holdDuration: 1.4,
    color: '#b388ff',
    icon: '/icons/cyberpunk-weapons/Icon1_21.png',
    unlocked: true,
    defaultVariant: 'snare',
    variants: [
      { id: 'snare', label: 'Snare', note: 'Default zone trap' },
      { id: 'root', label: 'Root Snare', damageMul: 0.75, aoeMul: 1.15, holdDurationMul: 1.4, note: 'Longer hold, control' },
      { id: 'cage', label: 'Thunder Cage', damageMul: 1.15, aoeMul: 1.1, manaMul: 1.15, note: 'Denser pillar' },
      { id: 'pulse_ring', label: 'Pulse Ring', damageMul: 1.0, aoeMul: 1.3, zoneRadiusMul: 1.2, note: 'Larger footprint' },
    ],
  },
];

/** Optional variant fields that are not on the base multiplier interface. */
export type ResolvedLinearProfile = LinearAbilityProfile & {
  variantId: LinearVariantId;
  variantLabel: string;
  effectiveZoneRadius: number;
  effectiveHold: number;
  effectiveArc: number;
  /** Effective impact AoE radius (m) after variant aoeMul. */
  effectiveAoe: number;
};

export function getLinearProfile(id: string): LinearAbilityProfile | undefined {
  return LINEAR_ABILITY_PROFILES.find((p) => p.id === id);
}

export function isLinearAbilityId(id: string): id is LinearAbilityId {
  return LINEAR_ABILITY_PROFILES.some((p) => p.id === id);
}

export function listLinearAbilityIds(): LinearAbilityId[] {
  return LINEAR_ABILITY_PROFILES.map((p) => p.id);
}

/**
 * Resolve base profile × variant multipliers into combat numbers.
 */
export function resolveLinearProfile(
  id: LinearAbilityId | string,
  variantId?: LinearVariantId,
): ResolvedLinearProfile | null {
  const base = getLinearProfile(id);
  if (!base) return null;
  const vid = variantId ?? base.defaultVariant;
  const v = base.variants.find((x) => x.id === vid) ?? base.variants[0];
  const dmg = base.damage * (v.damageMul ?? 1);
  const range = base.range * (v.rangeMul ?? 1);
  const zone = (base.zoneRadius ?? 2.5) * (v.aoeMul ?? 1) * (v.zoneRadiusMul ?? 1);
  const hold = (base.holdDuration ?? 0) * (v.holdDurationMul ?? 1);
  const speed = base.speed * (v.speedMul ?? 1);
  const cd = base.cooldown * (v.cooldownMul ?? 1);
  const mana = Math.round(base.manaCost * (v.manaMul ?? 1));
  const arc = (base.arcHeight ?? 4) * (v.aoeMul ?? 1);

  const baseAoe =
    base.castShape === 'zone' || base.castShape === 'arc' ? (base.zoneRadius ?? 2.5) : 2.2;
  return {
    ...base,
    damage: dmg,
    range,
    speed,
    cooldown: cd,
    manaCost: mana,
    color: v.color ?? base.color,
    variantId: v.id,
    variantLabel: v.label,
    effectiveZoneRadius: zone,
    effectiveHold: hold,
    effectiveArc: arc,
    effectiveAoe: baseAoe * (v.aoeMul ?? 1) * (v.zoneRadiusMul ?? 1),
  };
}

/** AbilityDef rows for AbilitySystem / hotbar (from LINEAR profiles). */
export function linearProfilesAsAbilityDefs() {
  return LINEAR_ABILITY_PROFILES.map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    description: p.description,
    manaCost: p.manaCost,
    cooldown: p.cooldown,
    damage: p.damage,
    unlocked: p.unlocked,
    key: p.key,
    color: p.color,
  }));
}

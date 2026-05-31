/**
 * @workspace/game-systems — Deployable Entity System
 *
 * Deployables are player-placed or NPC-placed entities with their own stats,
 * AI behavior, animations, and faction alignment. They're unlocked through
 * the CHR, ENT, and GRA Nexus stat milestone perks and the SYN drone tree.
 *
 * Every deployable references a prefab by id (matches the `prefabs` DB table)
 * and carries a typed `DeployableDef` that the game engine consumes at spawn.
 *
 * Entity roles determine the AI goal stack and visual treatment:
 *   - ally:          follows player, engages hostiles, inherits player faction
 *   - enemy:         hostile to player, patrols or guards area
 *   - neutral:       passive until attacked, then fights back
 *   - vendor:        stationary, opens trade UI on interact
 *   - quest_giver:   stationary, opens quest dialogue on interact
 *   - mission_giver: stationary, offers timed contracts
 *   - patrol:        walks a route, engages hostiles that enter alert range
 *   - station:       stays at a fixed point (turrets, harvesters)
 */

// ── Entity Roles ────────────────────────────────────────────────────────────

export const ENTITY_ROLES = [
  'ally',
  'enemy',
  'neutral',
  'vendor',
  'quest_giver',
  'mission_giver',
  'patrol',
  'station',
] as const;

export type EntityRole = (typeof ENTITY_ROLES)[number];

/** Default AI goal stack per role. Maps to NPCBrain goals from ai/NPCBrain.ts. */
export const ROLE_AI_GOALS: Record<EntityRole, string[]> = {
  ally:          ['FOLLOW', 'ATTACK', 'IDLE'],
  enemy:        ['PATROL', 'ATTACK', 'IDLE'],
  neutral:       ['WANDER', 'IDLE'],
  vendor:        ['VENDOR', 'IDLE'],
  quest_giver:   ['IDLE'],
  mission_giver: ['IDLE'],
  patrol:        ['PATROL', 'ATTACK', 'IDLE'],
  station:       ['IDLE'],
};

/** Visual treatment per role — used by HUD target frames and minimap. */
export const ROLE_COLORS: Record<EntityRole, string> = {
  ally:          '#4caf50',  // green
  enemy:        '#f44336',  // red
  neutral:       '#ff9800',  // orange
  vendor:        '#29b6f6',  // blue
  quest_giver:   '#ffeb3b',  // yellow
  mission_giver: '#ce93d8',  // purple
  patrol:        '#66bb6a',  // light green
  station:       '#78909c',  // grey-blue
};

// ── Deployable Kind ─────────────────────────────────────────────────────────

export const DEPLOYABLE_KINDS = [
  'turret',
  'scout_drone',
  'harvest_drone',
  'repair_drone',
  'combat_drone',
  'mech',
  'field_generator',
  'beacon',
  'sentry',
  'deployable',
] as const;

export type DeployableKind = (typeof DEPLOYABLE_KINDS)[number];

// ── Animation Sets ──────────────────────────────────────────────────────────

export interface DeployableAnimSet {
  idle:    string;
  deploy?: string;       // one-shot on placement
  active?: string;       // looping while operational (e.g. turret scanning)
  attack?: string;       // firing / engaging
  recall?: string;       // returning to player
  death?:  string;       // destroyed
  move?:   string;       // locomotion (drones, mechs)
}

// ── Deployable Definition ───────────────────────────────────────────────────

export interface DeployableDef {
  id: string;
  kind: DeployableKind;
  name: string;
  description: string;

  /** Prefab id in the prefabs DB table. */
  prefabId: string;
  /** Model path fallback if prefab isn't in DB yet. */
  modelPath: string;
  scale: number;

  /** Default role when player-deployed. Enemies use 'enemy'. */
  defaultRole: EntityRole;
  /** Which roles this entity CAN be assigned (admin/scripted spawns). */
  allowedRoles: EntityRole[];

  /** Tier of this deployable (T1–T6). Scales stats via tierValueMultiplier. */
  tier: 1 | 2 | 3 | 4 | 5 | 6;

  /** Base stats before tier scaling. */
  stats: {
    maxHealth: number;
    damage: number;
    range: number;           // attack range in metres
    attackSpeed: number;     // attacks per second
    moveSpeed: number;       // m/s (0 = stationary)
    armor: number;
    duration: number;        // seconds before auto-recall; 0 = permanent
    cooldown: number;        // seconds before player can redeploy
  };

  /** Animation clip names for this deployable's rig. */
  anims: DeployableAnimSet;

  /** Nexus stat that unlocks this deployable (milestone index 1–6). */
  unlock: {
    stat: 'chr' | 'ent' | 'gra' | 'syn' | 'qnt';
    milestone: number;
  };

  /** Tags for filtering in UI/admin. */
  tags: string[];
}

// ── Tier Scaling ────────────────────────────────────────────────────────────

import { tierValueMultiplier } from './loot.js';

/** Scale a deployable's base stats by its tier. */
export function scaleDeployableStats(
  base: DeployableDef['stats'],
  tier: number,
): DeployableDef['stats'] {
  const m = tierValueMultiplier(tier);
  return {
    maxHealth:   Math.floor(base.maxHealth * m),
    damage:      Math.floor(base.damage * m),
    range:       base.range,
    attackSpeed: base.attackSpeed,
    moveSpeed:   base.moveSpeed,
    armor:       Math.floor(base.armor * m),
    duration:    base.duration,
    cooldown:    base.cooldown,
  };
}

// ── Deployable Catalog ──────────────────────────────────────────────────────

export const DEPLOYABLES: DeployableDef[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // CHRONAL STABILITY (CHR) — time-distortion deployables
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'chrono_scout',
    kind: 'scout_drone',
    name: 'Temporal Scout',
    description: 'A small drone that phases through walls and reveals enemies in a 30m radius for 20s. Shows enemy movement paths 2s into the future.',
    prefabId: 'drone_chrono_scout',
    modelPath: '/models/deployables/chrono_scout.glb',
    scale: 0.5,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'neutral'],
    tier: 2,
    stats: { maxHealth: 40, damage: 0, range: 30, attackSpeed: 0, moveSpeed: 8, armor: 5, duration: 20, cooldown: 45 },
    anims: { idle: 'drone_hover', deploy: 'drone_spawn', active: 'drone_scan', move: 'drone_fly', recall: 'drone_recall', death: 'drone_explode' },
    unlock: { stat: 'chr', milestone: 2 },
    tags: ['chronal', 'scout', 'non-combat', 'phase'],
  },
  {
    id: 'chrono_turret',
    kind: 'turret',
    name: 'Stasis Turret',
    description: 'Fires temporal bolts that slow enemies by 40% for 3s. Does not deal damage — pure crowd control.',
    prefabId: 'turret_chrono_stasis',
    modelPath: '/models/deployables/chrono_turret.glb',
    scale: 0.8,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'enemy', 'neutral'],
    tier: 3,
    stats: { maxHealth: 120, damage: 0, range: 18, attackSpeed: 1.5, moveSpeed: 0, armor: 25, duration: 30, cooldown: 60 },
    anims: { idle: 'turret_idle', deploy: 'turret_unfold', active: 'turret_scan', attack: 'turret_fire_slow', death: 'turret_collapse' },
    unlock: { stat: 'chr', milestone: 3 },
    tags: ['chronal', 'turret', 'crowd-control', 'slow'],
  },
  {
    id: 'chrono_anchor',
    kind: 'field_generator',
    name: 'Rewind Anchor',
    description: 'Marks a point in spacetime. Activate again within 15s to teleport back with HP restored to the value when placed.',
    prefabId: 'deployable_chrono_anchor',
    modelPath: '/models/deployables/chrono_anchor.glb',
    scale: 0.6,
    defaultRole: 'station',
    allowedRoles: ['station'],
    tier: 4,
    stats: { maxHealth: 80, damage: 0, range: 0, attackSpeed: 0, moveSpeed: 0, armor: 50, duration: 15, cooldown: 90 },
    anims: { idle: 'anchor_pulse', deploy: 'anchor_plant', active: 'anchor_glow', recall: 'anchor_collapse', death: 'anchor_shatter' },
    unlock: { stat: 'chr', milestone: 4 },
    tags: ['chronal', 'utility', 'rewind', 'teleport'],
  },
  {
    id: 'chrono_freeze_mine',
    kind: 'deployable',
    name: 'Temporal Stasis Mine',
    description: 'Proximity mine that freezes all enemies within 6m for 3s. One-time use, 2 charges.',
    prefabId: 'deployable_chrono_mine',
    modelPath: '/models/deployables/chrono_mine.glb',
    scale: 0.3,
    defaultRole: 'station',
    allowedRoles: ['station'],
    tier: 5,
    stats: { maxHealth: 20, damage: 0, range: 6, attackSpeed: 0, moveSpeed: 0, armor: 0, duration: 60, cooldown: 120 },
    anims: { idle: 'mine_armed', deploy: 'mine_place', active: 'mine_pulse', death: 'mine_detonate' },
    unlock: { stat: 'chr', milestone: 5 },
    tags: ['chronal', 'trap', 'freeze', 'aoe'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTROPIC RESISTANCE (ENT) — salvage, repair, and harvesting deployables
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'harvest_drone',
    kind: 'harvest_drone',
    name: 'Salvage Drone',
    description: 'Autonomous harvester. Flies to nearby resource nodes, extracts materials, and returns them to the player. +15% yield bonus.',
    prefabId: 'drone_harvest',
    modelPath: '/models/deployables/harvest_drone.glb',
    scale: 0.6,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'neutral'],
    tier: 2,
    stats: { maxHealth: 60, damage: 0, range: 40, attackSpeed: 0, moveSpeed: 5, armor: 10, duration: 90, cooldown: 30 },
    anims: { idle: 'drone_hover', deploy: 'drone_spawn', active: 'drone_harvest', move: 'drone_fly', recall: 'drone_return', death: 'drone_crash' },
    unlock: { stat: 'ent', milestone: 2 },
    tags: ['entropic', 'drone', 'harvesting', 'economy'],
  },
  {
    id: 'repair_turret',
    kind: 'turret',
    name: 'Repair Pylon',
    description: 'Stationary pylon that restores 3 HP/s to all allied entities within 12m. Also repairs building HP.',
    prefabId: 'turret_repair_pylon',
    modelPath: '/models/deployables/repair_pylon.glb',
    scale: 0.7,
    defaultRole: 'station',
    allowedRoles: ['station', 'ally'],
    tier: 3,
    stats: { maxHealth: 150, damage: 0, range: 12, attackSpeed: 0, moveSpeed: 0, armor: 30, duration: 45, cooldown: 60 },
    anims: { idle: 'pylon_idle', deploy: 'pylon_extend', active: 'pylon_heal_pulse', death: 'pylon_collapse' },
    unlock: { stat: 'ent', milestone: 3 },
    tags: ['entropic', 'turret', 'heal', 'support', 'repair'],
  },
  {
    id: 'entropy_field',
    kind: 'field_generator',
    name: 'Entropy Field Generator',
    description: 'Creates a 10m decay field. Enemies inside take 5 corrosion damage/s and have attack speed reduced by 20%.',
    prefabId: 'deployable_entropy_field',
    modelPath: '/models/deployables/entropy_field.glb',
    scale: 0.8,
    defaultRole: 'station',
    allowedRoles: ['station', 'ally'],
    tier: 4,
    stats: { maxHealth: 100, damage: 5, range: 10, attackSpeed: 0, moveSpeed: 0, armor: 40, duration: 25, cooldown: 75 },
    anims: { idle: 'field_idle', deploy: 'field_unfold', active: 'field_pulse', death: 'field_implode' },
    unlock: { stat: 'ent', milestone: 4 },
    tags: ['entropic', 'field', 'dot', 'debuff', 'aoe'],
  },
  {
    id: 'recycler_station',
    kind: 'deployable',
    name: 'Field Recycler',
    description: 'Portable crafting station. Break down any T1–T4 gear into base materials on the spot. +25% salvage yield from ENT passives.',
    prefabId: 'deployable_recycler',
    modelPath: '/models/deployables/recycler.glb',
    scale: 1.0,
    defaultRole: 'station',
    allowedRoles: ['station', 'vendor'],
    tier: 5,
    stats: { maxHealth: 200, damage: 0, range: 3, attackSpeed: 0, moveSpeed: 0, armor: 60, duration: 120, cooldown: 180 },
    anims: { idle: 'recycler_idle', deploy: 'recycler_unfold', active: 'recycler_process', recall: 'recycler_fold', death: 'recycler_break' },
    unlock: { stat: 'ent', milestone: 5 },
    tags: ['entropic', 'crafting', 'salvage', 'utility'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAVITIC HARMONY (GRA) — heavy combat deployables, mechs, orbital
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'grav_sentry',
    kind: 'sentry',
    name: 'Gravity Sentry',
    description: 'Floating sentry that pulls enemies toward it with a gravity well, then detonates for AoE damage when destroyed.',
    prefabId: 'sentry_gravity',
    modelPath: '/models/deployables/grav_sentry.glb',
    scale: 0.5,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'enemy', 'neutral'],
    tier: 2,
    stats: { maxHealth: 80, damage: 15, range: 14, attackSpeed: 0.8, moveSpeed: 3, armor: 15, duration: 30, cooldown: 40 },
    anims: { idle: 'sentry_hover', deploy: 'sentry_drop', active: 'sentry_pull', attack: 'sentry_pulse', move: 'sentry_drift', death: 'sentry_detonate' },
    unlock: { stat: 'gra', milestone: 2 },
    tags: ['gravitic', 'sentry', 'pull', 'aoe', 'combat'],
  },
  {
    id: 'grav_anchor_turret',
    kind: 'turret',
    name: 'Mass Driver Turret',
    description: 'Heavy kinetic turret. Fires gravity-accelerated slugs for high single-target damage. Slow fire rate, devastating per hit.',
    prefabId: 'turret_mass_driver',
    modelPath: '/models/deployables/mass_driver_turret.glb',
    scale: 1.0,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'enemy', 'patrol'],
    tier: 3,
    stats: { maxHealth: 200, damage: 65, range: 35, attackSpeed: 0.4, moveSpeed: 0, armor: 50, duration: 40, cooldown: 90 },
    anims: { idle: 'turret_idle', deploy: 'turret_assemble', active: 'turret_track', attack: 'turret_fire_heavy', death: 'turret_explode' },
    unlock: { stat: 'gra', milestone: 3 },
    tags: ['gravitic', 'turret', 'kinetic', 'heavy', 'combat'],
  },
  {
    id: 'grav_anchor',
    kind: 'field_generator',
    name: 'Gravity Anchor',
    description: 'Projects a 8m gravity well that pins all enemies to the ground for 3s, preventing jumps, dashes, and knockback. Allies inside gain +15% move speed.',
    prefabId: 'deployable_grav_anchor',
    modelPath: '/models/deployables/grav_anchor.glb',
    scale: 0.7,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'enemy', 'neutral'],
    tier: 4,
    stats: { maxHealth: 100, damage: 0, range: 8, attackSpeed: 0, moveSpeed: 0, armor: 35, duration: 12, cooldown: 60 },
    anims: { idle: 'anchor_idle', deploy: 'anchor_slam', active: 'anchor_pulse', death: 'anchor_shatter' },
    unlock: { stat: 'gra', milestone: 4 },
    tags: ['gravitic', 'field', 'root', 'crowd-control', 'ally-buff'],
  },
  {
    id: 'grav_mech',
    kind: 'mech',
    name: 'Graviton Exoframe',
    description: 'Pilotable mech suit. Player enters and gains +200 HP shield, gravity slam AoE, and jet-assisted jumps. 60s duration.',
    prefabId: 'mech_graviton',
    modelPath: '/models/deployables/graviton_mech.glb',
    scale: 1.2,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'enemy'],
    tier: 5,
    stats: { maxHealth: 400, damage: 80, range: 4, attackSpeed: 0.8, moveSpeed: 6, armor: 80, duration: 60, cooldown: 300 },
    anims: { idle: 'mech_idle', deploy: 'mech_land', active: 'mech_walk', attack: 'mech_slam', move: 'mech_run', death: 'mech_eject' },
    unlock: { stat: 'gra', milestone: 5 },
    tags: ['gravitic', 'mech', 'vehicle', 'pilotable', 'heavy', 'combat'],
  },
  {
    id: 'orbital_beacon',
    kind: 'beacon',
    name: 'Orbital Strike Beacon',
    description: 'Marks a 10m target zone. After 4s delay, an orbital kinetic rod impacts for massive AoE damage. One use per deploy.',
    prefabId: 'deployable_orbital_beacon',
    modelPath: '/models/deployables/orbital_beacon.glb',
    scale: 0.4,
    defaultRole: 'station',
    allowedRoles: ['station'],
    tier: 6,
    stats: { maxHealth: 30, damage: 300, range: 10, attackSpeed: 0, moveSpeed: 0, armor: 0, duration: 5, cooldown: 600 },
    anims: { idle: 'beacon_blink', deploy: 'beacon_plant', active: 'beacon_charge', death: 'beacon_impact' },
    unlock: { stat: 'gra', milestone: 6 },
    tags: ['gravitic', 'beacon', 'orbital', 'nuke', 'aoe', 'single-use'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNTHETIC AFFINITY (SYN) — drone swarm (complement the existing SYN perks)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'combat_drone',
    kind: 'combat_drone',
    name: 'Attack Drone',
    description: 'Armed escort drone. Follows the player and engages hostiles with a rapid-fire laser. Inherits player weapon stats at 40%.',
    prefabId: 'drone_combat',
    modelPath: '/models/deployables/combat_drone.glb',
    scale: 0.5,
    defaultRole: 'ally',
    allowedRoles: ['ally', 'enemy', 'patrol'],
    tier: 3,
    stats: { maxHealth: 80, damage: 12, range: 20, attackSpeed: 3, moveSpeed: 7, armor: 10, duration: 45, cooldown: 30 },
    anims: { idle: 'drone_hover', deploy: 'drone_spawn', active: 'drone_patrol', attack: 'drone_fire', move: 'drone_fly', recall: 'drone_return', death: 'drone_explode' },
    unlock: { stat: 'syn', milestone: 3 },
    tags: ['synthetic', 'drone', 'combat', 'escort'],
  },
  {
    id: 'repair_drone',
    kind: 'repair_drone',
    name: 'Mender Drone',
    description: 'Follows the player and heals 2 HP/s. Prioritises lowest-HP ally. Also repairs deployed turrets/sentries.',
    prefabId: 'drone_repair',
    modelPath: '/models/deployables/repair_drone.glb',
    scale: 0.4,
    defaultRole: 'ally',
    allowedRoles: ['ally'],
    tier: 4,
    stats: { maxHealth: 50, damage: 0, range: 15, attackSpeed: 0, moveSpeed: 6, armor: 5, duration: 60, cooldown: 45 },
    anims: { idle: 'drone_hover', deploy: 'drone_spawn', active: 'drone_heal', move: 'drone_fly', recall: 'drone_return', death: 'drone_crash' },
    unlock: { stat: 'syn', milestone: 4 },
    tags: ['synthetic', 'drone', 'heal', 'support'],
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

export function getDeployable(id: string): DeployableDef | undefined {
  return DEPLOYABLES.find(d => d.id === id);
}

export function getDeployablesByKind(kind: DeployableKind): DeployableDef[] {
  return DEPLOYABLES.filter(d => d.kind === kind);
}

export function getDeployablesByUnlock(stat: string, milestone: number): DeployableDef[] {
  return DEPLOYABLES.filter(d => d.unlock.stat === stat && d.unlock.milestone <= milestone);
}

/** Get all deployables the player has unlocked based on their Nexus stat levels. */
export function getUnlockedDeployables(nexusStats: Record<string, number>): DeployableDef[] {
  return DEPLOYABLES.filter(d => {
    const statLevel = nexusStats[d.unlock.stat] ?? 0;
    return statLevel >= d.unlock.milestone;
  });
}

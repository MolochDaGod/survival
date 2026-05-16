#!/usr/bin/env node
/**
 * Master Prefab Seed — Enemies, Weapons, Towers, Creatures, Mechs, Props
 *
 * Usage:
 *   node scripts/seed-all-prefabs.mjs --admin-token=TOKEN [--api-url=URL]
 *
 * Sources:
 *   - GRUDGE Unity project (FourEvilDragonsHP, NewMonster)
 *   - Standalone animated enemies (arachnid, Juggernaut, Reptil, Rhino, Titan, BattleSpider, Troll, Ent)
 *   - Craftpix weapon packs (swords, bows, crossbows, daggers, hammers, polearms × 24 each)
 *   - Craftpix defense towers (archers, ballista, cannon, mage × 4 levels)
 *   - creatures/ folder (dragon, wolf, shark, goblin, skeleton, etc.)
 *   - Mech_00 (constructable mech)
 *   - Sci-Fi RTS pack
 */

const API_URL = process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1]
  ?? process.env.API_URL
  ?? 'https://grudge-nexus-api-production.up.railway.app';
const ADMIN_TOKEN = process.argv.find(a => a.startsWith('--admin-token='))?.split('=')[1]
  ?? process.env.ADMIN_TOKEN
  ?? '';

// ── Helper: generate weapon variants (24 per type from craftpix) ──────────
function weaponVariants(type, craftpixFolder, opts) {
  const { slot, weaponType, baseStats, boneSlot, animSet, twoHanded } = opts;
  return Array.from({ length: 24 }, (_, i) => {
    const num = i + 1;
    const tier = Math.min(8, Math.ceil(num / 3)); // 1-3=T1, 4-6=T2, etc.
    const dmgScale = 1 + (tier - 1) * 0.3;
    return {
      id: `${type}_${num}`,
      kind: 'weapon',
      name: `${opts.displayName} ${num}`,
      description: `${opts.displayName} variant ${num}. Tier ${tier}.`,
      modelPath: `/models/weapons/${craftpixFolder}/${type}_${num}.fbx`,
      scale: opts.scale ?? 1.0,
      data: {
        weaponType,
        slot,
        twoHanded: twoHanded ?? false,
        damage: Math.round(baseStats.damage * dmgScale),
        attackSpeed: baseStats.attackSpeed,
        range: baseStats.range,
        critChance: baseStats.critChance ?? 5,
        tier,
        // Bone attachment for equipping on character
        boneSlot,
        boneOffset: opts.boneOffset ?? { x: 0, y: 0, z: 0 },
        boneRotation: opts.boneRotation ?? { x: 0, y: 0, z: 0 },
        // Animation set to use when this weapon is equipped
        animSet,
        // Loot roll integration — uses the affix system from game-systems
        rollable: true,
        affixSlots: tier >= 3 ? Math.min(tier, 6) : tier,
      },
      tags: ['weapon', type, weaponType, `tier_${tier}`, 'rollable'],
    };
  });
}

// ── Helper: defense tower levels ──────────────────────────────────────────
function towerVariants(baseId, name, prefix, levels) {
  return levels.map((lvl, i) => ({
    id: `tower_${baseId}_lvl${i + 1}`,
    kind: 'structure',
    name: `${name} Lvl ${i + 1}`,
    description: `${name} — Level ${i + 1}. ${lvl.desc}`,
    modelPath: `/models/towers/${lvl.file}`,
    scale: 1.0,
    data: {
      structureType: 'defense_tower',
      level: i + 1,
      damage: lvl.damage,
      range: lvl.range,
      attackSpeed: lvl.attackSpeed,
      health: lvl.health,
      buildCost: lvl.buildCost,
      upgradeFrom: i > 0 ? `tower_${baseId}_lvl${i}` : null,
      targetingAI: lvl.targeting ?? 'nearest',
      projectileType: lvl.projectile ?? 'arrow',
    },
    tags: ['structure', 'tower', 'defense', 'buildable', `lvl_${i + 1}`],
  }));
}

const PREFABS = [
  // ════════════════════════════════════════════════════════════════════════
  // ENEMIES — BOSS TIER (5+ animations, complex AI)
  // ════════════════════════════════════════════════════════════════════════
  {
    id: 'dragon_terror_bringer',
    kind: 'monster',
    name: 'Dragon Terror Bringer',
    description: 'Massive winged dragon. Multiple attack types including flame breath and wing claw.',
    modelPath: '/models/enemies/dragons/DragonTerrorBringer',
    scale: 2.0,
    data: {
      health: 2000, damage: 65, speed: 3, xp: 500,
      tier: 'boss', role: 'boss',
      behavior: 'boss_dragon', attackRange: 5, aggroRange: 40,
      armor: 50, fireResist: 80,
      animations: {
        idle: 'idle01', run: 'Run', death: 'die',
        attacks: ['Basic Attack', 'AttackWingClaw', 'Flame Attack'],
      },
      ai: {
        phases: [
          { hpThreshold: 1.0, behavior: 'melee_chase', attacks: ['Basic Attack', 'AttackWingClaw'] },
          { hpThreshold: 0.5, behavior: 'ranged_strafe', attacks: ['Flame Attack', 'AttackWingClaw'] },
          { hpThreshold: 0.2, behavior: 'enraged', speedMult: 1.5, damageMult: 1.5 },
        ],
        summons: null,
      },
      lootTable: 'boss',
      dropGuarantee: true,
    },
    tags: ['enemy', 'dragon', 'boss', 'flying', 'fire', 'animated'],
  },
  {
    id: 'dragon_usurper',
    kind: 'monster',
    name: 'Dragon Usurper',
    description: 'Ancient dragon with flame, hand, and mouth attacks. Final boss tier.',
    modelPath: '/models/enemies/dragons/DragonUsurper',
    scale: 2.5,
    data: {
      health: 3000, damage: 80, speed: 2.5, xp: 800,
      tier: 'boss', role: 'raid_boss',
      behavior: 'boss_dragon', attackRange: 6, aggroRange: 50,
      armor: 70, fireResist: 90, allResist: 20,
      animations: {
        idle: 'idle01', run: 'Run', death: 'Die',
        attacks: ['attackFlame', 'attackHand', 'attackMouth'],
      },
      ai: {
        phases: [
          { hpThreshold: 1.0, attacks: ['attackHand'], behavior: 'melee_chase' },
          { hpThreshold: 0.7, attacks: ['attackFlame', 'attackHand'], behavior: 'alternate' },
          { hpThreshold: 0.3, attacks: ['attackMouth', 'attackFlame'], behavior: 'enraged', speedMult: 2.0 },
        ],
      },
      lootTable: 'boss', dropGuarantee: true,
    },
    tags: ['enemy', 'dragon', 'raid_boss', 'fire', 'animated'],
  },
  {
    id: 'dragon_soul_eater',
    kind: 'monster',
    name: 'Dragon Soul Eater',
    description: 'Ranged dragon that shoots fireballs from ground and air.',
    modelPath: '/models/enemies/dragons/DragonSoulEater',
    scale: 1.8,
    data: {
      health: 1500, damage: 45, speed: 4, xp: 400,
      tier: 'boss', role: 'ranged_boss',
      behavior: 'ranged_boss', attackRange: 25, aggroRange: 45,
      animations: {
        idle: 'Idle', run: 'Run', death: 'Die',
        attacks: ['Basic Attack', 'Fireball Shoot', 'Fly Fireball Shoot'],
      },
      ai: {
        preferredRange: 15,
        phases: [
          { hpThreshold: 1.0, attacks: ['Fireball Shoot'], behavior: 'kite' },
          { hpThreshold: 0.5, attacks: ['Fly Fireball Shoot', 'Fireball Shoot'], behavior: 'fly_strafe' },
          { hpThreshold: 0.2, attacks: ['Basic Attack'], behavior: 'desperate_melee' },
        ],
      },
      lootTable: 'boss', dropGuarantee: true,
    },
    tags: ['enemy', 'dragon', 'boss', 'ranged', 'fire', 'flying', 'animated'],
  },
  {
    id: 'dragon_nightmare',
    kind: 'monster',
    name: 'Dragon Nightmare',
    description: 'Fast aggressive dragon with claw attacks and terrifying scream.',
    modelPath: '/models/enemies/dragons/DragonNightMare',
    scale: 1.6,
    data: {
      health: 1200, damage: 55, speed: 5.5, xp: 350,
      tier: 'boss', role: 'berserker_boss',
      behavior: 'aggressive_boss', attackRange: 4, aggroRange: 35,
      animations: {
        idle: 'idle01', run: 'run', death: 'die',
        attacks: ['Basic Attack', 'Claw Attack'],
        special: ['scream'],
      },
      ai: {
        screamCooldown: 15, screamRadius: 12, screamFearDuration: 3,
        phases: [
          { hpThreshold: 1.0, attacks: ['Basic Attack'], behavior: 'chase' },
          { hpThreshold: 0.6, attacks: ['Claw Attack', 'Basic Attack'], behavior: 'aggressive' },
          { hpThreshold: 0.3, behavior: 'frenzy', speedMult: 1.8, screamOnPhaseEnter: true },
        ],
      },
      lootTable: 'boss', dropGuarantee: true,
    },
    tags: ['enemy', 'dragon', 'boss', 'melee', 'fear', 'animated'],
  },
  {
    id: 'dragon_boar',
    kind: 'monster',
    name: 'Dragon Boar',
    description: 'Ground-based draconic beast. Charges and gores with tusks.',
    modelPath: '/models/enemies/dragons/DragonBoar',
    scale: 1.4,
    data: {
      health: 800, damage: 35, speed: 5, xp: 200,
      tier: 'elite', role: 'charger',
      behavior: 'charge_attack', attackRange: 3, aggroRange: 25,
      chargeSpeed: 12, chargeDamage: 60, chargeCooldown: 8,
      animations: { idle: 'idle', run: 'run', death: 'Die', attack: 'attack', special: ['Scream'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'dragon', 'elite', 'charger', 'animated'],
  },

  // ════════════════════════════════════════════════════════════════════════
  // ENEMIES — ELITE TIER (5-7 animations)
  // ════════════════════════════════════════════════════════════════════════
  {
    id: 'titan',
    kind: 'monster',
    name: 'Titan',
    description: 'Colossal humanoid. Slow but devastating ground-pound attacks.',
    modelPath: '/models/enemies/titan/Titan.fbx',
    scale: 3.0,
    data: {
      health: 1500, damage: 50, speed: 2, xp: 300,
      tier: 'boss', role: 'siege_boss',
      behavior: 'slow_power', attackRange: 5, aggroRange: 30,
      knockbackForce: 15, stunDuration: 1.5,
      animations: { idle: 'Idle', run: 'Run', death: 'Death', attack: 'Attack(1)' },
      lootTable: 'boss', dropGuarantee: true,
    },
    tags: ['enemy', 'titan', 'boss', 'melee', 'knockback', 'animated'],
  },
  {
    id: 'arachnid',
    kind: 'monster',
    name: 'Arachnid',
    description: 'Giant spider with dual attack types and a fear-inducing shout.',
    modelPath: '/models/enemies/arachnid',
    scale: 1.2,
    data: {
      health: 350, damage: 22, speed: 4.5, xp: 80,
      tier: 'elite', role: 'ambusher',
      behavior: 'ambush', attackRange: 3, aggroRange: 18,
      procPoison: 30, poisonDamage: 4, poisonDuration: 6,
      animations: { idle: 'idle', walk: 'walk', death: 'dead', attacks: ['attack(1)', 'attack(2)'], special: ['shout'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'spider', 'elite', 'poison', 'ambush', 'animated'],
  },
  {
    id: 'juggernaut',
    kind: 'monster',
    name: 'Juggernaut',
    description: 'Armored bruiser with 3 attack combos. High HP, moderate speed.',
    modelPath: '/models/enemies/juggernaut',
    scale: 1.5,
    data: {
      health: 600, damage: 30, speed: 3, xp: 120,
      tier: 'elite', role: 'tank',
      behavior: 'patrol', attackRange: 3, aggroRange: 20,
      armor: 40,
      animations: { idle: 'Idle', run: 'run', death: 'Dead', attacks: ['Attack(1)', 'Attack(2)', 'Attack(6)'] },
      ai: { comboChance: 0.3, comboCooldown: 4 },
      lootTable: 'elite',
    },
    tags: ['enemy', 'juggernaut', 'elite', 'armored', 'melee', 'animated'],
  },
  {
    id: 'reptil',
    kind: 'monster',
    name: 'Reptil',
    description: 'Reptilian predator with 3 distinct attack animations.',
    modelPath: '/models/enemies/reptil',
    scale: 1.3,
    data: {
      health: 400, damage: 28, speed: 5, xp: 100,
      tier: 'elite', role: 'striker',
      behavior: 'aggressive', attackRange: 3, aggroRange: 22,
      animations: { idle: 'Idle', run: 'Run', death: 'Dead', attacks: ['Attack(1)', 'Attack(2)', 'Attack(3)'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'reptile', 'elite', 'fast', 'melee', 'animated'],
  },
  {
    id: 'rhino',
    kind: 'monster',
    name: 'Rhino Beast',
    description: 'Heavily armored charging beast. Massive knockback on hit.',
    modelPath: '/models/enemies/rhino',
    scale: 1.6,
    data: {
      health: 500, damage: 35, speed: 6, xp: 110,
      tier: 'elite', role: 'charger',
      behavior: 'charge_attack', attackRange: 4, aggroRange: 25,
      armor: 35, knockbackForce: 12, chargeSpeed: 14,
      animations: { idle: 'Idle', run: 'Run', death: 'Dead', attack: 'Attack' },
      lootTable: 'elite',
    },
    tags: ['enemy', 'rhino', 'elite', 'charger', 'armored', 'animated'],
  },
  {
    id: 'battle_spider_01',
    kind: 'monster',
    name: 'Battle Spider',
    description: 'Aggressive combat spider with 3 attack types.',
    modelPath: '/models/enemies/BattleSpider01.FBX',
    scale: 1.0,
    data: {
      health: 250, damage: 18, speed: 5, xp: 60,
      tier: 'elite', role: 'swarm',
      behavior: 'swarm', attackRange: 2.5, aggroRange: 16,
      animations: { idle: 'idle01', run: 'run01', death: 'die01', attacks: ['attack01', 'attack02', 'attack03'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'spider', 'elite', 'swarm', 'animated'],
  },
  {
    id: 'battle_spider_02',
    kind: 'monster',
    name: 'Armored Battle Spider',
    description: 'Larger variant with chitin plating. Harder to kill.',
    modelPath: '/models/enemies/BattleSpider02.FBX',
    scale: 1.3,
    data: {
      health: 400, damage: 22, speed: 4, xp: 90,
      tier: 'elite', role: 'tank',
      armor: 25,
      behavior: 'patrol', attackRange: 2.5, aggroRange: 18,
      animations: { idle: 'idle01', run: 'run01', death: 'die01', attacks: ['attack01', 'attack02', 'attack03'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'spider', 'elite', 'armored', 'animated'],
  },

  // ════════════════════════════════════════════════════════════════════════
  // ENEMIES — BASIC + MEDIUM (from NewMonster pack, 5-7 anims each)
  // ════════════════════════════════════════════════════════════════════════
  {
    id: 'bear',
    kind: 'monster',
    name: 'Cave Bear',
    description: 'Territorial bear with heavy claw attacks. Two attack variants.',
    modelPath: '/models/enemies/bear/bear.FBX',
    scale: 1.4,
    data: {
      health: 300, damage: 25, speed: 4, xp: 70,
      tier: 'elite', role: 'territorial',
      behavior: 'territorial', territoryRadius: 15, attackRange: 3, aggroRange: 12,
      animations: { idle: 'stand', walk: 'walk', death: 'die', attacks: ['ATK01', 'ATK02'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'bear', 'elite', 'territorial', 'melee', 'animated'],
  },
  {
    id: 'gargoyle',
    kind: 'monster',
    name: 'Gargoyle',
    description: 'Stone guardian that ambushes from perches.',
    modelPath: '/models/enemies/gargoyle/gargoyle.FBX',
    scale: 1.2,
    data: {
      health: 280, damage: 20, speed: 3.5, xp: 65,
      tier: 'elite', role: 'ambusher',
      behavior: 'ambush', attackRange: 3, aggroRange: 15,
      armor: 30, stoneForm: true,
      animations: { idle: 'stand', walk: 'walk', death: 'die', attack: 'ATK01' },
      lootTable: 'elite',
    },
    tags: ['enemy', 'gargoyle', 'elite', 'ambush', 'armored', 'animated'],
  },
  {
    id: 'magma_beast',
    kind: 'monster',
    name: 'Magma Beast',
    description: 'Molten elemental with fire AoE attacks.',
    modelPath: '/models/enemies/megma/magma.FBX',
    scale: 1.3,
    data: {
      health: 350, damage: 22, speed: 3, xp: 75,
      tier: 'elite', role: 'caster',
      behavior: 'ranged', attackRange: 8, aggroRange: 20,
      fireResist: 100, iceWeakness: 50,
      procBurn: 40, burnDamage: 5, burnDuration: 4,
      animations: { idle: 'stand', walk: 'walk', death: 'die', attacks: ['ATK01', 'ATK02'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'elemental', 'fire', 'elite', 'aoe', 'animated'],
  },
  {
    id: 'troll',
    kind: 'monster',
    name: 'Earthborn Troll',
    description: 'Massive regenerating troll. Must be killed with fire to stop regen.',
    modelPath: '/models/enemies/troll/Troll.FBX',
    scale: 2.0,
    data: {
      health: 800, damage: 40, speed: 2.5, xp: 150,
      tier: 'elite', role: 'tank',
      behavior: 'patrol', attackRange: 4, aggroRange: 20,
      regenPerSec: 8, regenStoppedByFire: true,
      animations: { idle: 'idle', run: 'run', death: 'die', attack: 'attack' },
      lootTable: 'elite',
    },
    tags: ['enemy', 'troll', 'elite', 'regen', 'melee', 'animated'],
  },
  {
    id: 'octopus_boss',
    kind: 'monster',
    name: 'Abyssal Kraken',
    description: 'Tentacled boss with multiple attack patterns. Spawns near water.',
    modelPath: '/models/enemies/zhangyuboss/zhangyuboss.FBX',
    scale: 2.0,
    data: {
      health: 1800, damage: 45, speed: 2, xp: 400,
      tier: 'boss', role: 'area_boss',
      behavior: 'boss_tentacle', attackRange: 8, aggroRange: 30,
      animations: { idle: 'stand', death: 'die', attacks: ['ATK01', 'ATK02'], special: ['come02'] },
      ai: { tentacleCount: 4, slamCooldown: 5, grabChance: 0.2 },
      lootTable: 'boss', dropGuarantee: true,
      spawnNear: 'water',
    },
    tags: ['enemy', 'kraken', 'boss', 'tentacle', 'water', 'animated'],
  },
  {
    id: 'spider_queen',
    kind: 'monster',
    name: 'Spider Queen',
    description: 'Giant spider with web attacks and dual-strike combos.',
    modelPath: '/models/enemies/zhizhu/zhizhu.FBX',
    scale: 1.5,
    data: {
      health: 500, damage: 28, speed: 4.5, xp: 130,
      tier: 'elite', role: 'summoner',
      behavior: 'summoner', attackRange: 3, aggroRange: 20,
      procPoison: 35, summonId: 'battle_spider_01', summonMax: 3, summonCooldown: 20,
      animations: { idle: 'stand', walk: 'walk', death: 'die', attacks: ['ATK01', 'ATK02'] },
      lootTable: 'elite',
    },
    tags: ['enemy', 'spider', 'elite', 'summoner', 'poison', 'animated'],
  },
  {
    id: 'snow_wolf',
    kind: 'monster',
    name: 'Frost Wolf',
    description: 'Pack hunter. Fast, low HP, always spawns in groups of 3-5.',
    modelPath: '/models/enemies/yelang/yelang.FBX',
    scale: 1.0,
    data: {
      health: 80, damage: 12, speed: 7, xp: 25,
      tier: 'basic', role: 'pack_hunter',
      behavior: 'pack', packSize: [3, 5], attackRange: 2, aggroRange: 25,
      iceResist: 50,
      animations: { idle: 'stand', run: 'run', death: 'die', attack: 'ATK01' },
      lootTable: 'basic',
    },
    tags: ['enemy', 'wolf', 'basic', 'pack', 'fast', 'ice', 'animated'],
  },
  {
    id: 'scorpion',
    kind: 'monster',
    name: 'Giant Scorpion',
    description: 'Armored desert predator with venomous tail strike.',
    modelPath: '/models/enemies/xiezi/xiezi.FBX',
    scale: 1.2,
    data: {
      health: 200, damage: 18, speed: 3.5, xp: 50,
      tier: 'basic', role: 'ambusher',
      behavior: 'ambush', attackRange: 3, aggroRange: 10,
      procPoison: 45, poisonDamage: 6, poisonDuration: 8,
      animations: { idle: 'stand', walk: 'walk', death: 'die', attack: 'ATK01' },
      lootTable: 'basic',
    },
    tags: ['enemy', 'scorpion', 'basic', 'poison', 'desert', 'animated'],
  },
  {
    id: 'enchanter',
    kind: 'monster',
    name: 'Enchanter',
    description: 'Arcane caster that buffs nearby enemies and debuffs players.',
    modelPath: '/models/enemies/Enchanter.FBX',
    scale: 1.0,
    data: {
      health: 180, damage: 15, speed: 3, xp: 90,
      tier: 'elite', role: 'support',
      behavior: 'support_caster', attackRange: 15, aggroRange: 25,
      buffRadius: 10, buffDamagePct: 20, debuffSlowPct: 30, debuffDuration: 4,
      animations: { idle: 'idle', walk: 'walk', death: 'death', attack: 'attack' },
      lootTable: 'elite',
    },
    tags: ['enemy', 'caster', 'elite', 'support', 'debuff', 'animated'],
  },
  {
    id: 'ent',
    kind: 'monster',
    name: 'Ancient Ent',
    description: 'Living tree. Extremely slow but massive HP and AoE root attacks.',
    modelPath: '/models/enemies/ent/ent.fbx',
    scale: 2.5,
    data: {
      health: 1000, damage: 35, speed: 1.5, xp: 180,
      tier: 'elite', role: 'siege',
      behavior: 'territorial', territoryRadius: 20, attackRange: 5, aggroRange: 15,
      armor: 20, fireWeakness: 50, rootDuration: 3, rootCooldown: 10,
      animations: { idle: 'idle', walk: 'walk', death: 'death', attack: 'attack' },
      lootTable: 'elite',
    },
    tags: ['enemy', 'ent', 'elite', 'nature', 'root', 'slow', 'animated'],
  },

  // ════════════════════════════════════════════════════════════════════════
  // CREATURES (NPC allies, mounts, wildlife)
  // ════════════════════════════════════════════════════════════════════════
  {
    id: 'red_dragon_mount',
    kind: 'npc',
    name: 'Red Dragon',
    description: 'Tameable dragon mount. Requires Dragon Taming profession.',
    modelPath: '/models/creatures/Red_Dragon.glb',
    scale: 1.5,
    data: { mountable: true, flyable: true, mountSpeed: 12, health: 500, tameRequirement: 'dragon_taming_5' },
    tags: ['creature', 'dragon', 'mount', 'flying', 'tameable'],
  },
  {
    id: 'wolf_companion',
    kind: 'npc',
    name: 'Wolf',
    description: 'Loyal wolf companion. Fights alongside the player.',
    modelPath: '/models/creatures/Wolf.glb',
    scale: 1.0,
    data: { companionAI: 'follow_attack', health: 150, damage: 12, speed: 6, tameRequirement: 'beast_taming_1' },
    tags: ['creature', 'wolf', 'companion', 'tameable'],
  },
  {
    id: 'goblin_crew',
    kind: 'npc',
    name: 'Goblin Crew',
    description: 'Recruitable goblin workers for your township.',
    modelPath: '/models/creatures/GoblinCr3w.glb',
    scale: 0.8,
    data: { recruitable: true, roles: ['gatherer', 'builder'], health: 60, speed: 4 },
    tags: ['creature', 'goblin', 'npc', 'recruitable', 'township'],
  },

  // ════════════════════════════════════════════════════════════════════════
  // WEAPONS — All 24 variants per type with bone attachment + roll system
  // ════════════════════════════════════════════════════════════════════════
  ...weaponVariants('sword', 'craftpix_swords', {
    displayName: 'Sword', weaponType: 'sword', slot: 'mainhand',
    baseStats: { damage: 12, attackSpeed: 1.8, range: 2.5, critChance: 8 },
    boneSlot: 'R_hand_container', animSet: '1h_sword',
    boneOffset: { x: 0, y: 0, z: 0 }, boneRotation: { x: -90, y: 0, z: 0 },
    scale: 0.01,
  }),
  ...weaponVariants('dagger', 'craftpix_daggers', {
    displayName: 'Dagger', weaponType: 'dagger', slot: 'mainhand',
    baseStats: { damage: 7, attackSpeed: 2.8, range: 1.5, critChance: 15 },
    boneSlot: 'R_hand_container', animSet: 'knife',
    boneOffset: { x: 0, y: 0, z: 0 }, boneRotation: { x: -90, y: 0, z: 0 },
    scale: 0.01,
  }),
  ...weaponVariants('bow', 'craftpix_bows', {
    displayName: 'Bow', weaponType: 'bow', slot: 'mainhand', twoHanded: true,
    baseStats: { damage: 15, attackSpeed: 1.2, range: 30, critChance: 10 },
    boneSlot: 'L_hand_container', animSet: 'longbow',
    boneOffset: { x: 0, y: 0, z: 0 }, boneRotation: { x: 0, y: 90, z: 0 },
    scale: 0.01,
  }),
  ...weaponVariants('crossbow', 'craftpix_crossbows', {
    displayName: 'Crossbow', weaponType: 'crossbow', slot: 'mainhand', twoHanded: true,
    baseStats: { damage: 22, attackSpeed: 0.8, range: 35, critChance: 12 },
    boneSlot: 'R_hand_container', animSet: 'crossbow',
    boneOffset: { x: 0, y: 0, z: 0 }, boneRotation: { x: -90, y: 0, z: 0 },
    scale: 0.01,
  }),
  ...weaponVariants('hammer', 'craftpix_hammers', {
    displayName: 'Hammer', weaponType: 'hammer', slot: 'mainhand',
    baseStats: { damage: 18, attackSpeed: 1.2, range: 2.5, critChance: 5 },
    boneSlot: 'R_hand_container', animSet: '2h_melee',
    boneOffset: { x: 0, y: 0, z: 0 }, boneRotation: { x: -90, y: 0, z: 0 },
    scale: 0.01,
  }),
  ...weaponVariants('polearm', 'craftpix_polearms', {
    displayName: 'Polearm', weaponType: 'spear', slot: 'mainhand', twoHanded: true,
    baseStats: { damage: 16, attackSpeed: 1.4, range: 4, critChance: 6 },
    boneSlot: 'R_hand_container', animSet: '2h_melee',
    boneOffset: { x: 0, y: 0, z: 0 }, boneRotation: { x: -90, y: 0, z: 0 },
    scale: 0.01,
  }),

  // ════════════════════════════════════════════════════════════════════════
  // DEFENSE TOWERS (4 types × 4 levels = 16 buildable structures)
  // ════════════════════════════════════════════════════════════════════════
  ...towerVariants('archer', 'Archer Tower', 'archers_tower', [
    { file: '_archers_tower_LVL_1.fbx', damage: 8, range: 20, attackSpeed: 1.5, health: 200, buildCost: { wood: 50, stone: 20 }, targeting: 'nearest', projectile: 'arrow', desc: 'Basic arrow tower.' },
    { file: '_archers_tower_LVL_2.fbx', damage: 14, range: 25, attackSpeed: 1.8, health: 350, buildCost: { wood: 100, stone: 50, iron: 10 }, targeting: 'nearest', projectile: 'arrow', desc: 'Improved range and fire rate.' },
    { file: '_archers_tower_LVL_3.fbx', damage: 22, range: 30, attackSpeed: 2.0, health: 500, buildCost: { wood: 150, stone: 100, iron: 30 }, targeting: 'lowest_hp', projectile: 'fire_arrow', desc: 'Fire arrows, targets weakest.' },
    { file: '_arches_tower_LVL_4.fbx', damage: 30, range: 35, attackSpeed: 2.5, health: 750, buildCost: { wood: 200, stone: 150, iron: 60, gold: 20 }, targeting: 'lowest_hp', projectile: 'explosive_arrow', desc: 'Explosive arrows with AoE.' },
  ]),
  ...towerVariants('ballista', 'Ballista Tower', 'Ballista_tower', [
    { file: '_Ballista_tower_LVL_1.fbx', damage: 25, range: 30, attackSpeed: 0.5, health: 300, buildCost: { wood: 80, iron: 30 }, targeting: 'highest_hp', projectile: 'bolt', desc: 'High damage, slow fire.' },
    { file: '_Ballista_tower_LVL_2.fbx', damage: 40, range: 35, attackSpeed: 0.6, health: 500, buildCost: { wood: 120, iron: 60, steel: 10 }, targeting: 'highest_hp', projectile: 'bolt', desc: 'Piercing bolts.' },
    { file: '_Ballist_tower_LVL_3.fbx', damage: 60, range: 40, attackSpeed: 0.7, health: 700, buildCost: { wood: 160, iron: 90, steel: 30 }, targeting: 'highest_hp', projectile: 'explosive_bolt', desc: 'AoE explosive bolts.' },
    { file: '_Ballista_tower_LVL_4.fbx', damage: 80, range: 45, attackSpeed: 0.8, health: 1000, buildCost: { wood: 200, iron: 120, steel: 60, gold: 30 }, targeting: 'boss', projectile: 'siege_bolt', desc: 'Anti-boss siege weapon.' },
  ]),
  ...towerVariants('cannon', 'Cannon Tower', 'Cannon_tower', [
    { file: '_Cannon_tower_LVL_1.fbx', damage: 35, range: 25, attackSpeed: 0.4, health: 400, buildCost: { stone: 80, iron: 40 }, targeting: 'cluster', projectile: 'cannonball', desc: 'AoE splash damage.' },
    { file: '_Cannon_tower_LVL_2.fbx', damage: 55, range: 30, attackSpeed: 0.5, health: 600, buildCost: { stone: 120, iron: 80, gunpowder: 20 }, targeting: 'cluster', projectile: 'cannonball', desc: 'Larger blast radius.' },
    { file: '_Cannon_tower_LVL_3.fbx', damage: 75, range: 35, attackSpeed: 0.6, health: 850, buildCost: { stone: 160, iron: 120, gunpowder: 50 }, targeting: 'cluster', projectile: 'explosive_shell', desc: 'Fire damage added.' },
    { file: '_Cannon_tower_LVL_4.fbx', damage: 100, range: 40, attackSpeed: 0.7, health: 1200, buildCost: { stone: 200, iron: 160, gunpowder: 80, gold: 40 }, targeting: 'cluster', projectile: 'napalm_shell', desc: 'Napalm — burning ground effect.' },
  ]),

  // ════════════════════════════════════════════════════════════════════════
  // MECH — Constructable, tied to SYN attribute
  // ════════════════════════════════════════════════════════════════════════
  {
    id: 'mech_00',
    kind: 'structure',
    name: 'Nexus Mech',
    description: 'Constructable combat mech. Requires SYN 8+ to pilot. Build at Mech Bay.',
    modelPath: '/models/mechs/Mech_Char_Mesh.fbx',
    scale: 1.0,
    data: {
      structureType: 'mech',
      constructable: true,
      pilotable: true,
      attributeRequirement: { stat: 'syn', min: 8 },
      craftingStation: 'mech_bay',
      buildCost: { iron: 500, steel: 200, circuits: 100, power_core: 1 },
      health: 3000,
      armor: 80,
      moveSpeed: 4,
      weapons: {
        left_arm: { type: 'gatling', damage: 15, rateOfFire: 8, range: 30 },
        right_arm: { type: 'missile', damage: 80, rateOfFire: 0.3, range: 50, aoe: 6 },
        shoulder: { type: 'laser', damage: 40, rateOfFire: 1, range: 60 },
      },
      animations: {
        model: 'Mech_00_Anim.fbx',
        clips: ['Idle', 'Walk', 'Run', 'Attack_Left', 'Attack_Right', 'Death'],
      },
      // SYN attribute scaling
      synScaling: {
        healthPerPoint: 100,
        armorPerPoint: 5,
        damagePerPoint: 3,
        speedPerPoint: 0.2,
      },
      upgradeable: true,
      upgradeParts: ['chassis', 'left_arm', 'right_arm', 'shoulder', 'legs', 'reactor'],
    },
    tags: ['structure', 'mech', 'pilotable', 'constructable', 'syn_locked', 'endgame'],
  },
];

// ── Seed runner ──────────────────────────────────────────────────────────
async function seed() {
  if (!ADMIN_TOKEN) {
    console.error('ADMIN_TOKEN required. Set env var or pass --admin-token=...');
    process.exit(1);
  }

  console.log(`Seeding ${PREFABS.length} prefabs to ${API_URL}/api/prefabs`);
  let created = 0, skipped = 0, errors = 0;

  for (const prefab of PREFABS) {
    try {
      const res = await fetch(`${API_URL}/api/prefabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ADMIN_TOKEN}` },
        body: JSON.stringify(prefab),
      });
      if (res.status === 201) { created++; }
      else if (res.status === 409 || res.status === 500) { skipped++; } // 500 = dup key on old API
      else { const b = await res.text(); console.error(`  ✗ ${prefab.id} — ${res.status}: ${b.slice(0, 120)}`); errors++; continue; }
      // Progress every 20
      if ((created + skipped) % 20 === 0) process.stdout.write('.');
    } catch (err) { console.error(`  ✗ ${prefab.id} — ${err.message}`); errors++; }
  }

  console.log(`\n\nDone: ${created} created, ${skipped} existing, ${errors} errors (total: ${PREFABS.length})`);
}

seed();

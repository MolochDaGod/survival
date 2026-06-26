#!/usr/bin/env node
/**
 * Seed Sci-Fi Essentials Kit assets as prefabs via the API.
 *
 * Usage:
 *   node scripts/seed-scifi-prefabs.mjs [--api-url=URL] [--admin-token=TOKEN]
 *
 * Defaults to the Railway production API. Set ADMIN_TOKEN env var or pass --admin-token.
 * Models are referenced by their local glTF path — update modelPath after R2 upload.
 */

const API_URL = process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1]
  ?? process.env.API_URL
  ?? 'https://survival-api-production.up.railway.app';
const ADMIN_TOKEN = process.argv.find(a => a.startsWith('--admin-token='))?.split('=')[1]
  ?? process.env.ADMIN_TOKEN
  ?? '';

const ASSET_BASE = '/models/scifi';

const PREFABS = [
  // ── ENEMIES ──────────────────────────────────────────────────────────────
  {
    id: 'scifi_eye_drone',
    kind: 'monster',
    name: 'Eye Drone',
    description: 'Small flying recon drone. Weak but fast, attacks in swarms.',
    modelPath: `${ASSET_BASE}/Enemy_EyeDrone.gltf`,
    scale: 1.0,
    data: {
      health: 30, damage: 5, speed: 6, xp: 15,
      tier: 'basic', role: 'scout',
      behavior: 'swarm', attackRange: 8, aggroRange: 20,
      animations: ['Idle', 'Walk', 'Attack', 'Death'],
    },
    tags: ['enemy', 'drone', 'flying', 'scifi', 'basic'],
  },
  {
    id: 'scifi_quad_shell',
    kind: 'monster',
    name: 'Quad Shell',
    description: 'Heavily armored quadruped. Slow but hits hard with AoE slam.',
    modelPath: `${ASSET_BASE}/Enemy_QuadShell.gltf`,
    scale: 1.2,
    data: {
      health: 200, damage: 25, speed: 2.5, xp: 80,
      tier: 'elite', role: 'tank',
      behavior: 'patrol', attackRange: 3, aggroRange: 15,
      armor: 30, knockbackForce: 8,
      animations: ['Idle', 'Walk', 'Attack', 'Death'],
    },
    tags: ['enemy', 'quadruped', 'armored', 'scifi', 'elite'],
  },
  {
    id: 'scifi_trilobite',
    kind: 'monster',
    name: 'Trilobite',
    description: 'Alien insectoid that burrows and ambushes. Inflicts poison on hit.',
    modelPath: `${ASSET_BASE}/Enemy_Trilobite.gltf`,
    scale: 1.0,
    data: {
      health: 120, damage: 18, speed: 4, xp: 50,
      tier: 'elite', role: 'ambusher',
      behavior: 'ambush', attackRange: 2.5, aggroRange: 12,
      procPoison: 25, poisonDamage: 3, poisonDuration: 5,
      animations: ['Idle', 'Walk', 'Attack', 'Death'],
    },
    tags: ['enemy', 'insect', 'poison', 'scifi', 'elite'],
  },

  // ── WEAPONS ──────────────────────────────────────────────────────────────
  {
    id: 'scifi_pistol',
    kind: 'weapon',
    name: 'Plasma Pistol',
    description: 'Standard sidearm. Fast fire rate, low damage.',
    modelPath: `${ASSET_BASE}/Gun_Pistol.gltf`,
    scale: 1.0,
    data: {
      weaponType: 'pistol', slot: 'mainhand',
      damage: 8, attackSpeed: 2.5, range: 25,
      ammoType: 'energy', magSize: 12, reloadTime: 1.2,
      tier: 1,
    },
    tags: ['weapon', 'gun', 'pistol', 'ranged', 'scifi'],
  },
  {
    id: 'scifi_revolver',
    kind: 'weapon',
    name: 'Heavy Revolver',
    description: 'High-caliber revolver. Slow but devastating per-shot damage.',
    modelPath: `${ASSET_BASE}/Gun_Revolver.gltf`,
    scale: 1.0,
    data: {
      weaponType: 'pistol', slot: 'mainhand',
      damage: 22, attackSpeed: 1.0, range: 30,
      ammoType: 'ballistic', magSize: 6, reloadTime: 2.0,
      critChance: 15, tier: 3,
    },
    tags: ['weapon', 'gun', 'revolver', 'ranged', 'scifi'],
  },
  {
    id: 'scifi_rifle',
    kind: 'weapon',
    name: 'Assault Rifle',
    description: 'All-purpose automatic rifle. Balanced damage and fire rate.',
    modelPath: `${ASSET_BASE}/Gun_Rifle.gltf`,
    scale: 1.0,
    data: {
      weaponType: 'rifle', slot: 'mainhand',
      damage: 12, attackSpeed: 3.5, range: 40,
      ammoType: 'ballistic', magSize: 30, reloadTime: 1.8,
      tier: 2,
    },
    tags: ['weapon', 'gun', 'rifle', 'ranged', 'auto', 'scifi'],
  },
  {
    id: 'scifi_sniper',
    kind: 'weapon',
    name: 'Particle Sniper',
    description: 'Long-range precision rifle. Extreme damage, very slow fire rate.',
    modelPath: `${ASSET_BASE}/Gun_Sniper.gltf`,
    scale: 1.0,
    data: {
      weaponType: 'sniper', slot: 'mainhand',
      damage: 55, attackSpeed: 0.4, range: 80,
      ammoType: 'energy', magSize: 5, reloadTime: 3.0,
      critChance: 30, critDamage: 200, headshotMult: 3.0,
      tier: 4,
    },
    tags: ['weapon', 'gun', 'sniper', 'ranged', 'precision', 'scifi'],
  },

  // ── CONTAINERS ───────────────────────────────────────────────────────────
  {
    id: 'scifi_chest',
    kind: 'container',
    name: 'Tech Chest',
    description: 'Reinforced storage chest. May contain rare loot.',
    modelPath: `${ASSET_BASE}/Prop_Chest.gltf`,
    scale: 1.0,
    data: {
      interactable: true, lootTable: 'elite', slots: 8,
      animated: true, openAnimation: 'Open',
    },
    tags: ['container', 'chest', 'loot', 'interactable', 'scifi'],
  },
  {
    id: 'scifi_ammo_crate',
    kind: 'container',
    name: 'Ammo Crate',
    description: 'Military ammo supply. Restocks ammunition on interact.',
    modelPath: `${ASSET_BASE}/Prop_Ammo.gltf`,
    scale: 1.0,
    data: { interactable: true, restocksAmmo: true, cooldown: 60 },
    tags: ['container', 'ammo', 'interactable', 'scifi'],
  },
  {
    id: 'scifi_ammo_crate_closed',
    kind: 'container',
    name: 'Sealed Ammo Crate',
    description: 'Locked ammo crate. Requires keycard to open.',
    modelPath: `${ASSET_BASE}/Prop_Ammo_Closed.gltf`,
    scale: 1.0,
    data: { interactable: true, locked: true, keyRequired: 'keycard', restocksAmmo: true },
    tags: ['container', 'ammo', 'locked', 'scifi'],
  },
  {
    id: 'scifi_ammo_small',
    kind: 'container',
    name: 'Small Ammo Box',
    description: 'Compact ammo pickup. Grants a partial restock.',
    modelPath: `${ASSET_BASE}/Prop_Ammo_Small.gltf`,
    scale: 1.0,
    data: { interactable: true, restocksAmmo: true, partial: true },
    tags: ['container', 'ammo', 'pickup', 'scifi'],
  },
  {
    id: 'scifi_locker',
    kind: 'container',
    name: 'Storage Locker',
    description: 'Personnel locker. Contains random supplies.',
    modelPath: `${ASSET_BASE}/Prop_Locker.gltf`,
    scale: 1.0,
    data: { interactable: true, lootTable: 'basic', slots: 4 },
    tags: ['container', 'locker', 'storage', 'scifi'],
  },
  {
    id: 'scifi_crate',
    kind: 'container',
    name: 'Supply Crate',
    description: 'Standard supply crate. Breakable for resources.',
    modelPath: `${ASSET_BASE}/Prop_Crate.gltf`,
    scale: 1.0,
    data: { breakable: true, health: 20, dropTable: 'basic' },
    tags: ['container', 'crate', 'breakable', 'scifi'],
  },
  {
    id: 'scifi_crate_large',
    kind: 'container',
    name: 'Large Supply Crate',
    description: 'Oversized cargo crate. More resources when broken.',
    modelPath: `${ASSET_BASE}/Prop_Crate_Large.gltf`,
    scale: 1.0,
    data: { breakable: true, health: 40, dropTable: 'elite' },
    tags: ['container', 'crate', 'breakable', 'large', 'scifi'],
  },

  // ── PROPS (world decoration / physics objects) ────────────────────────────
  {
    id: 'scifi_barrel_1',
    kind: 'prop',
    name: 'Industrial Barrel',
    description: 'Sealed industrial barrel. Explodes when shot.',
    modelPath: `${ASSET_BASE}/Prop_Barrel1.gltf`,
    scale: 1.0,
    data: { breakable: true, health: 15, explosive: true, explosionDamage: 40, explosionRadius: 5 },
    tags: ['prop', 'barrel', 'explosive', 'hazard', 'scifi'],
  },
  {
    id: 'scifi_barrel_2_closed',
    kind: 'prop',
    name: 'Sealed Drum',
    description: 'Heavy-duty sealed drum. Non-explosive cover.',
    modelPath: `${ASSET_BASE}/Prop_Barrel2_Closed.gltf`,
    scale: 1.0,
    data: { physics: true, mass: 50, cover: true },
    tags: ['prop', 'barrel', 'cover', 'scifi'],
  },
  {
    id: 'scifi_barrel_2_open',
    kind: 'prop',
    name: 'Open Drum',
    description: 'Open industrial drum. Can be used as cover.',
    modelPath: `${ASSET_BASE}/Prop_Barrel2_Open.gltf`,
    scale: 1.0,
    data: { physics: true, mass: 30, cover: true },
    tags: ['prop', 'barrel', 'cover', 'open', 'scifi'],
  },
  {
    id: 'scifi_crate_tarp',
    kind: 'prop',
    name: 'Tarped Crate',
    description: 'Tarp-covered supply crate. Static world decoration.',
    modelPath: `${ASSET_BASE}/Prop_Crate_Tarp.gltf`,
    scale: 1.0,
    data: { static: true },
    tags: ['prop', 'crate', 'decoration', 'scifi'],
  },
  {
    id: 'scifi_crate_tarp_large',
    kind: 'prop',
    name: 'Large Tarped Crate',
    description: 'Large tarp-covered cargo. Good cover during firefights.',
    modelPath: `${ASSET_BASE}/Prop_Crate_Tarp_Large.gltf`,
    scale: 1.0,
    data: { static: true, cover: true },
    tags: ['prop', 'crate', 'cover', 'large', 'scifi'],
  },
  {
    id: 'scifi_satellite_dish',
    kind: 'prop',
    name: 'Satellite Dish',
    description: 'Communication array. Can be activated to reveal nearby enemies on minimap.',
    modelPath: `${ASSET_BASE}/Prop_SatelliteDish.gltf`,
    scale: 1.0,
    data: { interactable: true, revealsEnemies: true, radius: 50, cooldown: 120 },
    tags: ['prop', 'satellite', 'interactable', 'recon', 'scifi'],
  },
  {
    id: 'scifi_mine',
    kind: 'prop',
    name: 'Proximity Mine',
    description: 'Deployable mine. Detonates when enemies enter trigger radius.',
    modelPath: `${ASSET_BASE}/Prop_Mine.gltf`,
    scale: 1.0,
    data: { deployable: true, triggerRadius: 2, damage: 60, delay: 0.5 },
    tags: ['prop', 'mine', 'explosive', 'deployable', 'trap', 'scifi'],
  },
  {
    id: 'scifi_grenade',
    kind: 'prop',
    name: 'Frag Grenade',
    description: 'Throwable explosive. 3-second fuse, AoE blast.',
    modelPath: `${ASSET_BASE}/Prop_Grenade.gltf`,
    scale: 1.0,
    data: { throwable: true, fuseTime: 3, damage: 45, blastRadius: 6 },
    tags: ['prop', 'grenade', 'explosive', 'throwable', 'scifi'],
  },
  {
    id: 'scifi_mug',
    kind: 'prop',
    name: 'Coffee Mug',
    description: 'Someone left their coffee. Purely decorative.',
    modelPath: `${ASSET_BASE}/Prop_Mug.gltf`,
    scale: 1.0,
    data: { physics: true, mass: 0.3, throwable: true, damage: 1 },
    tags: ['prop', 'mug', 'decoration', 'throwable', 'scifi'],
  },

  // ── FURNITURE ─────────────────────────────────────────────────────────────
  {
    id: 'scifi_chair',
    kind: 'furniture',
    name: 'Office Chair',
    description: 'Ergonomic station chair. Sittable.',
    modelPath: `${ASSET_BASE}/Prop_Chair.gltf`,
    scale: 1.0,
    data: { sittable: true, static: true },
    tags: ['furniture', 'chair', 'sittable', 'scifi'],
  },
  {
    id: 'scifi_desk_large',
    kind: 'furniture',
    name: 'L-Shaped Desk',
    description: 'Large corner desk. Workstation furniture.',
    modelPath: `${ASSET_BASE}/Prop_Desk_L.gltf`,
    scale: 1.0,
    data: { static: true },
    tags: ['furniture', 'desk', 'large', 'scifi'],
  },
  {
    id: 'scifi_desk_medium',
    kind: 'furniture',
    name: 'Standard Desk',
    description: 'Medium work desk.',
    modelPath: `${ASSET_BASE}/Prop_Desk_Medium.gltf`,
    scale: 1.0,
    data: { static: true },
    tags: ['furniture', 'desk', 'scifi'],
  },
  {
    id: 'scifi_desk_small',
    kind: 'furniture',
    name: 'Side Table',
    description: 'Small utility desk.',
    modelPath: `${ASSET_BASE}/Prop_Desk_Small.gltf`,
    scale: 1.0,
    data: { static: true },
    tags: ['furniture', 'desk', 'small', 'scifi'],
  },
  {
    id: 'scifi_shelves_thin_short',
    kind: 'furniture',
    name: 'Narrow Short Shelves',
    description: 'Compact wall shelving unit.',
    modelPath: `${ASSET_BASE}/Prop_Shelves_ThinShort.gltf`,
    scale: 1.0,
    data: { static: true },
    tags: ['furniture', 'shelves', 'scifi'],
  },
  {
    id: 'scifi_shelves_thin_tall',
    kind: 'furniture',
    name: 'Narrow Tall Shelves',
    description: 'Tall narrow storage shelves.',
    modelPath: `${ASSET_BASE}/Prop_Shelves_ThinTall.gltf`,
    scale: 1.0,
    data: { static: true, cover: true },
    tags: ['furniture', 'shelves', 'tall', 'scifi'],
  },
  {
    id: 'scifi_shelves_wide_short',
    kind: 'furniture',
    name: 'Wide Short Shelves',
    description: 'Low wide shelving unit.',
    modelPath: `${ASSET_BASE}/Prop_Shelves_WideShort.gltf`,
    scale: 1.0,
    data: { static: true },
    tags: ['furniture', 'shelves', 'wide', 'scifi'],
  },
  {
    id: 'scifi_shelves_wide_tall',
    kind: 'furniture',
    name: 'Wide Tall Shelves',
    description: 'Full-size industrial shelving. Blocks line of sight.',
    modelPath: `${ASSET_BASE}/Prop_Shelves_WideTall.gltf`,
    scale: 1.0,
    data: { static: true, cover: true, blocksLOS: true },
    tags: ['furniture', 'shelves', 'wide', 'tall', 'scifi'],
  },

  // ── CONSUMABLES ──────────────────────────────────────────────────────────
  {
    id: 'scifi_healthpack',
    kind: 'consumable',
    name: 'Health Pack',
    description: 'Military medkit. Restores 50 HP over 3 seconds.',
    modelPath: `${ASSET_BASE}/Prop_HealthPack.gltf`,
    scale: 1.0,
    data: { healAmount: 50, healDuration: 3, cooldown: 10, stackSize: 5 },
    tags: ['consumable', 'heal', 'medkit', 'scifi'],
  },
  {
    id: 'scifi_healthpack_tube',
    kind: 'consumable',
    name: 'Stim Tube',
    description: 'Quick-inject stimulant. Instant 20 HP heal.',
    modelPath: `${ASSET_BASE}/Prop_HealthPack_Tube.gltf`,
    scale: 1.0,
    data: { healAmount: 20, healDuration: 0, cooldown: 5, stackSize: 10 },
    tags: ['consumable', 'heal', 'stim', 'instant', 'scifi'],
  },
  {
    id: 'scifi_syringe',
    kind: 'consumable',
    name: 'Combat Syringe',
    description: 'Adrenaline injector. +20% damage and +15% speed for 10s.',
    modelPath: `${ASSET_BASE}/Prop_Syringe.gltf`,
    scale: 1.0,
    data: {
      buff: true, buffDuration: 10,
      damageMult: 1.2, speedMult: 1.15,
      cooldown: 30, stackSize: 3,
    },
    tags: ['consumable', 'buff', 'syringe', 'combat', 'scifi'],
  },
  {
    id: 'scifi_keycard',
    kind: 'item',
    name: 'Security Keycard',
    description: 'Access card for locked containers and doors.',
    modelPath: `${ASSET_BASE}/Prop_KeyCard.gltf`,
    scale: 1.0,
    data: { keyType: 'keycard', stackSize: 1, questItem: false },
    tags: ['item', 'key', 'keycard', 'access', 'scifi'],
  },
];

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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
        },
        body: JSON.stringify(prefab),
      });

      if (res.status === 201) {
        console.log(`  ✓ ${prefab.id} (${prefab.kind})`);
        created++;
      } else if (res.status === 409) {
        console.log(`  ○ ${prefab.id} (already exists)`);
        skipped++;
      } else {
        const body = await res.text();
        console.error(`  ✗ ${prefab.id} — HTTP ${res.status}: ${body}`);
        errors++;
      }
    } catch (err) {
      console.error(`  ✗ ${prefab.id} — ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${errors} errors`);
}

seed();

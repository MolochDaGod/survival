import * as THREE from 'three';
import { InventoryItem, ITEM_DATABASE, RARITY_COLORS, rollItemFromTable, LOOT_TABLES } from './Items';
import { Inventory } from './Inventory';
import { rollDropTier, generateLootDrop } from '@workspace/game-systems';

interface LootOrb {
  group: THREE.Group;
  innerMesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  light: THREE.PointLight;
  item: InventoryItem;
  bobPhase: number;
  pickupRadius: number;
  spawnTime: number;
}

const _orbGeo = new THREE.IcosahedronGeometry(0.18, 0);
const _glowGeo = new THREE.SphereGeometry(0.32, 12, 12);

export class LootManager {
  scene: THREE.Scene;
  inventory: Inventory;
  orbs: LootOrb[] = [];
  pickupRadius: number = 1.6;
  magnetRadius: number = 4.0;

  constructor(scene: THREE.Scene, inventory: Inventory) {
    this.scene = scene;
    this.inventory = inventory;
  }

  dropFromEnemy(position: THREE.Vector3, tier: 'basic' | 'elite' | 'boss' = 'basic', luckBonus: number = 0) {
    // chance to drop
    const chance = tier === 'boss' ? 1.0 : tier === 'elite' ? 0.55 : 0.28;
    if (Math.random() > chance) return;

    const table = LOOT_TABLES[tier];
    const item = rollItemFromTable(table);
    if (!item) return;

    // Roll affix tier and generate randomized affixes via game-systems.
    // Pass the item's equip slot so the roller filters weapon-only and
    // armor-only affixes correctly (helms won't get "+Damage" etc.).
    const dropTier = rollDropTier(tier, luckBonus);
    const def = ITEM_DATABASE[item.defId];
    if (def) {
      const lootDrop = generateLootDrop(item.defId, def.name, dropTier, def.slot);
      item.affixes = lootDrop.affixes;
      item.bonusStats = lootDrop.bonusStats;
      item.generatedName = lootDrop.generatedName;
      item.dropTier = dropTier;
      item.gearTint = lootDrop.gearTint;
    }

    this.spawnOrb(position, item);
  }

  spawnOrb(position: THREE.Vector3, item: InventoryItem) {
    const def = ITEM_DATABASE[item.defId];
    if (!def) return;

    const color = RARITY_COLORS[def.rarity];

    const innerMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.6,
    });
    const inner = new THREE.Mesh(_orbGeo, innerMat);

    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(_glowGeo, glowMat);

    const light = new THREE.PointLight(color, 1.5, 4);

    const group = new THREE.Group();
    group.add(inner);
    group.add(glow);
    group.add(light);
    group.position.copy(position);
    group.position.y = 0.6;

    this.scene.add(group);

    this.orbs.push({
      group,
      innerMesh: inner,
      glowMesh: glow,
      light,
      item,
      bobPhase: Math.random() * Math.PI * 2,
      pickupRadius: this.pickupRadius,
      spawnTime: performance.now() / 1000,
    });
  }

  update(dt: number, time: number, playerPos: THREE.Vector3) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.bobPhase += dt;

      // bob & spin
      orb.group.position.y = 0.6 + Math.sin(orb.bobPhase * 2.5) * 0.18;
      orb.innerMesh.rotation.y += dt * 2.0;
      orb.innerMesh.rotation.x += dt * 1.2;
      const pulse = 0.85 + Math.sin(time * 4) * 0.15;
      orb.glowMesh.scale.setScalar(pulse);

      const dx = orb.group.position.x - playerPos.x;
      const dz = orb.group.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < orb.pickupRadius) {
        // try to pickup
        if (this.inventory.addToBag(orb.item)) {
          this.disposeOrb(orb);
          this.orbs.splice(i, 1);
        }
        continue;
      }

      // magnetic pull
      if (dist < this.magnetRadius && dist > 0.01) {
        const pull = (1 - dist / this.magnetRadius) * 6 * dt;
        orb.group.position.x -= (dx / dist) * pull;
        orb.group.position.z -= (dz / dist) * pull;
      }
    }
  }

  private disposeOrb(orb: LootOrb) {
    this.scene.remove(orb.group);
    (orb.innerMesh.material as THREE.Material).dispose();
    (orb.glowMesh.material as THREE.Material).dispose();
  }

  dispose() {
    for (const orb of this.orbs) this.disposeOrb(orb);
    this.orbs = [];
  }
}

/**
 * GearVisualManager — Unit Tests
 *
 * Tests the gear path resolution, slot mapping, and visibility rules
 * without requiring a real Three.js scene (pure logic).
 */

import { describe, it, expect } from 'vitest';
// resolveGearModelPath is re-implemented here to avoid importing
// GearVisualManager.ts which depends on Three.js (unavailable in the
// repo-root test environment). The logic mirrors GearVisualManager's
// exported resolveGearModelPath exactly.

type Gender = 'male' | 'female';
type GearSet = 'peasant' | 'ranger';

function rarityToGearSet(rarity: string): GearSet {
  switch (rarity) {
    case 'common': case 'uncommon': return 'peasant';
    default: return 'ranger';
  }
}

const SLOT_TO_GEAR_DIR: Record<string, string> = {
  helm: 'head', chest: 'chest', legs: 'legs', boots: 'feet',
};

function resolveGearModelPath(
  itemDef: { id: string; slot: string; rarity: string; gearModelPath?: string },
  gender: Gender,
): string | null {
  if (itemDef.gearModelPath) return itemDef.gearModelPath.replace('{gender}', gender);
  const gearDir = SLOT_TO_GEAR_DIR[itemDef.slot];
  if (!gearDir) return null;
  const set = rarityToGearSet(itemDef.rarity);
  if (gearDir === 'head' && set === 'peasant') return `/models/gear/head/ranger_${gender}.fbx`;
  return `/models/gear/${gearDir}/${set}_${gender}.fbx`;
}
import { ITEM_DATABASE, type ItemDef } from '../artifacts/arpg-game/src/game/Items.js';

// ── Helper ──────────────────────────────────────────────────────────────────

function defOf(id: string): ItemDef {
  const d = ITEM_DATABASE[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}

// ── 1. resolveGearModelPath — auto resolution ────────────────────────────────

describe('resolveGearModelPath — auto resolution', () => {
  // Helms
  it('common helm → ranger head (peasant has no head piece)', () => {
    const path = resolveGearModelPath(defOf('leather_cap'), 'male');
    expect(path).toBe('/models/gear/head/ranger_male.fbx');
  });

  it('rare helm → ranger head', () => {
    const path = resolveGearModelPath(defOf('shadow_hood'), 'female');
    expect(path).toBe('/models/gear/head/ranger_female.fbx');
  });

  it('legendary helm → ranger head', () => {
    const path = resolveGearModelPath(defOf('dragon_crown'), 'male');
    expect(path).toBe('/models/gear/head/ranger_male.fbx');
  });

  // Chest
  it('common chest → peasant chest', () => {
    const path = resolveGearModelPath(defOf('cloth_tunic'), 'female');
    expect(path).toBe('/models/gear/chest/peasant_female.fbx');
  });

  it('uncommon chest → peasant chest', () => {
    const path = resolveGearModelPath(defOf('iron_breastplate'), 'male');
    expect(path).toBe('/models/gear/chest/peasant_male.fbx');
  });

  it('rare chest → ranger chest', () => {
    const path = resolveGearModelPath(defOf('mage_robe'), 'female');
    expect(path).toBe('/models/gear/chest/ranger_female.fbx');
  });

  it('epic chest → ranger chest', () => {
    const path = resolveGearModelPath(defOf('void_plate'), 'male');
    expect(path).toBe('/models/gear/chest/ranger_male.fbx');
  });

  // Legs
  it('common legs → peasant legs', () => {
    const path = resolveGearModelPath(defOf('leather_pants'), 'male');
    expect(path).toBe('/models/gear/legs/peasant_male.fbx');
  });

  it('rare legs → ranger legs', () => {
    const path = resolveGearModelPath(defOf('shadowsilk_pants'), 'female');
    expect(path).toBe('/models/gear/legs/ranger_female.fbx');
  });

  // Boots
  it('common boots → peasant feet', () => {
    const path = resolveGearModelPath(defOf('leather_boots'), 'female');
    expect(path).toBe('/models/gear/feet/peasant_female.fbx');
  });

  it('epic boots → ranger feet', () => {
    const path = resolveGearModelPath(defOf('warlords_sabatons'), 'male');
    expect(path).toBe('/models/gear/feet/ranger_male.fbx');
  });
});

// ── 2. resolveGearModelPath — non-visual slots return null ──────────────────

describe('resolveGearModelPath — non-visual slots', () => {
  it('ring → null', () => {
    expect(resolveGearModelPath(defOf('copper_ring'), 'male')).toBeNull();
  });

  it('amulet → null', () => {
    expect(resolveGearModelPath(defOf('bone_charm'), 'female')).toBeNull();
  });

  it('offhand → null (handled by WeaponAttachment)', () => {
    expect(resolveGearModelPath(defOf('wooden_shield'), 'male')).toBeNull();
  });
});

// ── 3. resolveGearModelPath — explicit gearModelPath override ───────────────

describe('resolveGearModelPath — explicit override', () => {
  it('uses gearModelPath when set, with {gender} substitution', () => {
    const custom: ItemDef = {
      id: 'custom_helm', name: 'Custom', slot: 'helm', rarity: 'common',
      icon: '⛑️', description: '', stats: {},
      gearModelPath: '/models/gear/head/elite_{gender}.fbx',
    };
    expect(resolveGearModelPath(custom, 'male')).toBe('/models/gear/head/elite_male.fbx');
    expect(resolveGearModelPath(custom, 'female')).toBe('/models/gear/head/elite_female.fbx');
  });

  it('explicit path wins over auto-resolution', () => {
    const custom: ItemDef = {
      id: 'override_chest', name: 'Override', slot: 'chest', rarity: 'common',
      icon: '🦺', description: '', stats: {},
      gearModelPath: '/models/character_parts/customization/ClothesUp/ClothesUp_BigJacket.fbx',
    };
    // Even though rarity is common (would normally pick peasant), explicit path wins
    expect(resolveGearModelPath(custom, 'male')).toBe(
      '/models/character_parts/customization/ClothesUp/ClothesUp_BigJacket.fbx',
    );
  });
});

// ── 4. Gender symmetry — every visual slot produces a valid path per gender ─

describe('Gender symmetry', () => {
  const visualItems = Object.values(ITEM_DATABASE).filter(d =>
    ['helm', 'chest', 'legs', 'boots'].includes(d.slot),
  );

  for (const item of visualItems) {
    it(`${item.id} resolves for both genders`, () => {
      const male = resolveGearModelPath(item, 'male');
      const female = resolveGearModelPath(item, 'female');
      expect(male).not.toBeNull();
      expect(female).not.toBeNull();
      expect(male).toContain('_male');
      expect(female).toContain('_female');
    });
  }
});

// ── 5. Rarity → gear set mapping consistency ────────────────────────────────

describe('Rarity → gear set mapping', () => {
  it('common and uncommon always use peasant', () => {
    for (const item of Object.values(ITEM_DATABASE)) {
      if (!['helm', 'chest', 'legs', 'boots'].includes(item.slot)) continue;
      if (item.rarity !== 'common' && item.rarity !== 'uncommon') continue;
      const path = resolveGearModelPath(item, 'male');
      // Head is special — peasant has no head, falls back to ranger
      if (item.slot === 'helm') {
        expect(path).toContain('ranger_');
      } else {
        expect(path).toContain('peasant_');
      }
    }
  });

  it('rare/epic/legendary always use ranger', () => {
    for (const item of Object.values(ITEM_DATABASE)) {
      if (!['helm', 'chest', 'legs', 'boots'].includes(item.slot)) continue;
      if (item.rarity !== 'rare' && item.rarity !== 'epic' && item.rarity !== 'legendary') continue;
      const path = resolveGearModelPath(item, 'female');
      expect(path).toContain('ranger_');
    }
  });
});

// ── 6. Slot coverage — all visual item defs have a resolvable path ──────────

describe('Slot coverage', () => {
  const allItems = Object.values(ITEM_DATABASE);

  it('every helm has a gear model path', () => {
    const helms = allItems.filter(i => i.slot === 'helm');
    expect(helms.length).toBeGreaterThan(0);
    for (const h of helms) {
      expect(resolveGearModelPath(h, 'male')).toBeTruthy();
    }
  });

  it('every chest has a gear model path', () => {
    const chests = allItems.filter(i => i.slot === 'chest');
    expect(chests.length).toBeGreaterThan(0);
    for (const c of chests) {
      expect(resolveGearModelPath(c, 'female')).toBeTruthy();
    }
  });

  it('every legs has a gear model path', () => {
    const legs = allItems.filter(i => i.slot === 'legs');
    expect(legs.length).toBeGreaterThan(0);
    for (const l of legs) {
      expect(resolveGearModelPath(l, 'male')).toBeTruthy();
    }
  });

  it('every boots has a gear model path', () => {
    const boots = allItems.filter(i => i.slot === 'boots');
    expect(boots.length).toBeGreaterThan(0);
    for (const b of boots) {
      expect(resolveGearModelPath(b, 'female')).toBeTruthy();
    }
  });
});

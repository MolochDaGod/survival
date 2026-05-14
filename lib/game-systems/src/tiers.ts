/**
 * @workspace/game-systems — Gear Tier System (T1–T8)
 *
 * Ported from GrudgeBuilder tierSystem.ts.
 * Source of truth: https://info.grudge-studio.com/items-guide.html
 */

import type { TierDef } from './types.js';

export const TIERS: TierDef[] = [
  { tier: 1, label: 'Common',    color: '#8b7355', tw: 'text-stone-400',  twBorder: 'border-stone-600' },
  { tier: 2, label: 'Uncommon',  color: '#a8a8a8', tw: 'text-gray-300',   twBorder: 'border-gray-500' },
  { tier: 3, label: 'Rare',      color: '#4a9eff', tw: 'text-blue-400',   twBorder: 'border-blue-600' },
  { tier: 4, label: 'Epic',      color: '#9d4dff', tw: 'text-purple-400', twBorder: 'border-purple-600' },
  { tier: 5, label: 'Heroic',    color: '#ff4d4d', tw: 'text-red-400',    twBorder: 'border-red-600' },
  { tier: 6, label: 'Mythic',    color: '#ffaa00', tw: 'text-amber-400',  twBorder: 'border-amber-600' },
  { tier: 7, label: 'Ancient',   color: '#d4a84b', tw: 'text-yellow-500', twBorder: 'border-yellow-600' },
  { tier: 8, label: 'Legendary', color: '#f0d890', tw: 'text-yellow-200', twBorder: 'border-yellow-400' },
];

export function getTierDef(tier: number): TierDef {
  return TIERS.find(t => t.tier === tier) || TIERS[0];
}

export function getTierLabel(tier: number): string {
  return getTierDef(tier).label;
}

export function getTierColor(tier: number): string {
  return getTierDef(tier).color;
}

// ── Crafting Stations ───────────────────────────────────────────────────────

export interface CraftingStation {
  id: string;
  name: string;
  icon: string;
  profession: string;
  desc: string;
}

export const CRAFTING_STATIONS: CraftingStation[] = [
  { id: 'forge',      name: 'Forge',           icon: '⚒️',  profession: 'Miner',    desc: 'Weapons & heavy armor. Requires ore and fuel.' },
  { id: 'workbench',  name: 'Workbench',       icon: '🪵',  profession: 'Forester', desc: 'Wood items, bows, and tools.' },
  { id: 'alchemy',    name: 'Alchemy Table',   icon: '⚗️',  profession: 'Mystic',   desc: 'Potions, elixirs, poisons, and enchanting oils.' },
  { id: 'loom',       name: 'Loom',            icon: '🧵',  profession: 'Mystic',   desc: 'Cloth armor, capes, bags, and magical fabrics.' },
  { id: 'tannery',    name: 'Tannery',         icon: '🐄',  profession: 'Forester', desc: 'Leather armor, belts, boots from hides and skins.' },
  { id: 'enchanting', name: 'Enchanting Altar',icon: '✨',  profession: 'Mystic',   desc: 'Enchantments, runes, and magical properties.' },
];

// ── Harvesting Professions ──────────────────────────────────────────────────

export interface HarvestingProfession {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export const HARVESTING_PROFESSIONS: HarvestingProfession[] = [
  { id: 'mining',      name: 'Mining',      icon: '⛏️', desc: 'Extract ores and gems from mineral nodes.' },
  { id: 'herbalism',   name: 'Herbalism',   icon: '🌿', desc: 'Gather herbs, roots, and magical plants.' },
  { id: 'woodcutting', name: 'Woodcutting', icon: '🪓', desc: 'Fell trees and harvest lumber.' },
  { id: 'fishing',     name: 'Fishing',     icon: '🎣', desc: 'Catch fish and aquatic resources.' },
  { id: 'skinning',    name: 'Skinning',    icon: '🔪', desc: 'Skin creatures for leather and hides.' },
];

// ── Rarity System ───────────────────────────────────────────────────────────

export const RARITY_COLORS: Record<string, number> = {
  common: 0xb0b0b0,
  uncommon: 0x4ade80,
  rare: 0x60a5fa,
  epic: 0xc084fc,
  legendary: 0xfbbf24,
};

export const RARITY_WEIGHT: Record<string, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

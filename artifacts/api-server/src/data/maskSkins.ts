export type MaskRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface MaskSkin {
  id: string;
  name: string;
  rarity: MaskRarity;
  weight: number;
  primary: string;
  secondary: string;
  glow: string;
  pattern: "solid" | "circuit" | "scanline" | "hex" | "pulse";
}

export const MASK_PRICE_GBUX = 1000;

export const MASK_SKINS: MaskSkin[] = [
  { id: "ash_void", name: "Ash Void", rarity: "common", weight: 22, primary: "#1a1f2e", secondary: "#3d4556", glow: "#6b7a94", pattern: "solid" },
  { id: "frost_signal", name: "Frost Signal", rarity: "common", weight: 18, primary: "#0d1b2a", secondary: "#1b3a5c", glow: "#5eb3ff", pattern: "scanline" },
  { id: "ember_grid", name: "Ember Grid", rarity: "uncommon", weight: 14, primary: "#2a1208", secondary: "#5c2a10", glow: "#ff8c42", pattern: "circuit" },
  { id: "toxic_mesh", name: "Toxic Mesh", rarity: "uncommon", weight: 12, primary: "#0f1f12", secondary: "#1f4d2b", glow: "#4ade80", pattern: "hex" },
  { id: "violet_rift", name: "Violet Rift", rarity: "rare", weight: 10, primary: "#1a0f2e", secondary: "#3b1f6e", glow: "#c084fc", pattern: "pulse" },
  { id: "solar_flare", name: "Solar Flare", rarity: "rare", weight: 8, primary: "#2e1a05", secondary: "#6e3f0f", glow: "#fbbf24", pattern: "circuit" },
  { id: "abyss_crown", name: "Abyss Crown", rarity: "epic", weight: 6, primary: "#050810", secondary: "#101a30", glow: "#38bdf8", pattern: "hex" },
  { id: "blood_circuit", name: "Blood Circuit", rarity: "epic", weight: 5, primary: "#1f0508", secondary: "#4d1018", glow: "#f87171", pattern: "circuit" },
  { id: "ghost_protocol", name: "Ghost Protocol", rarity: "legendary", weight: 3, primary: "#0a1018", secondary: "#1e293b", glow: "#e2e8f0", pattern: "scanline" },
  { id: "grudge_prime", name: "Grudge Prime", rarity: "legendary", weight: 2, primary: "#05070b", secondary: "#1a2744", glow: "#5eb3ff", pattern: "pulse" },
];

const totalWeight = MASK_SKINS.reduce((s, x) => s + x.weight, 0);

export function rollMaskSkin(rng = Math.random): MaskSkin {
  let roll = rng() * totalWeight;
  for (const skin of MASK_SKINS) {
    roll -= skin.weight;
    if (roll <= 0) return skin;
  }
  return MASK_SKINS[MASK_SKINS.length - 1]!;
}
/**
 * GRUDGES Survival toon soldiers — CDN meshes + faction lore.
 * Source multipack: toon_soliders_chicken_gun.glb
 */

export const TOON_CDN =
  "https://assets.grudge-studio.com/models/toon-soldiers" as const;

export type ToonCallsignId =
  | "toon-vex"
  | "toon-nim"
  | "toon-rivet"
  | "toon-ashcoil"
  | "toon-bastion"
  | "toon-cinder"
  | "toon-brick"
  | "toon-ledger"
  | "toon-suture"
  | "toon-greyvial"
  | "toon-scope"
  | "toon-permafrost";

export interface ToonSurvivalDef {
  id: ToonCallsignId;
  callsign: string;
  fullName: string;
  classId: string;
  variant: "a" | "b";
  faction: string;
  role: string;
  /** CDN GLB */
  gltfPath: string;
  weaponMode: "pistol" | "rifle" | "shooter";
  icon: string;
}

function path(cls: string, v: "a" | "b") {
  return `${TOON_CDN}/${cls}/${cls}-${v}.glb`;
}

/** The 12 named surface operators for Survival ARPG. */
export const TOON_SURVIVAL_ROSTER: ToonSurvivalDef[] = [
  { id: "toon-vex", callsign: "Vex", fullName: 'Vex "Glassline" Morrow', classId: "scout", variant: "a", faction: "scavs", role: "pathfinder", gltfPath: path("scout", "a"), weaponMode: "pistol", icon: "🔭" },
  { id: "toon-nim", callsign: "Nim", fullName: "Nim Solari", classId: "scout", variant: "b", faction: "keepers", role: "green-runner", gltfPath: path("scout", "b"), weaponMode: "pistol", icon: "🌿" },
  { id: "toon-rivet", callsign: "Rivet", fullName: 'Kael "Rivet" Dorn', classId: "engineer", variant: "a", faction: "scavs", role: "rigwright", gltfPath: path("engineer", "a"), weaponMode: "rifle", icon: "🔧" },
  { id: "toon-ashcoil", callsign: "Ashcoil", fullName: "Sera Ashcoil", classId: "engineer", variant: "b", faction: "network", role: "gridwright", gltfPath: path("engineer", "b"), weaponMode: "rifle", icon: "📡" },
  { id: "toon-bastion", callsign: "Bastion", fullName: "Torren Bastion", classId: "gunner", variant: "a", faction: "hollow", role: "heavy-gun", gltfPath: path("gunner", "a"), weaponMode: "rifle", icon: "🛡️" },
  { id: "toon-cinder", callsign: "Cinder", fullName: "Mava Cinder", classId: "gunner", variant: "b", faction: "forgotten", role: "ash-guard", gltfPath: path("gunner", "b"), weaponMode: "rifle", icon: "🔥" },
  { id: "toon-brick", callsign: "Brick", fullName: 'Juno "Brick" Hale', classId: "infantry", variant: "a", faction: "hollow", role: "line-fighter", gltfPath: path("infantry", "a"), weaponMode: "shooter", icon: "🪖" },
  { id: "toon-ledger", callsign: "Ledger", fullName: "Quin Ledger", classId: "infantry", variant: "b", faction: "network", role: "patrol", gltfPath: path("infantry", "b"), weaponMode: "shooter", icon: "📋" },
  { id: "toon-suture", callsign: "Suture", fullName: "Dr. Ilya Suture", classId: "medic", variant: "a", faction: "keepers", role: "healer", gltfPath: path("medic", "a"), weaponMode: "pistol", icon: "💉" },
  { id: "toon-greyvial", callsign: "Greyvial", fullName: "Kest Greyvial", classId: "medic", variant: "b", faction: "forgotten", role: "bone-tender", gltfPath: path("medic", "b"), weaponMode: "pistol", icon: "⚗️" },
  { id: "toon-scope", callsign: "Scope", fullName: 'Rae "Scope" Venn', classId: "sniper", variant: "a", faction: "network", role: "marksman", gltfPath: path("sniper", "a"), weaponMode: "rifle", icon: "🎯" },
  { id: "toon-permafrost", callsign: "Permafrost", fullName: "Ysolde Permafrost", classId: "sniper", variant: "b", faction: "forgotten", role: "long-eye", gltfPath: path("sniper", "b"), weaponMode: "rifle", icon: "❄️" },
];

export const TOON_BY_ID: Record<string, ToonSurvivalDef> = Object.fromEntries(
  TOON_SURVIVAL_ROSTER.map((t) => [t.id, t]),
);

export function isToonBodyId(id: string | undefined | null): boolean {
  return !!id && id.startsWith("toon-");
}

export function toonDef(id: string): ToonSurvivalDef | undefined {
  return TOON_BY_ID[id];
}

/** Baked Mixamo clips for toon retarget (Bip001 JSON on arena CDN). */
export const TOON_BAKED_BASE =
  "https://grudge-arena.grudge-studio.com/api/assets/anims/baked";

export const TOON_LOCO_RELS: Record<string, string> = {
  Idle: "locomotion/idle",
  Walk: "locomotion/walking",
  Run: "locomotion/running",
  Sprint: "uploads_2026_06/locomotion/running",
  StrafeLeft: "locomotion/left strafe walking",
  StrafeRight: "locomotion/right strafe walking",
  Jump: "locomotion/jump",
  Attack: "rifle/firing",
  Hit: "boxanimations/reactions/Hit Reaction",
  Death: "boxanimations/reactions/Dying",
  Swim_Idle_Loop: "locomotion/treading-water",
  Swim_Fwd_Loop: "locomotion/swimming",
};

export const TOON_PISTOL_RELS: Record<string, string> = {
  Idle: "pistol/pistol idle",
  Walk: "pistol/pistol walk",
  Run: "pistol/pistol run",
  Attack: "pistol/gunplay",
};

export const TOON_RIFLE_RELS: Record<string, string> = {
  Idle: "rifle/idle",
  Walk: "rifle/walk forward",
  Run: "rifle/run forward",
  Attack: "rifle/firing",
};

/** Ninja throwables CDN */
export const NINJA_THROW_CDN =
  "https://assets.grudge-studio.com/models/weapons/throwables" as const;
export const NINJA_PROJ_CDN =
  "https://assets.grudge-studio.com/models/weapons/projectiles" as const;

export const NINJA_WEAPON_IDS = [
  "shuriken-3",
  "shuriken-4",
  "shuriken-4-circled",
  "shuriken-6",
  "shuriken-8",
  "kunai",
] as const;

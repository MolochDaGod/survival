import type { ScriptedRole } from "./types";

/** Map DB prefab `kind` → simulation `scriptedRole`. */
const KIND_TO_ROLE: Record<string, ScriptedRole> = {
  monster: "enemy",
  npc: "npc",
  player_body: "player",
  item: "item",
  weapon: "item",
  prop: "fx",
  furniture: "building",
  consumable: "item",
  vfx: "fx",
  container: "item",
  structure: "building",
  deployable: "building",
  turret: "building",
  drone: "vehicle",
  mech: "vehicle",
  vehicle: "vehicle",
};

export function kindToScriptedRole(kind: string): ScriptedRole {
  return KIND_TO_ROLE[kind] ?? "fx";
}
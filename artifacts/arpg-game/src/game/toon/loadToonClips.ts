/**
 * Fetch baked Mixamo/Bip001 JSON and retarget onto a toon soldier rig.
 */
import * as THREE from "three";
import {
  TOON_BAKED_BASE,
  TOON_LOCO_RELS,
  TOON_PISTOL_RELS,
  TOON_RIFLE_RELS,
  type ToonSurvivalDef,
} from "./ToonSurvivalRoster";
import { discoverToonBoneRoles, retargetClipToToon } from "./toonBoneRetarget";

const cache = new Map<string, Promise<THREE.AnimationClip | null>>();

async function fetchBaked(rel: string): Promise<THREE.AnimationClip | null> {
  const url = `${TOON_BAKED_BASE}/${rel}.json`;
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => (data ? THREE.AnimationClip.parse(data) : null))
        .catch(() => null),
    );
  }
  return cache.get(url)!;
}

export async function loadRetargetedToonClips(
  root: THREE.Object3D,
  def: ToonSurvivalDef,
): Promise<THREE.AnimationClip[]> {
  const roleMap = discoverToonBoneRoles(root);
  const pack =
    def.weaponMode === "pistol"
      ? { ...TOON_LOCO_RELS, ...TOON_PISTOL_RELS }
      : { ...TOON_LOCO_RELS, ...TOON_RIFLE_RELS };

  const out: THREE.AnimationClip[] = [];
  const used = new Set<string>();

  await Promise.all(
    Object.entries(pack).map(async ([engineName, rel]) => {
      if (used.has(engineName)) return;
      const src = await fetchBaked(rel);
      if (!src?.tracks?.length) return;
      const clip = retargetClipToToon(src, roleMap, engineName);
      if (!clip.tracks.length) return;
      used.add(engineName);
      out.push(clip);
    }),
  );

  // Native multipack Action clips as Attack fallback
  // (caller merges native first if present)

  // Strafe walk aliases
  const sl = out.find((c) => c.name === "StrafeLeft");
  const sr = out.find((c) => c.name === "StrafeRight");
  if (sl && !used.has("StrafeLeftWalk")) {
    const c = sl.clone(); c.name = "StrafeLeftWalk"; out.push(c);
  }
  if (sr && !used.has("StrafeRightWalk")) {
    const c = sr.clone(); c.name = "StrafeRightWalk"; out.push(c);
  }

  console.log(
    `[toon] retargeted ${out.length} clips for ${def.callsign} ` +
      `(roles: ${Object.keys(roleMap).join(",")})`,
  );
  return out;
}

/**
 * Minimal Bip001/Mixamo → chicken_gun Bone hierarchy retarget for Survival ARPG.
 */
import * as THREE from "three";

type BoneRole =
  | "hips" | "spine" | "neck" | "head"
  | "lClavicle" | "lUpperArm" | "lForearm" | "lHand"
  | "rClavicle" | "rUpperArm" | "rForearm" | "rHand"
  | "lThigh" | "lCalf" | "lFoot"
  | "rThigh" | "rCalf" | "rFoot";

type RoleMap = Partial<Record<BoneRole, string>>;

const SOURCE: Record<string, BoneRole> = {
  "Bip001 Pelvis": "hips", "Bip001 Spine": "spine", "Bip001 Spine1": "spine",
  "Bip001 Neck": "neck", "Bip001 Head": "head",
  "Bip001 L Clavicle": "lClavicle", "Bip001 L UpperArm": "lUpperArm",
  "Bip001 L Forearm": "lForearm", "Bip001 L Hand": "lHand",
  "Bip001 R Clavicle": "rClavicle", "Bip001 R UpperArm": "rUpperArm",
  "Bip001 R Forearm": "rForearm", "Bip001 R Hand": "rHand",
  "Bip001 L Thigh": "lThigh", "Bip001 L Calf": "lCalf", "Bip001 L Foot": "lFoot",
  "Bip001 R Thigh": "rThigh", "Bip001 R Calf": "rCalf", "Bip001 R Foot": "rFoot",
  Bip001_Pelvis: "hips", Bip001_Spine: "spine", Bip001_Neck: "neck", Bip001_Head: "head",
  Bip001_L_Clavicle: "lClavicle", Bip001_L_UpperArm: "lUpperArm",
  Bip001_L_Forearm: "lForearm", Bip001_L_Hand: "lHand",
  Bip001_R_Clavicle: "rClavicle", Bip001_R_UpperArm: "rUpperArm",
  Bip001_R_Forearm: "rForearm", Bip001_R_Hand: "rHand",
  Bip001_L_Thigh: "lThigh", Bip001_L_Calf: "lCalf", Bip001_L_Foot: "lFoot",
  Bip001_R_Thigh: "rThigh", Bip001_R_Calf: "rCalf", Bip001_R_Foot: "rFoot",
  Hips: "hips", Spine: "spine", Spine1: "spine", Neck: "neck", Head: "head",
  LeftShoulder: "lClavicle", LeftArm: "lUpperArm", LeftForeArm: "lForearm", LeftHand: "lHand",
  RightShoulder: "rClavicle", RightArm: "rUpperArm", RightForeArm: "rForearm", RightHand: "rHand",
  LeftUpLeg: "lThigh", LeftLeg: "lCalf", LeftFoot: "lFoot",
  RightUpLeg: "rThigh", RightLeg: "rCalf", RightFoot: "rFoot",
};

function chainDepth(bone: THREE.Bone, max = 8): number {
  let d = 0, b: THREE.Bone | undefined = bone;
  while (b && d < max) {
    const kids = b.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
    if (!kids.length) break;
    b = kids[0]; d++;
  }
  return d;
}

function worldX(bone: THREE.Bone): number {
  const v = new THREE.Vector3();
  bone.getWorldPosition(v);
  return v.x;
}

function assignArm(roles: RoleMap, side: "l" | "r", start: THREE.Bone) {
  const chain: THREE.Bone[] = [start];
  let cur = start;
  while (chain.length < 4) {
    const kids = cur.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
    if (!kids.length) break;
    cur = kids[0]; chain.push(cur);
  }
  if (chain[0]) roles[`${side}Clavicle` as BoneRole] = chain[0].name;
  if (chain[1]) roles[`${side}UpperArm` as BoneRole] = chain[1].name;
  else if (chain[0]) roles[`${side}UpperArm` as BoneRole] = chain[0].name;
  if (chain[2]) roles[`${side}Forearm` as BoneRole] = chain[2].name;
  if (chain[3]) roles[`${side}Hand` as BoneRole] = chain[3].name;
}

function assignLeg(roles: RoleMap, side: "l" | "r", start: THREE.Bone) {
  const chain: THREE.Bone[] = [start];
  let cur = start;
  while (chain.length < 3) {
    const kids = cur.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
    if (!kids.length) break;
    cur = kids[0]; chain.push(cur);
  }
  if (chain[0]) roles[`${side}Thigh` as BoneRole] = chain[0].name;
  if (chain[1]) roles[`${side}Calf` as BoneRole] = chain[1].name;
  if (chain[2]) roles[`${side}Foot` as BoneRole] = chain[2].name;
}

export function discoverToonBoneRoles(root: THREE.Object3D): RoleMap {
  // Collect candidates outside the traverse callback so TS control-flow
  // analysis can see the final skeleton (callback mutations are opaque).
  const skeletons: THREE.Skeleton[] = [];
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && m.skeleton?.bones?.length) {
      skeletons.push(m.skeleton);
    }
  });
  if (skeletons.length === 0) return {};
  const best = skeletons.reduce((a, b) =>
    b.bones.length > a.bones.length ? b : a,
  );
  const bones = best.bones as THREE.Bone[];
  let hips: THREE.Bone | null = null;
  for (const b of bones) {
    const kids = b.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
    if (kids.length >= 3 && /^Bone/i.test(b.name)) { hips = b; break; }
  }
  if (!hips) {
    hips = bones
      .filter((b) => b.children.some((c) => (c as THREE.Bone).isBone))
      .sort((a, b) =>
        b.children.filter((c) => (c as THREE.Bone).isBone).length -
        a.children.filter((c) => (c as THREE.Bone).isBone).length)[0] ?? null;
  }
  if (!hips) return {};
  const roles: RoleMap = { hips: hips.name };
  const ranked = (hips.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[])
    .map((b) => ({ b, kids: b.children.filter((c) => (c as THREE.Bone).isBone).length, depth: chainDepth(b), x: worldX(b) }))
    .sort((a, b) => b.kids - a.kids || b.depth - a.depth);
  if (ranked[0]) {
    roles.spine = ranked[0].b.name;
    const arms = (ranked[0].b.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[])
      .map((b) => ({ b, depth: chainDepth(b), x: worldX(b) }))
      .filter((e) => e.depth >= 1)
      .sort((a, b) => a.x - b.x);
    if (arms.length >= 2) {
      assignArm(roles, "l", arms[0].b);
      assignArm(roles, "r", arms[arms.length - 1].b);
    }
  }
  const legs = ranked.slice(1).filter((e) => e.depth >= 1).sort((a, b) => a.x - b.x);
  if (legs.length >= 2) {
    assignLeg(roles, "l", legs[0].b);
    assignLeg(roles, "r", legs[legs.length - 1].b);
  }
  return roles;
}

function roleForBone(name: string): BoneRole | null {
  let bare = name;
  for (const p of ["mixamorig10:", "mixamorig:", "mixamorig"]) {
    if (bare.startsWith(p)) { bare = bare.slice(p.length); break; }
  }
  return SOURCE[bare] ?? SOURCE[bare.replace(/_/g, " ")] ?? SOURCE[bare.replace(/ /g, "_")] ?? null;
}

export function retargetClipToToon(
  clip: THREE.AnimationClip,
  roleMap: RoleMap,
  name?: string,
): THREE.AnimationClip {
  const out = clip.clone();
  if (name) out.name = name;
  out.tracks = out.tracks.filter((t) => {
    const dot = t.name.indexOf(".");
    if (dot < 0) return false;
    const prop = t.name.slice(dot + 1);
    if (prop !== "quaternion" && prop !== "rotation") return false;
    const role = roleForBone(t.name.slice(0, dot));
    if (!role || !roleMap[role]) return false;
    t.name = roleMap[role]! + t.name.slice(dot);
    return true;
  });
  return out;
}

export function findRightHandBone(root: THREE.Object3D): THREE.Object3D | null {
  const roles = discoverToonBoneRoles(root);
  if (roles.rHand) {
    let found: THREE.Object3D | null = null;
    root.traverse((o) => { if (o.name === roles.rHand) found = o; });
    if (found) return found;
  }
  // Mixamo fallback
  const mixamo = [
    "mixamorigRightHand", "mixamorig:RightHand", "RightHand",
    "Bip001 R Hand", "Bip001_R_Hand",
  ];
  for (const n of mixamo) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

/**
 * Re-root a character so the origin sits between the feet on the ground:
 *   - uniform height fit to `targetH` metres
 *   - feet planted at y=0 (bbox min.y → 0)
 *   - XZ centered on the mesh midpoint (between the feet)
 *
 * Call once after SkeletonUtils.clone, before parenting into the player group.
 * Prefer bake-time re-root via `process-character.mjs`; this is the runtime
 * safety net for assets that still ship hip-origin.
 */
export function normalizeToonHeight(root: THREE.Object3D, targetH = 1.8): number {
  // Never accumulate on prior non-unit scale (100× killer).
  root.scale.set(1, 1, 1);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  // cm → m if authoring units look wrong
  if (size.y > 20) {
    root.scale.setScalar(0.01);
    root.updateMatrixWorld(true);
    box.setFromObject(root);
    box.getSize(size);
  }

  if (size.y > 0.05) {
    root.scale.multiplyScalar(targetH / size.y);
    root.updateMatrixWorld(true);
    box.setFromObject(root);
  }

  // Origin between feet: plant soles + center XZ.
  const center = box.getCenter(new THREE.Vector3());
  if (Number.isFinite(box.min.y)) {
    root.position.x -= center.x;
    root.position.y -= box.min.y;
    root.position.z -= center.z;
  }
  return targetH;
}

/**
 * Runtime-only plant/center without height fit (for assets already baked to
 * metres by process-character.mjs). Safe to call every spawn.
 */
export function rerootFeetToOrigin(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y)) return;
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
}

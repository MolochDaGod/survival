/**
 * ExplorerAvatar — blocky ~1.8 m player mesh used by Grudges (and arcade Explorer).
 *
 * FULLY replaces Quaternius / capsule heroes for the live player. Look can be
 * driven from the fleet 4-slot character colors when present (model3d / palette
 * keys), otherwise DEFAULT_LOOK.
 *
 * SI: feet at y=0, head ~1.8 m. No external GLB required.
 */
import * as THREE from 'three';

export interface ExplorerLook {
  skin: string;
  shirt: string;
  pants: string;
  hat: 'none' | 'cap' | 'horns';
  weapon: 'none' | 'sword' | 'axe' | 'bow';
}

export const DEFAULT_EXPLORER_LOOK: ExplorerLook = {
  skin: '#e0ac69',
  shirt: '#3a6ea5',
  pants: '#2b2b33',
  hat: 'none',
  weapon: 'sword',
};

/** Fleet 4-slot palette keys (localStorage / character progress). */
const FLEET_CHAR_KEYS = [
  'grudge.activeCharId',
  'grudge.open.activeCharacterId',
  'grudge.fleetRoster',
  'grudge.explorer.look',
] as const;

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.78,
    metalness: 0.04,
  });
}

/**
 * Read explorer look from fleet 4-slot / dressing store when available.
 * Falls back to DEFAULT_EXPLORER_LOOK. Slot index 0–3 from active character.
 */
export function lookFromFourCharacters(fallback: ExplorerLook = DEFAULT_EXPLORER_LOOK): ExplorerLook {
  try {
    const rawLook = localStorage.getItem('grudge.explorer.look');
    if (rawLook) {
      const j = JSON.parse(rawLook) as Partial<ExplorerLook>;
      return {
        skin: j.skin ?? fallback.skin,
        shirt: j.shirt ?? fallback.shirt,
        pants: j.pants ?? fallback.pants,
        hat: (j.hat as ExplorerLook['hat']) ?? fallback.hat,
        weapon: (j.weapon as ExplorerLook['weapon']) ?? fallback.weapon,
      };
    }
    const rosterRaw = localStorage.getItem('grudge.fleetRoster')
      ?? localStorage.getItem('grudge.open.characters');
    if (rosterRaw) {
      const roster = JSON.parse(rosterRaw) as Array<Record<string, unknown>>;
      const activeId = localStorage.getItem('grudge.activeCharId')
        ?? localStorage.getItem('grudge.open.activeCharacterId');
      const slot = Array.isArray(roster)
        ? (roster.find((c) => String(c.id ?? c.characterId) === activeId) ?? roster[0])
        : null;
      if (slot) {
        // Map survival CharacterConfig colors if present
        const skin = String(slot.skinColor ?? slot.skin ?? fallback.skin);
        const shirt = String(slot.shirtColor ?? slot.primaryColor ?? fallback.shirt);
        const pants = String(slot.pantsColor ?? slot.secondaryColor ?? fallback.pants);
        return { ...fallback, skin, shirt, pants };
      }
    }
  } catch {
    /* ignore */
  }
  void FLEET_CHAR_KEYS;
  return { ...fallback };
}

export class ExplorerAvatar {
  readonly root: THREE.Group;
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private phase = 0;
  private swing = 0;

  constructor(look: ExplorerLook = lookFromFourCharacters()) {
    this.root = new THREE.Group();
    this.root.name = 'ExplorerAvatar';

    const skin = mat(look.skin);
    const shirt = mat(look.shirt);
    const pants = mat(look.pants);
    const dark = mat('#23232b');
    const steel = mat('#b8bcc6');
    const wood = mat('#7a4b2b');

    this.legL = this.makeLimb(0.8, 0.8, 0.24, 0.26, pants, dark);
    this.legL.position.x = -0.16;
    this.legR = this.makeLimb(0.8, 0.8, 0.24, 0.26, pants, dark);
    this.legR.position.x = 0.16;
    this.root.add(this.legL, this.legR);

    const torso = box(0.62, 0.7, 0.34, shirt);
    torso.position.y = 1.15;
    this.root.add(torso);

    this.armL = this.makeLimb(1.45, 0.7, 0.2, 0.22, shirt, skin);
    this.armL.position.x = -0.41;
    this.armR = this.makeLimb(1.45, 0.7, 0.2, 0.22, shirt, skin);
    this.armR.position.x = 0.41;
    this.root.add(this.armL, this.armR);

    const head = box(0.44, 0.44, 0.44, skin);
    head.position.y = 1.72;
    const eyeMat = mat('#1b1b22');
    const eyeL = box(0.08, 0.08, 0.04, eyeMat);
    eyeL.position.set(-0.1, 1.76, 0.23);
    const eyeR = box(0.08, 0.08, 0.04, eyeMat);
    eyeR.position.set(0.1, 1.76, 0.23);
    this.root.add(head, eyeL, eyeR);

    if (look.hat === 'cap') {
      const crown = box(0.46, 0.16, 0.46, shirt);
      crown.position.y = 2.02;
      this.root.add(crown);
    } else if (look.hat === 'horns') {
      const band = box(0.46, 0.1, 0.46, shirt);
      band.position.y = 1.96;
      this.root.add(band);
    }

    if (look.weapon === 'sword') {
      const handle = box(0.07, 0.22, 0.07, wood);
      const guard = box(0.28, 0.07, 0.09, steel);
      guard.position.y = 0.13;
      const blade = box(0.09, 0.7, 0.03, steel);
      blade.position.y = 0.5;
      const w = new THREE.Group();
      w.add(handle, guard, blade);
      w.position.y = -0.7;
      w.rotation.x = Math.PI / 2;
      this.armR.add(w);
    }
  }

  private makeLimb(
    jointY: number,
    length: number,
    width: number,
    depth: number,
    segMat: THREE.Material,
    capMat: THREE.Material,
  ): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.y = jointY;
    const seg = box(width, length - 0.18, depth, segMat);
    seg.position.y = -(length - 0.18) / 2;
    pivot.add(seg);
    const cap = box(width * 1.08, 0.18, depth * 1.12, capMat);
    cap.position.y = -length + 0.09;
    pivot.add(cap);
    return pivot;
  }

  /** Walk-cycle swing. Call each frame with horizontal move amount. */
  update(dt: number, moving: boolean): void {
    const target = moving ? 1 : 0;
    this.swing += (target - this.swing) * Math.min(1, dt * 8);
    this.phase += dt * (moving ? 9 : 0);
    const a = Math.sin(this.phase) * 0.6 * this.swing;
    this.legL.rotation.x = a;
    this.legR.rotation.x = -a;
    this.armL.rotation.x = -a;
    this.armR.rotation.x = a;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose?.();
      }
    });
  }
}

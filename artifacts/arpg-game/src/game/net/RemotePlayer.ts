/**
 * RemotePlayer — a minimal "ghost" representation of another co-op player.
 *
 * One simple capsule mesh per remote peer plus a billboard nameplate. We
 * do *not* try to mirror the full character pipeline yet (gear layers,
 * animation graph) — that's a bigger lift and not needed to prove the
 * realtime stack works end-to-end. State is interpolated linearly over
 * 100 ms to smooth the 20 Hz input cadence.
 *
 * Add a RemotePlayer to the scene with `mountTo(scene)`, feed it
 * `pushState(s)` from the network layer, and call `update(dt)` each frame.
 */
import * as THREE from 'three';

export interface RemoteSnapshot {
  x: number; y: number; z: number; ry: number;
  anim?: string; hp?: number;
}

const INTERP_MS = 100;

export class RemotePlayer {
  readonly peerId: string;
  readonly group: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private readonly nameSprite: THREE.Sprite;
  private prev: RemoteSnapshot;
  private next: RemoteSnapshot;
  private interpAccum = INTERP_MS;

  constructor(peerId: string, name: string, color = 0xc9950a) {
    this.peerId = peerId;
    this.group = new THREE.Group();
    this.group.name = `RemotePlayer:${peerId}`;

    // Capsule body — keeps GPU cost effectively free.
    const geo = new THREE.CapsuleGeometry(0.35, 1.2, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.6, metalness: 0.2,
      emissive: new THREE.Color(color).multiplyScalar(0.15),
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = 0.95;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    this.nameSprite = makeNameplate(name);
    this.nameSprite.position.set(0, 2.4, 0);
    this.group.add(this.nameSprite);

    this.prev = { x: 0, y: 0, z: 0, ry: 0 };
    this.next = { x: 0, y: 0, z: 0, ry: 0 };
  }

  mountTo(parent: THREE.Object3D) {
    parent.add(this.group);
  }

  unmount() {
    this.group.parent?.remove(this.group);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    if (this.nameSprite.material.map) this.nameSprite.material.map.dispose();
    this.nameSprite.material.dispose();
  }

  pushState(s: RemoteSnapshot) {
    this.prev = { ...this.next };
    this.next = s;
    this.interpAccum = 0;
  }

  /** Lerp prev → next over INTERP_MS, clamping after. */
  update(dtSeconds: number) {
    this.interpAccum = Math.min(INTERP_MS, this.interpAccum + dtSeconds * 1000);
    const t = this.interpAccum / INTERP_MS;
    this.group.position.set(
      THREE.MathUtils.lerp(this.prev.x, this.next.x, t),
      THREE.MathUtils.lerp(this.prev.y, this.next.y, t),
      THREE.MathUtils.lerp(this.prev.z, this.next.z, t),
    );
    this.group.rotation.y = THREE.MathUtils.lerp(this.prev.ry, this.next.ry, t);
  }
}

function makeNameplate(name: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5c542';
    ctx.fillText(name.slice(0, 16), c.width / 2, c.height / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.5, 0.4, 1);
  return sprite;
}

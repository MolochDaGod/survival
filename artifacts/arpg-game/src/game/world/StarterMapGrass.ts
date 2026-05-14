/**
 * StarterMapGrass — three layered InstancedMesh grass scattered across
 * the green/lawn surfaces of a loaded starter-map GLB (e.g. main-town).
 *
 * Why three layers?
 *   Real-world grass isn't uniform height. Stacking three passes —
 *   short/mid/tall — with overlapping ranges and slightly different
 *   colour palettes gives the field depth and avoids the "AstroTurf"
 *   look you get from a single-density scatter. (Approach inspired by
 *   thebenezer/FluffyGrass.)
 *
 * Detection:
 *   A mesh in the starter-map root is treated as a grass surface when
 *   either of these hold and `userData.noCollide`/`decal` is NOT set:
 *     a) Its name matches a grass keyword (grass / lawn / garden / turf
 *        / yard / meadow), AND its base material colour is greenish.
 *     b) Its material colour is clearly green AND the mesh is broad-and-
 *        flat (bbox.y span < 1/3 of max(x,z) span).
 *
 * Placement:
 *   For each layer we sample random points inside the union XZ bbox of
 *   the detected meshes, raycast straight down onto them (BVH-accelerated
 *   thanks to StarterMap.computeBoundsTree), and reject hits whose face
 *   normal isn't mostly-up. Layer densities are configured per square
 *   metre so the result scales with the size of the lawn.
 *
 * Cost (after build):
 *   • 3 InstancedMesh draw calls (one per layer).
 *   • 1 shared 3-segment ConeGeometry per layer (5 verts, 4 tris each).
 *   • No per-frame work — entirely static. No shader / time uniforms.
 */

import * as THREE from 'three';

interface LayerSpec {
  name: 'short' | 'mid' | 'tall';
  /** Blades per square metre of detected grass area. */
  density: number;
  /** Cone height range — driven by the per-instance Y scale. */
  heightRange: [number, number];
  /** Cone base radius (X/Z scale of 1.0). */
  baseRadius: number;
  /** Tint palette — one is picked uniformly per blade. */
  colors: number[];
}

const LAYERS: LayerSpec[] = [
  // Dense ground cover — the colour the player perceives when looking down.
  { name: 'short', density: 1.6, heightRange: [0.12, 0.28], baseRadius: 0.022, colors: [0x2d4c1e, 0x3a5f25, 0x4a7c2f] },
  // Mid-height — what you see in the middle distance.
  { name: 'mid',   density: 0.7, heightRange: [0.30, 0.55], baseRadius: 0.030, colors: [0x4a7c2f, 0x5c9c3a, 0x708238] },
  // Sparse tall blades — silhouette pop along the horizon.
  { name: 'tall',  density: 0.22, heightRange: [0.60, 1.05], baseRadius: 0.038, colors: [0x5c9c3a, 0x708238, 0x6fae4e] },
];

const GRASS_NAME_RE = /(grass|lawn|garden|turf|yard|meadow)/i;

/** Hard cap on the area we'll actually populate, in m². Huge bboxes from
 *  partly-detected meshes can otherwise blow placement attempts into the
 *  millions. Tuned generously for typical town layouts. */
const MAX_AREA_M2 = 6000;

export interface BuildOptions {
  /** Multiplier on every layer's density (default 1). Set <1 for low-end. */
  densityScale?: number;
  /** Hard ceiling on area considered (m²). Default 6 000. */
  areaCapM2?: number;
}

export class StarterMapGrass {
  private scene: THREE.Scene;
  private meshes: THREE.InstancedMesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Detect grass surfaces on `mapRoot`, then scatter the three layers.
   * Idempotent: calling twice without disposing in between just appends
   * a second set of meshes — call dispose() if you need to rebuild.
   */
  build(mapRoot: THREE.Object3D, options: BuildOptions = {}): void {
    const densityScale = options.densityScale ?? 1;
    const areaCap = options.areaCapM2 ?? MAX_AREA_M2;

    mapRoot.updateMatrixWorld(true);

    const grassMeshes: THREE.Mesh[] = [];
    mapRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (this.isGrassSurface(obj)) grassMeshes.push(obj);
    });

    if (grassMeshes.length === 0) {
      console.log('[StarterMapGrass] no grass-like surfaces detected on starter map');
      return;
    }

    // Per-mesh world-space XZ bboxes — used for area accounting AND for
    // weighted random sampling (larger lawns get proportionally more
    // attempts).
    const bboxes = grassMeshes.map((m) => new THREE.Box3().setFromObject(m));
    let totalArea = 0;
    const areas: number[] = [];
    for (const b of bboxes) {
      const a = Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.z - b.min.z);
      areas.push(a);
      totalArea += a;
    }
    if (totalArea <= 0) return;
    const cappedArea = Math.min(totalArea, areaCap);

    // CDF for proportional sampling between meshes.
    const cdf: number[] = [];
    let acc = 0;
    for (const a of areas) {
      acc += a;
      cdf.push(acc / totalArea);
    }

    const ray = new THREE.Raycaster();
    // mapRoot meshes already had `computeBoundsTree()` called by StarterMap,
    // so the prototype-patched intersect uses the BVH automatically.
    (ray as unknown as { firstHitOnly?: boolean }).firstHitOnly = true;
    const downDir = new THREE.Vector3(0, -1, 0);
    const tmpOrigin = new THREE.Vector3();
    const tmpNormal = new THREE.Vector3();

    for (const spec of LAYERS) {
      const target = Math.floor(cappedArea * spec.density * densityScale);
      if (target <= 0) continue;

      const positions: { p: THREE.Vector3; faceUp: number }[] = [];
      const maxAttempts = target * 6;
      let attempts = 0;
      while (positions.length < target && attempts < maxAttempts) {
        attempts++;
        // Pick a mesh weighted by XZ area, then a random XZ inside it.
        const r = Math.random();
        let idx = cdf.findIndex((c) => c >= r);
        if (idx < 0) idx = bboxes.length - 1;
        const b = bboxes[idx];
        const x = THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random());
        const z = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());

        tmpOrigin.set(x, b.max.y + 5, z);
        ray.set(tmpOrigin, downDir);
        const hits = ray.intersectObjects(grassMeshes, true);
        if (hits.length === 0) continue;
        const h = hits[0];
        const localN = h.face?.normal;
        if (!localN) continue;
        tmpNormal.copy(localN).transformDirection(h.object.matrixWorld);
        if (tmpNormal.y < 0.6) continue; // skip walls / steep slopes
        positions.push({ p: h.point.clone(), faceUp: tmpNormal.y });
      }

      if (positions.length === 0) continue;

      const geo = new THREE.ConeGeometry(spec.baseRadius, 1.0, 3);
      // Translate up so scaling lifts the tip rather than the centre.
      geo.translate(0, 0.5, 0);
      this.geos.push(geo);

      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, // tinted by per-instance colour
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide,
        flatShading: true,
      });
      this.mats.push(mat);

      const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
      mesh.name = `starter-grass-${spec.name}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      // Decorative — never block raycasts (camera, ground sample, hits).
      mesh.raycast = () => { /* intentional no-op */ };
      // Mark as no-collide so MapColliders/PhysicsWorld skip it.
      mesh.userData.noCollide = true;

      const dummy = new THREE.Object3D();
      const tint = new THREE.Color();
      const white = new THREE.Color(0xffffff);
      for (let i = 0; i < positions.length; i++) {
        const slot = positions[i];
        dummy.position.copy(slot.p);
        // Random yaw + slight bend on X/Z for natural variance.
        const yaw = Math.random() * Math.PI * 2;
        const bendX = (Math.random() - 0.5) * 0.55;
        const bendZ = (Math.random() - 0.5) * 0.55;
        dummy.rotation.set(bendX, yaw, bendZ);
        const sX = 0.55 + Math.random() * 1.05;
        const sY = THREE.MathUtils.lerp(spec.heightRange[0], spec.heightRange[1], Math.random());
        dummy.scale.set(sX, sY, sX);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const hex = spec.colors[Math.floor(Math.random() * spec.colors.length)];
        tint.setHex(hex);
        tint.lerp(white, Math.random() * 0.12); // soft per-blade variance
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      this.scene.add(mesh);
      this.meshes.push(mesh);
    }

    const total = this.meshes.reduce((s, m) => s + m.count, 0);
    console.log(
      `[StarterMapGrass] ${grassMeshes.length} surface(s), `
      + `${totalArea.toFixed(0)} m² (capped @ ${cappedArea.toFixed(0)}), `
      + `${this.meshes.length} layers, ${total} blades.`,
    );
  }

  // ── Detection helpers ──────────────────────────────────────────────────

  private isGrassSurface(m: THREE.Mesh): boolean {
    const ud = (m.userData ?? {}) as Record<string, unknown>;
    if (ud.noCollide || ud.decal || ud.vfx) return false;
    if (m instanceof THREE.SkinnedMesh) return false;

    const named = GRASS_NAME_RE.test(m.name || '')
      || GRASS_NAME_RE.test(m.parent?.name || '');
    const greenish = this.isGreenish(m);
    if (named && greenish) return true;

    // Color-only path: require the mesh to also be broad-and-flat so we
    // don't paint grass on a green-tinted wall or a tree trunk.
    if (greenish && this.isFlatish(m)) return true;

    return false;
  }

  private isGreenish(m: THREE.Mesh): boolean {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const stdMat = mat as THREE.MeshStandardMaterial | undefined;
    const c = stdMat?.color;
    if (!c) return false;
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // Green hue band ≈ 60°..150° → 0.166..0.416 in three's normalised hue.
    return (
      hsl.h >= 0.18 && hsl.h <= 0.42
      && hsl.s >= 0.10
      && hsl.l >= 0.08 && hsl.l <= 0.55
    );
  }

  private isFlatish(m: THREE.Mesh): boolean {
    const b = new THREE.Box3().setFromObject(m);
    const sx = b.max.x - b.min.x;
    const sy = b.max.y - b.min.y;
    const sz = b.max.z - b.min.z;
    const horizontal = Math.max(sx, sz);
    if (horizontal <= 0.5) return false;     // tiny — probably a prop
    return sy < horizontal * 0.34;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      if (mesh.parent) this.scene.remove(mesh);
      mesh.dispose();
    }
    for (const g of this.geos) g.dispose();
    for (const mat of this.mats) mat.dispose();
    this.meshes = [];
    this.geos = [];
    this.mats = [];
  }
}

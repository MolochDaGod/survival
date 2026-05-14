/**
 * GrassSystem — instanced procedural grass that lives on top of the
 * streamed terrain chunks.
 *
 * Design:
 *   • One InstancedMesh per loaded terrain chunk (so we can dispose with
 *     the chunk when it streams out of view).
 *   • All chunks share a single ShaderMaterial; one uniform write per
 *     frame updates time + player position for every blade in the world.
 *   • Per-blade sway driven by sin(time + worldX*k) * vertexY so taller
 *     parts of each blade move further.
 *   • Per-blade collision push: blades within `playerColliderRadius`
 *     of the player are bent away in-shader (no CPU cost per blade).
 *   • Placement uses worldHeight() + getBiome() so grass only spawns on
 *     Grassland / Forest tiles, never on water, beach, mountain, or snow.
 *
 * Hooks:
 *   • WorldChunkManager.loadChunk()  →  GrassSystem.buildChunk(cx, cz)
 *   • WorldChunkManager.evictChunk() →  GrassSystem.destroyChunk(cx, cz)
 *   • GameEngine.update(dt)          →  GrassSystem.tick(dt, player.pos)
 */

import * as THREE from 'three';
import { worldHeight, getBiome, Biome } from './WorldGen';

const BLADES_PER_CHUNK = 1800;          // tuned for ~40k blades across 7x7 grid
const PLAYER_COLLIDER_RADIUS = 0.7;    // metres — matches roughly the player capsule
const BLADE_HEIGHT = 0.55;             // base blade height in metres before per-instance scale

// ---------- Shared, lazily-initialised material + geometry --------------------

let _bladeGeo: THREE.BufferGeometry | null = null;
let _grassMat: GrassMaterial | null = null;
let _refCount = 0;

function getBladeGeometry(): THREE.BufferGeometry {
  if (_bladeGeo) return _bladeGeo;
  // Tapered 3-quad blade: 5 verts, 3 triangles. Visually a thin pointed
  // shape that, with DoubleSide, reads as a grass blade from any angle.
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -0.05, 0.0,        0.0,   // 0 base left
     0.05, 0.0,        0.0,   // 1 base right
    -0.025, BLADE_HEIGHT * 0.5, 0.0,   // 2 mid left
     0.025, BLADE_HEIGHT * 0.5, 0.0,   // 3 mid right
     0.0,  BLADE_HEIGHT,       0.0,   // 4 tip
  ]);
  const indices = [
    0, 1, 2,
    1, 3, 2,
    2, 3, 4,
  ];
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  _bladeGeo = g;
  return g;
}

class GrassMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      side: THREE.DoubleSide,
      transparent: false,
      uniforms: {
        fTime: { value: 0 },
        vPlayerPosition: { value: new THREE.Vector3(0, -1000, 0) },
        fPlayerColliderRadius: { value: PLAYER_COLLIDER_RADIUS },
        vColorBase: { value: new THREE.Color(0x1a3a14) },   // dark base
        vColorTip:  { value: new THREE.Color(0x6fae4e) },   // bright tip
        fBladeHeight: { value: BLADE_HEIGHT },
      },
      vertexShader: /* glsl */`
        uniform float fTime;
        uniform vec3  vPlayerPosition;
        uniform float fPlayerColliderRadius;
        uniform float fBladeHeight;

        varying float fHeight01;       // 0 at base, 1 at tip — for colour gradient
        varying vec3  vTintColor;      // per-instance hue jitter

        // tiny hash → pseudo-random per blade-instance, seeded from instance position
        float hash3(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          // Local Y of the vertex inside the blade is our "height ratio" — used
          // both for colouring and to scale the sway (tip moves more than base).
          fHeight01 = clamp(position.y / max(fBladeHeight, 0.0001), 0.0, 1.0);
          vTintColor = instanceColor;

          // Step 1 — local → world without sway, so we can measure player
          // distance against the blade's *actual* world position.
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);

          // Per-blade phase from the instance origin (column 3 of instanceMatrix
          // in column-major layout).
          vec3 bladeOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float phase = hash3(bladeOrigin) * 6.2831;

          // Step 2 — wind sway. Only the upper portion of the blade bends,
          // base stays planted on the ground.
          float swayAmp = 0.18 * fHeight01;
          vec2 sway = vec2(
            sin(fTime * 1.6 + phase) * swayAmp,
            cos(fTime * 1.1 + phase * 0.7) * swayAmp * 0.6
          );
          worldPos.x += sway.x;
          worldPos.z += sway.y;

          // Step 3 — player push. Soft horizontal repulsion along the
          // (blade → player) vector, only inside the collider radius. The
          // bend amount scales with fHeight01 so the base stays planted.
          vec2 toPlayer = worldPos.xz - vPlayerPosition.xz;
          float dist = length(toPlayer);
          if (dist < fPlayerColliderRadius && dist > 0.0001) {
            vec2 dir = toPlayer / dist;
            float push = (fPlayerColliderRadius - dist) * fHeight01 * 0.9;
            worldPos.xz += dir * push;
          }

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 vColorBase;
        uniform vec3 vColorTip;
        varying float fHeight01;
        varying vec3  vTintColor;

        void main() {
          vec3 col = mix(vColorBase, vColorTip, fHeight01);
          // vTintColor jitters each blade slightly so the field doesn't look uniform.
          col *= mix(vec3(0.85), vec3(1.15), vTintColor);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }
}

function acquireMaterial(): GrassMaterial {
  if (!_grassMat) _grassMat = new GrassMaterial();
  _refCount++;
  return _grassMat;
}

function releaseMaterial() {
  _refCount--;
  if (_refCount <= 0 && _grassMat) {
    _grassMat.dispose();
    _grassMat = null;
    _refCount = 0;
  }
}

// ---------- System ------------------------------------------------------------

interface ChunkGrass {
  mesh: THREE.InstancedMesh;
}

export class GrassSystem {
  private scene: THREE.Scene;
  private chunks = new Map<string, ChunkGrass>();
  private clock = new THREE.Clock();
  private mat: GrassMaterial;
  private bladeGeo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.bladeGeo = getBladeGeometry();
    this.mat = acquireMaterial();
  }

  /**
   * Scatter grass blades over the chunk at integer chunk-coords (cx,cz)
   * with side length `chunkSize` (metres). Skips blades that fall on
   * non-grassy biomes so we don't paint grass on water or rock.
   */
  buildChunk(cx: number, cz: number, chunkSize: number) {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return;

    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    // Pre-collect valid placements so the InstancedMesh.count is exact.
    type Slot = { x: number; y: number; z: number; rot: number; scale: number; tint: number };
    const slots: Slot[] = [];
    for (let i = 0; i < BLADES_PER_CHUNK; i++) {
      const x = originX + Math.random() * chunkSize;
      const z = originZ + Math.random() * chunkSize;
      const y = worldHeight(x, z);
      const biome = getBiome(y);
      if (biome !== Biome.Grassland && biome !== Biome.Forest) continue;
      slots.push({
        x,
        y,
        z,
        rot: Math.random() * Math.PI * 2,
        scale: 0.7 + Math.random() * 0.7,
        tint: Math.random(),
      });
    }

    if (slots.length === 0) {
      // Still register the (empty) chunk so we don't retry on every frame.
      // Cheap stub: an empty mesh with count=0 — not added to the scene.
      const empty = new THREE.InstancedMesh(this.bladeGeo, this.mat, 0);
      this.chunks.set(key, { mesh: empty });
      return;
    }

    const mesh = new THREE.InstancedMesh(this.bladeGeo, this.mat, slots.length);
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Grass is decorative — keep it out of raycasts (camera occlusion,
    // ground sampling, melee hits) so it never blocks gameplay.
    mesh.raycast = () => { /* intentionally no-op */ };

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, s.rot, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Slight per-blade tint variation; the shader uses this as a multiplier.
      tint.setRGB(s.tint, s.tint, s.tint);
      mesh.setColorAt(i, tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    this.scene.add(mesh);
    this.chunks.set(key, { mesh });
  }

  /** Drop grass for a chunk that has streamed out of view. */
  destroyChunk(cx: number, cz: number) {
    const key = `${cx},${cz}`;
    const entry = this.chunks.get(key);
    if (!entry) return;
    if (entry.mesh.parent) this.scene.remove(entry.mesh);
    entry.mesh.dispose();
    this.chunks.delete(key);
  }

  /** Per-frame: refresh time + player position uniforms. */
  tick(playerPos: THREE.Vector3) {
    this.mat.uniforms.fTime.value = this.clock.getElapsedTime();
    this.mat.uniforms.vPlayerPosition.value.copy(playerPos);
  }

  dispose() {
    for (const { mesh } of this.chunks.values()) {
      if (mesh.parent) this.scene.remove(mesh);
      mesh.dispose();
    }
    this.chunks.clear();
    releaseMaterial();
    // bladeGeo is shared module-level; only dispose if no refs remain.
    if (_refCount <= 0 && _bladeGeo) {
      _bladeGeo.dispose();
      _bladeGeo = null;
    }
  }
}

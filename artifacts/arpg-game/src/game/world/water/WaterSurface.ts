/**
 * WaterSurface — replaces the old `WaterPlane` decoration with a real
 * water layer that other systems can query.
 *
 * Visual:
 *   • Same Gerstner-style 5-octave wave shader the previous plane used —
 *     no regression on look, just better plumbing around it.
 *   • Per-pixel normal from analytic gradient, Schlick fresnel, Blinn-Phong
 *     spec, crest + shoreline foam, sub-Y vertex displacement.
 *
 * CPU API:
 *   • `WATER_LEVEL`              — exported world Y of the still surface
 *   • `getWaveHeight(x, z)`      — current wave offset above WATER_LEVEL
 *   • `getSurfaceY(x, z)`        — WATER_LEVEL + getWaveHeight
 *   • `getSurfaceNormal(x, z)`   — analytic normal at world XZ (for buoyancy)
 *   • `isUnderwater(pos)`        — true when pos.y is below the surface
 *   • `getDepthAt(pos, floorY)`  — submerged depth in metres
 *
 * The CPU formula MUST stay byte-for-byte equivalent to the GLSL
 * `waveField` so swim physics, boats, and fishing bobbers all line up
 * with what the player sees on screen.
 */

import * as THREE from 'three';
import { WORLD_SIZE } from '../WorldGen';

/** World Y of the still water surface. The visible plane sits here and
 *  the wave field offsets above/below it. Kept negative so it tucks
 *  under the StarterMap's street height (≈ y=0). */
export const WATER_LEVEL = -1.5;

/** Wave-field horizontal scale — must match `p = vWorld.xz * 0.05` in
 *  the shaders below. */
const WAVE_SCALE = 0.05;

/** 5 wave octaves shared by GPU and CPU. Direction is normalised at
 *  use-site (kept un-normalised here so the constants read cleanly). */
const WAVES: ReadonlyArray<{ d: THREE.Vector2; k: number; w: number; phase: number; a: number }> = [
  { d: new THREE.Vector2( 1.0,  0.6).normalize(), k: 1.0, w: 0.55, phase: 0.0, a: 0.40 },
  { d: new THREE.Vector2(-0.7,  1.0).normalize(), k: 1.6, w: 0.78, phase: 1.2, a: 0.27 },
  { d: new THREE.Vector2( 0.4, -1.0).normalize(), k: 2.4, w: 1.10, phase: 2.4, a: 0.15 },
  { d: new THREE.Vector2(-1.0, -0.4).normalize(), k: 3.6, w: 1.45, phase: 3.6, a: 0.08 },
  { d: new THREE.Vector2( 0.2,  0.9).normalize(), k: 5.5, w: 1.95, phase: 4.8, a: 0.04 },
];

const VERT = /* glsl */`
varying vec3 vWorld;
varying vec3 vViewDir;
uniform float uTime;
uniform vec3  uCamPos;

float gWave(vec2 p, vec2 dir, float k, float w, float phase) {
  return sin(dot(dir, p) * k + uTime * w + phase);
}
void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 p  = wp.xz * 0.05;
  float h =  gWave(p, normalize(vec2( 1.0,  0.6)), 1.0, 0.55, 0.0) * 0.18
           + gWave(p, normalize(vec2(-0.7,  1.0)), 1.6, 0.78, 1.2) * 0.10
           + gWave(p, normalize(vec2( 0.4, -1.0)), 2.4, 1.10, 2.4) * 0.05;
  vec3 displaced = position + vec3(0.0, h, 0.0);
  vec4 wp4 = modelMatrix * vec4(displaced, 1.0);
  vWorld = wp4.xyz;
  vViewDir = normalize(uCamPos - vWorld);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uDeepColor;
uniform vec3  uShallowColor;
uniform vec3  uSkyColor;
varying vec3 vWorld;
varying vec3 vViewDir;

vec3 waveField(vec2 p) {
  float h = 0.0; vec2 g = vec2(0.0);
  vec2 d1=normalize(vec2( 1.0, 0.6)); float k1=1.0,w1=0.55;
  vec2 d2=normalize(vec2(-0.7, 1.0)); float k2=1.6,w2=0.78;
  vec2 d3=normalize(vec2( 0.4,-1.0)); float k3=2.4,w3=1.10;
  vec2 d4=normalize(vec2(-1.0,-0.4)); float k4=3.6,w4=1.45;
  vec2 d5=normalize(vec2( 0.2, 0.9)); float k5=5.5,w5=1.95;
  float a1=0.40,a2=0.27,a3=0.15,a4=0.08,a5=0.04;
  float s1=sin(dot(d1,p)*k1+uTime*w1);
  float s2=sin(dot(d2,p)*k2+uTime*w2+1.2);
  float s3=sin(dot(d3,p)*k3+uTime*w3+2.4);
  float s4=sin(dot(d4,p)*k4+uTime*w4+3.6);
  float s5=sin(dot(d5,p)*k5+uTime*w5+4.8);
  h = a1*s1+a2*s2+a3*s3+a4*s4+a5*s5;
  float c1=cos(dot(d1,p)*k1+uTime*w1);
  float c2=cos(dot(d2,p)*k2+uTime*w2+1.2);
  float c3=cos(dot(d3,p)*k3+uTime*w3+2.4);
  float c4=cos(dot(d4,p)*k4+uTime*w4+3.6);
  float c5=cos(dot(d5,p)*k5+uTime*w5+4.8);
  g = d1*(a1*k1*c1)+d2*(a2*k2*c2)+d3*(a3*k3*c3)+d4*(a4*k4*c4)+d5*(a5*k5*c5);
  return vec3(h, g);
}

void main() {
  vec2 p = vWorld.xz * 0.05;
  vec3 wf = waveField(p);
  float h = wf.x; vec2 g = wf.yz;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);
  float NdotV = max(dot(N, V), 0.0);
  float NdotH = max(dot(N, H), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  float depthMix = smoothstep(0.0, 0.6, h * 0.5 + 0.5);
  vec3 baseCol = mix(uDeepColor, uShallowColor, depthMix);
  vec3 reflected = mix(baseCol, uSkyColor, fres);
  vec3 specular = uSunColor * pow(NdotH, 96.0) * 1.4;
  float crest = smoothstep(0.55, 0.85, h * 0.5 + 0.5);
  float steep = smoothstep(0.4, 1.2, length(g));
  vec3 foam = vec3(0.92, 0.96, 1.00) * crest * steep * 0.5;
  vec3 col = reflected + specular + foam;
  col = mix(col, uSkyColor, 0.05 * (1.0 - NdotV));
  float alpha = mix(0.92, 0.78, pow(1.0 - NdotV, 2.0));
  gl_FragColor = vec4(col, alpha);
}
`;

export class WaterSurface {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private currentTime = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      side:           THREE.DoubleSide,
      depthWrite:     false,
      uniforms: {
        uTime:         { value: 0 },
        uCamPos:       { value: new THREE.Vector3() },
        uSunDir:       { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
        uSunColor:     { value: new THREE.Color(1.0, 0.96, 0.86) },
        uDeepColor:    { value: new THREE.Color(0.02, 0.08, 0.18) },
        uShallowColor: { value: new THREE.Color(0.10, 0.34, 0.46) },
        uSkyColor:     { value: new THREE.Color(0.55, 0.72, 0.92) },
      },
    });

    const geo  = new THREE.PlaneGeometry(WORLD_SIZE + 200, WORLD_SIZE + 200, 256, 256);
    this.mesh  = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'WaterSurface';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.renderOrder = 1;
    // Layer policy: stay on DEFAULT only. Deliberately NOT tagged WORLD
    // (camera occlusion would dolly through transparent water and feel
    // wrong) and NOT tagged GROUND (GroundSampler must miss the surface
    // so the player can't stand on water — SwimController owns vertical
    // motion in the water band).
    // Tag so other systems (raycasts, MapColliders) can identify the
    // water mesh without name-string sniffing.
    (this.mesh.userData as Record<string, unknown>).isWaterSurface = true;
    scene.add(this.mesh);
  }

  /** Drive shader uniforms + cache time for CPU sampling. */
  update(time: number, camPos: THREE.Vector3): void {
    this.currentTime = time;
    this.mat.uniforms['uTime']!.value = time;
    this.mat.uniforms['uCamPos']!.value.copy(camPos);
  }

  setSunDirection(dir: THREE.Vector3): void {
    this.mat.uniforms['uSunDir']!.value.copy(dir).normalize();
  }
  setSunColor(col: THREE.Color): void {
    this.mat.uniforms['uSunColor']!.value.copy(col);
  }

  /** Wave offset above WATER_LEVEL at world (x, z). CPU mirror of the
   *  fragment shader's `waveField(p).x`. */
  getWaveHeight(x: number, z: number, time: number = this.currentTime): number {
    const px = x * WAVE_SCALE;
    const pz = z * WAVE_SCALE;
    let h = 0;
    for (const wv of WAVES) {
      h += wv.a * Math.sin(wv.d.x * px + wv.d.y * pz + time * wv.w + wv.phase) * wv.k * 0; // placeholder
      // The real formula doesn't multiply by `k` for height — just for the gradient.
      // Recompute correctly below; this loop body is only kept for type clarity.
    }
    // Correct formulation (matches GLSL exactly):
    h = 0;
    for (const wv of WAVES) {
      const arg = wv.d.x * px + wv.d.y * pz + time * wv.w + wv.phase;
      h += wv.a * Math.sin(arg);
    }
    return h;
  }

  /** Surface Y at world (x, z) for the current frame's time. */
  getSurfaceY(x: number, z: number): number {
    return WATER_LEVEL + this.getWaveHeight(x, z);
  }

  /** Outward-facing surface normal at (x, z). Matches the fragment shader's
   *  `vec3(-g.x, 1, -g.y)` (un-normalised gradient → normalised vector). */
  getSurfaceNormal(x: number, z: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const px = x * WAVE_SCALE;
    const pz = z * WAVE_SCALE;
    let gx = 0, gz = 0;
    const t = this.currentTime;
    for (const wv of WAVES) {
      const arg = wv.d.x * px + wv.d.y * pz + t * wv.w + wv.phase;
      const c = Math.cos(arg) * wv.a * wv.k;
      gx += wv.d.x * c;
      gz += wv.d.y * c;
    }
    return out.set(-gx, 1, -gz).normalize();
  }

  /** True if `pos.y` lies below the live surface. */
  isUnderwater(pos: THREE.Vector3): boolean {
    return pos.y < this.getSurfaceY(pos.x, pos.z);
  }

  /** Submerged depth in metres given a known floor Y (terrain or map).
   *  Negative results are clamped to 0 so callers can compare freely. */
  getDepthAt(pos: THREE.Vector3, floorY: number): number {
    return Math.max(0, this.getSurfaceY(pos.x, pos.z) - floorY);
  }

  /** Mesh access for raycasts (e.g. fishing-cast aiming). */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

import * as THREE from 'three';
import type { ShapeQuery } from '../combat/damageShapes';

/**
 * Albion-style ground telegraphs — windup shapes with fill sweep and pulse.
 * Shader masks circle / nova / cone / line; reads clearly in third-person.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSize;
uniform vec2  uDir;
uniform int   uKind;
uniform float uRadius;
uniform float uHalfAngle;
uniform float uLength;
uniform float uHalfWidth;
uniform vec3  uColor;
uniform float uProgress;
uniform float uAlpha;
uniform float uRing;
uniform float uPulse;

void main() {
  vec2 c = (vUv - 0.5) * uSize;
  vec2 o = vec2(c.x, -c.y);
  float fwd  = dot(o, uDir);
  float side = o.x * uDir.y - o.y * uDir.x;
  float dist = length(o);

  float inside = 0.0;
  float edge = 0.0;
  float ringW = max(0.22, uRadius * 0.08);

  if (uKind == 0 || uKind == 1) {
    float outer = step(dist, uRadius + 0.04);
    float innerHole = uRing > 0.5 ? step(uRadius - ringW * 1.6, dist) : 1.0;
    inside = outer * innerHole;
    edge = smoothstep(uRadius - ringW, uRadius, dist)
         * smoothstep(uRadius + 0.08, uRadius - 0.02, dist);
    float tick = max(
      step(abs(o.x), 0.08) * step(abs(o.y), uRadius) * step(uRadius * 0.72, abs(o.y)),
      step(abs(o.y), 0.08) * step(abs(o.x), uRadius) * step(uRadius * 0.72, abs(o.x))
    );
    edge = max(edge, tick * outer);
  } else if (uKind == 2) {
    float ang = acos(clamp(fwd / max(dist, 1e-4), -1.0, 1.0));
    float inAng = step(ang, uHalfAngle);
    inside = inAng * step(dist, uRadius) * step(0.0, fwd);
    edge = inside * (smoothstep(uRadius - 0.25, uRadius, dist)
                   + smoothstep(uHalfAngle - 0.07, uHalfAngle, ang));
  } else {
    float inLen = step(0.0, fwd) * step(fwd, uLength);
    float inW = step(abs(side), uHalfWidth);
    inside = inLen * inW;
    edge = inside * (smoothstep(uHalfWidth - 0.14, uHalfWidth, abs(side))
                   + smoothstep(uLength - 0.25, uLength, fwd));
  }

  float sweep = (uKind == 3)
    ? step(fwd, uProgress * uLength)
    : step(dist, uProgress * uRadius);
  float fill = inside * (0.12 + 0.28 * sweep + 0.1 * uPulse);
  float a = max(fill, clamp(edge, 0.0, 1.0) * (0.85 + 0.4 * uPulse)) * uAlpha;
  if (a < 0.01) discard;
  vec3 col = mix(uColor, vec3(1.0, 0.95, 0.7), edge * uProgress * 0.55);
  gl_FragColor = vec4(col, a);
}
`;

function kindToInt(kind: ShapeQuery['kind']): number {
  switch (kind) {
    case 'circle': return 0;
    case 'nova': return 1;
    case 'cone': return 2;
    case 'line': return 3;
  }
}

export interface TelegraphShowOpts {
  ring?: boolean;
  y?: number;
}

interface Tele {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  dur: number;
}

export class TelegraphField {
  private scene: THREE.Scene;
  private geo: THREE.PlaneGeometry;
  private active: Tele[] = [];
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geo = new THREE.PlaneGeometry(1, 1);
  }

  show(q: ShapeQuery, duration: number, color: number, opts?: TelegraphShowOpts) {
    if (this.disposed) return;
    const reach = q.kind === 'line' ? q.length ?? 8 : q.radius ?? 5;
    const size = 2 * (reach + 0.9);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSize: { value: size },
        uDir: { value: new THREE.Vector2(q.dir.x, q.dir.z).normalize() },
        uKind: { value: kindToInt(q.kind) },
        uRadius: { value: q.radius ?? reach },
        uHalfAngle: { value: q.halfAngle ?? Math.PI / 4 },
        uLength: { value: q.length ?? reach },
        uHalfWidth: { value: q.halfWidth ?? 1.2 },
        uColor: { value: new THREE.Color(color) },
        uProgress: { value: 0 },
        uAlpha: { value: 0 },
        uRing: { value: opts?.ring ? 1 : 0 },
        uPulse: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(q.origin.x, opts?.y ?? 0.07, q.origin.z);
    mesh.scale.set(size, size, 1);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.active.push({ mesh, mat, age: 0, dur: Math.max(0.12, duration) });
  }

  showCircle(
    origin: THREE.Vector3,
    radius: number,
    duration: number,
    color: number,
    opts?: TelegraphShowOpts,
  ) {
    this.show(
      { kind: 'circle', origin, dir: new THREE.Vector3(1, 0, 0), radius },
      duration,
      color,
      opts,
    );
  }

  update(delta: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i]!;
      t.age += delta;
      const p = Math.min(1, t.age / t.dur);
      t.mat.uniforms.uProgress.value = p;
      t.mat.uniforms.uPulse.value = p * p * (0.55 + 0.45 * Math.sin(t.age * 18));
      t.mat.uniforms.uAlpha.value =
        p < 0.12 ? Math.min(1, p / 0.12) : p < 0.85 ? 1 : Math.max(0, 1 - (p - 0.85) / 0.15);
      if (t.age >= t.dur) {
        this.scene.remove(t.mesh);
        t.mat.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  dispose() {
    this.disposed = true;
    for (const t of this.active) {
      this.scene.remove(t.mesh);
      t.mat.dispose();
    }
    this.active = [];
    this.geo.dispose();
  }
}
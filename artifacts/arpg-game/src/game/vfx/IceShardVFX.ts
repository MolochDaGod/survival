/**
 * IceShardVFX — ice crystal eruption + ground frost disc.
 *
 * On burst():
 *   • 8 hexagonal ice spikes rise from the ground radially outward.
 *   • A flat frost disc (CircleGeometry) appears on the ground using a
 *     Voronoi crystal ShaderMaterial adapted from Shader.lab crystal.glsl
 *     (Voronoi noise by zackpudil, BigWings, iq; MIT licence).
 *   • A PointLight(0x66ccff) flashes for 0.3 s for scene illumination.
 *
 * Usage:
 *   const ice = new IceShardVFX(scene);
 *   ice.burst(hitPos);           // use ground-level position
 *   // in game loop:
 *   ice.update(dt);
 */

import * as THREE from 'three';

// ── Frost disc shaders (Voronoi crystal, adapted from crystal.glsl) ───────────

const DISC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISC_FRAG = /* glsl */ `
  // Voronoi ice crystal pattern.
  // Adapted from Shader.lab crystal.glsl — original by zackpudil.

  uniform float uTime;
  uniform float uAlpha;

  varying vec2 vUv;

  vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(41.0, 289.0)));
    return fract(vec2(262144.0, 32768.0) * n);
  }

  float voronoi(vec2 p) {
    vec2 ip = floor(p);
    p = fract(p);
    float d = 1.0;
    for (float i = -1.0; i < 1.1; i++) {
      for (float j = -1.0; j < 1.1; j++) {
        vec2 cell = vec2(i, j);
        vec2 r = cell + hash22(ip + cell) - p;
        d = min(d, dot(r, r));
      }
    }
    return sqrt(d);
  }

  void main() {
    // Map [0,1] UV to centred space [-2,2]
    vec2 uv = (vUv - 0.5) * 4.0;

    // Slow rotation over time
    float th = uTime * 0.25;
    float cs = cos(th), si = sin(th);
    uv = mat2(cs, -si, si, cs) * uv;

    const float L = 6.0;
    float sum = 0.0, f = 0.0;
    float t2 = uTime * 0.5;

    // Rotating mat2 — compounding rotation each iteration
    mat2 M = mat2(0.7071, -0.7071, 0.7071, 0.7071);

    for (float i = 0.0; i < L; i++) {
      float s = fract((i - t2 * 2.0) / L);
      float e = exp2(s * L) * 0.1;
      float a = (1.0 - cos(s * 6.2832)) / max(e, 1e-4);
      f   += voronoi(M * uv * e + vec2(0.9)) * a;
      sum += a;
      M   *= M;
    }
    f /= max(sum, 0.001);

    // Radial vignette to keep disc circular
    float r = length(vUv - 0.5) * 2.0;        // 0..1 at edge
    float edge = 1.0 - smoothstep(0.7, 1.0, r);

    // Ice color: bright white core fading to cyan at edges
    vec3 col = mix(vec3(0.35, 0.80, 1.00),     // cyan
                   vec3(1.00, 1.00, 1.00),      // white
                   f);
    col *= edge;

    float alpha = edge * uAlpha * smoothstep(0.0, 0.15, f);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Shard material (shared across all spikes in a burst) ─────────────────────

const _shardMat = new THREE.MeshStandardMaterial({
    color: 0xaaddff,
    emissive: new THREE.Color(0.1, 0.4, 0.8),
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.85,
    roughness: 0.05,
    metalness: 0.3,
});

// Hexagonal prism for each spike (tapering to a point at the top)
function makeShardGeo() {
    return new THREE.CylinderGeometry(0.0, 0.06, 1.0, 6, 1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShardInst {
    mesh: THREE.Mesh;
    velY: number;     // initial upward velocity
    angle: number;     // radial angle on XZ plane
    spread: number;     // outward speed
    age: number;
    lifetime: number;
}

interface DiscInst {
    mesh: THREE.Mesh;
    mat: THREE.ShaderMaterial;
    age: number;
    lifetime: number;
}

interface LightInst {
    light: THREE.PointLight;
    age: number;
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class IceShardVFX {
    private scene: THREE.Scene;
    private shards: ShardInst[] = [];
    private discs: DiscInst[] = [];
    private lights: LightInst[] = [];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * Erupt ice spikes from `pos` (use ground-level Y).
     * `radius` controls how far out the spikes land.
     * `count` is the number of spikes (default 8).
     */
    burst(pos: THREE.Vector3, radius = 2.4, count = 8, lifetime = 2.0) {
        // ── Ground frost disc ────────────────────────────────────────────────────
        const discMat = new THREE.ShaderMaterial({
            vertexShader: DISC_VERT,
            fragmentShader: DISC_FRAG,
            uniforms: {
                uTime: { value: 0 },
                uAlpha: { value: 0 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });

        const discGeo = new THREE.CircleGeometry(radius * 1.1, 48);
        const discMesh = new THREE.Mesh(discGeo, discMat);
        discMesh.rotation.x = -Math.PI / 2;
        discMesh.position.copy(pos).setY(pos.y + 0.02);  // just above ground
        this.scene.add(discMesh);
        this.discs.push({ mesh: discMesh, mat: discMat, age: 0, lifetime });

        // ── Ice spikes ───────────────────────────────────────────────────────────
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const spread = radius * (0.6 + Math.random() * 0.4);
            const height = 0.5 + Math.random() * 0.6;    // shard height scale
            const velY = 2.5 + Math.random() * 2.0;    // initial upward pop
            const tilt = 0.2 + Math.random() * 0.4;    // tilt from vertical

            const geo = makeShardGeo();
            const mesh = new THREE.Mesh(geo, _shardMat);
            mesh.scale.set(0.6 + Math.random() * 0.4, height, 0.6 + Math.random() * 0.4);
            mesh.position.copy(pos);

            // Tilt spikes outward from center
            const tiltAxis = new THREE.Vector3(Math.cos(angle + Math.PI / 2), 0, Math.sin(angle + Math.PI / 2));
            mesh.quaternion.setFromAxisAngle(tiltAxis, tilt);

            this.scene.add(mesh);
            this.shards.push({ mesh, velY, angle, spread, age: 0, lifetime });
        }

        // ── Point light ──────────────────────────────────────────────────────────
        const light = new THREE.PointLight(0x66ccff, 6, 12);
        light.position.copy(pos).setY(pos.y + 1.5);
        this.scene.add(light);
        this.lights.push({ light, age: 0 });
    }

    /** Tick per frame. */
    update(dt: number) {
        // ── Shards ───────────────────────────────────────────────────────────────
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            s.age += dt;

            const t = s.age / s.lifetime;
            const tEase = Math.sin(t * Math.PI);   // 0→1→0 arc

            // Move shard outward + upward with gravity-like arc
            const outward = s.spread * (1 - Math.cos(t * Math.PI)) * 0.5;
            const upY = s.velY * Math.sin(t * Math.PI * 0.6) * dt;

            s.mesh.position.x += Math.cos(s.angle) * outward * 0.015;
            s.mesh.position.z += Math.sin(s.angle) * outward * 0.015;
            s.mesh.position.y += upY;

            // Fade out last 30 % of lifetime
            const fade = t < 0.7 ? 1.0 : 1.0 - (t - 0.7) / 0.3;
            (_shardMat as THREE.MeshStandardMaterial).opacity = 0.85 * Math.max(0, fade);

            if (s.age >= s.lifetime) {
                this.scene.remove(s.mesh);
                s.mesh.geometry.dispose();
                this.shards.splice(i, 1);
            }
        }

        // ── Frost discs ──────────────────────────────────────────────────────────
        for (let i = this.discs.length - 1; i >= 0; i--) {
            const d = this.discs[i];
            d.age += dt;
            d.mat.uniforms['uTime'].value = d.age;

            const t = d.age / d.lifetime;
            // Fade in first 20 %, hold, fade out last 25 %
            const fadeIn = Math.min(t / 0.2, 1.0);
            const fadeOut = t > 0.75 ? 1.0 - (t - 0.75) / 0.25 : 1.0;
            d.mat.uniforms['uAlpha'].value = fadeIn * fadeOut;

            if (d.age >= d.lifetime) {
                this.scene.remove(d.mesh);
                d.mesh.geometry.dispose();
                d.mat.dispose();
                this.discs.splice(i, 1);
            }
        }

        // ── Point lights ─────────────────────────────────────────────────────────
        for (let i = this.lights.length - 1; i >= 0; i--) {
            const l = this.lights[i];
            l.age += dt;
            const t = l.age / 0.4;   // 0.4 s lifetime
            l.light.intensity = 6 * Math.max(0, 1 - t);
            if (l.age >= 0.4) {
                this.scene.remove(l.light);
                this.lights.splice(i, 1);
            }
        }
    }

    dispose() {
        for (const s of this.shards) {
            this.scene.remove(s.mesh);
            s.mesh.geometry.dispose();
        }
        for (const d of this.discs) {
            this.scene.remove(d.mesh);
            d.mesh.geometry.dispose();
            d.mat.dispose();
        }
        for (const l of this.lights) {
            this.scene.remove(l.light);
        }
        this.shards = [];
        this.discs = [];
        this.lights = [];
    }
}

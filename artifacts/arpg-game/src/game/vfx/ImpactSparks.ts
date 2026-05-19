/**
 * ImpactSparks — procedural bullet-impact VFX. No GLB assets required.
 *
 * Each `burst()` call spawns:
 *   1. Spark particles — 10-14 tiny points ejected in a hemisphere above
 *      the surface normal with drag and gravity, lifetime ~0.3 s.
 *   2. Smoke puff — a disc that grows in scale and fades, sitting flat
 *      against the hit surface (skipped for scale < 0.6 to save draw calls).
 *
 * Sparks use AdditiveBlending for a bright pop; smoke uses NormalBlending
 * with a low grey opacity for a subtle darkened whisp.
 *
 * Usage:
 *   const sparks = new ImpactSparks(scene);
 *   // on bullet hit:
 *   sparks.burst(hitPoint, surfaceNormalWorldSpace);
 *   // per frame:
 *   sparks.update(dt);
 *   // on teardown:
 *   sparks.dispose();
 */

import * as THREE from 'three';

// Shared smoke geometry — reused across all instances (no mutation on render).
const _SMOKE_GEO = new THREE.CircleGeometry(0.06, 8);

// ── Internal state per active impact ─────────────────────────────────────────

interface ImpactInstance {
    age: number;
    lifetime: number;
    sparks: THREE.Points;
    sparkMat: THREE.PointsMaterial;
    sparkPos: Float32Array;   // view into the BufferAttribute array
    sparkVels: Float32Array;
    smoke: THREE.Mesh | null;
    smokeMat: THREE.MeshBasicMaterial | null;
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class ImpactSparks {
    private readonly _scene: THREE.Scene;
    private readonly _active: ImpactInstance[] = [];

    constructor(scene: THREE.Scene) {
        this._scene = scene;
    }

    /**
     * Spawn a bullet impact burst.
     *
     * @param position  World-space hit point.
     * @param normal    World-space surface normal. Pass `null` to use up-vector.
     * @param color     Spark tint. Default warm yellow-white for standard bullets.
     * @param scale     Size multiplier. Use 1.0 for rifle/pistol, 1.4 for
     *                  shotgun, 2.0 for explosive impacts.
     */
    burst(
        position: THREE.Vector3,
        normal: THREE.Vector3 | null,
        color: THREE.ColorRepresentation = 0xffdd88,
        scale = 1.0,
    ): void {
        const n = (normal ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
        const col = new THREE.Color(color);

        // ── Orthonormal basis around normal ────────────────────────────────────
        // Used to distribute spark velocities in a reflected hemisphere.
        const tangent = Math.abs(n.x) > 0.8
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
        const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize();
        tangent.crossVectors(bitangent, n).normalize();

        // ── Spark particles ────────────────────────────────────────────────────
        const count = 10 + Math.floor(Math.random() * 5); // 10-14
        const sparkPos = new Float32Array(count * 3);
        const sparkVels = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const spread = Math.random() * 0.8;          // hemispherical spread 0-1
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            // Direction biased toward the surface normal (reflected hemisphere)
            const vx = n.x + (tangent.x * cosT + bitangent.x * sinT) * spread;
            const vy = n.y + (tangent.y * cosT + bitangent.y * sinT) * spread + 0.1;
            const vz = n.z + (tangent.z * cosT + bitangent.z * sinT) * spread;
            const speed = (2 + Math.random() * 5) * scale;
            const norm = Math.hypot(vx, vy, vz) || 1;

            sparkPos[i * 3] = position.x;
            sparkPos[i * 3 + 1] = position.y;
            sparkPos[i * 3 + 2] = position.z;
            sparkVels[i * 3] = (vx / norm) * speed;
            sparkVels[i * 3 + 1] = (vy / norm) * speed;
            sparkVels[i * 3 + 2] = (vz / norm) * speed;
        }

        const sparkGeo = new THREE.BufferGeometry();
        sparkGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage),
        );
        const sparkMat = new THREE.PointsMaterial({
            color: col,
            size: 0.05 * scale,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });
        const sparks = new THREE.Points(sparkGeo, sparkMat);
        this._scene.add(sparks);

        // ── Smoke puff (skipped for tiny impacts) ──────────────────────────────
        let smoke: THREE.Mesh | null = null;
        let smokeMat: THREE.MeshBasicMaterial | null = null;

        if (scale >= 0.6) {
            smokeMat = new THREE.MeshBasicMaterial({
                color: 0x888888,
                transparent: true,
                opacity: 0.32 * Math.min(scale, 1.5),
                depthWrite: false,
                blending: THREE.NormalBlending,
                side: THREE.DoubleSide,
            });
            smoke = new THREE.Mesh(_SMOKE_GEO, smokeMat);
            smoke.position.copy(position).addScaledVector(n, 0.04);
            smoke.scale.setScalar(scale);

            // Orient smoke disc perpendicular to the surface normal
            const up = new THREE.Vector3(0, 1, 0);
            if (Math.abs(n.dot(up)) < 0.99) {
                smoke.quaternion.setFromUnitVectors(up, n);
            }
            this._scene.add(smoke);
        }

        this._active.push({
            age: 0,
            lifetime: 0.3,
            sparks,
            sparkMat,
            sparkPos,
            sparkVels,
            smoke,
            smokeMat,
        });
    }

    /** Tick all active impacts. Call once per frame. */
    update(dt: number): void {
        for (let i = this._active.length - 1; i >= 0; i--) {
            const fx = this._active[i]!;
            fx.age += dt;
            const t = fx.age / fx.lifetime; // 0 → 1

            // Sparks: physics (drag + gravity) + opacity fade
            for (let p = 0; p < fx.sparkPos.length; p += 3) {
                fx.sparkPos[p] += fx.sparkVels[p] * dt;
                fx.sparkPos[p + 1] += fx.sparkVels[p + 1] * dt - 9.8 * dt * dt;
                fx.sparkPos[p + 2] += fx.sparkVels[p + 2] * dt;
                // Lateral drag (y is handled by gravity above)
                fx.sparkVels[p] *= 1 - 3 * dt;
                fx.sparkVels[p + 2] *= 1 - 3 * dt;
            }
            (fx.sparks.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
            fx.sparkMat.opacity = Math.max(0, 1 - t * 1.4);

            // Smoke: grow + fade over 70% of lifetime
            if (fx.smoke && fx.smokeMat) {
                const smokeT = Math.min(t / 0.7, 1);
                fx.smoke.scale.setScalar((1 + smokeT * 1.8));
                fx.smokeMat.opacity = Math.max(0, 0.32 * (1 - smokeT));
            }

            if (fx.age >= fx.lifetime) {
                this._scene.remove(fx.sparks);
                fx.sparkMat.dispose();
                fx.sparks.geometry.dispose();
                if (fx.smoke) this._scene.remove(fx.smoke);
                fx.smokeMat?.dispose();
                this._active.splice(i, 1);
            }
        }
    }

    /** Remove and dispose all active impacts immediately. */
    dispose(): void {
        for (const fx of this._active) {
            this._scene.remove(fx.sparks);
            fx.sparkMat.dispose();
            fx.sparks.geometry.dispose();
            if (fx.smoke) this._scene.remove(fx.smoke);
            fx.smokeMat?.dispose();
        }
        this._active.length = 0;
    }
}

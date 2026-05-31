/**
 * RibbonTrail — camera-billboarded GPU quad-strip trail for projectiles and
 * magic effects. Replaces the old flat THREE.Line tracer with a properly
 * tapered, alpha-faded ribbon that always faces the viewer.
 *
 * Architecture:
 *   - Maintains a ring buffer of N world-space positions.
 *   - Each frame, rebuilds (N-1) quads (2 triangles each) with:
 *       • Width tapering: 0 at tail → `width` at head (newest point)
 *       • Alpha fading:   0 at tail → 1 at head
 *       • Additive blending — only adds light, never darkens the scene.
 *   - Billboard strategy: each quad edge is offset along `camera.right`
 *     (computed via cross product of segment dir × camera-to-segment).
 *     Falls back to world-up when camera is omitted.
 *
 * Performance:
 *   - Single Float32Array rebuilt per frame — zero heap allocations on the hot path.
 *   - `mesh` is public so callers add/remove it from the scene exactly once.
 *
 * Usage:
 *   const trail = new RibbonTrail({ color: 0xffff88, width: 0.1, segments: 16 });
 *   scene.add(trail.mesh);
 *   // per frame:
 *   trail.addPoint(projectile.mesh.position);
 *   trail.rebuildGeom(camera);  // call AFTER addPoint, before render
 *   // on removal:
 *   trail.dispose();
 *   scene.remove(trail.mesh);
 */

import * as THREE from 'three';

export interface RibbonTrailOptions {
    /** Number of history positions to keep. More = longer trail. Default 16. */
    segments?: number;
    /** Width of the ribbon at the head (newest point) in world units. Default 0.08. */
    width?: number;
    /** RGB tint of the ribbon. Default white. */
    color?: THREE.ColorRepresentation;
    /** Head opacity (tail always fades to 0). Default 0.9. */
    opacity?: number;
}

// ── Shader ────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  attribute float aAlpha;
  varying   float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float a = vAlpha * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

// ── Material cache (shared by color + opacity key) ────────────────────────────

const _matCache = new Map<string, THREE.ShaderMaterial>();

function _getMat(color: THREE.Color, opacity: number): THREE.ShaderMaterial {
    const key = `${color.getHexString()}_${opacity.toFixed(2)}`;
    let mat = _matCache.get(key);
    if (!mat) {
        mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: color.clone() },
                uOpacity: { value: opacity },
            },
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        _matCache.set(key, mat);
    }
    return mat;
}

// ── Scratch vectors (zero allocations on hot path) ────────────────────────────

const _right = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _segDir = new THREE.Vector3();

// ── Class ─────────────────────────────────────────────────────────────────────

export class RibbonTrail {
    /** Add this to the scene once; the system updates it each frame. */
    readonly mesh: THREE.Mesh;

    private readonly _maxSegs: number;
    private readonly _width: number;
    private readonly _history: THREE.Vector3[] = [];
    private readonly _geom: THREE.BufferGeometry;
    private readonly _pos: Float32Array;
    private readonly _alpha: Float32Array;

    constructor(opts: RibbonTrailOptions = {}) {
        const segs = Math.max(3, opts.segments ?? 16);
        const width = opts.width ?? 0.08;
        const color = new THREE.Color(opts.color ?? 0xffffff);
        const opacity = opts.opacity ?? 0.9;

        this._maxSegs = segs;
        this._width = width;

        // (N-1) quads × 2 tris × 3 verts = 6*(N-1) verts
        const maxVerts = 6 * (segs - 1);
        this._pos = new Float32Array(maxVerts * 3);
        this._alpha = new Float32Array(maxVerts);

        this._geom = new THREE.BufferGeometry();
        this._geom.setAttribute(
            'position',
            new THREE.BufferAttribute(this._pos, 3).setUsage(THREE.DynamicDrawUsage),
        );
        this._geom.setAttribute(
            'aAlpha',
            new THREE.BufferAttribute(this._alpha, 1).setUsage(THREE.DynamicDrawUsage),
        );

        this.mesh = new THREE.Mesh(this._geom, _getMat(color, opacity));
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1; // draw on top of opaque geo
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /** Push a new world-space point. Old points beyond maxSegs are discarded. */
    addPoint(p: THREE.Vector3): void {
        this._history.push(p.clone());
        if (this._history.length > this._maxSegs) this._history.shift();
    }

    /**
     * Rebuild geometry from the current history.
     * Call every frame AFTER addPoint(), before the renderer runs.
     *
     * @param camera  Optional — used to compute the billboard right vector so
     *                the ribbon always faces the viewer.  Omit for a flat
     *                world-space ribbon (falls back to world-up orientation).
     */
    rebuildGeom(camera?: THREE.Camera): void {
        const N = this._history.length;
        if (N < 2) {
            this._geom.setDrawRange(0, 0);
            return;
        }

        const maxQuads = N - 1;
        let vi = 0; // flat vertex-index into _pos (×3)
        let ai = 0; // flat vertex-index into _alpha

        for (let i = 0; i < maxQuads; i++) {
            const t0 = i / (N - 1); // 0 = tail, 1 = head
            const t1 = (i + 1) / (N - 1);

            const p0 = this._history[i]!;
            const p1 = this._history[i + 1]!;

            // Half-widths taper linearly: 0 at tail, _width/2 at head
            const hw0 = this._width * 0.5 * t0;
            const hw1 = this._width * 0.5 * t1;

            // Billboard right direction
            if (camera) {
                // Camera → midpoint direction
                _camDir.addVectors(p0, p1).multiplyScalar(0.5).sub(camera.position).normalize();
                _segDir.subVectors(p1, p0).normalize();
                _right.crossVectors(_segDir, _camDir).normalize();
                if (_right.lengthSq() < 0.001) {
                    _right.crossVectors(_segDir, new THREE.Vector3(0, 1, 0)).normalize();
                    if (_right.lengthSq() < 0.001) _right.set(1, 0, 0);
                }
            } else {
                // No camera — orient the ribbon horizontally (world-up axis)
                _segDir.subVectors(p1, p0).normalize();
                _right.crossVectors(_segDir, new THREE.Vector3(0, 1, 0)).normalize();
                if (_right.lengthSq() < 0.001) _right.set(1, 0, 0);
            }

            const rx = _right.x, ry = _right.y, rz = _right.z;

            // Quad corners:
            //   A = p0 − right*hw0  (tail-left)
            //   B = p0 + right*hw0  (tail-right)
            //   C = p1 − right*hw1  (head-left)
            //   D = p1 + right*hw1  (head-right)
            // Tri 0: A B C   |   Tri 1: C B D
            const ax = p0.x - rx * hw0, ay = p0.y - ry * hw0, az = p0.z - rz * hw0;
            const bx = p0.x + rx * hw0, by = p0.y + ry * hw0, bz = p0.z + rz * hw0;
            const cx = p1.x - rx * hw1, cy = p1.y - ry * hw1, cz = p1.z - rz * hw1;
            const dx = p1.x + rx * hw1, dy = p1.y + ry * hw1, dz = p1.z + rz * hw1;

            // Tri 0: A B C
            this._pos[vi++] = ax; this._pos[vi++] = ay; this._pos[vi++] = az; this._alpha[ai++] = t0;
            this._pos[vi++] = bx; this._pos[vi++] = by; this._pos[vi++] = bz; this._alpha[ai++] = t0;
            this._pos[vi++] = cx; this._pos[vi++] = cy; this._pos[vi++] = cz; this._alpha[ai++] = t1;
            // Tri 1: C B D
            this._pos[vi++] = cx; this._pos[vi++] = cy; this._pos[vi++] = cz; this._alpha[ai++] = t1;
            this._pos[vi++] = bx; this._pos[vi++] = by; this._pos[vi++] = bz; this._alpha[ai++] = t0;
            this._pos[vi++] = dx; this._pos[vi++] = dy; this._pos[vi++] = dz; this._alpha[ai++] = t1;
        }

        (this._geom.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
        (this._geom.attributes['aAlpha'] as THREE.BufferAttribute).needsUpdate = true;
        this._geom.setDrawRange(0, vi / 3);
    }

    /** Wipe the trail (e.g. on projectile reuse / teleport). */
    clear(): void {
        this._history.length = 0;
        this._geom.setDrawRange(0, 0);
    }

    /** Dispose geometry. Also call `scene.remove(trail.mesh)`. */
    dispose(): void {
        this._geom.dispose();
    }
}

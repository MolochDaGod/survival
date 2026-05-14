/**
 * Three.js GLB/GLTF preview canvas. Forked from the admin AssetViewerModal:
 *   - centers + scales the model so the longest edge is ~2 units,
 *   - hemisphere + directional lighting,
 *   - subtle floor grid for depth,
 *   - OrbitControls with damping,
 *   - aggressive cleanup of materials/textures on unmount to keep the
 *     studio responsive when users click through hundreds of models.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface GlbStats {
  meshes: number;
  vertices: number;
  triangles: number;
}

interface GlbViewerProps {
  url: string;
  className?: string;
  onStats?: (stats: GlbStats) => void;
}

export function GlbViewer({ url, className, onStats }: GlbViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setError(null);
    setLoading(true);
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18181b); // zinc-900

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(2, 1.5, 3);

    // WebGLRenderer construction can throw "Error creating WebGL context"
    // in environments without GPU acceleration (CI, headless browsers,
    // some Linux/VM combos). Fall back to a clear error rather than
    // crashing the entire React tree via the runtime-error overlay.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, failIfMajorPerformanceCaveat: false });
    } catch (e) {
      setError(
        "WebGL is not available in this browser/environment. Open the asset URL directly to download the model.",
      );
      setLoading(false);
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 1.0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    const grid = new THREE.GridHelper(10, 20, 0x10b981, 0x303030);
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.5, 0);

    let raf = 0;
    let disposed = false;
    let rootObject: THREE.Object3D | null = null;

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (disposed) return;
        rootObject = gltf.scene;
        const box = new THREE.Box3().setFromObject(rootObject);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2 / longest;
        rootObject.scale.setScalar(scale);
        rootObject.position.sub(center.multiplyScalar(scale));
        rootObject.position.y += (size.y * scale) / 2;
        scene.add(rootObject);

        if (onStats) {
          let meshes = 0;
          let vertices = 0;
          let triangles = 0;
          rootObject.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.geometry) {
              meshes += 1;
              const geom = obj.geometry as THREE.BufferGeometry;
              const pos = geom.getAttribute("position");
              const vCount = pos ? pos.count : 0;
              vertices += vCount;
              if (geom.index) {
                triangles += geom.index.count / 3;
              } else {
                triangles += vCount / 3;
              }
            }
          });
          onStats({ meshes, vertices, triangles: Math.round(triangles) });
        }

        setLoading(false);
      },
      undefined,
      (err) => {
        if (disposed) return;
        setError((err as Error).message ?? "Failed to load model");
        setLoading(false);
      },
    );

    const onResize = (): void => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ResizeObserver catches container-size changes (e.g. detail panel
    // toggles) that the window resize listener misses.
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const tick = (): void => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      controls.dispose();
      if (rootObject) {
        rootObject.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose?.();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
              if (!mat) continue;
              for (const key of Object.keys(mat) as Array<keyof typeof mat>) {
                const value = (mat as Record<string, unknown>)[key as string];
                if (value instanceof THREE.Texture) value.dispose();
              }
              mat.dispose?.();
            }
          }
        });
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [url, onStats]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" data-testid="glb-canvas" />
      {loading && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
          Loading model…
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-rose-950/40 p-4 text-center text-xs text-rose-200">
          Failed: {error}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface AssetViewerProps {
  /** Public URL to the asset (e.g. R2 publicUrl). */
  url: string;
  /** Filename, used to choose how to render. */
  filename: string;
  /** Optional title shown in the modal header. */
  title?: string;
  /** Called when the user closes the modal. */
  onClose: () => void;
}

type Mode = "gltf" | "image" | "unsupported";

function detectMode(filename: string): Mode {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "glb" || ext === "gltf") return "gltf";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"].includes(ext)) {
    return "image";
  }
  return "unsupported";
}

/**
 * Lightweight 3D + image preview modal. For .glb/.gltf we spin up a small
 * three.js scene with OrbitControls (Khronos sample-viewer-style). For raster
 * and SVG we fall back to a plain <img> element. Everything else shows a
 * helpful "unsupported" message and a download link.
 */
export function AssetViewerModal({ url, filename, title, onClose }: AssetViewerProps) {
  const mode = detectMode(filename);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(mode === "gltf");

  // Reset transient UI when the asset being previewed changes.
  useEffect(() => {
    setError(null);
    setLoading(mode === "gltf");
  }, [url, mode]);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // gltf renderer lifecycle
  useEffect(() => {
    if (mode !== "gltf") return;
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1f2937);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(2, 1.5, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 1.0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // Floor grid for sense of scale.
    const grid = new THREE.GridHelper(10, 20, 0x444444, 0x303030);
    (grid.material as THREE.Material).opacity = 0.4;
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
        // Center & scale so the longest edge is ~2 units.
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
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

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
      controls.dispose();
      if (rootObject) {
        rootObject.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose?.();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
              if (!mat) continue;
              // Walk every property and dispose any Texture we own. This catches
              // map, normalMap, roughnessMap, emissiveMap, metalnessMap, …
              for (const key of Object.keys(mat) as Array<keyof typeof mat>) {
                const value = (mat as Record<string, unknown>)[key as string];
                if (value instanceof THREE.Texture) {
                  value.dispose();
                }
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
  }, [mode, url]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-100">
              {title ?? filename}
            </div>
            <div className="truncate text-xs text-zinc-500">{url}</div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Open
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Close
            </button>
          </div>
        </header>

        <div className="relative flex-1 bg-zinc-800">
          {mode === "gltf" ? (
            <>
              <div ref={containerRef} className="h-full w-full" />
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
                  Loading model…
                </div>
              ) : null}
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-rose-950/40 p-6 text-sm text-rose-200">
                  Failed to load: {error}
                </div>
              ) : null}
            </>
          ) : null}

          {mode === "image" ? (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800 p-4">
              <img
                src={url}
                alt={filename}
                className="max-h-full max-w-full object-contain"
                onError={() => setError("Failed to load image")}
              />
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-rose-950/40 p-6 text-sm text-rose-200">
                  {error}
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "unsupported" ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-sm text-zinc-400">
              <p>No inline preview for this file type.</p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-zinc-700 px-3 py-1 text-zinc-200 hover:bg-zinc-800"
              >
                Download
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

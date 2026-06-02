/**
 * SceneCanvas — primary 3D workspace for the Asset Studio.
 *
 * One persistent Three.js scene that the two new tabs (Canvas, Animations)
 * drive imperatively through a tiny ref-based controller. This keeps the
 * GPU context alive across asset swaps so we don't pay the WebGL-init cost
 * every time the user clicks a different model.
 *
 * Responsibilities:
 *   - Studio lighting + ground grid + axes helper.
 *   - GLB loading with automatic centre + scale-to-fit.
 *   - AnimationMixer + clip retargeting (handles Mixamo "mixamorig" prefix).
 *   - Toggle helpers: grid, axes, bone skeleton, wireframe.
 *   - Play/pause, loop mode, playback rate, scrub.
 *   - Screenshot (PNG download of the current frame).
 *   - Live FPS + triangle/mesh stats reported to the parent.
 *
 * Heavy lifting deliberately stays inside one `useEffect` so disposal is
 * automatic on unmount and StrictMode double-mount doesn't leak renderers.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface SceneStats {
  meshes: number;
  vertices: number;
  triangles: number;
  fps: number;
  clipNames: string[];
}

export type LoopMode = "loop" | "once" | "pingpong";

export interface SceneCanvasHandle {
  /** Snap the camera to fit the loaded model. */
  fitCamera: () => void;
  /** Download a PNG screenshot of the current frame. */
  screenshot: (filename?: string) => void;
  /** Manually re-trigger fit + render (e.g. after toggling helpers). */
  invalidate: () => void;
}

interface Props {
  /** Primary character / model. */
  characterUrl: string | null;
  /** Optional animation-only GLB whose first matching clip drives the mixer. */
  clipUrl?: string | null;
  /** Clip name to play. Defaults to the first clip in the loaded source. */
  clipName?: string | null;
  /** Extra static models stacked beside the character (used by Canvas tab). */
  extraUrls?: string[];
  playing: boolean;
  loopMode: LoopMode;
  playbackRate: number;
  showGrid: boolean;
  showAxes: boolean;
  showBones: boolean;
  showWireframe: boolean;
  background: "studio" | "black" | "transparent";
  className?: string;
  onStats?: (stats: SceneStats) => void;
  onClipsAvailable?: (clips: string[]) => void;
  onError?: (message: string) => void;
}

/** Strip the Mixamo bone prefix from clip track names if the target rig is
 *  bare-named. Returns a clone of the clip; the original is untouched. */
function adaptMixamoClip(
  clip: THREE.AnimationClip,
  characterBoneNames: Set<string>,
): THREE.AnimationClip {
  const hasMixamo = clip.tracks.some((t) => /mixamorig/i.test(t.name));
  const charHasMixamo = [...characterBoneNames].some((n) => /mixamorig/i.test(n));
  if (!hasMixamo || charHasMixamo) return clip;
  const cloned = clip.clone();
  cloned.tracks = cloned.tracks.map((t) => {
    const nt = t.clone();
    nt.name = nt.name.replace(/^mixamorig:?/i, "");
    return nt;
  });
  return cloned;
}

function collectBoneNames(root: THREE.Object3D): Set<string> {
  const out = new Set<string>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) out.add(o.name);
  });
  return out;
}

function applyWireframe(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        (m as THREE.MeshStandardMaterial).wireframe = on;
      }
    }
  });
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const k of Object.keys(m) as Array<keyof typeof m>) {
          const v = (m as Record<string, unknown>)[k as string];
          if (v instanceof THREE.Texture) v.dispose();
        }
        m.dispose?.();
      }
    }
  });
}

function centerAndFit(obj: THREE.Object3D, targetSize = 2): void {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / longest;
  obj.scale.setScalar(scale);
  obj.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  box2.getCenter(center);
  obj.position.sub(center);
  obj.position.y += (size.y * scale) / 2;
}

export const SceneCanvas = forwardRef<SceneCanvasHandle, Props>(function SceneCanvas(
  props,
  ref,
) {
  const {
    characterUrl,
    clipUrl,
    clipName,
    extraUrls,
    playing,
    loopMode,
    playbackRate,
    showGrid,
    showAxes,
    showBones,
    showWireframe,
    background,
    className,
    onStats,
    onClipsAvailable,
    onError,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Persistent three.js resources kept in refs so prop changes don't tear
  // down the renderer. The big effect builds these once per mount.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const characterRootRef = useRef<THREE.Object3D | null>(null);
  const extrasRootRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);
  const animationClipsRef = useRef<THREE.AnimationClip[]>([]);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const lastFrameRef = useRef<number>(performance.now());
  const fpsAvgRef = useRef<number>(60);

  // Build the persistent renderer/scene exactly once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: background === "transparent",
        preserveDrawingBuffer: true, // needed for screenshot
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      setErr("WebGL unavailable in this browser");
      onError?.("WebGL unavailable");
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(2.4, 1.8, 3.2);
    cameraRef.current = camera;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.6);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(5, 9, 7);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.4);
    fillLight.position.set(-6, 4, -3);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(10, 20, 0x10b981, 0x303030);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);
    gridRef.current = grid;

    const axes = new THREE.AxesHelper(0.6);
    axes.visible = false;
    scene.add(axes);
    axesRef.current = axes;

    const extras = new THREE.Group();
    scene.add(extras);
    extrasRootRef.current = extras;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.8, 0);
    controlsRef.current = controls;

    const onResize = (): void => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    let raf = 0;
    const tick = (): void => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;
      fpsAvgRef.current = fpsAvgRef.current * 0.9 + (1 / Math.max(dt, 1 / 240)) * 0.1;
      mixerRef.current?.update(dt);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      controls.dispose();
      if (characterRootRef.current) disposeObject(characterRootRef.current);
      if (extrasRootRef.current) disposeObject(extrasRootRef.current);
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── Character / primary model loading ────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Tear down previous character + skeleton helper before loading.
    if (characterRootRef.current) {
      scene.remove(characterRootRef.current);
      disposeObject(characterRootRef.current);
      characterRootRef.current = null;
    }
    if (skeletonHelperRef.current) {
      scene.remove(skeletonHelperRef.current);
      skeletonHelperRef.current = null;
    }
    mixerRef.current?.stopAllAction();
    mixerRef.current = null;
    activeActionRef.current = null;
    animationClipsRef.current = [];
    onClipsAvailable?.([]);

    if (!characterUrl) return;
    setLoading(true);
    setErr(null);
    const loader = new GLTFLoader();
    let cancelled = false;

    loader.load(
      characterUrl,
      (gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        centerAndFit(root, 2);
        scene.add(root);
        characterRootRef.current = root;

        // Built-in clips first; the separate `clipUrl` effect will later
        // append/override with externally-loaded animations.
        animationClipsRef.current = gltf.animations ?? [];
        if (animationClipsRef.current.length > 0) {
          mixerRef.current = new THREE.AnimationMixer(root);
          onClipsAvailable?.(animationClipsRef.current.map((c) => c.name || "(unnamed)"));
        } else {
          onClipsAvailable?.([]);
        }

        // Skeleton helper (added/removed based on showBones prop in a
        // separate effect below).
        const skeleton = new THREE.SkeletonHelper(root);
        (skeleton.material as THREE.Material).depthTest = false;
        (skeleton.material as THREE.Material).depthWrite = false;
        skeleton.visible = false;
        scene.add(skeleton);
        skeletonHelperRef.current = skeleton;

        applyWireframe(root, showWireframe);
        setLoading(false);
      },
      undefined,
      (e) => {
        if (cancelled) return;
        const msg = (e as Error).message ?? "Failed to load model";
        setErr(msg);
        setLoading(false);
        onError?.(msg);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterUrl]);

  // ── Animation clip from a separate GLB ───────────────────────────────────
  useEffect(() => {
    const character = characterRootRef.current;
    if (!character || !clipUrl) return;
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      clipUrl,
      (gltf) => {
        if (cancelled) return;
        const clips = gltf.animations ?? [];
        if (clips.length === 0) {
          onError?.("Selected file has no animation clips");
          return;
        }
        const bones = collectBoneNames(character);
        const adapted = clips.map((c) => adaptMixamoClip(c, bones));
        // Replace any "external" clips while keeping built-in ones first.
        const builtIn = animationClipsRef.current.filter(
          (c) => !c.userData?.__external,
        );
        adapted.forEach((c) => {
          c.userData = { ...(c.userData ?? {}), __external: true };
        });
        animationClipsRef.current = [...builtIn, ...adapted];
        if (!mixerRef.current) mixerRef.current = new THREE.AnimationMixer(character);
        onClipsAvailable?.(animationClipsRef.current.map((c) => c.name || "(unnamed)"));
      },
      undefined,
      (e) => {
        if (cancelled) return;
        onError?.((e as Error).message ?? "Failed to load clip GLB");
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipUrl, characterUrl]);

  // ── Active action: react to clipName / playing / loop / rate ─────────────
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    const clips = animationClipsRef.current;
    if (clips.length === 0) return;
    const target =
      (clipName && clips.find((c) => c.name === clipName)) ?? clips[0];
    activeActionRef.current?.stop();
    const action = mixer.clipAction(target);
    if (!action) return;
    const loopMap = {
      loop: { mode: THREE.LoopRepeat, repeats: Infinity },
      once: { mode: THREE.LoopOnce, repeats: 1 },
      pingpong: { mode: THREE.LoopPingPong, repeats: Infinity },
    } as const;
    const lm = loopMap[loopMode];
    action.setLoop(lm.mode, lm.repeats);
    action.clampWhenFinished = loopMode === "once";
    action.reset();
    action.setEffectiveTimeScale(playbackRate);
    action.play();
    action.paused = !playing;
    activeActionRef.current = action;
  }, [clipName, loopMode, playbackRate, playing, characterUrl, clipUrl]);


  // ── Extra static models (Canvas tab) ─────────────────────────────────────
  useEffect(() => {
    const extras = extrasRootRef.current;
    if (!extras) return;
    // Rebuild from scratch on each change — small enough sets to be cheap.
    while (extras.children.length > 0) {
      const child = extras.children[0];
      extras.remove(child);
      disposeObject(child);
    }
    const urls = extraUrls ?? [];
    if (urls.length === 0) return;
    const loader = new GLTFLoader();
    let cancelled = false;
    urls.forEach((url, i) => {
      loader.load(
        url,
        (gltf) => {
          if (cancelled) return;
          const root = gltf.scene;
          centerAndFit(root, 1.4);
          // Lay them out in a row offset from the origin so they don't
          // overlap the primary model.
          const col = i + 1;
          root.position.x += col * 1.8;
          extras.add(root);
        },
        undefined,
        (e) => {
          if (!cancelled) onError?.((e as Error).message ?? "Failed to load extra");
        },
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraUrls?.join("|")]);

  // ── Helper toggles ───────────────────────────────────────────────────────
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);
  useEffect(() => {
    if (axesRef.current) axesRef.current.visible = showAxes;
  }, [showAxes]);
  useEffect(() => {
    if (skeletonHelperRef.current) skeletonHelperRef.current.visible = showBones;
  }, [showBones, characterUrl]);
  useEffect(() => {
    if (characterRootRef.current) applyWireframe(characterRootRef.current, showWireframe);
    if (extrasRootRef.current) applyWireframe(extrasRootRef.current, showWireframe);
  }, [showWireframe, characterUrl, extraUrls]);

  // ── Background ───────────────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    if (background === "transparent") {
      renderer.setClearColor(0x000000, 0);
      scene.background = null;
    } else if (background === "black") {
      renderer.setClearColor(0x000000, 1);
      scene.background = new THREE.Color(0x000000);
    } else {
      renderer.setClearColor(0x18181b, 1);
      scene.background = new THREE.Color(0x18181b);
    }
  }, [background]);

  // ── Stats reporter (~4 Hz so it doesn't thrash React) ────────────────────
  useEffect(() => {
    if (!onStats) return;
    const id = window.setInterval(() => {
      const character = characterRootRef.current;
      let meshes = 0;
      let vertices = 0;
      let triangles = 0;
      const visit = (root: THREE.Object3D | null): void => {
        if (!root) return;
        root.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry) {
            meshes += 1;
            const pos = o.geometry.getAttribute("position");
            const vc = pos ? pos.count : 0;
            vertices += vc;
            triangles += o.geometry.index ? o.geometry.index.count / 3 : vc / 3;
          }
        });
      };
      visit(character);
      visit(extrasRootRef.current);
      onStats({
        meshes,
        vertices,
        triangles: Math.round(triangles),
        fps: Math.round(fpsAvgRef.current),
        clipNames: animationClipsRef.current.map((c) => c.name || "(unnamed)"),
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [onStats, characterUrl, clipUrl, extraUrls]);

  // ── Imperative API ───────────────────────────────────────────────────────
  const fitCamera = useCallback((): void => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const character = characterRootRef.current;
    if (!camera || !controls) return;
    const target = character ?? extrasRootRef.current;
    if (!target) return;
    const box = new THREE.Box3().setFromObject(target);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 + 0.1;
    const dist = radius / Math.sin((camera.fov * Math.PI) / 360) + 0.8;
    const dir = new THREE.Vector3(0.7, 0.45, 1).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(dist));
    controls.target.copy(center);
    controls.update();
  }, []);

  const screenshot = useCallback((filename = "asset-studio.png"): void => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const invalidate = useCallback((): void => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (renderer && scene && camera) renderer.render(scene, camera);
  }, []);

  useImperativeHandle(ref, () => ({ fitCamera, screenshot, invalidate }), [
    fitCamera,
    screenshot,
    invalidate,
  ]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" data-testid="scene-canvas" />
      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-400">Loading…</div>
      ) : null}
      {err ? (
        <div className="absolute inset-x-0 bottom-0 bg-rose-950/70 px-3 py-1.5 text-xs text-rose-200">{err}</div>
      ) : null}
    </div>
  );
});

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface Props {
  modelPath: string;
  width?: number;
  height?: number;
}

/**
 * Self-contained tiny three.js scene that loads a single GLB and renders it
 * spinning gently. Used for the character preview in the main menu.
 *
 * - Plays the model's first looping animation if present (typically Idle).
 * - Generates an in-memory IBL via RoomEnvironment so PBR materials look
 *   correct without depending on the main game's AssetManager.
 * - Auto-frames the model by computing its bounding box and aiming the
 *   camera at it.
 */
export const CharacterPreview3D: React.FC<Props> = ({
  modelPath,
  width = 140,
  height = 170,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Probe WebGL availability defensively — some headless / sandboxed
    // browsers refuse a second context. Fall back to an emoji silhouette
    // instead of crashing the entire main menu.
    const probe = document.createElement('canvas');
    const probeCtx =
      probe.getContext('webgl2') ||
      probe.getContext('webgl') ||
      probe.getContext('experimental-webgl');
    if (!probeCtx) {
      setFailed(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
      });
    } catch (e) {
      console.warn('[CharacterPreview3D] WebGL unavailable, using fallback', e);
      setFailed(true);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const ambient = new THREE.AmbientLight(0x88aaff, 0.4);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffd9a8, 1.6);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88a8ff, 0.7);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 2.6);

    const root = new THREE.Group();
    scene.add(root);

    let mixer: THREE.AnimationMixer | null = null;
    let disposed = false;

    const loader = createGLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;

        // Auto-frame: center horizontally, sit on ground, fit vertically.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y; // feet on ground

        // Scale so the character fits ~1.6 units tall in view.
        const targetHeight = 1.6;
        const scale = targetHeight / Math.max(0.001, size.y);
        model.scale.setScalar(scale);

        root.add(model);

        // Aim camera at the model's chest height.
        const aimY = (size.y * scale) * 0.55;
        camera.position.set(0, aimY + 0.2, 2.4);
        camera.lookAt(0, aimY, 0);

        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          // Prefer an Idle clip if present, otherwise the first one.
          const idle = gltf.animations.find((a) => /idle/i.test(a.name)) || gltf.animations[0];
          mixer.clipAction(idle).play();
        }
      },
      undefined,
      (err) => {
        // GLB missing or failed — show emoji fallback instead of an empty box.
        console.warn('[CharacterPreview3D] failed to load', modelPath, err);
        if (!disposed) setFailed(true);
      }
    );

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      root.rotation.y += dt * 0.6; // gentle turntable
      mixer?.update(dt);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);

      // Dispose every GPU resource: textures referenced by materials, then
      // materials, then geometries. Three.js does NOT auto-dispose any of these.
      const disposedTextures = new Set<THREE.Texture>();
      const disposeMaterial = (mat: THREE.Material) => {
        // Walk all texture-typed properties on the material.
        for (const key of Object.keys(mat) as (keyof THREE.Material)[]) {
          const val = (mat as unknown as Record<string, unknown>)[key as string];
          if (val instanceof THREE.Texture && !disposedTextures.has(val)) {
            disposedTextures.add(val);
            val.dispose();
          }
        }
        mat.dispose();
      };
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach(disposeMaterial);
          else if (m) disposeMaterial(m);
        }
      });

      // Dispose the IBL render target + texture, then the PMREM helper.
      envRT.dispose();
      pmrem.dispose();

      renderer.dispose();
      const canvas = renderer.domElement;
      // Force-release the WebGL context so we don't hit the per-page context cap.
      const loseExt = renderer.getContext().getExtension('WEBGL_lose_context');
      loseExt?.loseContext();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [modelPath, width, height]);

  if (failed) {
    return (
      <div style={{
        width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '72px', filter: 'drop-shadow(0 0 20px #ff6b3566)',
      }}>
        🧟
      </div>
    );
  }

  return <div ref={mountRef} style={{ width, height, display: 'block' }} />;
};

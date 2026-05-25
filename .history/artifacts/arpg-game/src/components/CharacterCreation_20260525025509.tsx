import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGLTFLoader } from '@/game/loaders/createGLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CharacterConfig,
  Gender,
  BodyProportionType,
  GrudgeStats,
  SKIN_PRESETS,
  HAIR_COLOR_PRESETS,
  EYE_COLOR_PRESETS,
  FACE_SHAPES,
  HAIR_STYLES,
  BACKGROUNDS,
  STAT_META,
  STARTING_BUDGET,
  STAT_MIN,
  STAT_MAX,
  DEFAULT_STATS,
  STARTING_MODEL,
  DEFAULT_CHARACTER_CONFIG,
  BODY_TYPES,
  MALE_OUTFITS,
  FEMALE_OUTFITS,
  STAT_COST,
  computeSpentPoints,
  costForNext,
  costToReach,
} from '../game/CharacterConfig';
import { StatRadarChart } from './StatRadarChart';
import { BiometricReadout } from './BiometricReadout';
import { BadgesPanel } from './BadgesPanel';
import { PerkTierCatalog } from './PerkTierCatalog';
import { StatBook } from './books/StatBook';
import { SKILL_TREE } from '../game/constants';

type Tab = 'identity' | 'appearance' | 'outfit' | 'stats' | 'background';

interface CharacterCreationProps {
  onComplete: (config: CharacterConfig) => void;
  savedConfig?: CharacterConfig | null;
}

const OUTFIT_FADE_DURATION = 0.22;

function hexToColor(hex: string): THREE.Color { return new THREE.Color(hex); }

function setGroupOpacity(group: THREE.Group, opacity: number) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
        m.transparent = opacity < 1;
        m.opacity = opacity;
        m.needsUpdate = true;
      }
    }
  });
}

function applyColorTints(scene: THREE.Group, skinColor: string, hairColor: string, eyeColor: string) {
  const skin = hexToColor(skinColor);
  const hair = hexToColor(hairColor);
  const eye  = hexToColor(eyeColor);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const n = (mat.name || '').toLowerCase();
      if (n.includes('skin')) mat.color.copy(skin);
      else if (n.includes('hair') || n === 'eyebrows') mat.color.copy(hair);
      else if (n === 'eye' || n.includes('iris') || n === 'eyes') {
        // The Quaternius Eye material ships with a baked iris texture
        // (T_Eye_Brown.png); mat.color multiplies the texture, so without
        // clearing the map the user's chosen colour just tints the brown
        // iris instead of replacing it. We need to null the map — but the
        // material instance is shared across the GLTF cache, so we MUST
        // clone first to avoid wiping the texture from every other
        // character that references the same cached material.
        if (mat.map) {
          const cloned = mat.clone();
          cloned.map = null;
          cloned.needsUpdate = true;
          cloned.color.copy(eye);
          mats[i] = cloned;
        } else {
          mat.color.copy(eye);
        }
      }
    }
    child.material = Array.isArray(child.material) ? mats : mats[0];
  });
}

function upgradeMaterials(scene: THREE.Group) {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
        // Quaternius materials default to flatShading=true which produces
        // the harsh "voxel" look on every facet. Switch to smooth shading
        // — geometry vertex normals are preserved, the lighting just
        // interpolates across faces instead of stair-stepping.
        m.flatShading = false;
        m.needsUpdate = true;
        continue;
      }
      mats[i] = new THREE.MeshStandardMaterial({
        color: (m as THREE.MeshBasicMaterial).color ?? new THREE.Color(1, 1, 1),
        name: m.name,
        roughness: 0.75,
        metalness: 0.05,
        flatShading: false,
      });
    }
    child.material = Array.isArray(child.material) ? mats : mats[0];
    // Recompute smooth (averaged) vertex normals on non-skinned geometry to
    // get rid of duplicated-vertex hard edges that ship with Quaternius
    // GLBs. We skip skinned meshes — recomputing on those can shift weights
    // when the GLTF stored split vertices for hard creases.
    if (child instanceof THREE.Mesh && !(child instanceof THREE.SkinnedMesh) && child.geometry) {
      try { child.geometry.computeVertexNormals(); } catch { /* tolerate */ }
    }
  });
}

export const CharacterCreation: React.FC<CharacterCreationProps> = ({ onComplete, savedConfig }) => {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const rendererRef      = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef         = useRef<THREE.Scene | null>(null);
  const cameraRef        = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef      = useRef<OrbitControls | null>(null);
  const rootGroupRef     = useRef<THREE.Group>(new THREE.Group());
  const charGroupRef     = useRef<THREE.Group | null>(null);
  const outfitGroupRef   = useRef<THREE.Group | null>(null);
  const hairGroupRef     = useRef<THREE.Group | null>(null);
  const mixerRef         = useRef<THREE.AnimationMixer | null>(null);
  const frameRef         = useRef<number>(0);
  const clockRef         = useRef<THREE.Clock>(new THREE.Clock());
  const gltfLoaderRef    = useRef<GLTFLoader>(createGLTFLoader());
  const configRef        = useRef<CharacterConfig>(DEFAULT_CHARACTER_CONFIG);
  const baseParamsRef      = useRef<{ scale: number; sizeY: number; centerX: number; centerZ: number; minY: number } | null>(null);
  const outfitLoadTokenRef = useRef<number>(0);
  const fadeOutGroupRef      = useRef<THREE.Group | null>(null);
  const fadeOutProgressRef   = useRef<number>(1);
  const fadeInGroupRef       = useRef<THREE.Group | null>(null);
  const fadeInProgressRef    = useRef<number>(0);
  const charFadeOutActiveRef = useRef<boolean>(false);
  const charFadeOutProgressRef = useRef<number>(1);
  const spinnerTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabButtonRefs        = useRef<Partial<Record<Tab, HTMLButtonElement>>>({});

  const [config, setConfig]             = useState<CharacterConfig>({ ...DEFAULT_CHARACTER_CONFIG });
  const [activeTab, setActiveTab]       = useState<Tab>('identity');
  const [showSpinner, setShowSpinner]   = useState(true);
  const [webglFailed, setWebglFailed]   = useState(false);
  const [nameInput, setNameInput]       = useState(DEFAULT_CHARACTER_CONFIG.name);
  const [showPerkCatalog, setShowPerkCatalog]       = useState(false);
  const [showSavedPreview, setShowSavedPreview]     = useState(false);
  const [statBookKey, setStatBookKey]               = useState<keyof GrudgeStats | null>(null);
  const [appearanceScrollTarget, setAppearanceScrollTarget] = useState<'height' | 'build' | null>(null);

  useEffect(() => { configRef.current = config; }, [config]);

  useEffect(() => {
    tabButtonRefs.current[activeTab]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  const applyBodyScale = useCallback(() => {
    const rg = rootGroupRef.current;
    if (!rg) return;
    const { heightCm, build, bodyProportion, gender } = configRef.current;
    // BODY_TYPES is currently collapsed to a single 'superhero' entry per
    // gender. Fall back to the matching gender's entry, then to the first
    // entry of any gender, so this never throws even if the roster shape
    // changes again. (Previous fallback referenced an 'athletic' id that
    // hasn't existed since the roster was collapsed, causing a runtime
    // crash on .scaleY.)
    const bodyTypeCfg = BODY_TYPES.find(b => b.id === bodyProportion && b.gender === gender)
      ?? BODY_TYPES.find(b => b.gender === gender)
      ?? BODY_TYPES[0];
    if (!bodyTypeCfg) return;
    const yScale  = (0.88 + (heightCm - 155) / 45 * 0.24) * bodyTypeCfg.scaleY;
    const xzScale = (0.85 + (build / 100) * 0.30) * bodyTypeCfg.scaleX;
    rg.scale.set(xzScale, yScale, xzScale);
  }, []);

  const loadHairLayer = useCallback((hairPath: string, hairColor: string, _scale: number, _sizeY: number) => {
    const rootGroup = rootGroupRef.current;
    const charGroup = charGroupRef.current;

    // First, restore visibility of the body's baked-in Hair mesh segment in
    // case it was hidden by a previous hair-layer load. We re-apply the
    // hide below if a new external hair is being attached.
    if (charGroup) {
      charGroup.traverse((c) => {
        if (!(c instanceof THREE.Mesh) && !(c instanceof THREE.SkinnedMesh)) return;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        const hasHair = mats.some(m => (m?.name ?? '').toLowerCase().includes('hair'));
        if (hasHair) c.visible = true;
      });
    }

    if (hairGroupRef.current) {
      hairGroupRef.current.parent?.remove(hairGroupRef.current);
      hairGroupRef.current = null;
    }
    if (!hairPath) return;

    // Find the Head bone in the body rig — Quaternius UAC rigs name it
    // exactly 'Head'. Hair is parented to this bone so it follows head
    // rotation and any face-shape scale we apply, instead of floating at a
    // bbox-derived world offset.
    let headBone: THREE.Object3D | null = null;
    if (charGroup) {
      charGroup.traverse((c) => { if (!headBone && c.name === 'Head') headBone = c; });
    }

    gltfLoaderRef.current.load(hairPath, (hairGltf) => {
      const hairGroup = hairGltf.scene as THREE.Group;
      upgradeMaterials(hairGroup);
      hairGroup.traverse((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.SkinnedMesh) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshStandardMaterial) m.color.copy(hexToColor(hairColor));
          }
        }
      });

      if (headBone) {
        // Hide the model's baked-in Hair segment so we don't render double
        // hair on top of the new style. We match by material name only —
        // 'Hair' for Quaternius UAC. The Eyebrows mesh stays visible.
        const ch = charGroupRef.current;
        if (ch) {
          ch.traverse((c) => {
            if (!(c instanceof THREE.Mesh) && !(c instanceof THREE.SkinnedMesh)) return;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            const isHair = mats.every(m => (m?.name ?? '').toLowerCase() === 'hair');
            if (isHair) c.visible = false;
          });
        }

        // Quaternius hair GLBs are authored to sit at the same head origin
        // across models. Centre on origin, scale to a head-relative size,
        // then parent to the Head bone — the bone's world transform then
        // places it correctly on every body type.
        const hbox = new THREE.Box3().setFromObject(hairGroup);
        const hsize = new THREE.Vector3(); hbox.getSize(hsize);
        const hcenter = new THREE.Vector3(); hbox.getCenter(hcenter);
        // Target hair height ~0.22 in body-local units (head bone is in
        // body-local space pre-scale); typical Quaternius hair source is
        // ~0.4–0.6m, so a ratio of ~0.45/hsize.y is close to right.
        const hairScale = hsize.y > 0 ? 0.22 / hsize.y : 1;
        hairGroup.scale.setScalar(hairScale);
        hairGroup.position.set(
          -hcenter.x * hairScale,
          -hbox.min.y * hairScale + 0.02,
          -hcenter.z * hairScale,
        );
        headBone.add(hairGroup);
      } else {
        // Fallback: no rig found, fall back to root-attached bbox math so
        // hair still shows in the preview rather than disappearing.
        const params = baseParamsRef.current;
        const sc  = params?.scale ?? 1;
        const szY = params?.sizeY ?? 1.8;
        const hbox    = new THREE.Box3().setFromObject(hairGroup);
        const hcenter = new THREE.Vector3(); hbox.getCenter(hcenter);
        hairGroup.scale.setScalar(sc);
        hairGroup.position.set(-hcenter.x * sc, szY * sc * 0.88, -hcenter.z * sc);
        rootGroup.add(hairGroup);
      }

      hairGroupRef.current = hairGroup;
    }, undefined, () => {});
  }, []);

  const loadOutfitLayer = useCallback((outfitId: string, gender: Gender) => {
    const rootGroup = rootGroupRef.current;
    const base      = baseParamsRef.current;
    if (!base) return;

    const token = ++outfitLoadTokenRef.current;

    if (spinnerTimerRef.current !== null) {
      clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = null;
    }

    charFadeOutActiveRef.current = false;
    charFadeOutProgressRef.current = 1;
    if (charGroupRef.current) setGroupOpacity(charGroupRef.current, 1);

    const prevOutfitGroup = outfitGroupRef.current;
    outfitGroupRef.current = null;

    if (prevOutfitGroup) {
      if (fadeOutGroupRef.current && fadeOutGroupRef.current !== prevOutfitGroup) {
        rootGroup.remove(fadeOutGroupRef.current);
      }
      fadeOutGroupRef.current    = prevOutfitGroup;
      fadeOutProgressRef.current = 1;
    }

    if (fadeInGroupRef.current) {
      rootGroup.remove(fadeInGroupRef.current);
      fadeInGroupRef.current = null;
    }

    // Only kick off the body's clothes-layer fade when an outfit will actually
    // replace it. When outfitId === 'none', the body is the entire character,
    // so we must NOT fade it out — and the post-fade visibility filter would
    // hide every mesh on bodies whose material names don't match the
    // skin/eye/teeth heuristic (e.g. the "Athletic" GLB uses a single material
    // named "survivor 1 txt"), leaving only the hair visible.
    if (!prevOutfitGroup && charGroupRef.current && outfitId !== 'none') {
      charFadeOutActiveRef.current   = true;
      charFadeOutProgressRef.current = 1;
    }

    if (outfitId === 'none') {
      if (charGroupRef.current) {
        charGroupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
            child.visible = true;
          }
        });
        setGroupOpacity(charGroupRef.current, 1);
      }
      setShowSpinner(false);
      return;
    }

    const outfitList   = gender === 'female' ? FEMALE_OUTFITS : MALE_OUTFITS;
    const outfitPreset = outfitList.find(o => o.id === outfitId);
    if (!outfitPreset) { setShowSpinner(false); return; }

    spinnerTimerRef.current = setTimeout(() => {
      setShowSpinner(true);
      spinnerTimerRef.current = null;
    }, 500);

    gltfLoaderRef.current.load(outfitPreset.gltfPath, (gltf) => {
      if (token !== outfitLoadTokenRef.current) return;

      if (spinnerTimerRef.current !== null) {
        clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }

      const group = gltf.scene as THREE.Group;
      upgradeMaterials(group);
      const { skinColor, hairColor, eyeColor } = configRef.current;
      applyColorTints(group, skinColor, hairColor, eyeColor);

      const box    = new THREE.Box3().setFromObject(group);
      const size   = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      const outfitScale = 1.8 / size.y;
      group.scale.setScalar(outfitScale);
      group.position.set(-center.x * outfitScale, -box.min.y * outfitScale, -center.z * outfitScale);

      const baseBoneMap: Record<string, THREE.Bone> = {};
      if (charGroupRef.current) {
        charGroupRef.current.traverse((c) => {
          if (c instanceof THREE.Bone) baseBoneMap[c.name] = c;
        });
      }
      const hasBaseRig = Object.keys(baseBoneMap).length > 0;

      group.traverse((child) => {
        if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const isSkinMesh = mats.every(m => {
          const n = (m.name || '').toLowerCase();
          return n.includes('skin') || n === 'eye' || n === 'eyebrows' || n.includes('teeth') || n.includes('mouth');
        });
        if (isSkinMesh) { child.visible = false; return; }

        if (hasBaseRig && child instanceof THREE.SkinnedMesh) {
          const origBones    = child.skeleton.bones;
          const origInverses = child.skeleton.boneInverses;
          const remappedBones = origBones.map(b => baseBoneMap[b.name] ?? b);
          const sharedSkeleton = new THREE.Skeleton(remappedBones, origInverses);
          child.bind(sharedSkeleton, child.bindMatrix);
        }
      });

      if (charGroupRef.current && !charFadeOutActiveRef.current) {
        charGroupRef.current.traverse((child) => {
          if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          const isBodyMesh = mats.some(m => {
            const n = (m.name || '').toLowerCase();
            return n.includes('skin') || n === 'eye' || n === 'eyebrows' || n.includes('teeth') || n.includes('mouth');
          });
          child.visible = isBodyMesh;
        });
      }

      setGroupOpacity(group, 0);
      rootGroup.add(group);
      outfitGroupRef.current  = group;
      fadeInGroupRef.current  = group;
      fadeInProgressRef.current = 0;

      setShowSpinner(false);
    }, undefined, () => {
      if (token !== outfitLoadTokenRef.current) return;
      if (spinnerTimerRef.current !== null) {
        clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
      setShowSpinner(false);
    });
  }, []);

  const loadBaseModel = useCallback((
    gender: Gender,
    bodyProportion: BodyProportionType,
  ) => {
    const rootGroup = rootGroupRef.current;
    if (!sceneRef.current) return;

    if (spinnerTimerRef.current !== null) {
      clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = null;
    }

    setShowSpinner(true);
    if (mixerRef.current) { mixerRef.current.stopAllAction(); mixerRef.current = null; }
    rootGroup.clear();
    charGroupRef.current   = null;
    outfitGroupRef.current = null;
    hairGroupRef.current   = null;
    baseParamsRef.current  = null;
    fadeOutGroupRef.current      = null;
    fadeInGroupRef.current       = null;
    charFadeOutActiveRef.current = false;
    charFadeOutProgressRef.current = 1;

    const bodyTypeCfg = BODY_TYPES.find(b => b.id === bodyProportion && b.gender === gender);
    const basePath    = bodyTypeCfg?.gltfPath || STARTING_MODEL[gender];

    const doLoad = (path: string) => {
      gltfLoaderRef.current.load(path, (gltf) => {
        const group = gltf.scene as THREE.Group;
        upgradeMaterials(group);
        const { skinColor, hairColor, eyeColor } = configRef.current;
        applyColorTints(group, skinColor, hairColor, eyeColor);

        const box    = new THREE.Box3().setFromObject(group);
        const size   = new THREE.Vector3(); box.getSize(size);
        const center = new THREE.Vector3(); box.getCenter(center);
        const scale  = 1.8 / size.y;
        group.scale.setScalar(scale);
        group.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        rootGroup.add(group);
        charGroupRef.current = group;
        baseParamsRef.current = { scale, sizeY: size.y, centerX: center.x, centerZ: center.z, minY: box.min.y };
        applyBodyScale();

        if (gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(group);
          mixerRef.current = mixer;
          const idle = gltf.animations.find(a => a.name === 'Idle') ?? gltf.animations[0];
          mixer.clipAction(idle).play();
        }

        const { outfitId, hairStyleId, hairColor: hc } = configRef.current;
        const hairStyle = HAIR_STYLES.find(h => h.id === hairStyleId);
        loadHairLayer(hairStyle?.gltfPath ?? '', hc, scale, size.y);

        const outfitList    = gender === 'female' ? FEMALE_OUTFITS : MALE_OUTFITS;
        loadOutfitLayer(outfitId, gender);
      }, undefined, () => {
        const fallback = STARTING_MODEL[gender];
        if (path !== fallback) {
          console.warn(`[CharacterCreation] Failed to load base model: ${path} — falling back to ${fallback}`);
          doLoad(fallback);
        } else {
          setShowSpinner(false);
        }
      });
    };

    doLoad(basePath);
  }, [applyBodyScale, loadHairLayer, loadOutfitLayer]);

  useEffect(() => {
    if (!canvasRef.current) return;
    // Idempotent guard: if a renderer already exists for this canvas (e.g. due to
    // React StrictMode running effects twice), reuse it instead of creating a
    // second WebGL context — browsers refuse the second context, which used to
    // trigger the 2D silhouette fallback. See CharacterPreview3D for the same
    // probe-then-create pattern.
    if (rendererRef.current) return;

    // Defensive WebGL availability probe before instantiating the renderer.
    const probe = document.createElement('canvas');
    const probeCtx =
      probe.getContext('webgl2') ||
      probe.getContext('webgl') ||
      probe.getContext('experimental-webgl' as 'webgl');
    if (!probeCtx) {
      setWebglFailed(true);
      setShowSpinner(false);
      return;
    }
    // Best-effort cleanup of the probe context so it doesn't count against the
    // browser's per-page WebGL context budget.
    try { (probeCtx as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext(); } catch {}

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
        alpha: true,
        failIfMajorPerformanceCaveat: false,
      });
    } catch {
      setWebglFailed(true);
      setShowSpinner(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping      = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.add(rootGroupRef.current);

    try {
      const pmrem   = new THREE.PMREMGenerator(renderer);
      const envTex  = pmrem.fromScene(new RoomEnvironment()).texture;
      scene.environment = envTex;
      pmrem.dispose();
    } catch {}

    scene.add(new THREE.AmbientLight(0xffeedd, 0.6));
    const key = new THREE.DirectionalLight(0xfff5e0, 2.5); key.position.set(3, 8, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6090ff, 1.2); rim.position.set(-5, 4, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffd0a0, 0.8); fill.position.set(2, 1, -4); scene.add(fill);

    const w = canvasRef.current.clientWidth;
    const h = canvasRef.current.clientHeight;
    renderer.setSize(w, h, false);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 1.1, 3.8);
    camera.lookAt(0, 1.0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.minPolarAngle  = Math.PI * 0.15;
    controls.maxPolarAngle  = Math.PI * 0.75;
    controls.minDistance    = 2;
    controls.maxDistance    = 6;
    controls.enablePan      = false;
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.autoRotate     = false;
    controlsRef.current = controls;

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const dt = clockRef.current.getDelta();
      mixerRef.current?.update(dt);

      if (charFadeOutActiveRef.current && charGroupRef.current) {
        charFadeOutProgressRef.current = Math.max(0, charFadeOutProgressRef.current - dt / OUTFIT_FADE_DURATION);
        setGroupOpacity(charGroupRef.current, charFadeOutProgressRef.current);
        if (charFadeOutProgressRef.current === 0) {
          charFadeOutActiveRef.current = false;
          charGroupRef.current.traverse((child) => {
            if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.SkinnedMesh)) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            const isBodyMesh = mats.some(m => {
              const n = (m.name || '').toLowerCase();
              return n.includes('skin') || n === 'eye' || n === 'eyebrows' || n.includes('teeth') || n.includes('mouth');
            });
            child.visible = isBodyMesh;
          });
          setGroupOpacity(charGroupRef.current, 1);
        }
      }

      if (fadeOutGroupRef.current) {
        fadeOutProgressRef.current = Math.max(0, fadeOutProgressRef.current - dt / OUTFIT_FADE_DURATION);
        setGroupOpacity(fadeOutGroupRef.current, fadeOutProgressRef.current);
        if (fadeOutProgressRef.current === 0) {
          rootGroupRef.current.remove(fadeOutGroupRef.current);
          fadeOutGroupRef.current = null;
        }
      }

      if (fadeInGroupRef.current) {
        fadeInProgressRef.current = Math.min(1, fadeInProgressRef.current + dt / OUTFIT_FADE_DURATION);
        setGroupOpacity(fadeInGroupRef.current, fadeInProgressRef.current);
        if (fadeInProgressRef.current === 1) {
          fadeInGroupRef.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const handleResize = () => {
      if (!canvasRef.current || !renderer || !camera) return;
      const w2 = canvasRef.current.clientWidth;
      const h2 = canvasRef.current.clientHeight;
      renderer.setSize(w2, h2, false);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', handleResize);
      if (spinnerTimerRef.current !== null) {
        clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
      controls.dispose();
      renderer.dispose();
      // Clear refs so a subsequent mount (e.g. React StrictMode replay) can
      // re-initialize a fresh WebGL context. Without this the idempotent guard
      // above would short-circuit and leave a disposed renderer in place.
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    loadBaseModel(config.gender, config.bodyProportion);
  }, [config.gender, config.bodyProportion, loadBaseModel]);

  useEffect(() => {
    if (!baseParamsRef.current) return;
    loadOutfitLayer(config.outfitId, config.gender);
  }, [config.outfitId, config.gender, loadOutfitLayer]);

  useEffect(() => {
    if (!baseParamsRef.current) return;
    const { scale, sizeY } = baseParamsRef.current;
    const hairStyle = HAIR_STYLES.find(h => h.id === config.hairStyleId);
    loadHairLayer(hairStyle?.gltfPath ?? '', config.hairColor, scale, sizeY);
  }, [config.hairStyleId, config.gender, loadHairLayer]);

  useEffect(() => {
    const applyTints = (group: THREE.Group | null) => {
      if (!group) return;
      applyColorTints(group, config.skinColor, config.hairColor, config.eyeColor);
    };
    applyTints(charGroupRef.current);
    applyTints(outfitGroupRef.current);
    if (hairGroupRef.current) {
      hairGroupRef.current.traverse((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.SkinnedMesh) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshStandardMaterial) m.color.copy(hexToColor(config.hairColor));
          }
        }
      });
    }
  }, [config.skinColor, config.hairColor, config.eyeColor]);

  useEffect(() => { applyBodyScale(); }, [config.heightCm, config.build, config.bodyProportion, config.gender, applyBodyScale]);

  const setGender = (g: Gender) => setConfig(prev => {
    const availableForGender = BODY_TYPES.filter(b => b.gender === g);
    const isCompatible = availableForGender.some(b => b.id === prev.bodyProportion);
    const newBodyProportion: BodyProportionType = isCompatible
      ? prev.bodyProportion
      : (availableForGender[0]?.id ?? prev.bodyProportion);
    return { ...prev, gender: g, bodyProportion: newBodyProportion };
  });

  const adjustStat = (key: keyof GrudgeStats, delta: number) => {
    setConfig(prev => {
      const cur    = prev.stats[key];
      const newVal = cur + delta;
      if (newVal < STAT_MIN || newVal > STAT_MAX) return prev;
      const spent = computeSpentPoints(prev.stats);
      if (delta > 0) {
        const cost = STAT_COST[newVal];
        if (spent + cost > STARTING_BUDGET) return prev;
      }
      return { ...prev, stats: { ...prev.stats, [key]: newVal } };
    });
  };

  const resetStats = () => setConfig(prev => ({ ...prev, stats: { ...DEFAULT_STATS } }));

  const handleChoosePerk = useCallback(
    (stat: keyof GrudgeStats, tier: 4 | 5, perkId: string) => {
      setConfig(prev => {
        const prevChoices = prev.perkChoices ?? { tier4: {}, tier5: {} };
        const key = tier === 4 ? 'tier4' : 'tier5';
        return {
          ...prev,
          perkChoices: {
            ...prevChoices,
            [key]: { ...prevChoices[key], [stat]: perkId },
          },
        };
      });
    },
    [],
  );

  const handleBeginSurvival = () => {
    onComplete({ ...config, name: nameInput.trim() || 'Survivor' });
  };

  const spentPoints = computeSpentPoints(config.stats);
  const remaining   = STARTING_BUDGET - spentPoints;

  const activeBg = BACKGROUNDS.find(b => b.id === config.backgroundId);
  const activeOutfit = (config.gender === 'female' ? FEMALE_OUTFITS : MALE_OUTFITS).find(o => o.id === config.outfitId);
  const activeHair = HAIR_STYLES.find(h => h.id === config.hairStyleId);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'identity',   label: 'Identity',   icon: '👤' },
    { id: 'appearance', label: 'Looks',       icon: '🎨' },
    { id: 'outfit',     label: 'Outfit',      icon: '👕' },
    { id: 'stats',      label: 'Stats',       icon: '📊' },
    { id: 'background', label: 'Origin',      icon: '🏷️' },
  ];

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1520 40%, #111827 100%)',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Rajdhani", "Segoe UI", sans-serif',
      color: '#e8d5b0',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 24px',
        background: 'rgba(0,0,0,0.55)',
        borderBottom: '1px solid rgba(180,130,60,0.3)',
        backdropFilter: 'blur(8px)',
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/grudges-logo.png"
            alt="Grudges"
            style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 8px #ff6b35)' }}
          />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.15em', color: '#ff8c42', textTransform: 'uppercase' }}>
              Grudges
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: '#8899aa', textTransform: 'uppercase' }}>
              Character Creation
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e8d5b0' }}>{nameInput || 'Survivor'}</div>
            <div style={{ fontSize: 10, color: '#8899aa' }}>
              {config.gender === 'female' ? '♀ ' : '♂ '}
              <span role="button" tabIndex={0} className="summary-link" onClick={() => setActiveTab('background')} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setActiveTab('background')} title="Jump to Origin tab">{activeBg?.label ?? 'No Origin'}</span>
              {' · '}
              <span role="button" tabIndex={0} className="summary-link" onClick={() => { setActiveTab('appearance'); setAppearanceScrollTarget('height'); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setActiveTab('appearance'); setAppearanceScrollTarget('height'); } }} title="Jump to Height slider">{heightLabel(config.heightCm)}</span>
              {' · '}
              <span role="button" tabIndex={0} className="summary-link" onClick={() => { setActiveTab('appearance'); setAppearanceScrollTarget('build'); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setActiveTab('appearance'); setAppearanceScrollTarget('build'); } }} title="Jump to Build slider">{buildLabel(config.build)}</span>
              {' · '}
              <span role="button" tabIndex={0} className="summary-link" onClick={() => setActiveTab('appearance')} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setActiveTab('appearance')} title="Jump to Looks tab (hair section)">{activeHair?.label ?? 'No Hair'}</span>
              {' · '}
              <span role="button" tabIndex={0} className="summary-link" onClick={() => setActiveTab('outfit')} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setActiveTab('outfit')} title="Jump to Outfit tab">{config.outfitId === 'none' ? 'Default' : (activeOutfit?.label ?? 'No Outfit')}</span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px',
            background: remaining > 0 ? 'rgba(200,120,40,0.15)' : 'rgba(76,175,80,0.12)',
            border: `1px solid ${remaining > 0 ? 'rgba(200,120,40,0.4)' : 'rgba(76,175,80,0.4)'}`,
            borderRadius: 6,
          }}>
            <span style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Budget</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: remaining > 0 ? '#e8a030' : '#4caf50', fontFamily: 'monospace' }}>
              {remaining}
              <span style={{ fontSize: 10, color: '#667788', fontWeight: 400 }}>/{STARTING_BUDGET}</span>
            </span>
          </div>
          {savedConfig && (
            <button
              onClick={() => setShowSavedPreview(true)}
              style={{
                background: 'rgba(30,60,90,0.7)',
                color: '#7ecfff', border: '1px solid rgba(80,160,220,0.5)', borderRadius: 6,
                padding: '9px 18px', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                boxShadow: '0 0 10px rgba(60,140,220,0.2)',
                transition: 'box-shadow 0.2s ease',
              }}
              title={`Preview saved character: ${savedConfig.name}`}
            >
              ↩ Load Previous Character
            </button>
          )}
          <button
            onClick={handleBeginSurvival}
            style={{
              background: 'linear-gradient(135deg, #c47a2a, #e8a030)',
              color: '#1a0e04', border: 'none', borderRadius: 6,
              padding: '9px 24px', fontSize: 13, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
              boxShadow: '0 0 18px rgba(200,120,30,0.4)',
              transition: 'box-shadow 0.2s ease',
            }}
          >
            ▶ Begin Survival
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside style={{
          width: 340, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: 'rgba(8,12,20,0.9)',
          borderRight: '1px solid rgba(180,130,60,0.2)',
          backdropFilter: 'blur(12px)',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(180,130,60,0.2)', flexShrink: 0 }}>
            {tabs.map(t => (
              <button key={t.id} ref={el => { if (el) tabButtonRefs.current[t.id] = el; }} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: '8px 2px',
                background: activeTab === t.id
                  ? 'linear-gradient(180deg,rgba(200,120,40,0.28) 0%,rgba(200,120,40,0.08) 100%)'
                  : 'transparent',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid #c87820' : '2px solid transparent',
                color: activeTab === t.id ? '#e8a030' : '#6677aa',
                cursor: 'pointer', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                transition: 'all 0.15s ease',
              }}>
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{
            flex: 1, overflowY: 'auto', padding: 14,
            opacity: 1,
            transition: 'opacity 0.15s ease',
          }}>
            {activeTab === 'identity' && (
              <IdentityTab
                gender={config.gender}
                nameInput={nameInput}
                onGenderChange={setGender}
                onNameChange={setNameInput}
              />
            )}
            {activeTab === 'appearance' && (
              <>
                <AppearanceTab
                  skinColor={config.skinColor}
                  hairColor={config.hairColor}
                  eyeColor={config.eyeColor}
                  faceShape={config.faceShape}
                  heightCm={config.heightCm}
                  build={config.build}
                  onSkinChange={c => setConfig(p => ({ ...p, skinColor: c }))}
                  onHairChange={c => setConfig(p => ({ ...p, hairColor: c }))}
                  onEyeChange={c => setConfig(p => ({ ...p, eyeColor: c }))}
                  onFaceShapeChange={f => setConfig(p => ({ ...p, faceShape: f }))}
                  onHeightChange={v => setConfig(p => ({ ...p, heightCm: v }))}
                  onBuildChange={v => setConfig(p => ({ ...p, build: v }))}
                  scrollTarget={appearanceScrollTarget}
                  onScrollHandled={() => setAppearanceScrollTarget(null)}
                />
                <div style={{
                  marginTop: 18, paddingTop: 14,
                  borderTop: '1px solid rgba(180,130,60,0.2)',
                }}>
                  <HairTab
                    styles={HAIR_STYLES}
                    gender={config.gender}
                    selectedId={config.hairStyleId}
                    onChange={id => setConfig(p => ({ ...p, hairStyleId: id }))}
                  />
                </div>
              </>
            )}
            {activeTab === 'outfit' && (
              <OutfitTab
                gender={config.gender}
                selectedId={config.outfitId}
                onChange={id => setConfig(p => ({ ...p, outfitId: id }))}
              />
            )}
            {activeTab === 'stats' && (
              <StatsTab
                stats={config.stats}
                remaining={remaining}
                onAdjust={adjustStat}
                onReset={resetStats}
                onShowCatalog={() => setShowPerkCatalog(true)}
              />
            )}
            {activeTab === 'background' && (
              <BackgroundTab
                selectedId={config.backgroundId}
                onChange={id => setConfig(p => ({ ...p, backgroundId: id }))}
              />
            )}
          </div>
        </aside>

        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: webglFailed ? 'none' : 'block' }}
          />

          {webglFailed && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            }}>
              <CharacterSilhouette skinColor={config.skinColor} hairColor={config.hairColor} gender={config.gender} />
              <div style={{ fontSize: 11, color: '#556677', letterSpacing: '0.1em' }}>
                {config.gender === 'female' ? '♀' : '♂'} · Basic Outfit
              </div>
            </div>
          )}

          {showSpinner && !webglFailed && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(8,12,20,0.6)', backdropFilter: 'blur(4px)',
              gap: 10, pointerEvents: 'none',
            }}>
              <div style={{
                width: 36, height: 36, border: '3px solid rgba(200,120,40,0.2)',
                borderTop: '3px solid #c87820', borderRadius: '50%',
                animation: 'spin 0.9s linear infinite',
              }} />
              <div style={{ fontSize: 12, color: '#c87820', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                Loading
              </div>
            </div>
          )}

          {!webglFailed && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(8,12,20,0.7)', border: '1px solid rgba(180,130,60,0.18)',
              borderRadius: 6, padding: '6px 16px',
              fontSize: 11, color: '#6677aa', letterSpacing: '0.1em', backdropFilter: 'blur(6px)',
              pointerEvents: 'none',
            }}>
              Drag to rotate · Scroll to zoom
            </div>
          )}

          {activeTab === 'stats' ? (
            <>
              <div style={{
                position: 'absolute', top: 14, right: 14,
                background: 'rgba(4,10,20,0.88)',
                border: '1px solid rgba(0,200,255,0.2)',
                borderRadius: 10, padding: 12,
                backdropFilter: 'blur(10px)',
                boxShadow: '0 0 20px rgba(0,200,255,0.08)',
              }}>
                <div style={{ fontSize: 8, color: '#336677', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>
                  GRUDGE STATS
                </div>
                <StatRadarChart stats={config.stats} size={220} />
              </div>
              <div style={{
                position: 'absolute', bottom: 50, right: 14,
                width: 250,
                backdropFilter: 'blur(10px)',
              }}>
                <BiometricReadout stats={config.stats} />
              </div>
            </>
          ) : (
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(8,12,20,0.8)', border: '1px solid rgba(180,130,60,0.25)',
              borderRadius: 8, padding: '10px 14px', backdropFilter: 'blur(8px)', minWidth: 170,
            }}>
              <div style={{ fontSize: 9, color: '#556677', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
                Stat Summary
              </div>
              {STAT_META.map(sm => (
                <div
                  key={sm.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer' }}
                  onClick={() => setStatBookKey(sm.key)}
                  title={`Open ${sm.label} book`}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: `radial-gradient(circle, ${sm.color}33 0%, rgba(0,0,0,0.6) 80%)`,
                    border: `1px solid ${sm.color}66`,
                    overflow: 'hidden', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img
                      src={sm.icon}
                      alt=""
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        filter: config.stats[sm.key] > 0 ? 'none' : 'grayscale(0.6) brightness(0.75)',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: '#8899aa', width: 28 }}>{sm.abbr}</div>
                  <div style={{ flex: 1, display: 'flex', gap: 2 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} style={{
                        flex: 1, height: 4, borderRadius: 2,
                        background: i < config.stats[sm.key] ? sm.color : 'rgba(255,255,255,0.07)',
                        transition: 'background 0.15s ease',
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: sm.color, width: 14, textAlign: 'right' }}>{config.stats[sm.key]}</div>
                </div>
              ))}
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(180,130,60,0.15)', fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8899aa' }}>Budget left</span>
                  <span style={{ color: remaining > 0 ? '#e8a030' : '#4caf50', fontWeight: 700 }}>
                    {remaining} / {STARTING_BUDGET}
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {statBookKey && (
        <StatBook
          statKey={statBookKey}
          currentLevel={config.stats[statBookKey]}
          pickedActiveId={config.perkChoices?.tier4?.[statBookKey]}
          pickedPassiveId={config.perkChoices?.tier5?.[statBookKey]}
          onClose={() => setStatBookKey(null)}
        />
      )}

      {showSavedPreview && savedConfig && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowSavedPreview(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 440, maxWidth: '90vw',
              background: 'linear-gradient(160deg, #0d1624 0%, #111827 100%)',
              border: '1px solid rgba(80,160,220,0.4)',
              borderRadius: 12,
              boxShadow: '0 0 40px rgba(60,140,220,0.25), 0 0 0 1px rgba(80,160,220,0.15)',
              overflow: 'hidden',
              fontFamily: '"Rajdhani", "Segoe UI", sans-serif',
            }}
          >
            <div style={{
              padding: '14px 20px 12px',
              background: 'rgba(60,120,200,0.12)',
              borderBottom: '1px solid rgba(80,160,220,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📂</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7ecfff' }}>
                  Saved Character
                </span>
              </div>
              <button
                onClick={() => setShowSavedPreview(false)}
                style={{
                  background: 'none', border: 'none', color: '#556677',
                  fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
                }}
              >✕</button>
            </div>

            <div style={{ padding: '20px 24px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'rgba(80,160,220,0.15)',
                  border: '2px solid rgba(80,160,220,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, flexShrink: 0,
                }}>
                  {savedConfig.gender === 'female' ? '♀' : '♂'}
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#e8d5b0', letterSpacing: '0.05em', lineHeight: 1.1 }}>
                    {savedConfig.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#7ecfff', letterSpacing: '0.1em', marginTop: 3 }}>
                    {savedConfig.gender === 'female' ? 'Female' : 'Male'}
                    {' · '}
                    {BODY_TYPES.find(b => b.id === savedConfig.bodyProportion && b.gender === savedConfig.gender)?.label ?? savedConfig.bodyProportion}
                    {' · '}
                    {savedConfig.heightCm} cm
                  </div>
                  {(() => {
                    const bg = BACKGROUNDS.find(b => b.id === savedConfig.backgroundId);
                    return bg ? (
                      <div style={{
                        marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                        background: 'rgba(255,255,255,0.05)', borderRadius: 5,
                        padding: '4px 8px', width: 'fit-content',
                      }}>
                        <span style={{ fontSize: 14 }}>{bg.icon}</span>
                        <span style={{ fontSize: 12, color: '#c8d8e8', fontWeight: 600 }}>{bg.label}</span>
                        <span style={{ fontSize: 10, color: '#6688aa', marginLeft: 4 }}>{bg.emphasis}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: '#556677', marginBottom: 8,
              }}>Stat Overview</div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px',
                marginBottom: 20,
              }}>
                {STAT_META.map(meta => {
                  const val = savedConfig.stats[meta.key];
                  return (
                    <div key={meta.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: `radial-gradient(circle, ${meta.color}33 0%, rgba(0,0,0,0.6) 80%)`,
                        border: `1px solid ${meta.color}77`,
                        overflow: 'hidden', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <img
                          src={meta.icon}
                          alt=""
                          style={{
                            width: '100%', height: '100%', objectFit: 'cover',
                            filter: val > 0 ? 'none' : 'grayscale(0.6) brightness(0.75)',
                          }}
                        />
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        color: meta.color, width: 28, flexShrink: 0,
                      }}>{meta.abbr}</span>
                      <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: `${(val / 6) * 100}%`,
                          background: meta.color,
                          opacity: val === 0 ? 0.25 : 1,
                        }} />
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: val > 0 ? meta.color : '#334455',
                        width: 14, textAlign: 'right', flexShrink: 0,
                      }}>{val}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setShowSavedPreview(false); onComplete(savedConfig); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 7,
                    background: 'linear-gradient(135deg, rgba(40,100,180,0.6), rgba(60,140,220,0.5))',
                    border: '1px solid rgba(80,160,220,0.6)',
                    color: '#7ecfff', cursor: 'pointer', fontSize: 13, fontWeight: 800,
                    fontFamily: 'inherit', letterSpacing: '0.1em', textTransform: 'uppercase',
                    boxShadow: '0 0 14px rgba(60,140,220,0.3)',
                  }}
                >
                  ▶ Load Character
                </button>
                <button
                  onClick={() => setShowSavedPreview(false)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#8899aa', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit', letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPerkCatalog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowPerkCatalog(false)}
        >
          <div style={{ width: 640, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <PerkTierCatalog
              stats={config.stats}
              perkChoices={config.perkChoices ?? { tier4: {}, tier5: {} }}
              onChoosePerk={handleChoosePerk}
            />
            <button
              onClick={() => setShowPerkCatalog(false)}
              style={{
                marginTop: 10, width: '100%',
                padding: '10px', borderRadius: 7,
                background: 'rgba(200,120,40,0.2)', border: '1px solid rgba(200,120,40,0.4)',
                color: '#e8a030', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                fontFamily: 'inherit', letterSpacing: '0.1em', textTransform: 'uppercase',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(200,120,40,0.4); border-radius: 2px; }
        .summary-link {
          cursor: pointer;
          text-decoration: underline;
          text-decoration-color: transparent;
          text-underline-offset: 2px;
          transition: color 0.15s ease, text-decoration-color 0.15s ease;
          outline: none;
          border-radius: 2px;
        }
        .summary-link:hover {
          color: #e8a030;
          text-decoration-color: rgba(232,160,48,0.55);
        }
        .summary-link:focus-visible {
          outline: 1px solid rgba(232,160,48,0.7);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};

function heightLabel(cm: number): string { return `${cm} cm`; }
function buildLabel(b: number): string {
  if (b < 20) return 'Slim';
  if (b < 45) return 'Lean';
  if (b < 65) return 'Athletic';
  if (b < 82) return 'Stocky';
  return 'Heavy';
}

const IdentityTab: React.FC<{
  gender: Gender;
  nameInput: string;
  bodyProportion: BodyProportionType;
  onGenderChange: (g: Gender) => void;
  onNameChange: (v: string) => void;
  onBodyProportionChange: (b: BodyProportionType) => void;
}> = ({ gender, nameInput, bodyProportion, onGenderChange, onNameChange, onBodyProportionChange }) => {
  const availableTypes = BODY_TYPES.filter(b => b.gender === gender);
  return (
  <div>
    <SectionLabel>Name</SectionLabel>
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(180,130,60,0.3)',
      borderRadius: 7, padding: 4, marginBottom: 6,
    }}>
      <input
        type="text" value={nameInput}
        onChange={e => onNameChange(e.target.value.slice(0, 24))}
        maxLength={24} placeholder="Enter your name..."
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          color: '#e8d5b0', fontSize: 17, fontWeight: 700, padding: '8px 10px',
          fontFamily: 'inherit', letterSpacing: '0.05em', boxSizing: 'border-box',
        }}
      />
    </div>
    <div style={{ fontSize: 10, color: '#556677', marginBottom: 18 }}>{nameInput.length}/24 characters</div>

    <SectionLabel>Gender</SectionLabel>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
      {(['female', 'male'] as Gender[]).map(g => (
        <button key={g} onClick={() => onGenderChange(g)} style={{
          padding: '18px 10px',
          background: gender === g
            ? 'linear-gradient(135deg,rgba(200,120,40,0.35),rgba(200,120,40,0.15))'
            : 'rgba(255,255,255,0.04)',
          border: gender === g ? '2px solid #c87820' : '2px solid rgba(255,255,255,0.08)',
          borderRadius: 9, color: gender === g ? '#e8a030' : '#8899aa', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          transition: 'all 0.15s ease',
        }}>
          <span style={{ fontSize: 28 }}>{g === 'female' ? '♀' : '♂'}</span>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'capitalize' }}>{g}</span>
        </button>
      ))}
    </div>

    <SectionLabel>Character</SectionLabel>
    <div style={{ fontSize: 10, color: '#556677', marginBottom: 8, lineHeight: 1.5 }}>
      Choose your look. Body shape sliders are in the <span style={{ color: '#e8a030' }}>Looks</span> tab.
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 18 }}>
      {availableTypes.map(bt => {
        const selected = bodyProportion === bt.id;
        return (
          <button key={bt.id} onClick={() => onBodyProportionChange(bt.id)} style={{
            cursor: 'pointer', padding: '10px 6px',
            background: selected
              ? 'linear-gradient(135deg,rgba(200,120,40,0.4),rgba(200,120,40,0.15))'
              : 'rgba(255,255,255,0.03)',
            border: selected ? '2px solid #c87820' : '2px solid rgba(255,255,255,0.07)',
            borderRadius: 8, fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            transition: 'all 0.12s ease',
          }}>
            <span style={{ fontSize: 20 }}>{bt.icon}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: selected ? '#e8a030' : '#8899aa', textAlign: 'center', lineHeight: 1.2,
            }}>
              {bt.label}
            </span>
          </button>
        );
      })}
    </div>
  </div>
  );
};

const AppearanceTab: React.FC<{
  skinColor: string; hairColor: string; eyeColor: string;
  faceShape: string; heightCm: number; build: number;
  onSkinChange: (c: string) => void;
  onHairChange: (c: string) => void;
  onEyeChange: (c: string) => void;
  onFaceShapeChange: (f: string) => void;
  onHeightChange: (v: number) => void;
  onBuildChange: (v: number) => void;
  scrollTarget?: 'height' | 'build' | null;
  onScrollHandled?: () => void;
}> = ({ skinColor, hairColor, eyeColor, faceShape, heightCm, build,
        onSkinChange, onHairChange, onEyeChange, onFaceShapeChange, onHeightChange, onBuildChange,
        scrollTarget, onScrollHandled }) => {
  const heightRef = useRef<HTMLDivElement>(null);
  const buildRef  = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollTarget) return;
    const el = scrollTarget === 'height' ? heightRef.current : buildRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    onScrollHandled?.();
  }, [scrollTarget, onScrollHandled]);
  return (
  <div>
    <SectionLabel>Face Shape</SectionLabel>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {FACE_SHAPES.map(f => (
        <button key={f.id} onClick={() => onFaceShapeChange(f.id)} style={{
          padding: '5px 10px', fontSize: 11, fontWeight: 600,
          background: faceShape === f.id ? 'rgba(200,120,40,0.3)' : 'rgba(255,255,255,0.04)',
          border: faceShape === f.id ? '1px solid #c87820' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 5, color: faceShape === f.id ? '#e8a030' : '#8899aa',
          cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.05em',
          transition: 'all 0.12s ease',
        }}>
          {f.label}
        </button>
      ))}
    </div>

    <div ref={heightRef} style={{ scrollMarginTop: 8 }}>
      <SectionLabel>Height</SectionLabel>
      <BodySlider value={heightCm} min={155} max={200} label={`${heightCm} cm`} onChange={onHeightChange} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#445566', marginBottom: 16, marginTop: 2 }}>
        <span>155 cm</span><span>200 cm</span>
      </div>
    </div>

    <div ref={buildRef} style={{ scrollMarginTop: 8 }}>
      <SectionLabel>Body Build</SectionLabel>
      <BodySlider value={build} min={0} max={100} label={buildLabel(build)} onChange={onBuildChange} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#445566', marginBottom: 16, marginTop: 2 }}>
        <span>Slim</span><span>Heavy</span>
      </div>
    </div>

    <SectionLabel>Skin Tone</SectionLabel>
    <ColorSwatches presets={SKIN_PRESETS} selected={skinColor} onChange={onSkinChange} />
    <div style={{ marginTop: 4, marginBottom: 14 }}>
      <CustomColorPicker label="Custom skin" value={skinColor} onChange={onSkinChange} />
    </div>

    <SectionLabel>Hair Color</SectionLabel>
    <ColorSwatches presets={HAIR_COLOR_PRESETS} selected={hairColor} onChange={onHairChange} />
    <div style={{ marginTop: 4, marginBottom: 14 }}>
      <CustomColorPicker label="Custom hair" value={hairColor} onChange={onHairChange} />
    </div>

    <SectionLabel>Eye Color</SectionLabel>
    <ColorSwatches presets={EYE_COLOR_PRESETS} selected={eyeColor} onChange={onEyeChange} />
    <div style={{ marginTop: 4, marginBottom: 4 }}>
      <CustomColorPicker label="Custom eyes" value={eyeColor} onChange={onEyeChange} />
    </div>
  </div>
  );
};

const HairTab: React.FC<{
  styles: typeof HAIR_STYLES;
  gender: Gender;
  selectedId: string;
  onChange: (id: string) => void;
}> = ({ styles, gender, selectedId, onChange }) => {
  const visible = styles.filter(h => h.gender === 'both' || h.gender === gender);
  return (
    <div>
      <SectionLabel>Hairstyle</SectionLabel>
      <div style={{ fontSize: 10, color: '#556677', marginBottom: 10 }}>
        {visible.length} styles available
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {visible.map(h => (
          <button key={h.id} onClick={() => onChange(h.id)} style={{
            padding: '10px 4px',
            background: selectedId === h.id
              ? 'linear-gradient(135deg,rgba(200,120,40,0.38),rgba(200,120,40,0.15))'
              : 'rgba(255,255,255,0.04)',
            border: selectedId === h.id ? '2px solid #c87820' : '2px solid rgba(255,255,255,0.07)',
            borderRadius: 7, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            fontFamily: 'inherit', transition: 'all 0.12s ease',
          }}>
            <span style={{ fontSize: 18 }}>{h.icon}</span>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: selectedId === h.id ? '#e8a030' : '#778899',
              textAlign: 'center', lineHeight: 1.2,
            }}>
              {h.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

const OutfitTab: React.FC<{
  gender: Gender;
  selectedId: string;
  onChange: (id: string) => void;
}> = ({ gender, selectedId, onChange }) => {
  const outfits = gender === 'female' ? FEMALE_OUTFITS : MALE_OUTFITS;
  return (
    <div>
      <SectionLabel>Outfit</SectionLabel>
      <div style={{ fontSize: 10, color: '#556677', marginBottom: 10, lineHeight: 1.5 }}>
        Outfit is layered on top of your base body — no full reload when switching.
      </div>
      <button
        onClick={() => onChange('none')}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 7,
          background: selectedId === 'none'
            ? 'linear-gradient(135deg,rgba(200,120,40,0.3),rgba(200,120,40,0.1))'
            : 'rgba(255,255,255,0.03)',
          border: selectedId === 'none' ? '1px solid rgba(200,120,40,0.6)' : '1px solid rgba(255,255,255,0.07)',
          borderRadius: 7, padding: '8px 11px', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 0.12s ease',
        }}
      >
        <span style={{ fontSize: 20 }}>🧍</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: selectedId === 'none' ? '#e8a030' : '#aabbcc' }}>
            Default
          </div>
          <div style={{ fontSize: 10, color: '#556677' }}>Body-type default outfit</div>
        </div>
        {selectedId === 'none' && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#c87820', fontWeight: 700 }}>✓</span>
        )}
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
        {outfits.map(o => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              cursor: 'pointer', padding: '10px 8px',
              background: selectedId === o.id
                ? 'linear-gradient(135deg,rgba(200,120,40,0.35),rgba(200,120,40,0.12))'
                : 'rgba(255,255,255,0.03)',
              border: selectedId === o.id ? '2px solid #c87820' : '2px solid rgba(255,255,255,0.07)',
              borderRadius: 8, fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              transition: 'all 0.12s ease',
            }}
          >
            <span style={{ fontSize: 22 }}>{o.icon}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: selectedId === o.id ? '#e8a030' : '#8899aa', textAlign: 'center', lineHeight: 1.2,
            }}>
              {o.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

const StatsTab: React.FC<{
  stats: GrudgeStats;
  remaining: number;
  onAdjust: (key: keyof GrudgeStats, delta: number) => void;
  onReset: () => void;
  onShowCatalog: () => void;
}> = ({ stats, remaining, onAdjust, onReset, onShowCatalog }) => {
  const spentPoints = computeSpentPoints(stats);

  const rootNodes = SKILL_TREE.filter(n => !n.requires || n.requires.length === 0);

  return (
    <div>
      <div style={{
        background: remaining > 0 ? 'rgba(200,120,40,0.1)' : 'rgba(76,175,80,0.1)',
        border: `1px solid ${remaining > 0 ? 'rgba(200,120,40,0.35)' : 'rgba(76,175,80,0.35)'}`,
        borderRadius: 7, padding: '8px 12px', marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 9, color: '#8899aa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Points Remaining
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: remaining > 0 ? '#e8a030' : '#4caf50', lineHeight: 1.1 }}>
            {remaining}
            <span style={{ fontSize: 11, fontWeight: 400, color: '#667788' }}> / {STARTING_BUDGET}</span>
          </div>
          <div style={{ fontSize: 9, color: '#445566', marginTop: 2 }}>
            Spent: {spentPoints} pts
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
          <button onClick={onReset} style={{
            padding: '4px 10px', fontSize: 9, fontWeight: 700,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 5, color: '#8899aa', cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Reset
          </button>
          <button onClick={onShowCatalog} style={{
            padding: '4px 10px', fontSize: 9, fontWeight: 700,
            background: 'rgba(200,120,40,0.1)', border: '1px solid rgba(200,120,40,0.3)',
            borderRadius: 5, color: '#c87820', cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Perk Catalog
          </button>
        </div>
      </div>

      <div style={{ fontSize: 9, color: '#445566', lineHeight: 1.5, marginBottom: 10 }}>
        Next level cost doubles: 1→2=2pt, 2→3=4pt, 3→4=8pt, 4→5=16pt…
      </div>

      {STAT_META.map(sm => (
        <StatRow
          key={sm.key}
          meta={sm}
          value={stats[sm.key]}
          remaining={remaining}
          onAdjust={onAdjust}
        />
      ))}

      <BadgesPanel stats={stats} />

      <div style={{ marginTop: 12 }}>
        <SectionLabel>Skill Unlock Preview</SectionLabel>
        <div style={{ fontSize: 9, color: '#445566', marginBottom: 8 }}>
          Root nodes accessible at start
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rootNodes.map(node => {
            const colors: Record<string, string> = {
              strength: '#ff6b35', agility: '#69f0ae',
              intelligence: '#4fc3f7', endurance: '#fff176', ability: '#ce93d8',
            };
            const color = colors[node.stat] ?? '#888';
            return (
              <div
                key={node.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}22`,
                  borderRadius: 5,
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#8899aa', flex: 1 }}>{node.name}</span>
                <span style={{ fontSize: 9, color: color, textTransform: 'capitalize' }}>{node.stat}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const StatRow: React.FC<{
  meta: typeof STAT_META[0];
  value: number;
  remaining: number;
  onAdjust: (key: keyof GrudgeStats, delta: number) => void;
}> = ({ meta, value, remaining, onAdjust }) => {
  const nextCost   = costForNext(value);
  const canIncrease = value < STAT_MAX && remaining >= nextCost;
  const canDecrease = value > STAT_MIN;
  const milestonePerks = value > 0
    ? `${meta.abbr} ${value}: +perk`
    : null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid ${value > 0 ? meta.color + '22' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 7, padding: '8px 10px', marginBottom: 7,
      transition: 'border-color 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: `radial-gradient(circle, ${meta.color}26 0%, rgba(0,0,0,0.55) 78%)`,
          border: `1px solid ${value > 0 ? meta.color + 'aa' : meta.color + '44'}`,
          boxShadow: value > 0 ? `0 0 10px ${meta.color}66, inset 0 0 6px ${meta.color}33` : 'none',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        }}>
          <img
            src={meta.icon}
            alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              filter: value > 0 ? 'none' : 'grayscale(0.6) brightness(0.75)',
              transition: 'filter 0.2s ease',
            }}
          />
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, letterSpacing: '0.1em', width: 28 }}>{meta.abbr}</span>
        <span style={{ fontSize: 11, color: '#aabbcc', flex: 1 }}>{meta.label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => onAdjust(meta.key, -1)}
            disabled={!canDecrease}
            style={{
              width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)', color: canDecrease ? '#aabbcc' : '#334455',
              cursor: canDecrease ? 'pointer' : 'default',
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}
          >−</button>
          <span style={{
            fontSize: 14, fontWeight: 800, color: meta.color,
            width: 18, textAlign: 'center',
            textShadow: value > 0 ? `0 0 8px ${meta.color}66` : 'none',
            transition: 'text-shadow 0.2s ease',
          }}>
            {value}
          </span>
          <button
            onClick={() => onAdjust(meta.key, +1)}
            disabled={!canIncrease}
            style={{
              width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: canIncrease ? '#aabbcc' : '#334455',
              cursor: canIncrease ? 'pointer' : 'default',
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}
          >+</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        {Array.from({ length: STAT_MAX }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 5, borderRadius: 3,
            background: i < value ? meta.color : 'rgba(255,255,255,0.07)',
            boxShadow: i < value ? `0 0 4px ${meta.color}44` : 'none',
            transition: 'background 0.15s ease, box-shadow 0.15s ease',
          }} />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 9, color: '#445566', flex: 1 }}>{meta.desc}</div>
        {value < STAT_MAX && (
          <div style={{
            fontSize: 9, color: remaining >= nextCost ? '#e8a030' : '#556677',
            fontFamily: 'monospace', marginLeft: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4, padding: '1px 5px',
          }}>
            +1 = {nextCost}pt
          </div>
        )}
      </div>
    </div>
  );
};

const BackgroundTab: React.FC<{
  selectedId: string;
  onChange: (id: string) => void;
}> = ({ selectedId, onChange }) => (
  <div>
    <div style={{ fontSize: 11, color: '#667788', marginBottom: 12, lineHeight: 1.6 }}>
      Your origin shapes your history and starting proficiencies. Stats are allocated separately.
    </div>
    {BACKGROUNDS.map(bg => (
      <button key={bg.id} onClick={() => onChange(bg.id)} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8,
        background: selectedId === bg.id
          ? 'linear-gradient(135deg,rgba(200,120,40,0.2),rgba(200,120,40,0.07))'
          : 'rgba(255,255,255,0.03)',
        border: selectedId === bg.id ? '1px solid rgba(200,120,40,0.6)' : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit',
        transition: 'all 0.15s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>{bg.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: selectedId === bg.id ? '#e8a030' : '#aabbcc' }}>
              {bg.label}
            </div>
            <div style={{ fontSize: 10, color: '#c87820', letterSpacing: '0.08em' }}>{bg.emphasis}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#778899', lineHeight: 1.5, marginBottom: 6 }}>
          {bg.description}
        </div>
        {selectedId === bg.id && (
          <div>
            <div style={{ fontSize: 9, color: '#556677', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
              Starting Proficiencies
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {bg.proficiencies.map(p => (
                <span key={p} style={{
                  padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: 'rgba(200,120,40,0.15)', border: '1px solid rgba(200,120,40,0.3)',
                  color: '#c87820',
                }}>{p}</span>
              ))}
            </div>
          </div>
        )}
      </button>
    ))}
  </div>
);

const BodySlider: React.FC<{
  value: number; min: number; max: number; label: string;
  onChange: (v: number) => void;
}> = ({ value, min, max, label, onChange }) => (
  <div style={{ marginBottom: 4 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: '#aabbcc', fontWeight: 600 }}>{label}</span>
    </div>
    <input
      type="range" min={min} max={max} value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: '100%', accentColor: '#c87820', cursor: 'pointer' }}
    />
  </div>
);

const ColorSwatches: React.FC<{
  presets: { id: string; label: string; hex: string }[];
  selected: string; onChange: (c: string) => void;
}> = ({ presets, selected, onChange }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 4 }}>
    {presets.map(p => (
      <button key={p.id} title={p.label} onClick={() => onChange(p.hex)} style={{
        width: 28, height: 28, borderRadius: 6, background: p.hex,
        border: selected === p.hex ? '2px solid #e8a030' : '2px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        transform: selected === p.hex ? 'scale(1.2)' : 'scale(1)',
        transition: 'all 0.1s ease',
        boxShadow: selected === p.hex ? `0 0 10px ${p.hex}88` : 'none',
      }} />
    ))}
  </div>
);

const CustomColorPicker: React.FC<{ label: string; value: string; onChange: (c: string) => void }> = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <label style={{ fontSize: 10, color: '#6677aa', letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1 }}>{label}</label>
    <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{
      width: 34, height: 26, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none', padding: 0,
    }} />
    <div style={{ fontSize: 10, color: '#556677', fontFamily: 'monospace', width: 56 }}>{value}</div>
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c87820',
    marginBottom: 9, marginTop: 4, display: 'flex', alignItems: 'center', gap: 7,
  }}>
    <div style={{ flex: 1, height: 1, background: 'rgba(200,120,40,0.3)' }} />
    {children}
    <div style={{ flex: 1, height: 1, background: 'rgba(200,120,40,0.3)' }} />
  </div>
);

const CharacterSilhouette: React.FC<{ skinColor: string; hairColor: string; gender: Gender }> = ({ skinColor, hairColor, gender }) => (
  <div style={{ position: 'relative', width: 200, height: 360, userSelect: 'none' }}>
    <svg viewBox="0 0 220 380" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 0 18px rgba(200,120,40,0.2))' }}>
      <ellipse cx="110" cy="60" rx={gender === 'female' ? 36 : 34} ry={gender === 'female' ? 42 : 40} fill={skinColor} />
      <ellipse cx="110" cy="32" rx={gender === 'female' ? 40 : 36} ry={gender === 'female' ? 28 : 20} fill={hairColor} />
      {gender === 'female' && (
        <>
          <path d="M74 50 Q68 100 72 120" stroke={hairColor} strokeWidth="12" fill="none" strokeLinecap="round" />
          <path d="M146 50 Q152 100 148 120" stroke={hairColor} strokeWidth="12" fill="none" strokeLinecap="round" />
        </>
      )}
      <rect x="100" y="96" width="20" height="18" rx="4" fill={skinColor} />
      <path
        d={gender === 'female'
          ? 'M72 114 Q65 140 62 175 Q80 190 110 192 Q140 190 158 175 Q155 140 148 114 Q130 108 110 108 Q90 108 72 114Z'
          : 'M68 114 Q60 145 58 178 Q80 192 110 192 Q140 192 162 178 Q160 145 152 114 Q134 108 110 108 Q86 108 68 114Z'}
        fill="#2d3a2e"
      />
      <path d="M63 192 Q60 230 62 310 Q72 314 86 310 Q92 270 110 250 Q128 270 134 310 Q148 314 158 310 Q160 230 157 192Z" fill="#3a3020" />
      <rect x="62" y="186" width="96" height="12" rx="3" fill="#2a1a0a" />
      <rect x="105" y="184" width="10" height="16" rx="2" fill="#c87820" />
      <path d={gender === 'female' ? 'M72 118 Q55 150 54 200' : 'M68 118 Q50 155 48 205'} stroke="#2d3a2e" strokeWidth="22" strokeLinecap="round" fill="none" />
      <path d={gender === 'female' ? 'M148 118 Q165 150 166 200' : 'M152 118 Q170 155 172 205'} stroke="#2d3a2e" strokeWidth="22" strokeLinecap="round" fill="none" />
      <ellipse cx={gender === 'female' ? 54 : 48} cy="204" rx="12" ry="14" fill={skinColor} />
      <ellipse cx={gender === 'female' ? 166 : 172} cy="204" rx="12" ry="14" fill={skinColor} />
      <ellipse cx="70" cy="316" rx="18" ry="10" fill="#1a1208" />
      <ellipse cx="150" cy="316" rx="18" ry="10" fill="#1a1208" />
      <circle cx="98" cy="58" r="5" fill="#fff" />
      <circle cx="122" cy="58" r="5" fill="#fff" />
      <circle cx="99" cy="59" r="3" fill="#1a0a0a" />
      <circle cx="123" cy="59" r="3" fill="#1a0a0a" />
      <path d="M92 50 Q98 47 104 50" stroke={hairColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M116 50 Q122 47 128 50" stroke={hairColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  </div>
);

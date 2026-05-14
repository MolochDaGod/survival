import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WeaponStats } from '../game/types';

// Single shared offscreen renderer — avoids exhausting WebGL context limits
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;
const cache: Record<string, string> = {};

function getSharedRenderer(): THREE.WebGLRenderer | null {
  if (sharedRenderer) return sharedRenderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setSize(160, 160);
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
    fill.position.set(-2, 1, -1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffaa44, 0.4);
    rim.position.set(0, -1, -2);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(0.5, 0.3, 2.0);
    camera.lookAt(0, 0.05, 0);

    sharedRenderer = r;
    sharedScene = scene;
    sharedCamera = camera;
    return r;
  } catch {
    return null;
  }
}

function buildWeaponGroup(weapon: WeaponStats): THREE.Group {
  const group = new THREE.Group();
  const c = weapon.color;

  switch (weapon.type) {
    case 'sword': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.88, 0.038), new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.18 }));
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.055, 0.065), new THREE.MeshStandardMaterial({ color: 0x7b3f00, metalness: 0.5 }));
      guard.position.y = -0.34;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.045), new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.85 }));
      handle.position.y = -0.52;
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshStandardMaterial({ color: 0x7b3f00, metalness: 0.6 }));
      pommel.position.y = -0.64;
      group.add(blade, guard, handle, pommel);
      break;
    }
    case 'axe': {
      const haft = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.78, 0.065), new THREE.MeshStandardMaterial({ color: 0x6b3f00, roughness: 0.92 }));
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.045), new THREE.MeshStandardMaterial({ color: c, metalness: 0.72, roughness: 0.28 }));
      head.position.y = 0.34;
      const spike = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: c, metalness: 0.72 }));
      spike.position.y = -0.3;
      group.add(haft, head, spike);
      break;
    }
    case 'dagger': {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.46, 0.036), new THREE.MeshStandardMaterial({ color: c, metalness: 0.92, roughness: 0.14 }));
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.048, 0.055), new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.6 }));
      guard.position.y = -0.2;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.17, 0.038), new THREE.MeshStandardMaterial({ color: 0x330044, roughness: 0.75 }));
      handle.position.y = -0.36;
      group.add(blade, guard, handle);
      break;
    }
    case 'mace': {
      const haft = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.68, 0.065), new THREE.MeshStandardMaterial({ color: 0x6b3f00, roughness: 0.92 }));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshStandardMaterial({ color: c, metalness: 0.72, roughness: 0.28 }));
      head.position.y = 0.4;
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), new THREE.MeshStandardMaterial({ color: c, metalness: 0.8 }));
        const angle = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(angle) * 0.14, 0.4, Math.sin(angle) * 0.14);
        spike.rotation.z = -angle + Math.PI / 2;
        group.add(spike);
      }
      group.add(haft, head);
      break;
    }
    case 'gun': {
      const isShotgun = weapon.id === 'hellfire_shotgun';
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, isShotgun ? 0.62 : 0.48), new THREE.MeshStandardMaterial({ color: c, metalness: 0.62, roughness: 0.38 }));
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, isShotgun ? 0.55 : 0.42), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.82 }));
      barrel.position.set(0, 0.1, -(isShotgun ? 0.32 : 0.24));
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.095, isShotgun ? 0.28 : 0.22, 0.12), new THREE.MeshStandardMaterial({ color: isShotgun ? 0x6b3f00 : 0x4a3728, roughness: 0.92 }));
      grip.position.set(0, -0.21, isShotgun ? 0.15 : 0.1);
      if (isShotgun) {
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.26), new THREE.MeshStandardMaterial({ color: 0x6b3f00 }));
        stock.position.set(0, -0.06, 0.3);
        group.add(stock);
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }));
        pump.position.set(0, -0.04, -0.15);
        group.add(pump);
      }
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.065, 0.28), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 }));
      slide.position.set(0, 0.11, -(isShotgun ? 0.1 : 0.06));
      group.add(frame, barrel, grip, slide);
      break;
    }
    default: {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: c })));
    }
  }
  return group;
}

function renderWeaponToDataURL(weapon: WeaponStats, size: number): string {
  const r = getSharedRenderer();
  if (!r || !sharedScene || !sharedCamera) return '';

  // Set renderer size
  r.setSize(size, size);
  sharedCamera.aspect = 1;
  sharedCamera.updateProjectionMatrix();

  // Build weapon group
  const group = buildWeaponGroup(weapon);
  const isGun = weapon.type === 'gun';
  group.scale.setScalar(isGun ? 1.3 : 1.05);
  group.rotation.y = 0.5;
  group.rotation.x = isGun ? 0.18 : -0.08;

  sharedScene.add(group);
  r.render(sharedScene, sharedCamera);
  const dataURL = r.domElement.toDataURL('image/png');
  sharedScene.remove(group);

  // Dispose weapon geo/mat
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });

  return dataURL;
}

export const WeaponPreview: React.FC<{ weapon: WeaponStats; size?: number }> = ({ weapon, size = 100 }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    const cacheKey = `${weapon.id}-${size}`;
    if (cache[cacheKey]) {
      setDataUrl(cache[cacheKey]);
      return;
    }
    // Small delay to avoid blocking during initial render
    const id = setTimeout(() => {
      try {
        const url = renderWeaponToDataURL(weapon, size);
        if (url) {
          cache[cacheKey] = url;
          setDataUrl(url);
        }
      } catch {}
    }, 10);
    return () => clearTimeout(id);
  }, [weapon.id, size]);

  if (!dataUrl) {
    // Placeholder while rendering
    return (
      <div style={{
        width: size, height: size, borderRadius: '8px',
        background: 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.35,
      }}>
        {weapon.type === 'gun' ? '🔫' : weapon.type === 'sword' ? '⚔️' : weapon.type === 'axe' ? '🪓' : weapon.type === 'dagger' ? '🗡️' : '🔱'}
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={weapon.name}
      style={{ width: size, height: size, borderRadius: '8px', display: 'block' }}
    />
  );
};

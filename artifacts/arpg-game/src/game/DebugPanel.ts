import GUI from 'lil-gui';
import * as THREE from 'three';
import type { CameraTuning } from './ThirdPersonCamera';

/**
 * Runtime tuning panel powered by lil-gui. Toggle visibility with the
 * backtick key (`) OR the on-screen Admin button (top-right of HUD).
 * Keeps a reference to the live engine so changes apply immediately
 * without a reload.
 *
 * The panel intentionally only exposes safe, reversible knobs — anything
 * that would corrupt game state (e.g. wave, inventory) lives elsewhere.
 *
 * Camera tunings are persisted to localStorage under `grudge:debug:tp` /
 * `grudge:debug:arpg` so the user's hand-tuned camera survives reloads.
 */

interface DebugDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Setter for first-person camera FOV (PlayerController also has one). */
  fpCamera?: THREE.PerspectiveCamera;
  /** Force a one-shot shadow map regen (useful after moving the sun). */
  forceShadowUpdate: () => void;
  /** Reset player to origin. */
  resetPlayer: () => void;
  /** Live camera tunings — mutated in place so PlayerController picks
   * up the changes on the very next frame (it reads these refs every
   * tick). Pass the actual exported singletons from ThirdPersonCamera. */
  tpTuning?: CameraTuning;
  arpgTuning?: CameraTuning;
  /** GearVisualManager instance for live gear preview. */
  gearVisuals?: import('./GearVisualManager').GearVisualManager;
  /** Current character gender for gear path resolution. */
  characterGender?: () => import('./CharacterConfig').Gender;
}

const LS_TP   = 'grudge:debug:tp';
const LS_ARPG = 'grudge:debug:arpg';

/** Snapshot of a CameraTuning suitable for JSON.stringify. */
interface TuningSnapshot {
  ox: number; oy: number; oz: number;
  lx: number; ly: number; lz: number;
  follow: number; look: number;
}

function snapshot(t: CameraTuning): TuningSnapshot {
  return {
    ox: t.idealOffset.x, oy: t.idealOffset.y, oz: t.idealOffset.z,
    lx: t.idealLookat.x, ly: t.idealLookat.y, lz: t.idealLookat.z,
    follow: t.follow, look: t.look,
  };
}

function applySnapshot(t: CameraTuning, s: TuningSnapshot) {
  t.idealOffset.set(s.ox, s.oy, s.oz);
  t.idealLookat.set(s.lx, s.ly, s.lz);
  t.follow = s.follow;
  t.look   = s.look;
}

function loadTuning(key: string, target: CameraTuning) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<TuningSnapshot>;
    if (typeof parsed.ox !== 'number') return;
    applySnapshot(target, parsed as TuningSnapshot);
  } catch { /* ignore corrupt snapshot */ }
}

function saveTuning(key: string, source: CameraTuning) {
  try { localStorage.setItem(key, JSON.stringify(snapshot(source))); }
  catch { /* quota / private mode — silently skip */ }
}

export class DebugPanel {
  private gui: GUI;
  private deps: DebugDeps;
  private visible = false;

  constructor(deps: DebugDeps) {
    this.deps = deps;
    // Load any persisted camera tunings BEFORE building the folder so the
    // initial slider values reflect the user's saved preset, not the
    // hardcoded defaults from ThirdPersonCamera.ts.
    if (deps.tpTuning)   loadTuning(LS_TP,   deps.tpTuning);
    if (deps.arpgTuning) loadTuning(LS_ARPG, deps.arpgTuning);

    this.gui = new GUI({ title: 'Admin / Debug (` to toggle)', width: 300 });
    this.gui.domElement.style.zIndex = '10000';
    this.hide();

    this.buildCameraFolder();
    if (deps.tpTuning)   this.buildTuningFolder('Camera (3rd-person)', deps.tpTuning,   LS_TP);
    if (deps.arpgTuning) this.buildTuningFolder('Camera (ARPG)',       deps.arpgTuning, LS_ARPG);
    this.buildRendererFolder();
    this.buildSceneFolder();
    this.buildActionsFolder();
    this.buildGearFolder();

    document.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Backquote') { this.toggle(); e.preventDefault(); }
  };

  private buildCameraFolder() {
    const f = this.gui.addFolder('Camera');
    const cam = this.deps.camera;
    const proxy = {
      fov: cam.fov,
      far: cam.far,
    };
    f.add(proxy, 'fov', 50, 110, 1).onChange((v: number) => {
      cam.fov = v;
      cam.updateProjectionMatrix();
      if (this.deps.fpCamera) {
        this.deps.fpCamera.fov = v;
        this.deps.fpCamera.updateProjectionMatrix();
      }
    });
    f.add(proxy, 'far', 80, 600, 10).onChange((v: number) => {
      cam.far = v;
      cam.updateProjectionMatrix();
      if (this.deps.fpCamera) {
        this.deps.fpCamera.far = v;
        this.deps.fpCamera.updateProjectionMatrix();
      }
    });
  }

  /**
   * Build a folder of live sliders for one CameraTuning. All edits mutate
   * the shared object that PlayerController reads every frame, so the
   * change is visible the moment the slider moves. Each change also
   * persists to localStorage so the user keeps their preset across reloads.
   */
  private buildTuningFolder(label: string, tuning: CameraTuning, lsKey: string) {
    const f = this.gui.addFolder(label);
    const persist = () => saveTuning(lsKey, tuning);

    const off = f.addFolder('Offset (behind/above player)');
    off.add(tuning.idealOffset, 'x',  -5,  5,  0.05).name('right (+) / left (-)').onChange(persist);
    off.add(tuning.idealOffset, 'y',   0,  8,  0.05).name('height').onChange(persist);
    off.add(tuning.idealOffset, 'z', -10,  2,  0.05).name('back (-) / fwd (+)').onChange(persist);

    const lk = f.addFolder('Look-at point');
    lk.add(tuning.idealLookat, 'x', -3, 3, 0.05).onChange(persist);
    lk.add(tuning.idealLookat, 'y',  0, 5, 0.05).onChange(persist);
    lk.add(tuning.idealLookat, 'z', -3, 5, 0.05).onChange(persist);

    f.add(tuning, 'follow', 1, 30, 0.5).name('follow snap').onChange(persist);
    f.add(tuning, 'look',   1, 30, 0.5).name('look snap').onChange(persist);

    f.add({
      reset: () => {
        try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
        // Force a page reload so the in-memory tuning resets to the
        // hardcoded defaults from ThirdPersonCamera.ts. Cheaper than
        // round-tripping a "default snapshot" through the panel.
        window.location.reload();
      },
    }, 'reset').name('Reset to default (reloads)');
  }

  private buildRendererFolder() {
    const f = this.gui.addFolder('Renderer');
    const r = this.deps.renderer;
    const proxy = {
      exposure: r.toneMappingExposure,
      shadowsAuto: r.shadowMap.autoUpdate,
    };
    f.add(proxy, 'exposure', 0.2, 2.5, 0.05).onChange((v: number) => {
      r.toneMappingExposure = v;
    });
    f.add(proxy, 'shadowsAuto').onChange((v: boolean) => {
      r.shadowMap.autoUpdate = v;
      if (v) r.shadowMap.needsUpdate = true;
    });
  }

  private buildSceneFolder() {
    const f = this.gui.addFolder('Atmosphere');
    const fog = this.deps.scene.fog as THREE.FogExp2 | THREE.Fog | null;
    if (fog instanceof THREE.FogExp2) {
      f.add(fog, 'density', 0.001, 0.05, 0.0005);
    }
    // Toggle key static helpers (axes etc) — handled by SceneBuilder if added later.
  }

  private buildActionsFolder() {
    const f = this.gui.addFolder('Actions');
    f.add({ shadows: () => this.deps.forceShadowUpdate() }, 'shadows').name('Force shadow regen');
    f.add({ reset: () => this.deps.resetPlayer() }, 'reset').name('Reset player to origin');
  }

  /**
   * Gear Preview folder — lets you equip/unequip armor meshes per slot
   * to visually verify the GearVisualManager's mesh swapping, base-mesh
   * hiding, and skeleton rebinding in real time.
   */
  private buildGearFolder() {
    const gv = this.deps.gearVisuals;
    if (!gv || !gv.isBound()) return;

    const f = this.gui.addFolder('Gear Preview');

    const GEAR_SETS = ['peasant', 'ranger'] as const;
    const SLOTS = [
      { label: 'Helm',  slot: 'helm',  dir: 'head' },
      { label: 'Chest', slot: 'chest', dir: 'chest' },
      { label: 'Legs',  slot: 'legs',  dir: 'legs' },
      { label: 'Boots', slot: 'boots', dir: 'feet' },
    ] as const;

    const gender = () => this.deps.characterGender?.() ?? 'male';

    for (const slotDef of SLOTS) {
      const sf = f.addFolder(slotDef.label);
      for (const set of GEAR_SETS) {
        // Skip peasant head (doesn't exist)
        if (slotDef.dir === 'head' && set === 'peasant') continue;
        sf.add({
          equip: () => {
            const path = `/models/gear/${slotDef.dir}/${set}_${gender()}.fbx`;
            gv.equip(slotDef.slot, path);
          },
        }, 'equip').name(`Equip ${set}`);
      }
      sf.add({
        unequip: () => gv.unequip(slotDef.slot),
      }, 'unequip').name('Unequip (show base)');
    }

    // Bulk operations
    f.add({
      equipAll: () => {
        const g = gender();
        gv.equip('helm',  `/models/gear/head/ranger_${g}.fbx`);
        gv.equip('chest', `/models/gear/chest/ranger_${g}.fbx`);
        gv.equip('legs',  `/models/gear/legs/ranger_${g}.fbx`);
        gv.equip('boots', `/models/gear/feet/ranger_${g}.fbx`);
      },
    }, 'equipAll').name('⚔️ Full Ranger Set');

    f.add({
      equipPeasant: () => {
        const g = gender();
        gv.equip('helm',  `/models/gear/head/ranger_${g}.fbx`); // no peasant head
        gv.equip('chest', `/models/gear/chest/peasant_${g}.fbx`);
        gv.equip('legs',  `/models/gear/legs/peasant_${g}.fbx`);
        gv.equip('boots', `/models/gear/feet/peasant_${g}.fbx`);
      },
    }, 'equipPeasant').name('🧑‍🌾 Full Peasant Set');

    f.add({
      stripAll: () => {
        gv.unequip('helm');
        gv.unequip('chest');
        gv.unequip('legs');
        gv.unequip('boots');
      },
    }, 'stripAll').name('🔄 Strip All (base mesh)');
  }

  show() { this.gui.domElement.style.display = ''; this.visible = true; }
  hide() { this.gui.domElement.style.display = 'none'; this.visible = false; }
  toggle() { this.visible ? this.hide() : this.show(); }

  dispose() {
    document.removeEventListener('keydown', this.onKey);
    this.gui.destroy();
  }
}

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '../game/GameEngine';
import { PlayerStats, GameState, AbilityDef, WeaponStats } from '../game/types';
import { INITIAL_PLAYER_STATS, ABILITIES, SKILL_TREE, WEAPONS } from '../game/constants';
import { CharacterConfig, DEFAULT_CHARACTER_CONFIG, getStartingLoadout } from '../game/CharacterConfig';
import { PauseMenu } from './PauseMenu';
import { PickupToast } from './PickupToast';
import { HotkeyHelp } from './HotkeyHelp';
import { SpawnIntroToast } from './SpawnIntroToast';
import { HudOverlay } from './HudOverlay';
import { BestiaryBook } from './books/BestiaryBook';
import { InventoryBook } from './books/InventoryBook';
import { PerksBook } from './books/PerksBook';
import type { MapMarker } from './books/MiniMap';
import { ALL_PERKS, type StatTrack, type Perk } from '../game/progression/PerkSystem';
import { ProfessionsService } from '../game/progression/ProfessionsService';
import { ProfessionsBook } from './books/ProfessionsBook';
import { ITEM_DATABASE } from '../game/Items';
import { SurvivalInventory } from './SurvivalInventory';
import { CraftingPanel } from './CraftingPanel';
import styles from './GameCanvas.module.css';
import { BuildMenu } from './BuildMenu';
import { MainPanel } from './MainPanel';
import { CoopMenu } from './CoopMenu';
import { ItemDef, ItemStats, InventoryItem, EquipSlot } from '../game/Items';
import { EquippedSet } from '../game/Inventory';
import { SURVIVAL_ITEMS } from '../game/survival/SurvivalItems';
import { RECIPES, CraftingStation } from '../game/survival/Recipes';

function checkWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

interface GameCanvasProps {
  characterConfig?: CharacterConfig;
}

/**
 * Pull a key glyph out of a prompt string. Engine-side prompts embed an
 * explicit "Press X" hint (e.g. CitySpawner emits `Press T  Hello`,
 * DoorSystem and InteriorPortalSystem emit `Press E to …`). If a future
 * prompt source omits the hint, we fall back to the INTERACT key, E.
 */
const PROMPT_KEY_RE = /^press\s+([a-z0-9])\b\s*(?:to\s+)?/i;
function parsePromptKey(prompt: string): string {
  const m = prompt.match(PROMPT_KEY_RE);
  return (m ? m[1] : 'E').toUpperCase();
}
function stripPromptKey(prompt: string): string {
  return prompt.replace(PROMPT_KEY_RE, '').trim();
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ characterConfig = DEFAULT_CHARACTER_CONFIG }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  // One-shot gate for the welcome toast — flips false the first time it
  // dismisses (timer or keypress) and never flips back, so a quick pause
  // or modal toggle in the same session won't re-trigger it.
  const [introToastActive, setIntroToastActive] = useState(true);
  // Stable reference for the toast's onClose so its internal timer effects
  // don't cleanup-and-restart on every parent rerender (GameCanvas tickles
  // a 150ms HUD update interval — without this the 8s fade timeline could
  // never complete on its own).
  const handleIntroToastClose = useCallback(() => setIntroToastActive(false), []);

  const [stats, setStats] = useState<PlayerStats>({ ...INITIAL_PLAYER_STATS });
  // The pre-game weapon-loadout / camera-mode "MainPanel" intro screen has
  // been retired. Starting weapons + survival inventory now come straight
  // from the chosen Origin (background) on the Character Creation page, and
  // the player drops directly into the world once assets finish loading.
  // mainMenuOpen stays in the GameState shape (other modals still check it)
  // but is initialised false and never flipped true again.
  const [gameState, setGameState] = useState<GameState>({
    paused: false,
    mainMenuOpen: false,
    skillTreeOpen: false,
    inventoryOpen: false,
    killCount: 0,
    score: 0,
    wave: 1,
    gameStarted: false,
  });
  const [abilities, setAbilities] = useState<AbilityDef[]>(ABILITIES.map(a => ({ ...a })));
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [cameraMode, setCameraMode] = useState('arpg');

  // Origin → starting loadout. Resolved once at mount; if the player
  // changes Origin mid-run (currently impossible, but guards future UX)
  // they keep whatever they're already carrying.
  const startingLoadout = React.useMemo(
    () => getStartingLoadout(characterConfig?.backgroundId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Resolve the two equipped weapons from their string ids, with a hard
  // fallback to a known-good pair so a typo in BACKGROUNDS data can never
  // crash the game out of the gate.
  const resolveWeapon = (id: string): WeaponStats =>
    WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
  // No live setter: GameEngine owns the in-run weapon pair (it reads the
  // same Origin loadout via getStartingLoadout()). This local state exists
  // purely to drive the HUD weapon icons before the engine reports back.
  const [equippedWeapons] = useState<[WeaponStats, WeaponStats]>([
    resolveWeapon(startingLoadout.weapons[0]),
    resolveWeapon(startingLoadout.weapons[1]),
  ]);
  const [bag, setBag] = useState<InventoryItem[]>([]);
  const [equipped, setEquipped] = useState<EquippedSet>({});
  const [bagCap, setBagCap] = useState(24);
  const [totalStats, setTotalStats] = useState<ItemStats>({});
  const [pickups, setPickups] = useState<ItemDef[]>([]);
  // Crosshair state: spread (0–1) polled from player, hitMarker flashes on enemy damage.
  const [crosshairSpread, setCrosshairSpread] = useState(0);
  const [hitMarker, setHitMarker] = useState(false);
  const hitMarkerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playerPos, setPlayerPos] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [playerYaw, setPlayerYaw] = useState(0);
  const [gloom, setGloom] = useState(0);

  // ----- Survival systems (UI state lives here until the engine takes over) -----
  // Seeded from the chosen Origin's starting loadout so each background
  // (Military Veteran, Combat Medic, etc.) actually feels different on turn 1.
  const [survivalStacks, setSurvivalStacks] = useState<Array<{ itemId: string; count: number }>>(
    () => startingLoadout.survival.map(s => ({ ...s })),
  );
  // Mirror of survivalStacks accessible from non-React closures (the engine's
  // ModularBuilding survival adapter, which reads & decrements counts during
  // gameplay). Kept in sync via the useEffect below so getCount() never sees
  // stale state.
  const survivalStacksRef = useRef(survivalStacks);
  useEffect(() => { survivalStacksRef.current = survivalStacks; }, [survivalStacks]);
  const [survivalCap] = useState(32);
  const [survivalInvOpen, setSurvivalInvOpen] = useState(false);
  const [craftingOpen, setCraftingOpen] = useState(false);
  const [buildMenuOpen, setBuildMenuOpen] = useState(false);
  const [mainPanelOpen, setMainPanelOpen] = useState(false);
  const [selectedBuildItem, setSelectedBuildItem] = useState<string | null>(null);
  const [nearbyStations] = useState<CraftingStation[]>(['workbench']); // placeholder until proximity wired

  // ---------- Pixel-art books ----------
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [professionsOpen, setProfessionsOpen] = useState(false);
  const [perksUnlocked, setPerksUnlocked] = useState<Set<string>>(new Set());
  const [perksSpent, setPerksSpent] = useState<Record<StatTrack, number>>({
    hero: 0, warrior: 0, smarts: 0, maker: 0,
  });
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>(() => seedMapMarkers());
  const [interactionPrompt, setInteractionPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!checkWebGL()) {
      setWebglError(true);
      return;
    }
    let engine: GameEngine;
    try {
      engine = new GameEngine(canvasRef.current, characterConfig);
    } catch (err) {
      console.error('Failed to initialize game:', err);
      setWebglError(true);
      return;
    }
    engineRef.current = engine;

    engine.onStatsUpdate = (s) => setStats({ ...s });
    engine.onGameStateUpdate = (gs) => setGameState({ ...gs });
    engine.onAbilityCooldown = (id, remaining) => {
      setCooldowns(prev => ({ ...prev, [id]: remaining }));
    };
    engine.onCameraModeChange = (mode) => setCameraMode(mode);
    engine.onLoadProgress = (fraction) => setLoadProgress(Math.min(fraction, 1));
    engine.onAssetsLoaded = () => {
      setLoadProgress(1);
      setAssetsReady(true);
    };
    engine.onInventoryUpdate = () => {
      const inv = engine.inventory;
      if (!inv) return;
      const snap = inv.snapshot();
      setBag(snap.bag);
      setEquipped(snap.equipped);
      setBagCap(snap.bagCap);
      setTotalStats(inv.getTotalStats());
    };
    engine.onItemPickup = (def) => {
      setPickups((prev) => [...prev.slice(-9), def]);
    };
    engine.onInteractionPrompt = (label) => setInteractionPrompt(label);

    // Flash hit-marker crosshair red whenever a bullet/melee swing lands on an enemy.
    engine.enemyManager && (engine.enemyManager.onEnemyDamaged = () => {
      setHitMarker(true);
      if (hitMarkerTimerRef.current) clearTimeout(hitMarkerTimerRef.current);
      hitMarkerTimerRef.current = setTimeout(() => setHitMarker(false), 80);
    });

    // Wire wall-break resource drops → survival inventory React state.
    engine.onSurvivalLootDrop = (itemId, count) => {
      setSurvivalStacks((prev) => {
        const idx = prev.findIndex((s) => s.itemId === itemId);
        if (idx >= 0) {
          return prev.map((s, i) => i === idx ? { ...s, count: s.count + count } : s);
        }
        return [...prev, { itemId, count }];
      });
    };

    const cdInterval = setInterval(() => {
      if (engine.abilitySystem) {
        const cds: Record<string, number> = {};
        ABILITIES.forEach(a => {
          cds[a.id] = Math.max(0, engine.abilitySystem.getCooldown(a.id));
        });
        setCooldowns(cds);
      }
      if (engine.player) {
        const p = engine.player.position;
        setPlayerPos({ x: p.x, y: p.y, z: p.z });
        setPlayerYaw((engine.player as any).yaw ?? 0);
        setCrosshairSpread(engine.player.spreadValue ?? 0);
      }
      if (engine.fogSystem) {
        setGloom((engine.fogSystem as any).gloom ?? 0);
      }
      // Refresh enemy markers ONLY when the adventure book is open — otherwise
      // every 150ms tick would force a full GameCanvas rerender for nothing.
      if (engine.gameState.inventoryOpen && engine.enemyManager) {
        const liveEnemies: MapMarker[] = engine.enemyManager.enemies
          .filter(e => e.mesh && (e as any).health > 0)
          .map((e, i) => ({
            id: `enemy-${i}`,
            kind: 'enemy' as const,
            x: e.mesh.position.x,
            z: e.mesh.position.z,
            label: (e.mesh.userData?.enemyTypeKey as string)?.replace(/^./, c => c.toUpperCase()) ?? 'Hostile',
            detail: `HP ${Math.round((e as any).health ?? 0)}`,
          }));
        setMapMarkers(prev => {
          const statics = prev.filter(m => m.kind !== 'enemy');
          return [...statics, ...liveEnemies];
        });
      }
    }, 150);

    // ── Modular building bridge ────────────────────────────────────────────
    // Hand the engine a tiny adapter so it can read & decrement the UI's
    // survival stacks (foundation, walls, doors, ...) when the player places
    // a piece. We mutate `survivalStacksRef.current` in-place inside the
    // closure so subsequent getCount() calls in the same frame reflect the
    // consumption, then schedule the React state update for the next render.
    engine.setSurvivalProvider({
      getCount: (id) => survivalStacksRef.current.find(s => s.itemId === id)?.count ?? 0,
      consumeOne: (id) => {
        // Read from the ref (always current). One source of truth: build a
        // brand-new array, point the ref at it synchronously so subsequent
        // getCount() calls in the same frame are correct, AND hand it to
        // setSurvivalStacks for the React re-render. No in-place mutation,
        // so no double-decrement.
        const current = survivalStacksRef.current;
        const idx = current.findIndex(s => s.itemId === id);
        if (idx < 0 || current[idx].count <= 0) return false;
        const next = current.map((s, i) =>
          i === idx ? { ...s, count: s.count - 1 } : s,
        );
        survivalStacksRef.current = next;
        setSurvivalStacks(next);
        return true;
      },
    });

    engine.start();

    return () => {
      clearInterval(cdInterval);
      engine.dispose();
      engineRef.current = null;
    };
  }, [characterConfig]);

  // Push the selected build item to the engine whenever the build menu picks
  // something. Clearing (null) takes the engine out of build mode; re-selecting
  // the same item is a no-op inside ModularBuilding.
  useEffect(() => {
    engineRef.current?.setBuildingBlueprint(selectedBuildItem);
  }, [selectedBuildItem]);

  // Auto-start the run as soon as assets finish loading. Replaces the
  // old MainPanel "Enter the Nexus" button — there is no longer a manual
  // gate between the loading screen and gameplay. The setTimeout(0) keeps
  // the React commit + the engine start on separate ticks (the previous
  // MainPanel flow relied on this ordering to avoid a stale-state race
  // where startGame() ran against an unmounted React tree).
  useEffect(() => {
    if (!assetsReady) return;
    if (gameState.gameStarted) return;
    setGameState(prev => ({ ...prev, gameStarted: true, paused: false }));
    const t = window.setTimeout(() => {
      // Use startGame(), not startGameplay(): the former also flips
      // engine.gameState.gameStarted = true, which is the gate the render
      // loop checks before calling update() each frame. Without it, movement,
      // camera updates, gravity etc. are all silently skipped.
      engineRef.current?.startGame();
    }, 0);
    return () => window.clearTimeout(t);
  }, [assetsReady, gameState.gameStarted]);

  const handleResume = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.gameState.paused = false;
    setGameState(prev => ({ ...prev, paused: false }));
    canvasRef.current?.requestPointerLock();
  }, []);

  const handleRestart = useCallback(() => {
    window.location.reload();
  }, []);

  const handleOpenSkillTree = useCallback(() => {
    if (!engineRef.current) return;
    if (document.pointerLockElement) document.exitPointerLock();
    engineRef.current.gameState.skillTreeOpen = true;
    engineRef.current.gameState.paused = true;
    setGameState(prev => ({ ...prev, skillTreeOpen: true, paused: true }));
  }, []);

  const handleOpenInventoryBook = useCallback(() => {
    if (!engineRef.current) return;
    if (document.pointerLockElement) document.exitPointerLock();
    engineRef.current.gameState.inventoryOpen = true;
    engineRef.current.gameState.paused = true;
    setGameState(prev => ({ ...prev, inventoryOpen: true, paused: true }));
  }, []);

  const handleOpenBestiary = useCallback(() => {
    if (!engineRef.current) return;
    if (document.pointerLockElement) document.exitPointerLock();
    engineRef.current.gameState.paused = true;
    setBestiaryOpen(true);
    setGameState(prev => ({ ...prev, paused: true }));
  }, []);

  const handleCloseBestiary = useCallback(() => {
    if (!engineRef.current) return;
    setBestiaryOpen(false);
    // Only unpause if no other modal is open
    const noOther = !gameState.inventoryOpen && !gameState.skillTreeOpen && !gameState.mainMenuOpen
                    && !survivalInvOpen && !craftingOpen && !buildMenuOpen;
    if (noOther) {
      engineRef.current.gameState.paused = false;
      setGameState(prev => ({ ...prev, paused: false }));
      canvasRef.current?.requestPointerLock();
    }
  }, [gameState.inventoryOpen, gameState.skillTreeOpen, gameState.mainMenuOpen,
      survivalInvOpen, craftingOpen, buildMenuOpen]);

  const handleUnlockPerk = useCallback((perkId: string, track: StatTrack): boolean => {
    let success = false;
    setStats(prev => {
      if (prev.skillPoints <= 0) return prev;
      // Find the perk
      const perk: Perk | undefined = (ALL_PERKS[track] ?? []).find(p => p.id === perkId);
      if (!perk) return prev;
      if (perksUnlocked.has(perkId)) return prev;
      // Check requirements
      const ok = perk.requires.every(r => (perksSpent[r.track] ?? 0) >= r.points);
      if (!ok) return prev;
      success = true;
      // Apply passive: bump matching player stats inline (best-effort).
      const next = { ...prev, skillPoints: prev.skillPoints - 1 };
      const eff = perk.passive;
      if (typeof eff.maxHp === 'number')      next.maxHealth += eff.maxHp;
      if (typeof eff.maxMana === 'number')    next.maxMana   += eff.maxMana;
      if (typeof eff.maxStamina === 'number') next.maxStamina += eff.maxStamina;
      if (engineRef.current?.playerStats) Object.assign(engineRef.current.playerStats, next);
      return next;
    });
    if (success) {
      setPerksUnlocked(prev => { const n = new Set(prev); n.add(perkId); return n; });
      setPerksSpent(prev => ({ ...prev, [track]: (prev[track] ?? 0) + 1 }));
    }
    return success;
  }, [perksUnlocked, perksSpent]);

  const handleSkillUpgrade = useCallback((nodeId: string) => {
    const node = SKILL_TREE.find(n => n.id === nodeId);
    if (!node || !engineRef.current) return;
    const player = engineRef.current.player;
    if (!player) return;
    const playerStats = player.stats;

    if (node.stat === 'strength') playerStats.strength += node.bonusPerLevel;
    if (node.stat === 'agility') {
      playerStats.agility += node.bonusPerLevel;
      player.moveSpeed += node.bonusPerLevel * 0.05;
    }
    if (node.stat === 'intellect') {
      playerStats.intellect += node.bonusPerLevel;
      playerStats.maxMana += node.bonusPerLevel;
    }
    if (node.stat === 'endurance') {
      playerStats.endurance += node.bonusPerLevel;
      playerStats.maxHealth += node.bonusPerLevel;
    }
    if (node.stat === 'ability' && node.abilityId) {
      engineRef.current.abilitySystem.unlockAbility(node.abilityId);
      setAbilities(prev => prev.map(a =>
        a.id === node.abilityId ? { ...a, unlocked: true } : a
      ));
    }

    playerStats.skillPoints--;
    setStats({ ...playerStats });
  }, []);

  const handleEquip = useCallback((uid: string) => {
    engineRef.current?.inventory?.equipFromBag(uid);
  }, []);
  const handleUnequip = useCallback((slot: EquipSlot) => {
    engineRef.current?.inventory?.unequip(slot);
  }, []);
  const handleDrop = useCallback((uid: string) => {
    engineRef.current?.inventory?.dropFromBag(uid);
  }, []);
  const handleCloseInventory = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.gameState.inventoryOpen = false;
    setGameState(prev => ({ ...prev, inventoryOpen: false }));
    // Only unpause if no other modal is open
    const noOther = !bestiaryOpen && !gameState.skillTreeOpen && !gameState.mainMenuOpen
                    && !survivalInvOpen && !craftingOpen && !buildMenuOpen;
    if (noOther) {
      engineRef.current.gameState.paused = false;
      setGameState(prev => ({ ...prev, paused: false }));
      canvasRef.current?.requestPointerLock();
    }
  }, [bestiaryOpen, gameState.skillTreeOpen, gameState.mainMenuOpen,
      survivalInvOpen, craftingOpen, buildMenuOpen]);

  // ---------- Survival panel handlers ----------
  /** Apply a recipe: deduct inputs, add outputs. Re-validates station +
   *  inputs on the engine side so the UI gating can't be circumvented by
   *  stale state. */
  const handleCraft = useCallback((recipeId: string) => {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return;
    if (recipe.station !== 'none' && !nearbyStations.includes(recipe.station)) return;
    setSurvivalStacks((prev) => {
      // Verify inputs again (UI may be stale).
      for (const inp of recipe.inputs) {
        const have = prev.find((s) => s.itemId === inp.itemId)?.count ?? 0;
        if (inp.qty === 0 ? have <= 0 : have < inp.qty) return prev;
      }
      // Deduct
      let next = prev
        .map((s) => {
          const need = recipe.inputs.find((i) => i.itemId === s.itemId);
          if (!need || need.qty === 0) return s;
          return { ...s, count: s.count - need.qty };
        })
        .filter((s) => s.count > 0);
      // Add outputs
      for (const out of recipe.outputs) {
        const idx = next.findIndex((s) => s.itemId === out.itemId);
        if (idx >= 0) next[idx] = { ...next[idx], count: next[idx].count + out.qty };
        else next = [...next, { itemId: out.itemId, count: out.qty }];
      }
      return next;
    });

    // SWG-style profession XP from crafting. Buildings → Township,
    // cooking/medicinal → Chemistry, weapons & gear → Crafting.
    const id = recipeId;
    if (id.startsWith('build_')) {
      ProfessionsService.gainXp('township', 12);
    } else if (
      id.startsWith('cook_') ||
      id === 'fillet_fish' ||
      id === 'open_can' ||
      id === 'boil_water' ||
      id === 'craft_bandage'
    ) {
      ProfessionsService.gainXp('chemistry', 10);
    } else {
      ProfessionsService.gainXp('crafting', 10);
    }
  }, [nearbyStations]);

  /** Consume an item: apply its consume effects to player stats and decrement
   *  the stack.  No-op for non-consumables.
   *
   *  Mutates `engine.playerStats` directly (the engine is the source of truth
   *  for vitals and pushes them via onStatsUpdate). Without this, the engine's
   *  next regen tick would overwrite our React-only changes. */
  const handleSurvivalUse = useCallback((itemId: string) => {
    const def = SURVIVAL_ITEMS[itemId];
    // `consume` may be present-but-empty for items that need preparation
    // (e.g. sealed cans) — treat those as non-usable.
    if (!def?.consume) return;
    const eff = def.consume;
    const hasEffect =
      eff.health !== undefined || eff.hunger !== undefined ||
      eff.thirst !== undefined || eff.stamina !== undefined ||
      eff.temperature !== undefined || eff.bleed !== undefined ||
      eff.infection !== undefined;
    if (!hasEffect) return;

    const ps = engineRef.current?.playerStats;
    if (ps) {
      ps.health      = Math.max(0, Math.min(ps.maxHealth,  ps.health  + (eff.health  ?? 0)));
      ps.hunger      = Math.max(0, Math.min(ps.maxHunger,  ps.hunger  + (eff.hunger  ?? 0)));
      ps.thirst      = Math.max(0, Math.min(ps.maxThirst,  ps.thirst  + (eff.thirst  ?? 0)));
      ps.stamina     = Math.max(0, Math.min(ps.maxStamina, ps.stamina + (eff.stamina ?? 0)));
      ps.temperature = ps.temperature + (eff.temperature ?? 0) * 0.1;
      if (eff.bleed === -1)     ps.bleeding = false;
      if (eff.infection === -1) ps.infected = false;
      else if (eff.infection === 1) ps.infected = true;
      setStats({ ...ps });
    }
    setSurvivalStacks((prev) =>
      prev
        .map((s) => (s.itemId === itemId ? { ...s, count: s.count - 1 } : s))
        .filter((s) => s.count > 0),
    );
  }, []);

  /** Toggle a survival panel and keep pointer-lock + pause coherent.
   *  - Only one survival modal open at a time.
   *  - When ANY survival panel is open we must release pointer lock so the
   *    user can actually click items, and pause the engine so player input
   *    isn't fighting the UI. Closing reverses both.
   *  - Any other modal (skill tree, equipment, pause menu, main menu) takes
   *    precedence — survival hotkeys are no-ops while those are open to
   *    avoid stacked modals. */
  const toggleSurvivalPanel = useCallback(
    (panel: 'inv' | 'craft' | 'build') => {
      if (!engineRef.current) return;
      if (gameState.mainMenuOpen || gameState.skillTreeOpen ||
          gameState.inventoryOpen || gameState.paused) return;

      const isOpening =
        (panel === 'inv'   && !survivalInvOpen) ||
        (panel === 'craft' && !craftingOpen) ||
        (panel === 'build' && !buildMenuOpen);

      // Always close the others — only one survival modal at a time.
      setSurvivalInvOpen(panel === 'inv'   ? !survivalInvOpen   : false);
      setCraftingOpen  (panel === 'craft' ? !craftingOpen     : false);
      setBuildMenuOpen (panel === 'build' ? !buildMenuOpen    : false);

      if (isOpening) {
        // Drop pointer lock so the cursor is visible and clickable.
        if (document.pointerLockElement) document.exitPointerLock();
        engineRef.current.gameState.paused = true;
        setGameState((p) => ({ ...p, paused: true }));
      } else {
        // Closing: only re-acquire lock + unpause if no other modal opened.
        engineRef.current.gameState.paused = false;
        setGameState((p) => ({ ...p, paused: false }));
        canvasRef.current?.requestPointerLock();
      }
    },
    [
      gameState.mainMenuOpen, gameState.skillTreeOpen,
      gameState.inventoryOpen, gameState.paused,
      survivalInvOpen, craftingOpen, buildMenuOpen,
    ],
  );

  /** Close any open survival panel and return to gameplay. */
  const closeAllSurvivalPanels = useCallback(() => {
    if (!engineRef.current) return;
    if (!survivalInvOpen && !craftingOpen && !buildMenuOpen) return;
    setSurvivalInvOpen(false);
    setCraftingOpen(false);
    setBuildMenuOpen(false);
    engineRef.current.gameState.paused = false;
    setGameState((p) => ({ ...p, paused: false }));
    canvasRef.current?.requestPointerLock();
  }, [survivalInvOpen, craftingOpen, buildMenuOpen]);

  // Tab = survival inv, C = craft, B = build, K = bestiary, P = perks.
  // I (inventory) is handled by GameEngine which toggles gameState.inventoryOpen.
  // Listens at window level so the user doesn't have to click the canvas first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gameState.gameStarted || gameState.mainMenuOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const key = e.key.toLowerCase();

      // Book hotkeys — close any other open modal first, then toggle target.
      if (key === 'k') {
        if (bestiaryOpen) {
          handleCloseBestiary();
        } else {
          if (gameState.skillTreeOpen) handleCloseSkillTree();
          if (gameState.inventoryOpen) handleCloseInventory();
          handleOpenBestiary();
        }
        return;
      }
      if (key === 'p') {
        if (gameState.skillTreeOpen) {
          handleCloseSkillTree();
        } else {
          if (bestiaryOpen) handleCloseBestiary();
          if (gameState.inventoryOpen) handleCloseInventory();
          if (professionsOpen) setProfessionsOpen(false);
          handleOpenSkillTree();
        }
        return;
      }
      // Professions book — hotkey O.
      if (key === 'o') {
        if (professionsOpen) {
          setProfessionsOpen(false);
          if (engineRef.current) {
            engineRef.current.gameState.paused = false;
            setGameState(prev => ({ ...prev, paused: false }));
            canvasRef.current?.requestPointerLock();
          }
        } else {
          if (bestiaryOpen) handleCloseBestiary();
          if (gameState.inventoryOpen) handleCloseInventory();
          if (gameState.skillTreeOpen) handleCloseSkillTree();
          setProfessionsOpen(true);
          if (engineRef.current) {
            engineRef.current.gameState.paused = true;
            setGameState(prev => ({ ...prev, paused: true }));
            document.exitPointerLock();
          }
        }
        return;
      }

      // MainPanel — hotkey C. Pauses the engine + releases pointer lock,
      // mirrors the other book hotkeys. Folds in the old standalone
      // Crafting panel as one of its tabs.
      if (key === 'c') {
        if (mainPanelOpen) {
          setMainPanelOpen(false);
          if (engineRef.current) {
            engineRef.current.gameState.paused = false;
            setGameState(prev => ({ ...prev, paused: false }));
            canvasRef.current?.requestPointerLock();
          }
        } else {
          if (bestiaryOpen) handleCloseBestiary();
          if (gameState.inventoryOpen) handleCloseInventory();
          if (gameState.skillTreeOpen) handleCloseSkillTree();
          if (professionsOpen) setProfessionsOpen(false);
          closeAllSurvivalPanels();
          setMainPanelOpen(true);
          if (engineRef.current) {
            engineRef.current.gameState.paused = true;
            setGameState(prev => ({ ...prev, paused: true }));
            document.exitPointerLock();
          }
        }
        return;
      }

      // Suppress survival hotkeys when any other modal owns input.
      if (gameState.skillTreeOpen || gameState.inventoryOpen || bestiaryOpen || professionsOpen || mainPanelOpen) return;

      if (e.code === 'Tab') {
        e.preventDefault();
        toggleSurvivalPanel('inv');
      } else if (key === 'b') {
        toggleSurvivalPanel('build');
      } else if (e.code === 'Escape') {
        closeAllSurvivalPanels();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    gameState.gameStarted, gameState.mainMenuOpen,
    gameState.skillTreeOpen, gameState.inventoryOpen,
    bestiaryOpen, professionsOpen, mainPanelOpen,
    handleOpenBestiary, handleCloseBestiary,
    handleOpenSkillTree, handleCloseInventory,
    toggleSurvivalPanel, closeAllSurvivalPanels,
  ]);

  const handleCloseSkillTree = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.gameState.skillTreeOpen = false;
    setGameState(prev => ({ ...prev, skillTreeOpen: false }));
    // Only unpause if no other modal is open
    const noOther = !bestiaryOpen && !gameState.inventoryOpen && !gameState.mainMenuOpen
                    && !survivalInvOpen && !craftingOpen && !buildMenuOpen;
    if (noOther) {
      engineRef.current.gameState.paused = false;
      setGameState(prev => ({ ...prev, paused: false }));
      canvasRef.current?.requestPointerLock();
    }
  }, [bestiaryOpen, gameState.inventoryOpen, gameState.mainMenuOpen,
      survivalInvOpen, craftingOpen, buildMenuOpen]);

  const handleCanvasClick = () => {
    if (gameState.gameStarted && !gameState.paused) {
      canvasRef.current?.requestPointerLock();
    }
  };

  const isBlocking = engineRef.current?.player?.isBlocking ?? false;

  if (webglError) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#050c14', color: '#fff',
        fontFamily: 'monospace', textAlign: 'center', gap: '16px',
      }}>
        <div style={{ fontSize: '48px' }}>⚔️</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff6b35' }}>DUNGEON BLADE</div>
        <div style={{ fontSize: '14px', color: '#aaa', maxWidth: '400px', lineHeight: 1.6 }}>
          WebGL is required to run this 3D game. Please open this in a modern browser with hardware acceleration enabled.
        </div>
      </div>
    );
  }

  const loadPct = Math.round(loadProgress * 100);

  return (
    // Smart container: fills the actual visible viewport on every
    // device. `dvw`/`dvh` (dynamic viewport) collapses correctly when
    // mobile browser UI shows/hides, with `vw`/`vh` as the fallback
    // for browsers that don't yet support dvh. The 3D canvas inside
    // is letterboxed above the HUD strip whose height is the
    // clamp()-driven `--hud-strip-px` CSS var defined in index.css.
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#000',
      }}
      // Two-step inline override so browsers that *do* support dvw/dvh
      // pick those up while older ones keep the vw/vh values above.
      ref={(el) => {
        if (!el) return;
        el.style.width = '100dvw';
        el.style.height = '100dvh';
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: 'calc(100dvh - var(--hud-strip-px, 200px))',
        }}
        onClick={handleCanvasClick}
      />

      {!assetsReady && (
        // The loading artwork already has the GRUDGES wordmark, the
        // "LOADING…" subtitle, and the gear baked into it, so we don't
        // overlay them again — only the progress bar + percentage. The
        // gradient is just a soft bottom vignette so the bar reads
        // cleanly against the artwork without washing out the painting.
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          paddingBottom: '8vh',
          backgroundImage: 'linear-gradient(180deg, rgba(5,8,12,0) 60%, rgba(5,8,12,0.85) 100%), url(/grudges-loading-2.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: 100, gap: '14px', pointerEvents: 'none',
        }}>
          <div style={{ width: 'min(420px, 60vw)', height: '4px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(196,154,86,0.3)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${loadPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #8e6d2a, #c8a14a, #ecd9aa)',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#c79a56', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.3em', textShadow: '0 1px 0 #000' }}>
            {loadPct}%
          </div>
        </div>
      )}

      {/* MainPanel intro (weapon-loadout + camera-mode picker) was retired —
          starting weapons now come from the chosen Origin and camera mode
          stays at its default ('arpg'); the player can swap with F1/F2/F3
          in-game just like before. */}

      {gameState.gameStarted && !gameState.mainMenuOpen && (
        <HudOverlay
          stats={stats}
          abilities={abilities}
          cooldowns={cooldowns}
          equippedWeapons={equippedWeapons}
          characterName={characterConfig?.name ?? 'Survivor'}
          characterEmoji="🧍"
          onOpenBestiary={handleOpenBestiary}
          onOpenAdventure={handleOpenInventoryBook}
          onOpenMagic={handleOpenSkillTree}
        />
      )}

{/* Dynamic crosshair — collapses to a dot when ADS, expands with
          spread/movement, flashes red on hit. */}
{
  gameState.gameStarted && !gameState.mainMenuOpen && (() => {
    const isAiming = engineRef.current?.player?.isAiming ?? false;
    const gap = isAiming ? 0 : 4 + crosshairSpread * 14;
    const color = hitMarker ? '#ff3333' : 'rgba(255,255,255,0.9)';
    const thickness = 2;
    const armLen = isAiming ? 0 : 8;
    return (
      <div style= {{
      position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
              zIndex: 150,
          }
  }>
    <svg width={ 60 } height = { 60} viewBox = "-30 -30 60 60" style = {{ overflow: 'visible' }
}>
  {/* Center dot — always visible */ }
  < circle cx = { 0} cy = { 0} r = { isAiming? 1.5: 1 } fill = { color } />
    {/* Four arms */ }
{
  armLen > 0 && <>
    <line x1={ 0 } y1 = {- (gap + armLen)
} x2 = { 0} y2 = {- gap}
stroke = { color } strokeWidth = { thickness } strokeLinecap = "round" />
  <line x1={ 0 } y1 = { gap } x2 = { 0} y2 = { gap + armLen}
stroke = { color } strokeWidth = { thickness } strokeLinecap = "round" />
  <line x1={ -(gap + armLen) } y1 = { 0} x2 = {- gap} y2 = { 0}
stroke = { color } strokeWidth = { thickness } strokeLinecap = "round" />
  <line x1={ gap } y1 = { 0} x2 = { gap + armLen} y2 = { 0}
stroke = { color } strokeWidth = { thickness } strokeLinecap = "round" />
  </>}
</svg>
  </div>
        );
      }) ()}

      {/* Admin / Debug button — top right. Opens the lil-gui panel that
          exposes camera tunings (3rd-person + ARPG offset/lookat/snap),
          renderer exposure, fog density, and dev actions. Same toggle as
          the backtick (`) hotkey, but discoverable for the user. */}
      {gameState.gameStarted && !gameState.mainMenuOpen && (
        <button
          type="button"
          onClick={() => engineRef.current?.toggleDebug()}
          title="Admin / Debug panel (also: ` key)"
          style={{
            position: 'fixed',
            top: 12,
            right: 14,
            zIndex: 200,
            padding: '6px 12px',
            background: 'rgba(20, 14, 8, 0.85)',
            color: '#f5e2c1',
            border: '1px solid #6b5535',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 1.5,
            fontWeight: 700,
            cursor: 'pointer',
            textTransform: 'uppercase',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          ⚙ Admin
        </button>
      )}

      {bestiaryOpen && <BestiaryBook onClose={handleCloseBestiary} />}

      {professionsOpen && (
        <ProfessionsBook
          onClose={() => {
            setProfessionsOpen(false);
            if (engineRef.current) {
              engineRef.current.gameState.paused = false;
              setGameState(prev => ({ ...prev, paused: false }));
              canvasRef.current?.requestPointerLock();
            }
          }}
        />
      )}

      {gameState.skillTreeOpen && (
        <PerksBook
          onClose={handleCloseSkillTree}
          spentByTrack={perksSpent}
          unlocked={perksUnlocked}
          availablePoints={stats.skillPoints}
          onUnlock={handleUnlockPerk}
          playerStats={{
            level:    stats.level,
            maxHp:    stats.maxHealth,
            maxMana:  stats.maxMana,
            strength: stats.strength,
            agility:  stats.agility,
            intellect: stats.intellect,
          }}
        />
      )}

      {gameState.gameStarted && !gameState.mainMenuOpen && (
        <PickupToast pickups={pickups} />
      )}

      {/* Door / NPC interaction prompt — fed by engine.onInteractionPrompt.
          Shown centered, ~35% from the bottom, only during active gameplay. */}
      {gameState.gameStarted && !gameState.mainMenuOpen && interactionPrompt && (
        <div
          style={{
            position: 'fixed',
            bottom: '35%',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            background: 'rgba(18,9,4,0.85)',
            border: '1px solid #c9950a',
            borderRadius: 8,
            backdropFilter: 'blur(6px)',
            boxShadow:
              '0 0 18px rgba(0,0,0,0.7), inset 0 0 12px rgba(0,0,0,0.5), 0 0 6px rgba(201,149,10,0.3)',
            color: '#fbe9b8',
            fontFamily: '"Cinzel", serif',
            fontSize: 13,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            zIndex: 200,
            userSelect: 'none',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 26,
              height: 26,
              padding: '0 8px',
              borderRadius: 4,
              background: '#1a0d05',
              border: '1px solid #c9950a',
              color: '#fff176',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 13,
              fontWeight: 700,
              boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.6)',
            }}
          >
            {parsePromptKey(interactionPrompt)}
          </span>
          <span>{stripPromptKey(interactionPrompt)}</span>
        </div>
      )}

      {/* Survival inventory — Tab to toggle. */}
      {survivalInvOpen && (
        <SurvivalInventory
          stacks={survivalStacks}
          capacity={survivalCap}
          onUse={handleSurvivalUse}
          onClose={closeAllSurvivalPanels}
        />
      )}

      {/* Crafting standalone retired — folded into MainPanel's Crafting tab.
          The craftingOpen state remains in case other systems still reference
          it, but no UI is mounted here. */}

      {/* MainPanel — C to toggle. Unified hub: Professions / Stats /
          Equipment / Quests / Skills+Perks / Crafting / Friends / Medical. */}
      {mainPanelOpen && (
        <MainPanel
          stats={stats}
          bag={bag}
          bagCap={bagCap}
          equipped={equipped}
          totalStats={totalStats}
          abilities={abilities}
          cooldowns={cooldowns}
          survivalStacks={survivalStacks}
          nearbyStations={nearbyStations}
          perksUnlocked={perksUnlocked}
          perksSpent={perksSpent}
          onEquip={handleEquip}
          onUnequip={handleUnequip}
          onDrop={handleDrop}
          onCraft={handleCraft}
          onUnlockPerk={(perkId, track) => { handleUnlockPerk(perkId, track); }}
          onClose={() => {
            setMainPanelOpen(false);
            if (engineRef.current) {
              engineRef.current.gameState.paused = false;
              setGameState(prev => ({ ...prev, paused: false }));
              canvasRef.current?.requestPointerLock();
            }
          }}
        />
      )}

      {/* Build menu — B to toggle. Stays mounted over gameplay (HUD-style). */}
      {buildMenuOpen && (
        <BuildMenu
          stacks={survivalStacks}
          selectedItemId={selectedBuildItem}
          onSelect={setSelectedBuildItem}
          onClose={closeAllSurvivalPanels}
        />
      )}

      {/* Always-mounted help overlay — listens for H key itself. */}
      <HotkeyHelp />

      {/* Welcome / objective overlay — appears once per session, after
          assets finish loading and gameplay begins. Self-fades out and
          dismisses on any key. */}
      {introToastActive && assetsReady && gameState.gameStarted && (
        <SpawnIntroToast onClose={handleIntroToastClose} />
      )}

      {gameState.inventoryOpen && (
        <InventoryBook
          bag={bag}
          bagCap={bagCap}
          equipped={equipped}
          totalStats={totalStats}
          player={{ x: playerPos.x, z: playerPos.z, yaw: playerYaw }}
          mapMarkers={mapMarkers}
          getDef={(item) => (item ? ITEM_DATABASE[item.defId] ?? null : null)}
          onEquip={handleEquip}
          onUnequip={handleUnequip}
          onDrop={handleDrop}
          onClose={handleCloseInventory}
          portraitCanvas={engineRef.current?.portraitRenderer.canvas ?? null}
          setPortraitActive={(active) => engineRef.current?.portraitRenderer.setActive(active)}
        />
      )}

      {gameState.paused && !gameState.skillTreeOpen && !gameState.inventoryOpen
        && !gameState.mainMenuOpen && !bestiaryOpen && !mainPanelOpen
        && !professionsOpen && !survivalInvOpen && !craftingOpen && !buildMenuOpen && (
        <PauseMenu
          gameState={gameState}
          stats={stats}
          onResume={handleResume}
          onRestart={handleRestart}
          onOpenSkillTree={handleOpenSkillTree}
        />
      )}
      <CoopMenu playerName={characterConfig?.name || 'Wanderer'} />
    </div>
  );
};

/** Seed the world map with a handful of known landmarks for the Adventure book.
 *  Live enemy markers are merged in dynamically by the GameEngine subscription. */
function seedMapMarkers(): MapMarker[] {
  return [
    { id: 'town-1',  kind: 'town',     x:   0, z:  -40, label: 'Hollow Refuge',  detail: 'Survivor settlement · safe' },
    { id: 'town-2',  kind: 'town',     x:  90, z:   60, label: 'Iron Hills',     detail: 'Trader hub · 4 vendors' },
    { id: 'trader1', kind: 'trader',   x: -30, z:   25, label: 'Wandering Merch.', detail: 'Stocks ammo & medkits' },
    { id: 'trader2', kind: 'trader',   x:  60, z:  -55, label: 'The Tinkerer',   detail: 'Buys & repairs gear' },
    { id: 'res-1',   kind: 'resource', x: -50, z:  -10, label: 'Iron Vein',      detail: 'Mineable · 24 ore' },
    { id: 'res-2',   kind: 'resource', x:  35, z:   18, label: 'Wild Berries',   detail: 'Forageable food' },
    { id: 'res-3',   kind: 'resource', x: -75, z:   45, label: 'Spring Water',   detail: 'Fresh water source' },
    { id: 'res-4',   kind: 'resource', x:  10, z:   90, label: 'Lumber Stand',   detail: 'Choppable trees' },
    { id: 'dun-1',   kind: 'dungeon',  x: 110, z:  110, label: 'Sunken Vault',   detail: 'Tier 3 · sealed' },
    { id: 'dun-2',   kind: 'dungeon',  x: -120, z:  80, label: 'Old Mine',       detail: 'Tier 1 · entrance open' },
    { id: 'dun-3',   kind: 'dungeon',  x:  20, z: -130, label: 'Ironclad Bunker', detail: 'Tier 4 · keycard required' },
  ];
}

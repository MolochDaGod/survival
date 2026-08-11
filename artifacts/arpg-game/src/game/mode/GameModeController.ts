/**
 * GameModeController — single authority for player interaction modes.
 *
 * Modes gate input, camera focus (RMB), LMB semantics, and AI/AFK scripts.
 * Survival era only — does not touch Warlords island systems.
 *
 *   combat  — LMB attack, RMB ADS/block, dodge, abilities
 *   harvest — LMB swing tools at nodes, RMB focus zoom on target
 *   build   — LMB place blueprint, RMB cancel/rotate context
 *   cinema  — input frozen, camera on rails, optional record
 *   afk     — synthetic combat/harvest/camp scripts
 *   ui      — panels open, pointer unlocked
 *   free    — default hybrid (combat + harvest same swing)
 */

export type GameModeId =
  | 'free'
  | 'combat'
  | 'harvest'
  | 'build'
  | 'cinema'
  | 'afk'
  | 'ui';

export interface ModeCapabilities {
  /** Player movement + look. */
  playerInput: boolean;
  /** LMB primary action (attack / place / harvest). */
  primaryAction: boolean;
  /** RMB focus (ADS / block / cancel). */
  focusRmb: boolean;
  /** Dodge / roll. */
  dodge: boolean;
  /** Abilities 1–5. */
  abilities: boolean;
  /** Modular build placement. */
  buildPlace: boolean;
  /** Harvest resource chips on melee. */
  harvest: boolean;
  /** Combat damage on melee / guns. */
  combat: boolean;
  /** Cinema director owns camera. */
  cinemaCamera: boolean;
  /** AFK script ticks. */
  afkScript: boolean;
}

const CAPS: Record<GameModeId, ModeCapabilities> = {
  free: {
    playerInput: true,
    primaryAction: true,
    focusRmb: true,
    dodge: true,
    abilities: true,
    buildPlace: false,
    harvest: true,
    combat: true,
    cinemaCamera: false,
    afkScript: false,
  },
  combat: {
    playerInput: true,
    primaryAction: true,
    focusRmb: true,
    dodge: true,
    abilities: true,
    buildPlace: false,
    harvest: false,
    combat: true,
    cinemaCamera: false,
    afkScript: false,
  },
  harvest: {
    playerInput: true,
    primaryAction: true,
    focusRmb: true,
    dodge: true,
    abilities: false,
    buildPlace: false,
    harvest: true,
    combat: true, // still defend yourself
    cinemaCamera: false,
    afkScript: false,
  },
  build: {
    playerInput: true,
    primaryAction: false, // build click captured separately
    focusRmb: false,
    dodge: false,
    abilities: false,
    buildPlace: true,
    harvest: false,
    combat: false,
    cinemaCamera: false,
    afkScript: false,
  },
  cinema: {
    playerInput: false,
    primaryAction: false,
    focusRmb: false,
    dodge: false,
    abilities: false,
    buildPlace: false,
    harvest: false,
    combat: false,
    cinemaCamera: true,
    afkScript: false,
  },
  afk: {
    playerInput: false,
    primaryAction: false,
    focusRmb: false,
    dodge: false,
    abilities: false,
    buildPlace: false,
    harvest: true,
    combat: true,
    cinemaCamera: false,
    afkScript: true,
  },
  ui: {
    playerInput: false,
    primaryAction: false,
    focusRmb: false,
    dodge: false,
    abilities: false,
    buildPlace: false,
    harvest: false,
    combat: false,
    cinemaCamera: false,
    afkScript: false,
  },
};

export type FocusRmbBehavior = 'ads' | 'block' | 'cancel_build' | 'none';

export class GameModeController {
  private mode: GameModeId = 'free';
  private previous: GameModeId = 'free';
  private stack: GameModeId[] = [];

  /** HUD / React subscribe. */
  onModeChange: ((mode: GameModeId, caps: ModeCapabilities) => void) | null = null;

  getMode(): GameModeId {
    return this.mode;
  }

  getCaps(): ModeCapabilities {
    return CAPS[this.mode];
  }

  /** Push a temporary mode (e.g. ui) and restore later. */
  push(mode: GameModeId): void {
    this.stack.push(this.mode);
    this.set(mode);
  }

  pop(): void {
    const prev = this.stack.pop() ?? this.previous ?? 'free';
    this.set(prev);
  }

  set(mode: GameModeId): void {
    if (mode === this.mode) return;
    this.previous = this.mode;
    this.mode = mode;
    this.onModeChange?.(mode, this.getCaps());
    console.info(`[GameMode] → ${mode}`);
  }

  /** Cycle play modes: free → combat → harvest → build → free. */
  cyclePlayMode(): GameModeId {
    const order: GameModeId[] = ['free', 'combat', 'harvest', 'build'];
    const i = order.indexOf(this.mode);
    const next = order[(i < 0 ? 0 : i + 1) % order.length];
    this.set(next);
    return next;
  }

  /**
   * RMB semantics by mode + weapon family.
   *  combat+melee → block, combat+ranged → ads, harvest → ads (focus node),
   *  build → cancel_build, else none.
   */
  resolveFocusRmb(weaponIsRanged: boolean): FocusRmbBehavior {
    switch (this.mode) {
      case 'build':
        return 'cancel_build';
      case 'cinema':
      case 'ui':
      case 'afk':
        return 'none';
      case 'combat':
        return weaponIsRanged ? 'ads' : 'block';
      case 'harvest':
        return 'ads';
      case 'free':
      default:
        return weaponIsRanged ? 'ads' : 'ads'; // free: ADS focus; block stays on B
    }
  }

  isPlayable(): boolean {
    return this.mode !== 'cinema' && this.mode !== 'ui';
  }
}

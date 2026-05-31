/**
 * QuestSystem — lightweight step-based quest state machine.
 *
 * Each quest is a linear sequence of QuestSteps. The system tracks the
 * active step, checks completion conditions each frame, and advances
 * to the next step when conditions are met. Steps can be:
 *   - 'talk'    — walk to an NPC and press interact
 *   - 'goto'    — reach a world position
 *   - 'kill'    — kill N enemies (total, not specific)
 *   - 'return'  — return to an NPC (same as 'talk' but semantically different)
 *   - 'collect' — pick up N items
 *
 * The system emits events for the HUD to display objectives and prompts.
 */

import * as THREE from 'three';

// ── Step types ──────────────────────────────────────────────────────────────

export type QuestStepType = 'talk' | 'goto' | 'kill' | 'return' | 'collect';

export interface QuestStep {
  type: QuestStepType;
  /** Display text shown in the HUD objective tracker. */
  objective: string;
  /** NPC id to interact with (for 'talk' and 'return' steps). */
  npcId?: string;
  /** World position to reach (for 'goto' steps). */
  targetPos?: { x: number; z: number };
  /** Reach radius in metres. Default 4. */
  radius?: number;
  /** Number of kills required (for 'kill' steps). */
  killCount?: number;
  /** Item id and count (for 'collect' steps). */
  collectItem?: { id: string; count: number };
  /** Optional dialog line shown when this step activates. */
  dialog?: string;
  /** Optional callback fired when this step completes. */
  onComplete?: () => void;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  steps: QuestStep[];
  /** XP reward on full completion. */
  xpReward: number;
  /** Optional callback when the entire quest completes. */
  onFinish?: () => void;
}

// ── Quest state ─────────────────────────────────────────────────────────────

export type QuestStatus = 'inactive' | 'active' | 'complete';

export interface QuestState {
  questId: string;
  status: QuestStatus;
  currentStep: number;
  /** Running kill counter for the active 'kill' step. */
  killProgress: number;
  /** Running collect counter for the active 'collect' step. */
  collectProgress: number;
}

// ── System ──────────────────────────────────────────────────────────────────

export class QuestSystem {
  private quests = new Map<string, QuestDef>();
  private states = new Map<string, QuestState>();

  /** UI subscribes to this for objective text updates. */
  onObjectiveChange: ((text: string | null) => void) | null = null;
  /** UI subscribes to this for dialog popups. */
  onDialog: ((speaker: string, text: string) => void) | null = null;
  /** Called when a quest completes — passes XP reward. */
  onQuestComplete: ((questId: string, xpReward: number) => void) | null = null;

  // ── Registration ─────────────────────────────────────────────────────────

  register(def: QuestDef): void {
    this.quests.set(def.id, def);
    this.states.set(def.id, {
      questId: def.id,
      status: 'inactive',
      currentStep: 0,
      killProgress: 0,
      collectProgress: 0,
    });
  }

  activate(questId: string): void {
    const state = this.states.get(questId);
    const def = this.quests.get(questId);
    if (!state || !def || state.status !== 'inactive') return;

    state.status = 'active';
    state.currentStep = 0;
    state.killProgress = 0;
    state.collectProgress = 0;

    const step = def.steps[0];
    if (step?.dialog) {
      this.onDialog?.(step.npcId ?? 'System', step.dialog);
    }
    this.emitObjective(def, state);
  }

  // ── Per-frame checks ────────────────────────────────────────────────────

  /**
   * Check proximity-based step completion. Call every frame.
   */
  update(playerPos: THREE.Vector3, nearbyNpcId: string | null): void {
    for (const [id, state] of this.states) {
      if (state.status !== 'active') continue;
      const def = this.quests.get(id);
      if (!def) continue;

      const step = def.steps[state.currentStep];
      if (!step) { this.completeQuest(id); continue; }

      switch (step.type) {
        case 'talk':
        case 'return':
          if (nearbyNpcId === step.npcId) {
            this.advanceStep(id);
          }
          break;

        case 'goto': {
          if (!step.targetPos) break;
          const dx = playerPos.x - step.targetPos.x;
          const dz = playerPos.z - step.targetPos.z;
          const r = step.radius ?? 4;
          if (dx * dx + dz * dz < r * r) {
            this.advanceStep(id);
          }
          break;
        }

        case 'kill':
          if (state.killProgress >= (step.killCount ?? 1)) {
            this.advanceStep(id);
          }
          break;

        case 'collect':
          if (state.collectProgress >= (step.collectItem?.count ?? 1)) {
            this.advanceStep(id);
          }
          break;
      }
    }
  }

  // ── External event hooks ─────────────────────────────────────────────────

  /** Call when an enemy is killed. Increments kill counters on active quests. */
  onEnemyKilled(): void {
    for (const state of this.states.values()) {
      if (state.status !== 'active') continue;
      const def = this.quests.get(state.questId);
      if (!def) continue;
      const step = def.steps[state.currentStep];
      if (step?.type === 'kill') {
        state.killProgress++;
        this.emitObjective(def, state);
      }
    }
  }

  /** Call when an item is picked up. */
  onItemCollected(itemId: string): void {
    for (const state of this.states.values()) {
      if (state.status !== 'active') continue;
      const def = this.quests.get(state.questId);
      if (!def) continue;
      const step = def.steps[state.currentStep];
      if (step?.type === 'collect' && step.collectItem?.id === itemId) {
        state.collectProgress++;
        this.emitObjective(def, state);
      }
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  getState(questId: string): QuestState | undefined {
    return this.states.get(questId);
  }

  getActiveObjective(): string | null {
    for (const state of this.states.values()) {
      if (state.status !== 'active') continue;
      const def = this.quests.get(state.questId);
      if (!def) continue;
      const step = def.steps[state.currentStep];
      if (!step) continue;

      if (step.type === 'kill') {
        return `${step.objective} (${state.killProgress}/${step.killCount ?? 1})`;
      }
      return step.objective;
    }
    return null;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private advanceStep(questId: string): void {
    const state = this.states.get(questId);
    const def = this.quests.get(questId);
    if (!state || !def) return;

    const prevStep = def.steps[state.currentStep];
    prevStep?.onComplete?.();

    state.currentStep++;
    state.killProgress = 0;
    state.collectProgress = 0;

    if (state.currentStep >= def.steps.length) {
      this.completeQuest(questId);
      return;
    }

    const nextStep = def.steps[state.currentStep];
    if (nextStep?.dialog) {
      this.onDialog?.(nextStep.npcId ?? 'System', nextStep.dialog);
    }
    this.emitObjective(def, state);
  }

  private completeQuest(questId: string): void {
    const state = this.states.get(questId);
    const def = this.quests.get(questId);
    if (!state || !def) return;

    state.status = 'complete';
    def.onFinish?.();
    this.onQuestComplete?.(questId, def.xpReward);
    this.onObjectiveChange?.(null);
  }

  private emitObjective(def: QuestDef, state: QuestState): void {
    const step = def.steps[state.currentStep];
    if (!step) { this.onObjectiveChange?.(null); return; }

    let text = step.objective;
    if (step.type === 'kill') {
      text += ` (${state.killProgress}/${step.killCount ?? 1})`;
    }
    this.onObjectiveChange?.(text);
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let _instance: QuestSystem | null = null;
export function getQuestSystem(): QuestSystem {
  if (!_instance) _instance = new QuestSystem();
  return _instance;
}

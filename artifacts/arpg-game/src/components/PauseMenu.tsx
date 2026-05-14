/**
 * PauseMenu — minimal pause / death overlay.
 *
 * The hub UI (MainPanel, bound to C) and book overlays (Skill Tree, Bestiary,
 * etc.) own their own chrome and pause the game on their own. This component
 * is *only* shown when the game is paused with NO other modal open — i.e. a
 * raw Esc-pause or a death state. Keep it boring on purpose: a faint
 * vignette, a single line of text, and a single keybind hint.
 *
 * Theme matches the rest of the dark-gothic UI (Cinzel + #d4a400 on #1a120c).
 */
import React from 'react';
import { GameState, PlayerStats } from '../game/types';

interface PauseMenuProps {
  gameState: GameState;
  stats: PlayerStats;
  onResume: () => void;
  onRestart: () => void;
  // kept for backwards compat with GameCanvas; no longer rendered.
  onOpenSkillTree: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({ stats, onResume, onRestart }) => {
  const isDead = stats.health <= 0;

  // Suppress accidental keystrokes from leaking into the engine while paused.
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();

  if (isDead) {
    return (
      <div
        onKeyDown={stop}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'radial-gradient(ellipse at center, rgba(80,0,0,0.55) 0%, rgba(0,0,0,0.92) 70%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Cinzel", serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 48, letterSpacing: 8, color: '#a01818', fontWeight: 700,
            textShadow: '0 0 24px rgba(160,24,24,0.5)',
          }}>
            FALLEN
          </div>
          <div style={{ fontSize: 12, color: '#7a6048', letterSpacing: 3, marginTop: 8 }}>
            YOU WERE DEFEATED
          </div>
          <button
            onClick={onRestart}
            style={{
              marginTop: 28, padding: '10px 28px',
              background: 'transparent',
              border: '1px solid #c9950a',
              color: '#d4a400',
              fontFamily: '"Cinzel", serif',
              fontSize: 12, letterSpacing: 4, cursor: 'pointer',
            }}
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onResume}
      onKeyDown={stop}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        fontFamily: '"Cinzel", serif',
      }}
    >
      <div style={{
        fontSize: 14, color: '#d4a400', letterSpacing: 6,
      }}>
        PAUSED · CLICK OR ESC TO RESUME
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';

/**
 * SpawnIntroToast — small unobtrusive HUD overlay that fades in shortly
 * after the player drops into the world, lists the core hotkeys, then
 * fades out after ~8 seconds. Dismissable on any key.
 *
 * Lifecycle is owned entirely by this component:
 *  - Mounts when GameCanvas decides assets are loaded and the game has
 *    started (gameStarted && assetsLoaded).
 *  - Self-unmounts after the fade-out completes; the parent uses a
 *    `useState(true)` "shownThisSession" gate so it never reappears.
 *
 * No pointer events are captured — this never blocks gameplay clicks.
 */
export const SpawnIntroToast: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // Three phases: 'in' (fading in), 'shown' (full opacity), 'out' (fading out).
  // We delay the initial mount opacity by one tick so the CSS transition fires.
  const [phase, setPhase] = useState<'in' | 'shown' | 'out'>('in');

  useEffect(() => {
    // Kick the in→shown transition on the next frame so the browser
    // observes the opacity change and animates it.
    const tIn = window.setTimeout(() => setPhase('shown'), 50);
    // Hold for ~8s, then begin fade-out.
    const tOut = window.setTimeout(() => setPhase('out'), 8000);
    // After the fade-out transition (600ms), tell the parent to unmount us.
    const tDone = window.setTimeout(() => onClose(), 8650);
    return () => {
      window.clearTimeout(tIn);
      window.clearTimeout(tOut);
      window.clearTimeout(tDone);
    };
  }, [onClose]);

  // Dismiss on any key — start the fade-out immediately and let the parent
  // unmount us after the transition. We listen on `keydown` only; pointer
  // events stay free for combat.
  useEffect(() => {
    const onKey = () => {
      setPhase('out');
      window.setTimeout(() => onClose(), 650);
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const opacity = phase === 'shown' ? 1 : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 96,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none', // never block gameplay clicks
        zIndex: 1500,
        opacity,
        transition: 'opacity 600ms ease-in-out',
        maxWidth: 'min(560px, 92vw)',
      }}
    >
      <div
        style={{
          background: 'rgba(20, 16, 28, 0.86)',
          border: '1px solid rgba(232, 199, 104, 0.28)',
          borderRadius: 12,
          padding: '18px 24px',
          color: '#e8e2d8',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(6px)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#b89c5e',
            marginBottom: 6,
          }}
        >
          You've arrived
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e8c768', marginBottom: 10 }}>
          The encampment. Survive the night.
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '4px 14px',
            fontSize: 12,
            color: '#aaa19a',
          }}
        >
          <span><kbd style={kbd}>WASD</kbd> Move</span>
          <span><kbd style={kbd}>Mouse</kbd> Aim</span>
          <span><kbd style={kbd}>LMB</kbd> Attack</span>
          <span><kbd style={kbd}>Tab</kbd> Inventory</span>
          <span><kbd style={kbd}>ESC</kbd> Pause</span>
        </div>
      </div>
    </div>
  );
};

const kbd: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  marginRight: 4,
  borderRadius: 4,
  background: 'rgba(232, 199, 104, 0.12)',
  border: '1px solid rgba(232, 199, 104, 0.3)',
  color: '#e8c768',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 11,
};

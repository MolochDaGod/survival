import { useEffect, useState } from 'react';
import {
  type Identity,
  initIdentity,
  signInWithPuter,
  signInAsGuest,
  signOut,
  clearAllLocalData,
} from '@/game/identity';

interface LoginScreenProps {
  /** Called once a player has chosen an identity (cached or fresh). */
  onSignedIn: (identity: Identity) => void;
}

type Phase = 'loading' | 'choose' | 'signing-in';

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [cached, setCached] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On mount: see if we already have an identity. Don't auto-advance — the
  // player should explicitly confirm "Continue" so they can switch accounts.
  useEffect(() => {
    let cancelled = false;
    void initIdentity()
      .then((id) => {
        if (cancelled) return;
        setCached(id);
        setPhase('choose');
      })
      .catch(() => {
        if (cancelled) return;
        setPhase('choose');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePuter = async () => {
    setPhase('signing-in');
    setError(null);
    try {
      const id = await signInWithPuter();
      onSignedIn(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      setError(msg);
      setPhase('choose');
    }
  };

  const handleGuest = () => {
    setError(null);
    const id = signInAsGuest();
    onSignedIn(id);
  };

  const handleContinue = () => {
    if (cached) onSignedIn(cached);
  };

  const handleSwitch = async () => {
    setPhase('signing-in');
    setError(null);
    await signOut();
    setCached(null);
    setPhase('choose');
  };

  // "Clear local data" — for clean-slate testing and pre-deploy QA. Wipes
  // every grudge_nexus_* localStorage key on this browser, then reloads so
  // the identity singleton and save service rebuild from a fresh state.
  // Intentionally requires a window.confirm() since it's destructive.
  const handleClearLocal = () => {
    if (!window.confirm(
      'Clear all local Grudges data on this browser?\n\n' +
      'This removes your cached identity, active character, and any local ' +
      'save snapshots. Cloud saves are NOT touched.',
    )) return;
    clearAllLocalData();
    window.location.reload();
  };

  return (
    <div className="login-root">
      <style>{LOGIN_CSS}</style>

      <div className="login-card">
        <div className="login-brand">
          <img
            src="/grudges-logo.png"
            alt="Grudges"
            className="login-brand-logo"
            style={{ width: 96, height: 96, objectFit: 'contain', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.85))' }}
          />
          <h1 className="login-title">Grudges</h1>
          <p className="login-tagline">Bind a grudge. Bear it forward.</p>
        </div>

        {phase === 'loading' && (
          <div className="login-status">Awakening…</div>
        )}

        {phase === 'choose' && cached && (
          <div className="login-cached">
            <div className="login-cached-label">Resume as</div>
            <div className="login-cached-name">
              {cached.displayName}
              <span className={`login-kind login-kind-${cached.kind}`}>
                {cached.kind === 'puter' ? 'Cloud' : 'Guest'}
              </span>
            </div>
            <div className="login-cached-id">{cached.grudgeId}</div>

            <div className="login-actions">
              <button
                type="button"
                className="login-btn login-btn-primary"
                onClick={handleContinue}
                autoFocus
              >
                Continue
              </button>
              <button
                type="button"
                className="login-btn login-btn-ghost"
                onClick={handleSwitch}
              >
                Switch account
              </button>
            </div>
          </div>
        )}

        {phase === 'choose' && !cached && (
          <div className="login-actions login-actions-fresh">
            <button
              type="button"
              className="login-btn login-btn-primary"
              onClick={handlePuter}
            >
              Sign In
            </button>
            <div className="login-divider"><span>or</span></div>
            <button
              type="button"
              className="login-btn login-btn-secondary"
              onClick={handleGuest}
            >
              Continue as Guest
            </button>
            <p className="login-hint">
              Signing in syncs your save across browsers. Guest play
              keeps everything in this browser only.
            </p>
          </div>
        )}

        {phase === 'signing-in' && (
          <div className="login-status">Signing in…</div>
        )}

        {error && <div className="login-error">{error}</div>}

        {phase === 'choose' && (
          <button
            type="button"
            className="login-clear-local"
            onClick={handleClearLocal}
          >
            Clear local data
          </button>
        )}
      </div>

      <div className="login-credits">
        Grudge Studio
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
// Inline CSS keeps the login screen self-contained — no global Tailwind /
// shadcn deps that the rest of the game brings in.

const LOGIN_CSS = `
.login-root {
  position: fixed; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background:
    linear-gradient(180deg, rgba(10,8,6,0.55) 0%, rgba(10,8,6,0.35) 40%, rgba(10,8,6,0.85) 100%),
    url('/grudges-landing.png') center / cover no-repeat,
    #0a0907;
  color: #e7d8b9;
  font-family: 'Crimson Text', Georgia, serif;
  overflow: hidden;
}
.login-root::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 3px);
  pointer-events: none;
}
.login-card {
  position: relative;
  width: min(440px, calc(100vw - 32px));
  padding: 28px 32px 28px;
  background: linear-gradient(180deg, rgba(18, 14, 12, 0.78) 0%, rgba(10, 8, 6, 0.86) 100%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(196, 154, 86, 0.4);
  border-radius: 4px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.6),
    0 24px 60px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 220, 160, 0.06);
}
.login-brand {
  text-align: center;
  margin-bottom: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(196, 154, 86, 0.18);
}
.login-brand-mark {
  font-size: 36px; line-height: 1;
  color: #c79a56;
  margin-bottom: 10px;
  text-shadow: 0 0 18px rgba(199, 154, 86, 0.45);
}
.login-title {
  margin: 0 0 6px;
  font-family: 'Cinzel', Georgia, serif;
  font-weight: 900;
  font-size: 30px;
  letter-spacing: 0.08em;
  color: #ecd9aa;
  text-transform: uppercase;
  text-shadow: 0 1px 0 #000, 0 0 24px rgba(199, 154, 86, 0.25);
}
.login-tagline {
  margin: 0;
  font-style: italic;
  font-size: 14px;
  color: #9c8b6b;
  letter-spacing: 0.02em;
}
.login-status {
  text-align: center;
  font-style: italic;
  color: #9c8b6b;
  padding: 24px 0;
}
.login-cached {
  display: flex; flex-direction: column; align-items: stretch; gap: 4px;
}
.login-cached-label {
  text-align: center;
  font-family: 'Cinzel', Georgia, serif;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #7d6f54;
  text-transform: uppercase;
}
.login-cached-name {
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  color: #ecd9aa;
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.login-kind {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
  border: 1px solid currentColor;
}
.login-kind-puter { color: #88b3d8; }
.login-kind-guest { color: #b89870; }
.login-cached-id {
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #5a4f3c;
  margin-top: 2px;
  margin-bottom: 18px;
  word-break: break-all;
}
.login-actions {
  display: flex; flex-direction: column; gap: 10px;
}
.login-actions-fresh { gap: 14px; }
.login-btn {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 12px 18px;
  border-radius: 2px;
  cursor: pointer;
  transition: transform 80ms ease, background 120ms ease, border-color 120ms ease;
  border: 1px solid transparent;
}
.login-btn:active { transform: translateY(1px); }
.login-btn:focus-visible {
  outline: 2px solid #c79a56;
  outline-offset: 2px;
}
.login-btn-primary {
  background: linear-gradient(180deg, #b6863d 0%, #7a5621 100%);
  color: #1a1410;
  border-color: #d8aa5e;
  box-shadow: 0 1px 0 rgba(255, 220, 160, 0.25) inset, 0 6px 14px rgba(0, 0, 0, 0.4);
}
.login-btn-primary:hover {
  background: linear-gradient(180deg, #c79550 0%, #8b6328 100%);
}
.login-btn-secondary {
  background: rgba(40, 32, 26, 0.6);
  color: #e7d8b9;
  border-color: rgba(196, 154, 86, 0.45);
}
.login-btn-secondary:hover {
  background: rgba(60, 48, 38, 0.7);
  border-color: rgba(196, 154, 86, 0.7);
}
.login-btn-ghost {
  background: transparent;
  color: #9c8b6b;
  border-color: rgba(196, 154, 86, 0.18);
  font-size: 11px;
  padding: 8px 14px;
}
.login-btn-ghost:hover {
  color: #c79a56;
  border-color: rgba(196, 154, 86, 0.4);
}
.login-divider {
  display: flex; align-items: center; gap: 12px;
  font-family: 'Cinzel', Georgia, serif;
  font-size: 10px;
  letter-spacing: 0.3em;
  color: #5a4f3c;
  text-transform: uppercase;
}
.login-divider::before, .login-divider::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(196, 154, 86, 0.25), transparent);
}
.login-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #7d6f54;
  text-align: center;
  line-height: 1.55;
}
.login-error {
  margin-top: 14px;
  padding: 8px 12px;
  background: rgba(120, 30, 30, 0.18);
  border: 1px solid rgba(180, 60, 60, 0.4);
  color: #e7a6a6;
  font-size: 12px;
  border-radius: 2px;
  text-align: center;
}
.login-credits {
  position: absolute; bottom: 16px;
  font-size: 11px;
  color: #5a4f3c;
}
.login-credits a {
  color: #88b3d8;
  text-decoration: none;
  border-bottom: 1px dotted #88b3d8;
}
.login-credits a:hover { color: #b3d4ee; }
.login-clear-local {
  display: block;
  margin: 18px auto 0;
  padding: 4px 8px;
  background: transparent;
  border: none;
  font-family: 'Cinzel', Georgia, serif;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #5a4f3c;
  cursor: pointer;
  transition: color 120ms ease;
}
.login-clear-local:hover {
  color: #b89870;
  text-decoration: underline;
}
`;

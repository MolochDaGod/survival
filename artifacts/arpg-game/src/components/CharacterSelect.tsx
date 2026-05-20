/**
 * CharacterSelect — chooses which character to play after login.
 *
 * Sits between LoginScreen and GameCanvas. Uses the API server to upsert the
 * account row, list characters owned by that account, and create new ones.
 *
 * Migration: if the player has a pre-MMO save in localStorage but no characters
 * server-side, we auto-create a "Default" character row, copy the legacy save
 * keys onto the new character, and drop the player straight into the game.
 */
import { useEffect, useState, useCallback } from "react";
import type { Identity } from "@/game/identity";
import { clearAllLocalData } from "@/game/identity";
import type { CharacterConfig } from "@/game/CharacterConfig";
import { getActiveCharacterId, setActiveCharacterId } from "@/game/activeCharacter";
import { resetSaveGameService } from "@/game/SaveGameService";

const LEGACY_SAVE_KEY = "grudge_nexus_save";
const LEGACY_CHAR_KEY = "grudge_nexus_character";

interface AccountRow {
  id: string;
  grudgeId: string;
  displayName: string | null;
  createdAt: string;
}

interface CharacterRow {
  id: string;
  accountId: string;
  name: string;
  config: unknown;
  saveData: unknown;
  createdAt: string;
  lastPlayedAt: string | null;
}

export interface CharacterSelectProps {
  identity: Identity;
  /** Called when a character is selected (existing or just-migrated legacy). */
  onPlayCharacter: (
    accountId: string,
    characterId: string,
    config: CharacterConfig | null,
  ) => void;
  /** Called when the player wants to build a new character. */
  onCreateNew: (accountId: string) => void;
}

export function CharacterSelect({
  identity,
  onPlayCharacter,
  onCreateNew,
}: CharacterSelectProps) {
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [characters, setCharacters] = useState<CharacterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Boot — upsert the account row, list characters, optionally migrate legacy save.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. Upsert account.
        const upsertRes = await fetch("/api/accounts/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grudgeId: identity.grudgeId,
            displayName: identity.displayName,
          }),
        });
        if (!upsertRes.ok) throw new Error(`account upsert ${upsertRes.status}`);
        const acct = (await upsertRes.json()) as AccountRow;
        if (cancelled) return;
        setAccount(acct);

        // 2. List characters for this account.
        const listRes = await fetch(
          `/api/characters?accountId=${encodeURIComponent(acct.id)}`,
        );
        if (!listRes.ok) throw new Error(`character list ${listRes.status}`);
        const rows = (await listRes.json()) as CharacterRow[];
        if (cancelled) return;

        // 3. Legacy migration: no characters on server but a local save exists.
        const legacySave = localStorage.getItem(LEGACY_SAVE_KEY);
        const legacyCharRaw = localStorage.getItem(LEGACY_CHAR_KEY);
        if (rows.length === 0 && (legacySave || legacyCharRaw)) {
          let legacyConfig: CharacterConfig | null = null;
          try {
            legacyConfig = legacyCharRaw
              ? (JSON.parse(legacyCharRaw) as CharacterConfig)
              : null;
          } catch {
            legacyConfig = null;
          }
          const createRes = await fetch("/api/characters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountId: acct.id,
              name: legacyConfig?.name ?? "Default",
              config: legacyConfig ?? {},
            }),
          });
          if (createRes.ok) {
            const created = (await createRes.json()) as CharacterRow;
            // Move the legacy unscoped save under the new character's id.
            if (legacySave) {
              localStorage.setItem(`${LEGACY_SAVE_KEY}__${created.id}`, legacySave);
              localStorage.removeItem(LEGACY_SAVE_KEY);
            }
            if (legacyCharRaw) {
              localStorage.setItem(`${LEGACY_CHAR_KEY}__${created.id}`, legacyCharRaw);
              localStorage.removeItem(LEGACY_CHAR_KEY);
            }
            if (cancelled) return;
            setCharacters([created]);
            return;
          }
          // Migration failed — fall through to empty list and let the user create one.
        }

        // Local-data hygiene: if the locally cached "active character" id
        // points at a row the server no longer has (e.g. after a demo-data
        // wipe, or signing in as a different account), clear the pointer
        // and reset the save-game service. Without this the next bootstrap
        // tries to auto-resume a phantom character and either 404s or
        // silently shows a blank screen.
        const activeId = getActiveCharacterId();
        if (activeId && !rows.some((r) => r.id === activeId)) {
          setActiveCharacterId(null);
          resetSaveGameService();
        }

        setCharacters(rows);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[CharacterSelect] API failed, enabling offline mode:', msg);
        setError(msg);
        // Offline fallback: create a synthetic account so the player can
        // still reach character creation and play locally. The character
        // won't be persisted server-side until the API is fixed, but the
        // game is fully playable with localStorage saves.
        if (!account) {
          setAccount({
            id: `offline_${identity.grudgeId}`,
            grudgeId: identity.grudgeId,
            displayName: identity.displayName ?? 'Survivor',
            createdAt: new Date().toISOString(),
          });
        }
        setCharacters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity.grudgeId, identity.displayName]);

  const playCharacter = useCallback(
    (row: CharacterRow) => {
      if (!account) return;
      setBusy(true);
      setActiveCharacterId(row.id);
      resetSaveGameService();
      const cfg = (row.config && typeof row.config === "object"
        ? (row.config as CharacterConfig)
        : null);
      onPlayCharacter(account.id, row.id, cfg);
    },
    [account, onPlayCharacter],
  );

  const createNew = useCallback(() => {
    if (!account) return;
    onCreateNew(account.id);
  }, [account, onCreateNew]);

  // Dev-only hard reset. Wipes every localStorage key under our two
  // namespaces (`grudge_nexus_*` for identity/character/save, `grudge:*`
  // for the prefab cache), clears sessionStorage, and reloads so all
  // module-level singletons (identity cache, save service, active-char
  // cache) rebuild from scratch. Cloud saves on the server are NOT
  // touched — use the admin "reset demo data" endpoint for that.
  const handleHardReset = useCallback(() => {
    const ok = window.confirm(
      'DEV RESET — wipe all local Grudges data on this browser?\n\n' +
        '• Cached identity, active character pointer, save snapshots\n' +
        '• Prefab cache and session HUD state\n\n' +
        'Cloud saves on the server are NOT removed. The page will reload.',
    );
    if (!ok) return;
    clearAllLocalData();
    window.location.reload();
  }, []);

  return (
    <div className="select-root">
      <style>{SELECT_CSS}</style>
      <div className="select-card">
        <div className="select-header">
          <div className="select-eyebrow">{identity.displayName}</div>
          <h1 className="select-title">Choose your survivor</h1>
          <p className="select-tagline">
            Each character carries an independent grudge — separate stats, gear, and progress.
          </p>
        </div>

        {error && (
          <div className="select-error">
            Server offline — playing locally. Your progress saves to this browser.
          </div>
        )}

        {!account || !characters ? (
          <div className="select-loading">Loading characters…</div>
        ) : characters.length === 0 ? (
          <div className="select-empty">
            <p>No characters yet. Forge your first.</p>
            <button
              type="button"
              className="select-btn select-btn-primary"
              onClick={createNew}
              disabled={busy}
            >
              Create character
            </button>
          </div>
        ) : (
          <>
            <ul className="select-list">
              {characters.map((c) => {
                const cfg = (c.config ?? {}) as Partial<CharacterConfig> & {
                  bodyProportion?: string;
                  gender?: string;
                };
                const last = c.lastPlayedAt
                  ? new Date(c.lastPlayedAt).toLocaleDateString()
                  : "never";
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="select-row"
                      onClick={() => playCharacter(c)}
                      disabled={busy}
                    >
                      <div className="select-row-name">{c.name}</div>
                      <div className="select-row-meta">
                        {(cfg.gender ?? "—")} · {(cfg.bodyProportion ?? "athletic")} · last played {last}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="select-actions">
              <button
                type="button"
                className="select-btn select-btn-ghost"
                onClick={createNew}
                disabled={busy}
              >
                + New character
              </button>
            </div>
          </>
        )}

        {/* Dev reset — visible on every state of this screen. */}
        <button
          type="button"
          className="select-dev-reset"
          onClick={handleHardReset}
          title="Wipe all local data and reload"
        >
          Reset all local data (dev)
        </button>
      </div>
    </div>
  );
}

const SELECT_CSS = `
.select-root {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background:
    linear-gradient(180deg, rgba(7,6,12,0.55) 0%, rgba(7,6,12,0.35) 40%, rgba(7,6,12,0.9) 100%),
    url('/grudges-bg-city.png') center / cover no-repeat,
    radial-gradient(circle at 50% 30%, #1a1320 0%, #07060c 70%);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #e8e2d8;
  padding: 24px;
}
.select-card {
  width: 100%; max-width: 560px;
  background: rgba(20, 16, 28, 0.78);
  border: 1px solid rgba(232, 199, 104, 0.25);
  border-radius: 14px;
  padding: 32px;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.select-eyebrow {
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
  color: #b89c5e; margin-bottom: 8px;
}
.select-title { font-size: 26px; margin: 0 0 6px; color: #e8c768; }
.select-tagline { margin: 0 0 24px; color: #aaa19a; font-size: 14px; }
.select-loading, .select-empty, .select-error {
  padding: 18px 0; text-align: center; color: #aaa19a;
}
.select-error { color: #d57676; }
.select-list { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-direction: column; gap: 10px; }
.select-row {
  width: 100%; text-align: left;
  background: rgba(40, 32, 50, 0.6);
  border: 1px solid rgba(232, 199, 104, 0.14);
  border-radius: 10px;
  padding: 14px 18px;
  color: #e8e2d8;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.select-row:hover:not(:disabled) {
  background: rgba(60, 48, 75, 0.75);
  border-color: rgba(232, 199, 104, 0.4);
}
.select-row:active:not(:disabled) { transform: scale(0.99); }
.select-row:disabled { opacity: 0.6; cursor: progress; }
.select-row-name { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
.select-row-meta { font-size: 12px; color: #aaa19a; }
.select-actions { display: flex; justify-content: flex-end; }
.select-btn {
  padding: 10px 18px; border-radius: 8px; font-size: 14px;
  cursor: pointer; border: 1px solid transparent; font-weight: 600;
  transition: background 0.15s, border-color 0.15s;
}
.select-btn:disabled { opacity: 0.6; cursor: progress; }
.select-btn-primary {
  background: linear-gradient(180deg, #c8a14a, #8e6d2a);
  color: #1a1320;
}
.select-btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
.select-btn-ghost {
  background: transparent;
  border-color: rgba(232, 199, 104, 0.35);
  color: #e8c768;
}
.select-btn-ghost:hover:not(:disabled) {
  background: rgba(232, 199, 104, 0.08);
  border-color: rgba(232, 199, 104, 0.6);
}
.select-dev-reset {
  display: block;
  width: 100%;
  margin-top: 28px;
  padding: 9px 14px;
  background: transparent;
  border: 1px dashed rgba(213, 118, 118, 0.4);
  border-radius: 6px;
  color: rgba(213, 118, 118, 0.85);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  font-family: inherit;
}
.select-dev-reset:hover {
  background: rgba(213, 118, 118, 0.08);
  border-color: rgba(213, 118, 118, 0.7);
  color: rgba(232, 160, 160, 1);
}
`;

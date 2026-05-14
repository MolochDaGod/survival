/**
 * identity — the player's account on the Grudge Nexus client.
 *
 * Two flavors of identity exist:
 *
 *   - 'puter' : signed in via puter.js (https://docs.puter.com/Auth/),
 *               grudge-id is `puter:${puter.uuid}` and persists across
 *               browsers / devices that sign into the same Puter account.
 *   - 'guest' : a random UUID generated locally and stored in
 *               localStorage. Persists per-browser only.
 *
 * The grudge-id is the stable key used by SaveGameService for cloud
 * saves on /api/savegame/:grudgeId, so two browsers signed in to the
 * same Puter account see the same save while two guest browsers do not.
 */

const IDENTITY_KEY = 'grudge_nexus_identity';
const PUTER_LOAD_TIMEOUT_MS = 5000;

export type IdentityKind = 'puter' | 'guest';

export interface Identity {
  /** Stable account ID used everywhere downstream. */
  grudgeId: string;
  kind: IdentityKind;
  /** Display name shown in HUD / pause menus. */
  displayName: string;
  /** Set only when kind === 'puter'. */
  puterUuid?: string;
  /** Set only when kind === 'puter' and the email scope was granted. */
  email?: string;
}

// ─── Internal state ────────────────────────────────────────────────────────

let _current: Identity | null = null;
let _puterReady: Promise<void> | null = null;

function readPersisted(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Identity;
    if (!parsed?.grudgeId || !parsed?.kind || !parsed?.displayName) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(id: Identity | null): void {
  try {
    if (id) localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
    else localStorage.removeItem(IDENTITY_KEY);
  } catch {
    /* quota exceeded — non-fatal */
  }
}

/**
 * Wait for the puter.js script tag to finish parsing.
 *
 * Memoizes the in-flight promise so callers cheaply share one wait,
 * but on rejection the cache is cleared so a later retry (e.g. user
 * clicks "Sign in with Puter" again after a flaky CDN load) gets a
 * fresh attempt instead of inheriting the old failure.
 */
function waitForPuter(): Promise<void> {
  if (_puterReady) return _puterReady;
  const pending = new Promise<void>((resolve, reject) => {
    if (typeof puter !== 'undefined') return resolve();
    let elapsed = 0;
    const tick = 100;
    const handle = window.setInterval(() => {
      if (typeof puter !== 'undefined') {
        window.clearInterval(handle);
        resolve();
        return;
      }
      elapsed += tick;
      if (elapsed >= PUTER_LOAD_TIMEOUT_MS) {
        window.clearInterval(handle);
        reject(new Error(`Puter.js failed to load within ${PUTER_LOAD_TIMEOUT_MS} ms`));
      }
    }, tick);
  }).catch((err) => {
    // Allow the next caller to retry from scratch.
    _puterReady = null;
    throw err;
  });
  _puterReady = pending;
  return pending;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize identity on app start. Reads the cached identity from
 * localStorage and, if it's a Puter identity, verifies the Puter session
 * is still valid (the user may have signed out from another tab).
 *
 * Distinguishes between "Puter SDK not reachable" (transient — keep
 * cached identity, treat as offline) and "Puter SDK says you're not
 * signed in" (authoritative — clear cached identity). This avoids
 * spuriously logging the user out when js.puter.com is slow.
 *
 * Returns the resolved identity, or null if nothing is signed in.
 * Never throws.
 */
export async function initIdentity(): Promise<Identity | null> {
  const cached = readPersisted();
  if (!cached) {
    _current = null;
    return null;
  }

  if (cached.kind === 'guest') {
    _current = cached;
    return cached;
  }

  // Puter identity — try to verify the session is still valid.
  try {
    await waitForPuter();
  } catch {
    // SDK didn't load (CDN flake, offline, ad-blocker). Keep the
    // cached identity so the player can still continue offline.
    _current = cached;
    return cached;
  }

  try {
    if (!puter.auth.isSignedIn()) {
      // Puter authoritatively says we're signed out — clear cached identity.
      persist(null);
      _current = null;
      return null;
    }
    const user = await puter.auth.getUser();
    const refreshed: Identity = {
      grudgeId:    `puter_${user.uuid}`,
      kind:        'puter',
      displayName: user.username,
      puterUuid:   user.uuid,
      email:       user.email,
    };
    persist(refreshed);
    _current = refreshed;
    return refreshed;
  } catch {
    // getUser/isSignedIn threw — treat as transient, keep cached.
    _current = cached;
    return cached;
  }
}

/**
 * Open the Puter sign-in popup and persist the resulting identity.
 * Throws if Puter.js fails to load or the user cancels the popup.
 */
export async function signInWithPuter(): Promise<Identity> {
  await waitForPuter();
  await puter.auth.signIn(['email']);
  const user = await puter.auth.getUser();
  const id: Identity = {
    grudgeId:    `puter_${user.uuid}`,
    kind:        'puter',
    displayName: user.username,
    puterUuid:   user.uuid,
    email:       user.email,
  };
  persist(id);
  _current = id;
  return id;
}

/**
 * Sign in (or restore) the local guest identity. Re-uses the cached
 * guest UUID if one exists so a returning guest keeps their save.
 */
export function signInAsGuest(): Identity {
  const cached = readPersisted();
  if (cached?.kind === 'guest') {
    _current = cached;
    return cached;
  }
  const uuid = crypto.randomUUID();
  const id: Identity = {
    grudgeId:    `guest_${uuid}`,
    kind:        'guest',
    displayName: `Guest-${uuid.slice(0, 6)}`,
  };
  persist(id);
  _current = id;
  return id;
}

/**
 * Sign out of the current identity. For Puter accounts this also tears
 * down the Puter session so a different account can sign in.
 *
 * NOTE: cached saves under the previous grudge-id remain in
 * localStorage and on the cloud — they are simply no longer addressed
 * until the same identity signs in again.
 */
export async function signOut(): Promise<void> {
  const cur = _current ?? readPersisted();
  if (cur?.kind === 'puter') {
    try {
      await waitForPuter();
      puter.auth.signOut();
    } catch {
      /* network / Puter unavailable — local clear is still useful */
    }
  }
  persist(null);
  _current = null;
}

/** Synchronous accessor — returns the in-memory identity or rehydrates from localStorage. */
export function getCurrentIdentity(): Identity | null {
  if (_current) return _current;
  _current = readPersisted();
  return _current;
}

/** Convenience: just the grudge-id, or null if nobody is signed in. */
export function getGrudgeId(): string | null {
  return getCurrentIdentity()?.grudgeId ?? null;
}

/**
 * Wipe every Grudge-Nexus localStorage key on this browser:
 *   - identity, active character pointer, legacy session id
 *   - all per-character save and config keys (`grudge_nexus_save__*`,
 *     `grudge_nexus_character__*`)
 *   - the legacy unscoped `grudge_nexus_save` / `grudge_nexus_character`
 *
 * Used by the LoginScreen "Clear local data" link. After calling, the page
 * should be reloaded so all in-memory caches (identity singleton, save
 * service singleton) are rebuilt from scratch.
 *
 * Note: this does NOT touch server-side data. The admin "reset demo data"
 * endpoint handles the database / cloud-save side.
 */
export function clearAllLocalData(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // `grudge_nexus_*` covers identity / character / save / session.
      // `grudge:*` covers the prefab cache (`grudge:prefab_cache:v1`)
      // and any future namespaced caches we add.
      if (k && (k.startsWith("grudge_nexus_") || k.startsWith("grudge:"))) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* quota / sandbox — best-effort */
  }
  try {
    // Session storage holds transient HUD state (book overlays, etc.).
    sessionStorage.clear();
  } catch {
    /* sandbox — best-effort */
  }
  _current = null;
  _puterReady = null;
}

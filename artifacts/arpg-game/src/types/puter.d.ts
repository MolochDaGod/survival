/**
 * Ambient declarations for the Puter.js v2 global.
 *
 * Puter.js is loaded via <script src="https://js.puter.com/v2/puter.js">
 * in index.html, so it is always present at runtime as a global named
 * `puter`. This file exposes just the surface we use (auth) so callers
 * get type checking without pulling in @types/puter-js.
 *
 * Full reference: https://docs.puter.com/Auth/
 */

interface PuterUser {
  /** Stable per-account UUID — drives our grudge-id. */
  uuid: string;
  /** Public Puter handle. */
  username: string;
  /** Only present when the 'email' scope was granted. */
  email?: string;
}

type PuterAuthScope = 'read' | 'write' | 'email';

interface PuterAuth {
  /** Open the Puter sign-in popup. Resolves to the signed-in user. */
  signIn(scopes?: readonly PuterAuthScope[]): Promise<PuterUser>;
  /** Fetch the currently signed-in user. Throws if not signed in. */
  getUser(): Promise<PuterUser>;
  /** Synchronous boolean — has the browser an active Puter session? */
  isSignedIn(): boolean;
  /** End the current Puter session. */
  signOut(): void;
}

interface PuterGlobal {
  auth: PuterAuth;
}

declare const puter: PuterGlobal;

interface Window {
  /** Same object as the global `puter`, exposed on window for convenience. */
  puter?: PuterGlobal;
}

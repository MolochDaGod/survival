/**
 * R2-backed cloud save storage.
 *
 * Replaces the former GCS/Replit-sidecar save backend with Cloudflare R2,
 * reusing the existing R2 client from r2Storage.ts. Saves land in the
 * primary assets bucket under `grudge-nexus/saves/<sessionId>.json`.
 */

import { R2 } from './r2Storage.js';

const SAVE_PREFIX = 'grudge-nexus/saves';

function savePath(sessionId: string): string {
  return `${SAVE_PREFIX}/${sessionId}.json`;
}

function bucket(): string {
  return R2.buckets.assets();
}

export const R2Saves = {
  /** Write a save JSON blob for a session/grudge-id. */
  async put(sessionId: string, body: string): Promise<{ savedAt: string }> {
    await R2.put(bucket(), savePath(sessionId), body, 'application/json');
    return { savedAt: new Date().toISOString() };
  },

  /** Read a save. Returns the parsed JSON or null if no save exists. */
  async get(sessionId: string): Promise<unknown | null> {
    const result = await R2.getStream(bucket(), savePath(sessionId));
    if (!result) return null;

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  },

  /** Delete a save slot. No-op if it doesn't exist. */
  async delete(sessionId: string): Promise<void> {
    const info = await R2.head(bucket(), savePath(sessionId));
    if (info) {
      await R2.delete(bucket(), savePath(sessionId));
    }
  },
};

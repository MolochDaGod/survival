/**
 * Cloudflare D1 HTTP client.
 *
 * D1 is normally accessed from Cloudflare Workers via bindings. From outside
 * (our Node/Express server), we use the REST API:
 *
 *   POST https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{dbId}/query
 *   POST https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{dbId}/raw
 *
 * Required env:
 *   CF_ACCOUNT_ID                   – the account containing the D1 database
 *   CLOUDFLARE_D1_OBJECTSTORE_ID    – the D1 database UUID
 *   CF_D1_API                       – preferred D1-scoped token (recommended)
 *   CLOUDFLARE_USER_API             – fallback API token (must have D1: Edit)
 *
 * NOTE: A user-scoped token without "Account → D1: Edit" will return 403
 * with code 7403. We expose `available()` so callers can degrade gracefully
 * when the token isn't yet configured correctly.
 */

export interface D1QueryResult<T = Record<string, unknown>> {
  results:     T[];
  meta?:       {
    duration?:        number;
    rows_read?:       number;
    rows_written?:    number;
    last_row_id?:     number;
    changes?:         number;
  };
}

export class D1Error extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'D1Error';
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[d1Client] required env ${name} is unset`);
  return v;
}

function endpoint(suffix: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${requireEnv('CF_ACCOUNT_ID')}/d1/database/${requireEnv('CLOUDFLARE_D1_OBJECTSTORE_ID')}${suffix}`;
}

/** Resolve which token to use for D1, in priority order. */
function pickToken(): { token: string; source: string } {
  const candidates: Array<{ name: string; value: string | undefined }> = [
    { name: 'CF_D1_API',          value: process.env.CF_D1_API },
    { name: 'CLOUDFLARE_USER_API', value: process.env.CLOUDFLARE_USER_API },
  ];
  for (const c of candidates) {
    if (c.value && c.value.length > 0) return { token: c.value, source: c.name };
  }
  throw new Error('[d1Client] no D1 token found (set CF_D1_API or CLOUDFLARE_USER_API)');
}

interface CfApiEnvelope {
  success?: boolean;
  errors?:  Array<{ code?: number; message?: string }>;
  result?:  unknown;
}

async function callD1<T>(suffix: string, body: unknown): Promise<T> {
  const { token } = pickToken();
  const r = await fetch(endpoint(suffix), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as CfApiEnvelope;
  if (!r.ok || j.success === false) {
    const err = j.errors?.[0];
    throw new D1Error(
      err?.message ?? `D1 HTTP ${r.status}`,
      r.status,
      err?.code,
    );
  }
  return j.result as T;
}

export const D1 = {
  /** Quickly check whether the configured token can talk to D1. */
  async available(): Promise<
    | { ok: true; tokenSource: string }
    | { ok: false; status: number; message: string; code?: number; tokenSource?: string }
  > {
    let tokenSource: string | undefined;
    try {
      tokenSource = pickToken().source;
      await callD1<unknown>('/query', { sql: 'SELECT 1' });
      return { ok: true, tokenSource };
    } catch (e) {
      if (e instanceof D1Error) {
        return { ok: false, status: e.status, message: e.message, code: e.code, tokenSource };
      }
      return { ok: false, status: 0, message: (e as Error).message, tokenSource };
    }
  },

  /**
   * Execute a single SQL statement and return the first result set's rows.
   * Use ? placeholders and pass values via `params`.
   */
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<D1QueryResult<T>> {
    const result = await callD1<Array<{ results: T[]; meta?: D1QueryResult['meta'] }>>(
      '/query',
      { sql, params: params ?? [] },
    );
    const first = Array.isArray(result) ? result[0] : (result as any);
    return {
      results: first?.results ?? [],
      meta:    first?.meta,
    };
  },

  /** Convenience: query that returns just the rows array. */
  async rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const r = await D1.query<T>(sql, params);
    return r.results;
  },

  /** Convenience: SELECT that expects a single row (or null). */
  async one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
    const rows = await D1.rows<T>(sql, params);
    return rows[0] ?? null;
  },

  /** INSERT/UPDATE/DELETE — returns metadata (changes, last_row_id). */
  async exec(sql: string, params?: unknown[]): Promise<D1QueryResult['meta']> {
    const r = await D1.query(sql, params);
    return r.meta;
  },

  /**
   * Execute multiple SQL statements as separate calls. D1's REST API accepts
   * multi-statement SQL only via /query (with semicolons), but for clarity we
   * loop. Use for migrations / schema bootstrap.
   */
  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    for (const s of statements) {
      await D1.query(s.sql, s.params);
    }
  },
};

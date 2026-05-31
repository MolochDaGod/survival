/**
 * Grudge Chat Worker — entry point.
 *
 * Routes:
 *   GET /ws?channel=<name>&grudgeId=<id>&name=<displayName>
 *       → WebSocket upgrade, forwarded to the ChatRoom DO keyed by channel
 *
 *   GET /api/channels/<channel>/info
 *       → JSON with connection count + user list
 *
 * Channel naming:
 *   "global"              → server-wide
 *   "party:<id>"          → party chat
 *   "whisper:<idA>:<idB>" → DM (ids must be sorted alphabetically by client)
 */

import { ChatRoom } from './ChatRoom';

export { ChatRoom };

interface Env {
  CHAT_ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim());
  const match = allowed.includes(origin) || allowed.includes('*');
  return {
    'Access-Control-Allow-Origin': match ? origin : allowed[0] ?? '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function getRoom(env: Env, channel: string): DurableObjectStub {
  const id = env.CHAT_ROOM.idFromName(channel);
  return env.CHAT_ROOM.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const channel = url.searchParams.get('channel') ?? 'global';
      const grudgeId = url.searchParams.get('grudgeId');
      const name = url.searchParams.get('name') ?? 'Anonymous';

      if (!grudgeId) {
        return new Response(JSON.stringify({ error: 'grudgeId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // Validate channel name format
      if (!/^(global|party:[a-zA-Z0-9_-]+|whisper:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+)$/.test(channel)) {
        return new Response(JSON.stringify({ error: 'invalid channel format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const room = getRoom(env, channel);
      // Forward the WebSocket upgrade to the Durable Object
      const doUrl = new URL(request.url);
      doUrl.pathname = '/ws';
      return room.fetch(new Request(doUrl.toString(), request));
    }

    // Channel info API
    const infoMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/info$/);
    if (infoMatch) {
      const channel = decodeURIComponent(infoMatch[1]);
      const room = getRoom(env, channel);
      const res = await room.fetch(new Request(`${url.origin}/info`));
      const body = await res.text();
      return new Response(body, {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'grudge-chat' }, { headers: cors });
    }

    return new Response('Grudge Chat — connect via /ws?channel=global&grudgeId=<id>&name=<name>', {
      headers: { 'Content-Type': 'text/plain', ...cors },
    });
  },
};

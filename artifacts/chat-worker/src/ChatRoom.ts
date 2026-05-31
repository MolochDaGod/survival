/**
 * ChatRoom — Cloudflare Durable Object for real-time game chat.
 *
 * One instance per channel. Channel naming:
 *   "global"                     — server-wide chat (everyone)
 *   "party:<partyId>"            — party/group chat (up to ~6 members)
 *   "whisper:<idA>:<idB>"        — DM between two players (ids sorted alphabetically)
 *
 * Each connected WebSocket carries userData with the player's grudgeId and
 * display name. Messages are broadcast to all connections on the same DO
 * instance. The last 100 messages are persisted in DO storage so new
 * joiners get scroll-back history.
 *
 * Wire protocol (JSON over WebSocket):
 *
 *   Client → Server:
 *     { type: "message", text: string }
 *     { type: "ping" }
 *
 *   Server → Client:
 *     { type: "message", sender: string, senderName: string, text: string, ts: number }
 *     { type: "join", sender: string, senderName: string, ts: number }
 *     { type: "leave", sender: string, senderName: string, ts: number }
 *     { type: "history", messages: ChatMsg[] }
 *     { type: "pong" }
 *     { type: "error", message: string }
 */

export interface ChatMsg {
  type: 'message' | 'join' | 'leave';
  sender: string;
  senderName: string;
  text: string;
  ts: number;
}

interface SessionData {
  grudgeId: string;
  name: string;
}

const MAX_HISTORY = 100;
const MAX_TEXT_LENGTH = 500;

export class ChatRoom implements DurableObject {
  private sessions = new Map<WebSocket, SessionData>();
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState, _env: unknown) {
    this.storage = state.storage;
    // Hibernate-aware: restore sessions from accepted WebSockets on wake.
    state.getWebSockets().forEach((ws) => {
      const tag = state.getTags(ws);
      const data = tag.length >= 2
        ? { grudgeId: tag[0], name: tag[1] }
        : { grudgeId: 'unknown', name: 'Unknown' };
      this.sessions.set(ws, data);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      return this.handleWebSocket(request, url);
    }
    if (url.pathname === '/info') {
      return Response.json({
        connections: this.sessions.size,
        users: [...this.sessions.values()].map(s => ({ id: s.grudgeId, name: s.name })),
      });
    }
    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const grudgeId = url.searchParams.get('grudgeId');
    const name = url.searchParams.get('name') || 'Anonymous';
    if (!grudgeId) {
      return new Response('grudgeId required', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const session: SessionData = { grudgeId, name };
    this.sessions.set(server, session);

    server.accept();

    // Send history on connect
    const history = await this.getHistory();
    server.send(JSON.stringify({ type: 'history', messages: history }));

    // Broadcast join
    const joinMsg: ChatMsg = {
      type: 'join',
      sender: grudgeId,
      senderName: name,
      text: '',
      ts: Date.now(),
    };
    this.broadcast(joinMsg, server);

    // Handle incoming messages
    server.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'ping') {
          server.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (data.type === 'message' && typeof data.text === 'string') {
          const text = data.text.slice(0, MAX_TEXT_LENGTH).trim();
          if (!text) return;
          const msg: ChatMsg = {
            type: 'message',
            sender: grudgeId,
            senderName: name,
            text,
            ts: Date.now(),
          };
          this.broadcast(msg);
          this.appendHistory(msg);
        }
      } catch {
        server.send(JSON.stringify({ type: 'error', message: 'invalid payload' }));
      }
    });

    server.addEventListener('close', () => {
      this.sessions.delete(server);
      const leaveMsg: ChatMsg = {
        type: 'leave',
        sender: grudgeId,
        senderName: name,
        text: '',
        ts: Date.now(),
      };
      this.broadcast(leaveMsg);
    });

    server.addEventListener('error', () => {
      this.sessions.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(msg: ChatMsg, exclude?: WebSocket): void {
    const payload = JSON.stringify(msg);
    for (const [ws] of this.sessions) {
      if (ws === exclude) continue;
      try { ws.send(payload); } catch { /* dead socket, will be cleaned on close */ }
    }
  }

  private async getHistory(): Promise<ChatMsg[]> {
    const stored = await this.storage.get<ChatMsg[]>('history');
    return stored ?? [];
  }

  private async appendHistory(msg: ChatMsg): Promise<void> {
    const history = await this.getHistory();
    history.push(msg);
    // Keep only last N messages
    while (history.length > MAX_HISTORY) history.shift();
    await this.storage.put('history', history);
  }
}

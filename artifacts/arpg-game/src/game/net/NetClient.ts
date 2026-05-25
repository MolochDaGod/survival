/**
 * NetClient — thin browser-side WebSocket wrapper for the co-op protocol.
 *
 * Responsibilities:
 *   - Open a single WebSocket to /api/realtime (proxied through the same
 *     origin as the running game so it works in dev preview AND in prod).
 *   - Auto-reconnect with exponential backoff up to ~30 s.
 *   - Surface a tiny event API: onWelcome / onRoom / onPeerJoin /
 *     onPeerLeave / onPeerState / onChat / onError / onStatusChange.
 *   - Throttle outgoing state to ~20 Hz (matches the server token bucket).
 *
 * Anything the engine wants to know is consumed via these events; anything
 * it wants to send goes through the typed `send*` helpers. No network
 * details leak past this module.
 */
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import type {
  NetClientMessage,
  NetServerMessage,
  NetServerRoom,
  NetServerPeerJoin,
  NetServerPeerLeave,
  NetServerState,
  NetServerChat,
  NetServerWelcome,
  NetServerError,
} from './protocol';

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface NetClientHandlers {
  onStatus?(s: NetStatus): void;
  onWelcome?(msg: NetServerWelcome): void;
  onRoom?(msg: NetServerRoom): void;
  onPeerJoin?(msg: NetServerPeerJoin): void;
  onPeerLeave?(msg: NetServerPeerLeave): void;
  onPeerState?(msg: NetServerState): void;
  onChat?(msg: NetServerChat): void;
  onError?(msg: NetServerError): void;
  onLatency?(rttMs: number): void;
}

const STATE_INTERVAL_MS = 50; // 20 Hz
const PING_INTERVAL_MS = 5000;
const RECONNECT_MAX_MS = 30_000;

export class NetClient {
  private ws: WebSocket | null = null;
  private status: NetStatus = 'idle';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastStateSent = 0;
  private intentionalClose = false;
  private currentName = 'Wanderer';
  private currentAccountId?: string;
  private pendingJoinCode: string | null | undefined = undefined;

  /** The server-assigned id for *this* peer (set after `welcome`). */
  peerId: string | null = null;
  /** The current room code, if any (set after `room`). */
  roomCode: string | null = null;

  constructor(private readonly handlers: NetClientHandlers = {}) {}

  /**
   * Resolve the websocket URL. In production the frontend lives on Vercel
   * which cannot proxy WebSocket upgrades, so `VITE_WS_URL` must point
   * directly at the Railway api-server (e.g.
   * `wss://grudge-nexus-api-production.up.railway.app`). In dev the env
   * var is usually unset, and we fall back to same-origin which works
   * because Vite's dev proxy handles the upgrade.
   */
  private resolveUrl(): string {
    const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined;
    if (envUrl) {
      // Strip trailing slash, append the realtime path.
      return `${envUrl.replace(/\/+$/, '')}/api/realtime`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/realtime`;
  }

  private setStatus(s: NetStatus) {
    if (this.status === s) return;
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  /** Open the socket if it isn't already. Idempotent. */
  connect(name: string, accountId?: string): void {
    this.currentName = name;
    this.currentAccountId = accountId;
    this.intentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.openSocket();
  }

  private openSocket(): void {
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.resolveUrl());
    } catch (e) {
      this.scheduleReconnect();
      return;
    }
    // Receive binary frames as ArrayBuffer so msgpack can decode in-place
    // without going through Blob → ArrayBuffer round-trips on every message.
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.setStatus('open');
      this.send({ t: 'hello', name: this.currentName, accountId: this.currentAccountId });
      // Re-join previously known room (host fresh if pendingJoinCode is null).
      if (this.pendingJoinCode !== undefined) {
        this.send({ t: 'join', code: this.pendingJoinCode ?? undefined });
      }
      this.startPing();
    });

    ws.addEventListener('message', (ev) => {
      let msg: NetServerMessage;
      try {
        // Server sends binary msgpack. String fallback covers debugging
        // tools and any future text-mode protocol message.
        if (ev.data instanceof ArrayBuffer) {
          msg = msgpackDecode(new Uint8Array(ev.data)) as NetServerMessage;
        } else {
          msg = JSON.parse(String(ev.data)) as NetServerMessage;
        }
      } catch {
        return;
      }
      this.dispatch(msg);
    });

    ws.addEventListener('close', () => {
      this.stopPing();
      this.ws = null;
      // The previous room is no longer real once the socket drops — surface
      // that immediately so engine code (pushState) and UI (CoopMenu) stop
      // pretending the player is still in a session.
      this.roomCode = null;
      if (this.intentionalClose) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // 'close' fires after 'error', so reconnect is handled there. Just log.
      // Keeping silent in production to avoid spamming user consoles.
    });
  }

  private dispatch(msg: NetServerMessage) {
    switch (msg.t) {
      case 'welcome':
        this.peerId = msg.peerId;
        this.handlers.onWelcome?.(msg);
        return;
      case 'room':
        this.roomCode = msg.code;
        this.handlers.onRoom?.(msg);
        return;
      case 'peer-join':  this.handlers.onPeerJoin?.(msg);  return;
      case 'peer-leave': this.handlers.onPeerLeave?.(msg); return;
      case 'state':      this.handlers.onPeerState?.(msg); return;
      case 'chat':       this.handlers.onChat?.(msg);      return;
      case 'pong':       this.handlers.onLatency?.(Date.now() - msg.ts); return;
      case 'error':      this.handlers.onError?.(msg);     return;
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 8);
    const delay = Math.min(RECONNECT_MAX_MS, 1000 * 2 ** (this.reconnectAttempt - 1));
    this.setStatus('reconnecting');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ t: 'ping', ts: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** Host a new room. */
  hostRoom(): void {
    this.pendingJoinCode = null;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ t: 'join' });
    }
  }

  /** Join an existing room by code (case-insensitive). */
  joinRoom(code: string): void {
    const normalized = code.trim().toUpperCase();
    this.pendingJoinCode = normalized;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ t: 'join', code: normalized });
    }
  }

  leaveRoom(): void {
    this.pendingJoinCode = undefined;
    this.roomCode = null;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ t: 'leave' });
    }
  }

  /** Throttled state push. The engine can call this every frame; we drop. */
  pushState(s: { x: number; y: number; z: number; ry: number; anim?: string; hp?: number }) {
    if (!this.roomCode) return;
    const now = performance.now();
    if (now - this.lastStateSent < STATE_INTERVAL_MS) return;
    this.lastStateSent = now;
    this.send({ t: 'state', ...s });
  }

  sendChat(msg: string): void {
    this.send({ t: 'chat', msg });
  }

  /** Close intentionally — no reconnect. */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.setStatus('closed');
  }

  private send(msg: NetClientMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // Binary msgpack matches the server. encode() returns a Uint8Array,
    // which the WebSocket API will frame as a binary message.
    this.ws.send(msgpackEncode(msg));
  }

  getStatus(): NetStatus { return this.status; }
}

/** Module-level singleton — most game code only needs the one connection. */
let _singleton: NetClient | null = null;
export function getNetClient(handlers?: NetClientHandlers): NetClient {
  if (!_singleton) _singleton = new NetClient(handlers ?? {});
  return _singleton;
}

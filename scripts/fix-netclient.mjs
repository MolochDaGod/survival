import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, '../artifacts/arpg-game/src/game/net/NetClient.ts');

const content = `import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import type { NetClientMessage, NetServerMessage, NetServerRoom, NetServerPeerJoin,
  NetServerPeerLeave, NetServerState, NetServerChat, NetServerWelcome, NetServerError } from './protocol';

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
  peerId: string | null = null;
  roomCode: string | null = null;

  constructor(private readonly handlers: NetClientHandlers = {}) {}

  private resolveUrl(): string {
    const explicit = import.meta.env.VITE_WS_URL as string | undefined;
    if (explicit) return explicit.replace(/\\/$/, '') + '/api/realtime';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return \`\${proto}//\${window.location.host}/api/realtime\`;
  }

  private setStatus(s: NetStatus) {
    if (this.status === s) return;
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  connect(name: string, accountId?: string): void {
    this.currentName = name;
    this.currentAccountId = accountId;
    this.intentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.openSocket();
  }

  private openSocket(): void {
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    let ws: WebSocket;
    try { ws = new WebSocket(this.resolveUrl()); } catch (e) { this.scheduleReconnect(); return; }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.setStatus('open');
      this.send({ t: 'hello', name: this.currentName, accountId: this.currentAccountId });
      if (this.pendingJoinCode !== undefined) this.send({ t: 'join', code: this.pendingJoinCode ?? undefined });
      this.startPing();
    });
    ws.addEventListener('message', (ev) => {
      let msg: NetServerMessage;
      try {
        if (ev.data instanceof ArrayBuffer) msg = msgpackDecode(new Uint8Array(ev.data)) as NetServerMessage;
        else msg = JSON.parse(String(ev.data)) as NetServerMessage;
      } catch { return; }
      this.dispatch(msg);
    });
    ws.addEventListener('close', () => {
      this.stopPing();
      this.ws = null;
      this.roomCode = null;
      if (this.intentionalClose) { this.setStatus('closed'); return; }
      this.scheduleReconnect();
    });
    ws.addEventListener('error', () => {});
  }

  private dispatch(msg: NetServerMessage) {
    switch (msg.t) {
      case 'welcome': this.peerId = msg.peerId; this.handlers.onWelcome?.(msg); return;
      case 'room': this.roomCode = msg.code; this.handlers.onRoom?.(msg); return;
      case 'peer-join': this.handlers.onPeerJoin?.(msg); return;
      case 'peer-leave': this.handlers.onPeerLeave?.(msg); return;
      case 'state': this.handlers.onPeerState?.(msg); return;
      case 'chat': this.handlers.onChat?.(msg); return;
      case 'pong': this.handlers.onLatency?.(Date.now() - msg.ts); return;
      case 'error': this.handlers.onError?.(msg); return;
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
    this.pingTimer = setInterval(() => { this.send({ t: 'ping', ts: Date.now() }); }, PING_INTERVAL_MS);
  }

  private stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  hostRoom(): void {
    this.pendingJoinCode = null;
    if (this.ws?.readyState === WebSocket.OPEN) this.send({ t: 'join' });
  }

  joinRoom(code: string): void {
    const normalized = code.trim().toUpperCase();
    this.pendingJoinCode = normalized;
    if (this.ws?.readyState === WebSocket.OPEN) this.send({ t: 'join', code: normalized });
  }

  leaveRoom(): void {
    this.pendingJoinCode = undefined;
    this.roomCode = null;
    if (this.ws?.readyState === WebSocket.OPEN) this.send({ t: 'leave' });
  }

  pushState(s: { x: number; y: number; z: number; ry: number; anim?: string; hp?: number }) {
    if (!this.roomCode) return;
    const now = performance.now();
    if (now - this.lastStateSent < STATE_INTERVAL_MS) return;
    this.lastStateSent = now;
    this.send({ t: 'state', ...s });
  }

  sendChat(msg: string): void { this.send({ t: 'chat', msg }); }

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
    this.ws.send(msgpackEncode(msg));
  }

  getStatus(): NetStatus { return this.status; }
}

let _singleton: NetClient | null = null;
export function getNetClient(handlers?: NetClientHandlers): NetClient {
  if (!_singleton) _singleton = new NetClient(handlers ?? {});
  return _singleton;
}
`;

writeFileSync(target, content, 'utf8');
console.log('DONE: NetClient.ts restored (' + content.split('\n').length + ' lines)');

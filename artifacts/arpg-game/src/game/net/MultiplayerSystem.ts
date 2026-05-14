/**
 * MultiplayerSystem — bridges NetClient ↔ scene/engine for co-op presence.
 *
 * One process-wide singleton: the React UI (CoopMenu) drives connect/host/
 * join/leave; the GameEngine pushes the local player's state each frame and
 * gets a Three.js group it can attach to its scene so remote-player meshes
 * appear in-world. The two never reach into each other's internals — they
 * communicate exclusively through this façade.
 */
import * as THREE from 'three';
import { getNetClient, type NetStatus } from './NetClient';
import { RemotePlayer } from './RemotePlayer';

type Listener = (snap: MultiplayerSnapshot) => void;

export interface MultiplayerSnapshot {
  status: NetStatus;
  roomCode: string | null;
  peerId: string | null;
  peers: { peerId: string; name: string }[];
  latencyMs: number | null;
  errors: string[];
}

class MultiplayerSystemImpl {
  /** Three.js group remotes are mounted under. The engine attaches this once. */
  readonly remotesRoot = new THREE.Group();
  private remotes = new Map<string, RemotePlayer>();
  private peerNames = new Map<string, string>();
  private listeners = new Set<Listener>();
  private snapshot: MultiplayerSnapshot = {
    status: 'idle', roomCode: null, peerId: null, peers: [],
    latencyMs: null, errors: [],
  };

  private client = getNetClient({
    onStatus: (s) => {
      // Drop the visible room state the moment the underlying socket is no
      // longer open. Without this, peers + roomCode linger in the snapshot
      // through reconnection attempts and the UI claims an active session
      // that no longer exists.
      if (s !== 'open' && this.snapshot.roomCode) {
        for (const rp of this.remotes.values()) rp.unmount();
        this.remotes.clear();
        this.peerNames.clear();
        this.update({ status: s, roomCode: null, peers: [] });
      } else {
        this.update({ status: s });
      }
    },
    onWelcome: (m) => this.update({ peerId: m.peerId }),
    onRoom: (m) => {
      this.peerNames.clear();
      m.peers.forEach(p => this.peerNames.set(p.peerId, p.name));
      // Drop any stale remotes (e.g. rejoin after reconnect).
      for (const [pid, rp] of this.remotes) {
        if (!this.peerNames.has(pid) || pid === this.client.peerId) {
          rp.unmount();
          this.remotes.delete(pid);
        }
      }
      // Spawn remotes for everyone already in the room.
      for (const p of m.peers) {
        if (p.peerId === this.client.peerId) continue;
        if (!this.remotes.has(p.peerId)) this.spawnRemote(p.peerId, p.name);
      }
      this.update({
        roomCode: m.code,
        peers: m.peers.filter(p => p.peerId !== this.client.peerId),
      });
    },
    onPeerJoin: (m) => {
      this.peerNames.set(m.peerId, m.name);
      if (m.peerId !== this.client.peerId && !this.remotes.has(m.peerId)) {
        this.spawnRemote(m.peerId, m.name);
      }
      this.update({ peers: this.peerList() });
    },
    onPeerLeave: (m) => {
      const rp = this.remotes.get(m.peerId);
      if (rp) { rp.unmount(); this.remotes.delete(m.peerId); }
      this.peerNames.delete(m.peerId);
      this.update({ peers: this.peerList() });
    },
    onPeerState: (m) => {
      const rp = this.remotes.get(m.peerId);
      if (rp) rp.pushState({ x: m.x, y: m.y, z: m.z, ry: m.ry, anim: m.anim, hp: m.hp });
    },
    onLatency: (rtt) => this.update({ latencyMs: Math.round(rtt) }),
    onError: (m) => {
      const next = [...this.snapshot.errors, m.message ?? m.code].slice(-3);
      // If the room we tried to join doesn't exist or is full, the server
      // never confirmed `room`; make sure the UI doesn't claim we're in.
      if (m.code === 'no_such_room' || m.code === 'room_full') {
        this.update({ errors: next, roomCode: null, peers: [] });
      } else {
        this.update({ errors: next });
      }
    },
  });

  private peerList() {
    return Array.from(this.peerNames.entries())
      .filter(([id]) => id !== this.client.peerId)
      .map(([peerId, name]) => ({ peerId, name }));
  }

  private spawnRemote(peerId: string, name: string) {
    // Pick a colour from a small palette so peers are visually distinct.
    const palette = [0xc9950a, 0x5588ff, 0xff6644, 0x55cc77];
    const idx = (peerId.charCodeAt(0) + peerId.charCodeAt(peerId.length - 1)) % palette.length;
    const rp = new RemotePlayer(peerId, name, palette[idx]);
    rp.mountTo(this.remotesRoot);
    this.remotes.set(peerId, rp);
  }

  private update(patch: Partial<MultiplayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l(this.snapshot);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => { this.listeners.delete(fn); };
  }

  getSnapshot(): MultiplayerSnapshot { return this.snapshot; }

  // ── Public API used by the UI ─────────────────────────────────────────────
  connect(name: string, accountId?: string): void {
    this.client.connect(name, accountId);
  }
  host(): void { this.client.hostRoom(); }
  join(code: string): void { this.client.joinRoom(code); }
  leave(): void {
    this.client.leaveRoom();
    for (const rp of this.remotes.values()) rp.unmount();
    this.remotes.clear();
    this.peerNames.clear();
    this.update({ roomCode: null, peers: [] });
  }
  disconnect(): void {
    this.leave();
    this.client.disconnect();
  }

  // ── Per-frame integration used by GameEngine ──────────────────────────────
  /** Update lerps on every remote. Call once per render frame. */
  tick(dtSeconds: number): void {
    if (this.remotes.size === 0) return;
    for (const rp of this.remotes.values()) rp.update(dtSeconds);
  }

  /** Push local-player state to peers (throttled internally to ~20 Hz). */
  pushLocalState(s: { x: number; y: number; z: number; ry: number; anim?: string; hp?: number }): void {
    if (!this.snapshot.roomCode) return;
    this.client.pushState(s);
  }
}

export const MultiplayerSystem = new MultiplayerSystemImpl();

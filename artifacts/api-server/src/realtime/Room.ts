/**
 * Room — a single co-op session of up to ROOM_MAX_PEERS players.
 *
 * Holds a small set of `Peer`s, broadcasts state at the engine's natural
 * cadence (drives by client `state` messages — no server tick yet), and
 * cleans itself up when empty. This is intentionally minimal: no persistent
 * world state, no save, no server-side simulation. Just relay + presence.
 */
import type { WebSocket } from "ws";
import { encode as msgpackEncode } from "@msgpack/msgpack";
import {
  ROOM_MAX_PEERS,
  type ServerMessage,
} from "./protocol";

export interface Peer {
  peerId: string;
  name: string;
  ws: WebSocket;
  /** Last known position, broadcast on join so newcomers see everyone. */
  lastState?: {
    x: number; y: number; z: number; ry: number;
    anim?: string; hp?: number;
  };
}

export class Room {
  readonly code: string;
  hostPeerId: string;
  private peers = new Map<string, Peer>();

  constructor(code: string, host: Peer) {
    this.code = code;
    this.hostPeerId = host.peerId;
    this.peers.set(host.peerId, host);
  }

  get size(): number { return this.peers.size; }
  get isFull(): boolean { return this.peers.size >= ROOM_MAX_PEERS; }
  get isEmpty(): boolean { return this.peers.size === 0; }

  add(peer: Peer): boolean {
    if (this.isFull) return false;
    this.peers.set(peer.peerId, peer);
    return true;
  }

  remove(peerId: string): Peer | undefined {
    const p = this.peers.get(peerId);
    if (!p) return undefined;
    this.peers.delete(peerId);
    // Promote a new host if the host left.
    if (this.hostPeerId === peerId && this.peers.size > 0) {
      const next = this.peers.values().next().value;
      if (next) this.hostPeerId = next.peerId;
    }
    return p;
  }

  get(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  list(): Peer[] {
    return Array.from(this.peers.values());
  }

  /** Broadcast a message to everyone in the room except `exceptId`. */
  broadcast(msg: ServerMessage, exceptId?: string): void {
    const buf = msgpackEncode(msg);
    for (const peer of this.peers.values()) {
      if (peer.peerId === exceptId) continue;
      // OPEN === 1 in ws lib; check numerically to avoid importing the enum.
      if (peer.ws.readyState === 1) {
        peer.ws.send(buf);
      }
    }
  }

  /** Send to a specific peer. */
  sendTo(peerId: string, msg: ServerMessage): void {
    const p = this.peers.get(peerId);
    if (p && p.ws.readyState === 1) {
      p.ws.send(msgpackEncode(msg));
    }
  }
}

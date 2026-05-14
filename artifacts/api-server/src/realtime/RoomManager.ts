/**
 * RoomManager — owns the in-memory map of co-op rooms.
 *
 * Single-process only (this matches our current single-instance api-server
 * deployment). When the server scales horizontally, swap this for a Redis
 * pub-sub layer; the WebSocket handler API will not change.
 */
import { randomBytes } from "node:crypto";
import { Room, type Peer } from "./Room";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/O/0/1/L

function generateCode(): string {
  const buf = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return out;
}

class RoomManagerImpl {
  private rooms = new Map<string, Room>();

  /** Create a brand-new room with `host` as the first peer. Returns the room. */
  createRoom(host: Peer): Room {
    let code = generateCode();
    // Vanishingly unlikely to collide, but be safe.
    while (this.rooms.has(code)) code = generateCode();
    const room = new Room(code, host);
    this.rooms.set(code, room);
    return room;
  }

  /** Look up a room by its 6-char code (case-insensitive). */
  findRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Drop empty rooms — call after each peer disconnect. */
  reapIfEmpty(room: Room): void {
    if (room.isEmpty) {
      this.rooms.delete(room.code);
    }
  }

  /** Diagnostic — used by /api/realtime/stats. */
  stats() {
    return {
      roomCount: this.rooms.size,
      peerCount: Array.from(this.rooms.values())
        .reduce((sum, r) => sum + r.size, 0),
      rooms: Array.from(this.rooms.values()).map(r => ({
        code: r.code, peers: r.size, host: r.hostPeerId,
      })),
    };
  }
}

export const RoomManager = new RoomManagerImpl();

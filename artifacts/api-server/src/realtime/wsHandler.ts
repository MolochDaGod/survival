/**
 * Co-op WebSocket handler — wires raw `ws` connections into the Room model.
 *
 * Connection flow:
 *   1. Client opens ws://…/realtime
 *   2. Sends `hello` (with display name)        → server replies `welcome`
 *   3. Sends `join` (with optional room code)   → server replies `room`
 *   4. From then on: `state` messages relay to peers; `peer-join`/`peer-leave`
 *      keep everyone in sync.
 *
 * The handler is deliberately tolerant: any malformed message answers with a
 * single `error` and keeps the socket open. Disconnect handling cleans up the
 * room reference and broadcasts `peer-leave`.
 */
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import { logger } from "../lib/logger";
import { RoomManager } from "./RoomManager";
import { Room, type Peer } from "./Room";
import {
  ClientMessage,
  SERVER_VERSION,
  type ServerMessage,
} from "./protocol";

interface ConnState {
  peerId: string;
  name: string;
  room?: Room;
  /** Token-bucket for rate limiting state messages. */
  stateTokens: number;
  lastStateRefill: number;
}

const STATE_REFILL_PER_SEC = 30;
const STATE_BUCKET_MAX = 60;

// Wire format is binary msgpack. At 20 Hz × up to 4 peers, msgpack typically
// halves the bytes-on-wire vs JSON for state frames (no field-name strings,
// numeric ints, packed floats) and decodes faster too. Both client and
// server are under our control so there's no fallback path needed.
function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState !== 1) return;
  ws.send(msgpackEncode(msg));
}

function decodeIncoming(raw: unknown): unknown {
  // `ws` delivers binary as Buffer | ArrayBuffer | Buffer[]. Normalise to a
  // Uint8Array view that msgpack can read in-place without an extra copy.
  if (raw instanceof Uint8Array) return msgpackDecode(raw);
  if (raw instanceof ArrayBuffer) return msgpackDecode(new Uint8Array(raw));
  if (Array.isArray(raw)) return msgpackDecode(Buffer.concat(raw as Buffer[]));
  // String fallback (older clients / debugging tools): try JSON.
  return JSON.parse(String(raw));
}

function refillTokens(state: ConnState): void {
  const now = Date.now();
  const elapsed = (now - state.lastStateRefill) / 1000;
  state.lastStateRefill = now;
  state.stateTokens = Math.min(
    STATE_BUCKET_MAX,
    state.stateTokens + elapsed * STATE_REFILL_PER_SEC,
  );
}

export function handleWsConnection(ws: WebSocket): void {
  const state: ConnState = {
    peerId: randomUUID(),
    name: "Wanderer",
    stateTokens: STATE_BUCKET_MAX,
    lastStateRefill: Date.now(),
  };

  send(ws, { t: "welcome", peerId: state.peerId, serverVersion: SERVER_VERSION });

  ws.on("message", (raw) => {
    let parsed;
    try {
      parsed = ClientMessage.parse(decodeIncoming(raw));
    } catch {
      send(ws, { t: "error", code: "bad_message" });
      return;
    }

    switch (parsed.t) {
      case "hello": {
        state.name = parsed.name;
        return;
      }

      case "join": {
        // Leave any existing room first (clients shouldn't but be safe).
        if (state.room) leaveRoom(state, "leave");

        const peer: Peer = { peerId: state.peerId, name: state.name, ws };
        let room: Room;

        if (parsed.code) {
          const found = RoomManager.findRoom(parsed.code);
          if (!found) {
            send(ws, { t: "error", code: "no_such_room" });
            return;
          }
          if (!found.add(peer)) {
            send(ws, { t: "error", code: "room_full" });
            return;
          }
          room = found;
        } else {
          room = RoomManager.createRoom(peer);
        }
        state.room = room;

        // Tell the joining peer who's already here.
        send(ws, {
          t: "room",
          code: room.code,
          hostPeerId: room.hostPeerId,
          peers: room.list().map(p => ({ peerId: p.peerId, name: p.name })),
        });
        // Tell everyone else there's a newcomer.
        room.broadcast(
          { t: "peer-join", peerId: peer.peerId, name: peer.name },
          peer.peerId,
        );
        // Replay each existing peer's last known state to the newcomer so
        // they don't see ghosts at the origin until those peers move next.
        for (const other of room.list()) {
          if (other.peerId === peer.peerId) continue;
          if (other.lastState) {
            send(ws, {
              t: "state",
              peerId: other.peerId,
              ...other.lastState,
            });
          }
        }
        return;
      }

      case "leave": {
        leaveRoom(state, "leave");
        return;
      }

      case "state": {
        if (!state.room) {
          send(ws, { t: "error", code: "not_joined" });
          return;
        }
        refillTokens(state);
        if (state.stateTokens < 1) {
          // Drop silently — flood control. Don't error or peer would spam logs.
          return;
        }
        state.stateTokens -= 1;

        const peer = state.room.get(state.peerId);
        if (peer) {
          peer.lastState = {
            x: parsed.x, y: parsed.y, z: parsed.z, ry: parsed.ry,
            anim: parsed.anim, hp: parsed.hp,
          };
        }
        state.room.broadcast(
          {
            t: "state",
            peerId: state.peerId,
            x: parsed.x, y: parsed.y, z: parsed.z, ry: parsed.ry,
            anim: parsed.anim, hp: parsed.hp,
          },
          state.peerId,
        );
        return;
      }

      case "chat": {
        if (!state.room) {
          send(ws, { t: "error", code: "not_joined" });
          return;
        }
        state.room.broadcast({
          t: "chat",
          peerId: state.peerId,
          name: state.name,
          msg: parsed.msg,
        });
        return;
      }

      case "ping": {
        send(ws, { t: "pong", ts: parsed.ts, serverTs: Date.now() });
        return;
      }

    }
  });

  ws.on("close", () => {
    leaveRoom(state, "disconnect");
  });

  ws.on("error", (err) => {
    logger.warn({ err, peerId: state.peerId }, "ws error");
  });
}

function leaveRoom(state: ConnState, reason: "leave" | "disconnect"): void {
  const room = state.room;
  if (!room) return;
  state.room = undefined;
  room.remove(state.peerId);
  room.broadcast({ t: "peer-leave", peerId: state.peerId });
  RoomManager.reapIfEmpty(room);
  logger.debug({ peerId: state.peerId, code: room.code, reason }, "peer left room");
}

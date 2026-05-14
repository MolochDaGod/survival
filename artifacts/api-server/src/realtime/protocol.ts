/**
 * Co-op multiplayer wire protocol — JSON-over-WebSocket.
 *
 * Tiny by design: position broadcast at ~20 Hz + lifecycle events. Combat
 * and inventory remain client-authoritative for this iteration; the server
 * relays events and validates room membership only. Future iterations will
 * tighten this with server-side hit validation.
 *
 * All messages share a `t` (type) discriminator. Outgoing server→client
 * messages additionally carry a server-assigned `roomCode`/`peerId` where
 * relevant, so a client can tell broadcasts from echoes of its own input.
 */
import { z } from "zod";

// ─── Client → Server ──────────────────────────────────────────────────────

export const ClientHello = z.object({
  t: z.literal("hello"),
  /** Player display name (sent once on connect, before join). */
  name: z.string().min(1).max(32),
  /** Optional account id from puter.js — informational, not trusted. */
  accountId: z.string().optional(),
});

export const ClientJoin = z.object({
  t: z.literal("join"),
  /** 6-char room code; empty/missing means "host a new room". */
  code: z.string().max(8).optional(),
});

export const ClientLeave = z.object({ t: z.literal("leave") });

export const ClientState = z.object({
  t: z.literal("state"),
  /** World position. */
  x: z.number(),
  y: z.number(),
  z: z.number(),
  /** Y-axis rotation, radians. */
  ry: z.number(),
  /** Animation state id (idle, run, attack, …). */
  anim: z.string().max(24).optional(),
  /** Current HP percent 0..1 for nameplates. */
  hp: z.number().min(0).max(1).optional(),
});

export const ClientChat = z.object({
  t: z.literal("chat"),
  msg: z.string().min(1).max(240),
});

export const ClientPing = z.object({
  t: z.literal("ping"),
  /** Client-side timestamp for RTT measurement. */
  ts: z.number(),
});

export const ClientMessage = z.discriminatedUnion("t", [
  ClientHello,
  ClientJoin,
  ClientLeave,
  ClientState,
  ClientChat,
  ClientPing,
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ─── Server → Client ──────────────────────────────────────────────────────

export interface ServerWelcome {
  t: "welcome";
  peerId: string;
  /** Server build version, useful for hard-mismatch warnings. */
  serverVersion: string;
}

export interface ServerRoom {
  t: "room";
  code: string;
  hostPeerId: string;
  peers: { peerId: string; name: string }[];
}

export interface ServerPeerJoin {
  t: "peer-join";
  peerId: string;
  name: string;
}

export interface ServerPeerLeave {
  t: "peer-leave";
  peerId: string;
}

export interface ServerStateBroadcast {
  t: "state";
  peerId: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  anim?: string;
  hp?: number;
}

export interface ServerChatBroadcast {
  t: "chat";
  peerId: string;
  name: string;
  msg: string;
}

export interface ServerPong {
  t: "pong";
  ts: number;
  serverTs: number;
}

export interface ServerError {
  t: "error";
  code: "room_full" | "no_such_room" | "bad_message" | "rate_limited" | "not_joined";
  message?: string;
}

export type ServerMessage =
  | ServerWelcome
  | ServerRoom
  | ServerPeerJoin
  | ServerPeerLeave
  | ServerStateBroadcast
  | ServerChatBroadcast
  | ServerPong
  | ServerError;

export const ROOM_MAX_PEERS = 4;
export const SERVER_VERSION = "1.0.0-coop";

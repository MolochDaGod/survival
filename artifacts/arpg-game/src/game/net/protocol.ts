/**
 * Client-side mirror of the co-op wire protocol. Kept narrow on purpose —
 * we only model the messages the client sends or has to interpret. Server
 * adds discriminated unions on its side; here we use a single tagged union.
 */

export interface NetClientHello { t: 'hello'; name: string; accountId?: string; }
export interface NetClientJoin  { t: 'join'; code?: string; }
export interface NetClientLeave { t: 'leave'; }
export interface NetClientState {
  t: 'state';
  x: number; y: number; z: number; ry: number;
  anim?: string; hp?: number;
}
export interface NetClientChat  { t: 'chat'; msg: string; }
export interface NetClientPing  { t: 'ping'; ts: number; }

export type NetClientMessage =
  | NetClientHello
  | NetClientJoin
  | NetClientLeave
  | NetClientState
  | NetClientChat
  | NetClientPing;

export interface NetServerWelcome     { t: 'welcome'; peerId: string; serverVersion: string; }
export interface NetServerRoom        { t: 'room'; code: string; hostPeerId: string; peers: { peerId: string; name: string }[]; }
export interface NetServerPeerJoin    { t: 'peer-join'; peerId: string; name: string; }
export interface NetServerPeerLeave   { t: 'peer-leave'; peerId: string; }
export interface NetServerState       { t: 'state'; peerId: string; x: number; y: number; z: number; ry: number; anim?: string; hp?: number; }
export interface NetServerChat        { t: 'chat'; peerId: string; name: string; msg: string; }
export interface NetServerPong        { t: 'pong'; ts: number; serverTs: number; }
export interface NetServerError       { t: 'error'; code: string; message?: string; }

export type NetServerMessage =
  | NetServerWelcome
  | NetServerRoom
  | NetServerPeerJoin
  | NetServerPeerLeave
  | NetServerState
  | NetServerChat
  | NetServerPong
  | NetServerError;

/**
 * Networking transports.
 *
 * The game is host-authoritative: one player's browser tab runs the engine and
 * is the single source of truth. Everyone else sends actions to it and receives
 * a redacted view back. That means no server, which is the whole point — the
 * room code IS the host's WebRTC peer id, so joining needs no lookup service.
 *
 * Two transports implement the same interface:
 *   PeerHost / PeerClient   real WebRTC connections over the public PeerJS broker
 *   LoopHost  / LoopClient  in-memory, same-process; used by the tests
 *
 * If peer-to-peer ever becomes a nuisance (a host who keeps closing their tab,
 * a restrictive corporate network), replacing these two classes with WebSocket
 * equivalents is the only change needed anywhere in the codebase.
 */

/** Room-code alphabet: no 0/O/1/I/L, so codes survive being read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

/** Namespaced so we never collide with other apps on the shared broker. */
const PEER_PREFIX = 'ccg-v1-';

const PEER_OPTIONS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

export function randomCode(length = CODE_LENGTH) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function peerIdFor(code) {
  return PEER_PREFIX + code.trim().toUpperCase();
}

/** Normalise whatever the user typed or pasted into a bare room code. */
export function normaliseCode(input) {
  const raw = String(input || '').trim().toUpperCase();
  const fromUrl = raw.match(/[?#&]room=([A-Z0-9]+)/)?.[1];
  return (fromUrl || raw).replace(new RegExp(`[^${CODE_ALPHABET}]`, 'g'), '');
}

/* ------------------------------------------------------------------ *
 * PeerJS — host side
 * ------------------------------------------------------------------ */

export class PeerHost {
  /**
   * @param {object} handlers
   * @param {(id:string)=>void} handlers.onConnect
   * @param {(id:string, msg:object)=>void} handlers.onMessage
   * @param {(id:string)=>void} handlers.onDisconnect
   * @param {(err:Error)=>void} handlers.onError
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.connections = new Map(); // peerId -> DataConnection
    this.peer = null;
    this.code = null;
  }

  /**
   * Claim a room code on the broker. Codes are short enough to collide, so on
   * 'unavailable-id' we simply try another one.
   */
  async start(attempt = 0) {
    if (typeof Peer === 'undefined') {
      throw new Error('PeerJS failed to load — check your connection and reload');
    }
    const code = randomCode();
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerIdFor(code), PEER_OPTIONS);

      const onOpen = () => {
        this.peer = peer;
        this.code = code;
        peer.on('connection', (conn) => this.#accept(conn));
        peer.on('error', (err) => this.#error(err));
        peer.on('disconnected', () => peer.reconnect());
        resolve(code);
      };

      const onError = (err) => {
        if (err.type === 'unavailable-id' && attempt < 5) {
          peer.destroy();
          resolve(this.start(attempt + 1));
        } else {
          peer.destroy();
          reject(friendlyPeerError(err));
        }
      };

      peer.once('open', onOpen);
      peer.once('error', onError);
    });
  }

  #accept(conn) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.handlers.onConnect?.(conn.peer);
    });
    conn.on('data', (data) => {
      const msg = typeof data === 'string' ? safeParse(data) : data;
      if (msg) this.handlers.onMessage?.(conn.peer, msg);
    });
    const close = () => {
      if (this.connections.delete(conn.peer)) this.handlers.onDisconnect?.(conn.peer);
    };
    conn.on('close', close);
    conn.on('error', close);
  }

  #error(err) {
    this.handlers.onError?.(friendlyPeerError(err));
  }

  send(peerId, message) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) conn.send(message);
  }

  broadcast(message) {
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(message);
    }
  }

  close() {
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

/* ------------------------------------------------------------------ *
 * PeerJS — client side
 * ------------------------------------------------------------------ */

export class PeerClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.peer = null;
    this.conn = null;
  }

  async connect(code, { timeout = 15000 } = {}) {
    if (typeof Peer === 'undefined') {
      throw new Error('PeerJS failed to load — check your connection and reload');
    }
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, PEER_OPTIONS);
      let settled = false;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.destroy();
        reject(err);
      };

      const timer = setTimeout(
        () => fail(new Error(`No answer from room ${code}. Is the host still there?`)),
        timeout,
      );

      peer.once('open', () => {
        const conn = peer.connect(peerIdFor(code), { reliable: true });

        conn.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.peer = peer;
          this.conn = conn;
          resolve();
        });

        conn.on('data', (data) => {
          const msg = typeof data === 'string' ? safeParse(data) : data;
          if (msg) this.handlers.onMessage?.(msg);
        });

        conn.on('close', () => this.handlers.onClose?.());
        conn.on('error', (err) => fail(friendlyPeerError(err)));
      });

      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          fail(new Error(`No room found with code ${code}`));
        } else {
          fail(friendlyPeerError(err));
        }
      });
    });
  }

  send(message) {
    if (this.conn?.open) this.conn.send(message);
  }

  close() {
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
  }
}

/* ------------------------------------------------------------------ *
 * Loopback transports (tests, and single-machine development)
 * ------------------------------------------------------------------ */

const loopRooms = new Map();

export class LoopHost {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.clients = new Map();
    this.code = null;
  }

  async start() {
    this.code = randomCode();
    loopRooms.set(this.code, this);
    return this.code;
  }

  _attach(id, client) {
    this.clients.set(id, client);
    queueMicrotask(() => this.handlers.onConnect?.(id));
  }

  _receive(id, message) {
    queueMicrotask(() => this.handlers.onMessage?.(id, message));
  }

  _detach(id) {
    if (this.clients.delete(id)) this.handlers.onDisconnect?.(id);
  }

  send(id, message) {
    const client = this.clients.get(id);
    if (client) queueMicrotask(() => client.handlers.onMessage?.(message));
  }

  broadcast(message) {
    for (const id of this.clients.keys()) this.send(id, message);
  }

  close() {
    loopRooms.delete(this.code);
    this.clients.clear();
  }
}

let loopSeq = 0;

export class LoopClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.id = `loop-${++loopSeq}`;
    this.host = null;
  }

  async connect(code) {
    const host = loopRooms.get(normaliseCode(code));
    if (!host) throw new Error(`No room found with code ${code}`);
    this.host = host;
    host._attach(this.id, this);
  }

  send(message) {
    this.host?._receive(this.id, message);
  }

  close() {
    this.host?._detach(this.id);
    this.host = null;
  }
}

/* ------------------------------------------------------------------ */

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function friendlyPeerError(err) {
  const messages = {
    'browser-incompatible': 'This browser does not support the connection this game needs',
    'network': 'Lost contact with the matchmaking service — check your connection',
    'peer-unavailable': 'That room is not open any more',
    'ssl-unavailable': 'A secure connection could not be established',
    'server-error': 'The matchmaking service is having trouble — try again in a minute',
    'unavailable-id': 'That room code is taken',
    'webrtc': 'Your network is blocking the peer-to-peer connection',
  };
  const error = new Error(messages[err?.type] || err?.message || 'Connection failed');
  error.type = err?.type;
  return error;
}

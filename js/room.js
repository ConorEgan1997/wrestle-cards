/**
 * The room protocol — the layer between the transports and the engine.
 *
 * HostRoom runs the engine and answers to everybody. ClientRoom is a thin
 * mirror: it holds no game state of its own, just the last view the host sent,
 * which is why a client can never see another player's cards even if someone
 * pokes at the console.
 *
 * Wire format (all messages are plain objects with a `t` type tag):
 *
 *   client -> host   join, ready, action, chat, rename
 *   host -> client   welcome, state, error, chat, closed
 */

import { GameEngine } from './engine.js';
import { getRuleset } from './rules/index.js';
import { PeerHost, PeerClient } from './net.js';

const TOKEN_KEY = 'cardgame.token';
const NAME_KEY = 'cardgame.name';

/**
 * Who this player is.
 *
 * The token lives in sessionStorage, not localStorage, and the distinction is
 * load-bearing: sessionStorage survives a refresh (so a reconnect gets your
 * seat and hand back) but is scoped to one tab (so two tabs on one machine are
 * two different players, which is how you test this thing on your own).
 *
 * The display name is the opposite — it belongs to the person, not the tab —
 * so that goes in localStorage.
 */
export function myIdentity() {
  let token = read('sessionStorage', TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    write('sessionStorage', TOKEN_KEY, token);
  }
  return { token, name: read('localStorage', NAME_KEY) || '' };
}

export function rememberName(name) {
  write('localStorage', NAME_KEY, name);
}

/**
 * Storage is looked up by name on globalThis rather than referenced directly,
 * so this module also loads under Node (where neither global exists) for tests.
 */
function read(storeName, key) {
  try {
    return globalThis[storeName]?.getItem(key) ?? null;
  } catch {
    return null; // private browsing or storage disabled
  }
}

function write(storeName, key, value) {
  try {
    globalThis[storeName]?.setItem(key, value);
  } catch {
    /* not fatal: the identity just won't survive a refresh */
  }
}

/* ------------------------------------------------------------------ *
 * Host
 * ------------------------------------------------------------------ */

export class HostRoom {
  /**
   * @param {object} opts
   * @param {string} opts.rulesetId
   * @param {(view:object)=>void} opts.onUpdate   called with the host's own view
   * @param {(msg:string)=>void} [opts.onError]
   * @param {Function} [opts.Transport]           swap in LoopHost for tests
   */
  constructor({ rulesetId, onUpdate, onError, token, Transport = PeerHost }) {
    this.rules = getRuleset(rulesetId);
    this.token = token; // tests pass one in; real players get theirs from storage
    this.engine = new GameEngine(this.rules);
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.isHost = true;
    this.code = null;

    /** connection id -> player id, so we know who a message came from. */
    this.seats = new Map();

    this.transport = new Transport({
      onConnect: () => {}, // nothing to do until they tell us who they are
      onMessage: (connId, msg) => this.#handle(connId, msg),
      onDisconnect: (connId) => this.#handleDisconnect(connId),
      onError: (err) => this.onError?.(err.message),
    });
  }

  async open(hostName) {
    this.code = await this.transport.start();
    this.playerId = this.token ?? myIdentity().token;
    this.engine.addPlayer({ id: this.playerId, name: hostName, isHost: true });
    this.#publish();
    return this.code;
  }

  /** The share link friends can click instead of typing the code. */
  get inviteUrl() {
    if (!this.code) return null;
    const url = new URL(window.location.href);
    url.hash = `#/join/${this.code}`;
    return url.toString();
  }

  /* ------------------------- local actions ------------------------ */

  setReady(ready) {
    this.engine.setReady(this.playerId, ready);
    this.#publish();
  }

  rename(name) {
    const player = this.engine.getPlayer(this.playerId);
    if (player) player.name = name;
    this.#publish();
  }

  setProfile(patch) {
    this.engine.setProfile(this.playerId, patch);
    this.#publish();
  }

  start() {
    try {
      this.engine.start();
    } catch (err) {
      this.onError?.(err.message);
    }
    this.#publish();
  }

  act(action) {
    const result = this.engine.dispatch(this.playerId, action);
    if (!result.ok) this.onError?.(result.error);
    this.#publish();
  }

  chat(text) {
    this.#relayChat(this.playerId, text);
  }

  canStart() {
    return this.engine.canStart();
  }

  close() {
    this.transport.broadcast({ t: 'closed', reason: 'The host left' });
    this.transport.close();
  }

  /* --------------------- incoming from clients -------------------- */

  #handle(connId, msg) {
    switch (msg?.t) {
      case 'join':
        return this.#handleJoin(connId, msg);
      case 'ready':
        return this.#withPlayer(connId, (id) => this.engine.setReady(id, msg.ready));
      case 'rename':
        return this.#withPlayer(connId, (id) => {
          const player = this.engine.getPlayer(id);
          if (player && msg.name) player.name = sanitiseName(msg.name);
        });
      case 'action':
        return this.#withPlayer(connId, (id) => {
          const result = this.engine.dispatch(id, msg.action);
          if (!result.ok) this.transport.send(connId, { t: 'error', message: result.error });
        });
      case 'profile':
        return this.#withPlayer(connId, (id) => this.engine.setProfile(id, msg.patch));
      case 'chat':
        return this.#withPlayer(connId, (id) => this.#relayChat(id, msg.text));
      default:
      // Ignore anything we don't recognise rather than trusting it.
    }
  }

  #handleJoin(connId, msg) {
    // A connection that already holds a seat cannot join again. Ignoring this
    // rather than erroring matters: a fatal error would close the connection
    // and evict a player who was happily seated.
    if (this.seats.has(connId)) return;

    const token = typeof msg.token === 'string' ? msg.token : null;
    if (!token) {
      return this.transport.send(connId, { t: 'error', message: 'Malformed join request', fatal: true });
    }
    try {
      const player = this.engine.addPlayer({ id: token, name: sanitiseName(msg.name) });
      this.seats.set(connId, token);
      this.transport.send(connId, {
        t: 'welcome',
        playerId: token,
        code: this.code,
        view: this.engine.viewFor(token),
      });
      this.#publish();
    } catch (err) {
      this.transport.send(connId, { t: 'error', message: err.message, fatal: true });
    }
  }

  #handleDisconnect(connId) {
    const playerId = this.seats.get(connId);
    if (!playerId) return;
    this.seats.delete(connId);
    this.engine.dropPlayer(playerId);
    this.#publish();
  }

  #withPlayer(connId, fn) {
    const playerId = this.seats.get(connId);
    if (!playerId) return;
    fn(playerId);
    this.#publish();
  }

  #relayChat(fromId, text) {
    const player = this.engine.getPlayer(fromId);
    const clean = String(text || '').slice(0, 300).trim();
    if (!player || !clean) return;
    this.transport.broadcast({ t: 'chat', from: player.name, text: clean });
    this.onChat?.({ from: player.name, text: clean });
  }

  /** Send every connected player their own redacted view. */
  #publish() {
    for (const [connId, playerId] of this.seats) {
      this.transport.send(connId, { t: 'state', view: this.engine.viewFor(playerId) });
    }
    this.onUpdate?.(this.engine.viewFor(this.playerId));
  }
}

/* ------------------------------------------------------------------ *
 * Client
 * ------------------------------------------------------------------ */

export class ClientRoom {
  constructor({ onUpdate, onError, onClosed, onChat, token, Transport = PeerClient }) {
    this.token = token;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.onClosed = onClosed;
    this.onChat = onChat;
    this.isHost = false;
    this.view = null;

    this.transport = new Transport({
      onMessage: (msg) => this.#handle(msg),
      onClose: () => this.onClosed?.('Disconnected from the host'),
    });
  }

  async join(code, name) {
    this.code = code;
    await this.transport.connect(code);
    this.playerId = this.token ?? myIdentity().token;
    this.transport.send({ t: 'join', token: this.playerId, name });
  }

  setReady(ready) {
    this.transport.send({ t: 'ready', ready });
  }

  rename(name) {
    this.transport.send({ t: 'rename', name });
  }

  setProfile(patch) {
    this.transport.send({ t: 'profile', patch });
  }

  act(action) {
    this.transport.send({ t: 'action', action });
  }

  chat(text) {
    this.transport.send({ t: 'chat', text });
  }

  canStart() {
    return false; // only the host starts the game
  }

  start() {
    this.onError?.('Only the host can start the game');
  }

  close() {
    this.transport.close();
  }

  #handle(msg) {
    switch (msg?.t) {
      case 'welcome':
        this.playerId = msg.playerId;
        this.view = msg.view;
        return this.onUpdate?.(this.view);
      case 'state':
        this.view = msg.view;
        return this.onUpdate?.(this.view);
      case 'error':
        this.onError?.(msg.message);
        if (msg.fatal) this.close();
        return;
      case 'chat':
        return this.onChat?.({ from: msg.from, text: msg.text });
      case 'closed':
        this.close();
        return this.onClosed?.(msg.reason || 'The room closed');
      default:
    }
  }
}

function sanitiseName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return clean || 'Player';
}

/**
 * Generic card game engine.
 *
 * The engine owns everything that is true of *all* card games: a deck, hands,
 * piles, players, turn order, an action log, and the rule that each player may
 * only see their own cards. Everything game-specific lives in a "rules module"
 * (see js/rules/README or the example in js/rules/crazy-eights.js).
 *
 * The engine is pure logic with no DOM and no network, so it runs identically
 * in a browser tab and in Node for tests.
 */

/* ------------------------------------------------------------------ *
 * Randomness
 * ------------------------------------------------------------------ */

/**
 * Deterministic PRNG (mulberry32). Seeding matters: the host shuffles, and a
 * fixed seed means a game can be replayed exactly for debugging.
 */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, in place, using the supplied rng. Returns the same array. */
export function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** Thrown by rules modules to reject an action with a message for the player. */
export class IllegalAction extends Error {
  constructor(message) {
    super(message);
    this.name = 'IllegalAction';
  }
}

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

const MAX_LOG = 200;

export class GameEngine {
  /**
   * @param {object} rules  A rules module (see the shape documented in README).
   * @param {object} [opts]
   * @param {number} [opts.seed]  Fixed seed, for reproducible games.
   */
  constructor(rules, opts = {}) {
    if (!rules) throw new Error('GameEngine requires a rules module');
    this.rules = rules;
    this.seed = opts.seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.rng = makeRng(this.seed);

    this.state = {
      phase: 'lobby', // 'lobby' | 'playing' | 'over'
      ruleset: { id: rules.id, name: rules.name },
      seed: this.seed,
      players: [], // [{ id, name, connected, ready, isHost, hand:[], score }]
      turn: null, // player id whose turn it is
      direction: 1, // 1 = clockwise through players[], -1 = anticlockwise
      deck: [], // face-down draw pile
      discard: [], // face-up pile; last element is the top card
      table: [], // shared face-up area (melds, tricks in progress, etc.)
      vars: {}, // free-form scratch space owned by the rules module
      log: [],
      result: null, // set when phase === 'over'
      round: 0,
    };
  }

  /* ---------------------- player management ---------------------- */

  /** Add a player, or mark an existing one reconnected. Returns the player. */
  addPlayer({ id, name, isHost = false }) {
    const existing = this.state.players.find((p) => p.id === id);
    if (existing) {
      existing.connected = true;
      if (name) existing.name = name;
      this.log(`${existing.name} reconnected`);
      return existing;
    }
    if (this.state.phase !== 'lobby') {
      throw new IllegalAction('The game has already started');
    }
    const max = this.rules.maxPlayers ?? 8;
    if (this.state.players.length >= max) {
      throw new IllegalAction(`This game seats at most ${max} players`);
    }
    const player = {
      id,
      name: name || `Player ${this.state.players.length + 1}`,
      connected: true,
      ready: false,
      isHost,
      hand: [],
      score: 0,
    };
    this.state.players.push(player);
    this.log(`${player.name} joined`);
    return player;
  }

  /**
   * Mark a player disconnected. We deliberately do not remove them mid-game:
   * their hand must stay put so they can rejoin with the same identity.
   */
  dropPlayer(id) {
    const player = this.getPlayer(id);
    if (!player) return;
    player.connected = false;
    player.ready = false;
    this.log(`${player.name} disconnected`);
    if (this.state.phase === 'lobby') {
      this.state.players = this.state.players.filter((p) => p.id !== id);
    } else if (this.state.turn === id) {
      // Don't stall the game on someone who has left.
      this.advanceTurn();
    }
  }

  getPlayer(id) {
    return this.state.players.find((p) => p.id === id) || null;
  }

  setReady(id, ready) {
    const player = this.getPlayer(id);
    if (player) player.ready = !!ready;
  }

  /**
   * Set lobby profile fields on a player — things chosen before the game
   * starts, like which wrestler they're backing. Only fields the rules module
   * names in `profileFields` can be written, so a client can't set arbitrary
   * properties on its own player object.
   */
  setProfile(id, patch) {
    const player = this.getPlayer(id);
    if (!player || !patch) return;
    for (const field of this.rules.profileFields ?? []) {
      if (field in patch) {
        const value = patch[field];
        player[field] = typeof value === 'string' ? value.slice(0, 40).trim() : value;
      }
    }
  }

  /** True when there are enough connected players and all of them are ready. */
  canStart() {
    const active = this.state.players.filter((p) => p.connected);
    const min = this.rules.minPlayers ?? 2;
    return active.length >= min && active.every((p) => p.ready);
  }

  /* ---------------------------- setup ---------------------------- */

  start(seed) {
    if (this.state.phase === 'playing') throw new IllegalAction('Already playing');
    const active = this.state.players.filter((p) => p.connected);
    const min = this.rules.minPlayers ?? 2;
    if (active.length < min) {
      throw new IllegalAction(`Need at least ${min} players to start`);
    }

    if (seed !== undefined) {
      this.seed = seed >>> 0;
      this.rng = makeRng(this.seed);
    }
    this.state.seed = this.seed;
    this.state.players = active;
    this.state.players.forEach((p) => {
      p.hand = [];
      p.score = 0;
    });
    this.state.deck = shuffle(this.rules.buildDeck(this.ctx()), this.rng);
    this.state.discard = [];
    this.state.table = [];
    this.state.vars = {};
    this.state.result = null;
    this.state.direction = 1;
    this.state.round = 1;
    this.state.phase = 'playing';
    this.state.turn = this.state.players[0].id;

    this.rules.setup(this.state, this.ctx());
    this.log('Game started');
    return this.state;
  }

  /* --------------------------- actions --------------------------- */

  /**
   * Apply a player's action. Never throws: returns {ok, error} so the caller
   * can relay a friendly message back over the wire.
   */
  dispatch(playerId, action) {
    try {
      if (this.state.phase !== 'playing') {
        throw new IllegalAction('The game is not in progress');
      }
      const player = this.getPlayer(playerId);
      if (!player) throw new IllegalAction('You are not in this game');
      if (!action || typeof action.type !== 'string') {
        throw new IllegalAction('Malformed action');
      }

      this.rules.applyAction(this.state, player, action, this.ctx());

      const result = this.rules.isGameOver?.(this.state, this.ctx());
      if (result) {
        this.state.phase = 'over';
        this.state.result = result;
        this.state.turn = null;
        this.log(result.message || 'Game over');
      }
      return { ok: true };
    } catch (err) {
      if (err instanceof IllegalAction) return { ok: false, error: err.message };
      console.error('Engine error:', err);
      return { ok: false, error: 'Something went wrong applying that move' };
    }
  }

  /** Actions the rules module says this player may take right now. */
  legalActions(playerId) {
    if (this.state.phase !== 'playing') return [];
    const player = this.getPlayer(playerId);
    if (!player) return [];
    return this.rules.legalActions?.(this.state, player, this.ctx()) ?? [];
  }

  /* ------------------------ turn handling ------------------------ */

  /** Index of a player in seating order. */
  seatOf(playerId) {
    return this.state.players.findIndex((p) => p.id === playerId);
  }

  /**
   * Move play on by `steps` seats in the current direction, skipping anyone
   * who has disconnected. Returns the new current player's id.
   */
  advanceTurn(steps = 1) {
    const players = this.state.players;
    if (!players.length) return null;
    let index = this.seatOf(this.state.turn);
    if (index === -1) index = 0;
    for (let moved = 0; moved < steps; ) {
      index = (index + this.state.direction + players.length) % players.length;
      if (players[index].connected) moved++;
      else if (!players.some((p) => p.connected)) break;
    }
    this.state.turn = players[index].id;
    return this.state.turn;
  }

  reverseDirection() {
    this.state.direction *= -1;
  }

  /* --------------------------- the deck -------------------------- */

  /**
   * Draw `count` cards from the deck, reshuffling the discard pile back in if
   * the deck runs dry (the top discard is always left in place).
   */
  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (!this.state.deck.length) this.replenishDeck();
      if (!this.state.deck.length) break; // genuinely out of cards
      drawn.push(this.state.deck.pop());
    }
    return drawn;
  }

  replenishDeck() {
    if (this.state.discard.length <= 1) return;
    const top = this.state.discard.pop();
    this.state.deck = shuffle(this.state.discard, this.rng);
    this.state.discard = [top];
    this.log('Reshuffled the discard pile');
  }

  /** Deal `perPlayer` cards to every player, one card at a time, round-robin. */
  deal(perPlayer) {
    for (let i = 0; i < perPlayer; i++) {
      for (const player of this.state.players) {
        const [card] = this.draw(1);
        if (card) player.hand.push(card);
      }
    }
  }

  /* ---------------------------- logging -------------------------- */

  log(message) {
    this.state.log.push({ at: Date.now(), message });
    if (this.state.log.length > MAX_LOG) {
      this.state.log.splice(0, this.state.log.length - MAX_LOG);
    }
  }

  /* ----------------------------- views --------------------------- */

  /**
   * Build the version of the state that one player is allowed to see.
   *
   * This is the single most important security boundary in the app: the host's
   * tab holds every card, and only this function decides what leaves it. A
   * rules module can override it, but the default hides the deck contents and
   * every other player's hand.
   */
  viewFor(playerId) {
    if (this.rules.viewFor) return this.rules.viewFor(this.state, playerId, this.ctx());
    return defaultView(this.state, playerId, this.legalActions(playerId));
  }

  /** The helper bundle handed to every rules-module hook. */
  ctx() {
    if (!this._ctx) {
      this._ctx = {
        rng: () => this.rng(),
        shuffle: (arr) => shuffle(arr, this.rng),
        draw: (n) => this.draw(n),
        deal: (n) => this.deal(n),
        advanceTurn: (n) => this.advanceTurn(n),
        reverseDirection: () => this.reverseDirection(),
        replenishDeck: () => this.replenishDeck(),
        log: (msg) => this.log(msg),
        getPlayer: (id) => this.getPlayer(id),
        seatOf: (id) => this.seatOf(id),
        illegal: (msg) => {
          throw new IllegalAction(msg);
        },
      };
    }
    return this._ctx;
  }
}

/**
 * Default redaction. Your own hand comes through in full; everyone else's
 * becomes a count, and the draw pile becomes a count.
 */
export function defaultView(state, playerId, legalActions = []) {
  const you = state.players.find((p) => p.id === playerId) || null;
  return {
    phase: state.phase,
    ruleset: state.ruleset,
    // The host's clock, sent with every view so clients can correct for skew
    // and render a shared countdown that agrees across devices.
    now: Date.now(),
    round: state.round,
    turn: state.turn,
    direction: state.direction,
    yourTurn: state.turn === playerId,
    you: you
      ? { id: you.id, name: you.name, isHost: you.isHost, score: you.score, hand: clone(you.hand) }
      : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
      ready: p.ready,
      score: p.score,
      handCount: p.hand.length,
    })),
    deckCount: state.deck.length,
    discardTop: state.discard.length ? clone(state.discard[state.discard.length - 1]) : null,
    discardCount: state.discard.length,
    table: clone(state.table),
    vars: clone(state.vars),
    legalActions: clone(legalActions),
    log: state.log.slice(-40),
    result: clone(state.result),
  };
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

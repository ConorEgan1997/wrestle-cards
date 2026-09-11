/**
 * The wrestling night ruleset.
 *
 * How a night runs:
 *   - Everyone picks a wrestler in the lobby. A lot of Event Cards key off it.
 *   - Each player is dealt four Event Cards. These sit face-up for the table to
 *     see, because they are standing rules everyone has to be able to enforce
 *     ("drink when your wrestler is hit with a finisher"). Some are one-shots —
 *     No Sell, Rope Break, You Are Cursed — and are discarded when used.
 *   - On your turn you draw a Mini Game. The table plays it out loud, then
 *     somebody taps the outcome that happened.
 *
 * The app deliberately does NOT try to judge a naming game. It shows the card,
 * offers the outcomes printed on it, and turns whichever one a human taps into
 * a drink order with a shared countdown. That is why 124 distinct cards need no
 * per-card code: the outcomes live in the deck data (see tools/build-deck.py).
 */

import { shuffle } from '../engine.js';

const HAND_SIZE = 4;
const DOUBLE_MS = 5 * 60 * 1000; // Botchamania: five minutes of doubled drinks
const CURSE_COUNT = 3; // You Are Cursed: the next three punishments
const BOTCH_MULTIPLIER = 2; // call a card wrong and your drink doubles
const SWAP_SIP_SECONDS = 3; // the cost of binning a card you don't fancy

/** Filled in by loadDeck() before a game starts. */
let CARDS = [];

export async function loadDeck(url = 'cards/deck.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the deck (${response.status})`);
  CARDS = await response.json();
  return CARDS;
}

/** Used by the tests to inject a deck without a network fetch. */
export function setDeck(cards) {
  CARDS = cards;
}

export function deckLoaded() {
  return CARDS.length > 0;
}

/**
 * Every Event Card, for the guess box to complete against. The contents of the
 * pack are public knowledge — what's secret is which of them somebody holds —
 * so this is safe to hand every client.
 */
export function eventCardOptions() {
  return CARDS.filter((card) => card.deck === 'event')
    .map(({ id, title, text }) => ({ id, title, text }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/* ------------------------------------------------------------------ */

export const wrestling = {
  id: 'wrestling',
  name: 'Wrestling Night',
  blurb: 'Pick your wrestler, hold your Event Cards, draw a Mini Game each turn.',
  minPlayers: 2,
  maxPlayers: 10,
  profileFields: ['wrestler'],

  buildDeck() {
    if (!CARDS.length) throw new Error('The deck has not been loaded');
    return CARDS.filter((card) => card.deck === 'mini').map(clone);
  },

  setup(state, ctx) {
    const events = shuffle(CARDS.filter((card) => card.deck === 'event').map(clone), ctx.rng);

    for (const player of state.players) {
      player.hand = events.splice(0, HAND_SIZE);
      player.seconds = 0; // total time spent drinking
      player.downs = 0; // whole drinks downed
      player.wrestler = player.wrestler || '';
    }

    state.vars = {
      stage: 'draw',
      current: null, // { card, drawnBy, resolved }
      orders: [], // outstanding and completed drink orders
      eventPool: events, // what's left, for replacing one-shots
      eventDiscard: [],
      doubleUntil: {}, // playerId -> epoch ms
      cursed: {}, // playerId -> punishments remaining
      titleMatch: false,
      vote: null, // { orderTemplate, by, votes: {voterId: targetId} }
      houseRules: [], // created by WWE Champion
      swappedThisTurn: false, // one card swap per turn, and it costs a sip
      nextOrderId: 1,
      nextBatchId: 1,
    };

    ctx.log('Event Cards dealt. Pick your poison.');
  },

  /* ---------------------------------------------------------------- *
   * What each player may do right now
   * ---------------------------------------------------------------- */

  legalActions(state, player, ctx) {
    const v = state.vars;
    const actions = [];
    const isTurn = state.turn === player.id;

    if (v.vote) {
      if (!(player.id in v.vote.votes)) actions.push({ type: 'vote', label: 'Cast your vote' });
      return actions;
    }

    // A face-down card stops everything else until it is answered.
    if (v.pending) {
      if (v.pending.canCounter.includes(player.id) && !v.pending.responses[player.id]) {
        actions.push({ type: 'guessCard', label: 'Name the card' });
        actions.push({ type: 'acceptCard', label: 'Take it' });
      }
      if (v.pending.by === player.id || player.isHost) {
        actions.push({ type: 'revealCard', label: 'Turn it over' });
      }
      return actions;
    }

    if (isTurn && v.stage === 'draw') {
      actions.push({ type: 'draw', label: 'Draw a Mini Game' });
    }

    if (isTurn && v.stage === 'resolve' && v.current) {
      v.current.card.outcomes.forEach((outcome, index) => {
        actions.push({
          type: 'outcome',
          index,
          label: outcome.label,
          target: outcome.target,
          needs: outcome.target === 'choose' ? 1 : outcome.target === 'many' ? -1 : 0,
        });
      });
      actions.push({ type: 'endTurn', label: 'Next player' });
    }

    // Event Cards are reactive: they can be played on anyone's turn. Whoever
    // plays one always gets to say who it lands on, so every one of these
    // carries the card's natural target as a suggestion the picker starts on.
    //
    // Swapping is different — once per turn, on your own turn, and it costs a
    // sip. That's the price of not being stuck holding a card for an angle
    // that is never going to come up.
    const canSwap = isTurn && !v.swappedThisTurn;
    for (const card of player.hand) {
      card.outcomes.forEach((outcome, index) => {
        actions.push({
          type: 'playEvent',
          cardId: card.id,
          index,
          label: outcome.label,
          target: outcome.target,
          needs: -1,
          suggested: suggestedTargets(state, player, outcome.target),
        });
      });
      if (canSwap) {
        actions.push({
          type: 'swapCard',
          cardId: card.id,
          label: `Bin it and redraw — ${SWAP_SIP_SECONDS}s sip`,
        });
      }
    }

    // Anyone can hand out a drink at any time — the game has a dozen cards that
    // amount to "someone decides", and arguing with the app is no fun.
    actions.push({ type: 'give', label: 'Give out a drink' });

    // The clock: one action per batch, offered to whoever may run it.
    const batches = new Map();
    for (const order of v.orders) {
      if (order.doneAt) continue;
      if (!batches.has(order.batch)) batches.set(order.batch, []);
      batches.get(order.batch).push(order);
    }
    for (const [batch, orders] of batches) {
      const mayRun = player.isHost
        || orders.some((o) => o.from === player.id || o.playerId === player.id);
      if (!mayRun) continue;
      actions.push({
        type: orders.some((o) => o.startedAt) ? 'finishBatch' : 'startBatch',
        batch,
        label: orders.some((o) => o.startedAt) ? 'Done' : 'Start',
      });
    }

    if (player.isHost) {
      actions.push({ type: 'toggleTitleMatch', label: v.titleMatch ? 'Title match over' : 'Title match on' });
      actions.push({ type: 'endGame', label: 'End the night' });
    }
    return actions;
  },

  /* ---------------------------------------------------------------- *
   * Applying actions
   * ---------------------------------------------------------------- */

  applyAction(state, player, action, ctx) {
    const v = state.vars;

    /*
     * legalActions only tells the UI what to draw. This is the part that
     * actually holds: while a card is face down or the table is voting,
     * nothing else happens. Running the clock stays allowed throughout, so a
     * countdown already in flight can never get stranded behind a card.
     */
    const CLOCK = ['startBatch', 'finishBatch'];
    if (v.pending && ![...CLOCK, 'guessCard', 'acceptCard', 'revealCard'].includes(action.type)) {
      ctx.illegal('There is a card face down — that has to be answered first');
    }
    if (v.vote && ![...CLOCK, 'vote'].includes(action.type)) {
      ctx.illegal('The table is voting');
    }

    switch (action.type) {
      case 'draw': {
        requireTurn(state, player, ctx);
        if (v.stage !== 'draw') ctx.illegal('There is already a card in play');
        const [card] = ctx.draw(1);
        if (!card) ctx.illegal('The Mini Game deck is empty');
        v.current = { card, drawnBy: player.id, resolved: false };
        v.stage = 'resolve';
        ctx.log(`${player.name} drew ${card.title}`);
        return;
      }

      case 'outcome': {
        requireTurn(state, player, ctx);
        if (v.stage !== 'resolve' || !v.current) ctx.illegal('There is no card in play');
        const outcome = v.current.card.outcomes[action.index];
        if (!outcome) ctx.illegal('Unknown outcome');
        const before = v.nextBatchId;
        applyOutcome(state, player, outcome, action.targets, v.current.card.title, ctx);
        applyCardSideEffects(state, player, v.current.card, action, ctx);
        v.current.resolved = true;
        // Remember which countdown belongs to this card, so the turn can end
        // itself when that countdown runs out.
        if (v.nextBatchId > before) v.current.batch = before;
        return;
      }

      /*
       * Playing a card doesn't resolve it — it puts it face down on the table.
       * Whoever it is aimed at gets a shot at naming it first, and only then is
       * it turned over. That is why hands are secret now.
       */
      case 'playEvent': {
        if (v.pending) ctx.illegal('There is already a card on the table');
        const index = player.hand.findIndex((c) => c.id === action.cardId);
        if (index === -1) ctx.illegal('That card is not in your hand');
        const card = player.hand[index];
        const outcome = card.outcomes[action.index];
        if (!outcome) ctx.illegal('Unknown outcome');

        const targets = resolveTargets(
          state,
          player,
          Array.isArray(action.targets) && action.targets.length ? 'many' : outcome.target,
          action.targets,
          ctx,
        );

        // The card leaves the hand now, so it can't be played twice while the
        // table is deciding. It is replaced when the card is turned over.
        player.hand.splice(index, 1);

        v.pending = {
          by: player.id,
          byName: player.name,
          card: clone(card),
          outcomeIndex: action.index,
          rule: action.rule,
          targets: targets.map((t) => t.id),
          // You cannot counter your own card, so a card aimed only at yourself
          // resolves straight away.
          canCounter: targets.map((t) => t.id).filter((id) => id !== player.id),
          responses: {},
          at: Date.now(),
        };
        ctx.log(`${player.name} played a card face down`);

        if (!v.pending.canCounter.length) resolvePending(state, ctx);
        return;
      }

      case 'guessCard': {
        const p = v.pending;
        if (!p) ctx.illegal('There is no card to counter');
        if (!p.canCounter.includes(player.id)) ctx.illegal('That card is not aimed at you');
        if (p.responses[player.id]) ctx.illegal('You have already answered');

        const guessed = matchCard(action.guessId, action.guessText);
        const correct = !!guessed && guessed === p.card.id;
        p.responses[player.id] = { type: 'guess', guess: guessed, correct };
        ctx.log(correct
          ? `${player.name} called it`
          : `${player.name} guessed wrong`);

        if (correct || everyoneAnswered(p)) resolvePending(state, ctx);
        return;
      }

      case 'acceptCard': {
        const p = v.pending;
        if (!p) ctx.illegal('There is no card to accept');
        if (!p.canCounter.includes(player.id)) ctx.illegal('That card is not aimed at you');
        p.responses[player.id] = { type: 'accept' };
        if (everyoneAnswered(p)) resolvePending(state, ctx);
        return;
      }

      // For when somebody has put their phone down mid-guess.
      case 'revealCard': {
        const p = v.pending;
        if (!p) ctx.illegal('There is no card on the table');
        if (p.by !== player.id && !player.isHost) ctx.illegal('Only the player who played it can reveal it');
        resolvePending(state, ctx);
        return;
      }

      /*
       * Bin a card you don't fancy and take a fresh one. Once per turn, on
       * your own turn, for a three-second sip — cheap enough to be worth it
       * for a dead card, dear enough that you can't just cycle your whole hand.
       */
      case 'swapCard': {
        requireTurn(state, player, ctx);
        if (v.swappedThisTurn) ctx.illegal('You have already swapped a card this turn');

        const index = player.hand.findIndex((c) => c.id === action.cardId);
        if (index === -1) ctx.illegal('That card is not in your hand');

        const [card] = player.hand.splice(index, 1);
        v.eventDiscard.push(card);
        const replacement = drawEvent(state, ctx);
        if (replacement) player.hand.push(replacement);
        v.swappedThisTurn = true;

        addOrder(state, player, {
          batch: v.nextBatchId++,
          seconds: SWAP_SIP_SECONDS,
          label: 'Swapped a card',
          from: player.id,
        }, ctx);
        ctx.log(`${player.name} binned a card and took a fresh one`);
        return;
      }

      case 'give': {
        const targets = resolveTargets(state, player, 'many', action.targets, ctx);
        const seconds = clampSeconds(action.seconds);
        const batch = v.nextBatchId++;
        for (const target of targets) {
          addOrder(state, target, {
            batch,
            seconds: action.down ? null : seconds,
            down: !!action.down,
            label: action.label || `${player.name} handed out a drink`,
            from: player.id,
          }, ctx);
        }
        return;
      }

      // One play can put several people on the clock ("everyone drinks"), so
      // the table runs them as a single countdown rather than five.
      case 'startBatch': {
        const orders = findBatch(state, action.batch, ctx);
        requireController(orders, player, ctx);
        const at = Date.now();
        for (const order of orders) order.startedAt ??= at;
        return;
      }

      case 'finishBatch': {
        const orders = findBatch(state, action.batch, ctx);
        requireController(orders, player, ctx);
        for (const order of [...orders]) settleOrder(state, order, ctx);
        return;
      }

      case 'startOrder': {
        const order = findOrder(state, action.orderId, ctx);
        requireController([order], player, ctx);
        if (order.startedAt) ctx.illegal('Already started');
        order.startedAt = Date.now();
        return;
      }

      case 'finishOrder': {
        const order = findOrder(state, action.orderId, ctx);
        requireController([order], player, ctx);
        settleOrder(state, order, ctx);
        return;
      }

      case 'vote': {
        if (!v.vote) ctx.illegal('There is no vote running');
        const [target] = resolveTargets(state, player, 'choose', action.targets, ctx);
        v.vote.votes[player.id] = target.id;
        closeVoteIfDone(state, ctx);
        return;
      }

      case 'endTurn': {
        requireTurn(state, player, ctx);
        if (v.current && !v.current.resolved) {
          ctx.log(`${v.current.card.title} passed with no penalty`);
        }
        endTurn(state, ctx);
        return;
      }

      case 'toggleTitleMatch': {
        requireHost(player, ctx);
        v.titleMatch = !v.titleMatch;
        ctx.log(v.titleMatch ? 'Title match — penalties doubled' : 'Title match over');
        return;
      }

      case 'endGame': {
        requireHost(player, ctx);
        v.ended = true;
        return;
      }

      default:
        ctx.illegal(`Unknown action: ${action.type}`);
    }
  },

  isGameOver(state) {
    if (!state.vars.ended) return null;
    const ranked = [...state.players].sort(
      (a, b) => b.seconds + b.downs * 20 - (a.seconds + a.downs * 20),
    );
    return {
      winnerId: ranked.at(-1)?.id, // least punished survives the night
      message: 'That is a wrap.',
      scores: ranked.map((p) => ({
        id: p.id,
        name: p.name,
        wrestler: p.wrestler,
        seconds: p.seconds,
        downs: p.downs,
        points: p.seconds,
      })),
    };
  },

  /**
   * Hands are secret. They were public when Event Cards were permanent standing
   * rules the table had to enforce, but they are one-use plays now and a player
   * can try to name a card played at them — which would be no trick at all if
   * everyone could see what everyone was holding.
   *
   * The face-down card is secret too, right up until it is turned over.
   */
  viewFor(state, playerId, ctx) {
    const you = state.players.find((p) => p.id === playerId) || null;
    // This is called in the lobby too, before setup() has filled vars in, so
    // every field below has to tolerate an empty game.
    const v = state.vars || {};
    return {
      phase: state.phase,
      ruleset: state.ruleset,
      now: Date.now(),
      round: state.round,
      turn: state.turn,
      yourTurn: state.turn === playerId,
      you: you && {
        id: you.id,
        name: you.name,
        isHost: you.isHost,
        wrestler: you.wrestler,
        hand: clone(you.hand ?? []),
        seconds: you.seconds ?? 0,
        downs: you.downs ?? 0,
      },
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.connected,
        ready: p.ready,
        wrestler: p.wrestler || '',
        handCount: (p.hand ?? []).length,
        seconds: p.seconds ?? 0,
        downs: p.downs ?? 0,
        doubledUntil: v.doubleUntil?.[p.id] || 0,
        cursed: v.cursed?.[p.id] || 0,
      })),
      deckCount: state.deck.length,
      discardCount: state.discard.length,
      stage: v.stage ?? 'draw',
      current: clone(v.current ?? null),
      orders: clone((v.orders ?? []).filter((o) => !o.doneAt)),
      titleMatch: !!v.titleMatch,
      houseRules: clone(v.houseRules ?? []),
      vote: clone(v.vote ?? null),
      lastPlay: clone(v.lastPlay ?? null),
      canSwap: state.turn === playerId && !v.swappedThisTurn,
      pending: v.pending ? pendingView(v.pending, playerId) : null,
      eventsLeft: (v.eventPool?.length ?? 0) + (v.eventDiscard?.length ?? 0),
      // What this player may do, computed here so the UI never has to guess.
      // The host checks again when the action comes back, so this list is a
      // convenience for rendering and not a security boundary.
      legalActions: you && state.phase === 'playing' ? clone(wrestling.legalActions(state, you, ctx)) : [],
      log: state.log.slice(-40),
      result: clone(state.result),
    };
  },
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * What a given player may know about the card sitting face down. Nobody sees
 * the card itself — not even the targets, who are the ones guessing — only who
 * played it, who it is aimed at, and who has answered so far.
 */
function pendingView(pending, playerId) {
  const outcome = pending.card.outcomes[pending.outcomeIndex];
  return {
    by: pending.by,
    byName: pending.byName,
    /*
     * What's riding on it. Shown to everyone so a target can weigh a guess
     * against taking it — which is the whole point of the risk. It gives away
     * the size of the drink but not the card: 23 of the 48 Event Cards are a
     * three-second drink, so it narrows nothing down on its own.
     */
    stake: {
      seconds: outcome.seconds ?? null,
      down: !!outcome.down,
      stopwatch: !!outcome.stopwatch,
      botchMultiplier: BOTCH_MULTIPLIER,
    },
    targets: [...pending.targets],
    canCounter: [...pending.canCounter],
    youCanCounter: pending.canCounter.includes(playerId) && !pending.responses[playerId],
    answered: Object.fromEntries(
      Object.entries(pending.responses).map(([id, r]) => [id, r.type]),
    ),
    waitingOn: pending.canCounter.filter((id) => !pending.responses[id]),
    at: pending.at,
  };
}

function requireTurn(state, player, ctx) {
  if (state.turn !== player.id) ctx.illegal('It is not your turn');
}

function requireHost(player, ctx) {
  if (!player.isHost) ctx.illegal('Only the host can do that');
}

function findOrder(state, id, ctx) {
  const order = state.vars.orders.find((o) => o.id === id);
  if (!order) ctx.illegal('That drink is no longer outstanding');
  return order;
}

function findBatch(state, batch, ctx) {
  const orders = state.vars.orders.filter((o) => o.batch === batch && !o.doneAt);
  if (!orders.length) ctx.illegal('That drink is no longer outstanding');
  return orders;
}

/**
 * Who may work the clock.
 *
 * The player who dealt the drink out runs it — they drew the card, they know
 * when the room is actually ready. The people drinking can start it themselves
 * too, and the host can always close one out, so a dead phone never leaves the
 * table stuck waiting on a countdown nobody can press.
 */
function requireController(orders, player, ctx) {
  const allowed = player.isHost
    || orders.some((o) => o.from === player.id || o.playerId === player.id);
  if (!allowed) ctx.illegal('That drink is not yours to run');
}

function settleOrder(state, order, ctx) {
  if (order.doneAt) return;
  order.doneAt = Date.now();

  const drinker = ctx.getPlayer(order.playerId);
  if (drinker) {
    if (order.down) drinker.downs += 1;
    else drinker.seconds += order.seconds || 0;
  }
  // Settled orders leave the list entirely. The tally and the log are the
  // record; keeping them here would grow without bound over a long night.
  const v = state.vars;
  v.orders = v.orders.filter((o) => o.id !== order.id);

  // When the Mini Game's own countdown runs out, the turn is over — the table
  // shouldn't have to tap "next player" every single time.
  const current = v.current;
  if (current?.resolved && current.batch === order.batch
      && !v.orders.some((o) => o.batch === order.batch)) {
    endTurn(state, ctx);
  }
}

function endTurn(state, ctx) {
  const v = state.vars;
  if (v.current) state.discard.push(v.current.card);
  v.current = null;
  v.stage = 'draw';
  v.swappedThisTurn = false;
  state.round += 1;
  ctx.advanceTurn();
}

function clampSeconds(value) {
  const n = Math.round(Number(value) || 0);
  return Math.min(120, Math.max(0, n));
}

/**
 * Take the next Event Card for a hand, recycling the discard pile when the
 * fresh ones run out. Every play replaces a card now, so over a long night the
 * pool would otherwise empty and hands would quietly shrink.
 */
function drawEvent(state, ctx) {
  const v = state.vars;
  if (!v.eventPool.length && v.eventDiscard.length) {
    v.eventPool = ctx.shuffle(v.eventDiscard);
    v.eventDiscard = [];
    ctx.log('Reshuffled the Event Cards');
  }
  return v.eventPool.shift() || null;
}

/**
 * Who the card would hit if the player just accepts what it says. The picker
 * opens with these selected, so the common case is one tap.
 */
function suggestedTargets(state, actor, target) {
  if (target === 'choose' || target === 'many' || target === 'vote') return [];
  try {
    return resolveTargets(state, actor, target, [], {
      illegal: (msg) => {
        throw new Error(msg);
      },
    }).map((p) => p.id);
  } catch {
    return [];
  }
}

/**
 * Work out who an outcome lands on.
 *
 * 'left' is the next seat in the seating order and 'right' is the previous one.
 * Everyone sits in the order they joined, which the lobby shows, so the table
 * can agree on which way round it goes before anybody is drunk.
 */
function resolveTargets(state, actor, target, chosenIds, ctx) {
  const players = state.players.filter((p) => p.connected);
  const byId = (id) => state.players.find((p) => p.id === id);
  const seat = state.players.findIndex((p) => p.id === actor.id);
  const step = (n) => state.players[(seat + n + state.players.length) % state.players.length];

  switch (target) {
    case 'self':
      return [actor];
    case 'left':
      return [step(1)];
    case 'right':
      return [step(-1)];
    case 'selfright':
      return [actor, step(-1)];
    case 'all':
      return players;
    case 'others':
      return players.filter((p) => p.id !== actor.id);
    case 'vote':
      return []; // handled by the caller, which opens a vote instead
    case 'choose':
    case 'many': {
      const ids = Array.isArray(chosenIds) ? chosenIds : [];
      const picked = ids.map(byId).filter(Boolean);
      if (!picked.length) ctx.illegal('Pick who it lands on');
      if (target === 'choose' && picked.length > 1) ctx.illegal('Pick one player');
      return picked;
    }
    default:
      return [actor];
  }
}

/**
 * Apply an outcome and return the players it landed on.
 *
 * `allowOverride` is what lets an Event Card go wherever its holder points it:
 * if they picked names, those win over whatever the card prints. Mini Game
 * outcomes don't get that — "the person to your right drinks" means exactly
 * that, and letting the drawer redirect it would be cheating.
 */
function applyOutcome(
  state, actor, outcome, chosenIds, cardTitle, ctx,
  { allowOverride = false, penalties = null } = {},
) {
  const v = state.vars;
  const picked = Array.isArray(chosenIds) ? chosenIds.filter(Boolean) : [];

  if (outcome.target === 'vote' && !(allowOverride && picked.length)) {
    v.vote = { outcome: clone(outcome), by: actor.id, cardTitle, votes: {} };
    ctx.log(`${cardTitle}: the table votes`);
    return [];
  }

  const targets = allowOverride && picked.length
    ? resolveTargets(state, actor, 'many', picked, ctx)
    : resolveTargets(state, actor, outcome.target, chosenIds, ctx);

  // A note-only outcome (creating a house rule, declaring a tag partner) has no
  // drink attached; it just goes in the log so the table has a record.
  if (!outcome.seconds && !outcome.down && !outcome.stopwatch) {
    const who = targets.map((t) => t.name).join(', ');
    ctx.log(`${actor.name}: ${outcome.label}${who && who !== actor.name ? ` → ${who}` : ''}`);
    return targets;
  }

  // One batch per play, so several people going on the clock together share a
  // single countdown instead of each getting their own.
  const batch = v.nextBatchId++;
  for (const target of targets) {
    // A doubling only means anything on a timed drink — you can't down a can
    // twice — so a botched call on a "down your drink" card is recorded but
    // costs nothing extra.
    const multiplier = penalties?.[target.id] ?? 1;
    const doubled = multiplier > 1 && outcome.seconds;

    addOrder(state, target, {
      batch,
      seconds: outcome.seconds != null ? outcome.seconds * multiplier : null,
      down: !!outcome.down,
      stopwatch: !!outcome.stopwatch,
      label: `${cardTitle} — ${outcome.label}${doubled ? ' (botched counter, doubled)' : ''}`,
      from: actor.id,
    }, ctx);
  }
  return targets;
}

/**
 * Create a drink order, applying the multipliers that are in force.
 *
 * Botchamania doubles a player's drinks for five minutes; the Title Match
 * Penalty card doubles them whenever the host has flagged a title match. Both
 * can apply at once, which is the player's problem and not ours.
 */
function addOrder(state, target, spec, ctx) {
  const v = state.vars;
  let seconds = spec.seconds;
  const reasons = [];

  if (seconds) {
    if ((v.doubleUntil[target.id] || 0) > Date.now()) {
      seconds *= 2;
      reasons.push('Botchamania');
    }
    if (v.titleMatch && target.hand?.some((c) => c.id === 'event-51')) {
      seconds *= 2;
      reasons.push('title match');
    }
  }

  // A cursed player takes the next few punishments meant for anyone else.
  let playerId = target.id;
  const curseHolder = Object.keys(v.cursed).find((id) => v.cursed[id] > 0 && id !== target.id);
  if (curseHolder && spec.from !== curseHolder) {
    v.cursed[curseHolder] -= 1;
    if (v.cursed[curseHolder] <= 0) delete v.cursed[curseHolder];
    playerId = curseHolder;
    reasons.push('cursed');
  }

  const order = {
    id: v.nextOrderId++,
    batch: spec.batch ?? v.nextBatchId++,
    playerId,
    seconds: spec.down ? null : seconds,
    down: !!spec.down,
    stopwatch: !!spec.stopwatch,
    label: spec.label + (reasons.length ? ` (${reasons.join(' + ')})` : ''),
    from: spec.from,
    startedAt: null,
    doneAt: null,
  };
  v.orders.push(order);

  const name = ctx.getPlayer(playerId)?.name || 'Someone';
  const amount = order.down ? 'downs their drink' : order.stopwatch ? 'is on the clock' : `drinks ${order.seconds}s`;
  ctx.log(`${name} ${amount} — ${spec.label}`);
  return order;
}

function everyoneAnswered(pending) {
  return pending.canCounter.every((id) => pending.responses[id]);
}

/** Loose match so "no sell" finds NO SELL! whether picked from the list or typed. */
function matchCard(guessId, guessText) {
  if (guessId && CARDS.some((c) => c.id === guessId)) return guessId;

  const wanted = normalise(guessText);
  if (!wanted) return null;
  const hit = CARDS.find((c) => c.deck === 'event' && normalise(c.title) === wanted);
  return hit ? hit.id : null;
}

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Turn the face-down card over and apply it.
 *
 * A correct guess turns the card back on whoever played it — they get the
 * drink they were dishing out. Everything else lands as played.
 */
function resolvePending(state, ctx) {
  const v = state.vars;
  const p = v.pending;
  if (!p) return;

  const player = ctx.getPlayer(p.by);
  const card = p.card;
  const outcome = card.outcomes[p.outcomeIndex];

  const caller = p.canCounter
    .map((id) => ({ id, response: p.responses[id] }))
    .find((entry) => entry.response?.correct);

  const landsOn = caller ? [p.by] : p.targets;

  /*
   * A botched counter costs you. Calling the card wrong doubles your own
   * drink — that is the risk that makes guessing a decision rather than a
   * free roll. It only bites when the card actually lands on the targets: if
   * somebody else called it right, the whole table is off the hook.
   */
  const botched = {};
  if (!caller) {
    for (const id of p.canCounter) {
      if (p.responses[id]?.type === 'guess') botched[id] = BOTCH_MULTIPLIER;
    }
  }

  const hit = applyOutcome(state, player, outcome, landsOn, card.title, ctx, {
    allowOverride: true,
    penalties: botched,
  });
  applyCardSideEffects(state, player, card, { targets: landsOn, rule: p.rule }, ctx);

  // Only now does the card go to the discard and the hand get topped back up.
  v.eventDiscard.push(card);
  const replacement = drawEvent(state, ctx);
  if (replacement && player) player.hand.push(replacement);

  const callerName = caller ? ctx.getPlayer(caller.id)?.name : null;
  const botchedNames = Object.keys(botched).map((id) => ctx.getPlayer(id)?.name).filter(Boolean);

  v.lastPlay = {
    card: clone(card),
    by: p.byName,
    byId: p.by,
    outcome: outcome.label,
    targets: hit.map((t) => t.name),
    counteredBy: callerName,
    botched: botchedNames,
    at: Date.now(),
  };

  if (callerName) {
    ctx.log(`${callerName} called ${card.title} — it lands on ${p.byName}`);
  } else if (botchedNames.length) {
    ctx.log(`Botched counter: ${botchedNames.join(', ')} — ${card.title}, doubled`);
  } else {
    ctx.log(`${p.byName} played ${card.title}`);
  }

  v.pending = null;
}

/** The handful of Event Cards that change the state of the night, not just drinks. */
function applyCardSideEffects(state, player, card, action, ctx) {
  const v = state.vars;

  if (card.id === 'mini-68') {
    v.doubleUntil[player.id] = Date.now() + DOUBLE_MS;
    ctx.log(`${player.name} botched it — doubled drinks for five minutes`);
  }
  if (card.id === 'event-49') {
    const [target] = resolveTargets(state, player, 'choose', action.targets, ctx);
    v.cursed[target.id] = (v.cursed[target.id] || 0) + CURSE_COUNT;
    ctx.log(`${target.name} is cursed — next ${CURSE_COUNT} punishments are theirs`);
  }
  if (card.id === 'event-50' && action.rule) {
    const rule = String(action.rule).slice(0, 140).trim();
    if (rule) {
      v.houseRules.push({ by: player.name, rule });
      ctx.log(`House rule from ${player.name}: ${rule}`);
    }
  }
}

function closeVoteIfDone(state, ctx) {
  const v = state.vars;
  const voters = state.players.filter((p) => p.connected);
  if (Object.keys(v.vote.votes).length < voters.length) return;

  const tally = {};
  for (const targetId of Object.values(v.vote.votes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }
  const top = Math.max(...Object.values(tally));
  const winners = Object.keys(tally).filter((id) => tally[id] === top);

  const outcome = v.vote.outcome;
  const cardTitle = v.vote.cardTitle;
  const batch = v.nextBatchId++;
  for (const id of winners) {
    const target = state.players.find((p) => p.id === id);
    if (target) {
      addOrder(state, target, {
        batch,
        seconds: outcome.seconds,
        down: !!outcome.down,
        label: `${cardTitle} — voted for`,
        from: v.vote.by,
      }, ctx);
    }
  }
  v.vote = null;
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

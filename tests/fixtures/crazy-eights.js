/**
 * PLACEHOLDER RULESET — Crazy Eights.
 *
 * This exists so the whole stack is playable today and so every engine hook has
 * a worked example. When Conor's rules arrive, copy this file, change the body
 * of each hook, and register the new module in js/rules/index.js. Nothing in the
 * engine, the networking, or the UI needs to change.
 *
 * The five hooks, in the order the engine calls them:
 *
 *   buildDeck(ctx)                     -> array of cards
 *   setup(state, ctx)                  -> deal, seed the table, set state.vars
 *   legalActions(state, player, ctx)   -> what the UI offers this player
 *   applyAction(state, player, a, ctx) -> mutate state, or ctx.illegal('why')
 *   isGameOver(state, ctx)             -> falsy, or a result object
 */

import { standardDeck, SUITS } from '../../js/cards.js';

export const crazyEights = {
  id: 'crazy-eights',
  name: 'Crazy Eights',
  blurb: 'Match the suit or the rank. Eights are wild. First to empty their hand wins.',
  minPlayers: 2,
  maxPlayers: 6,

  buildDeck() {
    return standardDeck();
  },

  setup(state, ctx) {
    const perPlayer = state.players.length > 4 ? 5 : 7;
    ctx.deal(perPlayer);

    // Turn one card face up to start the discard pile. An eight as the first
    // card would leave the suit undefined, so keep drawing until it isn't one.
    let starter = ctx.draw(1)[0];
    while (starter && starter.rank === 8) {
      state.deck.unshift(starter); // bury it and try again
      starter = ctx.draw(1)[0];
    }
    state.discard.push(starter);
    state.vars.activeSuit = starter.suit;
    state.vars.drawnThisTurn = 0;
    ctx.log(`Starting card: ${describe(starter)}`);
  },

  legalActions(state, player, ctx) {
    if (state.turn !== player.id) return [];

    // An eight has been played and its owner must now name a suit.
    if (state.vars.awaitingSuit === player.id) {
      return Object.keys(SUITS).map((suit) => ({
        type: 'chooseSuit',
        suit,
        label: `Call ${suit}`,
      }));
    }

    const actions = player.hand
      .filter((card) => isPlayable(card, state))
      .map((card) => ({ type: 'play', cardId: card.id, label: `Play ${describe(card)}` }));

    if (state.vars.drawnThisTurn < 3 && (state.deck.length || state.discard.length > 1)) {
      actions.push({ type: 'draw', label: 'Draw a card' });
    }
    if (!actions.some((a) => a.type === 'play')) {
      actions.push({ type: 'pass', label: 'Pass' });
    }
    return actions;
  },

  applyAction(state, player, action, ctx) {
    if (state.turn !== player.id) ctx.illegal("It is not your turn");

    const pendingSuit = state.vars.awaitingSuit === player.id;
    if (pendingSuit && action.type !== 'chooseSuit') {
      ctx.illegal('Choose a suit first');
    }

    switch (action.type) {
      case 'play': {
        const index = player.hand.findIndex((c) => c.id === action.cardId);
        if (index === -1) ctx.illegal('That card is not in your hand');
        const card = player.hand[index];
        if (!isPlayable(card, state)) {
          ctx.illegal(`You cannot play ${describe(card)} on ${describe(top(state))}`);
        }

        player.hand.splice(index, 1);
        state.discard.push(card);
        state.vars.activeSuit = card.suit;
        state.vars.drawnThisTurn = 0;
        ctx.log(`${player.name} played ${describe(card)}`);

        if (player.hand.length === 0) return; // isGameOver picks this up

        if (card.rank === 8) {
          state.vars.awaitingSuit = player.id;
          ctx.log(`${player.name} is choosing a suit`);
          return; // turn stays put until the suit is named
        }
        ctx.advanceTurn();
        return;
      }

      case 'chooseSuit': {
        if (!pendingSuit) ctx.illegal('You are not choosing a suit');
        if (!SUITS[action.suit]) ctx.illegal('Unknown suit');
        state.vars.activeSuit = action.suit;
        delete state.vars.awaitingSuit;
        ctx.log(`${player.name} called ${action.suit}`);
        ctx.advanceTurn();
        return;
      }

      case 'draw': {
        if (state.vars.drawnThisTurn >= 3) ctx.illegal('You have drawn enough this turn');
        const [card] = ctx.draw(1);
        if (!card) ctx.illegal('There are no cards left to draw');
        player.hand.push(card);
        state.vars.drawnThisTurn = (state.vars.drawnThisTurn || 0) + 1;
        ctx.log(`${player.name} drew a card`);
        return;
      }

      case 'pass': {
        const playable = player.hand.some((card) => isPlayable(card, state));
        if (playable) ctx.illegal('You have a legal move, so you cannot pass');
        state.vars.drawnThisTurn = 0;
        ctx.log(`${player.name} passed`);
        ctx.advanceTurn();
        return;
      }

      default:
        ctx.illegal(`Unknown action: ${action.type}`);
    }
  },

  isGameOver(state) {
    const winner = state.players.find((p) => p.hand.length === 0);
    if (!winner) return null;
    return {
      winnerId: winner.id,
      message: `${winner.name} wins!`,
      scores: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        cardsLeft: p.hand.length,
        points: p.hand.reduce((sum, card) => sum + handValue(card), 0),
      })),
    };
  },
};

/* ------------------------------ helpers ------------------------------ */

function top(state) {
  return state.discard[state.discard.length - 1] || null;
}

function isPlayable(card, state) {
  if (card.rank === 8) return true; // eights are wild
  const target = top(state);
  if (!target) return true;
  return card.suit === state.vars.activeSuit || card.rank === target.rank;
}

function handValue(card) {
  if (card.rank === 8) return 50;
  if (card.rank > 10) return 10;
  if (card.rank === 1) return 1;
  return card.rank;
}

function describe(card) {
  if (!card) return 'nothing';
  const symbol = card.suit ? SUITS[card.suit]?.symbol ?? card.suit : '';
  return `${card.label}${symbol}`;
}

import test from 'node:test';
import assert from 'node:assert/strict';

import { GameEngine, makeRng, shuffle } from '../js/engine.js';
import { crazyEights } from './fixtures/crazy-eights.js';
import { standardDeck, deckFromSpec } from '../js/cards.js';

function newGame({ players = ['Ann', 'Bob'], seed = 12345 } = {}) {
  const engine = new GameEngine(crazyEights, { seed });
  players.forEach((name, i) => {
    engine.addPlayer({ id: `p${i}`, name, isHost: i === 0 });
    engine.setReady(`p${i}`, true);
  });
  return engine;
}

/* ----------------------------- primitives ----------------------------- */

test('the deck is a full, unique 52 cards', () => {
  const deck = standardDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test('deckFromSpec expands copies into unique ids', () => {
  const deck = deckFromSpec([{ label: 'Fire', copies: 3 }, { label: 'Water', copies: 2 }]);
  assert.equal(deck.length, 5);
  assert.equal(new Set(deck.map((c) => c.id)).size, 5);
});

test('shuffling is deterministic for a given seed', () => {
  const a = shuffle(standardDeck(), makeRng(7)).map((c) => c.id);
  const b = shuffle(standardDeck(), makeRng(7)).map((c) => c.id);
  const c = shuffle(standardDeck(), makeRng(8)).map((c) => c.id);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

/* ------------------------------- lobby -------------------------------- */

test('canStart requires the minimum players, all ready', () => {
  const engine = new GameEngine(crazyEights);
  engine.addPlayer({ id: 'p0', name: 'Ann' });
  assert.equal(engine.canStart(), false, 'one player is not enough');

  engine.addPlayer({ id: 'p1', name: 'Bob' });
  assert.equal(engine.canStart(), false, 'nobody is ready yet');

  engine.setReady('p0', true);
  engine.setReady('p1', true);
  assert.equal(engine.canStart(), true);
});

test('players cannot join a game in progress', () => {
  const engine = newGame();
  engine.start();
  assert.throws(() => engine.addPlayer({ id: 'late', name: 'Late' }), /already started/i);
});

test('rejoining with the same id restores the seat and hand', () => {
  const engine = newGame();
  engine.start();
  const before = engine.getPlayer('p1').hand.length;

  engine.dropPlayer('p1');
  assert.equal(engine.getPlayer('p1').connected, false);
  assert.equal(engine.getPlayer('p1').hand.length, before, 'hand is held for them');

  engine.addPlayer({ id: 'p1', name: 'Bob' });
  assert.equal(engine.getPlayer('p1').connected, true);
  assert.equal(engine.getPlayer('p1').hand.length, before);
});

/* ------------------------------- dealing ------------------------------ */

test('starting deals seven cards each and turns one card up', () => {
  const engine = newGame();
  engine.start();
  const { state } = engine;

  assert.equal(state.phase, 'playing');
  for (const player of state.players) assert.equal(player.hand.length, 7);
  assert.equal(state.discard.length, 1);
  assert.notEqual(state.discard[0].rank, 8, 'an eight is never the starting card');
  assert.equal(state.deck.length + 14 + 1, 52, 'every card is accounted for');
});

/* --------------------------- hidden information ----------------------- */

test('a view never contains another player-s cards or the deck order', () => {
  const engine = newGame({ players: ['Ann', 'Bob', 'Cat'] });
  engine.start();
  const view = engine.viewFor('p0');

  assert.equal(view.you.hand.length, 7, 'you can see your own hand');
  assert.equal(view.deckCount, engine.state.deck.length);
  assert.equal(view.deck, undefined, 'the draw pile order is not sent');

  for (const player of view.players) {
    assert.equal(player.hand, undefined, 'other hands are counts only');
    assert.equal(typeof player.handCount, 'number');
  }

  // Belt and braces: no id from another player's hand appears anywhere in the
  // serialised view. This is the check that would catch a careless change.
  const serialised = JSON.stringify(view);
  const theirCards = engine.state.players
    .filter((p) => p.id !== 'p0')
    .flatMap((p) => p.hand.map((c) => c.id));
  const topId = engine.state.discard.at(-1).id;
  for (const id of theirCards) {
    if (id === topId) continue;
    assert.ok(!serialised.includes(`"${id}"`), `leaked card ${id}`);
  }
});

/* ------------------------------- play --------------------------------- */

test('a player cannot move out of turn', () => {
  const engine = newGame();
  engine.start();
  const result = engine.dispatch('p1', { type: 'draw' });
  assert.equal(result.ok, false);
  assert.match(result.error, /not your turn/i);
});

test('an illegal card is rejected with a readable reason', () => {
  const engine = newGame();
  engine.start();
  const state = engine.state;
  state.discard = [{ id: 'S5', suit: 'spades', rank: 5, label: '5' }];
  state.vars.activeSuit = 'spades';
  state.players[0].hand = [{ id: 'H9', suit: 'hearts', rank: 9, label: '9' }];

  const result = engine.dispatch('p0', { type: 'play', cardId: 'H9' });
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot play/i);
});

test('a matching card plays and passes the turn on', () => {
  const engine = newGame();
  engine.start();
  const state = engine.state;
  state.discard = [{ id: 'S5', suit: 'spades', rank: 5, label: '5' }];
  state.vars.activeSuit = 'spades';
  // Two cards, so emptying the hand doesn't end the game before we can look.
  state.players[0].hand = [
    { id: 'S9', suit: 'spades', rank: 9, label: '9' },
    { id: 'D4', suit: 'diamonds', rank: 4, label: '4' },
  ];

  const result = engine.dispatch('p0', { type: 'play', cardId: 'S9' });
  assert.equal(result.ok, true);
  assert.equal(state.discard.at(-1).id, 'S9');
  assert.equal(state.turn, 'p1', 'play moved to the next seat');
  assert.equal(state.players[0].hand.length, 1);
  assert.equal(state.phase, 'playing');
});

test('a card you do not hold cannot be played', () => {
  const engine = newGame();
  engine.start();
  const result = engine.dispatch('p0', { type: 'play', cardId: 'NOT-A-CARD' });
  assert.equal(result.ok, false);
  assert.match(result.error, /not in your hand/i);
});

test('playing an eight holds the turn until a suit is named', () => {
  const engine = newGame();
  engine.start();
  const state = engine.state;
  state.discard = [{ id: 'S5', suit: 'spades', rank: 5, label: '5' }];
  state.vars.activeSuit = 'spades';
  state.players[0].hand = [
    { id: 'H8', suit: 'hearts', rank: 8, label: '8' },
    { id: 'D2', suit: 'diamonds', rank: 2, label: '2' },
  ];

  assert.equal(engine.dispatch('p0', { type: 'play', cardId: 'H8' }).ok, true);
  assert.equal(state.turn, 'p0', 'the turn has not moved on yet');
  assert.equal(state.vars.awaitingSuit, 'p0');

  const options = engine.legalActions('p0');
  assert.equal(options.length, 4);
  assert.ok(options.every((a) => a.type === 'chooseSuit'));

  assert.equal(engine.dispatch('p0', { type: 'chooseSuit', suit: 'clubs' }).ok, true);
  assert.equal(state.vars.activeSuit, 'clubs');
  assert.equal(state.turn, 'p1');
});

test('you cannot pass while you hold a legal move', () => {
  const engine = newGame();
  engine.start();
  const state = engine.state;
  state.discard = [{ id: 'S5', suit: 'spades', rank: 5, label: '5' }];
  state.vars.activeSuit = 'spades';
  state.players[0].hand = [{ id: 'S9', suit: 'spades', rank: 9, label: '9' }];

  const result = engine.dispatch('p0', { type: 'pass' });
  assert.equal(result.ok, false);
  assert.match(result.error, /legal move/i);
});

test('drawing is capped at three cards per turn', () => {
  const engine = newGame();
  engine.start();
  const state = engine.state;
  state.discard = [{ id: 'S5', suit: 'spades', rank: 5, label: '5' }];
  state.vars.activeSuit = 'spades';
  state.players[0].hand = [];

  for (let i = 0; i < 3; i++) {
    assert.equal(engine.dispatch('p0', { type: 'draw' }).ok, true, `draw ${i + 1}`);
  }
  const fourth = engine.dispatch('p0', { type: 'draw' });
  assert.equal(fourth.ok, false);
  assert.ok(!engine.legalActions('p0').some((a) => a.type === 'draw'));
});

/* ---------------------------- turn order ------------------------------ */

test('turn order skips disconnected players', () => {
  const engine = newGame({ players: ['Ann', 'Bob', 'Cat'] });
  engine.start();
  engine.state.players[1].connected = false;

  engine.state.turn = 'p0';
  assert.equal(engine.advanceTurn(), 'p2', 'Bob is skipped');
});

test('direction reverses the seating order', () => {
  const engine = newGame({ players: ['Ann', 'Bob', 'Cat'] });
  engine.start();
  engine.state.turn = 'p0';
  engine.reverseDirection();
  assert.equal(engine.advanceTurn(), 'p2');
});

/* ------------------------------ the deck ------------------------------ */

test('the discard pile is recycled when the deck runs out', () => {
  const engine = newGame();
  engine.start();
  const state = engine.state;

  // Move everything to the discard pile except one card.
  state.discard.push(...state.deck.splice(0, state.deck.length - 1));
  const discardBefore = state.discard.length;

  engine.draw(1); // the last real card
  const drawn = engine.draw(1); // forces a reshuffle

  assert.equal(drawn.length, 1, 'a card came back after the reshuffle');
  assert.equal(state.discard.length, 1, 'only the top card stays on the discard pile');
  assert.ok(state.deck.length > 0 && state.deck.length < discardBefore);
});

/* ------------------------------ game over ----------------------------- */

test('emptying your hand ends the game and scores the rest', () => {
  const engine = newGame();
  engine.start();
  const state = engine.state;
  state.discard = [{ id: 'S5', suit: 'spades', rank: 5, label: '5' }];
  state.vars.activeSuit = 'spades';
  state.players[0].hand = [{ id: 'S9', suit: 'spades', rank: 9, label: '9' }];
  state.players[1].hand = [
    { id: 'D8', suit: 'diamonds', rank: 8, label: '8' },
    { id: 'CK', suit: 'clubs', rank: 13, label: 'K' },
  ];

  engine.dispatch('p0', { type: 'play', cardId: 'S9' });

  assert.equal(state.phase, 'over');
  assert.equal(state.result.winnerId, 'p0');
  assert.equal(state.turn, null);

  const bob = state.result.scores.find((s) => s.id === 'p1');
  assert.equal(bob.points, 60, 'an eight is 50 and a king is 10');
  assert.equal(engine.dispatch('p0', { type: 'draw' }).ok, false, 'no play after the end');
});

/* --------------------------- a whole game ----------------------------- */

test('a full game plays to a winner without deadlocking', () => {
  const engine = newGame({ players: ['Ann', 'Bob', 'Cat'], seed: 99 });
  engine.start();

  let moves = 0;
  while (engine.state.phase === 'playing' && moves < 5000) {
    const current = engine.state.turn;
    const options = engine.legalActions(current);
    assert.ok(options.length > 0, `player ${current} has no legal move`);

    // Prefer playing a card so the game actually progresses.
    const choice = options.find((a) => a.type === 'play') ?? options[0];
    const result = engine.dispatch(current, choice);
    assert.ok(result.ok, `move rejected: ${result.error}`);
    moves++;
  }

  assert.equal(engine.state.phase, 'over', `game did not finish in ${moves} moves`);
  assert.ok(engine.state.result.winnerId);
});

/**
 * The wrestling ruleset: dealing, turns, drink orders, multipliers and the
 * handful of cards that change the state of the night.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GameEngine } from '../js/engine.js';
import {
  wrestling, setDeck, sipsFor, eventCardOptions, INTENSITY, DEFAULT_SETTINGS,
} from '../js/rules/wrestling.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
setDeck(JSON.parse(readFileSync(`${ROOT}cards/deck.json`, 'utf8')));

function newGame({ players = ['Ann', 'Bob', 'Cat'], seed = 4242, settings } = {}) {
  const engine = new GameEngine(wrestling, { seed });
  players.forEach((name, i) => {
    engine.addPlayer({ id: `p${i}`, name, isHost: i === 0 });
    engine.setProfile(`p${i}`, { wrestler: `${name}'s guy` });
    engine.setReady(`p${i}`, true);
  });
  if (settings) engine.setSettings(settings);
  engine.start();
  return engine;
}

/**
 * Give a player a specific card, for testing one card in isolation.
 *
 * It first strips that card from everywhere else — other hands, the pool, the
 * discard — so exactly one copy is in play. Without that, a test can pass on a
 * duplicate: the card gets played and removed, and a second copy is still
 * sitting there looking like the card was kept.
 */
function giveCard(engine, playerId, cardId) {
  const v = engine.state.vars;
  for (const p of engine.state.players) p.hand = p.hand.filter((c) => c.id !== cardId);
  v.eventPool = v.eventPool.filter((c) => c.id !== cardId);
  v.eventDiscard = v.eventDiscard.filter((c) => c.id !== cardId);

  const card = deckCard(cardId);
  engine.getPlayer(playerId).hand.push(card);
  return card;
}

const ok = (result) => {
  assert.equal(result.ok, true, result.error);
  return result;
};

/**
 * Play a card and see it through to resolution.
 *
 * A played card now sits face down until its targets answer, so almost every
 * test needs the second half of that exchange. By default the targets take it
 * on the chin; pass `guessBy`/`guess` to have one of them name it instead.
 */
function playCard(engine, playerId, cardId, { index = 0, targets, guessBy, guess } = {}) {
  ok(engine.dispatch(playerId, { type: 'playEvent', cardId, index, targets }));

  const pending = engine.state.vars.pending;
  if (!pending) return; // aimed only at the player themselves — resolves at once
  const canCounter = [...pending.canCounter];

  if (guessBy) {
    ok(engine.dispatch(guessBy, { type: 'guessCard', guessId: guess }));
  }
  for (const id of canCounter) {
    if (!engine.state.vars.pending) break;
    if (engine.state.vars.pending.responses[id]) continue;
    ok(engine.dispatch(id, { type: 'acceptCard' }));
  }
  assert.equal(engine.state.vars.pending, null, 'the card should have been turned over');
}

/* ------------------------------- setup -------------------------------- */

test('setup deals four holdable cards each and stacks the Mini Games', () => {
  const engine = newGame();
  const { state } = engine;

  for (const player of state.players) {
    assert.equal(player.hand.length, 4);
    assert.ok(player.hand.every((c) => c.pile === 'hand'), 'only cards you hold');
    assert.equal(player.seconds, 0);
    assert.equal(player.downs, 0);
  }
  assert.equal(state.deck.length, 430, 'the whole Mini Game pack is the draw pile');
  assert.ok(state.deck.every((c) => c.kind === 'mini'));
  assert.equal(state.vars.stage, 'draw');
});

test('the hand is dealt from Event, PPV and Private cards, not Mini Games', () => {
  const engine = newGame({ players: ['A', 'B', 'C', 'D', 'E', 'F'] });
  const kinds = new Set(engine.state.players.flatMap((p) => p.hand.map((c) => c.kind)));
  for (const k of kinds) {
    assert.ok(['event', 'ppv', 'private'].includes(k), `${k} should not be held`);
  }
  assert.ok(
    engine.state.vars.eventPool.length + 24 === 156,
    'all 156 holdable cards are in play, dealt or waiting',
  );
});

test('Money in the Bank cards only appear when the option is on', () => {
  const off = newGame();
  const inPlayOff = [
    ...off.state.vars.eventPool,
    ...off.state.players.flatMap((p) => p.hand),
  ];
  assert.ok(!inPlayOff.some((c) => c.kind === 'mitb'), 'off by default');
  assert.equal(inPlayOff.length, 156);

  const on = newGame({ settings: { mitb: 'on' } });
  const inPlayOn = [
    ...on.state.vars.eventPool,
    ...on.state.players.flatMap((p) => p.hand),
  ];
  assert.equal(inPlayOn.length, 172, 'the 16 MITB cards join the hand pack');
  assert.ok(inPlayOn.some((c) => c.kind === 'mitb'));
  // The draw pile is untouched either way — MITB cards are held, not drawn.
  assert.equal(on.state.deck.length, 430);
});

test('nobody is dealt the same Event Card as anybody else', () => {
  const engine = newGame({ players: ['A', 'B', 'C', 'D', 'E'] });
  const dealt = engine.state.players.flatMap((p) => p.hand.map((c) => c.id));
  assert.equal(new Set(dealt).size, dealt.length);
});

test('the wrestler chosen in the lobby survives the start', () => {
  const engine = newGame();
  assert.equal(engine.getPlayer('p1').wrestler, "Bob's guy");
});

test('setProfile only writes fields the ruleset allows', () => {
  const engine = newGame();
  engine.setProfile('p0', { wrestler: 'Kane', isHost: false, seconds: 9999 });
  const player = engine.getPlayer('p0');
  assert.equal(player.wrestler, 'Kane');
  assert.equal(player.isHost, true, 'isHost is not a profile field');
  assert.equal(player.seconds, 0, 'score is not a profile field');
});

/* ------------------------------- turns -------------------------------- */

test('only the player whose turn it is can draw', () => {
  const engine = newGame();
  const wrong = engine.dispatch('p1', { type: 'draw' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /not your turn/i);

  ok(engine.dispatch('p0', { type: 'draw' }));
  assert.equal(engine.state.vars.stage, 'resolve');
  assert.equal(engine.state.vars.current.card.deck, 'mini');
});

test('you cannot draw twice in a turn', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  const again = engine.dispatch('p0', { type: 'draw' });
  assert.equal(again.ok, false);
  assert.match(again.error, /already a card in play/i);
});

test('ending the turn discards the card and moves on', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  ok(engine.dispatch('p0', { type: 'endTurn' }));

  assert.equal(engine.state.turn, 'p1');
  assert.equal(engine.state.vars.stage, 'draw');
  assert.equal(engine.state.vars.current, null);
  assert.equal(engine.state.discard.length, 1);
  assert.equal(engine.state.deck.length, 429);
});

/* ------------------------------ outcomes ------------------------------ */

test('an outcome that lands on you creates a drink for you', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  // Card 47 "You're Fired!" — whoever draws it drinks 5s.
  engine.state.vars.current.card = deckCard('mini-47');

  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));
  const orders = engine.state.vars.orders;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].playerId, 'p0');
  assert.equal(orders[0].seconds, 5);
});

test('left and right are worked out from the seating, not asked about', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-39'); // Count Out: person to your right

  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));
  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.playerId, 'p2', 'right of the first seat wraps to the last');
  assert.equal(order.seconds, 10);
});

test('an outcome needing a target is refused without one', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-17'); // pick any player

  const bad = engine.dispatch('p0', { type: 'outcome', index: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /pick who/i);

  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p2'] }));
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p2');
});

test('a "choose one" outcome refuses a handful of targets', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-17');

  const bad = engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p1', 'p2'] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /pick one/i);
});

test('an "everyone" outcome hits the whole table', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-18'); // Danhausen — everyone drinks
  playCard(engine, 'p0', 'event-18');
  assert.equal(engine.state.vars.orders.length, 3);
});

/* --------------------------- drinking flow ---------------------------- */

test('a drink is only scored once it has been started and finished', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-47');
  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));

  const id = engine.state.vars.orders[0].id;
  assert.equal(engine.getPlayer('p0').seconds, 0, 'nothing counted yet');

  ok(engine.dispatch('p0', { type: 'startOrder', orderId: id }));
  assert.ok(engine.state.vars.orders[0].startedAt);
  assert.equal(engine.getPlayer('p0').seconds, 0, 'still nothing until done');

  ok(engine.dispatch('p0', { type: 'finishOrder', orderId: id }));
  assert.equal(engine.getPlayer('p0').seconds, 5);
});

test('you cannot drink somebody else-s drink, but the host can close it out', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-17');
  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p2'] }));
  const id = engine.state.vars.orders[0].id;

  const nope = engine.dispatch('p1', { type: 'startOrder', orderId: id });
  assert.equal(nope.ok, false);
  assert.match(nope.error, /not yours/i);

  // p0 is the host — for when someone's phone dies mid-countdown.
  ok(engine.dispatch('p0', { type: 'finishOrder', orderId: id }));
  assert.equal(engine.getPlayer('p2').seconds, 5);
});

test('downing a drink is counted separately from seconds', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-15'); // Bladed — down your drink
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-15', index: 0 }));

  const id = engine.state.vars.orders[0].id;
  assert.equal(engine.state.vars.orders[0].down, true);
  ok(engine.dispatch('p0', { type: 'finishOrder', orderId: id }));

  assert.equal(engine.getPlayer('p0').downs, 1);
  assert.equal(engine.getPlayer('p0').seconds, 0);
});

/* ---------------------------- Event Cards ----------------------------- */

test('Event Cards can be played on anybody-s turn', () => {
  const engine = newGame();
  engine.state.turn = 'p2';
  giveCard(engine, 'p1', 'event-09'); // Heel Turn — I drink 5s
  ok(engine.dispatch('p1', { type: 'playEvent', cardId: 'event-09', index: 0 }));
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p1');
});

test('every played card leaves the hand and is replaced', () => {
  const engine = newGame();
  const player = engine.getPlayer('p0');

  for (const id of ['event-48', 'event-09']) {
    giveCard(engine, 'p0', id);
    const sizeBefore = player.hand.length;

    playCard(engine, 'p0', id, { targets: ['p1'] });

    assert.ok(!player.hand.some((c) => c.id === id), `${id} was used up`);
    assert.equal(player.hand.length, sizeBefore, `${id} was replaced`);
    assert.ok(engine.state.vars.eventDiscard.some((c) => c.id === id), `${id} went to the discard`);
  }
});

test('hands stay at four cards however much gets played', () => {
  const engine = newGame({ players: ['Ann', 'Bob', 'Cat', 'Dee', 'Eve'] });

  for (let i = 0; i < 60; i++) {
    const player = engine.state.players[i % engine.state.players.length];
    const move = engine.legalActions(player.id).find((a) => a.type === 'playEvent');
    playCard(engine, player.id, move.cardId, {
      index: move.index,
      targets: [engine.state.players[(i + 1) % engine.state.players.length].id],
    });
    for (const p of engine.state.players) {
      assert.equal(p.hand.length, 4, `${p.name} went short after ${i + 1} plays`);
    }
  }
});

test('the Event pack recycles when it runs out', () => {
  const engine = newGame();
  const v = engine.state.vars;
  v.eventPool = []; // everything already dealt or discarded
  v.eventDiscard = [deckCard('event-33'), deckCard('event-34')];

  giveCard(engine, 'p0', 'event-09');
  const before = engine.getPlayer('p0').hand.length;
  playCard(engine, 'p0', 'event-09', { targets: ['p1'] });

  assert.equal(engine.getPlayer('p0').hand.length, before, 'still got a replacement');
  assert.ok(engine.state.log.some((l) => /Reshuffled the Event Cards/.test(l.message)));
});

test('an Event Card goes wherever its holder points it', () => {
  const engine = newGame();
  // Card 9 is printed as "I drink 5s" — the holder redirects it at Cat.
  giveCard(engine, 'p0', 'event-09');
  playCard(engine, 'p0', 'event-09', { targets: ['p2'] });

  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.playerId, 'p2', 'landed on the chosen player, not the printed one');
  assert.equal(order.seconds, 5);
});

test('a Mini Game outcome cannot be redirected', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-39'); // person to your right

  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p1'] }));
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p2', 'seating wins over the request');
});

test('playing a card is announced to the whole lobby', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24'); // Heel Turn — pick someone to drink 3s
  playCard(engine, 'p0', 'event-24', { targets: ['p2'] });

  for (const watcher of ['p0', 'p1', 'p2']) {
    const play = engine.viewFor(watcher).lastPlay;
    assert.ok(play, `${watcher} did not see the play`);
    assert.equal(play.by, 'Ann');
    assert.equal(play.card.title, 'Heel Turn');
    assert.deepEqual(play.targets, ['Cat']);
    assert.ok(play.card.image, 'the art comes with it, for the banner');
    assert.ok(Date.now() - play.at < 1000);
  }
});

test('the suggested target is the card-s printed one, ready to accept', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-09'); // "I drink 5s" -> suggests yourself
  const mine = engine.legalActions('p0').find((a) => a.cardId === 'event-09');
  assert.deepEqual(mine.suggested, ['p0']);

  giveCard(engine, 'p0', 'event-18'); // Danhausen — everyone drinks
  const all = engine.legalActions('p0').find((a) => a.cardId === 'event-18');
  assert.deepEqual(all.suggested.sort(), ['p0', 'p1', 'p2']);

  giveCard(engine, 'p0', 'event-24'); // pick a player -> nothing to suggest
  const pick = engine.legalActions('p0').find((a) => a.cardId === 'event-24');
  assert.deepEqual(pick.suggested, []);
});

test('you cannot play a card you do not hold', () => {
  const engine = newGame();
  const bad = engine.dispatch('p0', { type: 'playEvent', cardId: 'event-48', index: 0 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /not in your hand/i);
});

/* ---------------------------- multipliers ----------------------------- */

test('Botchamania doubles that player-s drinks for five minutes', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-68'); // Botchamania
  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));
  assert.ok(engine.state.vars.doubleUntil.p0 > Date.now());

  ok(engine.dispatch('p0', { type: 'endTurn' }));
  engine.state.turn = 'p0';
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-47'); // 5s on the drawer
  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));

  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.seconds, 10, 'doubled');
  assert.match(order.label, /Botchamania/);
});

test('the doubling expires', () => {
  const engine = newGame();
  engine.state.vars.doubleUntil.p0 = Date.now() - 1000; // already lapsed
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-47');
  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));
  assert.equal(engine.state.vars.orders.at(-1).seconds, 5);
});

test('the Title Match Penalty card only bites during a title match', () => {
  const engine = newGame();
  giveCard(engine, 'p1', 'event-51');

  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-17'); // pick a player, 5s
  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p1'] }));
  assert.equal(engine.state.vars.orders.at(-1).seconds, 5, 'no title match yet');

  ok(engine.dispatch('p0', { type: 'toggleTitleMatch' }));
  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p1'] }));
  assert.equal(engine.state.vars.orders.at(-1).seconds, 10, 'doubled during a title match');

  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p2'] }));
  assert.equal(engine.state.vars.orders.at(-1).seconds, 5, 'only the card holder');
});

test('only the host can flag a title match or end the night', () => {
  const engine = newGame();
  for (const type of ['toggleTitleMatch', 'endGame']) {
    const bad = engine.dispatch('p1', { type });
    assert.equal(bad.ok, false, type);
    assert.match(bad.error, /only the host/i);
  }
});

/* ------------------------------- curse -------------------------------- */

test('a cursed player takes the next punishments meant for other people', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-49'); // You Are Cursed
  playCard(engine, 'p0', 'event-49', { targets: ['p2'] });
  assert.equal(engine.state.vars.cursed.p2, 3);

  // A drink aimed at p1 lands on the cursed p2 instead.
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-17');
  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p1'] }));

  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.playerId, 'p2');
  assert.match(order.label, /cursed/);
  assert.equal(engine.state.vars.cursed.p2, 2, 'one of the three used up');
});

/* ------------------------------ settings ------------------------------ */

test('a fresh game uses the default options', () => {
  const engine = newGame();
  assert.deepEqual(engine.state.settings, DEFAULT_SETTINGS);
  assert.equal(engine.viewFor('p0').settings.intensity, 'main');
});

test('an unknown option, or an unknown value for a real one, is ignored', () => {
  const engine = new GameEngine(wrestling);
  engine.setSettings({ handSize: 99, intensity: 'nonsense', wibble: true });

  assert.equal(engine.state.settings.handSize, 4, 'out-of-range value refused');
  assert.equal(engine.state.settings.intensity, 'main', 'unknown value refused');
  assert.ok(!('wibble' in engine.state.settings), 'invented option refused');
});

test('options lock once the game has started', () => {
  const engine = newGame();
  assert.throws(() => engine.setSettings({ intensity: 'champion' }), /once the game starts/i);
  assert.equal(engine.state.settings.intensity, 'main');
});

test('intensity rescales the common drinks', () => {
  for (const [tier, band] of Object.entries(INTENSITY)) {
    const engine = newGame({ settings: { intensity: tier } });
    ok(engine.dispatch('p0', { type: 'draw' }));
    engine.state.vars.current.card = deckCard('mini-47'); // prints 5 seconds
    ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));

    assert.equal(engine.state.vars.orders.at(-1).seconds, band[5], `${tier}: a 5s card`);
  }
});

test('the two-second band the second pack is full of is rescaled too', () => {
  // 71 of the 590 timed outcomes print 2 seconds, nearly all of them from the
  // cards3.1 set. Leaving that band alone would have meant a Champion-tier
  // night where an eighth of the drinks were untouched.
  const twos = (card) => card.outcomes.some((o) => o.seconds === 2);
  const card = JSON.parse(readFileSync(`${ROOT}cards/deck.json`, 'utf8'))
    .filter((c) => c.pile === 'draw' && c.outcomes.length === 1)
    // A vote card hands the drink out later, once the table has voted, so it
    // would not tell us anything here.
    .find((c) => twos(c) && c.outcomes[0].target !== 'vote');
  assert.ok(card, 'sanity: the deck has 2-second cards');

  for (const [tier, band] of Object.entries(INTENSITY)) {
    const engine = newGame({ settings: { intensity: tier } });
    ok(engine.dispatch('p0', { type: 'draw' }));
    engine.state.vars.current.card = deckCard(card.id);
    const needs = ['choose', 'many'].includes(card.outcomes[0].target);
    ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: needs ? ['p1'] : undefined }));
    assert.equal(engine.state.vars.orders.at(-1).seconds, band[2], `${tier}: a 2s card`);
  }
});

test('a card with its own number keeps it, whatever the tier', () => {
  const engine = newGame({ settings: { intensity: 'champion' } });
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-30'); // the 28-second WrestleMania one
  ok(engine.dispatch('p0', { type: 'outcome', index: 0, targets: ['p1'] }));

  assert.equal(engine.state.vars.orders.at(-1).seconds, 28, 'the joke survives');
});

test('the stake shown for a face-down card is the scaled one', () => {
  const engine = newGame({ settings: { intensity: 'champion' } });
  giveCard(engine, 'p0', 'event-24'); // prints 3 seconds
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  assert.equal(engine.viewFor('p1').pending.stake.seconds, 3, 'the card still says 3');
  ok(engine.dispatch('p1', { type: 'acceptCard' }));
  assert.equal(engine.state.vars.orders.at(-1).seconds, 5, 'but champion makes it 5');
});

test('hand size is configurable', () => {
  for (const size of [3, 4, 5]) {
    const engine = newGame({ settings: { handSize: size } });
    for (const player of engine.state.players) {
      assert.equal(player.hand.length, size, `hand of ${size}`);
    }
  }
});

test('turning counters off resolves a card straight away', () => {
  const engine = newGame({ settings: { counters: 'off' } });
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  assert.equal(engine.state.vars.pending, null, 'no guessing window');
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p1');
  assert.ok(engine.state.vars.lastPlay, 'it still gets announced');
  assert.deepEqual(engine.legalActions('p1').filter((a) => a.type === 'guessCard'), []);
});

test('hardcore match turns some drinks into shots, and off means none', () => {
  const quiet = newGame({ settings: { hardcore: 0 } });
  const rowdy = newGame({ settings: { hardcore: 20 } });

  const run = (engine) => {
    let shots = 0;
    for (let i = 0; i < 120; i++) {
      ok(engine.dispatch('p0', { type: 'give', targets: ['p1'], seconds: 5 }));
      const order = engine.state.vars.orders.at(-1);
      if (order.shot) shots++;
      ok(engine.dispatch('p0', { type: 'finishBatch', batch: order.batch }));
    }
    return shots;
  };

  assert.equal(run(quiet), 0, 'off means off');
  const got = run(rowdy);
  assert.ok(got > 5 && got < 50, `20% of 120 should be roughly 24, got ${got}`);
  assert.ok(rowdy.getPlayer('p1').shots > 0, 'shots are tallied separately');
});

test('a shot is scored as a shot, not as seconds', () => {
  const engine = newGame();
  // 100 isn't an offered value — the validated setter would refuse it — so
  // this reaches past it to make every roll a shot.
  engine.state.settings.hardcore = 100;

  ok(engine.dispatch('p0', { type: 'give', targets: ['p1'], seconds: 5 }));
  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.shot, true);

  ok(engine.dispatch('p0', { type: 'finishBatch', batch: order.batch }));
  assert.equal(engine.getPlayer('p1').shots, 1);
  assert.equal(engine.getPlayer('p1').seconds, 0, 'no seconds for a shot');
});

test('sips are a way of showing seconds, not a different scale', () => {
  assert.equal(sipsFor(1), 1, 'never less than one mouthful');
  assert.equal(sipsFor(3), 2);
  assert.equal(sipsFor(5), 3);
  assert.equal(sipsFor(10), 5);

  // The engine keeps seconds either way, so the tally stays comparable.
  const engine = newGame({ settings: { measure: 'sips' } });
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-47');
  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));
  assert.equal(engine.state.vars.orders.at(-1).seconds, 5);
  assert.equal(engine.viewFor('p0').settings.measure, 'sips');
});

/* ------------------------------ swapping ------------------------------ */

test('you can bin a card on your turn and take a fresh one, for a sip', () => {
  const engine = newGame();
  const hand = engine.getPlayer('p0').hand;
  const binned = hand[0].id;

  ok(engine.dispatch('p0', { type: 'swapCard', cardId: binned }));

  const after = engine.getPlayer('p0').hand;
  assert.equal(after.length, 4, 'still a full hand');
  assert.ok(!after.some((c) => c.id === binned), 'the card is gone');
  assert.ok(engine.state.vars.eventDiscard.some((c) => c.id === binned));

  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.playerId, 'p0');
  assert.equal(order.seconds, 3, 'the sip');
});

test('only once per turn, and only on your own turn', () => {
  const engine = newGame();

  const notYours = engine.dispatch('p1', {
    type: 'swapCard',
    cardId: engine.getPlayer('p1').hand[0].id,
  });
  assert.equal(notYours.ok, false);
  assert.match(notYours.error, /not your turn/i);

  ok(engine.dispatch('p0', { type: 'swapCard', cardId: engine.getPlayer('p0').hand[0].id }));
  const twice = engine.dispatch('p0', {
    type: 'swapCard',
    cardId: engine.getPlayer('p0').hand[0].id,
  });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already swapped/i);
  assert.ok(!engine.legalActions('p0').some((a) => a.type === 'swapCard'), 'and the offer is gone');
});

test('the swap comes back around next turn', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'swapCard', cardId: engine.getPlayer('p0').hand[0].id }));
  assert.equal(engine.viewFor('p0').canSwap, false);

  ok(engine.dispatch('p0', { type: 'draw' }));
  ok(engine.dispatch('p0', { type: 'endTurn' }));

  assert.equal(engine.state.turn, 'p1');
  assert.equal(engine.viewFor('p1').canSwap, true, 'Bob gets his own swap');
  assert.ok(engine.legalActions('p1').some((a) => a.type === 'swapCard'));
});

test('the sip does not end your turn the way a Mini Game drink does', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  ok(engine.dispatch('p0', { type: 'swapCard', cardId: engine.getPlayer('p0').hand[0].id }));

  const { batch } = engine.state.vars.orders.at(-1);
  ok(engine.dispatch('p0', { type: 'startBatch', batch }));
  ok(engine.dispatch('p0', { type: 'finishBatch', batch }));

  assert.equal(engine.state.turn, 'p0', 'still your turn');
  assert.ok(engine.state.vars.current, 'and your Mini Game is still on the table');
});

test('you cannot swap a card you do not hold', () => {
  const engine = newGame();
  const bad = engine.dispatch('p0', { type: 'swapCard', cardId: 'event-99' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /not in your hand/i);
});

/* ------------------------------ countering ---------------------------- */

test('a played card sits face down until it is answered', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  const p = engine.state.vars.pending;
  assert.ok(p, 'the card is on the table');
  assert.deepEqual(p.canCounter, ['p1'], 'only the target may name it');
  assert.equal(engine.state.vars.orders.length, 0, 'nobody drinks yet');
  assert.ok(!engine.getPlayer('p0').hand.some((c) => c.id === 'event-24'), 'it left the hand');
});

test('nobody can see the face-down card, not even the player guessing', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  for (const watcher of ['p1', 'p2']) {
    const view = engine.viewFor(watcher);
    assert.ok(view.pending, `${watcher} sees a card was played`);
    assert.equal(view.pending.card, undefined, 'but not which one');
    assert.ok(!JSON.stringify(view.pending).includes('event-24'), 'not by id either');
  }
  assert.equal(engine.viewFor('p1').pending.youCanCounter, true);
  assert.equal(engine.viewFor('p2').pending.youCanCounter, false);
});

test('naming the card right turns it back on whoever played it', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24'); // Heel Turn — someone drinks 3s
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));
  ok(engine.dispatch('p1', { type: 'guessCard', guessId: 'event-24' }));

  assert.equal(engine.state.vars.pending, null, 'a correct call ends it at once');
  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.playerId, 'p0', 'it lands on the player who played it');
  assert.equal(engine.state.vars.lastPlay.counteredBy, 'Bob');
});

test('a wrong guess means you take it as played', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));
  // Card 20 is "Spanish Announce Table Broken" — a different name, not just a
  // different id. Guessing the other "Heel Turn" would have been right.
  ok(engine.dispatch('p1', { type: 'guessCard', guessId: 'event-20' }));

  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p1');
  assert.ok(!engine.state.vars.lastPlay.counteredBy, 'nobody called it');
});

test('the card can be named by typing it, not just picked from the list', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-48'); // "No Sell!"
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-48', index: 0, targets: ['p1'] }));
  ok(engine.dispatch('p1', { type: 'guessCard', guessText: '  no sell ' }));

  // Case, spacing and the exclamation mark are all forgiven.
  assert.equal(engine.state.vars.lastPlay.counteredBy, 'Bob', 'loose match still counts');
});

test('the face-down card gives away its kind, and nothing else', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'ppv-001');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'ppv-001', index: 0, targets: ['p1'] }));

  // With 156 cards you could be holding, a blind guess is a lottery. The kind
  // narrows it to a pack you can actually reason about — but it is the only
  // thing that leaks.
  const seen = engine.viewFor('p1').pending;
  assert.equal(seen.kind, 'ppv');
  assert.equal(seen.card, undefined);
  assert.ok(!JSON.stringify(seen).includes('ppv-001'));
  assert.ok(!JSON.stringify(seen).includes(deckCard('ppv-001').title));
});

test('the guess list can be narrowed to the kind that was played', () => {
  const all = eventCardOptions();
  const ppv = eventCardOptions('ppv');
  assert.equal(all.length, 172, 'every card that can ever be held, MITB included');
  assert.equal(ppv.length, 80);
  assert.ok(ppv.every((o) => o.kind === 'ppv'));
  assert.ok(ppv.length < all.length);
  assert.equal(eventCardOptions('mitb').length, 16, 'MITB cards are guessable too');
  assert.equal(eventCardOptions('event').length, 48);
  assert.equal(eventCardOptions('private').length, 28);
  assert.equal(eventCardOptions('mini').length, 0, 'you never hold a Mini Game');
});

test('naming a card is judged on the name, duplicates and all', () => {
  // "Heel Turn" is printed on more than one card across the two packs. A
  // player saying it out loud cannot mean one rather than another, so the
  // counter has to accept the name.
  const twins = eventCardOptions().filter((o) => /heel turn/i.test(o.title));
  assert.ok(twins.length > 1, 'sanity: the title really does repeat');

  const engine = newGame();
  giveCard(engine, 'p0', 'event-24'); // Heel Turn
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));
  // Guessed by picking the *other* Heel Turn off the list.
  const other = twins.find((o) => o.id !== 'event-24');
  ok(engine.dispatch('p1', { type: 'guessCard', guessId: other.id }));

  assert.equal(engine.state.vars.lastPlay.counteredBy, 'Bob', 'the name was right');
});

test('a card from the cards3.1 set plays and counters like any other', () => {
  const engine = newGame();
  const card = deckCard('ppc-001');
  giveCard(engine, 'p0', 'ppc-001');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'ppc-001', index: 0, targets: ['p1'] }));
  ok(engine.dispatch('p1', { type: 'guessCard', guessText: card.title }));
  assert.equal(engine.state.vars.lastPlay.counteredBy, 'Bob');
  assert.ok(card.once, 'a Private Player Card is a one-shot power');
});

test('a botched counter doubles your own drink', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24'); // Heel Turn — 3 seconds
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));
  ok(engine.dispatch('p1', { type: 'guessCard', guessId: 'event-20' })); // wrong

  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.playerId, 'p1');
  assert.equal(order.seconds, 6, '3 seconds, doubled for botching it');
  assert.match(order.label, /botched counter/i);
  assert.deepEqual(engine.state.vars.lastPlay.botched, ['Bob']);
});

test('taking it on the chin costs only the base drink', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));
  ok(engine.dispatch('p1', { type: 'acceptCard' }));

  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.seconds, 3, 'no penalty for not trying');
  assert.deepEqual(engine.state.vars.lastPlay.botched, []);
});

test('only the player who botched it pays — the rest take the base', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-18'); // Danhausen — everyone drinks 3s
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-18', index: 0 }));
  ok(engine.dispatch('p1', { type: 'guessCard', guessId: 'event-20' })); // wrong
  ok(engine.dispatch('p2', { type: 'acceptCard' }));

  const by = Object.fromEntries(engine.state.vars.orders.map((o) => [o.playerId, o.seconds]));
  assert.equal(by.p1, 6, 'Bob botched it');
  assert.equal(by.p2, 3, 'Cat did not');
  assert.equal(by.p0, 3, 'and the player who played it was in range too');
});

test('somebody else calling it right saves a botcher from the penalty', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-18');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-18', index: 0 }));
  ok(engine.dispatch('p1', { type: 'guessCard', guessId: 'event-20' })); // wrong
  ok(engine.dispatch('p2', { type: 'guessCard', guessId: 'event-18' })); // right

  assert.deepEqual(engine.state.vars.lastPlay.botched, [], 'the whole table is off the hook');
  assert.deepEqual(engine.state.vars.orders.map((o) => o.playerId), ['p0']);
});

test('the stake is visible while the card is face down, but not the card', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24'); // 3 seconds
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  const stake = engine.viewFor('p1').pending.stake;
  assert.equal(stake.seconds, 3, 'you can weigh the risk');
  assert.equal(stake.botchMultiplier, 2);
  assert.equal(stake.down, false);
  assert.ok(!JSON.stringify(engine.viewFor('p1')).includes('event-24'), 'still no card id');
});

test('a botched counter on a "down your drink" card costs nothing extra', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-15'); // Bladed — down your drink
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-15', index: 0, targets: ['p1'] }));
  ok(engine.dispatch('p1', { type: 'guessCard', guessId: 'event-09' }));

  const order = engine.state.vars.orders.at(-1);
  assert.equal(order.down, true);
  assert.ok(!/doubled/.test(order.label), 'you cannot down a can twice');
});

test('you cannot counter a card that is not aimed at you, or answer twice', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  const nosy = engine.dispatch('p2', { type: 'guessCard', guessId: 'event-24' });
  assert.equal(nosy.ok, false);
  assert.match(nosy.error, /not aimed at you/i);

  const own = engine.dispatch('p0', { type: 'guessCard', guessId: 'event-24' });
  assert.equal(own.ok, false, 'you cannot counter your own card');

  ok(engine.dispatch('p1', { type: 'acceptCard' }));
  const again = engine.dispatch('p1', { type: 'acceptCard' });
  assert.equal(again.ok, false);
});

test('a card aimed only at yourself resolves without a counter window', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-09'); // "I drink 5s"
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-09', index: 0, targets: ['p0'] }));

  assert.equal(engine.state.vars.pending, null);
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p0');
});

test('everyone aimed at gets a go, and one right call is enough', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-18'); // Danhausen — everyone drinks
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-18', index: 0 }));

  const p = engine.state.vars.pending;
  assert.deepEqual([...p.canCounter].sort(), ['p1', 'p2'], 'the player is not asked to counter');

  ok(engine.dispatch('p1', { type: 'acceptCard' }));
  assert.ok(engine.state.vars.pending, 'still waiting on Cat');

  ok(engine.dispatch('p2', { type: 'guessCard', guessId: 'event-18' }));
  assert.equal(engine.state.vars.pending, null);
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p0', 'one caller is enough');
});

test('the player who played it can force it over if nobody answers', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  const nope = engine.dispatch('p2', { type: 'revealCard' });
  assert.equal(nope.ok, false, 'a bystander cannot');

  ok(engine.dispatch('p0', { type: 'revealCard' }));
  assert.equal(engine.state.vars.pending, null);
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p1', 'lands as played');
});

test('a face-down card stops the rest of the game until it is settled', () => {
  const engine = newGame();
  giveCard(engine, 'p0', 'event-24');
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-24', index: 0, targets: ['p1'] }));

  assert.deepEqual(engine.legalActions('p1').map((a) => a.type), ['guessCard', 'acceptCard']);
  assert.deepEqual(engine.legalActions('p2').map((a) => a.type), []);
  assert.equal(engine.dispatch('p0', { type: 'draw' }).ok, false);
});

/* --------------------------- end of the turn -------------------------- */

test('the turn ends itself when the card-s countdown runs out', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-47'); // drawer drinks 5s
  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));

  const { batch } = engine.state.vars.orders[0];
  assert.equal(engine.state.turn, 'p0', 'still your turn while the clock runs');

  ok(engine.dispatch('p0', { type: 'startBatch', batch }));
  ok(engine.dispatch('p0', { type: 'finishBatch', batch }));

  assert.equal(engine.state.turn, 'p1', 'play moved on by itself');
  assert.equal(engine.state.vars.stage, 'draw', 'and the next player can draw');
  assert.equal(engine.state.vars.current, null);
});

test('an Event Card-s countdown does not end somebody-s turn', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  giveCard(engine, 'p1', 'event-24');
  playCard(engine, 'p1', 'event-24', { targets: ['p2'] });

  const { batch } = engine.state.vars.orders.at(-1);
  ok(engine.dispatch('p1', { type: 'startBatch', batch }));
  ok(engine.dispatch('p1', { type: 'finishBatch', batch }));

  assert.equal(engine.state.turn, 'p0', 'Ann is still mid-turn');
  assert.ok(engine.state.vars.current, 'and her Mini Game is still on the table');
});

/* -------------------------------- vote -------------------------------- */

test('Taboo Tuesday opens a vote and the loser drinks', () => {
  const engine = newGame();
  ok(engine.dispatch('p0', { type: 'draw' }));
  engine.state.vars.current.card = deckCard('mini-56'); // Taboo Tuesday
  ok(engine.dispatch('p0', { type: 'outcome', index: 0 }));

  assert.ok(engine.state.vars.vote, 'a vote is running');
  assert.equal(engine.state.vars.orders.length, 0, 'nobody drinks yet');

  // While a vote is open, voting is the only thing on offer.
  assert.deepEqual(engine.legalActions('p1').map((a) => a.type), ['vote']);

  ok(engine.dispatch('p0', { type: 'vote', targets: ['p1'] }));
  ok(engine.dispatch('p1', { type: 'vote', targets: ['p1'] }));
  assert.ok(engine.state.vars.vote, 'still waiting on the last voter');

  ok(engine.dispatch('p2', { type: 'vote', targets: ['p0'] }));
  assert.equal(engine.state.vars.vote, null, 'vote closed');
  assert.equal(engine.state.vars.orders.at(-1).playerId, 'p1', 'most votes drinks');
});

/* -------------------------------- views ------------------------------- */

test('hands are secret — you see counts, not cards', () => {
  const engine = newGame();
  const view = engine.viewFor('p0');

  assert.equal(view.you.hand.length, 4, 'you see your own');
  for (const player of view.players) {
    assert.equal(player.hand, undefined, `${player.name}'s cards are hidden`);
    assert.equal(player.handCount, 4);
  }

  // Nothing in anyone else's hand may appear anywhere in the serialised view —
  // guessing a card would be no trick at all otherwise.
  const serialised = JSON.stringify(view);
  const theirs = engine.state.players
    .filter((p) => p.id !== 'p0')
    .flatMap((p) => p.hand.map((c) => c.id));
  for (const id of theirs) {
    assert.ok(!serialised.includes(`"${id}"`), `leaked ${id}`);
  }
});

test('the Mini Game draw pile order is never sent to anyone', () => {
  const engine = newGame();
  const serialised = JSON.stringify(engine.viewFor('p1'));
  assert.ok(!serialised.includes('"deck":['), 'no draw pile in the view');
  assert.equal(engine.viewFor('p1').deckCount, 430);

  const upcoming = engine.state.deck.slice(0, 5).map((c) => c.id);
  for (const id of upcoming) {
    assert.ok(!serialised.includes(`"${id}"`), `leaked upcoming card ${id}`);
  }
});

test('the view carries the host clock so countdowns agree across devices', () => {
  const engine = newGame();
  const view = engine.viewFor('p0');
  assert.ok(Math.abs(view.now - Date.now()) < 1000);
});

/* ------------------------------ full night ---------------------------- */

test('a whole night can be played without the engine getting stuck', () => {
  const engine = newGame({ players: ['Ann', 'Bob', 'Cat', 'Dee'] });
  let guard = 0;

  while (engine.state.deck.length && guard++ < 600) {
    const who = engine.state.turn;
    ok(engine.dispatch(who, { type: 'draw' }));

    const outcomes = engine.legalActions(who).filter((a) => a.type === 'outcome');
    const choice = outcomes[0];
    if (choice) {
      const targets = choice.needs === 0 ? undefined : [pickOther(engine, who)];
      const applied = engine.dispatch(who, { type: 'outcome', index: choice.index, targets });
      assert.ok(applied.ok, `${engine.state.vars.current.card.id}: ${applied.error}`);
    }

    // Settle every outstanding drink so the orders list doesn't grow forever.
    for (const order of [...engine.state.vars.orders]) {
      if (engine.state.vars.vote) break;
      ok(engine.dispatch(order.playerId, { type: 'startOrder', orderId: order.id }));
      ok(engine.dispatch(order.playerId, { type: 'finishOrder', orderId: order.id }));
    }

    if (engine.state.vars.vote) {
      for (const player of engine.state.players) {
        engine.dispatch(player.id, { type: 'vote', targets: [pickOther(engine, player.id)] });
      }
    }
    // The turn ends itself once the card's countdown is settled; only cards
    // that cost nobody a drink still need ending by hand.
    if (engine.state.turn === who) ok(engine.dispatch(who, { type: 'endTurn' }));
  }

  assert.equal(engine.state.deck.length, 0, 'the whole pack was played');
  assert.equal(engine.state.discard.length, 430);
  const drunk = engine.state.players.reduce((n, p) => n + p.seconds + p.downs, 0);
  assert.ok(drunk > 0, 'somebody drank something');
});

test('fuzz: 100 random nights never corrupt a hand or wedge the game', () => {
  const ids = ['p0', 'p1', 'p2', 'p3'];
  let eventPlays = 0;

  for (let seed = 0; seed < 100; seed++) {
    const engine = new GameEngine(wrestling, { seed });
    ids.forEach((id, i) => {
      engine.addPlayer({ id, name: `P${i}`, isHost: i === 0 });
      engine.setReady(id, true);
    });
    engine.start();

    for (let turn = 0; turn < 30 && engine.state.deck.length; turn++) {
      const who = engine.state.turn;
      ok(engine.dispatch(who, { type: 'draw' }));

      const outcomes = engine.legalActions(who).filter((a) => a.type === 'outcome');
      if (outcomes.length) {
        const pick = outcomes[turn % outcomes.length];
        ok(engine.dispatch(who, {
          type: 'outcome',
          index: pick.index,
          targets: pick.needs === 0 ? undefined : [ids[(turn + 1) % ids.length]],
        }));
      }

      // A card can put the table to a vote, and nothing else can happen until
      // it is settled — so settle it before trying to play anything.
      if (engine.state.vars.vote) {
        for (const player of engine.state.players) {
          engine.dispatch(player.id, { type: 'vote', targets: ['p0'] });
        }
      }

      const events = engine.legalActions(who).filter((a) => a.type === 'playEvent');
      if (events.length) {
        const pick = events[turn % events.length];
        // Every third one gets guessed at, so the counter path is fuzzed too.
        playCard(engine, who, pick.cardId, {
          index: pick.index,
          targets: [ids[(turn + 2) % ids.length]],
          guessBy: turn % 3 === 0 ? ids[(turn + 2) % ids.length] : undefined,
          guess: turn % 6 === 0 ? pick.cardId : 'event-01',
        });
        eventPlays++;
      }

      for (const order of [...engine.state.vars.orders]) {
        ok(engine.dispatch(order.playerId, { type: 'startOrder', orderId: order.id }));
        ok(engine.dispatch(order.playerId, { type: 'finishOrder', orderId: order.id }));
      }
      if (engine.state.vars.vote) {
        for (const player of engine.state.players) {
          engine.dispatch(player.id, { type: 'vote', targets: ['p0'] });
        }
      }
      if (engine.state.turn === who) ok(engine.dispatch(who, { type: 'endTurn' }));

      // The invariants that matter: a hand is only ever Event Cards, nothing
      // is duplicated, and settled drinks don't pile up in memory.
      for (const player of engine.state.players) {
        assert.ok(
          player.hand.every((c) => c.pile === 'hand' || c.pile === 'mitb'),
          `seed ${seed} turn ${turn}: a Mini Game got into ${player.name}'s hand`,
        );
        const ids_ = player.hand.map((c) => c.id);
        assert.equal(new Set(ids_).size, ids_.length, `seed ${seed}: duplicate card in hand`);
      }
      assert.ok(
        engine.state.vars.orders.every((o) => !o.doneAt),
        `seed ${seed}: settled drinks were left lying around`,
      );
    }
  }

  assert.ok(eventPlays > 500, `sanity: only ${eventPlays} Event Cards were exercised`);
});

test('ending the night ranks everyone, worst first', () => {
  const engine = newGame();
  engine.getPlayer('p1').seconds = 90;
  engine.getPlayer('p2').seconds = 30;

  ok(engine.dispatch('p0', { type: 'endGame' }));
  assert.equal(engine.state.phase, 'over');

  const names = engine.state.result.scores.map((s) => s.name);
  assert.deepEqual(names, ['Bob', 'Cat', 'Ann']);
  assert.equal(engine.state.result.winnerId, 'p0', 'least punished survives');
});

/* ------------------------------ helpers ------------------------------- */

const ALL = JSON.parse(readFileSync(`${ROOT}cards/deck.json`, 'utf8'));
function deckCard(id) {
  return structuredClone(ALL.find((c) => c.id === id));
}
function pickOther(engine, id) {
  return engine.state.players.find((p) => p.id !== id).id;
}

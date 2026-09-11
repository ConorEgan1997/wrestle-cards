/**
 * The wrestling ruleset: dealing, turns, drink orders, multipliers and the
 * handful of cards that change the state of the night.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GameEngine } from '../js/engine.js';
import { wrestling, setDeck } from '../js/rules/wrestling.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
setDeck(JSON.parse(readFileSync(`${ROOT}cards/deck.json`, 'utf8')));

function newGame({ players = ['Ann', 'Bob', 'Cat'], seed = 4242 } = {}) {
  const engine = new GameEngine(wrestling, { seed });
  players.forEach((name, i) => {
    engine.addPlayer({ id: `p${i}`, name, isHost: i === 0 });
    engine.setProfile(`p${i}`, { wrestler: `${name}'s guy` });
    engine.setReady(`p${i}`, true);
  });
  engine.start();
  return engine;
}

/** Give a player a specific card, for testing a card in isolation. */
function giveCard(engine, playerId, cardId) {
  const card = wrestling.buildDeck().concat(
    JSON.parse(readFileSync(`${ROOT}cards/deck.json`, 'utf8')),
  ).find((c) => c.id === cardId);
  const player = engine.getPlayer(playerId);
  player.hand.push(structuredClone(card));
  return card;
}

const ok = (result) => {
  assert.equal(result.ok, true, result.error);
  return result;
};

/* ------------------------------- setup -------------------------------- */

test('setup deals four Event Cards each and stacks the Mini Games', () => {
  const engine = newGame();
  const { state } = engine;

  for (const player of state.players) {
    assert.equal(player.hand.length, 4);
    assert.ok(player.hand.every((c) => c.deck === 'event'));
    assert.equal(player.seconds, 0);
    assert.equal(player.downs, 0);
  }
  assert.equal(state.deck.length, 76, 'the whole Mini Game pack is the draw pile');
  assert.ok(state.deck.every((c) => c.deck === 'mini'));
  assert.equal(state.vars.stage, 'draw');
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
  assert.equal(engine.state.deck.length, 75);
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
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-18', index: 0 }));
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

test('a one-shot card is discarded and replaced; a standing one is kept', () => {
  const engine = newGame();
  const player = engine.getPlayer('p0');

  giveCard(engine, 'p0', 'event-48'); // No Sell — one-shot
  const sizeBefore = player.hand.length;
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-48', index: 0, targets: ['p1'] }));
  assert.ok(!player.hand.some((c) => c.id === 'event-48'), 'used up');
  assert.equal(player.hand.length, sizeBefore, 'and replaced from the pool');

  giveCard(engine, 'p0', 'event-09'); // Heel Turn — stays all night
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-09', index: 0 }));
  assert.ok(player.hand.some((c) => c.id === 'event-09'), 'standing rules are kept');
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
  ok(engine.dispatch('p0', { type: 'playEvent', cardId: 'event-49', index: 0, targets: ['p2'] }));
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

test('Event Cards are public, because the table has to enforce them', () => {
  const engine = newGame();
  const view = engine.viewFor('p0');

  for (const player of view.players) {
    assert.equal(player.hand.length, 4, `${player.name}'s cards are on show`);
  }
  assert.ok(view.you.hand.length === 4);
});

test('the Mini Game draw pile order is never sent to anyone', () => {
  const engine = newGame();
  const serialised = JSON.stringify(engine.viewFor('p1'));
  assert.ok(!serialised.includes('"deck":['), 'no draw pile in the view');
  assert.equal(engine.viewFor('p1').deckCount, 76);

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

  while (engine.state.deck.length && guard++ < 400) {
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
    ok(engine.dispatch(who, { type: 'endTurn' }));
  }

  assert.equal(engine.state.deck.length, 0, 'the whole pack was played');
  assert.equal(engine.state.discard.length, 76);
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

      const events = engine.legalActions(who).filter((a) => a.type === 'playEvent');
      if (events.length) {
        const pick = events[turn % events.length];
        ok(engine.dispatch(who, {
          type: 'playEvent',
          cardId: pick.cardId,
          index: pick.index,
          targets: pick.needs === 0 ? undefined : [ids[(turn + 2) % ids.length]],
        }));
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
      ok(engine.dispatch(who, { type: 'endTurn' }));

      // The invariants that matter: a hand is only ever Event Cards, nothing
      // is duplicated, and settled drinks don't pile up in memory.
      for (const player of engine.state.players) {
        assert.ok(
          player.hand.every((c) => c.deck === 'event'),
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

/**
 * Protocol tests: HostRoom and ClientRoom talking to each other over the
 * in-memory loopback transport. Same code paths as WebRTC, minus the network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HostRoom, ClientRoom } from '../js/room.js';
import { LoopHost, LoopClient } from '../js/net.js';
import { setDeck } from '../js/rules/wrestling.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
setDeck(JSON.parse(readFileSync(`${ROOT}cards/deck.json`, 'utf8')));

/** The loopback transport defers delivery by a microtask, as a real one would. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

async function table({ guests = ['Bob'] } = {}) {
  const hostViews = [];
  const host = new HostRoom({
    rulesetId: 'wrestling',
    Transport: LoopHost,
    onUpdate: (view) => hostViews.push(view),
    onError: () => {},
  });
  const code = await host.open('Ann');

  const clients = [];
  for (const name of guests) {
    const views = [];
    const errors = [];
    const client = new ClientRoom({
      Transport: LoopClient,
      onUpdate: (view) => views.push(view),
      onError: (msg) => errors.push(msg),
      onClosed: () => {},
    });
    await client.join(code, name);
    clients.push({ client, views, errors, get view() { return views.at(-1); } });
  }
  await settle();

  return {
    code,
    host,
    clients,
    get hostView() {
      return hostViews.at(-1);
    },
  };
}

/* ---------------------------------------------------------------- */

test('a client joining is seen by the host and gets a welcome view', async () => {
  const { host, clients, hostView } = await table();

  assert.equal(hostView.players.length, 2);
  assert.deepEqual(
    hostView.players.map((p) => p.name),
    ['Ann', 'Bob'],
  );
  assert.equal(clients[0].view.players.length, 2);
  assert.equal(clients[0].view.you.name, 'Bob');
  assert.equal(clients[0].view.phase, 'lobby');
  host.close();
});

test('ready state propagates to everyone', async () => {
  const { host, clients } = await table();

  clients[0].client.setReady(true);
  await settle();
  assert.equal(host.canStart(), false, 'the host is still not ready');

  host.setReady(true);
  await settle();
  assert.equal(host.canStart(), true);
  assert.ok(clients[0].view.players.every((p) => p.ready));
  host.close();
});

test('starting deals Event Cards and never leaks the Mini Game pile', async () => {
  const { host, clients } = await table({ guests: ['Bob', 'Cat'] });
  host.setReady(true);
  clients.forEach((c) => c.client.setReady(true));
  await settle();

  host.start();
  await settle();

  const bob = clients[0].view;
  assert.equal(bob.phase, 'playing');
  assert.equal(bob.you.hand.length, 4);
  assert.equal(bob.players.length, 3);

  // Event Cards are public on purpose — they are rules the table enforces.
  assert.ok(bob.players.every((p) => p.hand.length === 4));

  // The draw pile is the secret, and it stays on the host.
  assert.equal(bob.deckCount, 76);
  const serialised = JSON.stringify(bob);
  for (const card of host.engine.state.deck.slice(0, 5)) {
    assert.ok(!serialised.includes(`"${card.id}"`), `leaked upcoming card ${card.id}`);
  }
  host.close();
});

test('a client acting out of turn gets an error, not a state change', async () => {
  const { host, clients } = await table();
  host.setReady(true);
  clients[0].client.setReady(true);
  await settle();
  host.start();
  await settle();

  // The host seats itself first, so it is Ann's turn, not Bob's.
  assert.equal(clients[0].view.yourTurn, false);

  clients[0].client.act({ type: 'draw' });
  await settle();

  assert.equal(clients[0].errors.at(-1), 'It is not your turn');
  assert.equal(clients[0].view.current, null, 'nothing was drawn');
  host.close();
});

test('a legal action from a client updates every view', async () => {
  const { host, clients, hostView } = await table();
  host.setReady(true);
  clients[0].client.setReady(true);
  await settle();
  host.start();
  await settle();

  // Hand the turn to Bob.
  host.engine.state.turn = clients[0].client.playerId;
  clients[0].client.act({ type: 'draw' });
  await settle();

  assert.ok(clients[0].view.current, 'Bob sees the card he drew');
  const asHostSeesIt = host.engine.viewFor(host.playerId);
  assert.equal(asHostSeesIt.current.card.id, clients[0].view.current.card.id,
    'and the host is showing the same card');
  assert.equal(asHostSeesIt.deckCount, 75);
  host.close();
});

test('a disconnect marks the player offline but keeps their seat', async () => {
  const { host, clients } = await table();
  host.setReady(true);
  clients[0].client.setReady(true);
  await settle();
  host.start();
  await settle();

  const bobId = clients[0].client.playerId;
  const handSize = host.engine.getPlayer(bobId).hand.length;
  assert.equal(handSize, 4);

  clients[0].client.close();
  await settle();

  const bob = host.engine.getPlayer(bobId);
  assert.equal(bob.connected, false);
  assert.equal(bob.hand.length, handSize, 'the hand is kept for a rejoin');
  host.close();
});

test('an unknown message type is ignored rather than trusted', async () => {
  const { host, clients } = await table();
  const playersBefore = host.engine.state.players.length;

  clients[0].client.transport.send({ t: 'give-me-all-the-cards' });
  clients[0].client.transport.send({ t: 'join' }); // no token
  await settle();

  assert.equal(host.engine.state.players.length, playersBefore);
  host.close();
});

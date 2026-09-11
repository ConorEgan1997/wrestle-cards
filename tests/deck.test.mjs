/**
 * Deck data integrity. These guard the transcription, which is the part most
 * likely to drift when cards are added or corrected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const deck = JSON.parse(readFileSync(`${ROOT}cards/deck.json`, 'utf8'));

const VALID_TARGETS = new Set([
  'self', 'left', 'right', 'selfright', 'all', 'others', 'choose', 'many', 'vote',
]);

test('the deck has both packs and no duplicate ids', () => {
  const events = deck.filter((c) => c.deck === 'event');
  const minis = deck.filter((c) => c.deck === 'mini');

  assert.equal(events.length, 48, 'Event Cards 1-52, less the missing 5-8');
  assert.equal(minis.length, 76, 'Mini Games 1-76');
  assert.equal(deck.length, 124);
  assert.equal(new Set(deck.map((c) => c.id)).size, deck.length, 'ids are unique');
});

test('Mini Games are a complete run and Event Cards note the gap', () => {
  const numbers = (name) =>
    deck.filter((c) => c.deck === name).map((c) => c.n).sort((a, b) => a - b);

  assert.deepEqual(numbers('mini'), Array.from({ length: 76 }, (_, i) => i + 1));

  const events = numbers('event');
  const missing = Array.from({ length: 52 }, (_, i) => i + 1).filter((n) => !events.includes(n));
  assert.deepEqual(missing, [5, 6, 7, 8], 'only the one un-supplied sheet is absent');
});

test('every card has an image file that actually exists', () => {
  for (const card of deck) {
    assert.equal(card.image, `cards/${card.id}.webp`, `${card.id} image path`);
    assert.ok(existsSync(`${ROOT}${card.image}`), `missing image for ${card.id}`);
  }
});

test('every card has a title, printed text and at least one outcome', () => {
  for (const card of deck) {
    assert.ok(card.title?.length > 1, `${card.id} needs a title`);
    assert.ok(card.text?.length > 5, `${card.id} needs its printed text`);
    assert.ok(card.outcomes?.length >= 1, `${card.id} needs an outcome`);
  }
});

test('every outcome is one the engine knows how to apply', () => {
  for (const card of deck) {
    for (const outcome of card.outcomes) {
      assert.ok(outcome.label?.length > 2, `${card.id}: outcome needs a label`);
      assert.ok(
        VALID_TARGETS.has(outcome.target),
        `${card.id}: unknown target "${outcome.target}"`,
      );
      if (outcome.seconds !== undefined) {
        assert.ok(
          Number.isInteger(outcome.seconds) && outcome.seconds >= 0 && outcome.seconds <= 60,
          `${card.id}: ${outcome.seconds}s is not a sane penalty`,
        );
      }
      // An outcome must do something: a drink, or a note for the log.
      const acts = outcome.seconds !== undefined || outcome.down || outcome.stopwatch;
      assert.ok(acts, `${card.id}: outcome does nothing at all`);
    }
  }
});

test('only Event Cards are marked one-shot, and some are', () => {
  const oneShots = deck.filter((c) => c.once);
  assert.ok(oneShots.length > 0, 'reactive cards like No Sell must be one-shot');
  assert.ok(oneShots.every((c) => c.deck === 'event'), 'Mini Games are never held');

  // The reactive ones specifically — these are the cards you play to dodge.
  for (const id of ['event-47', 'event-48', 'event-49']) {
    assert.ok(deck.find((c) => c.id === id)?.once, `${id} should be one-shot`);
  }
});

test('cards that reference a neighbour target one', () => {
  // If the printed text says "the person to your left/right", the outcome
  // should not be making a human pick them from a list.
  const neighbourish = deck.filter((c) => /person to your (left|right)/i.test(c.text));
  assert.ok(neighbourish.length > 5, 'sanity: the deck has neighbour cards');

  const handled = neighbourish.filter((c) =>
    c.outcomes.some((o) => ['left', 'right', 'selfright'].includes(o.target)),
  );
  assert.ok(
    handled.length >= neighbourish.length * 0.6,
    `only ${handled.length}/${neighbourish.length} neighbour cards resolve automatically`,
  );
});

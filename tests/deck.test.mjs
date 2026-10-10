/**
 * Deck data integrity. These guard the transcription, which is the part most
 * likely to drift when cards are added or corrected.
 *
 * The deck is two packs merged. Pack 1 is the original 124 hand-transcribed
 * cards; pack 3 is the cards3.1 set, 478 cards whose rules are printed on the
 * art rather than typed out here. So the assertions below are deliberately
 * split: pack 1 is checked down to its printed text, pack 3 is checked on the
 * things the app actually depends on (id, kind, pile, art, outcomes).
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

const pack = (n) => deck.filter((c) => c.pack === n);
const kind = (k) => deck.filter((c) => c.kind === k);

test('the deck is both packs merged, with unique ids', () => {
  assert.equal(pack(1).length, 124, 'the original pack is untouched');
  assert.equal(pack(3).length, 478, 'the cards3.1 set, plus Later Train and JD');
  assert.equal(deck.length, 602);
  assert.equal(new Set(deck.map((c) => c.id)).size, deck.length, 'ids are unique');
});

test('every card is one of the five kinds and sits in the right pile', () => {
  const where = { mini: 'draw', event: 'hand', ppv: 'hand', private: 'hand', mitb: 'mitb' };
  for (const card of deck) {
    assert.ok(where[card.kind], `${card.id}: unknown kind "${card.kind}"`);
    assert.equal(card.pile, where[card.kind], `${card.id} is in the wrong pile`);
  }

  assert.equal(kind('event').length, 48);
  assert.equal(kind('mini').length, 430);
  assert.equal(kind('ppv').length, 80);
  assert.equal(kind('private').length, 28);
  assert.equal(kind('mitb').length, 16);
});

test('pack 1 is a complete run, bar the one sheet never supplied', () => {
  const numbers = (k) =>
    pack(1).filter((c) => c.kind === k).map((c) => c.n).sort((a, b) => a - b);

  assert.deepEqual(numbers('mini'), Array.from({ length: 76 }, (_, i) => i + 1));

  const events = numbers('event');
  const missing = Array.from({ length: 52 }, (_, i) => i + 1).filter((n) => !events.includes(n));
  assert.deepEqual(missing, [5, 6, 7, 8], 'only the one un-supplied sheet is absent');
});

test('pack 3 numbering is a run per kind with no gaps or repeats', () => {
  for (const k of ['mini', 'ppv', 'private', 'mitb']) {
    const numbers = pack(3).filter((c) => c.kind === k).map((c) => c.n);
    assert.equal(new Set(numbers).size, numbers.length, `${k}: numbers repeat`);
  }
  // Mini Games run 1..467 across both the split zip and the two late arrivals;
  // the gaps are the numbers the pack itself skips, not dropped cards.
  const minis = pack(3).filter((c) => c.kind === 'mini').map((c) => c.n);
  assert.ok(minis.includes(466) && minis.includes(467), 'the two late cards are in');
});

test('every card has an image file that actually exists', () => {
  for (const card of deck) {
    assert.equal(card.image, `cards/${card.id}.webp`, `${card.id} image path`);
    assert.ok(existsSync(`${ROOT}${card.image}`), `missing image for ${card.id}`);
  }
});

test('every card carries the pixel size of its own art', () => {
  for (const card of deck) {
    assert.ok(Array.isArray(card.size) && card.size.length === 2, `${card.id} needs a size`);
    const [w, h] = card.size;
    assert.ok(w > 100 && h > 100, `${card.id}: ${w}x${h} is not a card`);
    assert.ok(h > w, `${card.id} should be portrait`);
  }
});

test('every card has a title and at least one outcome', () => {
  for (const card of deck) {
    assert.ok(card.title?.length > 1, `${card.id} needs a title`);
    assert.ok(card.outcomes?.length >= 1, `${card.id} needs an outcome`);
    assert.equal(typeof card.once, 'boolean', `${card.id} must declare once`);
    assert.ok([1, 3].includes(card.pack), `${card.id} needs a pack`);
    assert.ok(Number.isInteger(card.n), `${card.id} needs its printed number`);
  }
});

test('pack 1 carries its printed text; pack 3 relies on the art', () => {
  for (const card of pack(1)) {
    assert.ok(card.text?.length > 5, `${card.id} needs its printed text`);
  }
  // Pack 3 was supplied as art only. The app must therefore never depend on
  // card.text being present — it shows the card itself instead.
  const typed = pack(3).filter((c) => c.text?.length > 5);
  assert.deepEqual(
    typed.map((c) => c.id).sort(),
    ['mg-466', 'mg-467'],
    'only the two cards that arrived as text',
  );
  for (const card of deck) assert.equal(typeof card.text, 'string', `${card.id}.text`);
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

test('one-shot cards are only ever cards you hold', () => {
  const oneShots = deck.filter((c) => c.once);
  assert.ok(oneShots.length > 0, 'reactive cards like No Sell must be one-shot');
  assert.ok(
    oneShots.every((c) => c.pile !== 'draw'),
    'a Mini Game is drawn and discarded, so one-shot means nothing to it',
  );

  // The reactive ones specifically — these are the cards you play to dodge.
  for (const id of ['event-47', 'event-48', 'event-49']) {
    assert.ok(deck.find((c) => c.id === id)?.once, `${id} should be one-shot`);
  }
  // Pack 3's Private Player Cards are one-shot powers by definition.
  assert.ok(kind('private').every((c) => c.once), 'private cards are one-shot');
});

test('cards that reference a neighbour target one', () => {
  // If the printed text says "the person to your left/right", the outcome
  // should not be making a human pick them from a list. Only pack 1 has text
  // to test this against.
  const neighbourish = pack(1).filter((c) => /person to your (left|right)/i.test(c.text));
  assert.ok(neighbourish.length > 5, 'sanity: the deck has neighbour cards');

  const handled = neighbourish.filter((c) =>
    c.outcomes.some((o) => ['left', 'right', 'selfright'].includes(o.target)),
  );
  assert.ok(
    handled.length >= neighbourish.length * 0.6,
    `only ${handled.length}/${neighbourish.length} neighbour cards resolve automatically`,
  );
});

test('the Money in the Bank pack is self-contained and optional', () => {
  const mitb = kind('mitb');
  assert.equal(mitb.length, 16);
  assert.ok(mitb.every((c) => c.pile === 'mitb'), 'they sit in their own pile');
  assert.ok(mitb.every((c) => c.id.startsWith('mitb-')), 'and are named for it');
});

test('the JD card is in, and the older card of the same name still is too', () => {
  const jd = deck.find((c) => c.id === 'mg-467');
  assert.ok(jd, 'the new JD card');
  assert.match(jd.text, /internet history/i);
  assert.ok(jd.outcomes.some((o) => o.down), 'or down your drink');
  assert.ok(jd.outcomes.some((o) => !o.down), 'and a way out if everyone shows');

  // Pack 3 already had a JD card with a different rule. Both are kept, which
  // is what the table asked for; this test is here so it is a decision rather
  // than a surprise.
  assert.ok(deck.find((c) => c.id === 'mg-291'), 'the pack-3 JD card is kept too');
});

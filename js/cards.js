/**
 * Card data helpers.
 *
 * A card is just a plain object. The only field the engine and UI require is
 * `id`, which must be unique within a deck. Everything else is yours:
 *
 *   {
 *     id:    'H7',            // required, unique
 *     label: '7',             // big text on the face
 *     suit:  'hearts',        // optional; drives the default colour + pip
 *     rank:  7,               // optional; handy for sorting and scoring
 *     text:  'Draw two',      // optional body text, for custom decks
 *     image: 'cards/h7.png',  // optional; replaces the whole face if set
 *     color: '#c0392b',       // optional override
 *   }
 *
 * When you send me your cards I'll either generate this shape from them or
 * point buildDeck() at a JSON file.
 */

export const SUITS = {
  spades: { symbol: '♠', color: 'dark' },
  hearts: { symbol: '♥', color: 'red' },
  diamonds: { symbol: '♦', color: 'red' },
  clubs: { symbol: '♣', color: 'dark' },
};

export const RANKS = [
  { rank: 1, label: 'A' },
  { rank: 2, label: '2' },
  { rank: 3, label: '3' },
  { rank: 4, label: '4' },
  { rank: 5, label: '5' },
  { rank: 6, label: '6' },
  { rank: 7, label: '7' },
  { rank: 8, label: '8' },
  { rank: 9, label: '9' },
  { rank: 10, label: '10' },
  { rank: 11, label: 'J' },
  { rank: 12, label: 'Q' },
  { rank: 13, label: 'K' },
];

/** A standard 52-card deck, in order. Shuffling is the engine's job. */
export function standardDeck({ jokers = 0 } = {}) {
  const deck = [];
  for (const suit of Object.keys(SUITS)) {
    for (const { rank, label } of RANKS) {
      deck.push({ id: `${suit[0].toUpperCase()}${label}`, suit, rank, label });
    }
  }
  for (let i = 0; i < jokers; i++) {
    deck.push({ id: `JOKER${i + 1}`, suit: null, rank: 0, label: '★', text: 'Joker' });
  }
  return deck;
}

/**
 * Build a deck from a compact spec, for custom card sets:
 *   buildDeck([{ label: 'Fire', text: 'Burn a card', copies: 4 }])
 */
export function deckFromSpec(spec) {
  const deck = [];
  spec.forEach((entry, index) => {
    const copies = entry.copies ?? 1;
    for (let n = 0; n < copies; n++) {
      const { copies: _ignored, ...card } = entry;
      deck.push({ ...card, id: card.id ? `${card.id}-${n + 1}` : `C${index}-${n + 1}` });
    }
  });
  return deck;
}

/** Fetch a deck from a JSON file (array of cards, or array of spec entries). */
export async function loadDeck(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load deck: ${response.status}`);
  const data = await response.json();
  const needsExpanding = data.some((card) => typeof card.copies === 'number');
  return needsExpanding ? deckFromSpec(data) : data;
}

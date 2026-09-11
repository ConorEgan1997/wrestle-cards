/**
 * The registry of playable rulesets.
 *
 * There is one. The engine stays generic — it knows about decks, hands, turns
 * and hidden information but nothing about wrestling — so a second ruleset is
 * a new file here and nothing else. tests/fixtures/crazy-eights.js is a second
 * one, kept as the engine's regression fixture.
 */

import { wrestling } from './wrestling.js';

export { loadDeck, setDeck, deckLoaded } from './wrestling.js';

export const RULESETS = [wrestling];

export const DEFAULT_RULESET = wrestling.id;

export function getRuleset(id) {
  return RULESETS.find((r) => r.id === id) || RULESETS[0];
}

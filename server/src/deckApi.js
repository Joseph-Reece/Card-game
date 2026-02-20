'use strict';

const fetch = require('node-fetch');

const BASE_URL = 'https://deckofcardsapi.com/api/deck';

/**
 * Create and shuffle a new single deck.
 * @returns {Promise<string>} deck_id
 */
async function newDeck() {
  const res = await fetch(`${BASE_URL}/new/shuffle/?deck_count=1`);
  if (!res.ok) throw new Error(`Failed to create deck: ${res.statusText}`);
  const data = await res.json();
  return data.deck_id;
}

/**
 * Draw `count` cards from the given deck.
 * @param {string} deckId
 * @param {number} count
 * @returns {Promise<Array>} cards array
 */
async function drawCards(deckId, count) {
  const res = await fetch(`${BASE_URL}/${deckId}/draw/?count=${count}`);
  if (!res.ok) throw new Error(`Failed to draw cards: ${res.statusText}`);
  const data = await res.json();
  if (!data.success) throw new Error('Draw failed: deck may be empty');
  return data.cards;
}

/**
 * Reshuffle an existing deck (resets all drawn cards back).
 * @param {string} deckId
 * @returns {Promise<void>}
 */
async function reshuffleDeck(deckId) {
  const res = await fetch(`${BASE_URL}/${deckId}/shuffle/`);
  if (!res.ok) throw new Error(`Failed to reshuffle deck: ${res.statusText}`);
}

/**
 * Create a brand-new shuffled deck when the draw pile is exhausted.
 * A full re-shuffle from the discard pile would require returning cards to
 * the Deck of Cards API, which is not supported in this integration.
 * We therefore always create a fresh 52-card deck.
 *
 * @returns {Promise<string>} New deck_id
 */
async function rebuildDeckFromDiscard() {
  return newDeck();
}

module.exports = { newDeck, drawCards, reshuffleDeck, rebuildDeckFromDiscard };

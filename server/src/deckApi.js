'use strict';

const fetch = require('node-fetch');

const BASE_URL = 'https://deckofcardsapi.com/api/deck';

/**
 * Create and shuffle a new single deck.
 * @param {boolean} jokerEnabled – include 2 joker cards when true
 * @returns {Promise<string>} deck_id
 */
async function newDeck(jokerEnabled = false) {
  const jokerParam = jokerEnabled ? '&jokers_enabled=true' : '';
  const res = await fetch(`${BASE_URL}/new/shuffle/?deck_count=1${jokerParam}`);
  if (!res.ok) throw new Error(`Failed to create deck: ${res.statusText}`);
  const data = await res.json();
  return data.deck_id;
}

/**
 * Draw `count` cards from the given deck.
 * Returns however many cards are available (may be fewer than requested).
 * Only throws when zero cards are returned (deck is truly empty).
 * @param {string} deckId
 * @param {number} count
 * @returns {Promise<Array>} cards array
 */
async function drawCards(deckId, count) {
  const res = await fetch(`${BASE_URL}/${deckId}/draw/?count=${count}`);
  if (!res.ok) throw new Error(`Failed to draw cards: ${res.statusText}`);
  const data = await res.json();
  if (!data.cards || data.cards.length === 0) throw new Error('Draw failed: deck is empty');
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
 * Create a brand-new shuffled deck.
 * @returns {Promise<string>} New deck_id
 */
async function createFreshDeck() {
  return newDeck();
}

/**
 * Create a new shuffled deck from the cards in discardPile (rule 7/8).
 * The top card of the discard pile is kept; the rest become the new draw pile.
 * Falls back to a fresh deck when the discard pile has ≤ 1 card.
 *
 * @param {Array} discardPile
 * @returns {Promise<string>} New deck_id
 */
async function reshuffleDiscardPile(discardPile) {
  if (!discardPile || discardPile.length <= 1) {
    return newDeck();
  }
  // All cards except the top one (index length-1)
  const cardsToReshuffle = discardPile.slice(0, discardPile.length - 1);
  const codes = cardsToReshuffle.map(c => c.code).join(',');
  const res = await fetch(`${BASE_URL}/new/shuffle/?cards=${codes}`);
  if (!res.ok) throw new Error(`Failed to create deck from discard: ${res.statusText}`);
  const data = await res.json();
  return data.deck_id;
}

module.exports = { newDeck, drawCards, reshuffleDeck, createFreshDeck, reshuffleDiscardPile };

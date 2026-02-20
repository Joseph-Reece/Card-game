'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPECIAL_RANKS = new Set(['ACE', '2', '3', '8', 'QUEEN', 'JACK', 'KING']);

// Rank normalisation: Deck of Cards API uses e.g. "ACE", "2" … "10", "JACK",
// "QUEEN", "KING".  We work with these string values throughout.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return true when `card` is a special card.
 * @param {{ value: string }} card
 */
function isSpecialCard(card) {
  return SPECIAL_RANKS.has(card.value.toUpperCase());
}

// ---------------------------------------------------------------------------
// Core rule: legal move
// ---------------------------------------------------------------------------

/**
 * Decide whether `card` may be played on top of `topDiscard`.
 *
 * When `drawPenaltyCount > 0` the current player is under a 2/3 stack penalty.
 * They may only play another 2 or 3 (to stack further) or an Ace (to block).
 *
 * @param {{ value: string, suit: string }} card
 * @param {{ value: string, suit: string }} topDiscard
 * @param {string|null} activeSuit  – suit chosen after an Ace was played
 * @param {number} drawPenaltyCount
 * @returns {boolean}
 */
function isLegalMove(card, topDiscard, activeSuit, drawPenaltyCount) {
  const rank = card.value.toUpperCase();
  const suit = card.suit.toUpperCase();

  // Under a draw penalty: only 2, 3, or Ace are allowed
  if (drawPenaltyCount > 0) {
    return rank === '2' || rank === '3' || rank === 'ACE';
  }

  // activeSuit overrides top card suit (set after an Ace)
  const effectiveSuit = activeSuit ? activeSuit.toUpperCase() : topDiscard.suit.toUpperCase();

  return rank === topDiscard.value.toUpperCase() || suit === effectiveSuit;
}

// ---------------------------------------------------------------------------
// Turn order helper
// ---------------------------------------------------------------------------

/**
 * Return the index of the next player that should take a turn.
 *
 * @param {number} currentIndex
 * @param {'clockwise'|'counterclockwise'} direction
 * @param {Array} players
 * @param {number} skipCount  – number of extra players to skip (e.g. multiple Jacks)
 * @returns {number}
 */
function getNextPlayerIndex(currentIndex, direction, players, skipCount = 0) {
  const n = players.length;
  if (n === 0) return 0;
  const step = direction === 'clockwise' ? 1 : -1;
  // Advance (1 + skipCount) times
  let idx = currentIndex;
  for (let i = 0; i < 1 + skipCount; i++) {
    idx = ((idx + step) % n + n) % n;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Card effect application
// ---------------------------------------------------------------------------

/**
 * Apply the effect of the card that was just played.
 *
 * Returns the mutated (shallow-cloned) gameState and an optional `pendingSuit`
 * flag when an Ace was played and we need to wait for chooseSuit.
 *
 * NOTE: This function does NOT advance `currentTurnIndex` for the Ace case
 * because the game waits for a `chooseSuit` event before advancing.
 *
 * @param {{ value: string, suit: string }} card
 * @param {object} gameState
 * @param {Array} players
 * @returns {{ gameState: object, pendingSuit: boolean, skipCount: number }}
 */
function applyCardEffect(card, gameState, players) {
  const gs = { ...gameState };
  const rank = card.value.toUpperCase();
  let pendingSuit = false;
  let skipCount = 0;           // extra players to skip (Jacks)
  let directionReversed = false;

  switch (rank) {
    case 'ACE':
      // Block any existing draw penalty
      gs.drawPenaltyCount = 0;
      // Signal caller to wait for chooseSuit before advancing turn
      pendingSuit = true;
      break;

    case '2':
      gs.drawPenaltyCount = (gs.drawPenaltyCount || 0) + 2;
      break;

    case '3':
      gs.drawPenaltyCount = (gs.drawPenaltyCount || 0) + 3;
      break;

    case '8':
    case 'QUEEN':
      // Next player must answer with a legal card or draw 1.
      // The "question" mechanic is handled at the turn level (they cannot
      // simply pass – they must play a matching card or draw).  No special
      // state change beyond a normal turn advance.
      break;

    case 'JACK':
      // Skip the next player; multiple Jacks handled via skipCount = 1 here,
      // but callers that detect consecutive Jacks should sum the skips before
      // calling getNextPlayerIndex.
      skipCount = 1;
      break;

    case 'KING':
      gs.direction = gs.direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
      directionReversed = true;
      break;

    default:
      // Normal card – no special effect
      break;
  }

  return { gameState: gs, pendingSuit, skipCount, directionReversed };
}

// ---------------------------------------------------------------------------
// Win condition helper
// ---------------------------------------------------------------------------

/**
 * Return true when `player` is allowed to win by playing `card` given the
 * current game settings.
 *
 * @param {{ value: string }} card
 * @param {{ hand: Array }} player
 * @param {boolean} noSpecialWin  – GM toggle
 * @returns {boolean}
 */
function canWinWithCard(card, player, noSpecialWin) {
  // Called after the card has been removed from hand, so length 0 means last card.
  if (player.hand.length !== 0) return false;
  if (noSpecialWin && isSpecialCard(card)) return false;
  return true;
}

module.exports = {
  isLegalMove,
  applyCardEffect,
  getNextPlayerIndex,
  isSpecialCard,
  canWinWithCard,
};

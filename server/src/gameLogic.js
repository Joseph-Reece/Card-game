'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPECIAL_RANKS = new Set(['ACE', '2', '3', '8', 'QUEEN', 'JACK', 'KING', 'JOKER']);
// Note: 'JOKER' matches the Deck of Cards API card value for joker cards.

/** Standard ranks (no Joker – used for Ace-of-Clubs card picker validation). */
const RANKS = ['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'];

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
 * @param {{ value: string, suit: string }} card
 * @param {{ value: string, suit: string }} topDiscard
 * @param {string|null} activeSuit      – suit chosen after a regular Ace
 * @param {string|null} activeRank      – rank chosen after Ace of Clubs
 * @param {number}      drawPenaltyCount
 * @param {string|null} dangerRank      – which rank is the active danger ('2' or '3')
 * @param {number}      jokerPenaltyCount
 * @returns {boolean}
 */
function isLegalMove(card, topDiscard, activeSuit, activeRank, drawPenaltyCount, dangerRank, jokerPenaltyCount) {
  if (!topDiscard) return true;
  const rank = card.value.toUpperCase();
  const suit = card.suit.toUpperCase();

  // Rule 11: under joker penalty only Ace or Joker can be played
  if (jokerPenaltyCount > 0) {
    return rank === 'ACE' || rank === 'JOKER';
  }

  // Rule 10: under draw penalty only Ace or same danger-rank can be played
  if (drawPenaltyCount > 0) {
    if (rank === 'ACE') return true;
    if (dangerRank && rank === dangerRank.toUpperCase()) return true;
    return false;
  }

  // Rule 6: Ace-of-Clubs effect – next player must match both rank AND suit, or play Ace
  if (activeRank && activeSuit) {
    if (rank === 'ACE') return true;
    return rank === activeRank.toUpperCase() && suit === activeSuit.toUpperCase();
  }

  // Rule 3: after a regular Ace only the chosen suit is valid
  if (activeSuit) {
    return suit === activeSuit.toUpperCase();
  }

  // Joker: always playable in normal play
  if (rank === 'JOKER') return true;

  // Normal: rank or suit matches the top discard
  return rank === topDiscard.value.toUpperCase() || suit === topDiscard.suit.toUpperCase();
}

/**
 * Return true when at least one card in `hand` is a legal move.
 */
function playerHasLegalMoves(hand, topDiscard, activeSuit, activeRank, drawPenaltyCount, dangerRank, jokerPenaltyCount) {
  return hand.some(c => isLegalMove(c, topDiscard, activeSuit, activeRank, drawPenaltyCount, dangerRank, jokerPenaltyCount));
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
 * Returns the mutated (shallow-cloned) gameState plus flags:
 *   pendingSuit  – caller must wait for chooseSuit  (regular Ace)
 *   pendingCard  – caller must wait for chooseCard   (Ace of Clubs)
 *   skipCount    – extra players to skip             (Jack)
 *   turnEnds     – turn advances immediately          (Ace blocking a penalty)
 *
 * @param {{ value: string, suit: string }} card
 * @param {object} gameState
 * @param {Array} players
 * @returns {{ gameState, pendingSuit, pendingCard, skipCount, turnEnds }}
 */
function applyCardEffect(card, gameState, players) {
  const gs = { ...gameState };
  const rank = card.value.toUpperCase();
  const suit = card.suit.toUpperCase();
  let pendingSuit = false;
  let pendingCard = false;
  let skipCount = 0;
  let turnEnds = false;

  switch (rank) {
    case 'ACE':
      if (gs.drawPenaltyCount > 0 || gs.jokerPenaltyCount > 0) {
        // Rule 4: Ace blocks any active penalty – no suit/card choice, turn ends immediately
        gs.drawPenaltyCount = 0;
        gs.jokerPenaltyCount = 0;
        gs.dangerRank = null;
        turnEnds = true;
      } else if (suit === 'CLUBS') {
        // Rule 6: Ace of Clubs – choose a target rank + suit
        pendingCard = true;
      } else {
        // Regular Ace – choose a suit
        pendingSuit = true;
      }
      break;

    case '2':
      gs.drawPenaltyCount = (gs.drawPenaltyCount || 0) + 2;
      gs.dangerRank = '2';
      break;

    case '3':
      gs.drawPenaltyCount = (gs.drawPenaltyCount || 0) + 3;
      gs.dangerRank = '3';
      break;

    case '8':
    case 'QUEEN':
      // Rule 2: same player must play an answer card before ending their turn
      gs.pendingQuestion = true;
      break;

    case 'JACK':
      skipCount = 1;
      break;

    case 'KING':
      gs.direction = gs.direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
      break;

    case 'JOKER':
      // Rule 11: next player must draw 5 unless they play Ace or Joker
      gs.jokerPenaltyCount = (gs.jokerPenaltyCount || 0) + 5;
      break;

    default:
      break;
  }

  return { gameState: gs, pendingSuit, pendingCard, skipCount, turnEnds };
}

// ---------------------------------------------------------------------------
// Win condition helper
// ---------------------------------------------------------------------------

/**
 * Return true when `player` is allowed to win by playing `card`.
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
  playerHasLegalMoves,
  applyCardEffect,
  getNextPlayerIndex,
  isSpecialCard,
  canWinWithCard,
  RANKS,
};

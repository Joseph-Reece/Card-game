'use strict';

const { newDeck, drawCards, rebuildDeckFromDiscard } = require('./deckApi');
const {
  isLegalMove,
  applyCardEffect,
  getNextPlayerIndex,
  isSpecialCard,
  canWinWithCard,
} = require('./gameLogic');

// ---------------------------------------------------------------------------
// In-memory room store
// ---------------------------------------------------------------------------

/** @type {Map<string, { players: Array, gameState: object }>} */
const rooms = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function generatePlayerId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/** Return a sanitised view of all players (no hand contents). */
function sanitisePlayers(players) {
  return players.map(({ id, username, isReady, isGM, hand }) => ({
    id,
    username,
    isReady,
    isGM,
    handSize: hand.length,
  }));
}

/** Build the public game-state object (no per-player hand data). */
function publicGameState(gameState) {
  // eslint-disable-next-line no-unused-vars
  const { _privateData, ...pub } = gameState;
  return pub;
}

/**
 * Attempt to draw `count` cards from the deck.  If the deck is exhausted,
 * rebuild it from the discard pile and try again.
 */
async function safeDraw(gameState, count) {
  try {
    const cards = await drawCards(gameState.deckId, count);
    return { cards, gameState };
  } catch (_err) {
    // Rebuild deck from discard pile (excluding top card)
    if (gameState.discardPile.length > 1) {
      const newDeckId = await rebuildDeckFromDiscard(gameState.discardPile);
      gameState = { ...gameState, deckId: newDeckId };
    } else {
      // Nothing to rebuild with – create a completely fresh deck
      const newDeckId = await newDeck();
      gameState = { ...gameState, deckId: newDeckId };
    }
    const cards = await drawCards(gameState.deckId, count);
    return { cards, gameState };
  }
}

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

/**
 * Create a new room.  The creating player becomes the Game Master.
 * @returns {{ roomCode, playerId, gameState, players }}
 */
function createRoom(username) {
  const roomCode = generateRoomCode();
  const playerId = generatePlayerId();

  const player = {
    id: playerId,
    username,
    hand: [],
    isReady: false,
    isGM: true,
  };

  const gameState = {
    deckId: null,
    discardPile: [],
    activeSuit: null,
    currentTurnIndex: 0,
    direction: 'clockwise',
    drawPenaltyCount: 0,
    phase: 'lobby',
    noSpecialWin: false,
    pendingSuit: false,       // waiting for Ace suit choice
  };

  rooms.set(roomCode, { players: [player], gameState });

  return { roomCode, playerId, gameState: publicGameState(gameState), players: sanitisePlayers([player]) };
}

/**
 * Join an existing room.
 * @returns {{ playerId, gameState, players }} or throws
 */
function joinRoom(roomCode, username) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'lobby') throw new Error('Game already in progress');

  const playerId = generatePlayerId();
  const player = { id: playerId, username, hand: [], isReady: false, isGM: false };
  room.players.push(player);

  return {
    playerId,
    gameState: publicGameState(room.gameState),
    players: sanitisePlayers(room.players),
  };
}

/**
 * Toggle a player's ready state.
 * @returns {{ players }}
 */
function setReady(roomCode, playerId, isReady) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const player = room.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');
  player.isReady = isReady;
  return { players: sanitisePlayers(room.players) };
}

/**
 * Start the game (GM only).  Deals 7 cards to each player, flips top card.
 * @returns {{ gameState, players, hands: { [playerId]: cards[] } }}
 */
async function startGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');

  const gm = room.players.find(p => p.id === playerId);
  if (!gm || !gm.isGM) throw new Error('Only the GM can start the game');
  if (room.players.length < 2) throw new Error('Need at least 2 players to start');

  const deckId = await newDeck();
  room.gameState.deckId = deckId;
  room.gameState.phase = 'playing';
  room.gameState.direction = 'clockwise';
  room.gameState.drawPenaltyCount = 0;
  room.gameState.activeSuit = null;
  room.gameState.pendingSuit = false;
  room.gameState.currentTurnIndex = 0;
  room.gameState.discardPile = [];

  // Deal 7 cards to each player
  const totalCards = room.players.length * 7 + 1; // +1 for the initial discard
  const allCards = await drawCards(deckId, totalCards);

  // Assign hands
  const hands = {};
  room.players.forEach((player, i) => {
    player.hand = allCards.slice(i * 7, i * 7 + 7);
    player.isReady = false;
    hands[player.id] = player.hand;
  });

  // Flip top card to start discard pile (must not be a special card)
  let topCardIndex = room.players.length * 7;
  let topCard = allCards[topCardIndex];

  // If the initial top card is special, draw another one
  while (isSpecialCard(topCard)) {
    const extra = await drawCards(deckId, 1);
    // Put the special card at the bottom conceptually (just discard it into pile)
    room.gameState.discardPile.push(topCard);
    topCard = extra[0];
  }

  room.gameState.discardPile.push(topCard);

  return {
    gameState: publicGameState(room.gameState),
    players: sanitisePlayers(room.players),
    hands,
  };
}

// ---------------------------------------------------------------------------
// Gameplay actions
// ---------------------------------------------------------------------------

/**
 * Play a card.
 * @returns {{ gameState, players, lastAction, winnerId? }}
 */
async function playCard(roomCode, playerId, cardCode) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');
  if (room.gameState.pendingSuit) throw new Error('Waiting for suit selection after Ace');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  // Find the card in the player's hand
  const cardIndex = currentPlayer.hand.findIndex(c => c.code === cardCode);
  if (cardIndex === -1) throw new Error('Card not in hand');
  const card = currentPlayer.hand[cardIndex];

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  if (!isLegalMove(card, topDiscard, gameState.activeSuit, gameState.drawPenaltyCount)) {
    throw new Error('Illegal move');
  }

  // Remove card from hand
  currentPlayer.hand.splice(cardIndex, 1);

  // Add to discard pile
  gameState.discardPile.push(card);

  // Reset activeSuit now that a card has been played (Ace handler sets it again if needed)
  gameState.activeSuit = null;

  // Check win before applying effects
  const playerWins = canWinWithCard(card, { hand: currentPlayer.hand }, gameState.noSpecialWin);
  // Note: hand already has card removed, so length 0 means they just played their last card

  // Apply card effects
  const { gameState: updatedGs, pendingSuit, skipCount } = applyCardEffect(card, gameState, players);
  Object.assign(gameState, updatedGs);

  let lastAction = { type: 'playCard', playerId, cardCode, card };
  let winnerId = null;

  if (currentPlayer.hand.length === 0 && !pendingSuit) {
    // Player wins (pendingSuit = false means we either aren't playing Ace or Ace blocked penalty)
    if (playerWins || (!isSpecialCard(card))) {
      gameState.phase = 'finished';
      winnerId = playerId;
      lastAction.win = true;
    }
  }

  // Advance turn (unless waiting for suit selection or game over)
  if (!pendingSuit && gameState.phase !== 'finished') {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex,
      gameState.direction,
      players,
      skipCount,
    );
  }

  if (pendingSuit) {
    gameState.pendingSuit = true;
  }

  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    winnerId,
    handUpdates: { [playerId]: currentPlayer.hand },
  };
}

/**
 * Choose a suit after playing an Ace.
 * @returns {{ gameState, players, lastAction }}
 */
function chooseSuit(roomCode, playerId, suit) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (!room.gameState.pendingSuit) throw new Error('No suit selection pending');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  const validSuits = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
  const normSuit = suit.toUpperCase();
  if (!validSuits.includes(normSuit)) throw new Error('Invalid suit');

  gameState.activeSuit = normSuit;
  gameState.pendingSuit = false;

  // Check if player has 0 cards (won by playing Ace as last card)
  let winnerId = null;
  let lastAction = { type: 'chooseSuit', playerId, suit: normSuit };

  if (currentPlayer.hand.length === 0) {
    if (!gameState.noSpecialWin) {
      gameState.phase = 'finished';
      winnerId = playerId;
      lastAction.win = true;
    } else {
      // noSpecialWin: player cannot win on a special card. Force them to draw
      // one card so the game continues. The draw is applied immediately here.
      // We flag this so the caller can include it in the broadcast.
      lastAction.forcedDraw = true;
      // Async draw is not possible in a sync function; the index.js handler
      // checks this flag and triggers a draw on behalf of the player.
    }
  }

  // Advance turn
  if (gameState.phase !== 'finished') {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex,
      gameState.direction,
      players,
      0,
    );
  }

  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    winnerId,
  };
}

/**
 * Draw a card (or the full penalty stack).
 * @returns {{ gameState, players, lastAction, drawnCards }}
 */
async function drawCard(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');
  if (room.gameState.pendingSuit) throw new Error('Waiting for suit selection after Ace');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  const count = gameState.drawPenaltyCount > 0 ? gameState.drawPenaltyCount : 1;

  const { cards, gameState: gsAfterDraw } = await safeDraw(gameState, count);
  Object.assign(gameState, gsAfterDraw);

  currentPlayer.hand.push(...cards);
  gameState.drawPenaltyCount = 0;

  // Advance turn after drawing
  gameState.currentTurnIndex = getNextPlayerIndex(
    gameState.currentTurnIndex,
    gameState.direction,
    players,
    0,
  );

  const lastAction = { type: 'drawCard', playerId, count };

  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    drawnCards: cards,
    handUpdates: { [playerId]: currentPlayer.hand },
  };
}

/**
 * Remove a player from a room.
 * If GM leaves, the next player becomes GM.
 * If room is empty, delete it.
 * @returns {{ players, roomDeleted: boolean }}
 */
function leaveRoom(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { players: [], roomDeleted: true };

  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx === -1) return { players: sanitisePlayers(room.players), roomDeleted: false };

  const leavingPlayer = room.players[idx];
  room.players.splice(idx, 1);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return { players: [], roomDeleted: true };
  }

  // Adjust turn index if necessary
  if (room.gameState.phase === 'playing') {
    if (room.gameState.currentTurnIndex >= room.players.length) {
      room.gameState.currentTurnIndex = 0;
    }
    // If only one player remains, end the game
    if (room.players.length === 1) {
      room.gameState.phase = 'finished';
    }
  }

  // Assign new GM if the GM left
  if (leavingPlayer.isGM) {
    room.players[0].isGM = true;
  }

  return { players: sanitisePlayers(room.players), roomDeleted: false };
}

/**
 * Return a list of open (lobby phase) rooms for the lobby browser.
 */
function getOpenRooms() {
  const result = [];
  for (const [roomCode, { players, gameState }] of rooms.entries()) {
    const gm = players.find(p => p.isGM);
    result.push({
      roomCode,
      playerCount: players.length,
      gmName: gm ? gm.username : 'Unknown',
      phase: gameState.phase,
    });
  }
  return result;
}

/**
 * Get full room state (used internally by socket handlers).
 */
function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

module.exports = {
  createRoom,
  joinRoom,
  setReady,
  startGame,
  playCard,
  chooseSuit,
  drawCard,
  leaveRoom,
  getOpenRooms,
  getRoom,
};

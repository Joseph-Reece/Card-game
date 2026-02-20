'use strict';

const { newDeck, drawCards, createFreshDeck, reshuffleDiscardPile } = require('./deckApi');
const {
  isLegalMove,
  playerHasLegalMoves,
  applyCardEffect,
  getNextPlayerIndex,
  isSpecialCard,
  canWinWithCard,
  RANKS,
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
  return players.map(({ id, username, isReady, isGM, hand, announced }) => ({
    id,
    username,
    isReady,
    isGM,
    handSize: hand.length,
    announced: !!announced,
  }));
}

/** Build the public game-state object (no per-player hand data). */
function publicGameState(gameState) {
  // eslint-disable-next-line no-unused-vars
  const { _privateData, ...pub } = gameState;
  return pub;
}

/**
 * Attempt to draw `count` cards from the deck.
 * If the deck is exhausted mid-draw, reshuffle the discard pile into a new
 * draw deck (rule 7/8) and continue drawing the remainder.
 *
 * @param {object} gameState
 * @param {number} count
 * @returns {Promise<{ cards: Array, gameState: object }>}
 */
async function safeDraw(gameState, count) {
  let allCards = [];
  let gs = gameState;
  let remaining = count;

  try {
    const cards = await drawCards(gs.deckId, remaining);
    allCards.push(...cards);
    remaining -= cards.length;
  } catch (_err) {
    // Deck empty – fall through to reshuffle
  }

  if (remaining > 0) {
    // Rule 7/8: reshuffle discard pile (keeping top card) into new draw pile
    let newDeckId;
    if (gs.discardPile.length > 1) {
      newDeckId = await reshuffleDiscardPile(gs.discardPile);
      const topCard = gs.discardPile[gs.discardPile.length - 1];
      gs = { ...gs, deckId: newDeckId, discardPile: [topCard] };
    } else {
      newDeckId = await createFreshDeck();
      gs = { ...gs, deckId: newDeckId };
    }

    try {
      const moreCards = await drawCards(gs.deckId, remaining);
      allCards.push(...moreCards);
    } catch (_err2) {
      // Still empty – return what we have
    }
  }

  return { cards: allCards, gameState: gs };
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
    announced: false,
  };

  const gameState = {
    deckId: null,
    discardPile: [],
    activeSuit: null,
    activeRank: null,          // set after Ace of Clubs chooseCard
    currentTurnIndex: 0,
    direction: 'clockwise',
    drawPenaltyCount: 0,
    dangerRank: null,          // '2' or '3' – which rank is the active danger
    jokerPenaltyCount: 0,      // pending joker draw penalty
    phase: 'lobby',
    noSpecialWin: false,
    pendingSuit: false,        // waiting for Ace suit choice
    pendingCard: false,        // waiting for Ace-of-Clubs card choice
    pendingQuestion: false,    // waiting for player to answer 8/Q
    jokerEnabled: false,       // GM toggle – include joker cards
    stackableDanger: false,    // GM toggle – stackable danger (rule 12)
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
  const player = { id: playerId, username, hand: [], isReady: false, isGM: false, announced: false };
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

  const deckId = await newDeck(room.gameState.jokerEnabled);
  room.gameState.deckId = deckId;
  room.gameState.phase = 'playing';
  room.gameState.direction = 'clockwise';
  room.gameState.drawPenaltyCount = 0;
  room.gameState.dangerRank = null;
  room.gameState.jokerPenaltyCount = 0;
  room.gameState.activeSuit = null;
  room.gameState.activeRank = null;
  room.gameState.pendingSuit = false;
  room.gameState.pendingCard = false;
  room.gameState.pendingQuestion = false;
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
    player.announced = false;
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
 *
 * Implements:
 *  - Rule 1:  multi-play (turn stays if player has legal moves)
 *  - Rule 2:  pendingQuestion (8/Q must be answered before endTurn)
 *  - Rule 4:  Ace blocks penalty, turn ends immediately
 *  - Rule 9:  announce-before-last-card
 *  - Rule 10: dangerRank stacking
 *
 * @returns {{ gameState, players, lastAction, winnerId?, handUpdates, canContinue }}
 */
async function playCard(roomCode, playerId, cardCode) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');
  if (room.gameState.pendingSuit) throw new Error('Waiting for suit selection after Ace');
  if (room.gameState.pendingCard) throw new Error('Waiting for card selection after Ace of Clubs');

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
  if (!isLegalMove(
    card, topDiscard,
    gameState.activeSuit, gameState.activeRank,
    gameState.drawPenaltyCount, gameState.dangerRank,
    gameState.jokerPenaltyCount,
  )) {
    throw new Error('Illegal move');
  }

  // Remove card from hand and add to discard
  currentPlayer.hand.splice(cardIndex, 1);
  gameState.discardPile.push(card);

  // Reset activeSuit/activeRank (card effect will set them again if needed)
  gameState.activeSuit = null;
  gameState.activeRank = null;

  // Rule 2: if this card is answering a pending question, resolve it first
  if (gameState.pendingQuestion) {
    gameState.pendingQuestion = false;
  }

  // Apply card effects
  const { gameState: updatedGs, pendingSuit, pendingCard, skipCount, turnEnds } =
    applyCardEffect(card, gameState, players);
  Object.assign(gameState, updatedGs);

  let lastAction = { type: 'playCard', playerId, cardCode, card };
  let winnerId = null;

  // -------------------------------------------------------------------------
  // Rule 9: last-card check
  // -------------------------------------------------------------------------
  if (currentPlayer.hand.length === 0) {
    if (!currentPlayer.announced) {
      // Player did NOT announce – draw 2 penalty cards instead of winning
      const { cards: penaltyCards, gameState: gsAfterDraw } = await safeDraw(gameState, 2);
      Object.assign(gameState, gsAfterDraw);
      currentPlayer.hand.push(...penaltyCards);

      // Clear any pending states and advance turn
      gameState.pendingQuestion = false;
      gameState.pendingSuit = false;
      gameState.pendingCard = false;
      gameState.currentTurnIndex = getNextPlayerIndex(
        gameState.currentTurnIndex, gameState.direction, players, 0,
      );

      lastAction.noAnnounce = true;

      return {
        gameState: publicGameState(gameState),
        players: sanitisePlayers(players),
        lastAction,
        winnerId: null,
        handUpdates: { [playerId]: currentPlayer.hand },
        canContinue: false,
      };
    }

    // Player DID announce
    currentPlayer.announced = false;

    // For Ace (pendingSuit / pendingCard), the win is checked AFTER suit/card choice
    if (!pendingSuit && !pendingCard) {
      const playerWins = canWinWithCard(card, { hand: currentPlayer.hand }, gameState.noSpecialWin);

      if (playerWins) {
        gameState.phase = 'finished';
        winnerId = playerId;
        lastAction.win = true;
        return {
          gameState: publicGameState(gameState),
          players: sanitisePlayers(players),
          lastAction,
          winnerId,
          handUpdates: { [playerId]: currentPlayer.hand },
          canContinue: false,
        };
      }

      // noSpecialWin edge case: played special card as last card – force draw 1 and advance
      if (gameState.noSpecialWin && isSpecialCard(card)) {
        const { cards: forceCards, gameState: gsForce } = await safeDraw(gameState, 1);
        Object.assign(gameState, gsForce);
        currentPlayer.hand.push(...forceCards);
        gameState.pendingQuestion = false;
        gameState.currentTurnIndex = getNextPlayerIndex(
          gameState.currentTurnIndex, gameState.direction, players, skipCount,
        );
        return {
          gameState: publicGameState(gameState),
          players: sanitisePlayers(players),
          lastAction,
          winnerId: null,
          handUpdates: { [playerId]: currentPlayer.hand },
          canContinue: false,
        };
      }
    }
  } else {
    // Hand not empty – reset announced flag for next time
    currentPlayer.announced = false;
  }

  // -------------------------------------------------------------------------
  // Turn advancement routing
  // -------------------------------------------------------------------------

  // Waiting for suit choice (regular Ace)
  if (pendingSuit) {
    gameState.pendingSuit = true;
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: false,
    };
  }

  // Waiting for card choice (Ace of Clubs)
  if (pendingCard) {
    gameState.pendingCard = true;
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: false,
    };
  }

  // Rule 2: 8/Q was just played – player must answer before ending turn
  if (gameState.pendingQuestion) {
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: true,
    };
  }

  // Rule 4: Ace blocked a penalty – turn ends immediately
  if (turnEnds) {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex, gameState.direction, players, skipCount,
    );
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: false,
    };
  }

  // Rule 1: normal multi-play – check if player has legal moves
  const topDiscardNow = gameState.discardPile[gameState.discardPile.length - 1];
  const hasLegal = playerHasLegalMoves(
    currentPlayer.hand,
    topDiscardNow,
    gameState.activeSuit,
    gameState.activeRank,
    gameState.drawPenaltyCount,
    gameState.dangerRank,
    gameState.jokerPenaltyCount,
  );

  if (hasLegal) {
    // Player may continue playing or call endTurn
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: true,
    };
  }

  // No legal moves – auto-advance turn
  gameState.currentTurnIndex = getNextPlayerIndex(
    gameState.currentTurnIndex, gameState.direction, players, skipCount,
  );

  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    winnerId: null,
    handUpdates: { [playerId]: currentPlayer.hand },
    canContinue: false,
  };
}

/**
 * End the current player's turn voluntarily (rule 1).
 * Blocked when pendingQuestion / pendingSuit / pendingCard / active penalty.
 *
 * @returns {{ gameState, players, lastAction }}
 */
function endTurn(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  if (gameState.pendingQuestion) throw new Error('Must play an answer card first');
  if (gameState.pendingSuit) throw new Error('Must choose a suit first');
  if (gameState.pendingCard) throw new Error('Must choose a card first');
  if (gameState.drawPenaltyCount > 0) throw new Error('Must draw or block the penalty first');
  if (gameState.jokerPenaltyCount > 0) throw new Error('Must draw or block the joker penalty first');

  currentPlayer.announced = false;

  gameState.currentTurnIndex = getNextPlayerIndex(
    gameState.currentTurnIndex, gameState.direction, players, 0,
  );

  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction: { type: 'endTurn', playerId },
  };
}

/**
 * Announce last card (rule 9) – must be called before playing the final card.
 *
 * @returns {{ players, lastAction }}
 */
function announceLastCard(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  if (currentPlayer.hand.length !== 1) {
    throw new Error('Can only announce with exactly 1 card in hand');
  }

  currentPlayer.announced = true;

  return {
    players: sanitisePlayers(players),
    lastAction: { type: 'announceLastCard', playerId },
  };
}

/**
 * Choose the target card after playing Ace of Clubs (rule 6).
 * Sets both activeRank and activeSuit; advances turn.
 *
 * @returns {{ gameState, players, lastAction, winnerId? }}
 */
function chooseCard(roomCode, playerId, rank, suit) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (!room.gameState.pendingCard) throw new Error('No card selection pending');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  if (!rank || !suit) throw new Error('rank and suit are required');
  const normRank = rank.toUpperCase();
  const normSuit = suit.toUpperCase();
  const validSuits = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
  if (!RANKS.includes(normRank)) throw new Error('Invalid rank');
  if (!validSuits.includes(normSuit)) throw new Error('Invalid suit');

  gameState.activeRank = normRank;
  gameState.activeSuit = normSuit;
  gameState.pendingCard = false;

  let winnerId = null;
  let lastAction = { type: 'chooseCard', playerId, rank: normRank, suit: normSuit };

  // Win check: player played Ace of Clubs as last card
  if (currentPlayer.hand.length === 0) {
    if (!gameState.noSpecialWin) {
      gameState.phase = 'finished';
      winnerId = playerId;
      lastAction.win = true;
      return {
        gameState: publicGameState(gameState),
        players: sanitisePlayers(players),
        lastAction,
        winnerId,
      };
    }
    // noSpecialWin: flag forced draw (async handled by socket handler)
    lastAction.forcedDraw = true;
  }

  // Advance turn
  if (gameState.phase !== 'finished') {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex, gameState.direction, players, 0,
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
 * Choose a suit after playing a regular Ace.
 * @returns {{ gameState, players, lastAction, winnerId? }}
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

  let winnerId = null;
  let lastAction = { type: 'chooseSuit', playerId, suit: normSuit };

  if (currentPlayer.hand.length === 0) {
    if (!gameState.noSpecialWin) {
      gameState.phase = 'finished';
      winnerId = playerId;
      lastAction.win = true;
    } else {
      // noSpecialWin: player cannot win on a special card – flag for forced draw
      lastAction.forcedDraw = true;
    }
  }

  // Advance turn
  if (gameState.phase !== 'finished') {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex, gameState.direction, players, 0,
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
 * Resolves pendingQuestion when active.
 *
 * @returns {{ gameState, players, lastAction, drawnCards }}
 */
async function drawCard(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');
  if (room.gameState.pendingSuit) throw new Error('Waiting for suit selection after Ace');
  if (room.gameState.pendingCard) throw new Error('Waiting for card selection after Ace of Clubs');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  // Determine how many cards to draw
  let count;
  if (gameState.pendingQuestion) {
    // Rule 2: draw 1 to resolve question
    count = 1;
  } else if (gameState.jokerPenaltyCount > 0) {
    count = gameState.jokerPenaltyCount;
  } else if (gameState.drawPenaltyCount > 0) {
    count = gameState.drawPenaltyCount;
  } else {
    count = 1;
  }

  const { cards, gameState: gsAfterDraw } = await safeDraw(gameState, count);
  Object.assign(gameState, gsAfterDraw);

  currentPlayer.hand.push(...cards);
  gameState.drawPenaltyCount = 0;
  gameState.jokerPenaltyCount = 0;
  gameState.dangerRank = null;

  if (gameState.pendingQuestion) {
    gameState.pendingQuestion = false;
  }

  currentPlayer.announced = false;

  // Advance turn after drawing
  gameState.currentTurnIndex = getNextPlayerIndex(
    gameState.currentTurnIndex, gameState.direction, players, 0,
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

/**
 * Toggle the GM's noSpecialWin rule.
 * @returns {{ gameState }}
 */
function setNoSpecialWin(roomCode, playerId, noSpecialWin) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const gm = room.players.find(p => p.id === playerId);
  if (!gm || !gm.isGM) throw new Error('Only the GM can change game rules');
  if (room.gameState.phase !== 'lobby') throw new Error('Cannot change rules after game has started');
  room.gameState.noSpecialWin = !!noSpecialWin;
  return { gameState: publicGameState(room.gameState) };
}

/**
 * Toggle the GM's jokerEnabled rule.
 * @returns {{ gameState }}
 */
function setJokerEnabled(roomCode, playerId, jokerEnabled) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const gm = room.players.find(p => p.id === playerId);
  if (!gm || !gm.isGM) throw new Error('Only the GM can change game rules');
  if (room.gameState.phase !== 'lobby') throw new Error('Cannot change rules after game has started');
  room.gameState.jokerEnabled = !!jokerEnabled;
  return { gameState: publicGameState(room.gameState) };
}

/**
 * Toggle the GM's stackableDanger rule.
 * @returns {{ gameState }}
 */
function setStackableDanger(roomCode, playerId, stackableDanger) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found');
  const gm = room.players.find(p => p.id === playerId);
  if (!gm || !gm.isGM) throw new Error('Only the GM can change game rules');
  if (room.gameState.phase !== 'lobby') throw new Error('Cannot change rules after game has started');
  room.gameState.stackableDanger = !!stackableDanger;
  return { gameState: publicGameState(room.gameState) };
}

module.exports = {
  createRoom,
  joinRoom,
  setReady,
  startGame,
  playCard,
  endTurn,
  announceLastCard,
  chooseCard,
  chooseSuit,
  drawCard,
  leaveRoom,
  getOpenRooms,
  getRoom,
  setNoSpecialWin,
  setJokerEnabled,
  setStackableDanger,
};

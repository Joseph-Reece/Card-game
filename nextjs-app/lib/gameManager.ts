import { newDeck, drawCards, createFreshDeck, reshuffleDiscardPile } from './deckApi';
import {
  isLegalMove,
  playerHasLegalMoves,
  applyCardEffect,
  getNextPlayerIndex,
  isSpecialCard,
  canWinWithCard,
  RANKS,
} from './gameLogic';
import { getRoom, setRoom, deleteRoom, getAllRoomCodes } from './store';
import type { CardObj, GameState, Player, PublicPlayer, OpenRoom } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generatePlayerId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function sanitisePlayers(players: Player[]): PublicPlayer[] {
  return players.map(({ id, username, isReady, isGM, hand, announced }) => ({
    id,
    username,
    isReady,
    isGM,
    handSize: hand.length,
    announced: !!announced,
  }));
}

function publicGameState(gameState: GameState): GameState {
  return { ...gameState };
}

async function safeDraw(
  gameState: GameState,
  count: number,
): Promise<{ cards: CardObj[]; gameState: GameState }> {
  const allCards: CardObj[] = [];
  let gs = gameState;
  let remaining = count;

  try {
    const cards = await drawCards(gs.deckId!, remaining);
    allCards.push(...cards);
    remaining -= cards.length;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {
    // Deck empty – fall through to reshuffle
  }

  if (remaining > 0) {
    let newDeckId: string;
    if (gs.discardPile.length > 1) {
      newDeckId = await reshuffleDiscardPile(gs.discardPile);
      const topCard = gs.discardPile[gs.discardPile.length - 1];
      gs = { ...gs, deckId: newDeckId, discardPile: [topCard] };
    } else {
      newDeckId = await createFreshDeck();
      gs = { ...gs, deckId: newDeckId };
    }

    try {
      const moreCards = await drawCards(gs.deckId!, remaining);
      allCards.push(...moreCards);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e2) {
      // Still empty – return what we have
    }
  }

  return { cards: allCards, gameState: gs };
}

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

export async function createRoom(username: string) {
  let roomCode: string;
  // Generate unique code
  do {
    roomCode = generateRoomCode();
  } while ((await getRoom(roomCode)) !== null);

  const playerId = generatePlayerId();

  const player: Player = {
    id: playerId,
    username,
    hand: [],
    isReady: false,
    isGM: true,
    announced: false,
  };

  const gameState: GameState = {
    deckId: null,
    discardPile: [],
    activeSuit: null,
    activeRank: null,
    currentTurnIndex: 0,
    direction: 'clockwise',
    drawPenaltyCount: 0,
    dangerRank: null,
    jokerPenaltyCount: 0,
    phase: 'lobby',
    noSpecialWin: false,
    pendingSuit: false,
    pendingCard: false,
    pendingQuestion: false,
    jokerEnabled: false,
    stackableDanger: false,
  };

  await setRoom(roomCode, { players: [player], gameState });

  return {
    roomCode,
    playerId,
    gameState: publicGameState(gameState),
    players: sanitisePlayers([player]),
  };
}

export async function joinRoom(roomCode: string, username: string) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'lobby') throw new Error('Game already in progress');

  const playerId = generatePlayerId();
  const player: Player = { id: playerId, username, hand: [], isReady: false, isGM: false, announced: false };
  room.players.push(player);

  await setRoom(roomCode, room);

  return {
    playerId,
    gameState: publicGameState(room.gameState),
    players: sanitisePlayers(room.players),
  };
}

export async function setReady(roomCode: string, playerId: string, isReady: boolean) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  const player = room.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');
  player.isReady = isReady;
  await setRoom(roomCode, room);
  return { players: sanitisePlayers(room.players) };
}

export async function startGame(roomCode: string, playerId: string) {
  const room = await getRoom(roomCode);
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

  const totalCards = room.players.length * 7 + 1;
  const allCards = await drawCards(deckId, totalCards);

  const hands: Record<string, CardObj[]> = {};
  room.players.forEach((player, i) => {
    player.hand = allCards.slice(i * 7, i * 7 + 7);
    player.isReady = false;
    player.announced = false;
    hands[player.id] = player.hand;
  });

  const topCardIndex = room.players.length * 7;
  let topCard = allCards[topCardIndex];

  while (isSpecialCard(topCard)) {
    const extra = await drawCards(deckId, 1);
    room.gameState.discardPile.push(topCard);
    topCard = extra[0];
  }

  room.gameState.discardPile.push(topCard);

  await setRoom(roomCode, room);

  return {
    gameState: publicGameState(room.gameState),
    players: sanitisePlayers(room.players),
    hands,
  };
}

// ---------------------------------------------------------------------------
// Gameplay actions
// ---------------------------------------------------------------------------

export async function playCard(roomCode: string, playerId: string, cardCode: string) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');
  if (room.gameState.pendingSuit) throw new Error('Waiting for suit selection after Ace');
  if (room.gameState.pendingCard) throw new Error('Waiting for card selection after Ace of Clubs');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

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

  currentPlayer.hand.splice(cardIndex, 1);
  gameState.discardPile.push(card);

  gameState.activeSuit = null;
  gameState.activeRank = null;

  if (gameState.pendingQuestion) {
    gameState.pendingQuestion = false;
  }

  const { gameState: updatedGs, pendingSuit, pendingCard, skipCount, turnEnds } =
    applyCardEffect(card, gameState, players);
  Object.assign(gameState, updatedGs);

  const lastAction: Record<string, unknown> = { type: 'playCard', playerId, cardCode, card };
  let winnerId: string | null = null;

  if (currentPlayer.hand.length === 0) {
    if (!currentPlayer.announced) {
      const { cards: penaltyCards, gameState: gsAfterDraw } = await safeDraw(gameState, 2);
      Object.assign(gameState, gsAfterDraw);
      currentPlayer.hand.push(...penaltyCards);

      gameState.pendingQuestion = false;
      gameState.pendingSuit = false;
      gameState.pendingCard = false;
      gameState.currentTurnIndex = getNextPlayerIndex(
        gameState.currentTurnIndex, gameState.direction, players, 0,
      );

      lastAction.noAnnounce = true;

      await setRoom(roomCode, room);
      return {
        gameState: publicGameState(gameState),
        players: sanitisePlayers(players),
        lastAction,
        winnerId: null,
        handUpdates: { [playerId]: currentPlayer.hand },
        canContinue: false,
      };
    }

    currentPlayer.announced = false;

    if (!pendingSuit && !pendingCard) {
      const playerWins = canWinWithCard(card, { hand: currentPlayer.hand }, gameState.noSpecialWin);

      if (playerWins) {
        gameState.phase = 'finished';
        winnerId = playerId;
        lastAction.win = true;
        await setRoom(roomCode, room);
        return {
          gameState: publicGameState(gameState),
          players: sanitisePlayers(players),
          lastAction,
          winnerId,
          handUpdates: { [playerId]: currentPlayer.hand },
          canContinue: false,
        };
      }

      if (gameState.noSpecialWin && isSpecialCard(card)) {
        const { cards: forceCards, gameState: gsForce } = await safeDraw(gameState, 1);
        Object.assign(gameState, gsForce);
        currentPlayer.hand.push(...forceCards);
        gameState.pendingQuestion = false;
        gameState.currentTurnIndex = getNextPlayerIndex(
          gameState.currentTurnIndex, gameState.direction, players, skipCount,
        );
        await setRoom(roomCode, room);
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
    currentPlayer.announced = false;
  }

  if (pendingSuit) {
    gameState.pendingSuit = true;
    await setRoom(roomCode, room);
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: false,
    };
  }

  if (pendingCard) {
    gameState.pendingCard = true;
    await setRoom(roomCode, room);
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: false,
    };
  }

  if (gameState.pendingQuestion) {
    await setRoom(roomCode, room);
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: true,
    };
  }

  if (turnEnds) {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex, gameState.direction, players, skipCount,
    );
    await setRoom(roomCode, room);
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: false,
    };
  }

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
    await setRoom(roomCode, room);
    return {
      gameState: publicGameState(gameState),
      players: sanitisePlayers(players),
      lastAction,
      winnerId: null,
      handUpdates: { [playerId]: currentPlayer.hand },
      canContinue: true,
    };
  }

  gameState.currentTurnIndex = getNextPlayerIndex(
    gameState.currentTurnIndex, gameState.direction, players, skipCount,
  );

  await setRoom(roomCode, room);
  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    winnerId: null,
    handUpdates: { [playerId]: currentPlayer.hand },
    canContinue: false,
  };
}

export async function endTurn(roomCode: string, playerId: string) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  if (gameState.pendingQuestion) throw new Error('Must play an answer card (or draw) to resolve the 8/Q question first');
  if (gameState.pendingSuit) throw new Error('Must choose a suit first');
  if (gameState.pendingCard) throw new Error('Must choose a card first');
  if (gameState.drawPenaltyCount > 0) throw new Error('Must draw or block the penalty first');
  if (gameState.jokerPenaltyCount > 0) throw new Error('Must draw or block the joker penalty first');

  currentPlayer.announced = false;

  gameState.currentTurnIndex = getNextPlayerIndex(
    gameState.currentTurnIndex, gameState.direction, players, 0,
  );

  await setRoom(roomCode, room);
  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction: { type: 'endTurn', playerId },
  };
}

export async function announceLastCard(roomCode: string, playerId: string) {
  const room = await getRoom(roomCode);
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

  await setRoom(roomCode, room);
  return {
    players: sanitisePlayers(players),
    lastAction: { type: 'announceLastCard', playerId },
  };
}

export async function chooseCard(roomCode: string, playerId: string, rank: string, suit: string) {
  const room = await getRoom(roomCode);
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

  let winnerId: string | null = null;
  const lastAction: Record<string, unknown> = { type: 'chooseCard', playerId, rank: normRank, suit: normSuit };

  if (currentPlayer.hand.length === 0) {
    if (!gameState.noSpecialWin) {
      gameState.phase = 'finished';
      winnerId = playerId;
      lastAction.win = true;
      await setRoom(roomCode, room);
      return {
        gameState: publicGameState(gameState),
        players: sanitisePlayers(players),
        lastAction,
        winnerId,
      };
    }
    lastAction.forcedDraw = true;
  }

  if (gameState.phase !== 'finished') {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex, gameState.direction, players, 0,
    );
  }

  await setRoom(roomCode, room);
  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    winnerId,
  };
}

export async function chooseSuit(roomCode: string, playerId: string, suit: string) {
  const room = await getRoom(roomCode);
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

  let winnerId: string | null = null;
  const lastAction: Record<string, unknown> = { type: 'chooseSuit', playerId, suit: normSuit };

  if (currentPlayer.hand.length === 0) {
    if (!gameState.noSpecialWin) {
      gameState.phase = 'finished';
      winnerId = playerId;
      lastAction.win = true;
    } else {
      lastAction.forcedDraw = true;
    }
  }

  if (gameState.phase !== 'finished') {
    gameState.currentTurnIndex = getNextPlayerIndex(
      gameState.currentTurnIndex, gameState.direction, players, 0,
    );
  }

  await setRoom(roomCode, room);
  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    winnerId,
  };
}

export async function drawCard(roomCode: string, playerId: string) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  if (room.gameState.phase !== 'playing') throw new Error('Game is not in progress');
  if (room.gameState.pendingSuit) throw new Error('Waiting for suit selection after Ace');
  if (room.gameState.pendingCard) throw new Error('Waiting for card selection after Ace of Clubs');

  const { players, gameState } = room;
  const currentPlayer = players[gameState.currentTurnIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  let count: number;
  if (gameState.pendingQuestion) {
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

  gameState.currentTurnIndex = getNextPlayerIndex(
    gameState.currentTurnIndex, gameState.direction, players, 0,
  );

  const lastAction = { type: 'drawCard', playerId, count };

  await setRoom(roomCode, room);
  return {
    gameState: publicGameState(gameState),
    players: sanitisePlayers(players),
    lastAction,
    drawnCards: cards,
    handUpdates: { [playerId]: currentPlayer.hand },
  };
}

export async function leaveRoom(roomCode: string, playerId: string) {
  const room = await getRoom(roomCode);
  if (!room) return { players: [], roomDeleted: true };

  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx === -1) return { players: sanitisePlayers(room.players), roomDeleted: false };

  const leavingPlayer = room.players[idx];
  room.players.splice(idx, 1);

  if (room.players.length === 0) {
    await deleteRoom(roomCode);
    return { players: [], roomDeleted: true };
  }

  if (room.gameState.phase === 'playing') {
    if (room.gameState.currentTurnIndex >= room.players.length) {
      room.gameState.currentTurnIndex = 0;
    }
    if (room.players.length === 1) {
      room.gameState.phase = 'finished';
    }
  }

  if (leavingPlayer.isGM) {
    room.players[0].isGM = true;
  }

  await setRoom(roomCode, room);
  return { players: sanitisePlayers(room.players), roomDeleted: false };
}

export async function getOpenRooms(): Promise<OpenRoom[]> {
  const codes = await getAllRoomCodes();
  const result: OpenRoom[] = [];
  for (const roomCode of codes) {
    const room = await getRoom(roomCode);
    if (!room) continue;
    const { players, gameState } = room;
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

export async function setNoSpecialWin(roomCode: string, playerId: string, noSpecialWin: boolean) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  const gm = room.players.find(p => p.id === playerId);
  if (!gm || !gm.isGM) throw new Error('Only the GM can change game rules');
  if (room.gameState.phase !== 'lobby') throw new Error('Cannot change rules after game has started');
  room.gameState.noSpecialWin = !!noSpecialWin;
  await setRoom(roomCode, room);
  return { gameState: publicGameState(room.gameState) };
}

export async function setJokerEnabled(roomCode: string, playerId: string, jokerEnabled: boolean) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  const gm = room.players.find(p => p.id === playerId);
  if (!gm || !gm.isGM) throw new Error('Only the GM can change game rules');
  if (room.gameState.phase !== 'lobby') throw new Error('Cannot change rules after game has started');
  room.gameState.jokerEnabled = !!jokerEnabled;
  await setRoom(roomCode, room);
  return { gameState: publicGameState(room.gameState) };
}

export async function setStackableDanger(roomCode: string, playerId: string, stackableDanger: boolean) {
  const room = await getRoom(roomCode);
  if (!room) throw new Error('Room not found');
  const gm = room.players.find(p => p.id === playerId);
  if (!gm || !gm.isGM) throw new Error('Only the GM can change game rules');
  if (room.gameState.phase !== 'lobby') throw new Error('Cannot change rules after game has started');
  room.gameState.stackableDanger = !!stackableDanger;
  await setRoom(roomCode, room);
  return { gameState: publicGameState(room.gameState) };
}

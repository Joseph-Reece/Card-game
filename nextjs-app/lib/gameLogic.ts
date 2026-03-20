import type { CardObj, GameState, Player } from './types';

export const SPECIAL_RANKS = new Set(['ACE', '2', '3', '8', 'QUEEN', 'JACK', 'KING', 'JOKER']);

/** Standard ranks (no Joker – used for Ace-of-Clubs card picker validation). */
export const RANKS = ['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'];

export function isSpecialCard(card: CardObj): boolean {
  return SPECIAL_RANKS.has(card.value.toUpperCase());
}

export function isLegalMove(
  card: CardObj,
  topDiscard: CardObj | null,
  activeSuit: string | null,
  activeRank: string | null,
  drawPenaltyCount: number,
  dangerRank: string | null,
  jokerPenaltyCount: number,
): boolean {
  if (!topDiscard) return true;
  const rank = card.value.toUpperCase();
  const suit = card.suit.toUpperCase();

  if (jokerPenaltyCount > 0) {
    return rank === 'ACE' || rank === 'JOKER';
  }

  if (drawPenaltyCount > 0) {
    if (rank === 'ACE') return true;
    if (dangerRank && rank === dangerRank.toUpperCase()) return true;
    return false;
  }

  if (activeRank && activeSuit) {
    if (rank === 'ACE') return true;
    return rank === activeRank.toUpperCase() && suit === activeSuit.toUpperCase();
  }

  if (activeSuit) {
    return suit === activeSuit.toUpperCase();
  }

  if (rank === 'JOKER') return true;

  return rank === topDiscard.value.toUpperCase() || suit === topDiscard.suit.toUpperCase();
}

export function playerHasLegalMoves(
  hand: CardObj[],
  topDiscard: CardObj | null,
  activeSuit: string | null,
  activeRank: string | null,
  drawPenaltyCount: number,
  dangerRank: string | null,
  jokerPenaltyCount: number,
): boolean {
  return hand.some(c => isLegalMove(c, topDiscard, activeSuit, activeRank, drawPenaltyCount, dangerRank, jokerPenaltyCount));
}

export function getNextPlayerIndex(
  currentIndex: number,
  direction: 'clockwise' | 'counterclockwise',
  players: Player[],
  skipCount = 0,
): number {
  const n = players.length;
  if (n === 0) return 0;
  const step = direction === 'clockwise' ? 1 : -1;
  let idx = currentIndex;
  for (let i = 0; i < 1 + skipCount; i++) {
    idx = ((idx + step) % n + n) % n;
  }
  return idx;
}

export interface CardEffectResult {
  gameState: GameState;
  pendingSuit: boolean;
  pendingCard: boolean;
  skipCount: number;
  turnEnds: boolean;
}

export function applyCardEffect(
  card: CardObj,
  gameState: GameState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  players: Player[],
): CardEffectResult {
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
        gs.drawPenaltyCount = 0;
        gs.jokerPenaltyCount = 0;
        gs.dangerRank = null;
        turnEnds = true;
      } else if (suit === 'CLUBS') {
        pendingCard = true;
      } else {
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
      gs.pendingQuestion = true;
      break;

    case 'JACK':
      skipCount = 1;
      break;

    case 'KING':
      gs.direction = gs.direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
      break;

    case 'JOKER':
      gs.jokerPenaltyCount = (gs.jokerPenaltyCount || 0) + 5;
      break;

    default:
      break;
  }

  return { gameState: gs, pendingSuit, pendingCard, skipCount, turnEnds };
}

export function canWinWithCard(
  card: CardObj,
  player: { hand: CardObj[] },
  noSpecialWin: boolean,
): boolean {
  if (player.hand.length !== 0) return false;
  if (noSpecialWin && isSpecialCard(card)) return false;
  return true;
}

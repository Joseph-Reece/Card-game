export interface CardObj {
  code: string;
  value: string;
  suit: string;
  image?: string;
}

export interface Player {
  id: string;
  username: string;
  hand: CardObj[];
  isReady: boolean;
  isGM: boolean;
  announced: boolean;
}

export interface PublicPlayer {
  id: string;
  username: string;
  isReady: boolean;
  isGM: boolean;
  handSize: number;
  announced: boolean;
}

export interface GameState {
  deckId: string | null;
  discardPile: CardObj[];
  activeSuit: string | null;
  activeRank: string | null;
  currentTurnIndex: number;
  direction: 'clockwise' | 'counterclockwise';
  drawPenaltyCount: number;
  dangerRank: string | null;
  jokerPenaltyCount: number;
  phase: 'lobby' | 'playing' | 'finished';
  noSpecialWin: boolean;
  pendingSuit: boolean;
  pendingCard: boolean;
  pendingQuestion: boolean;
  jokerEnabled: boolean;
  stackableDanger: boolean;
}

export interface Room {
  players: Player[];
  gameState: GameState;
}

export interface OpenRoom {
  roomCode: string;
  playerCount: number;
  gmName: string;
  phase: string;
}

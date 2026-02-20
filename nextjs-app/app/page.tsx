'use client';

import { useState } from 'react';
import Lobby from '@/components/Lobby';
import GameRoom from '@/components/GameRoom';

interface GameInfo {
  playerId: string;
  roomCode: string;
}

export default function Home() {
  const [game, setGame] = useState<GameInfo | null>(null);

  if (game) {
    return <GameRoom playerId={game.playerId} roomCode={game.roomCode} onLeave={() => setGame(null)} />;
  }
  return <Lobby onJoinGame={setGame} />;
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getPusher } from '@/lib/pusherClient';
import Card from './Card';
import PlayerHand from './PlayerHand';
import SuitPicker from './SuitPicker';
import CardPicker from './CardPicker';
import type { CardObj, GameState, PublicPlayer } from '@/lib/types';

const DIRECTION_LABELS: Record<string, string> = {
  clockwise: '→ Clockwise',
  counterclockwise: '← Counter-clockwise',
};
const SUIT_SYMBOLS: Record<string, string> = { SPADES: '♠', HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣' };

interface GameRoomProps {
  playerId: string;
  roomCode: string;
  onLeave: () => void;
}

interface LastAction {
  type?: string;
  playerId?: string;
  card?: CardObj;
  count?: number;
  suit?: string;
  rank?: string;
  noAnnounce?: boolean;
  win?: boolean;
  [key: string]: unknown;
}

interface Winner {
  playerId: string;
  username: string;
}

export default function GameRoom({ playerId, roomCode, onLeave }: GameRoomProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [myHand, setMyHand] = useState<CardObj[]>([]);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [showSuitPicker, setShowSuitPicker] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [hasPlayedThisTurn, setHasPlayedThisTurn] = useState(false);

  const prevTurnIndexRef = useRef<number | null>(null);
  const playersRef = useRef<PublicPlayer[]>([]);
  playersRef.current = players;

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  };

  const apiCall = useCallback(async (path: string, body: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      showError(data.error || 'Something went wrong');
    }
  }, []);

  function getMyIndex(playerList: PublicPlayer[], pid: string) {
    return playerList.findIndex((p) => p.id === pid);
  }

  function buildActionText(la: LastAction, playerList: PublicPlayer[]): string {
    const actor = playerList?.find((p) => p.id === la.playerId)?.username || 'Someone';
    if (la.type === 'playCard') {
      if (la.noAnnounce) return `${actor} forgot to announce! Drawing 2 cards 😬`;
      return `${actor} played ${la.card?.value} of ${la.card?.suit}`;
    }
    if (la.type === 'drawCard') return `${actor} drew ${la.count} card${la.count !== 1 ? 's' : ''}`;
    if (la.type === 'chooseSuit') return `${actor} chose ${la.suit}`;
    if (la.type === 'chooseCard') return `${actor} set target: ${la.rank} of ${la.suit} ♣`;
    if (la.type === 'announceLastCard') return `${actor} announces: ONE CARD LEFT! 🃏`;
    if (la.type === 'endTurn') return '';
    return '';
  }

  useEffect(() => {
    const pusher = getPusher();

    const roomChannel = pusher.subscribe(roomCode);
    roomChannel.bind('playerUpdated', ({ players: p }: { players: PublicPlayer[] }) => setPlayers(p));

    roomChannel.bind('gameStarted', ({ gameState: gs, players: p }: { gameState: GameState; players: PublicPlayer[] }) => {
      setGameState(gs);
      setPlayers(p);
      setHasPlayedThisTurn(false);
    });

    roomChannel.bind('gameUpdated', ({ gameState: gs, players: p, lastAction: la }: { gameState?: GameState; players?: PublicPlayer[]; lastAction?: LastAction }) => {
      if (gs) setGameState(gs);
      if (p) setPlayers(p);
      if (la) {
        const currentPlayers = p || playersRef.current;
        const actionText = buildActionText(la, currentPlayers);
        if (actionText) {
          setLastAction(actionText);
          setTimeout(() => setLastAction(''), 3500);
        }
      }

      const currentGs = gs;
      const currentP = p || playersRef.current;
      const myIdx = getMyIndex(currentP, playerId);
      const turnIdx = currentGs?.currentTurnIndex ?? -1;

      if (turnIdx !== prevTurnIndexRef.current) {
        prevTurnIndexRef.current = turnIdx;
        setHasPlayedThisTurn(false);
      }

      const isMyTurnNow = turnIdx === myIdx && currentGs?.phase === 'playing';
      setShowSuitPicker(!!(currentGs?.pendingSuit && isMyTurnNow));
      setShowCardPicker(!!(currentGs?.pendingCard && isMyTurnNow));
    });

    roomChannel.bind('handUpdated', ({ hand }: { hand: CardObj[] }) => setMyHand(hand));

    roomChannel.bind('playerWon', ({ playerId: wid, username }: { playerId: string; username: string }) => {
      setWinner({ playerId: wid, username });
    });

    roomChannel.bind('playerLeft', ({ players: p }: { players: PublicPlayer[] }) => setPlayers(p));

    const privateChannel = pusher.subscribe(`private-player-${playerId}`);
    privateChannel.bind('handUpdated', ({ hand }: { hand: CardObj[] }) => setMyHand(hand));

    return () => {
      pusher.unsubscribe(roomCode);
      pusher.unsubscribe(`private-player-${playerId}`);
    };
  }, [roomCode, playerId]);

  const myPlayer = players.find((p) => p.id === playerId);
  const isGM = myPlayer?.isGM || false;
  const phase = gameState?.phase || 'lobby';

  const currentTurnIndex = gameState?.currentTurnIndex ?? -1;
  const currentTurnPlayer = players[currentTurnIndex] || null;
  const isMyTurn = currentTurnPlayer?.id === playerId && phase === 'playing';

  const discardPile = gameState?.discardPile || [];
  const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  const activeSuit = gameState?.activeSuit || null;
  const activeRank = gameState?.activeRank || null;
  const drawPenaltyCount = gameState?.drawPenaltyCount || 0;
  const dangerRank = gameState?.dangerRank || null;
  const jokerPenaltyCount = gameState?.jokerPenaltyCount || 0;
  const direction = gameState?.direction || 'clockwise';
  const noSpecialWin = gameState?.noSpecialWin || false;
  const jokerEnabled = gameState?.jokerEnabled || false;
  const stackableDanger = gameState?.stackableDanger || false;
  const pendingQuestion = gameState?.pendingQuestion || false;

  const allReady = players.length > 1 && players.every((p) => p.isReady);

  const canEndTurn = isMyTurn && hasPlayedThisTurn &&
    !pendingQuestion && !gameState?.pendingSuit && !gameState?.pendingCard &&
    drawPenaltyCount === 0 && jokerPenaltyCount === 0;

  const handlePlayCard = useCallback((card: CardObj) => {
    setHasPlayedThisTurn(true);
    apiCall('/api/game/play-card', { roomCode, playerId, cardCode: card.code });
  }, [roomCode, playerId, apiCall]);

  const handleDrawCard = () => apiCall('/api/game/draw-card', { roomCode, playerId });
  const handleEndTurn = () => apiCall('/api/game/end-turn', { roomCode, playerId });
  const handleAnnounce = () => apiCall('/api/game/announce', { roomCode, playerId });
  const handleReady = () => apiCall('/api/game/ready', { roomCode, playerId, isReady: !(myPlayer?.isReady) });
  const handleStartGame = () => apiCall('/api/game/start', { roomCode, playerId });
  const handleNoSpecialWin = () => apiCall('/api/game/rules', { roomCode, playerId, rule: 'noSpecialWin', value: !noSpecialWin });
  const handleJokerEnabled = () => apiCall('/api/game/rules', { roomCode, playerId, rule: 'jokerEnabled', value: !jokerEnabled });
  const handleStackableDanger = () => apiCall('/api/game/rules', { roomCode, playerId, rule: 'stackableDanger', value: !stackableDanger });
  const handleLeave = () => {
    apiCall('/api/game/leave', { roomCode, playerId });
    onLeave();
  };

  const handleSuitChosen = (suit: string) => {
    setShowSuitPicker(false);
    apiCall('/api/game/choose-suit', { roomCode, playerId, suit });
  };

  const handleCardChosen = (rank: string, suit: string) => {
    setShowCardPicker(false);
    apiCall('/api/game/choose-card', { roomCode, playerId, rank, suit });
  };

  const otherPlayers = players.filter((p) => p.id !== playerId);
  const suitLabel = activeSuit ? `${SUIT_SYMBOLS[activeSuit] || ''} ${activeSuit}` : '—';

  return (
    <div className="gameroom">
      <header className="gameroom-header">
        <div className="header-left">
          <span className="room-code-badge">Room: <strong>{roomCode}</strong></span>
          {myPlayer && (
            <span className="player-badge">
              {isGM && <span className="gm-badge">👑 GM</span>}
              <span className="username">{myPlayer.username}</span>
            </span>
          )}
        </div>
        <div className="header-right">
          {phase === 'playing' && (
            <div className="game-info-bar">
              <span>Suit: <strong>{suitLabel}</strong></span>
              {activeRank && <span>Rank: <strong>{activeRank}</strong></span>}
              <span>{DIRECTION_LABELS[direction] || direction}</span>
              {drawPenaltyCount > 0 && (
                <span className="penalty-badge">⚠ Draw ×{drawPenaltyCount}</span>
              )}
              {jokerPenaltyCount > 0 && (
                <span className="penalty-badge">🃏 Joker ×{jokerPenaltyCount}</span>
              )}
            </div>
          )}
          <button className="btn btn-danger btn-sm" onClick={handleLeave}>Leave</button>
        </div>
      </header>

      {errorMsg && <div className="error-banner">{errorMsg}</div>}
      {lastAction && <div className="last-action-banner">{lastAction}</div>}

      <div className="gameroom-body">
        <div className="other-players">
          {otherPlayers.map((p) => (
            <div
              key={p.id}
              className={`other-player${currentTurnPlayer?.id === p.id ? ' active-turn' : ''}`}
            >
              <div className="other-player-name">
                {p.isGM && '👑 '}
                {p.username}
                {p.isReady && phase === 'lobby' && <span className="ready-dot"> ✓</span>}
                {p.announced && <span className="announced-dot"> 🃏</span>}
              </div>
              <div className="other-player-cards">
                {Array.from({ length: Math.min(p.handSize || 0, 10) }).map((_, i) => (
                  <Card key={i} faceDown />
                ))}
                <span className="card-count">{p.handSize ?? 0} cards</span>
              </div>
            </div>
          ))}
          {otherPlayers.length === 0 && phase === 'lobby' && (
            <div className="waiting-players">Waiting for other players…</div>
          )}
        </div>

        <div className="table-center">
          <div className="discard-area">
            <div className="discard-label">Discard Pile</div>
            {topDiscard ? (
              <Card card={topDiscard} />
            ) : (
              <div className="empty-discard">—</div>
            )}
          </div>

          <div className="turn-indicator">
            {phase === 'playing' && (
              isMyTurn
                ? (
                  <div>
                    <span className="your-turn">⭐ Your Turn!</span>
                    {pendingQuestion && (
                      <div className="pending-question-banner">⚡ Answer the Question! Play a card or draw.</div>
                    )}
                  </div>
                )
                : <span className="waiting-turn">Waiting for <strong>{currentTurnPlayer?.username || '…'}</strong></span>
            )}
            {phase === 'lobby' && <span className="lobby-phase">Waiting for players…</span>}
            {phase === 'finished' && <span className="finished-phase">Game Over</span>}
          </div>

          {phase === 'playing' && isMyTurn && (
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={handleDrawCard}>
                🃏 Draw Card
              </button>
              {canEndTurn && (
                <button className="btn btn-success done-btn" onClick={handleEndTurn}>
                  ✅ Done (End Turn)
                </button>
              )}
              {myHand.length === 1 && !myPlayer?.announced && (
                <button className="btn announce-btn" onClick={handleAnnounce}>
                  📢 Announce! (Last Card)
                </button>
              )}
            </div>
          )}

          {phase === 'lobby' && (
            <div className="lobby-controls">
              <button
                className={`btn ${myPlayer?.isReady ? 'btn-success' : 'btn-outline'}`}
                onClick={handleReady}
              >
                {myPlayer?.isReady ? '✓ Ready' : 'Ready Up'}
              </button>

              {isGM && (
                <div className="gm-controls">
                  <button
                    className="btn btn-primary"
                    onClick={handleStartGame}
                    disabled={!allReady}
                    title={!allReady ? 'All players must be ready' : 'Start the game'}
                  >
                    🚀 Start Game
                  </button>
                  <button
                    className={`btn btn-sm ${noSpecialWin ? 'btn-warning' : 'btn-outline'}`}
                    onClick={handleNoSpecialWin}
                  >
                    {noSpecialWin ? '🔒 No Special Win: ON' : '🔓 No Special Win: OFF'}
                  </button>
                  <button
                    className={`btn btn-sm ${jokerEnabled ? 'btn-warning' : 'btn-outline'}`}
                    onClick={handleJokerEnabled}
                  >
                    {jokerEnabled ? '🃏 Joker Rule: ON' : '🃏 Joker Rule: OFF'}
                  </button>
                  <button
                    className={`btn btn-sm ${stackableDanger ? 'btn-warning' : 'btn-outline'}`}
                    onClick={handleStackableDanger}
                  >
                    {stackableDanger ? '📚 Stack Danger: ON' : '📚 Stack Danger: OFF'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {phase !== 'lobby' && (
        <PlayerHand
          hand={myHand}
          isMyTurn={isMyTurn}
          topDiscard={topDiscard}
          activeSuit={activeSuit}
          activeRank={activeRank}
          drawPenaltyCount={drawPenaltyCount}
          dangerRank={dangerRank}
          jokerPenaltyCount={jokerPenaltyCount}
          onPlayCard={handlePlayCard}
        />
      )}

      {showSuitPicker && (
        <SuitPicker onChoose={handleSuitChosen} />
      )}

      {showCardPicker && (
        <CardPicker onChoose={handleCardChosen} />
      )}

      {winner && (
        <div className="modal-overlay winner-overlay">
          <div className="modal-box winner-box">
            <div className="winner-emoji">🎉</div>
            <h2>{winner.playerId === playerId ? 'You Win!' : `${winner.username} Wins!`}</h2>
            <p className="winner-sub">
              {winner.playerId === playerId
                ? 'Congratulations! You cleared your hand!'
                : 'Better luck next time!'}
            </p>
            <button className="btn btn-primary" onClick={() => { setWinner(null); onLeave(); }}>
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

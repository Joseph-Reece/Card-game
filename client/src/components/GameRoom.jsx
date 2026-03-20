import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../socket';
import Card from './Card';
import PlayerHand from './PlayerHand';
import SuitPicker from './SuitPicker';
import CardPicker from './CardPicker';

const DIRECTION_LABELS = {
  clockwise: '→ Clockwise',
  counterclockwise: '← Counter-clockwise',
};
const SUIT_SYMBOLS = { SPADES: '♠', HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣' };

function GameRoom({ playerId, roomCode, onLeave }) {
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myHand, setMyHand] = useState([]);
  const [winner, setWinner] = useState(null);
  const [showSuitPicker, setShowSuitPicker] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastAction, setLastAction] = useState('');
  // Tracks whether the current player has played at least one card this turn
  const [hasPlayedThisTurn, setHasPlayedThisTurn] = useState(false);

  const prevTurnIndexRef = useRef(null);

  // Register this socket with the server so private handUpdated events reach us
  useEffect(() => {
    socket.emit('registerPlayer', { playerId });
  }, [playerId]);

  useEffect(() => {
    socket.on('playerUpdated', ({ players: p }) => setPlayers(p));

    socket.on('gameStarted', ({ gameState: gs, players: p }) => {
      setGameState(gs);
      setPlayers(p);
      setHasPlayedThisTurn(false);
      // hand arrives via handUpdated
    });

    socket.on('gameUpdated', ({ gameState: gs, players: p, lastAction: la }) => {
      if (gs) setGameState(gs);
      if (p) setPlayers(p);
      if (la) {
        const actionText = buildActionText(la, p || players);
        if (actionText) {
          setLastAction(actionText);
          setTimeout(() => setLastAction(''), 3500);
        }
      }
      const currentPlayers = p || players;
      const myIdx = getMyIndex(currentPlayers, playerId);
      const turnIdx = gs?.currentTurnIndex ?? -1;

      // Reset hasPlayedThisTurn whenever the active turn index changes
      if (turnIdx !== prevTurnIndexRef.current) {
        prevTurnIndexRef.current = turnIdx;
        setHasPlayedThisTurn(false);
      }

      const isMyTurnNow = turnIdx === myIdx && gs?.phase === 'playing';
      setShowSuitPicker(!!(gs?.pendingSuit && isMyTurnNow));
      setShowCardPicker(!!(gs?.pendingCard && isMyTurnNow));
    });

    socket.on('handUpdated', ({ hand }) => setMyHand(hand));

    socket.on('playerWon', ({ playerId: winnerId, username }) => {
      setWinner({ playerId: winnerId, username });
    });

    socket.on('error', ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 4000);
    });

    socket.on('playerLeft', ({ players: p }) => setPlayers(p));

    return () => {
      socket.off('playerUpdated');
      socket.off('gameStarted');
      socket.off('gameUpdated');
      socket.off('handUpdated');
      socket.off('playerWon');
      socket.off('error');
      socket.off('playerLeft');
    };
  }, [playerId, players]);

  function getMyIndex(playerList, pid) {
    return playerList.findIndex((p) => p.id === pid);
  }

  function buildActionText(la, playerList) {
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

  const myPlayer = players.find((p) => p.id === playerId);
  const isGM = myPlayer?.isGM || false;
  const phase = gameState?.phase || 'lobby';

  // Determine whose turn it is from index
  const currentTurnIndex = gameState?.currentTurnIndex ?? -1;
  const currentTurnPlayer = players[currentTurnIndex] || null;
  const isMyTurn = currentTurnPlayer?.id === playerId && phase === 'playing';

  // Derive top discard from gameState (server sends discardPile)
  const discardPile = gameState?.discardPile || [];
  const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Rule 3: activeSuit is ONLY from gameState (do NOT fall back to topDiscard.suit)
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

  // Rule 1: Done button shown only after playing a card, with no blocking states or active penalties
  const canEndTurn = isMyTurn && hasPlayedThisTurn &&
    !pendingQuestion && !gameState?.pendingSuit && !gameState?.pendingCard &&
    drawPenaltyCount === 0 && jokerPenaltyCount === 0;

  const handlePlayCard = useCallback((card) => {
    socket.emit('playCard', { roomCode, playerId, cardCode: card.code });
    setHasPlayedThisTurn(true);
  }, [roomCode, playerId]);

  const handleDrawCard = () => socket.emit('drawCard', { roomCode, playerId });

  const handleEndTurn = () => socket.emit('endTurn', { roomCode, playerId });

  const handleAnnounce = () => socket.emit('announceLastCard', { roomCode, playerId });

  const handleReady = () => {
    const currentReady = myPlayer?.isReady || false;
    socket.emit('setReady', { roomCode, playerId, isReady: !currentReady });
  };

  const handleStartGame = () => socket.emit('startGame', { roomCode, playerId });

  const handleNoSpecialWin = () => {
    socket.emit('setNoSpecialWin', { roomCode, playerId, noSpecialWin: !noSpecialWin });
  };

  const handleJokerEnabled = () => {
    socket.emit('setJokerEnabled', { roomCode, playerId, jokerEnabled: !jokerEnabled });
  };

  const handleStackableDanger = () => {
    socket.emit('setStackableDanger', { roomCode, playerId, stackableDanger: !stackableDanger });
  };

  const handleLeave = () => {
    socket.emit('leaveRoom', { roomCode, playerId });
    onLeave();
  };

  const handleSuitChosen = () => setShowSuitPicker(false);
  const handleCardChosen = () => setShowCardPicker(false);

  const otherPlayers = players.filter((p) => p.id !== playerId);
  const suitLabel = activeSuit ? `${SUIT_SYMBOLS[activeSuit] || ''} ${activeSuit}` : '—';

  return (
    <div className="gameroom">
      {/* Header */}
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

      <div className="notifications-container">
        {errorMsg && <div className="error-banner">{errorMsg}</div>}
        {lastAction && <div className="last-action-banner">{lastAction}</div>}
      </div>

      {/* Main game area */}
      <div className="gameroom-body">
        {/* Other players panel */}
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

        {/* Center table */}
        <div className="table-center">
          <div className="discard-area">
            <div className="discard-label">Discard Pile</div>
            {topDiscard ? (
              <Card card={topDiscard} />
            ) : (
              <div className="empty-discard">—</div>
            )}
          </div>

          {/* Turn indicator */}
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

          {/* Action buttons */}
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

          {/* Lobby controls */}
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

      {/* Player hand */}
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

      {/* Suit picker modal (regular Ace) */}
      {showSuitPicker && (
        <SuitPicker roomCode={roomCode} playerId={playerId} onChoose={handleSuitChosen} />
      )}

      {/* Card picker modal (Ace of Clubs) */}
      {showCardPicker && (
        <CardPicker roomCode={roomCode} playerId={playerId} onChoose={handleCardChosen} />
      )}

      {/* Winner overlay */}
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

export default GameRoom;

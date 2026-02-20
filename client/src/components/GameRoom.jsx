import { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import Card from './Card';
import PlayerHand from './PlayerHand';
import SuitPicker from './SuitPicker';

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
  const [errorMsg, setErrorMsg] = useState('');
  const [lastAction, setLastAction] = useState('');

  // Register this socket with the server so private handUpdated events reach us
  useEffect(() => {
    socket.emit('registerPlayer', { playerId });
  }, [playerId]);

  useEffect(() => {
    socket.on('playerUpdated', ({ players: p }) => setPlayers(p));

    socket.on('gameStarted', ({ gameState: gs, players: p }) => {
      setGameState(gs);
      setPlayers(p);
      // hand arrives via handUpdated
    });

    socket.on('gameUpdated', ({ gameState: gs, players: p, lastAction: la }) => {
      setGameState(gs);
      if (p) setPlayers(p);
      if (la) {
        const actionText = buildActionText(la, p || players);
        setLastAction(actionText);
        setTimeout(() => setLastAction(''), 3500);
      }
      setShowSuitPicker(!!(gs?.pendingSuit && gs?.currentTurnIndex === getMyIndex(p || players, playerId)));
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
    if (la.type === 'playCard') return `${actor} played ${la.card?.value} of ${la.card?.suit}`;
    if (la.type === 'drawCard') return `${actor} drew ${la.count} card${la.count !== 1 ? 's' : ''}`;
    if (la.type === 'chooseSuit') return `${actor} chose ${la.suit}`;
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

  const activeSuit = gameState?.activeSuit || topDiscard?.suit || null;
  const drawPenaltyCount = gameState?.drawPenaltyCount || 0;
  const direction = gameState?.direction || 'clockwise';
  const noSpecialWin = gameState?.noSpecialWin || false;

  const allReady = players.length > 1 && players.every((p) => p.isReady);

  const handlePlayCard = useCallback((card) => {
    socket.emit('playCard', { roomCode, playerId, cardCode: card.code });
  }, [roomCode, playerId]);

  const handleDrawCard = () => socket.emit('drawCard', { roomCode, playerId });

  const handleReady = () => {
    const currentReady = myPlayer?.isReady || false;
    socket.emit('setReady', { roomCode, playerId, isReady: !currentReady });
  };

  const handleStartGame = () => socket.emit('startGame', { roomCode, playerId });

  const handleNoSpecialWin = () => {
    // Server toggle: send current desired state
    socket.emit('setNoSpecialWin', { roomCode, playerId, noSpecialWin: !noSpecialWin });
  };

  const handleLeave = () => {
    socket.emit('leaveRoom', { roomCode, playerId });
    onLeave();
  };

  const handleSuitChosen = () => setShowSuitPicker(false);

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
              <span>{DIRECTION_LABELS[direction] || direction}</span>
              {drawPenaltyCount > 0 && (
                <span className="penalty-badge">⚠ Draw ×{drawPenaltyCount}</span>
              )}
            </div>
          )}
          <button className="btn btn-danger btn-sm" onClick={handleLeave}>Leave</button>
        </div>
      </header>

      {errorMsg && <div className="error-banner">{errorMsg}</div>}
      {lastAction && <div className="last-action-banner">{lastAction}</div>}

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
                ? <span className="your-turn">⭐ Your Turn!</span>
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
          drawPenaltyCount={drawPenaltyCount}
          onPlayCard={handlePlayCard}
        />
      )}

      {/* Suit picker modal */}
      {showSuitPicker && (
        <SuitPicker roomCode={roomCode} playerId={playerId} onChoose={handleSuitChosen} />
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

'use client';

import { useState, useRef } from 'react';
import type { OpenRoom } from '@/lib/types';

interface LobbyProps {
  onJoinGame: (info: { playerId: string; roomCode: string }) => void;
}

export default function Lobby({ onJoinGame }: LobbyProps) {
  const [createUsername, setCreateUsername] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(false);

  const pendingRoomCode = useRef('');

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername.trim()) return showError('Enter a username');
    setErrorMsg('');
    try {
      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: createUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return showError(data.error || 'Failed to create room');
      onJoinGame({ playerId: data.playerId, roomCode: data.roomCode });
    } catch {
      showError('Network error');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinUsername.trim()) return showError('Enter a username');
    if (!joinCode.trim()) return showError('Enter a room code');
    setErrorMsg('');
    const code = joinCode.trim().toUpperCase();
    pendingRoomCode.current = code;
    try {
      const res = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: joinUsername.trim(), roomCode: code }),
      });
      const data = await res.json();
      if (!res.ok) return showError(data.error || 'Failed to join room');
      onJoinGame({ playerId: data.playerId, roomCode: code });
    } catch {
      showError('Network error');
    }
  };

  const handleJoinOpen = async (roomCode: string) => {
    if (!joinUsername.trim()) return showError('Enter a username in the Join Room section first');
    setErrorMsg('');
    try {
      const res = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: joinUsername.trim(), roomCode }),
      });
      const data = await res.json();
      if (!res.ok) return showError(data.error || 'Failed to join room');
      onJoinGame({ playerId: data.playerId, roomCode });
    } catch {
      showError('Network error');
    }
  };

  const fetchOpenGames = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/game/rooms');
      const data = await res.json();
      setOpenRooms(Array.isArray(data) ? data : []);
    } catch {
      showError('Failed to load rooms');
    } finally {
      setLoadingRooms(false);
    }
  };

  const suitSymbols = ['♠', '♥', '♦', '♣'];

  return (
    <div className="lobby">
      <header className="lobby-header">
        <div className="lobby-suits">
          {suitSymbols.map((s, i) => (
            <span key={i} className={`lobby-suit suit-${i}`}>{s}</span>
          ))}
        </div>
        <h1 className="lobby-title">Kenyan Local Poker</h1>
        <p className="lobby-subtitle">The classic card game — local rules, big fun</p>
      </header>

      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      <div className="lobby-forms">
        <div className="lobby-card">
          <h2>🃏 Create Room</h2>
          <form onSubmit={handleCreate}>
            <input
              type="text"
              placeholder="Your username"
              value={createUsername}
              maxLength={20}
              onChange={(e) => setCreateUsername(e.target.value)}
              className="lobby-input"
            />
            <button type="submit" className="btn btn-primary">Create Room</button>
          </form>
        </div>

        <div className="lobby-card">
          <h2>🎮 Join Room</h2>
          <form onSubmit={handleJoin}>
            <input
              type="text"
              placeholder="Your username"
              value={joinUsername}
              maxLength={20}
              onChange={(e) => setJoinUsername(e.target.value)}
              className="lobby-input"
            />
            <input
              type="text"
              placeholder="Room code"
              value={joinCode}
              maxLength={10}
              onChange={(e) => setJoinCode(e.target.value)}
              className="lobby-input"
            />
            <button type="submit" className="btn btn-secondary">Join Room</button>
          </form>
        </div>
      </div>

      <div className="open-games">
        <div className="open-games-header">
          <h2>🌐 Open Games</h2>
          <button onClick={fetchOpenGames} className="btn btn-outline" disabled={loadingRooms}>
            {loadingRooms ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {openRooms.length === 0 ? (
          <p className="no-rooms">No open rooms. Create one or refresh!</p>
        ) : (
          <ul className="rooms-list">
            {openRooms.map((room) => (
              <li key={room.roomCode} className="room-item">
                <div className="room-info">
                  <span className="room-code">{room.roomCode}</span>
                  <span className="room-meta">
                    GM: {room.gmName} · {room.playerCount} player{room.playerCount !== 1 ? 's' : ''}
                  </span>
                  <span className={`room-phase phase-${room.phase}`}>{room.phase}</span>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => handleJoinOpen(room.roomCode)}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';

function Lobby({ onJoinGame }) {
  const [createUsername, setCreateUsername] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [openRooms, setOpenRooms] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(false);
  // Track the room code the player is trying to join (for roomJoined event which lacks it)
  const pendingRoomCode = useRef('');

  useEffect(() => {
    socket.connect();

    socket.on('roomCreated', ({ roomCode, playerId }) => {
      onJoinGame({ playerId, roomCode });
    });

    socket.on('roomJoined', ({ playerId }) => {
      onJoinGame({ playerId, roomCode: pendingRoomCode.current });
    });

    socket.on('openRooms', (rooms) => {
      setOpenRooms(rooms);
      setLoadingRooms(false);
    });

    socket.on('error', ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 4000);
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('openRooms');
      socket.off('error');
    };
  }, [onJoinGame]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!createUsername.trim()) return setErrorMsg('Enter a username');
    setErrorMsg('');
    socket.emit('createRoom', { username: createUsername.trim() });
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!joinUsername.trim()) return setErrorMsg('Enter a username');
    if (!joinCode.trim()) return setErrorMsg('Enter a room code');
    setErrorMsg('');
    const code = joinCode.trim().toUpperCase();
    pendingRoomCode.current = code;
    socket.emit('joinRoom', { username: joinUsername.trim(), roomCode: code });
  };

  const handleJoinOpen = (roomCode) => {
    if (!joinUsername.trim()) return setErrorMsg('Enter a username in the Join Room section first');
    setErrorMsg('');
    pendingRoomCode.current = roomCode;
    socket.emit('joinRoom', { username: joinUsername.trim(), roomCode });
  };

  const fetchOpenGames = () => {
    setLoadingRooms(true);
    socket.emit('getOpenRooms');
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
        {/* Create Room */}
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

        {/* Join Room */}
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

      {/* Open Games */}
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

export default Lobby;

import { useState } from 'react';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import './App.css';

function App() {
  const [screen, setScreen] = useState('lobby');
  const [playerId, setPlayerId] = useState(null);
  const [roomCode, setRoomCode] = useState('');

  const handleJoinGame = ({ playerId: pid, roomCode: rc }) => {
    setPlayerId(pid);
    setRoomCode(rc);
    setScreen('game');
  };

  const handleLeave = () => {
    setScreen('lobby');
    setPlayerId(null);
    setRoomCode('');
  };

  return (
    <div className="app">
      {screen === 'lobby' ? (
        <Lobby onJoinGame={handleJoinGame} />
      ) : (
        <GameRoom playerId={playerId} roomCode={roomCode} onLeave={handleLeave} />
      )}
    </div>
  );
}

export default App;

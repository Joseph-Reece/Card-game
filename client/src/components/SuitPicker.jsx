import { socket } from '../socket';

const SUITS = [
  { value: 'SPADES', label: '♠ Spades', color: '#f0f0f0' },
  { value: 'HEARTS', label: '♥ Hearts', color: '#e74c3c' },
  { value: 'DIAMONDS', label: '♦ Diamonds', color: '#e74c3c' },
  { value: 'CLUBS', label: '♣ Clubs', color: '#f0f0f0' },
];

function SuitPicker({ roomCode, playerId, onChoose }) {
  const handleChoose = (suit) => {
    socket.emit('chooseSuit', { roomCode, playerId, suit });
    if (onChoose) onChoose(suit);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box suit-picker">
        <h2>Choose a Suit</h2>
        <p>You played an Ace — pick the active suit:</p>
        <div className="suit-buttons">
          {SUITS.map((s) => (
            <button
              key={s.value}
              className="suit-btn"
              style={{ color: s.color }}
              onClick={() => handleChoose(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SuitPicker;

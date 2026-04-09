import { useState } from 'react';
import { socket } from '../socket';

const SUITS = [
  { value: 'SPADES',   label: '♠ Spades',   color: '#f0f0f0' },
  { value: 'HEARTS',   label: '♥ Hearts',   color: '#e74c3c' },
  { value: 'DIAMONDS', label: '♦ Diamonds', color: '#e74c3c' },
  { value: 'CLUBS',    label: '♣ Clubs',    color: '#f0f0f0' },
];
const RANKS = ['ACE','2','3','4','5','6','7','8','9','10','JACK','QUEEN','KING'];

function CardPicker({ roomCode, playerId, onChoose }) {
  const [selectedRank, setSelectedRank] = useState(null);

  const handleChoose = (suit) => {
    if (!selectedRank) return;
    socket.emit('chooseCard', { roomCode, playerId, rank: selectedRank, suit });
    if (onChoose) onChoose(selectedRank, suit);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box card-picker">
        <h2>♣ Ace of Clubs Power!</h2>
        <p>Choose the target card (rank + suit). The next player must match both.</p>

        <div className="picker-step">
          <h3>Step 1: Choose Rank</h3>
          <div className="rank-buttons">
            {RANKS.map(r => (
              <button
                key={r}
                className={`rank-btn${selectedRank === r ? ' selected' : ''}`}
                onClick={() => setSelectedRank(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {selectedRank && (
          <div className="picker-step">
            <h3>Step 2: Choose Suit</h3>
            <div className="suit-buttons">
              {SUITS.map(s => (
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
        )}
      </div>
    </div>
  );
}

export default CardPicker;

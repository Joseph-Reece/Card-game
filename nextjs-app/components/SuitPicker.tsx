'use client';

const SUITS = [
  { value: 'SPADES', label: '♠ Spades', color: '#f0f0f0' },
  { value: 'HEARTS', label: '♥ Hearts', color: '#e74c3c' },
  { value: 'DIAMONDS', label: '♦ Diamonds', color: '#e74c3c' },
  { value: 'CLUBS', label: '♣ Clubs', color: '#f0f0f0' },
];

interface SuitPickerProps {
  onChoose: (suit: string) => void;
}

export default function SuitPicker({ onChoose }: SuitPickerProps) {
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
              onClick={() => onChoose(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

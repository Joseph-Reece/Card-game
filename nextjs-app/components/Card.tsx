import type { CardObj } from '@/lib/types';

interface CardProps {
  card?: CardObj;
  isPlayable?: boolean;
  onClick?: (() => void) | null;
  faceDown?: boolean;
}

export default function Card({ card, isPlayable, onClick, faceDown }: CardProps) {
  if (faceDown) {
    return (
      <div className="card-component card-facedown">
        <img
          src="https://deckofcardsapi.com/static/img/back.png"
          alt="Card back"
          draggable={false}
        />
      </div>
    );
  }

  const imageUrl = card?.image || `https://deckofcardsapi.com/static/img/${card?.code}.png`;

  return (
    <div
      className={`card-component${isPlayable ? ' card-playable' : ''}${onClick ? ' card-clickable' : ''}`}
      onClick={isPlayable && onClick ? onClick : undefined}
      title={isPlayable ? `Play ${card?.value} of ${card?.suit}` : card ? `${card.value} of ${card.suit}` : ''}
    >
      <img
        src={imageUrl}
        alt={card ? `${card.value} of ${card.suit}` : 'Card'}
        draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).src = 'https://deckofcardsapi.com/static/img/back.png'; }}
      />
      {isPlayable && <div className="card-glow" />}
    </div>
  );
}

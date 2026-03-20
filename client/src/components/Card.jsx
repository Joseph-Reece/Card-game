function Card({ card, isPlayable, onClick, faceDown }) {
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
        onError={(e) => { e.target.src = 'https://deckofcardsapi.com/static/img/back.png'; }}
      />
      {isPlayable && <div className="card-glow" />}
    </div>
  );
}

export default Card;

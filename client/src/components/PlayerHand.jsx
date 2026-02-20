import Card from './Card';

function isCardPlayable(card, topDiscard, activeSuit, drawPenaltyCount) {
  if (!topDiscard) return true;

  if (drawPenaltyCount > 0) {
    // Only 2, 3, or Ace can be played to counter a penalty
    return ['2', '3', 'ACE'].includes(card.value);
  }

  const matchesSuit = card.suit === activeSuit || card.suit === topDiscard.suit;
  const matchesRank = card.value === topDiscard.value;
  return matchesSuit || matchesRank;
}

function PlayerHand({ hand, isMyTurn, topDiscard, activeSuit, drawPenaltyCount, onPlayCard }) {
  return (
    <div className="player-hand">
      <div className="hand-label">Your Hand ({hand.length} cards)</div>
      <div className="hand-cards">
        {hand.map((card) => {
          const playable = isMyTurn && isCardPlayable(card, topDiscard, activeSuit, drawPenaltyCount);
          return (
            <Card
              key={card.code}
              card={card}
              isPlayable={playable}
              onClick={playable ? () => onPlayCard(card) : null}
            />
          );
        })}
        {hand.length === 0 && (
          <div className="empty-hand">No cards in hand</div>
        )}
      </div>
    </div>
  );
}

export default PlayerHand;

import Card from './Card';

function isCardPlayable(card, topDiscard, activeSuit, activeRank, drawPenaltyCount, dangerRank, jokerPenaltyCount) {
  if (!topDiscard) return true;
  const rank = card.value.toUpperCase();
  const suit = card.suit.toUpperCase();

  // Rule 11: under joker penalty only Ace or Joker can be played
  if (jokerPenaltyCount > 0) return rank === 'ACE' || rank === 'JOKER';

  // Rule 10: under draw penalty only Ace or same danger-rank can be played
  if (drawPenaltyCount > 0) {
    if (rank === 'ACE') return true;
    if (dangerRank && rank === dangerRank.toUpperCase()) return true;
    return false;
  }

  // Rule 6: Ace-of-Clubs effect – must match both rank AND suit, or play Ace
  if (activeRank && activeSuit) {
    if (rank === 'ACE') return true;
    return rank === activeRank.toUpperCase() && suit === activeSuit.toUpperCase();
  }

  // Rule 3: after a regular Ace only the chosen suit is valid
  if (activeSuit) return suit === activeSuit.toUpperCase();

  // Joker: always playable in normal play
  if (rank === 'JOKER') return true;

  // Normal: rank or suit matches the top discard
  return rank === topDiscard.value.toUpperCase() || suit === topDiscard.suit.toUpperCase();
}

function PlayerHand({ hand, isMyTurn, topDiscard, activeSuit, activeRank, drawPenaltyCount, dangerRank, jokerPenaltyCount, onPlayCard }) {
  return (
    <div className="player-hand">
      <div className="hand-label">Your Hand ({hand.length} cards)</div>
      <div className="hand-cards">
        {hand.map((card) => {
          const playable = isMyTurn && isCardPlayable(card, topDiscard, activeSuit, activeRank, drawPenaltyCount, dangerRank, jokerPenaltyCount);
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

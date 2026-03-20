import Card from './Card';
import type { CardObj } from '@/lib/types';

function isCardPlayable(
  card: CardObj,
  topDiscard: CardObj | null,
  activeSuit: string | null,
  activeRank: string | null,
  drawPenaltyCount: number,
  dangerRank: string | null,
  jokerPenaltyCount: number,
): boolean {
  if (!topDiscard) return true;
  const rank = card.value.toUpperCase();
  const suit = card.suit.toUpperCase();

  if (jokerPenaltyCount > 0) return rank === 'ACE' || rank === 'JOKER';

  if (drawPenaltyCount > 0) {
    if (rank === 'ACE') return true;
    if (dangerRank && rank === dangerRank.toUpperCase()) return true;
    return false;
  }

  if (activeRank && activeSuit) {
    if (rank === 'ACE') return true;
    return rank === activeRank.toUpperCase() && suit === activeSuit.toUpperCase();
  }

  if (activeSuit) return suit === activeSuit.toUpperCase();

  if (rank === 'JOKER') return true;

  return rank === topDiscard.value.toUpperCase() || suit === topDiscard.suit.toUpperCase();
}

interface PlayerHandProps {
  hand: CardObj[];
  isMyTurn: boolean;
  topDiscard: CardObj | null;
  activeSuit: string | null;
  activeRank: string | null;
  drawPenaltyCount: number;
  dangerRank: string | null;
  jokerPenaltyCount: number;
  onPlayCard: (card: CardObj) => void;
}

export default function PlayerHand({
  hand,
  isMyTurn,
  topDiscard,
  activeSuit,
  activeRank,
  drawPenaltyCount,
  dangerRank,
  jokerPenaltyCount,
  onPlayCard,
}: PlayerHandProps) {
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

import type { CardObj } from './types';

const BASE_URL = 'https://deckofcardsapi.com/api/deck';

export async function newDeck(jokerEnabled = false): Promise<string> {
  const jokerParam = jokerEnabled ? '&jokers_enabled=true' : '';
  const res = await fetch(`${BASE_URL}/new/shuffle/?deck_count=1${jokerParam}`);
  if (!res.ok) throw new Error(`Failed to create deck: ${res.statusText}`);
  const data = await res.json();
  return data.deck_id;
}

export async function drawCards(deckId: string, count: number): Promise<CardObj[]> {
  const res = await fetch(`${BASE_URL}/${deckId}/draw/?count=${count}`);
  if (!res.ok) throw new Error(`Failed to draw cards: ${res.statusText}`);
  const data = await res.json();
  if (!data.cards || data.cards.length === 0) throw new Error('Draw failed: deck is empty');
  return data.cards;
}

export async function reshuffleDeck(deckId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${deckId}/shuffle/`);
  if (!res.ok) throw new Error(`Failed to reshuffle deck: ${res.statusText}`);
}

export async function createFreshDeck(): Promise<string> {
  return newDeck();
}

export async function reshuffleDiscardPile(discardPile: CardObj[]): Promise<string> {
  if (!discardPile || discardPile.length <= 1) {
    return newDeck();
  }
  const cardsToReshuffle = discardPile.slice(0, -1);
  const codes = cardsToReshuffle.map(c => c.code).join(',');
  const res = await fetch(`${BASE_URL}/new/shuffle/?cards=${codes}`);
  if (!res.ok) throw new Error(`Failed to create deck from discard: ${res.statusText}`);
  const data = await res.json();
  return data.deck_id;
}

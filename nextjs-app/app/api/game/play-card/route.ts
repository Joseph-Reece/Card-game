import { NextRequest, NextResponse } from 'next/server';
import { playCard } from '@/lib/gameManager';
import { getRoom } from '@/lib/store';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await playCard(body.roomCode, body.playerId, body.cardCode);

    await pusher.trigger(body.roomCode, 'gameUpdated', {
      gameState: result.gameState,
      players: result.players,
      lastAction: result.lastAction,
      canContinue: result.canContinue,
    });

    if (result.handUpdates) {
      for (const [pid, hand] of Object.entries(result.handUpdates)) {
        await pusher.trigger(`private-player-${pid}`, 'handUpdated', { hand });
      }
    }

    if (result.winnerId) {
      const room = await getRoom(body.roomCode);
      const winner = room?.players.find(p => p.id === result.winnerId);
      await pusher.trigger(body.roomCode, 'playerWon', {
        playerId: result.winnerId,
        username: winner?.username || 'Unknown',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

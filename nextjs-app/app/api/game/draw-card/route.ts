import { NextRequest, NextResponse } from 'next/server';
import { drawCard } from '@/lib/gameManager';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await drawCard(body.roomCode, body.playerId);

    await pusher.trigger(body.roomCode, 'gameUpdated', {
      gameState: result.gameState,
      players: result.players,
      lastAction: result.lastAction,
      canContinue: false,
    });

    if (result.handUpdates) {
      for (const [pid, hand] of Object.entries(result.handUpdates)) {
        await pusher.trigger(`private-player-${pid}`, 'handUpdated', { hand });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

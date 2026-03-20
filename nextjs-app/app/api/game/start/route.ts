import { NextRequest, NextResponse } from 'next/server';
import { startGame } from '@/lib/gameManager';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await startGame(body.roomCode, body.playerId);

    await pusher.trigger(body.roomCode, 'gameStarted', {
      gameState: result.gameState,
      players: result.players,
    });

    // Send each player their private hand
    for (const [pid, hand] of Object.entries(result.hands)) {
      await pusher.trigger(`private-player-${pid}`, 'handUpdated', { hand });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

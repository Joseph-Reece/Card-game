import { NextRequest, NextResponse } from 'next/server';
import { chooseSuit, drawCard } from '@/lib/gameManager';
import { getRoom } from '@/lib/store';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await chooseSuit(body.roomCode, body.playerId, body.suit);

    await pusher.trigger(body.roomCode, 'gameUpdated', {
      gameState: result.gameState,
      players: result.players,
      lastAction: result.lastAction,
      canContinue: false,
    });

    // noSpecialWin forced-draw case
    if (result.lastAction && (result.lastAction as Record<string, unknown>).forcedDraw) {
      const drawResult = await drawCard(body.roomCode, body.playerId);
      await pusher.trigger(body.roomCode, 'gameUpdated', {
        gameState: drawResult.gameState,
        players: drawResult.players,
        lastAction: drawResult.lastAction,
        canContinue: false,
      });
      if (drawResult.handUpdates) {
        for (const [pid, hand] of Object.entries(drawResult.handUpdates)) {
          await pusher.trigger(`private-player-${pid}`, 'handUpdated', { hand });
        }
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

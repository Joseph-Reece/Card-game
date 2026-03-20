import { NextRequest, NextResponse } from 'next/server';
import { announceLastCard } from '@/lib/gameManager';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await announceLastCard(body.roomCode, body.playerId);

    await pusher.trigger(body.roomCode, 'gameUpdated', {
      players: result.players,
      lastAction: result.lastAction,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

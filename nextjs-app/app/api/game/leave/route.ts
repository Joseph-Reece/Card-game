import { NextRequest, NextResponse } from 'next/server';
import { leaveRoom } from '@/lib/gameManager';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await leaveRoom(body.roomCode, body.playerId);

    if (!result.roomDeleted) {
      await pusher.trigger(body.roomCode, 'playerLeft', { players: result.players });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

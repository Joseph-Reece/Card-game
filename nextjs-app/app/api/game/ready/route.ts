import { NextRequest, NextResponse } from 'next/server';
import { setReady } from '@/lib/gameManager';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await setReady(body.roomCode, body.playerId, body.isReady);
    await pusher.trigger(body.roomCode, 'playerUpdated', { players: result.players });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

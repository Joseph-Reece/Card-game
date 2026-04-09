import { NextRequest, NextResponse } from 'next/server';
import { joinRoom } from '@/lib/gameManager';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.roomCode || !body.username) {
      return NextResponse.json({ error: 'roomCode and username are required' }, { status: 400 });
    }
    const result = await joinRoom(body.roomCode, body.username);

    await pusher.trigger(body.roomCode, 'playerUpdated', { players: result.players });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

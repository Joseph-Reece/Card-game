import { NextRequest, NextResponse } from 'next/server';
import { setNoSpecialWin, setJokerEnabled, setStackableDanger } from '@/lib/gameManager';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomCode, playerId, rule, value } = body;

    let result: { gameState: unknown };
    if (rule === 'noSpecialWin') {
      result = await setNoSpecialWin(roomCode, playerId, value);
    } else if (rule === 'jokerEnabled') {
      result = await setJokerEnabled(roomCode, playerId, value);
    } else if (rule === 'stackableDanger') {
      result = await setStackableDanger(roomCode, playerId, value);
    } else {
      return NextResponse.json({ error: 'Unknown rule' }, { status: 400 });
    }

    await pusher.trigger(roomCode, 'gameUpdated', {
      gameState: result.gameState,
      lastAction: { type: 'ruleChange', [rule]: value },
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

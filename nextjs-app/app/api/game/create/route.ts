import { NextRequest, NextResponse } from 'next/server';
import { createRoom } from '@/lib/gameManager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.username) return NextResponse.json({ error: 'username is required' }, { status: 400 });
    const result = await createRoom(body.username);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

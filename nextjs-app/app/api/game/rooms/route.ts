import { NextResponse } from 'next/server';
import { getOpenRooms } from '@/lib/gameManager';

export async function GET() {
  try {
    const rooms = await getOpenRooms();
    return NextResponse.json(rooms);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

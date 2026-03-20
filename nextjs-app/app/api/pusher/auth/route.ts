import { NextRequest, NextResponse } from 'next/server';
import pusher from '@/lib/pusher';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id')!;
  const channelName = params.get('channel_name')!;

  const auth = pusher.authorizeChannel(socketId, channelName);
  return NextResponse.json(auth);
}

import { Redis } from '@upstash/redis';
import type { Room } from './types';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });
  }
  return redis;
}

export async function getRoom(roomCode: string): Promise<Room | null> {
  const redis = getRedis();
  const data = await redis.get<Room>(`room:${roomCode}`);
  return data || null;
}

export async function setRoom(roomCode: string, room: Room): Promise<void> {
  const redis = getRedis();
  await redis.set(`room:${roomCode}`, room, { ex: 86400 });
}

export async function deleteRoom(roomCode: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`room:${roomCode}`);
}

export async function getAllRoomCodes(): Promise<string[]> {
  const redis = getRedis();
  const keys = await redis.keys('room:*');
  return keys.map((k: string) => k.replace('room:', ''));
}

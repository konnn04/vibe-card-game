import { NextResponse } from 'next/server';
import type { RoomRecord } from './room';
import { publicRoom, verify } from './room';
import { publicView } from '@u-no/game-engine';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (reason: string, status = 400) => NextResponse.json({ error: reason }, { status });

export interface Identity { playerId: string; token: string }

export async function readBody<T>(req: Request): Promise<T & Partial<Identity>> {
  try {
    return (await req.json()) as T & Partial<Identity>;
  } catch {
    return {} as T & Partial<Identity>;
  }
}

/** Snapshot đầy đủ cho 1 người: state công khai + bài thật của chính họ. */
export function snapshotFor(room: RoomRecord, playerId: string, token: string) {
  const authed = verify(room, playerId, token);
  return {
    room: publicRoom(room),
    game: room.game ? publicView(room.game) : null,
    hand: authed && room.game ? (room.game.players.find((p) => p.id === playerId)?.hand ?? []) : [],
    you: authed ? playerId : null,
  };
}

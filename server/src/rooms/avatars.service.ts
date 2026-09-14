import { Injectable } from '@nestjs/common';

@Injectable()
export class AvatarsService {
  // roomCode -> (playerId -> avatarDataUrl / avatarUrl)
  private avatarsByRoom = new Map<string, Map<string, string>>();

  setAvatar(roomCode: string, playerId: string, image: string | null): void {
    if (!this.avatarsByRoom.has(roomCode)) {
      this.avatarsByRoom.set(roomCode, new Map());
    }
    const roomAvatars = this.avatarsByRoom.get(roomCode)!;
    if (image) {
      roomAvatars.set(playerId, image);
    } else {
      roomAvatars.delete(playerId);
    }
  }

  getAvatars(roomCode: string): Record<string, string> {
    const map = this.avatarsByRoom.get(roomCode);
    if (!map) return {};
    return Object.fromEntries(map.entries());
  }

  removePlayer(roomCode: string, playerId: string): void {
    const map = this.avatarsByRoom.get(roomCode);
    if (map) {
      map.delete(playerId);
    }
  }

  clearRoom(roomCode: string): void {
    this.avatarsByRoom.delete(roomCode);
  }
}

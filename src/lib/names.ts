import { makeRoomCode, NAME_MAX, NAME_MIN } from '@/src/config';

const ADJ = ['Swift', 'Lucky', 'Crimson', 'Silent', 'Wild', 'Neon', 'Turbo', 'Cosmic', 'Brave', 'Sly', 'Golden', 'Frosty'];
const NOUN = ['Fox', 'Panda', 'Tiger', 'Otter', 'Falcon', 'Dragon', 'Koala', 'Wolf', 'Raven', 'Shark', 'Gecko', 'Bunny'];

/** AdjectiveNoun#### — VD: SwiftFox182 */
export function randomName(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a}${n}${Math.floor(Math.random() * 900 + 100)}`;
}

export const BOT_NAMES = ['Dusty', 'Pudding', 'Luna', 'Mochi', 'Pixel', 'Cocoa'];

export function validName(v: string): boolean {
  const n = v.trim().length;
  return n >= NAME_MIN && n <= NAME_MAX;
}

export const roomCode = makeRoomCode;

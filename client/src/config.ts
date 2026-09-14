/* ─────────────────────────────────────────────────────────────────────────
 * THAM SỐ CHỈNH ĐƯỢC CỦA GAME (RE-EXPORTED FROM @u-no/shared)
 *
 * Toàn bộ cấu hình bot, timing, match, net, UI, mã phòng đã được gom vào
 * @u-no/shared/src/config.ts để dùng chung giữa Client và Server.
 * File này re-export lại để giữ nguyên tương thích cho client.
 * ───────────────────────────────────────────────────────────────────────── */

export {
  BOT,
  BOT_NAMES,
  MATCH,
  NET,
  UI,
  CHAT,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_RE,
  makeRoomCode,
  NAME_MIN,
  NAME_MAX,
} from '@u-no/shared';


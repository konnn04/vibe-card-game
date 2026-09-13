'use client';
import { ref, onValue } from 'firebase/database';
import { MAX_HOLD_MS } from '@u-no/game-engine';
import { getFirebaseClientDb, hasFirebaseClient } from '@/src/lib/firebase';

/**
 * ĐỒNG HỒ CHUNG client <-> server.
 *
 * VÌ SAO PHẢI CÓ FILE NÀY (lỗi "khựt/treo, không biết bài đánh ra hay chưa"):
 * engine ghi các mốc thời gian TUYỆT ĐỐI — `turnHoldUntil`, `turnDeadline` —
 * bằng `Date.now()` của MÁY CHẠY ENGINE. Ở chế độ online máy đó là SERVER
 * (src/server/room.ts gọi `reduce(room.game, action, Date.now())`), nhưng client
 * lại so mốc đó với `Date.now()` của CHÍNH NÓ. Hai đồng hồ này không bao giờ
 * bằng nhau (máy người dùng lệch vài giây là chuyện thường).
 *
 * Hậu quả khi máy người chơi CHẬM hơn server N giây:
 *   `Date.now() < turnHoldUntil` luôn đúng -> `useTurnHold()` kẹt ở true
 *   -> `interactive = ... && !holding` tắt toàn bộ bài, đồng hồ lượt đứng im.
 * Mỗi lượt engine lại nạp mốc mới nên nó KHÔNG BAO GIỜ tự thoát -> treo cứng.
 *
 * Firebase Realtime DB có sẵn `.info/serverTimeOffset`: số ms cần cộng vào
 * `Date.now()` của client để ra giờ server. Đăng ký 1 lần, dùng chung mọi nơi.
 * Chế độ chơi offline với bot thì engine chạy ngay trong tab, offset = 0 nên
 * `serverNow()` trùng `Date.now()` — dùng chung một hàm cho cả 2 chế độ.
 */
let offset = 0;
let started = false;

/**
 * ENGINE ĐANG CHẠY Ở ĐÂU — quyết định đồng hồ nào là chuẩn:
 *  - 'local'  : chơi với máy, engine chạy NGAY TRONG TAB bằng Date.now()
 *               (createGame/startRound mặc định `now = Date.now()`)
 *               -> chuẩn là Date.now(), offset PHẢI bằng 0.
 *  - 'remote' : chơi online, engine chạy trên server -> cộng offset.
 *
 * LỖI ĐÃ SỬA: trước đây luôn cộng offset, kể cả khi đánh với máy. Mốc
 * turnHoldUntil/turnDeadline do createGame sinh ra theo Date.now() lại bị đem
 * so với Date.now()+offset, nên máy lệch giờ server bao nhiêu thì mọi mốc coi
 * như đã trôi qua bấy nhiêu: đồng hồ KHÔNG BAO GIỜ dừng ở giai đoạn "trước
 * đánh", turnDeadline bị trừ sẵn, và holdRemain=0 khiến bot đánh đè lên
 * animation đang chạy.
 */
let authority: 'local' | 'remote' = 'local';

/** Chơi với máy: engine ở trong tab -> dùng thẳng Date.now(). */
export function setLocalClock() {
  authority = 'local';
}

/** Bắt đầu theo dõi lệch giờ server (idempotent, gọi bao nhiêu lần cũng được). */
export function startClockSync() {
  authority = 'remote';
  if (started || typeof window === 'undefined' || !hasFirebaseClient) return;
  started = true;
  const db = getFirebaseClientDb();
  if (!db) return;
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    const v = snap.val();
    if (typeof v === 'number' && Number.isFinite(v)) offset = v;
  });
}

/**
 * Giờ hiện tại THEO ĐỒNG HỒ CỦA ENGINE — dùng để so với mọi mốc trong
 * GameState (turnHoldUntil, turnDeadline). Chơi với máy thì chính là Date.now().
 */
export function serverNow(): number {
  return authority === 'remote' ? Date.now() + offset : Date.now();
}

/**
 * Trần an toàn cho mọi khoảng "giữ nhịp" (ms) — hằng số dùng CHUNG với engine
 * và server (packages/game-engine MAX_HOLD_MS). Chỉ để chống treo vĩnh viễn
 * khi một mốc thời gian bị hỏng, KHÔNG dùng để cắt ngắn animation: cắt sớm là
 * bot hành động đè lên animation rút bài đang chạy.
 */

export function holdRemaining(holdUntil: number | undefined | null): number {
  if (typeof holdUntil !== 'number' || !Number.isFinite(holdUntil)) return 0;
  const remain = holdUntil - serverNow();
  if (remain <= 0) return 0;
  return Math.min(remain, MAX_HOLD_MS);
}

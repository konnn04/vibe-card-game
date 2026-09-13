/* ─────────────────────────────────────────────────────────────────────────
 * THAM SỐ CHỈNH ĐƯỢC CỦA GAME
 *
 * Nơi duy nhất để chỉnh các con số "cảm giác" nằm rải rác trong code: bot nghĩ
 * bao lâu, toast tắt sau mấy giây, poll mạng mấy lần một phút, mã phòng mấy ký
 * tự... Trước đây mỗi con số nằm ngay chỗ nó được dùng, muốn chỉnh nhịp game
 * phải đi mò từng file và rất dễ sửa chỗ này quên chỗ kia (mã phòng từng được
 * khai ở BA nơi với ba bản sao của cùng một bảng chữ cái).
 *
 * KHÔNG gom vào đây:
 *  - Thời lượng ANIMATION: `src/state/timeline.ts`. Các số đó phải nằm cạnh
 *    nhau với hàm tính nhịp, và được chính tween import — tách ra là chúng trôi
 *    khỏi nhau, đúng loại lỗi timeline.ts sinh ra để chặn.
 *  - Hằng số LUẬT CHƠI (thời gian giữ lượt, ân hạn hô Ú Nồ, điểm từng lá):
 *    `packages/game-engine`. Engine phải chạy được ở server, không được phụ
 *    thuộc bất cứ thứ gì của client.
 *  - Bảng màu / chủ đề nền: `src/lib/themes.ts`.
 * ───────────────────────────────────────────────────────────────────────── */

/** BOT chơi cục bộ — thời gian "nghĩ" (ms). */
export const BOT = {
  /** Rút tiếp lá kế trong một chuỗi rút: gần như tức thì, người chơi đã quyết rồi. */
  drawRunDelay: 120,
  /** Chọn màu sau khi đánh Wild. */
  pickColor: [300, 150] as [base: number, jitter: number],
  /** Chọn người để đổi bài (luật 7). */
  pickSwap: [360, 150] as [base: number, jitter: number],
  /** Lượt đánh thường. */
  play: [320, 160] as [base: number, jitter: number],
  /** Lượt đánh khi vừa rút bài xong — đã cầm lá trên tay, không cần nghĩ lâu. */
  playAfterDraw: [220, 160] as [base: number, jitter: number],
  /** Phản ứng ngoài lượt (bắt lỗi, bắt quên hô). */
  react: [700, 400] as [base: number, jitter: number],
  /**
   * Cộng thêm sau ân hạn hô Ú Nồ trước khi bot được bắt lỗi. Không có khoảng
   * này thì bot bấm ngay mili-giây đầu tiên và người thật không bao giờ kịp hô.
   */
  catchRushExtra: 400,
} as const;

/** Nhịp đập của ván đấu ở phía client (ms). */
export const MATCH = {
  /** Chu kỳ kiểm tra hết giờ lượt (chế độ chơi với bot). */
  tickMs: 500,
  /** Sai số cho phép trước khi tự TIMEOUT — tránh cướp lượt vì lệch đồng hồ vài chục ms. */
  timeoutSlackMs: 200,
  /** Hiệu ứng (Fx) sống bao lâu rồi bị dọn khỏi hàng. */
  fxTtlMs: 2600,
  /** Số hiệu ứng giữ lại tối đa — nhiều hơn nữa thì màn hình cũng không đọc nổi. */
  fxMax: 12,
  /** Nhịp kiểm tra "animation xong chưa" trong lúc chờ một bước. */
  frameProbeMs: 60,
} as const;

/** Mạng (ms). */
export const NET = {
  /** Chu kỳ poll snapshot khi KHÔNG có Firebase realtime (hoặc chạy trong Discord Activity). */
  pollMs: 1000,
  /** Chờ tối đa lúc tải tài nguyên ở màn loading rồi vào game bằng mọi giá. */
  preloadTimeoutMs: 12000,
  /** Nhịp nghỉ cuối màn loading để thanh tiến trình chạy hết 100%, không giật tắt. */
  preloadSettleMs: 260,
} as const;

/** Giao diện (ms). */
export const UI = {
  /** Toast báo lỗi/từ chối tự tắt. */
  toastMs: 1600,
  /** Nhãn "Đã copy" trở lại bình thường. */
  copiedMs: 1600,
  /** Ăn mừng trước khi mở bảng điểm. */
  celebrateMs: 3000,
  /**
   * Bảng điểm cuối ván: nút 'Ván tiếp' KHOÁ chừng này rồi TỰ vào ván mới.
   *
   * Chỉ áp dụng cho phòng online — ở đó ván mới bắt đầu cho CẢ BÀN, nên phải có
   * một khoảng chung để mọi người kịp đọc điểm, và không thể để một người bấm
   * sớm kéo cả bàn đi. Chơi với bot thì bàn chỉ có mình, bấm là đi ngay.
   */
  nextRoundMs: 5000,
  /** Badge đổi chiều chớp sáng. */
  directionFlashMs: 650,
  /** Một bước đếm ngược trước ván. */
  countdownStepMs: 700,
  /** Đợi sau khi đếm xong rồi mới vào bàn. */
  countdownOutroMs: 420,
  /** Nhịp cập nhật đồng hồ lượt trên HUD. */
  clockTickMs: 200,
  /** Tự rút lá kế khi đang trong chuỗi rút (người thật). */
  autoDrawMs: 750,
  /** Cạnh tối đa của ảnh avatar sau khi cắt — giới hạn cứng để texture không phá GPU. */
  avatarPx: 256,
} as const;

/* ─────────────────────────────────────────────────────────── mã phòng */

/**
 * Bảng chữ cái sinh mã phòng: KHÔNG có I, O, 0, 1 — người chơi phải đọc mã cho
 * nhau qua voice chat, mấy ký tự đó nghe/nhìn là nhầm ngay.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** Mã hợp lệ — dùng chung cho cả ô nhập tay lẫn mã đọc từ URL. */
export const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const makeRoomCode = () =>
  Array.from(
    { length: ROOM_CODE_LENGTH },
    () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)],
  ).join('');

/** Giới hạn tên người chơi. */
export const NAME_MIN = 2;
export const NAME_MAX = 16;

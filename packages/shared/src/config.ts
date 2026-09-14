/* ─────────────────────────────────────────────────────────────────────────
 * THAM SỐ CHỈNH ĐƯỢC CỦA GAME (DÙNG CHUNG CLIENT & SERVER)
 *
 * Nơi duy nhất để chỉnh các con số "cảm giác" và cấu hình dùng chung giữa
 * Client, Server và Gateway: bot nghĩ bao lâu, toast tắt sau mấy giây,
 * poll mạng, mã phòng, giới hạn tên, giới hạn chat...
 *
 * KHÔNG gom vào đây:
 *  - Thời lượng ANIMATION: `client/src/state/timeline.ts`. Các số đó phải nằm
 *    cạnh nhau với hàm tính nhịp, và được chính tween import.
 *  - Hằng số LUẬT CHƠI (thời gian giữ lượt, ân hạn hô Ú Nồ, điểm từng lá):
 *    `packages/game-engine`. Engine chạy deterministic và độc lập.
 *  - Bảng màu / chủ đề nền: `client/src/lib/themes.ts`.
 * ───────────────────────────────────────────────────────────────────────── */

/** BOT — thời gian "nghĩ" và phản ứng (ms). */
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
  /** Thời gian bot suy nghĩ mặc định trên server (ms). */
  thinkMs: 650,
  /** Thời gian bot chọn màu/đổi bài trên server (ms). */
  pickMs: 450,
} as const;

/** Danh sách tên ngẫu nhiên cho Bot */
export const BOT_NAMES = ['Dusty', 'Pudding', 'Luna', 'Mochi', 'Pixel', 'Cocoa'] as const;

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

/** Mạng & Room Server (ms). */
export const NET = {
  /** Chu kỳ poll snapshot khi KHÔNG có realtime (hoặc fallback). */
  pollMs: 1000,
  /** Chờ tối đa lúc tải tài nguyên ở màn loading rồi vào game bằng mọi giá. */
  preloadTimeoutMs: 12000,
  /** Nhịp nghỉ cuối màn loading để thanh tiến trình chạy hết 100%, không giật tắt. */
  preloadSettleMs: 260,
  /** Chu kỳ gửi ping giữ nhịp kết nối. */
  pingIntervalMs: 5000,
  /** Ngưỡng coi người chơi mất kết nối tạm thời. */
  presenceStaleMs: 15000,
  /** Thời gian ngắt kết nối hẳn khỏi phòng. */
  disconnectTimeoutMs: 30_000,
  /** Thời gian ân hạn giữ chỗ trong phòng chờ khi rớt mạng. */
  lobbyDisconnectGraceMs: 60_000,
  /** Thời gian dọn phòng trống không còn ai (5 phút). */
  emptyRoomTtlMs: 5 * 60_000,
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

/** Cấu hình tính năng Chat trong trận */
export const CHAT = {
  /** Thời gian bong bóng chat hiển thị trước khi lặn xuống (10 giây). */
  durationMs: 10000,
  /** Giới hạn số ký tự tối đa của một tin nhắn. */
  maxLength: 120,
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

export const makeRoomCode = (): string =>
  Array.from(
    { length: ROOM_CODE_LENGTH },
    () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)],
  ).join('');

/** Giới hạn tên người chơi. */
export const NAME_MIN = 2;
export const NAME_MAX = 16;

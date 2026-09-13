/**
 * DANH MỤC ÂM THANH — nguồn sự thật cho cả 3 nơi:
 *  - bộ tổng hợp WebAudio (audio.ts) khi chưa có file thật,
 *  - script quét thư mục sinh manifest (scripts/gen-sfx-manifest.mjs),
 *  - tài liệu cho người thay âm thanh (public/sfx/README.md).
 *
 * Thêm âm mới thì chỉ cần thêm một dòng ở đây rồi khai đặc tả sóng trong
 * audio.ts; script và tài liệu tự bám theo.
 */
export const SFX_NAMES = [
  'whoosh',        // chia bài
  'place',         // đặt lá số thường xuống bàn
  'action',        // đặt lá chức năng (skip/reverse/wild...)
  'draw',          // rút 1 lá bình thường
  'penalty',       // bị rút phạt
  'playSkip',      // đánh lá CẤM LƯỢT (gồm cả "cấm cả bàn" mặt Dark)
  'playDraw2',     // đánh lá rút nhẹ: +1 / +2
  'playDraw4',     // đánh lá rút nặng: +4 / Wild +2 / +5
  'playDrawUntil', // đánh lá "rút tới khi ra màu" (Flip Dark)
  'playFlipCard',  // đánh lá FLIP (khác 'flip' — đó là tiếng cả bàn lật)
  'rush',          // hô Ú Nồ
  'skipped',       // BỊ cấm lượt (khác playSkip — đó là lúc ĐÁNH lá cấm)
  'caught',        // bị bắt vì quên hô
  'challenge',     // bấm bắt lỗi +4 (lúc khởi động)
  'challengeWin',  // bắt lỗi ĐÚNG
  'challengeLose', // bắt lỗi SAI, tự ăn thêm bài
  'reverse',       // đổi chiều đánh
  'color',         // Wild đã chọn xong màu
  'jumpIn',        // đánh chen cướp lượt
  'flip',          // lật bàn (Ú Nồ Flip)
  'swap',          // đổi tay bài (luật 0/7)
  'win',           // thắng ván
  'click',         // bấm nút / thao tác không hợp lệ
  'countdown',     // mỗi nhịp đếm ngược 5-4-3-2-1 trước khi chia bài
  'gameStart',     // hô "bắt đầu!" ngay khi đếm ngược kết thúc
] as const;

export type Sfx = (typeof SFX_NAMES)[number];

/** Đuôi file được chấp nhận, ưu tiên theo thứ tự này khi có nhiều bản. */
export const SFX_EXTS = ['webm', 'ogg', 'mp3', 'wav', 'm4a'] as const;

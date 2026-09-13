# Âm thanh thay thế

Game chạy được ngay khi thư mục này rỗng: mọi âm thanh được **tổng hợp bằng
WebAudio** trong `src/lib/audio.ts`. Muốn thay bằng âm thật thì **chỉ cần thả
file vào đây**, không phải sửa một dòng code nào.

## Cách dùng

1. Đặt tên file đúng bằng tên âm trong bảng dưới, ví dụ `place.mp3`.
2. Đuôi được nhận, theo thứ tự ưu tiên: `.webm` `.ogg` `.mp3` `.wav` `.m4a`.
3. Chạy lại `pnpm dev` hoặc `pnpm build` — script `scripts/gen-sfx-manifest.mjs`
   tự quét thư mục, ghi `manifest.json` và cập nhật luôn bảng cuối trang này.

Trình duyệt không liệt kê được thư mục nên phải quét lúc build; client chỉ tải
đúng một `manifest.json` là biết âm nào đã có bản thay thế. File nào giải mã
lỗi thì **riêng âm đó** rơi về bản tổng hợp, không làm hỏng cả game.

## Khuyến nghị

- Cắt sát, **không để khoảng lặng ở đầu file** — âm phát đúng khoảnh khắc lá bài
  chạm bàn, lệch vài chục ms là tai nghe ra ngay.
- Ngắn gọn: phần lớn âm nên dưới 0.5s; riêng `win` có thể dài hơn.
- Chuẩn hoá âm lượng vừa phải, người chơi còn chỉnh được trong phần Cài đặt.

## Danh mục

| Tên | Dùng khi nào | File hiện có |
| --- | --- | --- |
| `whoosh` | chia bài | `whoosh.mp3` |
| `place` | đặt lá số thường xuống bàn | `place.mp3` |
| `action` | đặt lá chức năng (skip/reverse/wild...) | `action.mp3` |
| `draw` | rút 1 lá bình thường | `draw.mp3` |
| `penalty` | bị rút phạt | `penalty.mp3` |
| `playSkip` | đánh lá CẤM LƯỢT (gồm cả "cấm cả bàn" mặt Dark) | `playSkip.mp3` |
| `playDraw2` | đánh lá rút nhẹ: +1 / +2 | `playDraw2.mp3` |
| `playDraw4` | đánh lá rút nặng: +4 / Wild +2 / +5 | `playDraw4.mp3` |
| `playDrawUntil` | đánh lá "rút tới khi ra màu" (Flip Dark) | `playDrawUntil.mp3` |
| `playFlipCard` | đánh lá FLIP (khác 'flip' — đó là tiếng cả bàn lật) | `playFlipCard.mp3` |
| `rush` | hô Ú Nồ | `rush.mp3` |
| `skipped` | BỊ cấm lượt (khác playSkip — đó là lúc ĐÁNH lá cấm) | `skipped.mp3` |
| `caught` | bị bắt vì quên hô | `caught.mp3` |
| `challenge` | bấm bắt lỗi +4 (lúc khởi động) | `challenge.mp3` |
| `challengeWin` | bắt lỗi ĐÚNG | `challengeWin.mp3` |
| `challengeLose` | bắt lỗi SAI, tự ăn thêm bài | `challengeLose.mp3` |
| `reverse` | đổi chiều đánh | `reverse.mp3` |
| `color` | Wild đã chọn xong màu | `color.mp3` |
| `jumpIn` | đánh chen cướp lượt | `jumpIn.mp3` |
| `flip` | lật bàn (Ú Nồ Flip) | `flip.mp3` |
| `swap` | đổi tay bài (luật 0/7) | `swap.mp3` |
| `win` | thắng ván | `win.mp3` |
| `click` | bấm nút / thao tác không hợp lệ | `click.mp3` |
| `countdown` | mỗi nhịp đếm ngược 5-4-3-2-1 trước khi chia bài | _(đang dùng bản tổng hợp)_ |
| `gameStart` | hô "bắt đầu!" ngay khi đếm ngược kết thúc | `gameStart.mp3` |

> Bảng sinh tự động từ `src/lib/sfxNames.ts`. Thêm âm mới thì thêm một dòng ở
> đó (kèm chú thích sau `//`) rồi chạy lại script — đừng sửa tay bảng này.

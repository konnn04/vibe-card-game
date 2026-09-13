# Nhạc nền

Thả file nhạc vào thư mục này rồi chạy `pnpm music` (hoặc `pnpm dev`/`pnpm build`,
hai lệnh đó tự chạy). Script sẽ:

1. **Đổi tên file** thành slug thuần ASCII — tên gốc hay có `｜ ’ é ' &` và
   khoảng trắng, những thứ đó phải encode khi nằm trong URL và mỗi tầng (Next,
   CDN, proxy Discord) encode một kiểu nên rất dễ 404 ở môi trường thật.
2. Ghi `manifest.json` giữ **tên hiển thị đầy đủ** (lấy từ tên file gốc).
3. Cập nhật bảng cuối trang này.

Muốn sửa tên hiển thị cho đẹp thì sửa thẳng `title` trong `manifest.json` —
lần chạy sau script **giữ nguyên**, không ghi đè.

- Định dạng nhận: `.mp3` `.ogg` `.webm` `.m4a` `.wav`
- Nhạc được **phát kiểu stream** (`<audio>`), không tải hết vào RAM — file vài
  chục MB vẫn không ngốn bộ nhớ.
- Bài mặc định: `10-minute-timer-with-relaxing-lo-fi-music-for-focus-study-cl.mp3`

## Danh sách hiện có

| File | Tên hiển thị |
| --- | --- |
| `10-minute-timer-with-relaxing-lo-fi-music-for-focus-study-cl.mp3` | 10 Minute Timer With Relaxing Lo Fi Music for Focus & Study ｜ Classroom Timer |
| `citizen-hanunue-hanu-s-adventure-extended-honkai-star-rail-2.mp3` | Citizen Hanunue Hanu’s Adventure (Extended) Honkai Star Rail 2.0 OST |
| `clair-obscur-expedition-33-lumiere-a-l-aube-sandfall-interac.mp3` | Clair Obscur Expedition 33 Lumière à L'Aube Sandfall Interactive |
| `hope-is-the-thing-with-feathers-extended.mp3` | Hope Is the Thing With Feathers Extended |
| `now-voyager-radiant-feldspar-honkai-star-rail-2-3-ost.mp3` | Now Voyager Radiant Feldspar Honkai Star Rail 2.3 OST |

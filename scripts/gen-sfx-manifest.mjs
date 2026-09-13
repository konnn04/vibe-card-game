/**
 * QUÉT THƯ MỤC public/sfx -> sinh manifest.json + README.md.
 *
 * Trình duyệt không liệt kê được thư mục, nên việc "quét" phải làm lúc build.
 * Client chỉ tải đúng MỘT file manifest rồi biết ngay âm nào đã có bản thay thế
 * — không phải dò từng tên bằng hàng chục request HEAD.
 *
 * Tài liệu cũng sinh từ đây để không bao giờ lệch với danh mục thật trong
 * src/lib/sfxNames.ts. Chạy tự động qua `predev` / `prebuild`.
 */
import { readdirSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'sfx');
const EXTS = ['webm', 'ogg', 'mp3', 'wav', 'm4a'];

mkdirSync(DIR, { recursive: true });

/* --------------------------------------------------- quét file thay thế */

const found = {};
for (const file of existsSync(DIR) ? readdirSync(DIR) : []) {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) continue;
  const name = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  if (!EXTS.includes(ext)) continue;
  const cur = found[name];
  // Cùng tên nhiều định dạng -> giữ bản có thứ tự ưu tiên cao hơn.
  if (!cur || EXTS.indexOf(ext) < EXTS.indexOf(cur.split('.').pop())) found[name] = file;
}
writeFileSync(join(DIR, 'manifest.json'), JSON.stringify(found, null, 2) + '\n');

/* --------------------------------------------------- sinh tài liệu */

const catalogue = readFileSync(join(process.cwd(), 'src', 'lib', 'sfxNames.ts'), 'utf8');
// [a-zA-Z0-9]+ chứ không phải [a-zA-Z]+: tên có chữ số (playDraw2, playDraw4)
// từng bị regex cũ bỏ sót, nên chúng BIẾN MẤT khỏi bảng tài liệu trong im lặng
// — người thay âm thanh không hề biết là có chúng.
const rows = [...catalogue.matchAll(/^ {2}'([a-zA-Z0-9]+)',\s*\/\/ (.+)$/gm)]
  .map(([, name, desc]) => {
    const has = found[name] ? '`' + found[name] + '`' : '_(đang dùng bản tổng hợp)_';
    return `| \`${name}\` | ${desc} | ${has} |`;
  })
  .join('\n');

writeFileSync(join(DIR, 'README.md'), `# Âm thanh thay thế

Game chạy được ngay khi thư mục này rỗng: mọi âm thanh được **tổng hợp bằng
WebAudio** trong \`src/lib/audio.ts\`. Muốn thay bằng âm thật thì **chỉ cần thả
file vào đây**, không phải sửa một dòng code nào.

## Cách dùng

1. Đặt tên file đúng bằng tên âm trong bảng dưới, ví dụ \`place.mp3\`.
2. Đuôi được nhận, theo thứ tự ưu tiên: \`.webm\` \`.ogg\` \`.mp3\` \`.wav\` \`.m4a\`.
3. Chạy lại \`pnpm dev\` hoặc \`pnpm build\` — script \`scripts/gen-sfx-manifest.mjs\`
   tự quét thư mục, ghi \`manifest.json\` và cập nhật luôn bảng cuối trang này.

Trình duyệt không liệt kê được thư mục nên phải quét lúc build; client chỉ tải
đúng một \`manifest.json\` là biết âm nào đã có bản thay thế. File nào giải mã
lỗi thì **riêng âm đó** rơi về bản tổng hợp, không làm hỏng cả game.

## Khuyến nghị

- Cắt sát, **không để khoảng lặng ở đầu file** — âm phát đúng khoảnh khắc lá bài
  chạm bàn, lệch vài chục ms là tai nghe ra ngay.
- Ngắn gọn: phần lớn âm nên dưới 0.5s; riêng \`win\` có thể dài hơn.
- Chuẩn hoá âm lượng vừa phải, người chơi còn chỉnh được trong phần Cài đặt.

## Danh mục

| Tên | Dùng khi nào | File hiện có |
| --- | --- | --- |
${rows}

> Bảng sinh tự động từ \`src/lib/sfxNames.ts\`. Thêm âm mới thì thêm một dòng ở
> đó (kèm chú thích sau \`//\`) rồi chạy lại script — đừng sửa tay bảng này.
`);

const n = Object.keys(found).length;
console.log(`[sfx] quét public/sfx -> ${n} âm thay thế` + (n ? ': ' + Object.keys(found).join(', ') : ' (dùng bản tổng hợp)'));

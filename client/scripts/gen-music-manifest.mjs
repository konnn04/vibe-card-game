/**
 * NHẠC NỀN: đổi tên file cho an toàn + sinh manifest.json + README.md.
 *
 * Vì sao phải đổi tên: tên gốc hay có `｜ ’ é ' & #` và khoảng trắng. Những ký
 * tự đó khi nằm trong URL phải encode, và mỗi tầng (Next, CDN, proxy Discord)
 * encode một kiểu — rất dễ 404 ở đúng môi trường thật mà local vẫn chạy. Nên
 * FILE thì đổi thành slug thuần ASCII, còn TÊN ĐẦY ĐỦ để hiển thị thì cất vào
 * manifest.
 *
 * Thả file mới vào thư mục rồi chạy lại (`pnpm music`, hoặc tự động qua
 * predev/prebuild) là script tự đổi tên và thêm vào manifest. Tên hiển thị đã
 * có trong manifest thì GIỮ NGUYÊN — sửa tay tên cho đẹp cũng không bị ghi đè.
 */
import { readdirSync, writeFileSync, mkdirSync, existsSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'music-theme');
const EXTS = ['mp3', 'ogg', 'webm', 'm4a', 'wav'];
const MANIFEST = join(DIR, 'manifest.json');

mkdirSync(DIR, { recursive: true });

/** Tên file an toàn: chỉ a-z 0-9 và dấu gạch ngang. */
function slugify(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // bỏ dấu tiếng Việt/Pháp
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
}

const prev = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { tracks: [] };
/** file -> title của lần chạy trước, để không ghi đè tên người dùng đã sửa tay. */
const keptTitle = new Map(prev.tracks.map((t) => [t.file, t.title]));

const tracks = [];
const used = new Set();

for (const entry of readdirSync(DIR).sort()) {
  const dot = entry.lastIndexOf('.');
  if (dot <= 0) continue;
  const ext = entry.slice(dot + 1).toLowerCase();
  if (!EXTS.includes(ext)) continue;

  const original = entry.slice(0, dot);
  let file = entry;

  // Chưa phải slug -> đổi tên trên đĩa.
  if (!/^[a-z0-9-]+$/.test(original)) {
    let base = slugify(original);
    while (used.has(`${base}.${ext}`) || (base !== slugify(original) && existsSync(join(DIR, `${base}.${ext}`)))) {
      base += '-2';
    }
    file = `${base}.${ext}`;
    renameSync(join(DIR, entry), join(DIR, file));
    console.log(`[music] đổi tên: ${entry}  ->  ${file}`);
  }

  used.add(file);
  tracks.push({
    file,
    // Ưu tiên tên đã có trong manifest (người dùng có thể đã sửa cho đẹp),
    // không có thì lấy tên file GỐC làm tên hiển thị đầy đủ.
    title: keptTitle.get(file) ?? original.replace(/[_-]+/g, ' ').trim(),
  });
}

/** Bài mặc định khi chưa chọn gì — theo yêu cầu là bản Lo-Fi. */
const fallback = tracks.find((t) => /lo-?fi|timer/i.test(t.title + t.file)) ?? tracks[0];
const manifest = { default: fallback?.file ?? null, tracks };
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

const rows = tracks.map((t) => `| \`${t.file}\` | ${t.title} |`).join('\n');
writeFileSync(join(DIR, 'README.md'), `# Nhạc nền

Thả file nhạc vào thư mục này rồi chạy \`pnpm music\` (hoặc \`pnpm dev\`/\`pnpm build\`,
hai lệnh đó tự chạy). Script sẽ:

1. **Đổi tên file** thành slug thuần ASCII — tên gốc hay có \`｜ ’ é ' &\` và
   khoảng trắng, những thứ đó phải encode khi nằm trong URL và mỗi tầng (Next,
   CDN, proxy Discord) encode một kiểu nên rất dễ 404 ở môi trường thật.
2. Ghi \`manifest.json\` giữ **tên hiển thị đầy đủ** (lấy từ tên file gốc).
3. Cập nhật bảng cuối trang này.

Muốn sửa tên hiển thị cho đẹp thì sửa thẳng \`title\` trong \`manifest.json\` —
lần chạy sau script **giữ nguyên**, không ghi đè.

- Định dạng nhận: \`.mp3\` \`.ogg\` \`.webm\` \`.m4a\` \`.wav\`
- Nhạc được **phát kiểu stream** (\`<audio>\`), không tải hết vào RAM — file vài
  chục MB vẫn không ngốn bộ nhớ.
- Bài mặc định: \`${manifest.default ?? '(chưa có)'}\`

## Danh sách hiện có

| File | Tên hiển thị |
| --- | --- |
${rows || '| _(trống)_ | |'}
`);

console.log(`[music] ${tracks.length} bài, mặc định: ${manifest.default ?? '(không có)'}`);

/**
 * ĐẨY database.rules.json LÊN FIREBASE — bằng tay, chắc chắn, có sao lưu.
 *
 * App ĐÃ tự đồng bộ rules lúc khởi động (ensureDatabaseRules trong
 * src/server/firebaseAdmin.ts). Script này không thay thế nó, mà bù cho đúng
 * một điểm yếu: hàm đó được gọi kiểu `void` — bắn rồi quên. Trên serverless,
 * tiến trình bị đóng băng ngay khi response đi, nên cú PUT có thể chưa kịp bay.
 * Nghĩa là rules "thường là" được đồng bộ, chứ không phải "chắc chắn".
 *
 * Mà rules quên deploy là lỗi HOÀN TOÀN IM LẶNG: Admin SDK bỏ qua rules nên
 * server ghi vẫn được, chỉ client bị chặn đọc — nhìn y hệt "tính năng không
 * chạy". Đúng cái đã xảy ra với nhánh avatars.
 *
 *   pnpm rules          # xem rules đang chạy trên server, KHÔNG ghi gì
 *   pnpm rules:deploy   # sao lưu bản cũ rồi đẩy bản trong repo lên
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');

/** .env không tự nạp cho script chạy ngoài Next -> tự đọc. */
function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    // Tách theo CRLF lẫn LF: .env soạn trên Windows kết thúc dòng bằng CRLF,
    // sót ký tự xuống dòng thì regex dưới không khớp dòng nào, và script báo
    // thiếu biến trong khi biến nằm sờ sờ trong tệp.
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, k, raw] = m;
      if (process.env[k]) continue;
      process.env[k] = raw.trim().replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * Tham số xác thực cho REST của Realtime Database.
 *
 * Nhận cùng 3 dạng mà firebaseAdmin.ts nhận, theo đúng thứ tự ưu tiên đó:
 * JSON service account / base64 / đường dẫn tệp -> OAuth token; còn lại, nếu
 * trông như Database Secret kiểu cũ (chuỗi ~20-60 ký tự) thì dùng `auth=`.
 */
async function authParam() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '').trim();
  if (!raw) return null;

  let sa = null;
  if (raw.startsWith('{')) sa = JSON.parse(raw);
  else if (existsSync(raw)) sa = JSON.parse(readFileSync(raw, 'utf8'));
  else {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.trim().startsWith('{')) sa = JSON.parse(decoded);
    } catch { /* không phải base64 */ }
  }

  if (sa) {
    const { default: admin } = await import('firebase-admin');
    const app = admin.initializeApp({ credential: admin.credential.cert(sa) });
    const tok = await app.options.credential.getAccessToken();
    return `access_token=${tok.access_token}`;
  }

  // Database Secret kiểu cũ — đúng dạng repo này đang dùng.
  if (/^[A-Za-z0-9_-]+$/.test(raw) && raw.length >= 20) return `auth=${raw}`;
  return null;
}

loadEnv();

const dbUrl = (process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '')
  .trim().replace(/\/$/, '');
if (!dbUrl) {
  console.error('Thiếu FIREBASE_DATABASE_URL (hoặc NEXT_PUBLIC_FIREBASE_DATABASE_URL) trong .env');
  process.exit(1);
}

const auth = await authParam();
if (!auth) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY không phải service account JSON/base64/đường dẫn, cũng không giống Database Secret.');
  process.exit(1);
}

const endpoint = `${dbUrl}/.settings/rules.json?${auth}`;

// Luôn đọc bản đang chạy trước — để so, và để có cái mà quay lui.
const current = await fetch(endpoint);
if (!current.ok) {
  console.error(`Không đọc được rules hiện tại (HTTP ${current.status}): ${await current.text().catch(() => '')}`);
  process.exit(1);
}
const currentText = await current.text();
const local = readFileSync(join(ROOT, 'database.rules.json'), 'utf8');

const same = JSON.stringify(JSON.parse(currentText)) === JSON.stringify(JSON.parse(local));

if (!APPLY) {
  console.log(`— Rules ĐANG CHẠY trên ${dbUrl} —\n`);
  console.log(currentText.trim());
  console.log(same ? '\n=> Trùng khớp với database.rules.json trong repo.'
                   : '\n=> KHÁC với database.rules.json trong repo. Chạy `pnpm rules:deploy` để đẩy lên.');
  process.exit(0);
}

if (same) {
  console.log('Rules trên server đã trùng với repo, không cần đẩy.');
  process.exit(0);
}

const backup = join(ROOT, 'database.rules.backup.json');
writeFileSync(backup, currentText);
console.log(`Đã sao lưu rules cũ -> ${backup}`);

const put = await fetch(endpoint, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: local,
});
if (!put.ok) {
  console.error(`Đẩy rules THẤT BẠI (HTTP ${put.status}): ${await put.text().catch(() => '')}`);
  console.error(`Rules trên server chưa đổi. Bản cũ vẫn nằm ở ${backup}.`);
  process.exit(1);
}
console.log(`Đã đẩy database.rules.json lên ${dbUrl}`);

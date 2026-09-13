/**
 * ĐÓNG DẤU PHIÊN BẢN CHO MỖI COMMIT.
 *
 * Sinh `src/generated/version.ts` từ package.json + git, chạy tự động qua
 * `predev` / `prebuild` / `pretypecheck`. Nhờ vậy mỗi commit là một phiên bản
 * PHÂN BIỆT ĐƯỢC mà không phải sửa tay số version, và khi người chơi báo lỗi thì
 * chỉ cần họ đọc dòng chữ ở góc Cài đặt là biết chính xác họ đang chạy bản nào.
 *
 * Vì sao dùng SỐ COMMIT làm patch thay vì tự tăng bằng git hook: hook chỉ chạy
 * trên máy có cài hook, quên cài là số nhảy loạn giữa các máy và giữa CI. Đếm
 * commit thì ai build cũng ra đúng một con số cho cùng một commit.
 *
 * File sinh ra KHÔNG commit (xem .gitignore): nó đổi theo từng commit, giữ
 * trong git chỉ tạo xung đột ở mọi lần merge.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'src', 'generated');

/** Chạy git, nuốt lỗi: build từ tarball / Docker không có .git vẫn phải xong. */
function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
/** major.minor lấy từ package.json — chỉ đổi khi CON NGƯỜI quyết định. */
const [major = '0', minor = '0'] = String(pkg.version ?? '0.0.0').split('.');

/*
 * Trong image Docker KHÔNG có thư mục .git (xem .dockerignore), nên git() trả
 * rỗng và dòng phiên bản sẽ tụt về "v0.1.0" — mất sạch ý nghĩa đúng lúc cần
 * nhất, tức là trên bản đang chạy thật. Cho phép truyền tay qua biến môi
 * trường; ở máy dev thì vẫn ưu tiên hỏi git như cũ.
 */
const sha = git('rev-parse', '--short=7', 'HEAD') || (process.env.RUSH_GIT_SHA ?? '').slice(0, 7);
const count = git('rev-list', '--count', 'HEAD') || (process.env.RUSH_GIT_COUNT ?? '');
const date = git('log', '-1', '--format=%cI');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
// Có thay đổi chưa commit -> đánh dấu, để không nhầm bản build thử với bản đã chốt.
const dirty = !!git('status', '--porcelain');

const version = `${major}.${minor}.${count || '0'}`;
const label = sha ? `v${version}+${sha}${dirty ? '.dirty' : ''}` : `v${version}`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, 'version.ts'),
  `/* TỰ SINH bởi scripts/gen-version.mjs — đừng sửa tay, đừng commit. */

export const BUILD = {
  /** major.minor từ package.json, patch = số commit. */
  version: ${JSON.stringify(version)},
  /** Hash commit ngắn ('' nếu build ngoài git). */
  commit: ${JSON.stringify(sha)},
  branch: ${JSON.stringify(branch)},
  /** Ngày commit dạng ISO ('' nếu build ngoài git). */
  date: ${JSON.stringify(date)},
  /** Cây làm việc có thay đổi chưa commit lúc build. */
  dirty: ${dirty},
  /** Chuỗi hiển thị cho người dùng, vd "v0.1.248+9f2c1ab". */
  label: ${JSON.stringify(label)},
} as const;
`,
);

console.log(`[version] ${label}`);

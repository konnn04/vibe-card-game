import fs from 'fs';
import path from 'path';
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';

const rawDbUrl = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '';
export const dbUrl = rawDbUrl.trim().replace(/\/$/, '');
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

let attemptedInit = false;
let adminApp: App | null = null;
let adminDb: Database | null = null;
let databaseSecret: string | null = null;

export const hasFirebaseAdmin = Boolean(dbUrl);

function tryParseJson(str: string): Record<string, unknown> | null {
  try {
    const trimmed = str.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return JSON.parse(trimmed);
    }
  } catch {
    /* ignore parse error */
  }
  return null;
}

function resolveServiceAccount(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;

  // 1. Direct JSON string
  const directJson = tryParseJson(cleaned);
  if (directJson && typeof directJson === 'object' && ('private_key' in directJson || 'client_email' in directJson)) {
    return directJson;
  }

  // 2. File path
  //
  // `turbopackIgnore` KHÔNG phải để tắt cảnh báo cho xong. Đường dẫn này đến từ
  // BIẾN MÔI TRƯỜNG lúc CHẠY, nên bộ đóng gói không thể biết trước nó trỏ đâu;
  // gặp vậy Turbopack đành trace CẢ DỰ ÁN vào output của server — kéo theo
  // nguyên thư mục public (hiện ~86MB: 82MB nhạc nền + 3.8MB atlas bài) vào
  // bundle serverless. Vừa chậm deploy vừa dễ vượt giới hạn dung lượng.
  //
  // File credential vốn KHÔNG BAO GIỜ nằm trong build — nó được cấp lúc chạy
  // (mount vào máy chủ, hoặc truyền thẳng JSON/base64 qua env ở nhánh 1 và 3).
  // Nên trace nó là vô nghĩa ngay từ đầu, bỏ qua mới đúng.
  try {
    const candidatePath = path.isAbsolute(cleaned)
      ? cleaned
      : path.resolve(/* turbopackIgnore: true */ process.cwd(), cleaned);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      const content = fs.readFileSync(candidatePath, 'utf-8');
      const fileJson = tryParseJson(content);
      if (fileJson && typeof fileJson === 'object' && ('private_key' in fileJson || 'client_email' in fileJson)) {
        return fileJson;
      }
    }
  } catch {
    /* ignore file error */
  }

  // 3. Base64 encoded JSON
  try {
    if (/^[A-Za-z0-9+/=_\s-]+$/.test(cleaned) && cleaned.length > 50) {
      const decoded = Buffer.from(cleaned, 'base64').toString('utf-8');
      const b64Json = tryParseJson(decoded);
      if (b64Json && typeof b64Json === 'object' && ('private_key' in b64Json || 'client_email' in b64Json)) {
        return b64Json;
      }
    }
  } catch {
    /* ignore base64 error */
  }

  return null;
}

/**
 * Đồng bộ database.rules.json lên Firebase nếu khác bản đang chạy — không chỉ
 * lúc DB còn deny-all lúc đầu. Vd: thêm node `presence` (cho tính năng phát
 * hiện mất kết nối) vào file local phải tự đẩy lên, không phải chỉnh tay trên
 * Firebase Console. Dùng chung cho cả 2 kiểu xác thực:
 *  - `authParam` = "auth=<database secret>" (REST token cũ)
 *  - `authParam` = "access_token=<OAuth token>" (từ Service Account, không cần secret riêng)
 */
async function ensureDatabaseRules(authParam: string): Promise<void> {
  try {
    const rulesPath = path.resolve(process.cwd(), 'database.rules.json');
    if (!fs.existsSync(rulesPath)) return;
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
    const localRules = tryParseJson(rulesContent);
    if (!localRules) return;

    const res = await fetch(`${dbUrl}/.settings/rules.json?${authParam}`);
    if (!res.ok) return;
    const currentRules = await res.json();

    // So sánh cấu trúc thô (rules.json không có comment nên JSON.stringify ổn định
    // theo thứ tự key gốc — đủ để phát hiện thiếu node mới thêm).
    if (JSON.stringify(currentRules) === JSON.stringify(localRules)) return;

    const put = await fetch(`${dbUrl}/.settings/rules.json?${authParam}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: rulesContent,
    });
    if (put.ok) {
      console.log('[FirebaseAdmin] Đã đồng bộ database.rules.json lên Firebase Realtime Database.');
    } else {
      console.warn('[FirebaseAdmin] Đẩy database.rules.json thất bại:', put.status, await put.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('[FirebaseAdmin] Không kiểm tra/đồng bộ được rules:', err);
  }
}

export function initFirebaseBackend(): void {
  if (attemptedInit) return;
  attemptedInit = true;

  if (!dbUrl) return;

  const cleaned = serviceAccountRaw?.replace(/^["']|["']$/g, '').trim();

  // Try service account first
  const serviceAccount = resolveServiceAccount(cleaned);
  if (serviceAccount) {
    try {
      // resolveServiceAccount() trả JSON thô đọc từ env/file — chỉ biết chắc có
      // private_key/client_email, ép kiểu ServiceAccount ở đây là hợp lý.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = cert(serviceAccount as any);
      if (getApps().length > 0) {
        adminApp = getApps()[0];
      } else {
        adminApp = initializeApp({ credential, databaseURL: dbUrl });
      }
      adminDb = getDatabase(adminApp);
      console.log('[FirebaseAdmin] Initialized Firebase Admin SDK successfully.');
      // Admin SDK bỏ qua Security Rules khi đọc/ghi, nên rules trên Firebase có
      // thể tụt hậu so với file local mà không ai để ý — tự đồng bộ bằng chính
      // access token của service account (không cần Database Secret riêng).
      void credential
        .getAccessToken()
        .then((tok) => ensureDatabaseRules(`access_token=${tok.access_token}`))
        .catch((err) => console.warn('[FirebaseAdmin] Không lấy được access token để đồng bộ rules:', err));
      return;
    } catch (err) {
      console.warn('[FirebaseAdmin] Failed to initialize Firebase Admin SDK:', err);
    }
  }

  // If not service account JSON, check if it's a Database Secret token (~20-60 alphanumeric characters)
  if (cleaned && /^[A-Za-z0-9_-]+$/.test(cleaned) && cleaned.length >= 20) {
    databaseSecret = cleaned;
    console.log('[FirebaseAdmin] Detected Firebase Database Secret. Using Realtime Database REST API client.');
    void ensureDatabaseRules(`auth=${cleaned}`);
    return;
  }

  if (cleaned) {
    console.warn(
      '[FirebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY does not appear to be a valid Service Account JSON key or Database Secret. Falling back to in-memory store.',
    );
  }
}

export function getAdminDb(): Database | null {
  if (!attemptedInit) initFirebaseBackend();
  return adminDb;
}

export function getDatabaseSecret(): string | null {
  if (!attemptedInit) initFirebaseBackend();
  return databaseSecret;
}

/** REST API client for Firebase Realtime Database using Database Secret */
export const restDb = {
  async get<T>(rawPath: string): Promise<T | null> {
    const sec = getDatabaseSecret();
    if (!dbUrl || !sec) return null;
    const cleanPath = rawPath.replace(/^\//, '');
    const res = await fetch(`${dbUrl}/${cleanPath}.json?auth=${sec}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  },

  async set(rawPath: string, value: unknown): Promise<void> {
    const sec = getDatabaseSecret();
    if (!dbUrl || !sec) return;
    const cleanPath = rawPath.replace(/^\//, '');
    await fetch(`${dbUrl}/${cleanPath}.json?auth=${sec}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
  },

  async update(updates: Record<string, unknown>): Promise<void> {
    const sec = getDatabaseSecret();
    if (!dbUrl || !sec) return;
    await fetch(`${dbUrl}/.json?auth=${sec}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updates),
    });
  },

  async del(rawPath: string): Promise<void> {
    const sec = getDatabaseSecret();
    if (!dbUrl || !sec) return;
    const cleanPath = rawPath.replace(/^\//, '');
    await fetch(`${dbUrl}/${cleanPath}.json?auth=${sec}`, {
      method: 'DELETE',
    });
  },

  async setAdd(setPath: string, member: string): Promise<void> {
    const sec = getDatabaseSecret();
    if (!dbUrl || !sec) return;
    const cleanPath = setPath.replace(/^\//, '');
    await fetch(`${dbUrl}/${cleanPath}/${encodeURIComponent(member)}.json?auth=${sec}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(true),
    });
  },

  async setRemove(setPath: string, member: string): Promise<void> {
    const sec = getDatabaseSecret();
    if (!dbUrl || !sec) return;
    const cleanPath = setPath.replace(/^\//, '');
    await fetch(`${dbUrl}/${cleanPath}/${encodeURIComponent(member)}.json?auth=${sec}`, {
      method: 'DELETE',
    });
  },

  async setMembers(setPath: string): Promise<string[]> {
    const sec = getDatabaseSecret();
    if (!dbUrl || !sec) return [];
    const cleanPath = setPath.replace(/^\//, '');
    const res = await fetch(`${dbUrl}/${cleanPath}.json?auth=${sec}&shallow=true`, { cache: 'no-store' });
    if (!res.ok) return [];
    const val = await res.json();
    if (!val || typeof val !== 'object') return [];
    return Object.keys(val);
  },
};

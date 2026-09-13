import { getAdminDb, getDatabaseSecret, restDb } from './firebaseAdmin';

/**
 * Storage và Lock layer đồng bộ qua Firebase Realtime Database.
 * Hỗ trợ 2 chế độ:
 * 1. Firebase Admin SDK (nếu cấu hình Service Account JSON)
 * 2. Firebase RTDB REST API (nếu dùng Firebase Database Secret token)
 * Tự động fallback sang in-memory Map nếu cả 2 đều chưa sẵn sàng.
 */

const memStore = new Map<string, { v: string; exp: number }>();
const memLocks = new Map<string, { stamp: string; exp: number }>();
const memSets = new Map<string, Set<string>>();

const memAlive = (k: string) => {
  const e = memStore.get(k);
  if (!e) return null;
  if (e.exp < Date.now()) {
    memStore.delete(k);
    return null;
  }
  return e;
};

export async function dbGet<T>(path: string): Promise<T | null> {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.ref(path).once('value');
      const val = snap.exists() ? (snap.val() as T) : null;
      if (val !== null) memStore.set(path, { v: JSON.stringify(val), exp: Date.now() + 6 * 3600 * 1000 });
      return val;
    } catch (err) {
      console.warn(`[dbGet] Firebase Admin error on ${path}:`, err);
    }
  } else if (getDatabaseSecret()) {
    try {
      const val = await restDb.get<T>(path);
      if (val !== null) memStore.set(path, { v: JSON.stringify(val), exp: Date.now() + 6 * 3600 * 1000 });
      return val;
    } catch (err) {
      console.warn(`[dbGet] Firebase REST error on ${path}:`, err);
    }
  }
  const e = memAlive(path);
  return e ? (JSON.parse(e.v) as T) : null;
}

export async function dbSet(path: string, value: unknown, ttlSeconds = 6 * 3600): Promise<void> {
  memStore.set(path, { v: JSON.stringify(value), exp: Date.now() + ttlSeconds * 1000 });

  const db = getAdminDb();
  if (db) {
    try {
      await db.ref(path).set(value);
      return;
    } catch (err) {
      console.warn(`[dbSet] Firebase Admin error on ${path}:`, err);
    }
  } else if (getDatabaseSecret()) {
    try {
      await restDb.set(path, value);
      return;
    } catch (err) {
      console.warn(`[dbSet] Firebase REST error on ${path}:`, err);
    }
  }
}

export async function dbUpdate(updates: Record<string, unknown>): Promise<void> {
  for (const [p, val] of Object.entries(updates)) {
    if (val === null) memStore.delete(p);
    else memStore.set(p, { v: JSON.stringify(val), exp: Date.now() + 6 * 3600 * 1000 });
  }

  const db = getAdminDb();
  if (db) {
    try {
      await db.ref().update(updates);
      return;
    } catch (err) {
      console.warn('[dbUpdate] Firebase Admin error:', err);
    }
  } else if (getDatabaseSecret()) {
    try {
      await restDb.update(updates);
      return;
    } catch (err) {
      console.warn('[dbUpdate] Firebase REST error:', err);
    }
  }
}

export async function dbDel(path: string): Promise<void> {
  memStore.delete(path);

  const db = getAdminDb();
  if (db) {
    try {
      await db.ref(path).remove();
      return;
    } catch (err) {
      console.warn(`[dbDel] Firebase Admin error on ${path}:`, err);
    }
  } else if (getDatabaseSecret()) {
    try {
      await restDb.del(path);
      return;
    } catch (err) {
      console.warn(`[dbDel] Firebase REST error on ${path}:`, err);
    }
  }
}

export async function dbSetAdd(setPath: string, member: string): Promise<void> {
  let s = memSets.get(setPath);
  if (!s) {
    s = new Set();
    memSets.set(setPath, s);
  }
  s.add(member);

  const db = getAdminDb();
  if (db) {
    try {
      await db.ref(`${setPath}/${member}`).set(true);
      return;
    } catch (err) {
      console.warn(`[dbSetAdd] Firebase Admin error on ${setPath}:`, err);
    }
  } else if (getDatabaseSecret()) {
    try {
      await restDb.setAdd(setPath, member);
      return;
    } catch (err) {
      console.warn(`[dbSetAdd] Firebase REST error on ${setPath}:`, err);
    }
  }
}

export async function dbSetRemove(setPath: string, member: string): Promise<void> {
  memSets.get(setPath)?.delete(member);

  const db = getAdminDb();
  if (db) {
    try {
      await db.ref(`${setPath}/${member}`).remove();
      return;
    } catch (err) {
      console.warn(`[dbSetRemove] Firebase Admin error on ${setPath}:`, err);
    }
  } else if (getDatabaseSecret()) {
    try {
      await restDb.setRemove(setPath, member);
      return;
    } catch (err) {
      console.warn(`[dbSetRemove] Firebase REST error on ${setPath}:`, err);
    }
  }
}

export async function dbSetMembers(setPath: string): Promise<string[]> {
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.ref(setPath).once('value');
      if (!snap.exists()) return [];
      return Object.keys(snap.val() || {});
    } catch (err) {
      console.warn(`[dbSetMembers] Firebase Admin error on ${setPath}:`, err);
    }
  } else if (getDatabaseSecret()) {
    try {
      return await restDb.setMembers(setPath);
    } catch (err) {
      console.warn(`[dbSetMembers] Firebase REST error on ${setPath}:`, err);
    }
  }
  return Array.from(memSets.get(setPath) ?? []);
}

/**
 * Mutex lock chống tranh chấp lượt (Jump-in, bắt RUSH đồng thời).
 * Trên Firebase Admin: dùng transaction trên node lock với stamp và timeout.
 * Với REST / MemStore: dùng memLocks xử lý atomic ngay trong tiến trình server.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>, tries = 12): Promise<T> {
  const lockKey = `rush/locks/${key}`;
  const stamp = Math.random().toString(36).slice(2);
  const db = getAdminDb();

  for (let i = 0; i < tries; i++) {
    let ok = false;

    if (db) {
      try {
        const lockRef = db.ref(lockKey);
        const res = await lockRef.transaction((curr) => {
          const now = Date.now();
          if (curr && curr.exp && curr.exp > now) {
            return undefined; // Lock đang bị chiếm, abort
          }
          return { stamp, exp: now + 4000 };
        });
        ok = Boolean(res.committed);
      } catch {
        ok = false;
      }
    } else {
      const curr = memLocks.get(lockKey);
      const now = Date.now();
      if (!curr || curr.exp <= now) {
        memLocks.set(lockKey, { stamp, exp: now + 4000 });
        ok = true;
      }
    }

    if (ok) {
      try {
        return await fn();
      } finally {
        if (db) {
          try {
            const lockRef = db.ref(lockKey);
            await lockRef.transaction((curr) => {
              if (curr && curr.stamp === stamp) return null;
              return curr;
            });
          } catch {
            /* ignore cleanup error */
          }
        } else {
          if (memLocks.get(lockKey)?.stamp === stamp) {
            memLocks.delete(lockKey);
          }
        }
      }
    }

    await new Promise((r) => setTimeout(r, 45 + i * 15));
  }

  throw new Error('room-busy');
}

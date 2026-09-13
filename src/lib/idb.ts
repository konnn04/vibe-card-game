'use client';
import { openDB, type IDBPDatabase } from 'idb';

const DB = 'rush-assets';
const STORE = 'blobs';

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB(DB, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbp;
}

/** Avatar/skin lưu dạng Blob (WebP đã nén) — localStorage không đủ chỗ cho ảnh. */
export async function putBlob(key: string, blob: Blob) {
  (await db()).put(STORE, blob, key);
  urlCache.delete(key);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await db()).get(STORE, key);
}

export async function delBlob(key: string) {
  (await db()).delete(STORE, key);
  const u = urlCache.get(key);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(key);
}

const urlCache = new Map<string, string>();

/** ObjectURL có cache để không tạo URL mới mỗi lần render (tránh leak). */
export async function getBlobUrl(key: string): Promise<string | null> {
  if (urlCache.has(key)) return urlCache.get(key)!;
  const b = await getBlob(key);
  if (!b) return null;
  const url = URL.createObjectURL(b);
  urlCache.set(key, url);
  return url;
}

/**
 * Resize + nén ảnh về WebP vuông trước khi lưu.
 * KHÔNG bao giờ lưu/render ảnh gốc: 1 ảnh 4000px làm texture sẽ giết GPU budget.
 */
export async function encodeSquareWebp(source: CanvasImageSource, size: number, quality = 0.82): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size, size);
  return new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/webp', quality),
  );
}

export const AVATAR_KEY = 'avatar';

'use client';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * Settings (locale, skin, tên) nằm trong localStorage nên HTML server render
 * không thể khớp client -> gate 1 nhịp để tránh hydration mismatch toàn cây UI.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

'use client';

/**
 * MÃ PHÒNG TRÊN THANH ĐỊA CHỈ — dùng cho 2 việc:
 *
 *  1. CHIA SẺ: đang chơi, copy link gửi bạn -> họ mở là vào thẳng phòng, không
 *     phải gõ mã 6 ký tự.
 *  2. KẾT NỐI LẠI: lỡ F5 / đóng tab / mất mạng -> mở lại đúng link đó là quay
 *     về phòng cũ. Token phòng vẫn nằm trong localStorage nên server nhận ra
 *     đúng người chơi, không tạo chỗ ngồi mới.
 *
 * Luôn dùng `replaceState`, KHÔNG `pushState`: mã phòng không phải một "trang"
 * riêng, nhồi vào lịch sử thì nút Back của trình duyệt sẽ nhảy lung tung giữa
 * các phòng cũ đã rời.
 *
 * Chỉ đụng đúng key `room`, các query khác giữ nguyên — Discord Activity truyền
 * `frame_id`/`instance_id`/`channel_id` qua chính query string này, xoá nhầm là
 * hỏng cả Activity.
 */
import { ROOM_CODE_RE } from '@/src/config';

const KEY = 'room';

export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return ROOM_CODE_RE.test(code) ? code : null;
}

/** Mã phòng đang có trên URL (nếu hợp lệ). */
export function roomCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return normalizeCode(new URLSearchParams(window.location.search).get(KEY));
}

/** Ghi mã phòng lên thanh địa chỉ (giữ nguyên mọi query khác). */
export function setRoomInUrl(code: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(KEY) === code) return;
  url.searchParams.set(KEY, code);
  window.history.replaceState(null, '', url.toString());
}

/** Xoá mã phòng khỏi thanh địa chỉ khi rời phòng. */
export function clearRoomInUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(KEY)) return;
  url.searchParams.delete(KEY);
  window.history.replaceState(null, '', url.toString());
}

/**
 * Link chia sẻ. Cố tình CHỈ giữ lại `room` — bỏ hết query của Discord Activity
 * (`frame_id`, `instance_id`, ...) vì đó là tham số phiên của MÁY NGƯỜI GỬI,
 * gửi cho người khác thì vô nghĩa, thậm chí khiến họ bị nhận nhầm là đang chạy
 * trong Activity.
 */
export function roomShareUrl(code: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(KEY, code);
  return url.toString();
}

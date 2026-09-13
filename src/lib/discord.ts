'use client';

/**
 * Discord Activity chạy trong iframe và truyền tham số qua query string
 * (`frame_id`, `instance_id`, `channel_id`, `guild_id`).
 * Bản FE-only này chỉ dùng chúng để nhận diện môi trường + lấy roomId mặc định;
 * OAuth thật (`@discord/embedded-app-sdk` + token exchange) cần backend nên chưa bật.
 */
export function discordParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search);
}

export function isDiscordActivity(): boolean {
  const q = discordParams();
  if (!q) return false;
  const inIframe = window.self !== window.top;
  return inIframe && (q.has('frame_id') || q.has('instance_id'));
}

/** instance_id của voice channel = mã phòng mặc định khi mở Activity. */
export function discordRoomCode(): string | null {
  const q = discordParams();
  const id = q?.get('instance_id');
  return id ? id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() : null;
}

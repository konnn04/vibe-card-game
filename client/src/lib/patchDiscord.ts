'use client';
import { patchUrlMappings } from '@discord/embedded-app-sdk';

let isPatched = false;

export function applyDiscordUrlPatch() {
  if (typeof window === 'undefined' || isPatched) return;

  const isDiscord =
    window.location.hostname.includes('discordsays.com') ||
    (window.self !== window.top && new URLSearchParams(window.location.search).has('frame_id'));

  if (!isDiscord) return;
  isPatched = true;

  try {
    // Nếu có biến môi trường chỉ định rõ backend URL bên ngoài (không qua Next.js proxy)
    const rawUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
      const targetHost = new URL(rawUrl).host;
      patchUrlMappings([
        {
          prefix: '/.proxy/backend',
          target: targetHost,
        },
      ]);
      console.log('[Discord SDK] patchUrlMappings active -> /.proxy/backend ->', targetHost);
    }
  } catch (err) {
    console.warn('[Discord SDK] Failed to patch URL mappings:', err);
  }
}

if (typeof window !== 'undefined') {
  applyDiscordUrlPatch();
}

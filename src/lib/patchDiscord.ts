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
    const rawUrl =
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
      'https://rush-games-e8823-default-rtdb.asia-southeast1.firebasedatabase.app';
    const targetHost = new URL(rawUrl).host;

    patchUrlMappings([
      {
        prefix: '/.proxy/firebase',
        target: targetHost,
      },
    ]);
    console.log('[Discord SDK] patchUrlMappings active -> /.proxy/firebase ->', targetHost);
  } catch (err) {
    console.warn('[Discord SDK] Failed to patch URL mappings:', err);
  }
}

if (typeof window !== 'undefined') {
  applyDiscordUrlPatch();
}

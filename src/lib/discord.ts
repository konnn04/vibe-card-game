'use client';

import { DiscordSDK } from '@discord/embedded-app-sdk';

/**
 * Discord Activity chạy trong iframe và truyền tham số qua query string
 * (`frame_id`, `instance_id`, `channel_id`, `guild_id`).
 */
export function discordParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search);
}

export function isDiscordActivity(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname.includes('discordsays.com')) return true;
  const q = discordParams();
  const inIframe = window.self !== window.top;
  return inIframe && (q?.has('frame_id') || q?.has('instance_id') || false);
}

/** instance_id của voice channel = mã phòng mặc định khi mở Activity. */
export function discordRoomCode(): string | null {
  const q = discordParams();
  const id = q?.get('instance_id');
  return id ? id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() : null;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  globalName: string | null;
  avatarUrl: string | null;
}

import { applyDiscordUrlPatch } from './patchDiscord';

export function setupDiscordUrlMappings() {
  applyDiscordUrlPatch();
}

let discordSdkInstance: DiscordSDK | null = null;
let initPromise: Promise<DiscordSDK | null> | null = null;

export function getDiscordSdk(): DiscordSDK | null {
  if (typeof window === 'undefined' || !isDiscordActivity()) return null;
  setupDiscordUrlMappings();
  if (!discordSdkInstance) {
    // Không có giá trị mặc định: xem chú thích ở app/api/discord/token/route.ts.
    // Thiếu env thì thà không khởi tạo SDK (game vẫn chạy, chỉ là không lấy được
    // tên/ảnh Discord) còn hơn nói chuyện với nhầm application.
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    if (!clientId) {
      console.warn('[Discord SDK] thiếu NEXT_PUBLIC_DISCORD_CLIENT_ID lúc build — bỏ qua tích hợp Discord.');
      return null;
    }
    discordSdkInstance = new DiscordSDK(clientId, { disableConsoleLogOverride: true });
  }
  return discordSdkInstance;
}

export async function initDiscordSdk(): Promise<DiscordSDK | null> {
  setupDiscordUrlMappings();
  const sdk = getDiscordSdk();
  if (!sdk) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await sdk.ready();
      return sdk;
    } catch (e) {
      console.warn('[Discord SDK] ready failed:', e);
      return null;
    }
  })();

  return initPromise;
}

export function formatDiscordAvatarUrl(userId: string, avatarHash?: string | null): string {
  if (avatarHash) {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`;
  }
  try {
    const index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

let userPromise: Promise<DiscordUser | null> | null = null;

/**
 * Lấy thông tin người dùng từ Discord SDK qua luồng OAuth2:
 * 1. sdk.commands.authorize()
 * 2. Trao đổi code lấy access_token qua /api/discord/token (cần DISCORD_CLIENT_SECRET)
 * 3. sdk.commands.authenticate({ access_token })
 */
export async function getDiscordUser(): Promise<DiscordUser | null> {
  const sdk = await initDiscordSdk();
  if (!sdk) return null;
  if (userPromise) return userPromise;

  userPromise = (async () => {
    try {
      const { code } = await sdk.commands.authorize({
        client_id: sdk.clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
      });

      const res = await fetch('/api/discord/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        const { access_token } = (await res.json()) as { access_token?: string };
        if (access_token) {
          const auth = await sdk.commands.authenticate({ access_token });
          if (auth?.user) {
            const u = auth.user;
            return {
              id: u.id,
              username: u.username,
              discriminator: u.discriminator,
              globalName: u.global_name ?? null,
              avatarUrl: formatDiscordAvatarUrl(u.id, u.avatar),
            };
          }
        }
      }
    } catch (e) {
      console.warn('[Discord SDK] authorize/authenticate failed:', e);
    }
    return null;
  })();

  return userPromise;
}

/**
 * Mở modal mời bạn bè trong kênh voice của Discord
 */
export async function openDiscordInvite(): Promise<boolean> {
  const sdk = await initDiscordSdk();
  if (!sdk) return false;
  try {
    await sdk.commands.openInviteDialog();
    return true;
  } catch (e) {
    console.warn('[Discord SDK] openInviteDialog failed:', e);
    return false;
  }
}

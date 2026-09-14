'use client';
import { useEffect, useState } from 'react';
import { useSettings } from '@/src/lib/settings';
import { AVATAR_KEY, getBlobUrl } from '@/src/lib/idb';

export const PRESETS = ['🤖', '🐼', '🦊', '🐨', '🐯', '🐰'];
const PRESET_BG = ['#ff2d55', '#2179dd', '#ff8410', '#2eb84e', '#8348d1', '#12b9b9'];

export function Avatar({
  name, preset, size = 40, self = false, avatarUrl, showUpload = false, className,
}: {
  name: string;
  preset: number;
  size?: number;
  self?: boolean;
  avatarUrl?: string | null;
  showUpload?: boolean;
  className?: string;
}) {
  const avatarKey = useSettings((s) => s.avatarKey);
  const storedAvatarUrl = useSettings((s) => s.avatarUrl);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    if (self && avatarKey) void getBlobUrl(AVATAR_KEY).then((u) => { if (!dead) setUrl(u); });
    return () => { dead = true; };
  }, [self, avatarKey]);

  const rawUrl = (avatarUrl && avatarUrl.trim()) ? avatarUrl : (self ? (avatarKey ? url : storedAvatarUrl) : null);
  const activeImgUrl = (rawUrl && rawUrl.trim()) || null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const isFailed = failedUrl === activeImgUrl;

  return (
    <div
      className={className ?? 'flex items-center justify-center overflow-hidden rounded-full border-2 border-white'}
      style={{
        width: size, height: size, fontSize: size * 0.5,
        ...(className ? {} : { background: PRESET_BG[preset % PRESET_BG.length] }),
        display: 'grid', placeItems: 'center',
      }}
      title={name}
    >
      {activeImgUrl && !isFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeImgUrl}
          alt={name}
          width={size}
          height={size}
          onError={() => setFailedUrl(activeImgUrl)}
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
      ) : (
        <span>{PRESETS[preset % PRESETS.length]}</span>
      )}
      {showUpload && null}
    </div>
  );
}

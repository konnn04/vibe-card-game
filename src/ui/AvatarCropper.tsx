'use client';
import Cropper, { type Area } from 'react-easy-crop';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AVATAR_KEY, encodeSquareWebp, putBlob } from '@/src/lib/idb';
import { useSettings } from '@/src/lib/settings';
import { UI } from '@/src/config';

/** Cắt vùng đã chọn ra canvas rồi nén WebP — không bao giờ lưu ảnh gốc. */
async function cropToBlob(src: string, area: Area, out: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const c = document.createElement('canvas');
  c.width = area.width;
  c.height = area.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return encodeSquareWebp(c, out, 0.82);
}

/** Cropper avatar — 256px, giới hạn cứng để texture không phá GPU budget. */
export function ImageCropperModal({ src, onClose }: { src: string; onClose: () => void }) {
  const t = useTranslations('profile');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const set = useSettings((s) => s.set);

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  const save = async () => {
    if (!area) return;
    setBusy(true);
    const blob = await cropToBlob(src, area, UI.avatarPx);
    await putBlob(AVATAR_KEY, blob);
    set('avatarKey', AVATAR_KEY);
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="glass w-[min(94vw,420px)] p-4">
        <div className="mb-3 text-center font-black">{t('crop')}</div>
        <div className="relative h-64 w-full overflow-hidden rounded-xl bg-black/50">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm">
          {t('zoom')}
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))} className="flex-1"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn--primary" disabled={busy || !area} onClick={save}>{t('save')}</button>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSettings } from '@/src/lib/settings';
import { randomName, validName } from '@/src/lib/names';
import { delBlob, AVATAR_KEY } from '@/src/lib/idb';
import { useRoom } from '@/src/state/room';
import { api, loadToken } from '@/src/state/net';
import { Avatar, PRESETS } from './Avatar';
import { ImageCropperModal } from './AvatarCropper';

function useIsCompactHeight(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const check = () => setCompact(window.innerHeight < 520);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return compact;
}

export function Profile({ onClose }: { onClose: () => void }) {
  const t = useTranslations('profile');
  const { username, avatarPreset, set } = useSettings();
  const [name, setName] = useState(username);
  const [src, setSrc] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const isCompact = useIsCompactHeight();

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-2 sm:p-6" style={{ background: 'rgba(10,4,16,.72)' }}>
      <div
        className="max-h-[94vh] overflow-y-auto w-[min(94vw,480px)] rounded-[20px] p-3.5 sm:p-7"
        style={{ background: 'rgba(36,21,54,.96)', border: '1px solid rgba(255,255,255,.14)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="display text-[22px] sm:text-[34px] leading-none text-[#FFF3DA]">{t('title')}</div>
            <div className="label mt-0.5 text-[10px] sm:text-[13px] tracking-[.15em] sm:tracking-[.2em] text-[#A48AC8]">{t('storedLocal')}</div>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 sm:h-9 sm:w-9 place-items-center rounded-full text-white/80 hover:text-white bg-white/10"
            aria-label={t('cancel')}
          >
            ✕
          </button>
        </div>

        {/* Khối Avatar & Tên: xếp hàng ngang trên mobile landscape để tiết kiệm tối đa chiều cao */}
        <div className={`mt-2.5 sm:mt-5 flex ${isCompact ? 'items-center gap-3' : 'flex-col gap-4'}`}>
          <div
            className={`grid place-items-center rounded-2xl ${isCompact ? 'p-2 shrink-0' : 'py-5'}`}
            style={{ background: 'repeating-linear-gradient(135deg,#241C33 0 10px,#2E2440 10px 20px)' }}
          >
            <div className="rounded-full p-[2px] sm:p-[3px]" style={{ border: '2px sm:border-3 solid #FFD34D' }}>
              <Avatar
                name={name}
                preset={avatarPreset}
                size={isCompact ? 56 : 110}
                self
                className="seat__avatar !rounded-full !border-0"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2.5" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)' }}>
                <div className="label-sm text-[10px] sm:text-[12px]">{t('username')}</div>
                <input
                  type="text"
                  value={name}
                  maxLength={16}
                  onChange={(e) => setName(e.target.value)}
                  className="!border-0 !bg-transparent !px-0 !py-0 text-[16px] sm:text-[24px] text-[#FFF3DA] w-full"
                />
              </div>
              <button
                className="display rounded-xl px-3 py-2 sm:px-4 sm:py-3.5 text-[13px] sm:text-[17px] text-[#FFD34D] shrink-0"
                style={{ background: 'rgba(255,211,77,.16)', border: '1px solid rgba(255,211,77,.5)' }}
                onClick={() => setName(randomName())}
              >
                {t('random')}
              </button>
            </div>
            {!validName(name) && <div className="mt-1 text-[11px] sm:text-[13px] font-semibold text-[#E23B2E]">{t('invalidName')}</div>}
          </div>
        </div>

        {/* Danh sách avatar cài sẵn */}
        <div className="mt-2 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p}
              className={`chip !px-2.5 !py-1 !text-[11px] sm:!text-[13px] ${avatarPreset === i ? 'chip--on' : ''}`}
              onClick={() => set('avatarPreset', i)}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Nút tải lên / Đặt lại */}
        <div className="mt-2.5 sm:mt-4 flex gap-2 sm:gap-3">
          <button className="btn flex-1 !py-1 sm:!py-2 !text-[12px] sm:!text-[15px]" onClick={() => file.current?.click()}>{t('upload')}</button>
          <button
            className="btn flex-1 !py-1 sm:!py-2 !text-[12px] sm:!text-[15px]"
            onClick={async () => {
              await delBlob(AVATAR_KEY);
              set('avatarKey', null);
              const { mode, code, meId } = useRoom.getState();
              if (mode === 'online' && code) {
                void api.avatar(code, meId, loadToken(code), useSettings.getState().avatarUrl ?? null);
              }
            }}
          >
            {t('reset')}
          </button>
        </div>

        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setSrc(URL.createObjectURL(f));
        }} />

        {/* Nút Lưu / Hủy */}
        <div className="mt-2.5 sm:mt-5 flex justify-end gap-2 sm:gap-3">
          <button className="btn btn--ghost !py-1 sm:!py-2 !text-[13px] sm:!text-[16px]" onClick={onClose}>{t('cancel')}</button>
          <button
            className="btn btn--gold !py-1 sm:!py-2 !px-5 sm:!px-7 !text-[13px] sm:!text-[16px]"
            disabled={!validName(name)}
            onClick={() => { set('username', name.trim()); onClose(); }}
          >
            {t('save')}
          </button>
        </div>
      </div>
      {src && <ImageCropperModal src={src} onClose={() => setSrc(null)} />}
    </div>
  );
}

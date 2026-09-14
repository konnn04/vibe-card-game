'use client';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSettings } from '@/src/lib/settings';
import { randomName, validName } from '@/src/lib/names';
import { delBlob, AVATAR_KEY } from '@/src/lib/idb';
import { useRoom } from '@/src/state/room';
import { api, loadToken } from '@/src/state/net';
import { Avatar, PRESETS } from './Avatar';
import { ImageCropperModal } from './AvatarCropper';

export function Profile({ onClose }: { onClose: () => void }) {
  const t = useTranslations('profile');
  const { username, avatarPreset, set } = useSettings();
  const [name, setName] = useState(username);
  const [src, setSrc] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-6" style={{ background: 'rgba(10,4,16,.72)' }}>
      <div
        className="w-[min(94vw,470px)] rounded-[20px] p-7"
        style={{ background: 'rgba(36,21,54,.94)', border: '1px solid rgba(255,255,255,.12)' }}
      >
        <div className="display text-[34px] leading-none text-[#FFF3DA]">{t('title')}</div>
        <div className="label mt-1 text-[13px] tracking-[.2em] text-[#A48AC8]">{t('storedLocal')}</div>

        <div
          className="mt-6 grid place-items-center rounded-2xl py-7"
          style={{ background: 'repeating-linear-gradient(135deg,#241C33 0 10px,#2E2440 10px 20px)' }}
        >
          <div className="rounded-full p-[3px]" style={{ border: '3px solid #FFD34D' }}>
            <Avatar name={name} preset={avatarPreset} size={132} self className="seat__avatar !h-[132px] !w-[132px] !rounded-full !border-0" />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.18)' }}>
            <div className="label-sm">{t('username')}</div>
            <input
              type="text"
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              className="!border-0 !bg-transparent !px-0 !py-0 text-[24px] text-[#FFF3DA]"
            />
          </div>
          <button
            className="display rounded-xl px-4 py-3.5 text-[17px] text-[#FFD34D]"
            style={{ background: 'rgba(255,211,77,.16)', border: '1px solid rgba(255,211,77,.5)' }}
            onClick={() => setName(randomName())}
          >
            {t('random')}
          </button>
        </div>
        {!validName(name) && <div className="mt-2 text-[13px] font-semibold text-[#E23B2E]">{t('invalidName')}</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p}
              className={`chip ${avatarPreset === i ? 'chip--on' : ''}`}
              onClick={() => set('avatarPreset', i)}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button className="btn flex-1" onClick={() => file.current?.click()}>{t('upload')}</button>
          <button
            className="btn flex-1"
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

        <div className="mt-5 flex justify-end gap-3">
          <button className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
          <button
            className="btn btn--gold"
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

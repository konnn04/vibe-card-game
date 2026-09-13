'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { playSfx } from '@/src/lib/audio';
import { useAvatarLookup, useRoom } from '@/src/state/room';
import { serverNow } from '@/src/state/clock';
import { Avatar } from './Avatar';

/**
 * CỘT NGƯỜI ĐANG XEM — hiện trong lúc ván đang chạy, khi phòng đông hơn 4 người.
 *
 * Hàng chờ trước đây chỉ tồn tại ở phòng chờ; vào ván là những người thừa biến
 * mất khỏi màn hình, không ai biết còn ai trong phòng. Cột này giữ họ hiện diện.
 *
 * Rê chuột vào cột thì mỗi người hiện thêm trạng thái, và RIÊNG MÌNH có nút đổi
 * giữa "chờ vào ghế" và "chỉ xem" — đổi được ngay giữa ván, vì đó mới là lúc
 * người ta biết mình có muốn chơi ván sau hay không.
 */

/** Bao lâu không có nhịp tim thì coi như mất kết nối (nhịp là 5s). */
const STALE_MS = 15000;

function Dot({ online, ping, stale }: { online: boolean; ping: number | null; stale: boolean }) {
  const color = !online || stale ? '#E2483B' : ping == null ? '#8A8A8A' : ping < 150 ? '#4ED16B' : ping < 400 ? '#F0B62E' : '#E2483B';
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: 8, height: 8, background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

export function SpectatorRail() {
  const t = useTranslations('game');
  const queue = useRoom((s) => s.queue);
  const meId = useRoom((s) => s.meId);
  const mode = useRoom((s) => s.mode);
  const presence = useRoom((s) => s.presence);
  const setWatchMode = useRoom((s) => s.setWatchMode);
  const [open, setOpen] = useState(false);
  const avatarOf = useAvatarLookup();

  if (mode !== 'online' || queue.length === 0) return null;
  const now = serverNow();

  return (
    <div
      className="pointer-events-auto absolute right-4 top-1/2 z-30 -translate-y-1/2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className="flex flex-col gap-2 rounded-2xl p-2.5"
        style={{ background: 'rgba(12,5,9,.72)', border: '1px solid rgba(255,196,128,.28)' }}
      >
        <div className="label px-1 text-[10px] tracking-[.2em] text-[#C79A6C]">
          {t('watching', { n: queue.length })}
        </div>

        {queue.map((q) => {
          const pr = presence[q.id];
          const stale = !!pr && pr.ts > 0 && now - pr.ts > STALE_MS;
          const isMe = q.id === meId;
          return (
            <div key={q.id} className="flex items-center gap-2">
              <Avatar
                name={q.name}
                preset={q.avatarPreset}
                avatarUrl={avatarOf(q.id).url}
                self={isMe}
                size={30}
                className="seat__avatar !h-[30px] !w-[30px] !rounded-lg !border-2"
              />
              {open && (
                <div className="min-w-[108px]">
                  <div className="display flex items-center gap-1.5 text-[14px] leading-none text-[#FFE9C2]">
                    <Dot online={!!pr?.online} ping={pr?.ping ?? null} stale={stale} />
                    <span className="truncate">{q.name}</span>
                  </div>
                  <div className="label text-[10px] tracking-[.1em] text-[#9C8270]">
                    {q.watchOnly ? t('modeWatch') : t('modePlay')}
                    {pr?.ping != null && !stale ? ` · ${pr.ping}ms` : ''}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Chỉ đổi được cho CHÍNH MÌNH, và chỉ khi mình đang ở hàng chờ. */}
        {open && queue.some((q) => q.id === meId) && (
          <button
            className="label mt-1 rounded-lg px-2.5 py-1.5 text-[11px] tracking-[.12em]"
            style={{ background: 'rgba(255,211,77,.16)', border: '1px solid rgba(255,211,77,.5)', color: '#FFD34D' }}
            onClick={() => {
              playSfx('click');
              const mine = queue.find((q) => q.id === meId);
              setWatchMode(!mine?.watchOnly);
            }}
          >
            {queue.find((q) => q.id === meId)?.watchOnly ? t('switchToPlay') : t('switchToWatch')}
          </button>
        )}
      </div>
    </div>
  );
}

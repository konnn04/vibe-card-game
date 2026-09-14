'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { playSfx } from '@/src/lib/audio';
import { useAvatarLookup, useRoom } from '@/src/state/room';
import { serverNow } from '@/src/state/clock';
import { useChat } from '@/src/state/chat';
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

function PingBadge({ online, ping, stale }: { online: boolean; ping: number | null; stale: boolean }) {
  const bad = !online || stale;
  const color = bad ? '#E2483B' : ping == null ? '#8A8A8A' : ping < 150 ? '#4ED16B' : ping < 400 ? '#F0B62E' : '#E2483B';
  const label = bad ? 'OFF' : ping != null ? `${ping}` : '---';
  return (
    <span
      title={bad ? 'offline' : ping != null ? `${ping}ms` : ''}
      className="inline-block rounded font-mono text-[9px] font-bold leading-none"
      style={{
        padding: '1px 3px',
        background: `${color}22`,
        color,
        border: `1px solid ${color}88`,
        minWidth: 24,
        textAlign: 'center',
      }}
    >
      {label}
    </span>
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
  const chatMessages = useChat((s) => s.messages);

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
          const chat = chatMessages[q.id];
          return (
            <div key={q.id} className="relative flex items-center gap-2">
              <AnimatePresence>
                {chat && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85, x: 10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.85, x: 8 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                    className="pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2 z-50 flex items-center gap-1.5 rounded-2xl px-3 py-1.5 shadow-2xl whitespace-nowrap"
                    style={{
                      background: 'rgba(20, 10, 16, 0.94)',
                      border: '1.5px solid rgba(255, 211, 77, 0.75)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.65), 0 0 16px rgba(255,211,77,0.25)',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <span className="font-bold text-[12px] text-[#FFD34D]">{q.name}:</span>
                    <span className="text-[13px] text-[#FFF3DA] font-medium">{chat.message}</span>
                  </motion.div>
                )}
              </AnimatePresence>
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
                    <PingBadge online={!!pr?.online} ping={pr?.ping ?? null} stale={stale} />
                    <span className="truncate">{q.name}</span>
                  </div>
                  <div className="label text-[10px] tracking-[.1em] text-[#9C8270]">
                    {q.watchOnly ? t('modeWatch') : t('modePlay')}
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

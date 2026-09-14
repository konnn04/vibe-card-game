'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAvatarLookup, useRoom } from '@/src/state/room';
import { playSfx } from '@/src/lib/audio';
import { Avatar } from './Avatar';
import { UI } from '@/src/config';

/** Số giây đếm ngược trước khi chia bài — đủ để đọc hết luật nhà đang bật. */
const COUNTDOWN_SECONDS = 5;

/** Intro trước khi chia bài: tên phòng + luật đang bật + avatar bay vào ghế + đếm ngược. */
export function DealIntro({ onDone }: { onDone: () => void }) {
  const tr = useTranslations('rules');
  const { code, seats, rules, deckType, meId } = useRoom();
  const avatarOf = useAvatarLookup();
  const [count, setCount] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (count <= 0) {
      // Hết đếm: hô vào trận rồi mới trả quyền cho bàn chơi.
      playSfx('gameStart');
      const id = setTimeout(onDone, UI.countdownOutroMs);
      return () => clearTimeout(id);
    }
    // Tick mỗi nhịp đếm. Đặt ở đây chứ không trong setTimeout để tiếng khớp
    // đúng với con số đang hiện trên màn hình.
    playSfx('countdown');
    const id = setTimeout(() => setCount((c) => c - 1), UI.countdownStepMs);
    return () => clearTimeout(id);
  }, [count, onDone]);

  const active = [
    rules.sevenZero && tr('sevenZero'),
    rules.stack && tr('stack'),
    rules.jumpIn && tr('jumpIn'),
    rules.challenge && tr('challenge'),
    rules.rushPenalty && tr('rushPenalty'),
    rules.drawToMatch && tr('drawToMatch'),
    rules.forcePlay && tr('forcePlay'),
    rules.teamMode && tr('teamMode'),
  ].filter(Boolean) as string[];

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6"
      style={{ background: 'rgba(20,4,10,.78)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
        <div className="display text-[40px] tracking-[0.3em] text-[#FFD34D]">{code}</div>
        <div className="label text-[14px] text-[#F6C79A]">{deckType === 'flip' ? tr('flip') : tr('classic')}</div>
      </motion.div>

      <div className="flex max-w-[80vw] flex-wrap justify-center gap-2">
        {active.map((r, i) => (
          <motion.span
            key={r}
            className="chip chip--on"
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08 * i }}
          >
            {r}
          </motion.span>
        ))}
      </div>

      <div className="flex gap-6">
        {seats.filter(Boolean).map((s, i) => (
          <motion.div
            key={s!.id}
            className="flex flex-col items-center gap-1"
            initial={{ y: 60, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.12 * i, type: 'spring', stiffness: 260, damping: 20 }}
          >
            <Avatar name={s!.name} preset={s!.avatarPreset} size={56} avatarUrl={avatarOf(s!.id).url} self={s!.id === meId} className="seat__avatar !h-14 !w-14" />
            <span className="display text-[16px] text-[#FFF3DA]">{s!.name}</span>
          </motion.div>
        ))}
      </div>

      <motion.div
        key={count}
        initial={{ scale: 1.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="display text-[16vmin] leading-none text-[#FFD34D]"
        style={{ textShadow: '0 8px 0 #A8460B' }}
      >
        {count > 0 ? count : 'GO!'}
      </motion.div>
    </motion.div>
  );
}

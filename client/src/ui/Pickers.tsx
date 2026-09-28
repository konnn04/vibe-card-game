'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { CardColor } from '@u-no/game-engine';
import { COLOR_HEX } from '@/src/three/atlas';
import { playSfx } from '@/src/lib/audio';

/**
 * Bánh xe chọn màu (mock 04): conic-gradient N phần + đường chia trắng.
 * Mỗi phần là 1 button cắt theo hình quạt (clip-path), bấm đâu ăn đó.
 * N = 4, hoặc 8 cho lá Đổi màu thường của bộ Hỗn loạn (cả hai hệ màu).
 */

/** Hình quạt [a0, a1] (độ, 0 = đỉnh, theo chiều kim đồng hồ) dưới dạng clip-path. */
function wedgeClip(a0: number, a1: number): string {
  const pts = ['50% 50%'];
  const steps = Math.max(2, Math.ceil((a1 - a0) / 10));
  for (let k = 0; k <= steps; k++) {
    const a = ((a0 + ((a1 - a0) * k) / steps) * Math.PI) / 180;
    pts.push(`${50 + Math.sin(a) * 50}% ${50 - Math.cos(a) * 50}%`);
  }
  return `polygon(${pts.join(',')})`;
}

export function ColorWheel({
  open,
  colors,
  seconds,
  title,
  onPick,
}: {
  open: boolean;
  colors: CardColor[];
  /** Tiêu đề thay cho "Chọn màu" (vd No Mercy: bị Color Roulette nhắm vào). */
  title?: string;
  seconds: number;
  onPick: (c: CardColor) => void;
}) {
  const t = useTranslations('game');
  const step = 360 / colors.length;
  const conic = colors.map((c, i) => `${COLOR_HEX[c]} ${i * step}deg ${(i + 1) * step}deg`).join(',');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto absolute inset-0 grid place-items-center"
          style={{ background: 'rgba(8,2,6,.55)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex flex-col items-center gap-3 sm:gap-6">
            <div className="text-center">
              <div
                className="display text-[26px] sm:text-[46px] text-[#FFF3DA]"
                style={{ textShadow: '0 4px 0 rgba(0,0,0,.4)' }}
              >
                {title ?? t('pickColor')}
              </div>
              <div className="label mt-0.5 text-[13px] sm:text-[15px] tracking-[.24em] text-[#FFC98A]">{seconds}s</div>
            </div>

            <motion.div
              className="relative"
              style={{ width: 'min(360px, 56vh)', height: 'min(360px, 56vh)' }}
              initial={{ scale: 0.8, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${conic})`,
                  border: '6px solid #fff',
                  boxShadow: '0 20px 50px rgba(0,0,0,.6), 0 0 50px rgba(255,170,70,.35)',
                }}
              />
              {/* Đường chia trắng: mỗi đường đi qua tâm là ranh giới của 2 cặp ô đối xứng. */}
              {Array.from({ length: colors.length / 2 }, (_, k) => (
                <div
                  key={`line-${k}`}
                  className="pointer-events-none absolute left-1/2 top-0 h-full w-1.5 -translate-x-1/2 bg-white"
                  style={{ transform: `translateX(-50%) rotate(${k * step}deg)` }}
                />
              ))}

              {colors.map((c, i) => (
                <button
                  key={c}
                  onClick={() => {
                    playSfx('click');
                    onPick(c);
                  }}
                  className="absolute inset-0 transition-transform hover:scale-105 active:scale-95"
                  style={{
                    clipPath: wedgeClip(i * step, (i + 1) * step),
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                  }}
                  aria-label={c}
                />
              ))}
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                style={{ width: 'min(116px, 18vh)', height: 'min(116px, 18vh)', background: '#17141F', border: '5px solid #fff' }}
              >
                <div className={`grid gap-1 ${colors.length > 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                  {colors.map((c) => (
                    <span
                      key={`q-${c}`}
                      className="block h-[20px] w-[20px] rounded-[4px]"
                      style={{ background: COLOR_HEX[c] }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Luật 7: chọn người để đổi tay bài. */
export function SwapPicker({
  open,
  names,
  onPick,
}: {
  open: boolean;
  names: { id: string; name: string; n: number }[];
  onPick: (id: string) => void;
}) {
  const t = useTranslations('game');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto absolute inset-0 grid place-items-center"
          style={{ background: 'rgba(8,2,6,.55)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="panel p-6 text-center">
            <div className="display mb-4 text-[32px] text-[#FFF3DA]">{t('pickSwap')}</div>
            <div className="flex gap-3">
              {names.map((p) => (
                <button key={p.id} className="btn btn--gold" onClick={() => onPick(p.id)}>
                  {p.name}
                  <span className="ml-2 opacity-70">{t('cards', { n: p.n })}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

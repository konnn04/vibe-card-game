'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { colorsOf, type CardColor } from '@u-no/game-engine';
import { COLOR_HEX } from '@/src/three/atlas';
import { playSfx } from '@/src/lib/audio';

/**
 * Bánh xe chọn màu (mock 04): conic-gradient 4 phần + chữ thập trắng.
 * Mỗi phần là 1 button phủ 1/4 vòng, bấm đâu ăn đó.
 */
export function ColorWheel({
  open,
  side,
  seconds,
  onPick,
}: {
  open: boolean;
  side: 'light' | 'dark';
  seconds: number;
  onPick: (c: CardColor) => void;
}) {
  const t = useTranslations('game');
  const colors = colorsOf(side);
  const conic = colors.map((c, i) => `${COLOR_HEX[c]} ${i * 90}deg ${(i + 1) * 90}deg`).join(',');

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
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <div
                className="display text-[46px] text-[#FFF3DA]"
                style={{ textShadow: '0 5px 0 rgba(0,0,0,.4)' }}
              >
                {t('pickColor')}
              </div>
              <div className="label mt-1 text-[15px] tracking-[.24em] text-[#FFC98A]">{seconds}s</div>
            </div>

            <motion.div
              className="relative"
              style={{ width: 380, height: 380 }}
              initial={{ scale: 0.8, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${conic})`,
                  border: '8px solid #fff',
                  boxShadow: '0 30px 70px rgba(0,0,0,.6), 0 0 70px rgba(255,170,70,.35)',
                }}
              />
              <div className="pointer-events-none absolute left-1/2 top-0 h-full w-2 -translate-x-1/2 bg-white" />
              <div className="pointer-events-none absolute left-0 top-1/2 h-2 w-full -translate-y-1/2 bg-white" />

              {colors.map((c, i) => (
                <button
                  key={c}
                  onClick={() => {
                    playSfx('click');
                    onPick(c);
                  }}
                  className="display absolute h-1/2 w-1/2 text-[30px] text-white transition-transform hover:scale-105"
                  style={{
                    ...(i === 0
                      ? { right: 0, top: 0 }
                      : i === 1
                      ? { right: 0, bottom: 0 }
                      : i === 2
                      ? { left: 0, bottom: 0 }
                      : { left: 0, top: 0 }),
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                  }}
                  aria-label={c}
                />
              ))}
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                style={{ width: 132, height: 132, background: '#17141F', border: '8px solid #fff' }}
              >
                <div className="grid grid-cols-2 gap-[5px]">
                  {colors.map((c) => (
                    <span
                      key={`q-${c}`}
                      className="block h-[26px] w-[26px] rounded-[5px]"
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

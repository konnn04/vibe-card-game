'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { playSfx } from '@/src/lib/audio';
import { DECK_TYPES, type DeckType } from '@u-no/game-engine';
import { CardPhoto } from './CardPhoto';
import { modeVisual } from '@/src/modes';

/**
 * HƯỚNG DẪN CHƠI — mỗi chế độ chơi một tab, mỗi tab là một chuỗi slide giới
 * thiệu TỪNG LOẠI LÁ kèm ảnh bài thật (danh sách slide nằm ở src/modes.ts).
 *
 * Dùng ảnh thật thay vì mô tả chữ vì người chơi cần NHẬN RA lá bài trên bàn,
 * không cần thuộc tên tiếng Anh của nó. Bộ Flip có hai mặt nên slide của nó
 * hiện SONG SONG mặt Light và mặt Dark của cùng một lá — đó đúng là điểm khó
 * hiểu nhất của bộ này.
 */
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

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations('howto');
  const [deck, setDeck] = useState<DeckType>('classic');
  const [i, setI] = useState(0);
  const isCompact = useIsCompactHeight();
  const slides = modeVisual(deck).slides;
  const slide = slides[Math.min(i, slides.length - 1)];

  const go = (d: number) => {
    playSfx('click');
    setI((v) => (v + d + slides.length) % slides.length);
  };

  // Điều hướng bằng bàn phím — cùng bộ phím với phần còn lại của game.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') return onClose();
      if (ev.key === 'ArrowLeft') return go(-1);
      if (ev.key === 'ArrowRight') return go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const renderTab = (id: DeckType, label: string) => (
    <button
      key={id}
      className={`label rounded-[12px] ${isCompact ? 'px-3 py-1 text-[12px]' : 'px-5 py-2.5 text-[15px]'} transition-colors`}
      style={
        deck === id
          ? { background: 'linear-gradient(140deg,#FFD34D,#FF9E2C)', color: '#2A1508' }
          : { background: 'rgba(255,255,255,.08)', color: '#EDE0FA' }
      }
      onClick={() => { playSfx('click'); setDeck(id); setI(0); }}
    >
      {label}
    </button>
  );

  const cardH = isCompact ? 96 : 220;

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center p-2 sm:p-4"
      style={{ background: 'rgba(10,4,16,.78)' }}
      onClick={onClose}
    >
      <div
        className={`relative max-h-[94vh] overflow-y-auto w-[min(94vw,620px)] rounded-[20px] ${isCompact ? 'p-3' : 'p-6'}`}
        style={{ background: 'rgba(36,21,54,.96)', border: '1px solid rgba(255,255,255,.14)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className={`absolute ${isCompact ? 'right-2.5 top-2.5 h-7 w-7' : 'right-4 top-4 h-9 w-9'} grid place-items-center rounded-full`}
          style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
          onClick={onClose}
          aria-label={t('close')}
        >
          <X size={isCompact ? 15 : 18} />
        </button>

        <div className={`display ${isCompact ? 'mb-1.5 text-[18px]' : 'mb-4 text-[28px]'} text-[#FFD34D]`}>{t('title')}</div>
        <div className={`${isCompact ? 'mb-2' : 'mb-5'} flex gap-2`}>
          {DECK_TYPES.map((id) => renderTab(id, t(modeVisual(id).tabKey)))}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            className={`grid ${isCompact ? 'h-8 w-8' : 'h-11 w-11'} shrink-0 place-items-center rounded-full`}
            style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
            onClick={() => go(-1)}
            aria-label={t('prev')}
          >
            <ChevronLeft size={isCompact ? 18 : 22} />
          </button>

          <div className={`flex ${isCompact ? 'min-h-[105px]' : 'min-h-[236px]'} flex-1 items-center gap-3 sm:gap-5`}>
            <div className="flex shrink-0 gap-2 sm:gap-3">
              <CardPhoto atlas={slide.light.atlas} name={slide.light.name} height={cardH} className="rounded-[8px] sm:rounded-[12px]"
                style={{ boxShadow: '0 8px 20px rgba(0,0,0,.5)' }} />
              {slide.dark && (
                <CardPhoto atlas={slide.dark.atlas} name={slide.dark.name} height={cardH} className="rounded-[8px] sm:rounded-[12px]"
                  style={{ boxShadow: '0 8px 20px rgba(0,0,0,.5)' }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`display ${isCompact ? 'text-[16px]' : 'text-[24px]'} text-[#FFF3DA]`}>{t(`${slide.key}Title`)}</div>
              <p className={`mt-1 ${isCompact ? 'text-[11px] leading-snug' : 'text-[14px] leading-relaxed'} font-semibold text-[#C9B3E6]`}>{t(`${slide.key}Body`)}</p>
            </div>
          </div>

          <button
            className={`grid ${isCompact ? 'h-8 w-8' : 'h-11 w-11'} shrink-0 place-items-center rounded-full`}
            style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
            onClick={() => go(1)}
            aria-label={t('next')}
          >
            <ChevronRight size={isCompact ? 18 : 22} />
          </button>
        </div>

        <div className={`flex justify-center gap-1.5 ${isCompact ? 'mt-2' : 'mt-5'}`}>
          {slides.map((s, k) => (
            <button
              key={s.key}
              className={`${isCompact ? 'h-2' : 'h-2.5'} rounded-full transition-all`}
              style={{ width: k === i ? (isCompact ? 18 : 26) : (isCompact ? 7 : 10), background: k === i ? '#FFD34D' : 'rgba(255,255,255,.22)' }}
              onClick={() => { playSfx('click'); setI(k); }}
              aria-label={`${k + 1}/${slides.length}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { playSfx } from '@/src/lib/audio';
import { CardPhoto, type AtlasId } from './CardPhoto';

/**
 * HƯỚNG DẪN CHƠI — 2 tab (Ú Nồ cổ điển / Ú Nồ Flip), mỗi tab là một chuỗi
 * slide giới thiệu TỪNG LOẠI LÁ kèm ảnh bài thật.
 *
 * Dùng ảnh thật thay vì mô tả chữ vì người chơi cần NHẬN RA lá bài trên bàn,
 * không cần thuộc tên tiếng Anh của nó. Bộ Flip có hai mặt nên slide của nó
 * hiện SONG SONG mặt Light và mặt Dark của cùng một lá — đó đúng là điểm khó
 * hiểu nhất của bộ này.
 */
interface Slide {
  /** Sprite mặt chính. */
  light: { atlas: AtlasId; name: string };
  /** Mặt còn lại (chỉ bộ Flip) — hiện cạnh mặt Light để thấy rõ cặp đôi. */
  dark?: { atlas: AtlasId; name: string };
  /** Khoá i18n: tiêu đề + mô tả luật. */
  key: string;
}

const CLASSIC: Slide[] = [
  { key: 'number', light: { atlas: 'std', name: '7_red' } },
  { key: 'skip', light: { atlas: 'std', name: 'skip_blue' } },
  { key: 'reverse', light: { atlas: 'std', name: 'reverse_green' } },
  { key: 'draw2', light: { atlas: 'std', name: 'draw_2_yellow' } },
  { key: 'wild', light: { atlas: 'std', name: 'wild_draw' } },
  { key: 'wild4', light: { atlas: 'std', name: 'wild_draw_4' } },
  { key: 'back', light: { atlas: 'std', name: 'back_side' } },
];

const FLIP: Slide[] = [
  { key: 'flipNumber', light: { atlas: 'flipLight', name: '7_red' }, dark: { atlas: 'flipDark', name: '7_pink' } },
  { key: 'flipCard', light: { atlas: 'flipLight', name: 'flip_red' }, dark: { atlas: 'flipDark', name: 'flip_dark_pink' } },
  { key: 'flipDraw', light: { atlas: 'flipLight', name: 'draw_1_blue' }, dark: { atlas: 'flipDark', name: 'draw_5_dark_cyan' } },
  { key: 'flipSkip', light: { atlas: 'flipLight', name: 'skip_green' }, dark: { atlas: 'flipDark', name: 'skip_all_darkorange' } },
  { key: 'flipReverse', light: { atlas: 'flipLight', name: 'reverse_yellow' }, dark: { atlas: 'flipDark', name: 'reverse_dark_purple' } },
  { key: 'flipWild', light: { atlas: 'flipLight', name: 'wild_draw' }, dark: { atlas: 'flipDark', name: 'wild_dark' } },
  { key: 'flipWildDraw', light: { atlas: 'flipLight', name: 'wild_draw_2' }, dark: { atlas: 'flipDark', name: 'draw_until_dark' } },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations('howto');
  const [deck, setDeck] = useState<'classic' | 'flip'>('classic');
  const [i, setI] = useState(0);
  const slides = deck === 'classic' ? CLASSIC : FLIP;
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

  // GỌI HÀM trả JSX, không khai component trong thân render — component tạo
  // lúc render bị mất state mỗi lần cha render lại (React Compiler chặn).
  const renderTab = (id: 'classic' | 'flip', label: string) => (
    <button
      key={id}
      className="label rounded-[14px] px-5 py-2.5 text-[15px] transition-colors"
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

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(10,4,16,.78)' }}
      onClick={onClose}
    >
      <div
        className="relative w-[min(94vw,760px)] rounded-[26px] p-6"
        style={{ background: 'rgba(36,21,54,.96)', border: '1px solid rgba(255,255,255,.14)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full"
          style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
          onClick={onClose}
          aria-label={t('close')}
        >
          <X size={18} />
        </button>

        <div className="display mb-4 text-[28px] text-[#FFD34D]">{t('title')}</div>
        <div className="mb-5 flex gap-2.5">
          {renderTab('classic', t('tabClassic'))}
          {renderTab('flip', t('tabFlip'))}
        </div>

        <div className="flex items-center gap-5">
          <button
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
            onClick={() => go(-1)}
            aria-label={t('prev')}
          >
            <ChevronLeft size={22} />
          </button>

          <div className="flex min-h-[236px] flex-1 items-center gap-5">
            <div className="flex shrink-0 gap-3">
              <CardPhoto atlas={slide.light.atlas} name={slide.light.name} height={220} className="rounded-[12px]"
                style={{ boxShadow: '0 14px 30px rgba(0,0,0,.5)' }} />
              {slide.dark && (
                <CardPhoto atlas={slide.dark.atlas} name={slide.dark.name} height={220} className="rounded-[12px]"
                  style={{ boxShadow: '0 14px 30px rgba(0,0,0,.5)' }} />
              )}
            </div>
            <div>
              <div className="display text-[24px] text-[#FFF3DA]">{t(`${slide.key}Title`)}</div>
              <p className="mt-2 text-[14px] font-semibold leading-relaxed text-[#C9B3E6]">{t(`${slide.key}Body`)}</p>
            </div>
          </div>

          <button
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
            onClick={() => go(1)}
            aria-label={t('next')}
          >
            <ChevronRight size={22} />
          </button>
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {slides.map((s, k) => (
            <button
              key={s.key}
              className="h-2.5 rounded-full transition-all"
              style={{ width: k === i ? 26 : 10, background: k === i ? '#FFD34D' : 'rgba(255,255,255,.22)' }}
              onClick={() => { playSfx('click'); setI(k); }}
              aria-label={`${k + 1}/${slides.length}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

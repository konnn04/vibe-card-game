'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { lockedRules, type DeckType, type Rules } from '@u-no/game-engine';
import { playSfx } from '@/src/lib/audio';
import { CardPhoto } from './CardPhoto';
import { modeVisual } from '@/src/modes';

/**
 * NÚT (i) TRONG VÁN — 2 tab:
 *  1. Luật ĐANG ÁP DỤNG cho phòng này (bật/tắt) kèm giải thích đầy đủ. Người
 *     vào giữa ván không thấy phòng chờ nên không biết chủ phòng bật gì — và
 *     mấy luật như Bắt lỗi +4 hay 0-7 thì không đoán được từ mặt bàn.
 *  2. Công dụng từng lá của ĐÚNG bộ bài đang chơi (dùng chung danh sách lá với
 *     HowToPlay), hiện dạng danh sách để tra nhanh thay vì bấm từng slide.
 */
type RuleKey = 'sevenZero' | 'stack' | 'jumpIn' | 'challenge' | 'rushPenalty' | 'drawToMatch' | 'forcePlay' | 'randomizeSeats' | 'teamMode' | 'blowUp';
const RULE_KEYS: RuleKey[] = ['blowUp', 'challenge', 'stack', 'rushPenalty', 'forcePlay', 'sevenZero', 'jumpIn', 'drawToMatch', 'teamMode', 'randomizeSeats'];

export function GameInfo({ rules, deckType, onClose }: { rules: Rules; deckType: DeckType; onClose: () => void }) {
  const t = useTranslations('info');
  const tr = useTranslations('rules');
  const th = useTranslations('howto');
  const [tab, setTab] = useState<'rules' | 'cards'>('rules');

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bật trước, tắt sau — thứ người chơi cần biết nhất là cái gì ĐANG có hiệu lực.
  const limit = rules.blowUpAt;
  const locked = new Set(lockedRules(deckType));
  const sorted = RULE_KEYS.slice().sort((a, b) => Number(!!rules[b]) - Number(!!rules[a]));
  const slides = modeVisual(deckType).guide;

  const renderTab = (id: 'rules' | 'cards', label: string) => (
    <button
      key={id}
      className="label rounded-[12px] px-3 py-1.5 text-[13px] transition-colors sm:px-4 sm:py-2 sm:text-[14px]"
      style={
        tab === id
          ? { background: 'linear-gradient(140deg,#FFD34D,#FF9E2C)', color: '#2A1508' }
          : { background: 'rgba(255,255,255,.08)', color: '#EDE0FA' }
      }
      onClick={() => { playSfx('click'); setTab(id); }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 grid place-items-center p-2 sm:p-4"
      style={{ background: 'rgba(10,4,16,.78)' }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-[min(94vw,640px)] flex-col rounded-[20px] p-3 sm:p-5"
        style={{ background: 'rgba(36,21,54,.96)', border: '1px solid rgba(255,255,255,.14)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full"
          style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
          onClick={onClose}
          aria-label={th('close')}
        >
          <X size={16} />
        </button>

        <div className="display mb-2 text-[20px] text-[#FFD34D] sm:mb-3 sm:text-[24px]">{t('title')}</div>
        <div className="mb-3 flex gap-2">
          {renderTab('rules', t('tabRules'))}
          {renderTab('cards', t('tabCards'))}
        </div>

        <div className="scroll-y min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === 'rules' ? (
            <div className="flex flex-col gap-2">
              <div className="rounded-[12px] px-3 py-2 text-[12px] font-semibold text-[#EDE0FA] sm:text-[13px]" style={{ background: 'rgba(255,255,255,.06)' }}>
                <div>{t('deckLine', { deck: tr(deckType) })}</div>
                <div className="text-[#C9B3E6]">
                  {t('setupLine', { cards: rules.startingCards, sec: rules.turnSeconds })}
                  {' · '}
                  {rules.targetScore > 0 ? t('targetLine', { n: rules.targetScore }) : t('singleLine')}
                </div>
              </div>
              {sorted.map((k) => {
                const on = !!rules[k];
                return (
                  <div
                    key={k}
                    className="rounded-[12px] px-3 py-2"
                    style={{
                      background: on ? 'rgba(52,211,153,.08)' : 'rgba(255,255,255,.03)',
                      border: `1px solid ${on ? 'rgba(52,211,153,.35)' : 'rgba(255,255,255,.08)'}`,
                      opacity: on ? 1 : 0.62,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wider"
                        style={on ? { background: '#34D399', color: '#07251A' } : { background: 'rgba(255,255,255,.14)', color: '#C9B3E6' }}
                      >
                        {on ? t('on') : t('off')}
                      </span>
                      <span className="display text-[15px] text-[#FFF3DA] sm:text-[16px]">{tr(k)}</span>
                      {locked.has(k) && <span className="text-[10px] font-bold text-[#FFD34D]/80">{tr('lockedByMode')}</span>}
                    </div>
                    <p className="mt-1 text-[11.5px] font-semibold leading-snug text-[#C9B3E6] sm:text-[13px]">{t(`${k}Body`, { n: limit })}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {slides.map((s) => (
                <div key={s.key} className="flex items-center gap-3 rounded-[12px] px-2.5 py-2" style={{ background: 'rgba(255,255,255,.05)' }}>
                  <div className="flex shrink-0 gap-1.5">
                    <CardPhoto atlas={s.light.atlas} name={s.light.name} height={78} className="rounded-[6px]" style={{ boxShadow: '0 4px 10px rgba(0,0,0,.45)' }} />
                    {s.dark && (
                      <CardPhoto atlas={s.dark.atlas} name={s.dark.name} height={78} className="rounded-[6px]" style={{ boxShadow: '0 4px 10px rgba(0,0,0,.45)' }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="display text-[15px] text-[#FFF3DA] sm:text-[16px]">{th(`${s.key}Title`)}</div>
                    <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-[#C9B3E6] sm:text-[13px]">{th(`${s.key}Body`)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

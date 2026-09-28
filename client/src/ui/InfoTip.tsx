'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * Icon (i) nhỏ, hover (hoặc chạm trên mobile) hiện tooltip giải thích.
 *
 * Tooltip vẽ qua portal ra `document.body` với `position: fixed`: cột luật ở
 * phòng chờ là khung cuộn (overflow), tooltip absolute nằm trong đó sẽ bị cắt.
 * Chặn lan sự kiện click để chạm vào (i) không bật/tắt luật chứa nó.
 */
export function InfoTip({ text, size = 13 }: { text: string; size?: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const show = (el: Element) => setRect(el.getBoundingClientRect());
  const hide = () => setRect(null);

  const W = 240;
  const left = rect ? Math.min(Math.max(8, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 8) : 0;
  // Đủ chỗ phía trên thì hiện trên icon, không thì lật xuống dưới.
  const above = rect ? rect.top > 120 : true;

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={text}
        className="inline-grid shrink-0 cursor-help place-items-center rounded-full text-[#FFD34D]/80 transition-colors hover:text-[#FFD34D]"
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (rect) hide(); else show(e.currentTarget);
        }}
      >
        <Info size={size} />
      </span>
      {rect && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[1000] rounded-[10px] px-3 py-2 text-[12px] font-semibold leading-snug text-[#FFF3DA] shadow-2xl"
          style={{
            left,
            width: W,
            ...(above ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
            background: 'rgba(30,14,21,.97)',
            border: '1px solid rgba(255,211,77,.4)',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}

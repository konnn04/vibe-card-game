'use client';
import { useTranslations } from 'next-intl';
import { playSfx } from '@/src/lib/audio';
import { useSettings } from '@/src/lib/settings';
import { THEMES, type BgTheme } from '@/src/lib/themes';

/** Nhãn i18n của từng chủ đề — khoá dựng từ id nên thêm chủ đề chỉ là thêm 1 dòng messages. */
const labelKey = (id: BgTheme) => `theme${id[0].toUpperCase()}${id.slice(1)}` as const;

/**
 * Bộ chọn nền dùng chung cho Cài đặt và Phòng chờ.
 *
 * Ghi thẳng vào cài đặt cá nhân. Ở phòng online, nền thực sự của ván là nền của
 * CHỦ PHÒNG lúc bấm Bắt đầu (useActiveTheme) — nên trong lobby chỉ chủ phòng
 * mới thấy lựa chọn của mình có tác dụng lên cả bàn, và ta nói rõ điều đó bằng
 * dòng phụ thay vì để người chơi tự đoán.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('settings');
  const current = useSettings((s) => s.bgTheme);
  const set = useSettings((s) => s.set);

  return (
    <div className="flex flex-wrap gap-2.5">
      {THEMES.map((th) => {
        const on = current === th.id;
        return (
          <button
            key={th.id}
            onClick={() => { playSfx('click'); set('bgTheme', th.id); }}
            className={`display flex items-center gap-2.5 rounded-xl text-[#EDE0FA] ${compact ? 'px-2.5 py-1.5 text-[15px]' : 'px-3 py-2 text-[17px]'}`}
            style={{
              background: 'rgba(255,255,255,.07)',
              border: on ? '2px solid #FFD34D' : '1px solid rgba(255,255,255,.18)',
            }}
          >
            <span
              className="block rounded-lg"
              style={{ width: compact ? 34 : 48, height: compact ? 24 : 30, background: th.swatch }}
            />
            {t(labelKey(th.id))}
          </button>
        );
      })}
    </div>
  );
}

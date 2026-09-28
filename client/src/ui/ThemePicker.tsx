'use client';
import { useTranslations } from 'next-intl';
import { useSettings } from '@/src/lib/settings';
import { THEMES, type BgTheme } from '@/src/lib/themes';
import { CompactSelect, type Option } from './CustomSelect';

/** Nhãn i18n của từng chủ đề — khoá dựng từ id nên thêm chủ đề chỉ là thêm 1 dòng messages. */
const labelKey = (id: BgTheme) => `theme${id[0].toUpperCase()}${id.slice(1)}` as const;

/**
 * Bộ chọn nền dạng select dropdown dùng chung cho Cài đặt và Phòng chờ.
 *
 * Ghi thẳng vào cài đặt cá nhân. Ở phòng online, nền thực sự của ván là nền của
 * CHỦ PHÒNG lúc bấm Bắt đầu (useActiveTheme) — nên trong lobby chỉ chủ phòng
 * mới thấy lựa chọn của mình có tác dụng lên cả bàn.
 */
export function ThemePicker({
  compact = false,
  value,
  onChange,
  disabled = false,
}: {
  compact?: boolean;
  value?: BgTheme;
  onChange?: (theme: BgTheme) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('settings');
  const storedTheme = useSettings((s) => s.bgTheme);
  const set = useSettings((s) => s.set);
  const current = value ?? storedTheme;

  const options: Option<BgTheme>[] = THEMES.map((th) => ({
    value: th.id,
    label: t(labelKey(th.id)),
    icon: (
      <span
        className="block rounded-md shadow-sm border border-white/20 shrink-0"
        style={{ width: compact ? 22 : 28, height: compact ? 15 : 18, background: th.swatch }}
      />
    ),
  }));

  return (
    <CompactSelect
      value={current}
      options={options}
      compact={compact}
      disabled={disabled}
      onChange={(th) => {
        set('bgTheme', th);
        onChange?.(th);
      }}
    />
  );
}

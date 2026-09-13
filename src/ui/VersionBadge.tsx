import { BUILD } from '@/src/generated/version';

/**
 * Nhãn phiên bản + người ghi công, nổi cố định góc dưới phải toàn trang.
 * `pointer-events-none` để không bao giờ chắn thao tác của người chơi (kể cả
 * lúc đang chơi, khu vực này có nút rút bài).
 */
export function VersionBadge() {
  return (
    <div
      className="label-sm pointer-events-none fixed bottom-1 right-2 z-[9999] select-none text-[10px] leading-none opacity-40"
      title={BUILD.date || undefined}
    >
      {BUILD.label}
      {BUILD.author ? ` · ${BUILD.author}` : ''}
    </div>
  );
}

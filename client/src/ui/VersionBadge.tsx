import { BUILD } from '@/src/generated/version';

/**
 * Nhãn phiên bản + tác giả đồng bộ từ package.json cha, hiển thị góc dưới phải màn hình.
 */
export function VersionBadge() {
  const tooltip = [
    `Version: ${BUILD.version} (${BUILD.commit || 'local'})`,
    BUILD.date ? `Date: ${BUILD.date}` : '',
    BUILD.author ? `Author: ${BUILD.author} (${BUILD.authorUsername || ''})` : '',
    BUILD.authorEmail ? `Email: ${BUILD.authorEmail}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="label-sm fixed bottom-1 right-2 z-[9999] select-none text-[10px] leading-none opacity-40 hover:opacity-100 transition-opacity flex items-center gap-1"
      title={tooltip}
    >
      <span>{BUILD.label}</span>
      {BUILD.author && (
        <>
          <span>·</span>
          {BUILD.authorUrl ? (
            <a
              href={BUILD.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto hover:underline hover:text-[#FFD34D] transition-colors"
            >
              {BUILD.author}
            </a>
          ) : (
            <span>{BUILD.author}</span>
          )}
        </>
      )}
    </div>
  );
}

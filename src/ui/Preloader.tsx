'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { loadMusicManifest, preloadSfx, unlockAudio } from '@/src/lib/audio';
import { NET } from '@/src/config';

/**
 * MÀN TẢI TRƯỚC — chạy từ lúc mở trang tới khi vào được menu.
 *
 * Vì sao cần: atlas bài là ảnh 2048² và 4096², cộng thêm font và âm thanh. Nếu
 * để tải lười thì đúng lúc chia bài mới bắt đầu kéo ảnh về — bài hiện ra trống
 * trơn rồi mới có hình, âm thanh thì câm ở vài nhịp đầu. Tải hết ở đây một lần,
 * vào ván là chạy trơn.
 *
 * KHÔNG chặn vô hạn: quá LOAD_TIMEOUT_MS thì vào thẳng menu. Mạng rác không
 * đáng để người chơi ngồi nhìn thanh tiến trình mãi — ảnh thiếu sẽ tự tải tiếp
 * ở nền, chỉ là nhịp đầu hơi khựng.
 */
const ASSETS = [
  '/card-texture/u-no-std.jpg',
  '/card-texture/u-no-flip-light.jpg',
  '/card-texture/u-no-flip-dark.jpg',
];
const LOAD_TIMEOUT_MS = NET.preloadTimeoutMs;

/**
 * Nạp bằng fetch, KHÔNG bằng new Image().
 *
 * Mục đích của màn này là làm nóng CACHE HTTP để lúc vào bàn không phải chờ
 * tải. Image thì ngoài tải còn GIẢI MÃ ra bitmap: 2048² + 2×4096² ≈ 150MB
 * bitmap nằm trong bộ nhớ, rồi three.js lại tạo texture từ chính mấy ảnh đó —
 * tốn gấp đôi vô ích, đủ để làm sập renderer trên máy yếu hoặc trong iframe
 * Discord. fetch chỉ đổ byte vào cache, phần giải mã để đúng lúc tạo texture.
 */
function warmCache(src: string): Promise<void> {
  // Không force-cache: atlas bài có lúc được xuất lại, force-cache thì ai đã
  // mở game trước đó sẽ dính hình cũ vĩnh viễn. Mặc định vẫn lấy từ cache đĩa,
  // chỉ thêm một lần xác thực ETag.
  return fetch(src)
    .then(() => undefined)
    .catch(() => undefined); // thiếu 1 ảnh không được chặn cả game
}

export function Preloader({ onDone }: { onDone: () => void }) {
  const t = useTranslations('menu');
  const [done, setDone] = useState(0);

  useEffect(() => {
    // Gắn ngay từ màn loading: trình duyệt chặn phát âm trước khi người dùng
    // tương tác, chạm/bấm đầu tiên ở BẤT KỲ đâu cũng mở khoá được.
    unlockAudio();
    let dead = false;
    // Mỗi việc xong thì nhích thanh tiến trình — đếm trong callback nên không
    // phải setState đồng bộ trong thân effect.
    const tick = () => { if (!dead) setDone((n) => n + 1); };

    const jobs: Promise<unknown>[] = [
      ...ASSETS.map((src) => warmCache(src).then(tick)),
      preloadSfx().then(tick),
      loadMusicManifest().then(tick),
      (typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve()).then(tick),
    ];

    const timeout = setTimeout(() => { if (!dead) onDone(); }, LOAD_TIMEOUT_MS);
    void Promise.all(jobs).then(() => {
      if (dead) return;
      clearTimeout(timeout);
      // Nhịp nghỉ ngắn để thanh chạy hết 100% chứ không giật tắt giữa chừng.
      setTimeout(onDone, NET.preloadSettleMs);
    });

    return () => { dead = true; clearTimeout(timeout); };
  }, [onDone]);

  const pct = Math.round((done / (ASSETS.length + 3)) * 100);
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: 'var(--menu-bg)' }}>
      <div className="flex w-[min(80vw,420px)] flex-col items-center gap-6">
        <div className="display text-[13vmin] leading-none text-[#FFD34D]" style={{ textShadow: '0 6px 0 #A8460B' }}>
          {t('title')}
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,.35)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#FFD34D,#FF8A2B)' }}
          />
        </div>
        <div className="label text-[13px] tracking-[.25em] text-[#E7B98C]">{t('loading')} · {pct}%</div>
      </div>
    </div>
  );
}

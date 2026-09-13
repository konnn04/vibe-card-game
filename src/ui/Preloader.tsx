'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { loadMusicManifest, preloadSfx, unlockAudio } from '@/src/lib/audio';
import { NET } from '@/src/config';

/**
 * MÀN TẢI TRƯỚC — chạy từ lúc mở trang tới khi vào được menu.
 *
 * NGUYÊN TẮC: mọi thứ cần cho một ván đấu phải nằm sẵn trong máy TRƯỚC khi vào
 * menu — ảnh bài và âm thanh. Để tải lười thì đúng lúc chia bài mới bắt đầu kéo
 * ảnh về: bài hiện ra trống trơn rồi mới có hình, vài nhịp đầu thì câm.
 *
 * NGOẠI LỆ DUY NHẤT LÀ NHẠC NỀN. Thư mục nhạc có thể nặng hàng chục MB; bắt
 * người chơi tải hết mới được vào menu là vô lý. Ở đây chỉ đọc `manifest.json`
 * (vài trăm byte) để biết có những bài nào — file nhạc tự phát kiểu stream.
 */
const ASSETS = [
  '/card-texture/u-no-std.jpg',
  '/card-texture/u-no-flip-light.jpg',
  '/card-texture/u-no-flip-dark.jpg',
];
/** Hai họ chữ dùng khắp game — phải có mặt trước khi vẽ khung hình đầu tiên. */
const FONTS = ['700 16px "Baloo 2"', '600 16px "Barlow Semi Condensed"'];

const LOAD_TIMEOUT_MS = NET.preloadTimeoutMs;
const RETRIES = 3;
/** Ảnh chiếm gần hết thời gian tải -> thanh tiến trình đo theo byte ảnh. */
const IMAGE_SHARE = 0.85;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tải TRỌN VẸN một file vào cache HTTP, có thử lại.
 *
 * Hai chỗ bản cũ làm chưa tới:
 *
 *  1. Nó gọi `fetch(src)` rồi vứt response đi mà KHÔNG ĐỌC BODY. Promise của
 *     fetch resolve ngay khi có HEADER, nên "tải xong" được báo lúc mới nhận
 *     vài trăm byte đầu; phần thân ảnh 4096² vẫn đang về, và trình duyệt được
 *     phép huỷ hẳn một body không ai đọc. Nghĩa là thanh chạy tới 100% trong
 *     khi atlas chưa chắc nằm trong máy — đúng thứ màn này sinh ra để tránh.
 *     Đọc hết body mới thật sự là tải xong.
 *
 *  2. Hỏng thì nó nuốt lỗi rồi vẫn tính là xong. Mạng chập một nhịp là vào ván
 *     với bộ bài không có hình. Giờ thử lại vài lần rồi mới chịu thua.
 *
 * Vẫn KHÔNG dùng `new Image()`: ngoài tải, Image còn GIẢI MÃ ra bitmap —
 * 2048² + 2×4096² ≈ 150MB nằm trong RAM, rồi three.js lại giải mã lần nữa lúc
 * tạo texture. Thừa gấp đôi, đủ để sập renderer trong iframe Discord.
 */
async function fetchFully(src: string, onBytes: (n: number) => void): Promise<boolean> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      // Không force-cache: atlas bài có lúc được xuất lại, force-cache thì ai đã
      // mở game trước đó sẽ dính hình cũ vĩnh viễn.
      const res = await fetch(src);
      if (!res.ok) throw new Error(`http-${res.status}`);
      // Đọc theo dòng để thanh nhích theo BYTE thật. Không có ReadableStream thì
      // đọc một cục — vẫn đúng, chỉ kém mượt.
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          onBytes(value?.byteLength ?? 0);
        }
      } else {
        const buf = await res.arrayBuffer();
        onBytes(buf.byteLength);
      }
      return true;
    } catch {
      if (attempt < RETRIES - 1) await sleep(400 * (attempt + 1));
    }
  }
  return false;
}

/** Kích thước file, hỏi trước để thanh tiến trình có mẫu số thật. */
async function sizeOf(src: string): Promise<number> {
  try {
    const res = await fetch(src, { method: 'HEAD' });
    const len = Number(res.headers.get('content-length') ?? 0);
    return Number.isFinite(len) && len > 0 ? len : 0;
  } catch {
    return 0;
  }
}

export function Preloader({ onDone }: { onDone: () => void }) {
  const t = useTranslations('menu');
  const [pct, setPct] = useState(0);
  const [failed, setFailed] = useState(0);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    // Gắn ngay từ màn loading: trình duyệt chặn phát âm trước khi người dùng
    // tương tác, chạm/bấm đầu tiên ở BẤT KỲ đâu cũng mở khoá được.
    unlockAudio();
    let dead = false;

    // Trần an toàn: mạng rác thì vẫn vào được menu, ảnh thiếu tải tiếp ở nền.
    const timeout = setTimeout(() => { if (!dead) finish(); }, LOAD_TIMEOUT_MS);

    void (async () => {
      const sizes = await Promise.all(ASSETS.map(sizeOf));
      if (dead) return;
      // HEAD không trả Content-Length (proxy của Discord hay như vậy) -> đoán
      // theo số file để thanh vẫn chạy đều thay vì đứng im rồi nhảy cóc.
      const total = sizes.reduce((a, b) => a + b, 0) || ASSETS.length;
      let got = 0;
      const bump = (n: number) => {
        got += n || total / ASSETS.length / 40;
        if (!dead) setPct(Math.min(IMAGE_SHARE, got / total) * 100);
      };

      const results = await Promise.all(ASSETS.map((src) => fetchFully(src, bump)));
      if (dead) return;
      setFailed(results.filter((ok) => !ok).length);
      setPct(IMAGE_SHARE * 100);

      await Promise.all([
        preloadSfx(),
        loadMusicManifest(),
        // `document.fonts.ready` chỉ đợi những chữ ĐÃ được yêu cầu vẽ — ở màn
        // loading gần như chưa có gì, nên nó resolve ngay và font vẫn chưa về.
        // Phải gọi đích danh từng họ chữ.
        ...(typeof document !== 'undefined' && document.fonts
          ? FONTS.map((f) => document.fonts.load(f).catch(() => undefined))
          : []),
      ]);
      if (dead) return;

      setPct(100);
      clearTimeout(timeout);
      // Nhịp nghỉ ngắn để thanh chạy hết 100% chứ không giật tắt giữa chừng.
      setTimeout(() => { if (!dead) finish(); }, NET.preloadSettleMs);
    })();

    return () => { dead = true; clearTimeout(timeout); };
  }, [finish]);

  const shown = Math.round(pct);
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: 'var(--menu-bg)' }}>
      <div className="flex w-[min(80vw,420px)] flex-col items-center gap-6">
        <div className="display text-[13vmin] leading-none text-[#FFD34D]" style={{ textShadow: '0 6px 0 #A8460B' }}>
          {t('title')}
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,.35)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${shown}%`, background: 'linear-gradient(90deg,#FFD34D,#FF8A2B)' }}
          />
        </div>
        <div className="label text-[13px] tracking-[.25em] text-[#E7B98C]">{t('loading')} · {shown}%</div>
        {/* Tải hụt thì NÓI RA. Im lặng rồi vào ván với bộ bài không hình là kiểu
            lỗi người chơi tưởng game hỏng hẳn. */}
        {failed > 0 && (
          <div className="label text-[11px] tracking-[.12em] text-[#FF9E7A]">{t('loadWarn', { n: failed })}</div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { isDiscordActivity } from '@/src/lib/discord';
import { playSfx } from '@/src/lib/audio';

interface DocElementWithFs extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface DocWithFs extends Document {
  webkitFullscreenElement?: Element;
  mozFullScreenElement?: Element;
  msFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

export async function requestAppFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const doc = document as DocWithFs;
  const docEl = document.documentElement as DocElementWithFs;

  try {
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
        return true;
      }
      if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
        return true;
      }
      if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
        return true;
      }
      if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
        return true;
      }
    }
  } catch (err) {
    console.warn('[MobileGuard] requestFullscreen failed:', err);
  }
  return false;
}

export async function exitAppFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  const doc = document as DocWithFs;
  try {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    }
  } catch {}
}

export async function lockLandscapeOrientation(): Promise<void> {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return;
  try {
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orient?.lock) {
      await orient.lock('landscape');
    }
  } catch {
    // Không hỗ trợ hoặc trình duyệt yêu cầu tương tác người dùng
  }
}

function checkIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  // Bỏ qua nếu chạy trong iframe Discord Activity
  if (isDiscordActivity()) return false;

  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTouch = navigator.maxTouchPoints > 0;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 768;

  return isMobileUa || (isTouch && (isCoarse || isSmallScreen));
}

function checkIsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as DocWithFs;
  return Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement,
  );
}

function checkSupportsFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const docEl = document.documentElement as DocElementWithFs;
  return Boolean(
    docEl.requestFullscreen ||
    docEl.webkitRequestFullscreen ||
    docEl.mozRequestFullScreen ||
    docEl.msRequestFullscreen,
  );
}

export function MobileGuard() {
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dismissedFsPrompt, setDismissedFsPrompt] = useState(false);
  const [supportsFs, setSupportsFs] = useState(true);

  const updateState = useCallback(() => {
    const mobile = checkIsMobile();
    setIsMobile(mobile);
    const portrait = window.innerHeight > window.innerWidth;
    setIsPortrait(portrait);
    setIsFullscreen(checkIsFullscreen());
    setSupportsFs(checkSupportsFullscreen());
  }, []);

  useEffect(() => {
    updateState();

    const handleResize = () => updateState();
    const handleOrientation = () => {
      updateState();
      // Khi xoay ngang -> tự động cố gắng bật fullscreen
      if (window.innerWidth >= window.innerHeight && checkIsMobile()) {
        void requestAppFullscreen().catch(() => {});
        void lockLandscapeOrientation().catch(() => {});
      }
    };
    const handleFsChange = () => {
      setIsFullscreen(checkIsFullscreen());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [updateState]);

  // Xoay ngang & bật toàn màn hình
  const handleRotateAndFullscreen = async () => {
    playSfx('click');
    await requestAppFullscreen();
    await lockLandscapeOrientation();
    setDismissedFsPrompt(false);
  };

  const handleEnterFullscreen = async () => {
    playSfx('click');
    const ok = await requestAppFullscreen();
    if (!ok) {
      setDismissedFsPrompt(true);
    }
  };

  if (!isMobile) return null;

  // 1. Màn hình dọc: LỚP PHỦ BÁO XOAY NGANG
  if (isPortrait) {
    return (
      <div
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center p-6 text-center select-none"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 40%, #2A101C 0%, #15060E 60%, #080206 100%)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="relative mb-6">
          {/* Vòng sáng hào quang neon */}
          <div
            className="absolute inset-0 rounded-full blur-2xl opacity-40 animate-pulse"
            style={{ background: 'radial-gradient(circle, #FFD34D 0%, #FF8A2B 60%, transparent 80%)' }}
          />

          {/* Điện thoại hoạt họa xoay từ dọc sang ngang */}
          <div
            className="relative flex items-center justify-center w-24 h-24 rounded-3xl border-2 border-white/20 bg-black/40 shadow-2xl"
            style={{
              animation: 'phoneRotateAnim 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            }}
          >
            <div className="w-10 h-16 rounded-xl border-2 border-[#FFD34D] bg-[#FFD34D]/10 relative flex flex-col items-center justify-between p-1.5 shadow-[0_0_15px_rgba(255,211,77,0.3)]">
              <div className="w-3 h-0.5 rounded-full bg-[#FFD34D]/60" />
              <div className="display text-[#FFD34D] text-[15px] font-extrabold">Ú</div>
              <div className="w-2 h-2 rounded-full border border-[#FFD34D]/60" />
            </div>
          </div>
        </div>

        <h2 className="display text-[26px] text-[#FFF3DA] mb-2 leading-tight" style={{ textShadow: '0 3px 0 #6B3F0A' }}>
          Vui lòng xoay ngang thiết bị
        </h2>
        <p className="text-[14px] text-[#FFE0B3]/80 max-w-[280px] mb-6 leading-relaxed">
          Bàn chơi 3D Ú NỒ! được thiết kế tối ưu nhất ở chế độ nằm ngang để quan sát trọn vẹn ván bài.
        </p>

        <button
          type="button"
          onClick={handleRotateAndFullscreen}
          className="btn btn--gold flex items-center gap-2 !px-6 !py-3 !text-[16px] shadow-2xl active:scale-95 transition-transform"
        >
          <RotateCcw size={18} className="animate-spin" style={{ animationDuration: '6s' }} />
          <span>Xoay ngang & Toàn màn hình</span>
        </button>
      </div>
    );
  }

  // 2. Màn hình ngang nhưng chưa mở Fullscreen và trình duyệt hỗ trợ Fullscreen
  if (!isFullscreen && supportsFs && !dismissedFsPrompt) {
    return (
      <div
        className="fixed inset-0 z-[99990] flex flex-col items-center justify-center p-4 text-center select-none"
        style={{
          background: 'rgba(10, 4, 12, 0.82)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          className="max-w-[420px] w-full rounded-2xl p-5 border border-amber-500/40 shadow-2xl text-center"
          style={{ background: 'linear-gradient(145deg, rgba(38,18,30,.96), rgba(20,8,16,.96))' }}
        >
          <div className="text-[34px] mb-1">📱 ➔ 🖥️</div>
          <h3 className="display text-[22px] text-[#FFF3DA] mb-1.5" style={{ textShadow: '0 2px 0 #6B3F0A' }}>
            Mở toàn màn hình để chơi
          </h3>
          <p className="text-[13px] text-[#FFE0B3]/80 mb-4 leading-relaxed">
            Chế độ toàn màn hình giúp ẩn thanh địa chỉ trình duyệt, mở rộng tối đa tầm nhìn cho ván bài 3D.
          </p>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setDismissedFsPrompt(true)}
              className="btn flex-1 !py-2 !text-[14px]"
            >
              Để sau
            </button>
            <button
              type="button"
              onClick={handleEnterFullscreen}
              className="btn btn--gold flex-1 !py-2 !text-[14px] flex items-center justify-center gap-1.5"
            >
              <Maximize2 size={16} />
              <span>Toàn màn hình</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/** Nút chuyển đổi Fullscreen dành riêng cho mobile ở góc trên */
export function FullscreenToggle({ className = '' }: { className?: string }) {
  const [isFs, setIsFs] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (isDiscordActivity()) return;
    setSupported(checkSupportsFullscreen());
    setIsFs(checkIsFullscreen());

    const handleFs = () => setIsFs(checkIsFullscreen());
    document.addEventListener('fullscreenchange', handleFs);
    document.addEventListener('webkitfullscreenchange', handleFs);
    return () => {
      document.removeEventListener('fullscreenchange', handleFs);
      document.removeEventListener('webkitfullscreenchange', handleFs);
    };
  }, []);

  if (!supported || isDiscordActivity()) return null;

  return (
    <button
      type="button"
      onClick={() => {
        playSfx('click');
        if (isFs) void exitAppFullscreen();
        else void requestAppFullscreen();
      }}
      className={`grid place-items-center rounded-full text-[#FFD79A] transition-all hover:scale-105 active:scale-95 ${className}`}
      style={{
        width: 36,
        height: 36,
        background: 'rgba(24,15,18,.8)',
        border: '1px solid rgba(255,196,128,.3)',
      }}
      title={isFs ? 'Thu nhỏ / Exit Fullscreen' : 'Toàn màn hình / Fullscreen'}
      aria-label="Toggle Fullscreen"
    >
      {isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}

'use client';
import { useTranslations } from 'next-intl';
import { WifiOff, RefreshCw, LogOut, EyeOff, AlertTriangle } from 'lucide-react';
import { manualReconnect, useNetworkStore } from '@/src/state/net';
import { useRoom } from '@/src/state/room';
import { playSfx } from '@/src/lib/audio';

export function DisconnectModal({ onLeave }: { onLeave: () => void }) {
  const t = useTranslations('network');
  const mode = useRoom((s) => s.mode);
  const code = useRoom((s) => s.code);

  const connected = useNetworkStore((s) => s.connected);
  const isOffline = useNetworkStore((s) => s.isOffline);
  const isReconnecting = useNetworkStore((s) => s.isReconnecting);
  const attempts = useNetworkStore((s) => s.reconnectAttempts);
  const showModal = useNetworkStore((s) => s.showDisconnectModal);
  const dismissed = useNetworkStore((s) => s.dismissed);
  const dismissModal = useNetworkStore((s) => s.dismissModal);
  const openModal = useNetworkStore((s) => s.openModal);

  // Chỉ hiện cảnh báo khi đang ở trong phòng online có mã code thật
  if (mode !== 'online' || !code) return null;

  // Nếu mạng bình thường và đã kết nối
  if (connected && !isOffline) return null;

  const handleReconnect = () => {
    playSfx('click');
    manualReconnect();
  };

  const handleLeave = () => {
    playSfx('click');
    dismissModal();
    onLeave();
  };

  const handleDismiss = () => {
    playSfx('click');
    dismissModal();
  };

  // Trường hợp người dùng tạm ẩn modal: hiện thanh thông báo nhỏ ở mép trên màn hình
  if (dismissed || !showModal) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-red-950/90 border border-red-500/40 px-4 py-2 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
        <WifiOff size={16} className="text-red-400 animate-pulse" />
        <span className="text-[13px] font-medium text-red-100">
          {t('barNotice', { attempts: Math.max(1, attempts) })}
        </span>
        <button
          type="button"
          onClick={handleReconnect}
          className="flex items-center gap-1.5 rounded-full bg-red-500/30 hover:bg-red-500/50 border border-red-400/50 px-2.5 py-0.5 text-[12px] font-semibold text-white transition-all"
        >
          <RefreshCw size={12} className={isReconnecting ? 'animate-spin' : ''} />
          {t('reconnectBtn')}
        </button>
        <button
          type="button"
          onClick={openModal}
          title="Chi tiết"
          className="text-[12px] text-white/70 hover:text-white underline ml-1"
        >
          Chi tiết
        </button>
      </div>
    );
  }

  // Modal chính cảnh báo mất mạng
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="panel relative w-full max-w-md rounded-2xl p-6 text-center shadow-2xl border border-red-500/40 overflow-hidden"
        style={{
          background: 'linear-gradient(150deg, rgba(38,10,18,.96), rgba(18,4,9,.98))',
          boxShadow: '0 20px 50px rgba(226,59,46,.25), 0 0 0 1px rgba(255,255,255,.08)',
        }}
      >
        {/* Glow hiệu ứng nền */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-red-600/20 blur-3xl" />

        {/* Icon radar cảnh báo mất mạng */}
        <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-red-500/15 border border-red-500/30">
          <span className="absolute inset-0 rounded-full bg-red-500/10 animate-ping opacity-60" />
          {isOffline ? (
            <AlertTriangle size={32} className="text-amber-400 relative z-10" />
          ) : (
            <WifiOff size={32} className="text-red-400 relative z-10" />
          )}
        </div>

        <h3 className="display text-[22px] font-bold text-[#FFF3DA] mb-1.5">
          {isOffline ? t('offlineTitle') : t('disconnectedTitle')}
        </h3>

        <p className="text-[14px] text-[#FFE0B3]/80 leading-relaxed mb-4">
          {isOffline ? t('offlineDesc') : t('disconnectedDesc')}
        </p>

        {/* Trạng thái kết nối lại */}
        <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-black/30 border border-white/10 px-3.5 py-2.5 text-[13px] text-[#FFE5C4]">
          <RefreshCw size={15} className={`text-amber-400 ${isReconnecting ? 'animate-spin' : ''}`} />
          <span>{t('reconnecting', { attempts: Math.max(1, attempts) })}</span>
        </div>

        {/* Nút bấm hành động */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            className="btn btn--gold w-full !py-3 flex items-center justify-center gap-2 text-[15px] font-bold"
            onClick={handleReconnect}
          >
            <RefreshCw size={16} className={isReconnecting ? 'animate-spin' : ''} />
            {t('reconnectBtn')}
          </button>

          <div className="flex gap-2.5 mt-1">
            <button
              type="button"
              className="btn btn--ghost flex-1 !py-2 text-[13px] flex items-center justify-center gap-1.5 text-[#FFE0B3]/70 hover:text-white"
              onClick={handleDismiss}
            >
              <EyeOff size={14} />
              {t('dismissBtn')}
            </button>
            <button
              type="button"
              className="btn flex-1 !py-2 text-[13px] flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-200 hover:text-white"
              onClick={handleLeave}
            >
              <LogOut size={14} />
              {t('leaveBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

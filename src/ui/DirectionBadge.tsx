'use client';
import { RotateCcw, RotateCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useMatch } from '@/src/state/match';
import { UI } from '@/src/config';

/**
 * Chỉ báo chiều đánh (Thuận/Nghịch) — icon 2D thật (lucide) thay cho ring mũi
 * tên vẽ tay trên bàn 3D: overlay 2D không bị méo theo phối cảnh camera, và
 * "đậm" ở đây chỉ là 1 icon nhỏ mờ chứ không phải cả 1 vòng tối phủ quanh ghế.
 * Quay chậm liên tục để có cảm giác sống động; khi có ai đánh Reverse thì
 * chớp sáng + đổi hướng quay tức thì.
 */
export function DirectionBadge({ direction }: { direction: 1 | -1 }) {
  const fx = useMatch((s) => s.fx);
  const [flash, setFlash] = useState(false);
  const lastFxId = useRef<number | null>(null);

  useEffect(() => {
    const last = fx[fx.length - 1];
    if (last && last.kind === 'reverse' && last.id !== lastFxId.current) {
      lastFxId.current = last.id;
      setFlash(true);
      const id = setTimeout(() => setFlash(false), UI.directionFlashMs);
      return () => clearTimeout(id);
    }
  }, [fx]);

  // Ghế xếp quanh bàn theo seatPos(j) = (sin(a)*r, 0, cos(a)*r) với a=j*2π/n:
  // j tăng dần (0=mình ở dưới -> 1 bên phải -> 2 phía xa -> 3 bên trái) vẽ ra
  // một vòng NGƯỢC chiều kim đồng hồ khi nhìn từ camera phía trên xuống. Engine
  // direction=1 nghĩa là lượt đi theo chiều tăng dần index -> đúng bằng chiều
  // ghế tăng dần đó -> direction=1 = NGƯỢC chiều kim đồng hồ trên màn hình.
  // (Bản trước gán ngược — RotateCw cho direction=1 — đúng lỗi người dùng báo.)
  const Icon = direction === 1 ? RotateCcw : RotateCw;

  return (
    <div
      className="relative grid h-8 w-8 place-items-center rounded-full border transition-colors duration-300"
      style={{
        background: flash ? 'rgba(255,211,77,.28)' : 'rgba(12,4,8,.38)',
        borderColor: flash ? '#FFD34D' : 'rgba(255,215,140,.28)',
      }}
      title={direction === 1 ? 'Ngược chiều kim đồng hồ' : 'Thuận chiều kim đồng hồ'}
    >
      <AnimatePresence>
        {flash && (
          <motion.span
            key="ring"
            className="pointer-events-none absolute h-8 w-8 rounded-full border-2"
            style={{ borderColor: '#FFD34D' }}
            initial={{ scale: 1, opacity: 0.9 }}
            animate={{ scale: 1.9, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
      {/* Badge LẬT NGƯỢC nửa vòng mỗi lần đổi chiều, khớp với vòng mũi tên trên
          bàn cũng đang lật (DirectionRing). Đổi icon không thôi thì mắt chỉ thấy
          "hình khác đi", không thấy "vừa đảo chiều". */}
      <motion.span
        className="grid place-items-center"
        animate={{ rotateY: direction === 1 ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <Icon
          size={16}
          strokeWidth={2.4}
          color={flash ? '#FFF3DA' : '#FFD34D'}
          style={{
            opacity: flash ? 1 : 0.75,
            // Toàn bộ dạng dài — không trộn shorthand `animation` với
            // `animationDirection` (React cảnh báo dễ gây lỗi style khi re-render).
            animationName: 'spinSlow',
            animationDuration: `${flash ? 1 : 5}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationDirection: direction === 1 ? 'reverse' : 'normal',
          }}
        />
      </motion.span>
    </div>
  );
}

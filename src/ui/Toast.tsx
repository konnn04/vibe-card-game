'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useMatch } from '@/src/state/match';
import { UI } from '@/src/config';

/**
 * Một chỗ DUY NHẤT hiện thông báo lỗi ngắn, cho MỌI màn hình.
 *
 * Trước đây toast nằm trong GameHud, mà GameHud chỉ tồn tại khi đang ở bàn chơi
 * — nên mọi lỗi ở phòng chờ (thêm bot khi ván đã chạy, không phải chủ phòng, vé
 * phòng hỏng) được set vào store rồi biến mất không ai thấy, chỉ còn lại một
 * dòng 400 trơ trọi trong console.
 */
export function Toast() {
  const toast = useMatch((s) => s.toast);
  const clearToast = useMatch((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clearToast, UI.toastMs);
    return () => clearTimeout(id);
  }, [toast, clearToast]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="label pointer-events-none fixed bottom-[14vh] left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2 text-[13px]"
          style={{ background: 'rgba(10,4,8,.85)', border: '1px solid rgba(255,120,90,.5)', color: '#FFD7C2' }}
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

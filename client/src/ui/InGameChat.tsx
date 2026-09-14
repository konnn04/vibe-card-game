'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, MessageSquare } from 'lucide-react';
import { CHAT } from '@/src/config';
import { useChat } from '@/src/state/chat';
import { playSfx } from '@/src/lib/audio';

/** Bong bóng chat nổi hiển thị bên cạnh avatar người chơi */
export function ChatBubble({ message, side = 'top' }: { message: string; side?: 'top' | 'right' | 'left' | 'bottom' }) {
  return (
    <motion.div
      initial={{ scale: 0.75, opacity: 0, y: side === 'top' ? 8 : -8 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
      className="pointer-events-none z-30 max-w-[200px] select-none rounded-2xl px-3 py-1.5 text-xs font-semibold leading-snug shadow-xl break-words"
      style={{
        background: 'rgba(20, 10, 16, 0.94)',
        backdropFilter: 'blur(8px)',
        border: '1.5px solid rgba(255, 211, 77, 0.7)',
        color: '#FFF8E7',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 0 14px rgba(255,211,77,0.3)',
      }}
    >
      <span>{message}</span>
    </motion.div>
  );
}

/** Hook lắng nghe phím Enter để bật chat khi đang chơi */
export function useChatKeyboard(enabled = true) {
  const inputOpen = useChat((s) => s.inputOpen);
  const setInputOpen = useChat((s) => s.setInputOpen);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const activeTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        setInputOpen(true);
      } else if (e.key === 'Escape') {
        if (inputOpen) {
          e.preventDefault();
          setInputOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, inputOpen, setInputOpen]);
}

/** Thanh nhập tin nhắn nổi dưới màn hình */
export function ChatInputBar() {
  const inputOpen = useChat((s) => s.inputOpen);
  const setInputOpen = useChat((s) => s.setInputOpen);
  const sendMessage = useChat((s) => s.sendMessage);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [inputOpen]);

  const close = () => {
    setText('');
    setInputOpen(false);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed) {
      sendMessage(trimmed);
      playSfx('click');
    }
    close();
  };

  return (
    <AnimatePresence>
      {inputOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl p-1.5 shadow-2xl"
          style={{
            background: 'rgba(15, 8, 12, 0.92)',
            backdropFilter: 'blur(14px)',
            border: '1.5px solid rgba(255, 211, 77, 0.65)',
            boxShadow: '0 14px 40px rgba(0,0,0,0.75), 0 0 24px rgba(255,211,77,0.25)',
          }}
        >
          <div className="pl-2 text-amber-300">
            <MessageSquare size={16} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={text}
            maxLength={CHAT.maxLength}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            placeholder="Nhập tin nhắn... (Enter gửi, Esc hủy)"
            className="w-[260px] sm:w-[340px] bg-transparent px-2 py-1.5 text-sm text-[#FFF3DA] placeholder-amber-200/40 outline-none"
          />
          <button
            type="button"
            onClick={submit}
            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow"
            style={{
              background: 'linear-gradient(135deg, #FFD34D, #FF8A2B)',
              color: '#2A1508',
            }}
          >
            <Send size={13} />
            <span>Gửi</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Nút nhỏ kích hoạt chat cho chuột/cảm ứng */
export function ChatTriggerButton() {
  const setInputOpen = useChat((s) => s.setInputOpen);
  return (
    <button
      type="button"
      className="grid h-11 w-11 place-items-center rounded-full border text-[18px] transition-transform hover:scale-110 cursor-pointer pointer-events-auto"
      style={{
        background: 'rgba(12,4,8,.6)',
        borderColor: 'rgba(255,215,140,.45)',
        color: '#FFE0B3',
      }}
      onClick={() => { playSfx('click'); setInputOpen(true); }}
      title="Trò chuyện / Chat (Phím Enter)"
      aria-label="Chat"
    >
      <MessageSquare size={18} />
    </button>
  );
}

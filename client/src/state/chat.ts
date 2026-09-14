import { create } from 'zustand';
import { CHAT } from '@/src/config';
import { useRoom } from './room';
import { sendChatSocket } from './net';

export interface ChatEntry {
  message: string;
  timestamp: number;
}

interface ChatStore {
  messages: Record<string, ChatEntry>;
  inputOpen: boolean;
  setInputOpen: (open: boolean) => void;
  toggleInput: () => void;
  addMessage: (senderId: string, message: string) => void;
  sendMessage: (text: string) => void;
  clearExpired: () => void;
}

export const useChat = create<ChatStore>((set, get) => ({
  messages: {},
  inputOpen: false,

  setInputOpen: (open) => set({ inputOpen: open }),

  toggleInput: () => set((s) => ({ inputOpen: !s.inputOpen })),

  addMessage: (senderId, rawMessage) => {
    const message = rawMessage.trim().slice(0, CHAT.maxLength);
    if (!message) return;

    set((state) => ({
      messages: {
        ...state.messages,
        [senderId]: {
          message,
          timestamp: Date.now(),
        },
      },
    }));

    // Tự động xóa sau CHAT.durationMs (10s)
    setTimeout(() => {
      get().clearExpired();
    }, CHAT.durationMs + 200);
  },

  sendMessage: (text) => {
    const message = text.trim().slice(0, CHAT.maxLength);
    if (!message) return;

    const { mode, code, meId } = useRoom.getState();

    // Hiển thị ngay trên máy mình
    get().addMessage(meId, message);

    // Gửi lên server nếu đang trong phòng online
    if (mode === 'online' && code) {
      sendChatSocket(code, message);
    }
  },

  clearExpired: () => {
    const now = Date.now();
    const current = get().messages;
    let changed = false;
    const next: Record<string, ChatEntry> = {};

    for (const [id, entry] of Object.entries(current)) {
      if (now - entry.timestamp < CHAT.durationMs) {
        next[id] = entry;
      } else {
        changed = true;
      }
    }

    if (changed) {
      set({ messages: next });
    }
  },
}));

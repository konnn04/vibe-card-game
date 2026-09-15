'use client';
import '@/src/lib/patchDiscord';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { I18nProvider } from '@/src/i18n';
import { useSettings } from '@/src/lib/settings';
import { useMounted } from '@/src/lib/useMounted';
import { randomName } from '@/src/lib/names';
import { playSfx, setMusicPlaying } from '@/src/lib/audio';
import { discordRoomCode, isDiscordActivity, getDiscordUser } from '@/src/lib/discord';
import { clearRoomInUrl, roomCodeFromUrl, setRoomInUrl } from '@/src/lib/roomLink';
import { sharedAvatarDataUrl } from '@/src/lib/idb';
import { useRoom, type Seat } from '@/src/state/room';
import { useMatch } from '@/src/state/match';
import { useChat } from '@/src/state/chat';
import {
  api, connect, disconnect, loadToken, playerId, realtimeEnabled, saveToken, startPolling,
  type NetSeat, type Snapshot,
} from '@/src/state/net';
import { MainMenu } from '@/src/ui/MainMenu';
import { Preloader } from '@/src/ui/Preloader';
import { Lobby } from '@/src/ui/Lobby';
import { GameHud } from '@/src/ui/GameHud';
import { Fx, RoundOverlay } from '@/src/ui/Fx';
import { DealIntro } from '@/src/ui/DealIntro';
import { Profile } from '@/src/ui/Profile';
import { SettingsPanel } from '@/src/ui/Settings';
import { HowToPlay } from '@/src/ui/HowToPlay';
import { Toast } from '@/src/ui/Toast';
import { SpectatorRail } from '@/src/ui/SpectatorRail';
import { DisconnectModal } from '@/src/ui/DisconnectModal';
import { ChatInputBar, useChatKeyboard } from '@/src/ui/InGameChat';

// WebGL chỉ khởi tạo khi vào bàn -> menu không tốn GPU context
const GameCanvas = dynamic(() => import('@/src/three/Scene').then((m) => m.GameCanvas), { ssr: false });

type Screen = 'menu' | 'lobby' | 'intro' | 'game';

function Shell() {
  const set = useSettings((s) => s.set);
  // Chặn menu cho tới khi ảnh bài + âm thanh + font đã nằm trong cache.
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>('menu');
  // Bản sao của `screen` đọc được từ trong callback mạng: các handler dưới đây
  // được nhớ bằng useCallback nên không bao giờ thấy giá trị state mới nhất.
  const screenRef = useRef<Screen>('menu');
  const [modal, setModal] = useState<'profile' | 'settings' | 'howto' | null>(null);
  const [joinPromptCode, setJoinPromptCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopPoll = useRef<(() => void) | null>(null);

  useChatKeyboard(screen === 'game' || screen === 'lobby');

  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    if (isDiscordActivity()) {
      void getDiscordUser().then((user) => {
        if (user) {
          const displayName = user.globalName || user.username;
          if (displayName) set('username', displayName);
          if (user.avatarUrl) set('avatarUrl', user.avatarUrl);
        } else if (!useSettings.getState().username) {
          set('username', randomName());
        }
      });
    } else if (!useSettings.getState().username) {
      set('username', randomName());
    }
  }, [set]);

  /** Danh tính gửi lên server: id bền trong localStorage + tên/avatar hiện tại. */
  const netMe = useCallback((): NetSeat => ({
    id: playerId(),
    name: useSettings.getState().username || randomName(),
    isBot: false,
    avatarPreset: useSettings.getState().avatarPreset,
    avatarUrl: useSettings.getState().avatarUrl ?? null,
  }), []);

  const localMe = useCallback((): Seat => ({
    id: 'me',
    name: useSettings.getState().username || randomName(),
    isBot: false,
    avatarPreset: useSettings.getState().avatarPreset,
    avatarUrl: useSettings.getState().avatarUrl ?? null,
    consecutiveRounds: 0,
  }), []);

  /**
   * Vào ván ONLINE: server đã chia bài xong trước khi client kịp hiện màn đếm
   * ngược, nên phải GIỮ hàng đợi lại rồi mới nạp state — nếu không, tiếng chia
   * bài nổ ra ngay khi số đếm còn ở 5. handleIntroDone() sẽ thả ra.
   */
  const holdIfEnteringMatch = useCallback((status: string) => {
    if (status === 'playing' && screenRef.current === 'lobby') useMatch.getState().holdQueue();
  }, []);

  /** Nhận snapshot (lúc vào phòng hoặc sau khi mất kết nối) và đồng bộ store. */
  const applySnapshot = useCallback((snap: Snapshot) => {
    holdIfEnteringMatch(snap.room.status);
    useRoom.getState().attachOnline(snap.room);
    useMatch.getState().attachOnline(snap.room.code, snap.room.hostId);
    useMatch.getState().applyRemote({ room: snap.room, game: snap.game, events: [] });
    if (snap.avatars) useRoom.getState().applyAvatars(snap.avatars);
    if (snap.hand.length) useMatch.getState().applyHand(snap.hand);
    setScreen((prev) => {
      if (snap.room.status === 'playing') {
        if (prev !== 'game') setMusicPlaying(true);
        if (prev === 'lobby') return 'intro';
        return 'game';
      }
      return 'lobby';
    });
  }, [holdIfEnteringMatch]);

  /** Đồng bộ avatar (ảnh tự tải base64 hoặc link Discord) vào phòng */
  const sendAvatar = useCallback(async (code: string, token: string) => {
    try {
      const webpData = await sharedAvatarDataUrl();
      const discordUrl = useSettings.getState().avatarUrl;
      const toSend = webpData || discordUrl || null;
      if (toSend) {
        await api.avatar(code, playerId(), token, toSend);
      }
    } catch { }
  }, []);

  /** Nối realtime cho 1 phòng; không có Firebase cấu hình thì poll snapshot. */
  const listen = useCallback((code: string) => {
    stopPoll.current?.();
    stopPoll.current = null;

    const ok = connect(code, {
      onRoom: (update) => {
        holdIfEnteringMatch(update.room.status);
        useRoom.getState().applyRemote(update.room);
        useMatch.getState().applyRemote(update);
        setScreen((prev) => {
          if (update.room.status === 'playing') {
            if (prev !== 'game') setMusicPlaying(true);
            if (prev === 'lobby') return 'intro';
            return 'game';
          }
          return prev === 'game' ? 'lobby' : prev;
        });
      },
      onHand: (cards) => useMatch.getState().applyHand(cards),
      onPresence: (map) => useRoom.getState().applyPresence(map),
      onAvatars: (map) => useRoom.getState().applyAvatars(map),
      onChat: (chat) => useChat.getState().addMessage(chat.senderId || chat.playerId, chat.message),
      onResync: () => {
        void api.snapshot(code, playerId(), loadToken(code)).then(applySnapshot).catch(() => { });
        void sendAvatar(code, loadToken(code));
      },
    });

    if (!ok) stopPoll.current = startPolling(code, applySnapshot);
  }, [applySnapshot, holdIfEnteringMatch, sendAvatar]);

  const enterOnline = useCallback(async (fn: () => Promise<{ code: string; token: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const { code, token } = await fn();
      saveToken(code, token);
      const snap = await api.snapshot(code, playerId(), token);
      applySnapshot(snap);
      listen(code);
      // Gửi avatar (base64 WebP tự tải hoặc URL Discord) vào phòng cho cả bàn thấy
      void sendAvatar(code, token);
      // Vào phòng xong mới ghi mã lên URL: link chỉ trỏ tới phòng có thật.
      setRoomInUrl(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network-error');
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, listen, sendAvatar]);

  /**
   * MỞ LINK CÓ ?room=XXXXXX -> tự vào phòng, chạy ĐÚNG MỘT LẦN lúc mount.
   *
   * Hai đường khác nhau:
   *  - Đã có token phòng trong localStorage -> KẾT NỐI LẠI: xin thẳng snapshot,
   *    không gọi join. Gọi join lại sẽ bị coi là người mới (mất ghế, hoặc bị đẩy
   *    vào hàng chờ khi phòng đã đủ người) — đúng cái F5 giữa ván không được phép.
   *  - Chưa có token -> JOIN như khách mới.
   * Vào không được (phòng hết hạn, sai mã) thì dọn param rồi về menu, không để
   * người chơi kẹt ở màn hình trắng.
   */
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    const code = roomCodeFromUrl();
    if (!code) return;

    const saved = loadToken(code);
    if (saved) {
      queueMicrotask(() => {
        void enterOnline(async () => {
          const snap = await api.snapshot(code, playerId(), saved);
          if (snap.you) return { code, token: saved };
          setJoinPromptCode(code);
          throw new Error('prompt-join');
        }).catch((e) => {
          if (e?.message !== 'prompt-join') clearRoomInUrl();
        });
      });
      return;
    }

    queueMicrotask(() => {
      setJoinPromptCode(code);
    });
  }, [enterOnline]);

  const handleConfirmJoin = useCallback(() => {
    if (!joinPromptCode) return;
    const code = joinPromptCode;
    setJoinPromptCode(null);
    void enterOnline(async () => {
      const res = await api.join(code, netMe());
      return { code, token: res.token };
    }).catch(() => clearRoomInUrl());
  }, [enterOnline, joinPromptCode, netMe]);

  const handleCancelJoin = useCallback(() => {
    setJoinPromptCode(null);
    clearRoomInUrl();
  }, []);

  /** Chơi offline với bot: engine chạy trong tab, không cần server. */
  const beginLocal = useCallback(() => {
    const seats = useRoom.getState().seats;
    const players = seats
      .map((s, i) => (s ? { id: s.id, name: s.name, isBot: s.isBot, team: (i % 2) as 0 | 1 } : null))
      .filter((p): p is NonNullable<typeof p> => !!p);
    useMatch.getState().start({
      players,
      rules: useRoom.getState().rules,
      deckType: useRoom.getState().deckType,
      myId: 'me',
    });
    setMusicPlaying(true);
    setScreen('game');
  }, []);

  const handleIntroDone = useCallback(() => {
    const { mode } = useRoom.getState();
    if (mode === 'online') {
      // Bài đã nằm sẵn trong hàng đợi từ lúc server chia — giờ mới cho chạy.
      useMatch.getState().releaseQueue();
      setScreen('game');
    } else {
      beginLocal();
    }
  }, [beginLocal]);

  const startMatch = useCallback(() => {
    const { mode, code, meId, bgTheme } = useRoom.getState();
    if (mode === 'online') {
      // Nền của ván đi theo CHỦ PHÒNG: ưu tiên nền phòng đã chọn trong lobby, fallback cài đặt cá nhân
      const chosenTheme = bgTheme || useSettings.getState().bgTheme;
      void api.start(code, meId, loadToken(code), chosenTheme)
        .catch((e: Error) => setError(e.message));
      return; // chờ broadcast đổi status -> mọi client cùng vào bàn
    }
    setScreen('intro');
  }, []);

  const nextRound = useCallback(() => {
    const { mode } = useRoom.getState();
    const state = useMatch.getState().state;
    if (!state) return;

    if (mode === 'online') {
      // server tự xoay ghế theo hàng chờ rồi chia lại bài
      useMatch.getState().act({ type: 'NEXT_ROUND' });
      return;
    }

    const consecutive = Object.fromEntries(state.players.map((p) => [p.id, p.consecutiveRounds]));
    const rotated = useRoom.getState().rotateAfterRound(consecutive, 'me');
    if (rotated) {
      beginLocal();
      return;
    }
    useMatch.getState().act({ type: 'NEXT_ROUND' });
  }, [beginLocal]);

  const exit = useCallback(async () => {
    const { mode, code, meId } = useRoom.getState();
    if (mode === 'online' && code) {
      // Xoá bản tạm trước khi rời
      void api.avatar(code, meId, loadToken(code), null).catch(() => { });
      try {
        await api.leave(code, meId, loadToken(code));
      } catch {
        /* ignore network error */
      }
      disconnect();
      stopPoll.current?.();
      stopPoll.current = null;
    }
    useMatch.getState().stop();
    useRoom.getState().reset();
    clearRoomInUrl();
    setScreen('menu');
  }, []);

  useEffect(() => () => { disconnect(); stopPoll.current?.(); }, []);

  // Discord Activity: instance_id của voice channel làm mã phòng mặc định
  const discordCode = isDiscordActivity() ? discordRoomCode() : null;

  if (!loaded) {
    return (
      <main className="relative h-dvh w-screen overflow-hidden">
        <Preloader
          onDone={() => {
            setLoaded(true);
            // Nhạc nền chạy từ MENU và không ngắt cho tới khi rời trang. Chưa
            // có tương tác thì trình duyệt chặn play(); unlockAudio() đã gắn
            // sẵn từ màn loading nên cú chạm đầu tiên sẽ khởi động nó.
            setMusicPlaying(true);
          }}
        />
      </main>
    );
  }

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {(screen === 'game' || screen === 'intro') && <GameCanvas introActive={screen === 'intro'} />}

      <AnimatePresence mode="wait">
        {screen === 'menu' && (
          <MainMenu
            key="menu"
            busy={busy}
            onQuick={() => void enterOnline(() => api.quickMatch(netMe(), useSettings.getState().bgTheme))}
            onCreate={() => void enterOnline(() => api.create(netMe(), { isPublic: false, bgTheme: useSettings.getState().bgTheme }))}
            onJoin={(code) => void enterOnline(async () => {
              const res = await api.join(code, netMe());
              return { code, token: res.token };
            })}
            onSolo={() => { useRoom.getState().quickMatch(localMe()); setScreen('lobby'); }}
            onProfile={() => setModal('profile')}
            onSettings={() => setModal('settings')}
            onHowTo={() => setModal('howto')}
            discordCode={discordCode}
          />
        )}
      </AnimatePresence>

      {screen === 'lobby' && <Lobby onStart={startMatch} onBack={exit} onSettings={() => setModal('settings')} />}
      {screen === 'intro' && <DealIntro onDone={handleIntroDone} />}

      {screen === 'game' && (
        <>
          <GameHud onExit={exit} onSettings={() => setModal('settings')} />
          <SpectatorRail />
          <Fx />
          <RoundOverlay onNext={nextRound} onExit={exit} />
        </>
      )}

      {joinPromptCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div
            className="panel w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl border border-[#FFD34D]/40"
            style={{ background: 'linear-gradient(145deg, rgba(30,12,20,.95), rgba(12,4,8,.95))' }}
          >
            <div className="text-[36px] mb-2">🃏</div>
            <h3 className="display text-[22px] text-[#FFF3DA] mb-1.5">Tham gia phòng?</h3>
            <p className="text-[14px] text-[#FFE0B3]/80 mb-5">
              Bạn nhận được lời mời tham gia phòng{' '}
              <span className="font-bold tracking-widest text-[#FFD34D]">{joinPromptCode}</span>.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn flex-1 !py-2.5 !text-[15px]"
                onClick={() => { playSfx('click'); handleCancelJoin(); }}
              >
                Từ chối
              </button>
              <button
                type="button"
                className="btn btn--green flex-1 !py-2.5 !text-[15px]"
                onClick={() => { playSfx('click'); handleConfirmJoin(); }}
              >
                Vào phòng
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast />
      <DisconnectModal onLeave={exit} />
      {(screen === 'game' || screen === 'lobby') && <ChatInputBar />}

      {modal === 'profile' && <Profile onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsPanel onClose={() => setModal(null)} />}
      {modal === 'howto' && <HowToPlay onClose={() => setModal(null)} />}

      {error && (
        <div className="label absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl bg-red-950/90 border border-red-500/50 px-5 py-2.5 text-[14px] font-semibold text-red-200 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <span>⚠️</span>
          <span>
            {error === 'room-full'
              ? 'Phòng đã đầy (tối đa 8 người bao gồm bàn chơi và hàng chờ)!'
              : error === 'room-not-found'
                ? 'Không tìm thấy phòng hoặc mã phòng không tồn tại!'
                : error}
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-white cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <main className="grid h-dvh w-screen place-items-center" style={{ background: 'var(--menu-bg)' }}>
        <span className="display text-[13vmin] text-[#FFD34D]" style={{ textShadow: '0 6px 0 #A8460B' }}>Ú Nồ!</span>
      </main>
    );
  }
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}

'use client';
import '@/src/lib/patchDiscord';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { I18nProvider } from '@/src/i18n';
import { useSettings } from '@/src/lib/settings';
import { useMounted } from '@/src/lib/useMounted';
import { randomName } from '@/src/lib/names';
import { setMusicPlaying } from '@/src/lib/audio';
import { discordRoomCode, isDiscordActivity, getDiscordUser } from '@/src/lib/discord';
import { clearRoomInUrl, roomCodeFromUrl, setRoomInUrl } from '@/src/lib/roomLink';
import { useRoom, type Seat } from '@/src/state/room';
import { useMatch } from '@/src/state/match';
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

// WebGL chỉ khởi tạo khi vào bàn -> menu không tốn GPU context
const GameCanvas = dynamic(() => import('@/src/three/Scene').then((m) => m.GameCanvas), { ssr: false });

type Screen = 'menu' | 'lobby' | 'intro' | 'game';

function Shell() {
  const { username, set } = useSettings();
  // Chặn menu cho tới khi ảnh bài + âm thanh + font đã nằm trong cache.
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>('menu');
  // Bản sao của `screen` đọc được từ trong callback mạng: các handler dưới đây
  // được nhớ bằng useCallback nên không bao giờ thấy giá trị state mới nhất.
  const screenRef = useRef<Screen>('menu');
  const [modal, setModal] = useState<'profile' | 'settings' | 'howto' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopPoll = useRef<(() => void) | null>(null);

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
      onResync: () => {
        void api.snapshot(code, playerId(), loadToken(code)).then(applySnapshot).catch(() => {});
      },
    });

    if (!ok) stopPoll.current = startPolling(code, applySnapshot);
  }, [applySnapshot, holdIfEnteringMatch]);

  const enterOnline = useCallback(async (fn: () => Promise<{ code: string; token: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const { code, token } = await fn();
      saveToken(code, token);
      const snap = await api.snapshot(code, playerId(), token);
      applySnapshot(snap);
      listen(code);
      // Vào phòng xong mới ghi mã lên URL: link chỉ trỏ tới phòng có thật.
      setRoomInUrl(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network-error');
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, listen]);

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
    // Hoãn 1 nhịp: enterOnline gọi setBusy ngay, gọi thẳng trong thân effect sẽ
    // sinh render dây chuyền (React chặn).
    const id = setTimeout(() => {
      void enterOnline(async () => {
        const saved = loadToken(code);
        if (saved) {
          // Kiểm tra token còn sống trước khi coi là reconnect thành công.
          await api.snapshot(code, playerId(), saved);
          return { code, token: saved };
        }
        const res = await api.join(code, netMe());
        return { code, token: res.token };
      }).catch(() => clearRoomInUrl());
    }, 0);
    return () => clearTimeout(id);
  }, [enterOnline, netMe]);

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
    const { mode, code, meId } = useRoom.getState();
    if (mode === 'online') {
      // Nền của ván đi theo CHỦ PHÒNG: gửi kèm lúc bắt đầu, server chỉ nhận từ
      // host nên client khác có gửi cũng không đổi được nền của bàn.
      void api.start(code, meId, loadToken(code), useSettings.getState().bgTheme)
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

  const exit = useCallback(() => {
    const { mode, code, meId } = useRoom.getState();
    if (mode === 'online' && code) {
      void api.leave(code, meId, loadToken(code)).catch(() => {});
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
            onQuick={() => void enterOnline(() => api.quickMatch(netMe()))}
            onCreate={() => void enterOnline(() => api.create(netMe(), { isPublic: false }))}
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

      {screen === 'lobby' && <Lobby onStart={startMatch} onBack={exit} />}
      {screen === 'intro' && <DealIntro onDone={handleIntroDone} />}

      {screen === 'game' && (
        <>
          <GameHud onExit={exit} onSettings={() => setModal('settings')} />
          <Fx />
          <RoundOverlay onNext={nextRound} onExit={exit} />
        </>
      )}

      {modal === 'profile' && <Profile onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsPanel onClose={() => setModal(null)} />}
      {modal === 'howto' && <HowToPlay onClose={() => setModal(null)} />}

      {error && (
        <div className="label absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/75 px-4 py-2 text-[13px] text-[#FFC98A]">
          {error}
          {!realtimeEnabled && ' · realtime chưa cấu hình (đang poll)'}
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

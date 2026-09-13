'use client';
import React, { Component, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { setMusicDark } from '@/src/lib/audio';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Ban } from 'lucide-react';
import { Cards } from './Cards';
import { DirectionRing, Lights, Sparkles, TableTop } from './Table';
import { seatIndex, seatPos } from './layout';
import { gfxOf, useSettings } from '@/src/lib/settings';
import { useMatch } from '@/src/state/match';
import { useActiveTheme } from '@/src/state/room';
import { themeMeta } from '@/src/lib/themes';
import { Backdrop } from '@/src/ui/Backdrop';
import { Avatar } from '@/src/ui/Avatar';
import { clearCardMaterialCache } from './CardMesh';
import { clearStage } from './stage';

// Camera CỐ ĐỊNH (không parallax): góc nhìn khớp mock 03, thấy trọn quạt bài dưới cùng
const CAM = { x: 0, y: 4.75, z: 6.35 };
const LOOK = { x: 0, y: 0.3, z: 0.35 };

/** Camera cố định + rung nhẹ khi có sự kiện mạnh (RUSH, bị phạt, lật bàn, chồng bài rút). */
function CameraRig() {
  const shake = useRef(0);
  const fx = useMatch((s) => s.fx);

  useEffect(() => {
    const last = fx[fx.length - 1];
    if (!last) return;
    if (last.kind === 'rush' || last.kind === 'caught' || last.kind === 'flip') {
      shake.current = 0.16;
    } else if (last.kind === 'draw' && last.payload.t === 'draw' && last.payload.penalty) {
      // Rung càng mạnh khi chồng bài rút càng cao (tối đa ở ~8 lá trở lên)
      const n = last.payload.cardIds.length;
      shake.current = Math.max(shake.current, Math.min(0.4, 0.06 + n * 0.045));
    }
  }, [fx]);

  useFrame((st, dt) => {
    const cam = st.camera;
    // camera đứng yên: chỉ đụng vào transform khi đang rung
    if (shake.current > 0.001) {
      shake.current *= Math.pow(0.02, dt);
      cam.position.set(CAM.x + (Math.random() - 0.5) * shake.current, CAM.y + (Math.random() - 0.5) * shake.current, CAM.z);
      cam.lookAt(LOOK.x, LOOK.y, LOOK.z);
    } else if (cam.position.x !== CAM.x || cam.position.y !== CAM.y) {
      cam.position.set(CAM.x, CAM.y, CAM.z);
      cam.lookAt(LOOK.x, LOOK.y, LOOK.z);
    }
  });
  return null;
}

/**
 * Giới hạn FPS (tuỳ chọn, mặc định KHÔNG bật — xem lý do dưới).
 *
 * Bản trước gate `gl.render()` bằng ngưỡng `performance.now()` cố định 60fps.
 * Trên màn hình không phải 60Hz (75/90/120/144Hz — rất phổ biến hiện nay),
 * ngưỡng cố định đó rơi lệch pha với nhịp rAF thật của màn hình, khiến số
 * frame bị bỏ dao động thất thường (2,3,2,2,3...) thay vì đều đặn — đúng cảm
 * giác "khựt" liên tục dù FPS trung bình vẫn đạt. Đây là nguyên nhân giật lag
 * chính đã tìm ra và sửa ở đây.
 *
 * Sửa bằng 2 cách:
 * 1. Mặc định KHÔNG can thiệp render loop nữa (fpsLimit='unlimited' mặc định,
 *    xem src/lib/settings.ts) — để R3F tự render mỗi rAF, khớp tuyệt đối với
 *    vsync thật của trình duyệt, không có gì để mà lệch pha.
 * 2. Khi người dùng CHỦ ĐỘNG chọn giới hạn (vd tiết kiệm pin laptop), dùng bộ
 *    tích luỹ theo `dt` thật (cùng nguồn với rAF) thay vì so sánh mốc thời
 *    gian tường — không aliasing, phân bố frame bị bỏ đều hơn nhiều.
 */
function FpsGovernor({ hasBloom }: { hasBloom: boolean }) {
  const fpsLimit = useSettings((s) => s.fpsLimit ?? 'unlimited');
  const capped = !hasBloom && fpsLimit !== 'unlimited';
  const acc = useRef(0);

  useFrame(({ gl, scene, camera }, dt) => {
    if (!capped) return; // priority 0 khi không cap -> R3F tự render, hàm này không được gọi
    const targetFps = fpsLimit === '120' ? 120 : 60;
    const step = 1 / targetFps;
    acc.current += dt;
    if (acc.current >= step) {
      acc.current %= step; // giữ phần dư thay vì reset về 0 -> không cộng dồn sai số theo thời gian
      gl.render(scene, camera);
    }
  }, capped ? 1 : 0);

  return null;
}

/** HUD người chơi: DOM 2D neo theo toạ độ 3D của ghế (drei Html), không tự tính 3D. */
function SeatHuds() {
  const state = useMatch((s) => s.state);
  const myId = useMatch((s) => s.myId);
  const fx = useMatch((s) => s.fx);
  if (!state || state.phase === 'roundEnd' || state.phase === 'matchEnd') return null;
  const n = state.players.length;
  const mySeat = state.players.findIndex((p) => p.id === myId);
  const myIdx = Math.max(0, mySeat);
  // Đang ở hàng chờ (xem ván) thì ghế dưới cùng KHÔNG phải của mình — nó là một
  // người chơi thật và phải có tên như mọi ghế khác. Người ngồi bàn mới được bỏ
  // qua ghế 0, vì HUD cá nhân dưới màn hình đã thay chỗ cho nó.
  const seated = mySeat >= 0;

  // Bong bóng cảm xúc gần nhất theo từng người chơi — việc mờ/ẩn đi sau
  // EMOTE_TTL giao hẳn cho CSS animation (forwards) tự lo (key ổn định theo
  // fxId nên không remount/replay khi re-render vì lý do khác); KHÔNG lọc
  // theo Date.now() ở render (impure, bị React Compiler chặn) — fx tự hết
  // hạn sau 2.6s ở pushFx (match.ts), muộn hơn nhiều so với EMOTE_TTL=2s.
  const emoteByPlayer = new Map<string, { emote: string; fxId: number }>();
  // Người bị cấm lượt (skip 1 người, hoặc skipAll dark side -> mọi người trừ
  // người vừa đánh lá đó, tức trừ người đang giữ lượt hiện tại). Badge tự mờ
  // dần bằng CSS animation (banPop) — không lọc Date.now() ở render.
  const bannedByPlayer = new Map<string, number>();
  for (const f of fx) {
    if (f.kind === 'emote' && f.payload.t === 'emote') {
      emoteByPlayer.set(f.payload.playerId, { emote: f.payload.emote, fxId: f.id });
    } else if (f.kind === 'skip' && f.payload.t === 'skip') {
      bannedByPlayer.set(f.payload.playerId, f.id);
    } else if (f.kind === 'skipAll' && f.payload.t === 'skipAll') {
      // Người đánh lá skipAll đã được chốt vào fx lúc nó xảy ra; suy lại từ
      // state.turn ở đây thì mỗi lần đổi lượt là badge của cả bàn nháy lại.
      for (const p of state.players) {
        if (p.id !== f.actorId) bannedByPlayer.set(p.id, f.id);
      }
    }
  }

  return (
    <>
      {state.players.map((p, i) => {
        const j = seatIndex(i, myIdx, n);
        if (j === 0 && seated) return null; // ghế mình đã có HUD riêng ở dưới màn hình
        const pos = seatPos(j, n, 3.15);
        const active = state.turn === i;
        const emote = emoteByPlayer.get(p.id);
        const bannedFxId = bannedByPlayer.get(p.id);
        return (
          <Html key={p.id} position={[pos.x, 0.55, pos.z]} center zIndexRange={[10, 0]}>
            <div className={`seat ${active ? 'seat--turn' : ''}`} style={{ position: 'relative' }}>
              {emote && (
                <div
                  key={emote.fxId}
                  className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[30px]"
                  style={{ animation: 'emotePop 2s ease-out forwards', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.6))' }}
                >
                  {emote.emote}
                </div>
              )}
              {bannedFxId !== undefined && (
                <div
                  key={bannedFxId}
                  className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
                  style={{ animation: 'banPop 1.2s ease-out forwards' }}
                >
                  <Ban size={40} strokeWidth={3} color="#fff" style={{ filter: 'drop-shadow(0 0 6px rgba(226,59,46,.9)) drop-shadow(0 2px 4px rgba(0,0,0,.7))' }} />
                </div>
              )}
              <div className="seat__name">{p.name}</div>
              <Avatar name={p.name} preset={i} size={active ? 60 : 46} className="seat__avatar" />
              <div className="seat__count">{p.hand.length}</div>
              {p.hand.length === 1 && <div className="seat__rush">{p.calledRush ? 'RUSH!' : '?'}</div>}
            </div>
          </Html>
        );
      })}
    </>
  );
}

function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

interface WebGLErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Màn báo mất WebGL — tách thành component HÀM riêng vì ErrorBoundary bắt buộc
 * phải là class, mà class thì không gọi được hook `useTranslations`. Để chữ
 * cứng trong class là cách duy nhất lọt lưới i18n, nên tách hẳn ra đây.
 */
function GlLostFallback({ onReset, onLowGfx }: { onReset: () => void; onLowGfx: () => void }) {
  const t = useTranslations('settings');
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/90 p-6 text-center backdrop-blur-md">
      <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-zinc-900/95 p-8 shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-3xl text-amber-400">
          ⚠️
        </div>
        <h2 className="mb-2 text-xl font-bold text-amber-300">{t('glLostTitle')}</h2>
        <p className="mb-6 text-sm text-zinc-300 leading-relaxed">{t('glLostBody')}</p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onReset}
            className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-3 font-semibold text-zinc-950 shadow-lg transition hover:from-amber-400 hover:to-amber-500 active:scale-95"
          >
            {t('glRetry')}
          </button>
          <button
            type="button"
            onClick={onLowGfx}
            className="w-full cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800/80 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700 active:scale-95"
          >
            {t('glLowGfx')}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full cursor-pointer rounded-xl border border-zinc-800 bg-transparent px-5 py-2 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            {t('glReload')}
          </button>
        </div>
      </div>
    </div>
  );
}

export class WebGLErrorBoundary extends Component<WebGLErrorBoundaryProps, WebGLErrorBoundaryState> {
  constructor(props: WebGLErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): WebGLErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[WebGLErrorBoundary] Caught 3D/WebGL error:', error, info);
  }

  handleReset = () => {
    clearCardMaterialCache();
    clearStage();
    this.props.onReset?.();
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleSwitchLow = () => {
    useSettings.getState().set('graphics', 'low');
    this.handleReset();
  };

  render() {
    if (this.state.hasError) {
      return <GlLostFallback onReset={this.handleReset} onLowGfx={this.handleSwitchLow} />;
    }

    return this.props.children;
  }
}

function GameCanvasInner({ introActive = false }: { introActive?: boolean }) {
  const t = useTranslations('settings');
  const graphics = useSettings((s) => s.graphics);
  // Nền của ván, không phải cài đặt cá nhân: phòng online đi theo chủ phòng.
  const tableSkin = useActiveTheme();
  const gfx = gfxOf(graphics);
  const meta = themeMeta(tableSkin).table;
  const direction = useMatch((s) => s.state?.direction ?? 1);
  const reverseFx = useMatch((s) => s.fx.some((f) => f.kind === 'reverse'));
  const side = useMatch((s) => s.state?.side ?? 'light');
  // Mặt Dark (Ú Nô Flip) -> nền "không gian" tối sâu thay vì màu bàn sáng —
  // đổi ngay theo state.side (đồng bộ với rung màn hình + âm thanh 'flip' đã
  // có sẵn ở CameraRig/sfxFor, cùng 1 khoảnh khắc "lật bàn" nên đổi tức thì
  // càng khớp cảm giác kịch tính, không cần lerp mượt).
  // Sương mù của scene: vẫn dùng màu chủ đề để mép bàn tan dần đúng tông. Nền
  // thì KHÔNG vẽ trong canvas nữa — canvas để trong suốt cho cảnh CSS phía sau
  // hiện ra (xem <Backdrop> ngay dưới), nếu không thì trong ván chỉ thấy đúng
  // một mảng màu phẳng trong khi menu lại có cả khung cảnh.
  const bgColor = side === 'dark' ? '#06030D' : meta.fog;

  // Mặt Dark: nhạc nền chìm xuống, vang lên, đục đi (xem setMusicDark).
  useEffect(() => { setMusicDark(side === 'dark'); }, [side]);

  // Dọn dẹp cache texture và material khi unmount
  useEffect(() => {
    return () => {
      clearCardMaterialCache();
      clearStage();
    };
  }, []);

  const [hasWebGL, setHasWebGL] = useState(isWebGLAvailable);

  if (!hasWebGL) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/90 p-6 text-center backdrop-blur-md">
        <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-zinc-900/95 p-8 shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-3xl text-amber-400">
            ⚠️
          </div>
          <h2 className="mb-2 text-xl font-bold text-amber-300">{t('glBlockedTitle')}</h2>
          <p className="mb-6 text-sm text-zinc-300 leading-relaxed">
            {t('glBlockedBody')}
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                if (isWebGLAvailable()) setHasWebGL(true);
                else window.location.reload();
              }}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-3 font-semibold text-zinc-950 shadow-lg transition hover:from-amber-400 hover:to-amber-500 active:scale-95 cursor-pointer"
            >
              Thử lại / Mở lại WebGL
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-5 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700 active:scale-95 cursor-pointer"
            >
              Tải lại trang web
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <Backdrop theme={tableSkin} dim="soft" dark={side === 'dark'} />
    <Canvas
      shadows={gfx.shadows}
      dpr={gfx.dpr}
      camera={{ position: [CAM.x, CAM.y, CAM.z], fov: 40, near: 0.1, far: 40 }}
      gl={{
        antialias: graphics !== 'low',
        // 'default' để trình duyệt tự chọn GPU có thể rơi vào iGPU yếu trên máy
        // 2 GPU (laptop gaming, MacBook Pro...) dù có card rời mạnh hơn hẳn —
        // xin thẳng GPU hiệu năng cao, đúng tinh thần 1 game 3D thực thụ.
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
        // Trong suốt: cảnh nền CSS nằm dưới canvas phải nhìn xuyên qua được.
        alpha: true,
        failIfMajorPerformanceCaveat: false,
      }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        const handleContextLost = (e: Event) => {
          e.preventDefault();
          console.warn('[WebGL] Context loss caught. Prevented default.');
        };
        const handleContextRestored = () => {
          console.info('[WebGL] Context restored.');
        };
        canvas.addEventListener('webglcontextlost', handleContextLost, false);
        canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
      }}
    >
      <fog attach="fog" args={[bgColor, 12, 24]} />
      <Lights skin={tableSkin} />
      <TableTop skin={tableSkin} />
      <Sparkles count={gfx.particles} color={meta.rim} />
      <DirectionRing direction={direction} active={reverseFx} color={meta.rim} />
      <Cards paused={introActive} />
      <SeatHuds />
      <CameraRig />
      <FpsGovernor hasBloom={Boolean(gfx.bloom)} />
      {gfx.bloom && (
        <EffectComposer>
          <Bloom intensity={0.55} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
    </>
  );
}

export function GameCanvas({ introActive = false }: { introActive?: boolean }) {
  const [remountKey, setRemountKey] = useState(0);
  return (
    <WebGLErrorBoundary key={remountKey} onReset={() => setRemountKey((k) => k + 1)}>
      <GameCanvasInner introActive={introActive} />
    </WebGLErrorBoundary>
  );
}

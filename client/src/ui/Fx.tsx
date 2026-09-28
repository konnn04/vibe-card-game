'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { face, mulberry32, type Card, type DeckType } from '@u-no/game-engine';
import { useMatch, type FxItem } from '@/src/state/match';
import { COLOR_HEX } from '@/src/three/atlas';
import { gfxOf, useSettings } from '@/src/lib/settings';
import { CardPhoto, type AtlasId } from './CardPhoto';
import type { AtlasVariant } from '@/src/three/photoAtlas';
import { resolveCardSprite } from '@/src/modes';
import { useSeatScreen, type ScreenPoint } from '@/src/state/seats';

/** Khoảnh khắc RUSH (mock 05): chữ vàng khổng lồ + tia sáng quay + dòng "còn 1 lá". */
function RushMoment({ name }: { name: string }) {
  const t = useTranslations('game');
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: '92vmin', height: '92vmin',
          background: 'conic-gradient(from 10deg, rgba(255,255,255,.20) 0 10deg, transparent 10deg 40deg, rgba(255,255,255,.14) 40deg 50deg, transparent 50deg 80deg)',
          animation: 'spinSlow 70s linear infinite',
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: '64vmin', height: '64vmin', background: 'radial-gradient(circle,rgba(255,255,255,.5),rgba(255,255,255,0) 62%)' }}
      />
      <motion.div
        className="relative text-center"
        initial={{ scale: 0.4, rotate: -10 }}
        animate={{ scale: [0.4, 1.12, 1], rotate: [-10, 3, 0] }}
        transition={{ duration: 0.55, times: [0, 0.55, 1] }}
      >
        <div
          className="display text-[17vmin] leading-[.86] tracking-[-.03em] text-[#FFD34D]"
          style={{ textShadow: '0 10px 0 #A8460B, 0 16px 40px rgba(0,0,0,.5)' }}
        >
          {t('rush')}!
        </div>
        <div className="label mt-3 inline-block rounded-lg bg-white/70 px-5 py-1.5 text-[16px] tracking-[.4em] text-[#3A0E06]">
          {t('rushOne', { name })}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * VỠ TRẬN — tay bài vượt 36 lá, người chơi nổ tung và bị loại (bộ Hỗn loạn).
 * Sóng xung kích + mảnh vụn bắn ra + tên người nổ. Dài EXPLODE_MS (timeline.ts),
 * lượt kế tiếp chờ màn này chạy xong.
 */
function ExplodeMoment({ name, cards, isMe, particles, at }: { name: string; cards: number; isMe: boolean; particles: number; at: ScreenPoint | null }) {
  const t = useTranslations('game');
  const bits = useMemo(() => {
    const rnd = mulberry32(cards * 7919 + name.length);
    return Array.from({ length: particles }, () => {
      const a = rnd() * Math.PI * 2;
      const d = 90 + rnd() * 200;
      return {
        x: Math.cos(a) * d, y: Math.sin(a) * d, r: rnd() * 540 - 270,
        s: 8 + rnd() * 12, c: ['#FFD34D', '#FF8410', '#E23B2E', '#FFF3DA'][Math.floor(rnd() * 4)],
      };
    });
  }, [cards, name, particles]);
  // Neo ĐÚNG ghế người nổ (chiếu từ bàn 3D — xem useSeatScreen). Chưa có toạ độ
  // (khung đầu tiên) thì nổ giữa màn. Kẹp vào trong màn để chữ không bị cắt.
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 720;
  const x = Math.min(w - 150, Math.max(150, at?.x ?? w / 2));
  const y = Math.min(h - 110, Math.max(110, at?.y ?? h / 2));
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-40"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: 1.5, times: [0, 0.8, 1] }}
      style={{ animation: 'penaltyShock 0.5s cubic-bezier(.2,.7,.3,1)' }}
    >
      {/* Mọi phần tử con đặt theo tâm (0,0) của điểm neo này. */}
      <div className="absolute" style={{ left: x, top: y, width: 0, height: 0 }}>
        <motion.div
          className="absolute rounded-full"
          style={{ left: -260, top: -260, width: 520, height: 520, background: 'radial-gradient(circle at center, #FFF3DA 0%, #FF8410 35%, rgba(226,59,46,0) 70%)' }}
          initial={{ opacity: 0.95, scale: 0.4 }}
          animate={{ opacity: 0, scale: 1.2 }}
          transition={{ duration: 0.5 }}
        />
        {[0, 0.12].map((delay) => (
          <motion.div
            key={delay}
            className="absolute rounded-full"
            style={{ left: -60, top: -60, width: 120, height: 120, border: '10px solid #FFD34D', boxShadow: '0 0 40px #FF8410' }}
            initial={{ scale: 0.2, opacity: 1 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.8, delay, ease: 'easeOut' }}
          />
        ))}
        {bits.map((b, i) => (
          <motion.div
            key={i}
            className="absolute rounded-[3px]"
            style={{ left: -b.s / 2, top: -b.s * 0.7, width: b.s, height: b.s * 1.4, background: b.c }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{ x: b.x, y: b.y + 60, rotate: b.r, opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.1, 0.8, 0.3, 1] }}
          />
        ))}
        <motion.div
          className="absolute flex w-[320px] flex-col items-center"
          style={{ left: -160, top: -70 }}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: [0.3, 1.2, 1], opacity: 1 }}
          transition={{ duration: 0.45, times: [0, 0.6, 1] }}
        >
          <div className="text-[48px] leading-none sm:text-[64px]">💥</div>
          <div
            className="display text-center text-2xl font-black uppercase sm:text-4xl"
            style={{ color: '#FFD34D', textShadow: '0 4px 0 #6B1A0A, 0 0 30px #FF8410' }}
          >
            {isMe ? t('explodedMe') : t('exploded', { name })}
          </div>
          <div className="mt-1.5 rounded-full border border-white/20 bg-black/85 px-3 py-0.5 text-[11px] font-semibold text-white/95 sm:text-xs">
            {t('explodedSub', { n: cards })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Chữ lớn giữa bàn TỰ MỜ sau `ms` — cho các khoảnh khắc Party. Khác Burst (đứng
 * yên tới khi hiệu ứng khác thay): sau event này thường là cả loạt 'draw', nên
 * không thể dựa vào "fx cuối cùng" để tắt.
 */
function Flash({ text, sub, color, ms = 1200 }: { text: string; sub?: string; color: string; ms?: number }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: [0.6, 1.1, 1, 1], opacity: [0, 1, 1, 0] }}
      transition={{ duration: ms / 1000, times: [0, 0.2, 0.8, 1] }}
    >
      <div className="flex flex-col items-center">
        <div
          className="display text-center text-3xl font-black uppercase tracking-wide sm:text-4xl"
          style={{ color, textShadow: '0 4px 16px rgba(0,0,0,0.85), 0 0 25px currentColor' }}
        >
          {text}
        </div>
        {sub && (
          <div className="mt-2 rounded-full border border-white/20 bg-black/85 px-4 py-1 text-xs font-semibold text-white/95 shadow-xl sm:text-sm">
            {sub}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Party — lộ kết quả bầu Chỉ tay: mỗi người bị chỉ bao nhiêu ngón, rút bao nhiêu lá. */
function VoteReveal({ tally, names }: { tally: Record<string, number>; names: Record<string, string> }) {
  const t = useTranslations('game');
  const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.85, 1, 1, 1] }}
      transition={{ duration: 1.6, times: [0, 0.15, 0.85, 1] }}
    >
      <div className="panel min-w-[240px] px-5 py-3 text-center">
        <div className="display text-[22px] text-[#FFD34D]">{t('voteResult')}</div>
        {rows.length === 0 && <div className="mt-1 text-[13px] font-semibold text-[#C9B3E6]">{t('voteNobody')}</div>}
        {rows.map(([id, n]) => (
          <div key={id} className="mt-1 flex items-center justify-between gap-4 text-[15px] font-bold text-[#FFF3DA]">
            <span className="truncate">{names[id] ?? id}</span>
            <span>
              {'👉'.repeat(Math.min(n, 5))}
              <span className="ml-1.5 text-[#F87171]">+{Math.min(n, 5)}</span>
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Burst({ text, sub, color }: { text: string; sub?: string; color: string }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      initial={{ scale: 0.6, opacity: 0, rotate: -4 }}
      animate={{ scale: [0.6, 1.1, 1], opacity: [0, 1, 1], rotate: [-4, 2, 0] }}
      exit={{ scale: 1.2, opacity: 0 }}
      transition={{ duration: 0.4, times: [0, 0.4, 1] }}
    >
      <div className="flex flex-col items-center">
        <div
          className="display text-3xl sm:text-4xl font-black uppercase tracking-wide text-center"
          style={{ color, textShadow: '0 4px 16px rgba(0,0,0,0.85), 0 0 25px currentColor' }}
        >
          {text}
        </div>
        {sub && (
          <div className="mt-2 rounded-full bg-black/85 px-4 py-1 text-xs sm:text-sm font-semibold text-white/95 border border-white/20 shadow-xl backdrop-blur-md">
            {sub}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ChallengeMoment({
  challengerName,
  targetName,
  isChallenger,
  isTarget,
  success,
  revealedCard,
  targetId,
  myId,
  side = 'light',
  deckType = 'classic',
  onDismiss,
}: {
  challengerName: string;
  targetName: string;
  isChallenger: boolean;
  isTarget: boolean;
  success: boolean;
  revealedCard?: Card;
  targetId: string;
  myId: string;
  /** Không còn dùng để đoán vị trí (đã có useSeatScreen) — giữ cho chỗ gọi cũ. */
  players?: { id: string }[];
  side?: 'light' | 'dark';
  deckType?: DeckType;
  onDismiss?: () => void;
}) {
  const t = useTranslations('game');
  const [visible, setVisible] = useState(true);
  const at = useSeatScreen((st) => st.seats[targetId]);

  const duration = revealedCard ? 1700 : 1200;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  // Người bị challenge thua chữ đỏ, ngược lại chữ xanh.
  // Người đi challenge thắng chữ xanh, ngược lại chữ đỏ.
  const iLost = isTarget ? success : isChallenger ? !success : false;
  const iWon = isTarget ? !success : isChallenger ? success : false;
  const color = iLost ? '#F87171' : iWon ? '#34D399' : success ? '#34D399' : '#F87171';

  const text = success ? t('challengeSuccess') : t('challengeFail');
  const sub = success
    ? (isTarget ? t('challengeSuccessMe') : t('challengeSuccessTarget', { name: targetName }))
    : (isChallenger ? t('challengeFailMe') : t('challengeFailTarget', { name: challengerName }));

  // Neo tại ĐÚNG ghế người bị bắt lỗi (chiếu từ bàn 3D — useSeatScreen). Trước
  // đây đoán bằng công thức vòng tròn cố định nên thông báo luôn lệch về một bên.
  // Là mình thì nhô lên trên quạt bài. Kẹp vào trong màn để không bị cắt mép.
  const isMine = targetId === myId;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 720;
  const anchorX = Math.min(w - 140, Math.max(140, at?.x ?? w / 2));
  const anchorY = Math.min(h - 130, Math.max(revealedCard ? 170 : 70, (at?.y ?? h / 2) - (isMine ? 60 : 0)));
  const posX = 0;
  const posY = 0;
  const seatJ = isMine ? 0 : 1;

  const cardFace = revealedCard ? face(revealedCard, side) : null;
  const sprite = revealedCard && cardFace ? resolveCardSprite(deckType, side, revealedCard, cardFace) : null;
  const atlasVariant: AtlasVariant = sprite?.variant ?? 'std';
  const spriteName = sprite?.name ?? null;
  const atlasId: AtlasId = atlasVariant;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="absolute flex flex-col items-center"
        style={{ left: anchorX, top: anchorY, translate: '-50% -50%' }}
        initial={
          revealedCard
            ? { x: posX, y: posY + (seatJ === 0 ? 80 : 35), scale: 0.7, opacity: 0 }
            : { x: posX, y: posY, scale: 0.8, opacity: 0 }
        }
        animate={{ x: posX, y: posY, scale: 1, opacity: 1 }}
        exit={
          revealedCard
            ? { x: posX, y: posY + (seatJ === 0 ? 80 : 35), scale: 0.7, opacity: 0 }
            : { x: posX, y: posY, scale: 0.8, opacity: 0 }
        }
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {revealedCard && (
          <div className="flex flex-col items-center mb-2.5">
            <div className="mb-1 rounded-full bg-black/85 px-3 py-0.5 text-xs font-bold text-amber-300 border border-amber-300/40 shadow-xl backdrop-blur-md">
              {t('challengeFoundCard', { name: targetName })}
            </div>

            {/* Thẻ bài xoay lật 3D tại chỗ từ lưng bài sang mặt bài để cho mọi người xem */}
            <div
              className="relative"
              style={{
                perspective: 800,
                width: 95,
                height: 145,
              }}
            >
              <motion.div
                className="w-full h-full relative"
                initial={{ rotateY: 180 }}
                animate={{ rotateY: 0 }}
                exit={{ rotateY: 180 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Mặt ngửa (lá bài vi phạm) */}
                <div
                  className="absolute inset-0 rounded-xl overflow-hidden shadow-2xl border-2 border-amber-300/80"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    boxShadow: '0 0 25px rgba(255, 211, 77, 0.6), 0 8px 24px rgba(0,0,0,0.85)',
                  }}
                >
                  {spriteName ? (
                    <CardPhoto atlas={atlasId} name={spriteName} height={145} />
                  ) : (
                    <div className="w-full h-full grid place-items-center bg-slate-800 text-white font-bold p-2 text-center text-xs">
                      {cardFace?.value} {cardFace?.color}
                    </div>
                  )}
                </div>

                {/* Mặt úp (lưng bài trước khi xoay ra cho xem) */}
                <div
                  className="absolute inset-0 rounded-xl overflow-hidden shadow-2xl border-2 border-white/40"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.8)',
                  }}
                >
                  <CardPhoto atlas={atlasId === 'flipDark' ? 'flipDark' : 'std'} name="back_side" height={145} />
                </div>
              </motion.div>
            </div>
          </div>
        )}

        {/* Text thông báo kết quả hiển thị nhỏ gọn ngay tại vị trí tay bài đó */}
        <div className="flex flex-col items-center text-center">
          <div
            className="display text-xl sm:text-2xl font-black uppercase tracking-wide"
            style={{
              color,
              textShadow: '0 3px 12px rgba(0,0,0,0.95), 0 0 18px currentColor',
            }}
          >
            {text}
          </div>
          {sub && (
            <div className="mt-1 rounded-full bg-black/85 px-3 py-0.5 text-xs font-semibold text-white/95 border border-white/20 shadow-xl backdrop-blur-md">
              {sub}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Confetti({ count }: { count: number }) {
  const bits = useMemo(() => {
    const rnd = mulberry32(0xc0ffee);
    return Array.from({ length: count }, (_, i) => ({
      x: rnd() * 100,
      d: 1.6 + rnd() * 1.4,
      delay: rnd() * 0.5,
      c: ['#E23B2E', '#FFD34D', '#37A64A', '#1B72C4'][i % 4],
      r: rnd() * 360,
    }));
  }, [count]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute top-[-6vh] h-3 w-2 rounded-[2px]"
          style={{ left: `${b.x}%`, background: b.c, willChange: 'transform' }}
          initial={{ y: 0, rotate: b.r, opacity: 1 }}
          animate={{ y: '112vh', rotate: b.r + 480, opacity: [1, 1, 0.2] }}
          transition={{ duration: b.d, delay: b.delay, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

/**
 * Hiệu ứng toàn màn cho 2 khoảnh khắc dễ bị trôi qua mà không kịp nhận ra:
 *
 *  - ĐÁNH LÁ PHẠT (+2/+4/+5/Draw Color): sóng xung kích nở ra từ giữa bàn +
 *    viền màn hình ửng đỏ. Bị bắt rút bài là chuyện nặng, phải có một nhịp
 *    "giật mình" chứ không chỉ là một lá bài rơi xuống như mọi lá khác.
 *  - CHỌN MÀU (Wild): cả màn quét một lớp đúng màu vừa chọn. Bot chọn màu gần
 *    như tức thì, không có cú quét này thì người chơi chỉ thấy màu nền đổi mà
 *    chẳng kịp hiểu vì sao.
 *
 * Cả hai là overlay DOM thuần CSS, `pointer-events: none` — không đụng tới
 * vòng render 3D, không thể làm tụt khung hình bàn chơi.
 */
function ImpactFx({ fx }: { fx: FxItem[] }) {
  const state = useMatch((s) => s.state);
  const last = fx[fx.length - 1];
  if (!last || !state) return null;

  if (last.payload.t === 'color') {
    const hex = COLOR_HEX[last.payload.color] ?? '#FFD34D';
    return (
      <div
        key={last.id}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '150vmax', height: '150vmax', borderRadius: '50%',
          background: `radial-gradient(circle, ${hex}88 0%, ${hex}33 45%, transparent 70%)`,
          animation: 'colorWash 0.75s ease-out forwards',
        }}
      />
    );
  }

  // Lá vừa đánh có bắt ai đó rút bài không? Tra trong đống discard chứ không
  // đoán theo event, vì 'play' chỉ mang cardId.
  const payload = last.payload;
  if (payload.t === 'play') {
    const card = state.discard.find((c) => c.id === payload.cardId);
    const value = card ? face(card, state.playedSide?.[card.id] ?? state.side).value : '';
    const isPenalty = ['draw1', 'draw2', 'draw5', 'wild2', 'wild4', 'wildColor'].includes(value);
    if (!isPenalty) return null;
    return (
      <div key={last.id} className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: '46vmin', height: '46vmin',
            border: '6px solid rgba(255,120,90,.9)',
            boxShadow: '0 0 60px rgba(255,90,60,.7), inset 0 0 40px rgba(255,90,60,.45)',
            animation: 'penaltyShock 0.66s cubic-bezier(.2,.7,.3,1) forwards',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 48%, rgba(200,30,20,.42) 100%)',
            animation: 'penaltyVignette 0.7s ease-out forwards',
          }}
        />
      </div>
    );
  }
  return null;
}

export function Fx() {
  const t = useTranslations('game');
  const fx = useMatch((s) => s.fx);
  const state = useMatch((s) => s.state);
  const graphics = useSettings((s) => s.graphics);
  const gfx = gfxOf(graphics);

  const last = fx[fx.length - 1];
  const myId = useMatch((s) => s.myId);
  const rushEvent = last?.payload.t === 'rush' ? last.payload : null;
  const rushName = rushEvent ? state?.players.find((p) => p.id === rushEvent.playerId)?.name ?? '' : null;

  const [dismissedId, setDismissedId] = useState<number | null>(null);
  const challengeFx = fx.slice().reverse().find((f) => f.kind === 'challenge' && f.id !== dismissedId);
  const challengeEvent = challengeFx?.payload?.t === 'challenge' ? challengeFx.payload : null;
  const challengerName = challengeEvent ? state?.players.find((p) => p.id === challengeEvent.playerId)?.name ?? '' : '';
  const targetName = challengeEvent ? state?.players.find((p) => p.id === challengeEvent.targetId)?.name ?? '' : '';
  const roundOver = state?.phase === 'roundEnd' || state?.phase === 'matchEnd';
  const nameOf = (id: string) => state?.players.find((p) => p.id === id)?.name ?? '';
  const seatScreen = useSeatScreen((st) => st.seats);
  const latest = (kind: string) => fx.slice().reverse().find((f) => f.kind === kind);
  const voteStartFx = latest('voteStart');
  const voteFx = latest('voteResult');
  const chainFx = latest('chain');
  const chainBreakFx = latest('chainBreak');
  const pileStartFx = latest('pileUpStart');
  const pileTakeFx = latest('pileUpTake');
  const jumpFailFx = latest('jumpFail');
  const rouletteFx = latest('roulette');
  const discardAllFx = latest('discardAll');
  const explodeFx = fx.slice().reverse().find((f) => f.kind === 'eliminated');
  const explodeEvent = explodeFx?.payload.t === 'eliminated' ? explodeFx.payload : null;

  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {rushName !== null && <RushMoment key={last.id} name={rushName} />}
        {challengeEvent !== null && challengeFx && (
          <ChallengeMoment
            key={challengeFx.id}
            challengerName={challengerName}
            targetName={targetName}
            isChallenger={myId === challengeEvent.playerId}
            isTarget={myId === challengeEvent.targetId}
            success={challengeEvent.success}
            revealedCard={challengeEvent.revealedCard}
            targetId={challengeEvent.targetId}
            myId={myId}
            players={state?.players ?? []}
            side={state?.side}
            deckType={state?.deckType}
            onDismiss={() => setDismissedId(challengeFx.id)}
          />
        )}
        {/* Màn nổ tự mờ hẳn sau 1.5s (opacity -> 0), fx bị dọn sau fxTtlMs. */}
        {explodeEvent && explodeFx && (
          <ExplodeMoment
            key={explodeFx.id}
            name={state?.players.find((p) => p.id === explodeEvent.playerId)?.name ?? ''}
            cards={explodeEvent.cards}
            isMe={explodeEvent.playerId === myId}
            particles={Math.min(48, Math.max(12, gfx.particles))}
            at={seatScreen[explodeEvent.playerId] ?? null}
          />
        )}
        {/* Party */}
        {voteStartFx?.payload.t === 'voteStart' && (
          <Flash key={voteStartFx.id} text={t('voteStart')} sub={t('voteStartSub', { name: nameOf(voteStartFx.payload.by) })} color="#FFD34D" ms={900} />
        )}
        {voteFx?.payload.t === 'voteResult' && (
          <VoteReveal
            key={voteFx.id}
            tally={voteFx.payload.tally}
            names={Object.fromEntries((state?.players ?? []).map((p) => [p.id, p.name]))}
          />
        )}
        {chainFx?.payload.t === 'chain' && (
          <Flash key={chainFx.id} text={t('chainFx')} sub={`${nameOf(chainFx.payload.a)} 🔗 ${nameOf(chainFx.payload.b)}`} color="#7FE3FF" ms={1100} />
        )}
        {chainBreakFx && <Flash key={chainBreakFx.id} text={t('chainBreakFx')} color="#FFF3DA" ms={700} />}
        {pileStartFx?.payload.t === 'pileUpStart' && (
          <Flash key={pileStartFx.id} text={t('pileUpFx')} sub={t('pileUpFxSub', { color: WHEEL_NAME[pileStartFx.payload.color] ?? pileStartFx.payload.color })} color={COLOR_HEX[pileStartFx.payload.color]} ms={1000} />
        )}
        {pileTakeFx?.payload.t === 'pileUpTake' && (
          <Flash key={pileTakeFx.id} text={t('pileTakeFx', { name: nameOf(pileTakeFx.payload.playerId), n: pileTakeFx.payload.cardIds.length })} color="#F87171" ms={1200} />
        )}
        {jumpFailFx?.payload.t === 'jumpFail' && (
          <Flash key={jumpFailFx.id} text={t('jumpFailFx')} sub={t('jumpFailSub', { name: nameOf(jumpFailFx.payload.playerId), n: jumpFailFx.payload.amount })} color="#F87171" ms={900} />
        )}
        {/* No Mercy */}
        {rouletteFx?.payload.t === 'roulette' && (
          <Flash key={rouletteFx.id} text={t('rouletteFx')} sub={t('rouletteSub', { name: nameOf(rouletteFx.payload.playerId) })} color="#FFD34D" ms={1000} />
        )}
        {discardAllFx?.payload.t === 'discardAll' && (
          <Flash key={discardAllFx.id} text={t('discardAllFx', { n: discardAllFx.payload.cardIds.length + 1 })} sub={nameOf(discardAllFx.payload.playerId)} color="#7FE3FF" ms={900} />
        )}
        <ImpactFx fx={fx} />
        {last?.kind === 'caught' && <Burst key={last.id} text="+2!" color="#E23B2E" />}
        {last?.kind === 'skip' && <Burst key={last.id} text="SKIP" color="#FFF3DA" />}
        {/* Luật 0-7: báo cả bàn đang đổi bài (lá 7 đổi 2 người, lá 0 chuyền cả bàn). */}
        {last?.payload.t === 'swap' && (
          <Burst
            key={last.id}
            text={t('swapHands')}
            sub={t('swapHandsSub', {
              a: state?.players.find((p) => p.id === (last.payload as { a: string }).a)?.name ?? '',
              b: state?.players.find((p) => p.id === (last.payload as { b: string }).b)?.name ?? '',
            })}
            color="#7FE3FF"
          />
        )}
        {last?.payload.t === 'rotate' && (
          <Burst key={last.id} text={t('swapHands')} sub={t('rotateHandsSub')} color="#7FE3FF" />
        )}
        {last?.kind === 'flip' && (
          <motion.div
            key={last.id}
            className="absolute inset-0"
            initial={{ opacity: 0.85, scaleY: 0 }}
            animate={{ opacity: [0.85, 0], scaleY: [0, 1] }}
            transition={{ duration: 0.6 }}
            style={{ background: 'linear-gradient(180deg,#fff,transparent)', transformOrigin: 'center' }}
          />
        )}
        {roundOver && gfx.particles > 0 && <Confetti key="confetti" count={Math.min(70, gfx.particles)} />}
      </AnimatePresence>
    </div>
  );
}

const WHEEL_NAME: Record<string, string> = { red: '🟥', yellow: '🟨', green: '🟩', blue: '🟦' };

export { RoundOverlay, Fireworks } from './RoundOverlay';

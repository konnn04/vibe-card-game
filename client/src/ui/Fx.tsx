'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { face, mulberry32, type Card, type DeckType } from '@u-no/game-engine';
import { useMatch, type FxItem } from '@/src/state/match';
import { COLOR_HEX } from '@/src/three/atlas';
import { gfxOf, useSettings } from '@/src/lib/settings';
import { CardPhoto, type AtlasId } from './CardPhoto';
import { resolvePhotoSprite, type AtlasVariant } from '@/src/three/photoAtlas';

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
  players,
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
  players: { id: string }[];
  side?: 'light' | 'dark';
  deckType?: DeckType;
  onDismiss?: () => void;
}) {
  const t = useTranslations('game');
  const [visible, setVisible] = useState(true);

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

  // Tính tọa độ tay bài của người bị challenge trên màn hình
  const targetIdx = players.findIndex((p) => p.id === targetId);
  const myIdx = players.findIndex((p) => p.id === myId);
  const n = players.length || 4;
  const seatJ = targetIdx >= 0 && myIdx >= 0 ? ((targetIdx - myIdx) % n + n) % n : 0;
  const angle = (seatJ * Math.PI * 2) / n;
  const startX = -Math.sin(angle) * 320;
  const startY = Math.cos(angle) * 220;

  // Nếu là bản thân: nhô lên ngay trên quạt bài của mình ở cạnh dưới màn hình
  // Nếu là đối thủ: nhô lên ngay tại tay bài của đối thủ đó trên bàn
  const posX = seatJ === 0 ? 0 : startX;
  const posY = seatJ === 0 ? 140 : (startY - 20);

  const cardFace = revealedCard ? face(revealedCard, side) : null;
  const atlasVariant: AtlasVariant = deckType === 'flip'
    ? (side === 'dark' ? 'flipDark' : 'flipLight')
    : 'std';
  const spriteName = cardFace
    ? resolvePhotoSprite(atlasVariant, cardFace.color, cardFace.value)
    : null;
  const atlasId: AtlasId = atlasVariant;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="relative flex flex-col items-center"
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
        <ImpactFx fx={fx} />
        {last?.kind === 'caught' && <Burst key={last.id} text="+2!" color="#E23B2E" />}
        {last?.kind === 'skip' && <Burst key={last.id} text="SKIP" color="#FFF3DA" />}
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

export { RoundOverlay, Fireworks } from './RoundOverlay';

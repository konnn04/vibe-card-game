'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { face, mulberry32, type Card, type DeckType } from '@u-no/game-engine';
import { useMatch, type FxItem } from '@/src/state/match';
import { useAvatarLookup, useRoom } from '@/src/state/room';
import { seatsAfterRotation } from '@/src/lib/rotation';
import { COLOR_HEX } from '@/src/three/atlas';
import { gfxOf, useSettings } from '@/src/lib/settings';
import { musicFlourish } from '@/src/lib/audio';
import { Avatar } from './Avatar';
import { UI } from '@/src/config';
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
          Ú NỒ!!!
        </div>
        <div className="label mt-3 inline-block rounded-lg bg-white/70 px-5 py-1.5 text-[16px] tracking-[.4em] text-[#3A0E06]">
          {t('rushOne', { name })}
        </div>
      </motion.div>
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
  side = 'light',
  deckType = 'classic',
}: {
  challengerName: string;
  targetName: string;
  isChallenger: boolean;
  isTarget: boolean;
  success: boolean;
  revealedCard?: Card;
  side?: 'light' | 'dark';
  deckType?: DeckType;
}) {
  const iWon = isChallenger ? success : isTarget ? !success : false;
  const iLost = isChallenger ? !success : isTarget ? success : false;

  const [flipped, setFlipped] = useState(false);
  const [showResult, setShowResult] = useState(!revealedCard);

  useEffect(() => {
    if (!revealedCard) return;
    // 150ms: Lật lá bài lên cho cả bàn xem
    const t1 = setTimeout(() => setFlipped(true), 150);
    // 1450ms: Úp lá bài lại
    const t2 = setTimeout(() => setFlipped(false), 1450);
    // 1750ms: Hiện kết quả báo thua
    const t3 = setTimeout(() => setShowResult(true), 1750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [revealedCard]);

  const cardFace = revealedCard ? face(revealedCard, side) : null;
  const atlasVariant: AtlasVariant = deckType === 'flip'
    ? (side === 'dark' ? 'flipDark' : 'flipLight')
    : 'std';
  const spriteName = cardFace
    ? resolvePhotoSprite(atlasVariant, cardFace.color, cardFace.value)
    : null;
  const atlasId: AtlasId = atlasVariant;

  let title = '';
  let sub = '';
  let titleColor = '#FFD34D';

  if (isChallenger) {
    if (success) {
      title = 'BẮT LỖI THÀNH CÔNG!';
      sub = `${targetName} đã giấu màu! Đối thủ bị phạt rút bài!`;
      titleColor = '#34D399';
    } else {
      title = 'BẮT LỖI THẤT BẠI!';
      sub = `${targetName} đánh đúng luật! Bạn bị phạt rút 6 lá!`;
      titleColor = '#F87171';
    }
  } else if (isTarget) {
    if (success) {
      title = 'BỊ BẮT LỖI GIAN LẬN!';
      sub = `Bạn bị ${challengerName} bắt quả tang còn lá cùng màu! Bị phạt rút bài!`;
      titleColor = '#F87171';
    } else {
      title = 'BẢO VỆ THÀNH CÔNG!';
      sub = `Bạn đánh hoàn toàn hợp lệ! ${challengerName} bị phạt rút 6 lá!`;
      titleColor = '#34D399';
    }
  } else {
    if (success) {
      title = `${challengerName} BẮT LỖI THÀNH CÔNG!`;
      sub = `${targetName} đã gian lận màu và phải nhận phạt!`;
      titleColor = '#FBBF24';
    } else {
      title = `${challengerName} BẮT LỖI THẤT BẠI!`;
      sub = `${targetName} đánh đúng luật! ${challengerName} bị phạt 6 lá!`;
      titleColor = '#F87171';
    }
  }

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: showResult
            ? iWon
              ? 'radial-gradient(ellipse at center, rgba(16,185,129,0.35) 0%, rgba(0,0,0,0.7) 80%)'
              : iLost
                ? 'radial-gradient(ellipse at center, rgba(239,68,68,0.4) 0%, rgba(0,0,0,0.75) 80%)'
                : 'radial-gradient(ellipse at center, rgba(245,158,11,0.25) 0%, rgba(0,0,0,0.65) 80%)'
            : 'radial-gradient(ellipse at center, rgba(30,12,20,0.5) 0%, rgba(0,0,0,0.85) 85%)',
        }}
      />

      {/* Giai đoạn 1: Nếu người bị bắt lỗi CÓ LÁ THỎA -> Lật lá bài lên cho cả bàn xem rồi úp lại */}
      {revealedCard && !showResult && (
        <motion.div
          className="relative flex flex-col items-center text-center px-4"
          initial={{ scale: 0.3, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        >
          <div className="mb-3 rounded-full bg-black/85 px-4 py-1.5 text-xs sm:text-sm font-bold tracking-wide text-amber-300 border border-amber-300/40 shadow-xl backdrop-blur-md">
            🔍 KIỂM TRA TAY BÀI CỦA {targetName.toUpperCase()}
          </div>

          {/* 3D Flip Card Container */}
          <div
            className="relative"
            style={{
              perspective: 1000,
              width: 125,
              height: 190,
            }}
          >
            <motion.div
              className="w-full h-full relative"
              animate={{ rotateY: flipped ? 0 : 180 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Mặt ngửa (hiển thị lá bài cùng màu bị phát hiện) */}
              <div
                className="absolute inset-0 rounded-xl overflow-hidden shadow-2xl border-2 border-amber-300/80"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  boxShadow: '0 0 35px rgba(255, 211, 77, 0.6), 0 10px 30px rgba(0,0,0,0.8)',
                }}
              >
                {spriteName ? (
                  <CardPhoto atlas={atlasId} name={spriteName} height={190} />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-slate-800 text-white font-bold p-2 text-center text-sm">
                    {cardFace ? `${cardFace.value} ${cardFace.color}` : 'Card'}
                  </div>
                )}
              </div>

              {/* Mặt úp (lưng bài) */}
              <div
                className="absolute inset-0 rounded-xl overflow-hidden shadow-2xl border-2 border-white/40"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
                }}
              >
                <CardPhoto atlas={atlasId === 'flipDark' ? 'flipDark' : 'std'} name="back_side" height={190} />
              </div>
            </motion.div>
          </div>

          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="mt-4 rounded-xl bg-red-950/90 border border-red-500/80 px-4 py-2 text-sm sm:text-base font-bold text-red-200 shadow-2xl backdrop-blur-md"
          >
            ⚠️ Phát hiện lá bài cùng màu trên tay {targetName}!
          </motion.div>
        </motion.div>
      )}

      {/* Giai đoạn 2 (hoặc báo ngay nếu không có lá thỏa): Banner kết quả thắng / thua */}
      {showResult && (
        <motion.div
          className="relative flex flex-col items-center text-center px-6 max-w-xl"
          initial={{ scale: 0.5, y: 24, opacity: 0 }}
          animate={{ scale: [0.5, 1.1, 1], y: 0, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.5, times: [0, 0.6, 1] }}
        >
          <div className="mb-2 text-3xl sm:text-4xl">
            {iWon ? '🎉 ⚔️ 🛡️' : iLost ? '💥 ❌ 😱' : '⚔️ BẮT LỖI +4 ⚔️'}
          </div>
          <div
            className="display text-3xl sm:text-5xl font-black uppercase tracking-wide"
            style={{
              color: titleColor,
              textShadow: '0 4px 20px rgba(0,0,0,0.9), 0 0 30px currentColor',
            }}
          >
            {title}
          </div>
          <div className="mt-3 rounded-xl bg-black/80 px-5 py-2.5 text-sm sm:text-base font-semibold text-white/95 border border-white/20 shadow-2xl backdrop-blur-md">
            {sub}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function Burst({ text, color }: { text: string; color: string }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
      animate={{ scale: [0.4, 1.25, 1], opacity: [0, 1, 1], rotate: [-12, 4, 0] }}
      exit={{ scale: 1.6, opacity: 0 }}
      transition={{ duration: 0.55, times: [0, 0.5, 1] }}
    >
      <div className="display text-[13vmin] italic" style={{ color, textShadow: '0 8px 0 rgba(0,0,0,.35)' }}>
        {text}
      </div>
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
  const challengeEvent = last?.payload.t === 'challenge' ? last.payload : null;
  const challengerName = challengeEvent ? state?.players.find((p) => p.id === challengeEvent.playerId)?.name ?? '' : '';
  const targetName = challengeEvent ? state?.players.find((p) => p.id === challengeEvent.targetId)?.name ?? '' : '';
  const roundOver = state?.phase === 'roundEnd' || state?.phase === 'matchEnd';

  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {rushName !== null && <RushMoment key={last.id} name={rushName} />}
        {challengeEvent !== null && (
          <ChallengeMoment
            key={last.id}
            challengerName={challengerName}
            targetName={targetName}
            isChallenger={myId === challengeEvent.playerId}
            isTarget={myId === challengeEvent.targetId}
            success={challengeEvent.success}
            revealedCard={challengeEvent.revealedCard}
            side={state?.side}
            deckType={state?.deckType}
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

/** Bảng kết quả ván (mock 06): nền tím, hàng #1 vàng, cộng điểm chạy dần. */
/** Ăn mừng bao lâu trước khi hiện bảng kết quả. */
const CELEBRATE_MS = UI.celebrateMs;
const NEXT_ROUND_S = Math.round(UI.nextRoundMs / 1000);

const SPARK_COLORS = ['#FFD34D', '#FF8A2B', '#49D8F0', '#37A64A', '#E23B2E', '#FF4D95'];

/**
 * PHÁO HOA ĂN MỪNG — chen vào giữa lúc ván kết thúc và lúc hiện bảng kết quả.
 *
 * Bàn 3D vẫn nhìn thấy phía dưới: khoảnh khắc đáng ăn mừng là lá bài cuối vừa
 * rơi xuống, che ngay bằng bảng điểm là cướp mất nó.
 *
 * Vị trí và hướng bay của từng đốm sinh bằng RNG TẤT ĐỊNH theo số ván, không
 * phải Math.random(): hàm render phải thuần (React Compiler chặn), và mọi
 * người chơi cùng ván sẽ thấy y hệt nhau.
 */
function Fireworks({ seed, count = 7 }: { seed: number; count?: number }) {
  const bursts = useMemo(() => {
    const rnd = mulberry32(seed ^ 0xf17e);
    return Array.from({ length: count }, (_, i) => {
      const sparks = Array.from({ length: 14 }, () => {
        const a = rnd() * Math.PI * 2;
        const r = 60 + rnd() * 90;
        return {
          tx: `${Math.cos(a) * r}px`,
          ty: `${Math.sin(a) * r}px`,
          color: SPARK_COLORS[Math.floor(rnd() * SPARK_COLORS.length)],
        };
      });
      return {
        left: `${12 + rnd() * 76}%`,
        top: `${12 + rnd() * 46}%`,
        delay: i * 0.22 + rnd() * 0.18,
        color: SPARK_COLORS[Math.floor(rnd() * SPARK_COLORS.length)],
        sparks,
      };
    });
  }, [seed, count]);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {bursts.map((b, i) => (
        <div key={i} className="absolute" style={{ left: b.left, top: b.top }}>
          <div
            className="absolute h-[120px] w-[120px] rounded-full"
            style={{
              background: `radial-gradient(circle, ${b.color}cc, transparent 65%)`,
              animationName: 'fireworkFlash',
              animationDuration: '0.9s',
              animationTimingFunction: 'ease-out',
              animationFillMode: 'forwards',
              animationDelay: `${b.delay}s`,
            }}
          />
          {b.sparks.map((s, k) => (
            <span
              key={k}
              className="absolute block h-[7px] w-[7px] rounded-full"
              style={{
                background: s.color,
                boxShadow: `0 0 10px ${s.color}`,
                ['--tx' as string]: s.tx,
                ['--ty' as string]: s.ty,
                animationName: 'fireworkSpark',
                animationDuration: '1.25s',
                animationTimingFunction: 'cubic-bezier(.15,.7,.3,1)',
                animationFillMode: 'forwards',
                animationDelay: `${b.delay}s`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function RoundOverlay({ onNext, onExit }: { onNext: () => void; onExit: () => void }) {
  const t = useTranslations('game');
  const state = useMatch((s) => s.state);
  const myId = useMatch((s) => s.myId);
  const online = useRoom((s) => s.mode === 'online');
  // Chỉ chủ phòng được gửi NEXT_ROUND (server chặn, xem app/api/.../action).
  const isHost = useRoom((s) => s.meId === s.hostId);
  const hostId = useRoom((s) => s.hostId);
  const seats = useRoom((s) => s.seats);
  const queue = useRoom((s) => s.queue);
  const roomScores = useRoom((s) => s.scores);
  const avatarOf = useAvatarLookup();

  const over = !!state && (state.phase === 'roundEnd' || state.phase === 'matchEnd');
  // Khoá của LƯỢT KẾT THÚC này. Dùng làm mốc so sánh thay vì một cờ boolean:
  // ván sau kết thúc thì khoá đổi -> tự quay lại giai đoạn ăn mừng, khỏi phải
  // reset state bằng effect (React chặn setState đồng bộ trong thân effect).
  // Khoá phải ĐỔI sau MỖI ván. Chỉ dùng roundNo + người thắng là chưa đủ chắc:
  // ván online được dựng lại từ đầu nên roundNo từng bị đặt lại về 1 mỗi lần
  // rematch, và một người thắng hai ván liền là khoá lặp y hệt -> màn ăn mừng
  // coi như 'đã chiếu rồi' và bị bỏ qua. Tổng điểm thì chỉ có tăng.
  const totalScore = over ? state!.players.reduce((sum, p) => sum + p.score, 0) : 0;
  const endKey = over ? `${state!.roundNo}:${state!.winnerId ?? ''}:${totalScore}` : '';
  const [celebratedFor, setCelebratedFor] = useState('');
  const matchOver = state?.phase === 'matchEnd';
  // Đã qua 3 giây ăn mừng, bảng điểm đang hiện.
  const showScores = over && celebratedFor === endKey;

  useEffect(() => {
    if (!endKey) return;
    // KHÔNG gọi playSfx('win') ở đây: sfxFor (match.ts) đã phát nó khi bước
    // 'roundEnd' được commit — đúng cùng khoảnh khắc này. Âm thanh vẫn giữ một
    // đầu mối duy nhất; chỗ này chỉ lo phần nhạc nổi lên.
    musicFlourish();
    const id = setTimeout(() => setCelebratedFor(endKey), CELEBRATE_MS);
    return () => clearTimeout(id);
  }, [endKey]);

  /**
   * VÀO VÁN MỚI SAU MỘT KHOẢNG ĐẾM NGƯỢC (chỉ phòng online).
   *
   * Không dùng cơ chế bỏ phiếu: ván mới bắt đầu cho CẢ BÀN, nên chỉ cần một
   * khoảng chung đủ để mọi người đọc điểm rồi tự đi tiếp. Trong khoảng đó nút bị
   * KHOÁ — để một người bấm sớm kéo cả bàn đi thì chẳng khác gì không có bảng
   * điểm. Hết giờ thì mọi client cùng gửi NEXT_ROUND; server xử lý dưới khoá nên
   * người đầu tiên thắng, các lời gọi còn lại bị từ chối vô hại (act() nuốt
   * riêng lý do 'round-not-ended', không hiện toast báo lỗi).
   *
   * Chơi với bot thì bàn chỉ có mình -> bấm là đi ngay, không đếm.
   */
  const counting = online && showScores && !matchOver;
  // Không phải chủ phòng thì chỉ ngồi chờ: gửi NEXT_ROUND lên cũng bị server từ
  // chối, hiện nút bấm được chỉ tổ làm người ta bấm rồi tưởng game đơ.
  const waitingHost = counting && !isHost;

  // MỘT hẹn giờ lo việc chuyển ván. Tách hẳn khỏi con số hiển thị bên dưới: nếu
  // để việc chuyển ván bám theo state đếm lùi thì mỗi lần render lại là một cơ
  // hội đếm sai hoặc bắn hai lần.
  useEffect(() => {
    if (!counting || !isHost) return;
    const id = setTimeout(onNext, UI.nextRoundMs);
    return () => clearTimeout(id);
  }, [counting, isHost, onNext]);

  // Con số trên mặt nút. Gắn theo `endKey` để ván sau tự bắt đầu lại từ 5 —
  // component không unmount giữa hai ván nên một biến đếm trần sẽ còn kẹt ở 0.
  const [countdown, setCountdown] = useState({ key: '', left: NEXT_ROUND_S });
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => {
      setCountdown((c) =>
        c.key === endKey
          ? { key: endKey, left: Math.max(0, c.left - 1) }
          : { key: endKey, left: NEXT_ROUND_S - 1 },
      );
    }, 1000);
    return () => clearInterval(id);
  }, [counting, endKey]);
  const left = countdown.key === endKey ? countdown.left : NEXT_ROUND_S;

  if (!state || !over) return null;

  // 3 giây đầu: CHỈ pháo hoa, bàn 3D vẫn nhìn thấy. Hết mới hiện bảng điểm.
  if (!showScores) {
    const champ = state.players.find((p) => p.id === state.winnerId);
    return (
      <>
        <Fireworks seed={state.roundNo} />
        <div
          // top 26% để không đè lên đống bài giữa bàn; nowrap vì tên người chơi
          // dài là câu bị ngắt làm đôi, nhìn vỡ hẳn bố cục.
          className="pointer-events-none absolute left-1/2 top-[26%] z-40 whitespace-nowrap text-center"
          style={{ animationName: 'winnerPop', animationDuration: `${CELEBRATE_MS}ms`, animationTimingFunction: 'ease-out', animationFillMode: 'forwards' }}
        >
          <div className="display text-[6.4vmin] text-[#FFD34D]" style={{ textShadow: '0 6px 0 #6B3F0A, 0 0 40px rgba(255,180,60,.7)' }}>
            {champ?.id === myId ? t('youWin') : t('winner', { name: champ?.name ?? '' })}
          </div>
        </div>
      </>
    );
  }

  const winner = state.players.find((p) => p.id === state.winnerId);
  const iWon = winner?.id === myId;

  /**
   * BẢNG XẾP HẠNG CẢ PHÒNG, không riêng 4 người vừa ngồi.
   *
   * Người đang ở hàng chờ vẫn có điểm từ những ván họ đã chơi; bỏ họ khỏi bảng
   * thì nhìn như điểm bốc hơi mỗi lần xoay ghế. Điểm của người đang ngồi lấy từ
   * VÁN (mới nhất, đã cộng điểm ván này), của người đang chờ lấy từ sổ phòng.
   */
  const bench = queue.filter((q) => !state.players.some((p) => p.id === q.id));
  const ranked = [
    ...state.players.map((p) => ({
      id: p.id, name: p.name, score: p.score, gain: state.lastScores[p.id] ?? 0,
      cards: p.hand.length, seated: true,
    })),
    ...bench.map((q) => ({
      id: q.id, name: q.name, score: roomScores[q.id] ?? 0, gain: 0,
      cards: 0, seated: false,
    })),
  ].sort((a, b) =>
    (b.id === state.winnerId ? 1 : 0) - (a.id === state.winnerId ? 1 : 0) || b.score - a.score,
  );

  /**
   * ĐỘI HÌNH VÁN SAU. Tính bằng ĐÚNG hàm mà server dùng lúc chia lại bài
   * (src/lib/rotation.ts), nên không thể hứa một đằng rồi vào bàn một nẻo.
   */
  const nextSeats = seatsAfterRotation({
    seats, queue, hostId,
    consecutive: Object.fromEntries(state.players.map((p) => [p.id, p.consecutiveRounds])),
  });
  const hasBench = bench.length > 0;

  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 30%, #4A2A5E 0%, #2A1740 40%, #150B22 100%)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'conic-gradient(from 200deg at 50% 20%, rgba(255,211,77,.10) 0 30deg, transparent 30deg 90deg, rgba(255,211,77,.08) 90deg 120deg, transparent 120deg 180deg)' }}
      />

      <motion.div initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative text-center">
        <div className="label text-[16px] tracking-[.4em] text-[#C6A6F0]">
          {state.rules.targetScore > 0
            ? t('raceTo', { n: state.roundNo, target: state.rules.targetScore })
            : t('round', { n: state.roundNo })}
        </div>
        <div className="display text-[7vmin] text-[#FFD34D]" style={{ textShadow: '0 6px 0 #6B3F0A' }}>
          {matchOver ? t('matchWinner', { name: winner?.name ?? '' }) : iWon ? t('youWin') : t('winner', { name: winner?.name ?? '' })}
        </div>
      </motion.div>

      {/* Bảng xếp hạng CẢ PHÒNG. Cuộn được vì hàng chờ không giới hạn số người,
          và trần chiều cao tính theo vh nên không bao giờ đẩy hàng nút ra khỏi
          màn hình dù phòng có đông tới đâu. */}
      <div className="scroll-y relative mt-6 flex max-h-[42vh] w-[min(92vw,820px)] flex-col gap-3 pr-1">
        {ranked.map((p, i) => {
          const first = i === 0;
          return (
            <motion.div
              key={p.id}
              className="flex flex-none items-center gap-4 rounded-2xl px-5 py-3"
              style={
                first
                  ? { background: 'linear-gradient(100deg,rgba(255,211,77,.9),rgba(255,158,44,.85))', border: '3px solid #fff', boxShadow: '0 14px 30px rgba(0,0,0,.45)' }
                  // Người đang chờ mờ hơn một chút: vẫn có tên trong bảng, nhưng
                  // nhìn là biết ngay ai vừa ngồi bàn ván này.
                  : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)', opacity: p.seated ? 1 : 0.7 }
              }
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 260, damping: 24 }}
            >
              <div className="display w-10 text-[28px]" style={{ color: first ? '#2A1508' : '#C6A6F0' }}>{i + 1}</div>
              {(() => {
                const a = avatarOf(p.id);
                return (
                  <Avatar
                    name={p.name}
                    preset={a.preset ?? i}
                    avatarUrl={a.url}
                    self={p.id === myId}
                    size={54}
                    className="seat__avatar !h-[54px] !w-[54px] !rounded-[11px]"
                  />
                );
              })()}
              <div className="min-w-0 flex-1">
                <div className="display truncate text-[26px]" style={{ color: first ? '#2A1508' : '#F3ECFA' }}>{p.name}</div>
                <div className="label text-[13px]" style={{ color: first ? '#6A3A12' : '#A48AC8' }}>
                  {!p.seated ? t('spectating') : p.cards === 0 ? t('emptyHand') : t('handLeft', { n: p.cards })}
                </div>
              </div>
              <div className="text-right">
                <div className="display text-[28px]" style={{ color: first ? '#2A1508' : '#F3ECFA' }}>
                  {p.seated ? `+${p.gain}` : '—'}
                </div>
                <div className="label text-[13px]" style={{ color: first ? '#6A3A12' : '#A48AC8' }}>
                  {t('total', { n: p.score })}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 4 người sẽ ngồi bàn ván sau. Chỉ có gì để nói khi phòng đông hơn 4. */}
      {hasBench && !matchOver && (
        <div className="relative mt-5 flex items-center gap-4">
          <span className="label text-[13px] tracking-[.28em] text-[#C6A6F0]">{t('nextLineup')}</span>
          <div className="flex gap-3">
            {nextSeats.map((seat, i) => {
              const a = seat ? avatarOf(seat.id) : null;
              return (
                <div key={seat?.id ?? `empty-${i}`} className="flex w-[76px] flex-col items-center gap-1">
                  <Avatar
                    name={seat?.name ?? ''}
                    preset={a?.preset ?? i}
                    avatarUrl={a?.url}
                    self={seat?.id === myId}
                    size={44}
                    className="seat__avatar !h-11 !w-11 !rounded-[10px]"
                  />
                  <span className="label w-full truncate text-center text-[11px] text-[#C6A6F0]">{seat?.name ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative mt-8 flex gap-4">
        <button className="btn" onClick={onExit}>{t('backToMenu')}</button>
        {!matchOver && (
          <button
            className="btn btn--gold !px-8 !text-[22px]"
            disabled={counting}
            onClick={onNext}
          >
            {waitingHost && left <= 0 ? t('waitHostNext') : counting ? t('nextRoundIn', { n: left }) : t('nextRound')}
          </button>
        )}
      </div>
    </motion.div>
  );
}

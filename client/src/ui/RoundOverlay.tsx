'use client';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { mulberry32 } from '@u-no/game-engine';
import { useMatch } from '@/src/state/match';
import { useAvatarLookup, useRoom } from '@/src/state/room';
import { seatsAfterRotation, withoutAfkSeats } from '@/src/lib/rotation';
import { musicFlourish } from '@/src/lib/audio';
import { Avatar } from './Avatar';
import { UI } from '@/src/config';

/** Ăn mừng bao lâu trước khi hiện bảng kết quả. */
const CELEBRATE_MS = UI.celebrateMs;
const NEXT_ROUND_S = Math.round(UI.nextRoundMs / 1000);

const SPARK_COLORS = ['#FFD34D', '#FF8A2B', '#49D8F0', '#37A64A', '#E23B2E', '#FF4D95'];

/**
 * Pháo hoa ăn mừng — chen vào giữa lúc ván kết thúc và lúc hiện bảng kết quả.
 * Vị trí và hướng bay của từng đốm sinh bằng RNG tất định theo số ván.
 */
export function Fireworks({ seed, count = 7 }: { seed: number; count?: number }) {
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

/** Bảng kết quả ván đấu: nền tím, hàng #1 vàng, cộng điểm và đếm ngược chuyển ván. */
/**
 * Màn thấp (điện thoại xoay ngang, Discord nhúng) -> dùng cỡ gọn. Đo theo
 * CHIỀU CAO chứ không phải `sm:` (chiều ngang): điện thoại xoay ngang rộng
 * >640px nên `sm:` luôn chọn cỡ to nhất, đúng lúc màn thấp nhất.
 */
function useShortScreen(): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const check = () => setShort(window.innerHeight < 720);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return short;
}

export function RoundOverlay({ onNext, onExit }: { onNext: () => void; onExit: () => void }) {
  const t = useTranslations('game');
  const state = useMatch((s) => s.state);
  const myId = useMatch((s) => s.myId);
  const online = useRoom((s) => s.mode === 'online');
  const isHost = useRoom((s) => s.meId === s.hostId);
  const hostId = useRoom((s) => s.hostId);
  const seats = useRoom((s) => s.seats);
  const queue = useRoom((s) => s.queue);
  const roomScores = useRoom((s) => s.scores);
  const avatarOf = useAvatarLookup();
  const shortScreen = useShortScreen();

  const over = !!state && (state.phase === 'roundEnd' || state.phase === 'matchEnd');
  const totalScore = over ? state!.players.reduce((sum, p) => sum + p.score, 0) : 0;
  const endKey = over ? `${state!.roundNo}:${state!.winnerId ?? ''}:${totalScore}` : '';
  const [celebratedFor, setCelebratedFor] = useState('');
  const matchOver = state?.phase === 'matchEnd';
  const showScores = over && celebratedFor === endKey;

  useEffect(() => {
    if (!endKey) return;
    musicFlourish();
    const id = setTimeout(() => setCelebratedFor(endKey), CELEBRATE_MS);
    return () => clearTimeout(id);
  }, [endKey]);

  const counting = online && showScores && !matchOver;
  const waitingHost = counting && !isHost;

  useEffect(() => {
    if (!counting || !isHost) return;
    const id = setTimeout(onNext, UI.nextRoundMs);
    return () => clearTimeout(id);
  }, [counting, isHost, onNext]);

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

  if (!showScores) {
    const champ = state.players.find((p) => p.id === state.winnerId);
    return (
      <>
        <Fireworks seed={state.roundNo} />
        <div
          className="pointer-events-none absolute left-1/2 top-[26%] z-40 whitespace-nowrap text-center"
          style={{
            animationName: 'winnerPop',
            animationDuration: `${CELEBRATE_MS}ms`,
            animationTimingFunction: 'ease-out',
            animationFillMode: 'forwards',
          }}
        >
          <div
            className="display text-[clamp(22px,4.4vmin,44px)] text-[#FFD34D]"
            style={{ textShadow: '0 6px 0 #6B3F0A, 0 0 40px rgba(255,180,60,.7)' }}
          >
            {champ?.id === myId ? t('youWin') : t('winner', { name: champ?.name ?? '' })}
          </div>
        </div>
      </>
    );
  }

  const winner = state.players.find((p) => p.id === state.winnerId);
  const iWon = winner?.id === myId;

  const bench = queue.filter((q) => !state.players.some((p) => p.id === q.id));
  const ranked = [
    ...state.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      gain: state.lastScores[p.id] ?? 0,
      cards: p.hand.length,
      seated: true,
    })),
    ...bench.map((q) => ({
      id: q.id,
      name: q.name,
      score: roomScores[q.id] ?? 0,
      gain: 0,
      cards: 0,
      seated: false,
    })),
  ].sort(
    (a, b) =>
      (b.id === state.winnerId ? 1 : 0) - (a.id === state.winnerId ? 1 : 0) || b.score - a.score,
  );

  // Ghế AFK (người thật đang bị máy giữ hộ) bị server mời khỏi phòng lúc qua
  // ván — đội hình ván sau phải bỏ họ ra y như server sẽ làm.
  const liveSeats = online ? withoutAfkSeats(seats) : seats;
  const hasAfk = liveSeats.some((s, i) => s !== seats[i]);
  const nextSeats = seatsAfterRotation({
    seats: liveSeats,
    queue,
    hostId,
    consecutive: Object.fromEntries(state.players.map((p) => [p.id, p.consecutiveRounds])),
    maxSeats: state.rules.maxPlayers,
  });
  const hasBench = bench.length > 0;
  // Gọn khi màn thấp HOẶC bảng dài (Hỗn loạn tới 8 người + người xem).
  const c = shortScreen || ranked.length > 5;

  return (
    <motion.div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse 70% 60% at 50% 30%, #4A2A5E 0%, #2A1740 40%, #150B22 100%)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'conic-gradient(from 200deg at 50% 20%, rgba(255,211,77,.10) 0 30deg, transparent 30deg 90deg, rgba(255,211,77,.08) 90deg 120deg, transparent 120deg 180deg)',
        }}
      />

      <motion.div initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative text-center">
        <div className={`label tracking-[.3em] text-[#C6A6F0] ${c ? 'text-[10px]' : 'text-[13px]'}`}>
          {state.rules.targetScore > 0
            ? t('raceTo', { n: state.roundNo, target: state.rules.targetScore })
            : t('round', { n: state.roundNo })}
        </div>
        <div className={`display leading-tight text-[#FFD34D] ${c ? 'text-[20px]' : 'text-[30px]'}`} style={{ textShadow: '0 3px 0 #6B3F0A' }}>
          {matchOver ? t('matchWinner', { name: winner?.name ?? '' }) : iWon ? t('youWin') : t('winner', { name: winner?.name ?? '' })}
        </div>
      </motion.div>

      <div className={`scroll-y relative flex w-[min(94vw,520px)] flex-col pr-1 ${c ? 'mt-1.5 max-h-[58vh] gap-1' : 'mt-4 max-h-[50vh] gap-2'}`}>
        {ranked.map((p, i) => {
          const first = i === 0;
          return (
            <motion.div
              key={p.id}
              className={`flex flex-none items-center rounded-xl ${c ? 'gap-2 px-2.5 py-1' : 'gap-3 px-4 py-2'}`}
              style={
                first
                  ? {
                      background: 'linear-gradient(100deg,rgba(255,211,77,.9),rgba(255,158,44,.85))',
                      border: '2px solid #fff',
                      boxShadow: '0 6px 16px rgba(0,0,0,.4)',
                    }
                  : {
                      background: 'rgba(255,255,255,.07)',
                      border: '1px solid rgba(255,255,255,.16)',
                      opacity: p.seated ? 1 : 0.7,
                    }
              }
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 260, damping: 24 }}
            >
              <div className={`display ${c ? 'w-5 text-[14px]' : 'w-7 text-[20px]'}`} style={{ color: first ? '#2A1508' : '#C6A6F0' }}>
                {i + 1}
              </div>
              {(() => {
                const a = avatarOf(p.id);
                return (
                  <Avatar
                    name={p.name}
                    preset={a.preset ?? i}
                    avatarUrl={a.url}
                    self={p.id === myId}
                    size={c ? 26 : 38}
                    className={`seat__avatar !rounded-[8px] ${c ? '!h-[26px] !w-[26px]' : '!h-[38px] !w-[38px]'}`}
                  />
                );
              })()}
              <div className="min-w-0 flex-1">
                <div className={`display truncate leading-tight ${c ? 'text-[13px]' : 'text-[18px]'}`} style={{ color: first ? '#2A1508' : '#F3ECFA' }}>
                  {p.name}
                </div>
                <div className={`label leading-tight ${c ? 'text-[9px]' : 'text-[11px]'}`} style={{ color: first ? '#6A3A12' : '#A48AC8' }}>
                  {!p.seated ? t('spectating') : p.cards === 0 ? t('emptyHand') : t('handLeft', { n: p.cards })}
                </div>
              </div>
              <div className="text-right">
                <div className={`display leading-tight ${c ? 'text-[14px]' : 'text-[19px]'}`} style={{ color: first ? '#2A1508' : '#F3ECFA' }}>
                  {p.seated ? `+${p.gain}` : '—'}
                </div>
                <div className={`label leading-tight ${c ? 'text-[9px]' : 'text-[11px]'}`} style={{ color: first ? '#6A3A12' : '#A48AC8' }}>
                  {t('total', { n: p.score })}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {(hasBench || hasAfk) && !matchOver && (
        <div className={`relative flex max-w-[94vw] items-center gap-3 ${c ? 'mt-1.5' : 'mt-3'}`}>
          <span className="label shrink-0 text-[10px] tracking-[.2em] text-[#C6A6F0]">{t('nextLineup')}</span>
          <div className="flex gap-1.5 overflow-x-auto">
            {nextSeats.map((seat, i) => {
              const a = seat ? avatarOf(seat.id) : null;
              return (
                <div key={seat?.id ?? `empty-${i}`} className={`flex shrink-0 flex-col items-center gap-0.5 ${c ? 'w-[44px]' : 'w-[56px]'}`}>
                  <Avatar
                    name={seat?.name ?? ''}
                    preset={a?.preset ?? i}
                    avatarUrl={a?.url}
                    self={seat?.id === myId}
                    size={c ? 22 : 30}
                    className={`seat__avatar !rounded-[7px] ${c ? '!h-[22px] !w-[22px]' : '!h-[30px] !w-[30px]'}`}
                  />
                  <span className="label w-full truncate text-center text-[9px] text-[#C6A6F0]">
                    {seat?.name ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`relative flex gap-2.5 ${c ? 'mt-2' : 'mt-5'}`}>
        <button className={`btn !px-3 ${c ? '!py-1 !text-[12px]' : '!py-1.5 !text-[14px]'}`} onClick={onExit}>
          {t('backToMenu')}
        </button>
        {!matchOver && (
          <button
            className={`btn btn--gold !px-5 ${c ? '!py-1 !text-[13px]' : '!py-1.5 !text-[17px]'}`}
            disabled={counting}
            onClick={onNext}
          >
            {waitingHost && left <= 0
              ? t('waitHostNext')
              : counting
              ? t('nextRoundIn', { n: left })
              : t('nextRound')}
          </button>
        )}
      </div>
    </motion.div>
  );
}

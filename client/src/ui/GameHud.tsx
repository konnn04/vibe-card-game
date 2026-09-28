'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban } from 'lucide-react';
import { canPlay, colorsFor, hotkeyCard, RUSH_GRACE_MS } from '@u-no/game-engine';
import { useMatch } from '@/src/state/match';
import { useRoom } from '@/src/state/room';
import { useTurnHold, useTurnStage } from '@/src/state/useTurnHold';
import { playSfx } from '@/src/lib/audio';
import { ColorWheel, SwapPicker } from './Pickers';
import { SeatPointer } from './SeatPointer';
import { COLOR_HEX } from '@/src/three/atlas';
import { useSettings } from '@/src/lib/settings';
import { Avatar } from './Avatar';
import { DirectionBadge } from './DirectionBadge';
import { UI } from '@/src/config';
import { isTakenOver } from '@/src/lib/takeover';
import { useChat } from '@/src/state/chat';
import { ChatBubble, ChatTriggerButton } from './InGameChat';
import { FullscreenToggle } from './MobileGuard';
import { GameInfo } from './GameInfo';

function useIsMobileLandscape(): boolean {
  const [isMob, setIsMob] = useState(false);
  useEffect(() => {
    const check = () => {
      setIsMob(window.innerHeight < 560 && window.innerWidth > window.innerHeight);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMob;
}

function useSecondsLeft(turnKey: number, animating: boolean, seconds: number) {
  const [left, setLeft] = useState(seconds);
  const keyRef = useRef(turnKey);
  const animRef = useRef(animating);
  useEffect(() => { keyRef.current = turnKey; }, [turnKey]);
  useEffect(() => { animRef.current = animating; }, [animating]);

  useEffect(() => {
    let key = keyRef.current;
    let remainMs = seconds * 1000;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (keyRef.current !== key) {
        key = keyRef.current;
        remainMs = seconds * 1000;
      } else if (!animRef.current) {
        remainMs = Math.max(0, remainMs - dt);
      }
      setLeft(remainMs / 1000);
    }, UI.clockTickMs);
    return () => clearInterval(id);
  }, [seconds]);

  return left;
}

/**
 * Nút hành động trên thanh ngay trên quạt bài. To hơn hẳn bản cũ ở góc phải vì
 * đây là chỗ mắt đang nhìn lúc chọn bài, và có kèm PHÍM TẮT in ngay trên nút —
 * người chơi không phải nhớ, nhìn là biết.
 */
function ActionButton({
  children, onClick, tone, pulse, hotkey, isCompact,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'gold' | 'plain' | 'red';
  pulse?: boolean;
  hotkey: string;
  isCompact?: boolean;
}) {
  const skin = {
    gold: { background: 'linear-gradient(135deg, rgba(255,211,77,.32), rgba(26,10,16,.88))', borderColor: '#FFD34D', color: '#FFF3DA' },
    plain: { background: 'rgba(12,4,8,.72)', borderColor: 'rgba(255,215,140,.45)', color: '#FFE9C6' },
    red: { background: 'linear-gradient(135deg, rgba(226,59,46,.5), rgba(26,10,16,.88))', borderColor: '#E23B2E', color: '#FFE9C6' },
  }[tone];
  return (
    <button
      className={`label flex items-center gap-2 rounded-[26px] border-2 ${isCompact ? 'px-3.5 py-1 text-[13px]' : 'px-5 py-2 text-[17px]'
        } transition-all hover:scale-[1.04] active:scale-95 cursor-pointer ${pulse ? 'shadow-[0_0_26px_rgba(255,211,77,0.8)] ring-2 ring-[#FFD34D]' : 'shadow-[0_4px_18px_rgba(0,0,0,.55)]'
        }`}
      style={skin}
      onClick={onClick}
    >
      {children}
      {!isCompact && (
        <kbd
          className="grid h-[22px] min-w-[22px] place-items-center rounded-[6px] px-1 text-[12px] font-bold"
          style={{ background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,215,140,.4)' }}
        >
          {hotkey}
        </kbd>
      )}
    </button>
  );
}

/** Đồng hồ lượt = vòng conic quanh avatar (mock 03) — 1 phần tử, cập nhật 4 lần/giây. */
function TurnDial({ left, seconds, active, size = 86, children }: {
  left: number; seconds: number; active: boolean; size?: number; children: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, left / seconds)) * 100;
  const ring = active ? (left < 5 ? '#E23B2E' : '#FFD34D') : 'rgba(255,255,255,.35)';
  return (
    <div
      className="grid place-items-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${ring} 0 ${pct}%, rgba(0,0,0,.45) ${pct}% 100%)` }}
    >
      {children}
    </div>
  );
}

export function GameHud({ onExit, onSettings }: { onExit: () => void; onSettings: () => void }) {
  const isMobile = useIsMobileLandscape();
  const t = useTranslations('game');
  const tSettings = useTranslations('settings');
  const state = useMatch((s) => s.state);
  const myId = useMatch((s) => s.myId);
  const act = useMatch((s) => s.act);
  const fx = useMatch((s) => s.fx);
  const avatarPreset = useSettings((s) => s.avatarPreset);
  const animating = useTurnHold();
  const left = useSecondsLeft(state?.turnDeadline ?? 0, animating, state?.rules.turnSeconds ?? 20);
  const myChat = useChat((s) => s.messages[myId]);
  const tInfo = useTranslations('info');
  const [showInfo, setShowInfo] = useState(false);
  /**
   * Party — phiếu Chỉ tay CỦA MÌNH. State công khai che mọi phiếu (kể cả của
   * mình) thành '', nên nhớ ở đây để tô nút đã chọn. Gắn theo hạn bầu: sang
   * vòng bầu mới là tự trống.
   */
  const [myVote, setMyVote] = useState<{ deadline: number; target: string } | null>(null);

  const me = state?.players.find((p) => p.id === myId);
  /**
   * MÌNH CÓ ĐANG NGỒI BÀN KHÔNG.
   *
   * Phòng quá 4 người thì người thừa nằm ở HÀNG CHỜ và chỉ XEM cho tới lượt
   * được xoay vào ghế. Trước đây HUD vẫn dựng nguyên khối cá nhân (avatar lấy từ
   * cài đặt, tên rỗng, 0 lá) và vẫn cho bấm hô/bắt Ú Nồ — thao tác gửi lên thì
   * server từ chối, nhưng người xem không hiểu vì sao nút lại bấm được.
   */
  const seated = !!me;
  const roomCode = useRoom((s) => s.code);
  const [copiedCode, setCopiedCode] = useState(false);
  const queue = useRoom((s) => s.queue);
  const queuePos = queue.findIndex((q) => q.id === myId);
  const myIdx = state?.players.findIndex((p) => p.id === myId) ?? -1;
  const myTurn = !!state && state.turn === myIdx && state.phase === 'awaitPlay';
  const hasPlayable = !!me && !!state && me.hand.some((c) => canPlay(c, state));
  // KHOẢNH KHẮC NHẬN HIỆU ỨNG: animation (rút bài, cấm lượt, lật bài) đang
  // phát -> đồng hồ chưa chạy VÀ chưa được thao tác gì. Hết mới sang khoảnh
  // khắc CHƠI (đếm giờ + bấm bài/nút bình thường).
  /**
   * BẬN = đang phát animation HOẶC đang trong chuỗi rút bài dở.
   *
   * Phải có cả vế : giữa hai lá rút liên tiếp, hàng đợi animation cạn
   * trong khoảnh khắc nên  tụt về false và cả thanh nút loé lên một
   * nhịp — bấm vào thì engine từ chối ('drawing'), nhìn như game lỗi. Đang rút
   * dở thì người chơi không được làm gì hết, nút phải im.
   */
  // BẬN = đang phát animation HOẶC đang trong chuỗi rút bài dở.
  // Phải có cả vế drawRun: giữa hai lá rút liên tiếp, hàng đợi animation cạn
  // trong khoảnh khắc nên animating tụt về false và cả thanh nút loé lên một
  // nhịp — bấm vào thì engine từ chối ('drawing'), nhìn như game lỗi. Đang rút
  // dở thì người chơi không được làm gì, nút phải im.
  const holding = animating || !!state?.drawRun;
  const stage = useTurnStage();
  const canDraw = myTurn && !holding && !!state && (!!state.pending || !state.drawnThisTurn);
  // Bắt lỗi Wild +N: chuỗi phạt đang treo do một lá Wild Draw tạo ra và không
  // phải do chính mình đánh (engine đã kiểm lại, đây chỉ là để ẩn/hiện nút).
  const pend = state?.pending;
  const canChallenge = myTurn && !holding && !!state && state.rules.challenge
    && !!pend && pend.value !== 'drawColor' && !!pend.wild4 && pend.wild4.by !== myId;
  const canPass = myTurn && !holding && !!state && state.drawnThisTurn &&
    // Luật nhà "bắt buộc đánh": còn lá đánh được thì nút Bỏ lượt bị khoá.
    !(state.rules.forcePlay && hasPlayable);

  // Lá mà phím [S] sẽ đánh (đánh chen, hoặc chồng phạt) — tra từ engine để HUD
  // và nhãn [S] trên bàn 3D không bao giờ chỉ hai lá khác nhau.
  const sCard = !holding && state ? hotkeyCard(state, myId) : null;
  const isJump = !!sCard && !myTurn;
  const playS = () => { if (sCard) act({ type: 'PLAY', playerId: myId, cardId: sCard.id }); };

  const needDrawPrompt = myTurn && (!hasPlayable || !!state?.pending) && canDraw;
  const isChoosing =
    (state?.phase === 'awaitColor' && state?.resume?.playerId === myId) ||
    (state?.phase === 'awaitSwapTarget' && state?.resume?.playerId === myId) ||
    (state?.phase === 'awaitChain' && state?.resume?.playerId === myId) ||
    (state?.phase === 'awaitVote' && !!state?.vote);
  const [callingRush, setCallingRush] = useState(false);
  useEffect(() => {
    if (!me || me.hand.length !== 1 || me.calledRush) {
      setCallingRush(false);
    }
  }, [me?.hand.length, me?.calledRush]);

  const canCallRush = !!me && me.hand.length === 1 && !me.calledRush && !callingRush && !isChoosing;

  const handleCallRush = () => {
    if (!canCallRush || callingRush) return;
    setCallingRush(true);
    playSfx('rush');
    act({ type: 'CALL_RUSH', playerId: myId });
  };

  // Cảnh báo sắp nổ (Mercy / Vỡ trận): khi luật blowUp bật, còn <= 3 lá là tới giới hạn hoặc pending sắp nổ
  const blowUp = !!state?.rules.blowUp;
  const blowUpAt = state?.rules.blowUpAt ?? 36;
  const handCount = me?.hand.length ?? 0;
  const remainingToLimit = blowUpAt - handCount;
  const pendingAmount = (myTurn && state?.pending && state.pending.value !== 'drawColor') ? state.pending.amount : 0;
  const willExplodeIfDraw = pendingAmount > 0 && (handCount + pendingAmount > blowUpAt);
  const isNearBlowUp = seated && !me?.eliminated && blowUp && (remainingToLimit <= 3 || willExplodeIfDraw);
  const isCriticalBlowUp = isNearBlowUp && (remainingToLimit <= 1 || willExplodeIfDraw);

  /**
   * Chỉ được BẮT sau khi hết ân hạn RUSH_GRACE_MS — trong khoảng đó chỉ chủ
   * nhân được hô. Engine cũng từ chối bắt sớm, đây chỉ là để nút khỏi hiện ra
   * trêu ngươi. `graceTick` ép render lại đúng lúc hết hạn.
   */
  const rushOpenedAt = state?.rushWindow?.openedAt ?? 0;
  const [graceDoneFor, setGraceDoneFor] = useState(0);
  useEffect(() => {
    if (!rushOpenedAt) return;
    // Đếm từ lúc CLIENT NHÌN THẤY cửa sổ, không trừ theo mốc epoch của server —
    // cùng lý do với đồng hồ lượt: hai đồng hồ không bằng nhau. Độ trễ mạng làm
    // client hết ân hạn MUỘN hơn server một chút, và muộn thì AN TOÀN: engine
    // vẫn từ chối bắt sớm, còn nút hiện trễ vài trăm ms thì không ai chết.
    const id = setTimeout(() => setGraceDoneFor(rushOpenedAt), RUSH_GRACE_MS);
    return () => clearTimeout(id);
  }, [rushOpenedAt]);
  // Suy ra, không reset bằng effect: cửa sổ mới mở thì openedAt đổi nên
  // graceOver tự về false, khỏi cần setState đồng bộ trong thân effect.
  const graceOver = !!rushOpenedAt && graceDoneFor === rushOpenedAt;

  const catchableId = state?.rushWindow && state.rushWindow.playerId !== myId && graceOver
    ? state.rushWindow.playerId : null;

  /**
   * PHÍM TẮT. Chỉ bắn đúng hành động đang KHẢ DỤNG (cùng điều kiện với nút),
   * nên bấm nhầm phím không bao giờ gửi action rác lên server.
   * Bỏ qua khi đang gõ trong ô nhập (phòng chờ, chat) hoặc đang giữ Ctrl/Alt/Meta.
   */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.repeat) return;
      if (!seated) return; // đang xem, không có gì để thao tác
      const el = ev.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;

      /**
       * Khớp phím theo CẢ HAI đường, chỉ cần trúng một:
       *  - `ev.key` viết thường: đúng ký tự người chơi gõ.
       *  - `ev.code`: VỊ TRÍ phím trên bàn phím, không phụ thuộc Shift, CapsLock,
       *    bộ gõ tiếng Việt hay layout. Đây mới là đường sống sót khi bật Telex:
       *    lúc đó `ev.key` có thể về 'Process' hoặc một ký tự đã ghép dấu, và
       *    phím tắt im re dù người chơi bấm đúng phím.
       */
      const key = ev.key.toLowerCase();
      const is = (letter: string) => key === letter || ev.code === `Key${letter.toUpperCase()}`;
      const isSpace = key === ' ' || ev.code === 'Space';

      const run = (fn: () => void) => { ev.preventDefault(); fn(); };

      // Phím tắt 1..6 tương ứng emoji thứ 1..6
      const matchNum = ev.code.match(/^(?:Digit|Numpad)([1-6])$/);
      const num = matchNum ? parseInt(matchNum[1], 10) : parseInt(key, 10);
      if (!isNaN(num) && num >= 1 && num <= EMOTES.length) {
        return run(() => act({ type: 'EMOTE', playerId: myId, emote: EMOTES[num - 1] }));
      }

      if (is('e') && canDraw) return run(() => act({ type: 'DRAW', playerId: myId }));
      if (is('s') && sCard) return run(playS);
      if (is('q') && canPass) return run(() => act({ type: 'PASS', playerId: myId }));
      if (is('d') && canChallenge) return run(() => act({ type: 'CHALLENGE', playerId: myId }));
      // MỘT phím Space lo cả hô lẫn bắt: mình còn 1 lá thì là hô, không thì là
      // bắt người đang thiếu tiếng hô. Không bao giờ mập mờ vì 2 điều kiện loại
      // trừ nhau (không thể vừa là chủ cửa sổ vừa là người đi bắt).
      if (isSpace || is('w')) {
        if (canCallRush) return run(handleCallRush);
        if (catchableId) return run(() => act({ type: 'CATCH_RUSH', playerId: myId, targetId: catchableId }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * TỰ RÚT khi bị chồng phạt mà trên tay không có lá chống được — đỡ bắt người
   * chơi bấm Rút trong tình huống vốn chẳng còn lựa chọn nào.
   *
   * NHƯNG KHÔNG tự rút khi còn quyền BẮT LỖI +4: lúc đó vẫn còn đúng một lựa
   * chọn thật, và là lựa chọn đáng giá (bắt trúng thì kẻ đánh sai tự ăn cả
   * chuỗi, mình giữ nguyên lượt). Tự rút mất là cướp mất quyền đó. Hết giờ
   * lượt thì engine/server tự xử, không sợ kẹt.
   */
  useEffect(() => {
    if (!myTurn || holding || !state?.pending || hasPlayable || state.drawnThisTurn) return;
    if (canChallenge) return;
    const id = setTimeout(() => act({ type: 'DRAW', playerId: myId }), UI.autoDrawMs);
    return () => clearTimeout(id);
  }, [myTurn, holding, state?.pending, state?.drawnThisTurn, hasPlayable, canChallenge, act, myId]);

  if (!state || state.phase === 'roundEnd' || state.phase === 'matchEnd') return null;
  const current = state.players[state.turn];
  // No Mercy — bị Color Roulette nhắm vào cũng chọn màu bằng bánh xe (CHOOSE_COLOR).
  const needRoulette = state.phase === 'awaitRoulette' && state.resume?.playerId === myId;
  const needColor = (state.phase === 'awaitColor' && state.resume?.playerId === myId) || needRoulette;
  const needSwap = state.phase === 'awaitSwapTarget' && state.resume?.playerId === myId;
  const catchable = state.rushWindow && state.rushWindow.playerId !== myId
    ? state.players.find((p) => p.id === state.rushWindow!.playerId)
    : null;
  const secondsLeft = Math.ceil(left);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Viền đỏ nhẹ cảnh báo sắp nổ (Mercy / Vỡ trận) */}
      <AnimatePresence>
        {isNearBlowUp && (
          <motion.div
            key="danger-vignette"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none fixed inset-0 z-10"
            style={{
              boxShadow: isCriticalBlowUp
                ? 'inset 0 0 50px rgba(239,68,68,0.45), inset 0 0 100px rgba(220,38,38,0.22)'
                : 'inset 0 0 35px rgba(239,68,68,0.3), inset 0 0 70px rgba(220,38,38,0.12)',
              animation: isCriticalBlowUp ? 'dangerPulseFast 1.3s ease-in-out infinite' : 'dangerPulse 2.2s ease-in-out infinite',
            }}
          />
        )}
      </AnimatePresence>

      <div className={`pointer-events-auto absolute ${isMobile ? 'left-2.5 top-2 gap-1.5' : 'left-6 top-6 gap-2'} flex items-center`}>
        <button className={`btn btn--ghost ${isMobile ? '!py-1 !px-2.5 !text-[13px]' : '!py-2 !text-[17px]'}`} onClick={onExit}>‹ {t('backToMenu')}</button>
        <button
          className={`grid place-items-center rounded-full text-[#FFE2A8] ${isMobile ? 'h-[30px] w-[30px] text-[15px]' : 'h-[38px] w-[38px] text-[18px]'}`}
          style={{ background: 'rgba(20,8,12,.55)', border: '2px solid rgba(255,215,140,.5)' }}
          onClick={() => { playSfx('click'); onSettings(); }}
          aria-label={tSettings('title')}
          title={tSettings('title')}
        >
          ⚙
        </button>
        <button
          className={`grid place-items-center rounded-full font-serif font-bold italic text-[#FFE2A8] ${isMobile ? 'h-[30px] w-[30px] text-[15px]' : 'h-[38px] w-[38px] text-[18px]'}`}
          style={{ background: 'rgba(20,8,12,.55)', border: '2px solid rgba(255,215,140,.5)' }}
          onClick={() => { playSfx('click'); setShowInfo(true); }}
          aria-label={tInfo('open')}
          title={tInfo('open')}
        >
          i
        </button>
        <FullscreenToggle />
        {roomCode && (
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-[10px] border ${isMobile ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[13px]'} font-mono font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow`}
            style={{
              background: 'rgba(20,8,12,.65)',
              borderColor: 'rgba(255,215,140,.5)',
              color: '#FFD34D',
            }}
            onClick={() => {
              playSfx('click');
              const url = typeof window !== 'undefined' ? `${window.location.origin}?room=${roomCode}` : roomCode;
              navigator.clipboard?.writeText(url);
              setCopiedCode(true);
              setTimeout(() => setCopiedCode(false), 2000);
            }}
            title="Nhấp để sao chép liên kết mời bạn bè"
          >
            <span>{copiedCode ? 'Copied!' : roomCode}</span>
          </button>
        )}
        {/* Party — vòng phụ 3 lá con: màu phải đánh + số lá đang dồn. */}
        {state.pileUp && (
          <motion.span
            initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            className={`label rounded-[10px] ${isMobile ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[13px]'} text-white`}
            style={{ background: COLOR_HEX[state.pileUp.color], boxShadow: '0 0 0 2px rgba(255,255,255,.7)' }}
          >
            {t('pileUpBadge', { n: state.pileUp.cards.length })}
          </motion.span>
        )}
        {/* Party — cặp đang bị Cọng xích. */}
        {state.chain && (
          <span
            className={`label rounded-[10px] ${isMobile ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[13px]'} text-[#FFF3DA]`}
            style={{ background: 'rgba(20,8,12,.7)', border: '1px solid rgba(255,215,140,.5)' }}
          >
            🔗 {state.players.find((p) => p.id === state.chain!.a)?.name} · {state.players.find((p) => p.id === state.chain!.b)?.name}
          </span>
        )}
        {state.pending && (
          <motion.span
            initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            className={`label rounded-[10px] bg-[color:var(--c-red)] ${isMobile ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[13px]'} text-white`}
          >
            {state.pending.value === 'drawColor'
              ? t('stackColor', { color: WHEEL_LABEL[state.pending.color] ?? state.pending.color })
              : t('stack', { n: state.pending.amount })}
          </motion.span>
        )}
      </div>

      <div className={`absolute ${isMobile ? 'right-2.5 top-2.5 gap-1' : 'right-6 top-6 gap-1.5'} flex flex-col items-end`}>
        {state.players.map((p) => (
          <div
            key={p.id}
            className={`display rounded-lg ${isMobile ? 'px-2 py-0.5 text-[12px]' : 'px-3 py-1 text-[17px]'}`}
            style={{
              background: p.id === myId ? 'linear-gradient(90deg,#FFB534,#FF8A2B)' : 'rgba(12,4,8,.55)',
              color: p.id === myId ? '#2A1508' : '#FFF3DA',
              border: '1px solid rgba(255,215,140,.3)',
            }}
          >
            {isTakenOver(p) && (
              <span
                className="mr-1 rounded px-1 text-[9px] font-bold align-middle"
                style={{ background: 'rgba(226,72,59,.9)', color: '#fff' }}
                title={t('aiTookOver', { name: p.name })}
              >
                AI
              </span>
            )}
            {p.name} · {p.score}
          </div>
        ))}
      </div>

      <div className={`absolute left-1/2 ${isMobile ? 'top-3 scale-90' : 'top-[84px]'} flex -translate-x-1/2 items-center gap-2`}>
        <DirectionBadge direction={state.direction} />
        <motion.div
          key={`${current?.id}-${state.turn}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className={`label rounded-[20px] border ${isMobile ? 'px-3 py-1 text-[12px]' : 'px-5 py-1.5 text-[15px]'}`}
            style={{
              background: 'rgba(12,4,8,.6)',
              borderColor: myTurn ? '#FFD34D' : 'rgba(255,215,140,.45)',
              color: myTurn ? '#FFD34D' : '#FFF3DA',
            }}
          >
            {/* 3 giai đoạn của lượt: trước đánh (nhận hiệu ứng) / trong đánh
                (đếm giờ) / sau đánh (animation ra bài). 2 giai đoạn ngoài rìa
                KHÔNG đếm giờ nên hiện nhãn riêng thay vì số giây đứng im. */}
            {stage === 'effect'
              ? t('stageEffect')
              : stage === 'play'
                ? t('stagePlaying')
                : `${myTurn ? t('yourTurn') : t('waiting', { name: current?.name ?? '' })} · ${secondsLeft}s`}
          </div>
        </motion.div>
      </div>

      {/* Tip cảnh báo sắp nổ (Mercy / Vỡ trận) */}
      <AnimatePresence>
        {isNearBlowUp && (
          <motion.div
            key="danger-tip"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${isMobile ? 'top-[44px]' : 'top-[132px]'} z-20 flex items-center gap-2 rounded-full border px-3.5 py-1 backdrop-blur-md shadow-xl`}
            style={{
              background: 'linear-gradient(135deg, rgba(65, 10, 14, 0.92), rgba(28, 4, 8, 0.95))',
              borderColor: isCriticalBlowUp ? 'rgba(239, 68, 68, 0.85)' : 'rgba(239, 68, 68, 0.55)',
              boxShadow: isCriticalBlowUp
                ? '0 6px 20px rgba(0,0,0,0.6), 0 0 20px rgba(239,68,68,0.45)'
                : '0 6px 18px rgba(0,0,0,0.5), 0 0 12px rgba(239,68,68,0.25)',
            }}
          >
            <span className="text-[13px] md:text-[15px] animate-pulse">⚠️</span>
            <span className={`display font-semibold tracking-wide ${isMobile ? 'text-[12px]' : 'text-[14px]'} text-[#FEE2E2]`}>
              {willExplodeIfDraw
                ? t('nearBlowUpPending', { n: pendingAmount })
                : remainingToLimit <= 0
                  ? t('atBlowUpLimit', { limit: blowUpAt })
                  : t('nearBlowUpTip', { count: handCount, limit: blowUpAt, remaining: remainingToLimit })}
            </span>
            <span
              className={`label rounded-full px-2 py-0.5 ${isMobile ? 'text-[10px]' : 'text-[11px]'} font-bold text-white shadow`}
              style={{ background: 'linear-gradient(90deg, #DC2626, #991B1B)' }}
            >
              {willExplodeIfDraw
                ? `+${pendingAmount} 💥`
                : remainingToLimit <= 0
                  ? t('nextCardExplodes')
                  : t('cardsLeftToLimit', { n: remainingToLimit })}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD của mình: vòng đếm ngược quanh avatar — gọn để không lấn quạt bài */}
      {seated && (
        <div className={`absolute ${isMobile ? 'bottom-2 left-2.5 gap-1.5' : 'bottom-5 left-5 gap-2'} flex items-center`}>
          {myChat && (
            <div className="pointer-events-none absolute -top-12 left-2 z-30 whitespace-nowrap">
              <ChatBubble message={myChat.message} />
            </div>
          )}
          <TurnDial left={left} seconds={state.rules.turnSeconds} active={myTurn} size={isMobile ? 44 : 64}>
            <div className="relative">
              {(() => {
                const mine = fx.filter((f) => f.kind === 'emote' && f.payload.t === 'emote' && f.payload.playerId === myId);
                const last = mine[mine.length - 1];
                if (!last || last.payload.t !== 'emote') return null;
                return (
                  <div
                    key={last.id}
                    className={`pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 ${isMobile ? 'text-[18px]' : 'text-[26px]'}`}
                    style={{ animation: 'emotePop 2s ease-out forwards', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.6))' }}
                  >
                    {last.payload.emote}
                  </div>
                );
              })()}
              {(() => {
                const banned = fx.find((f) =>
                  (f.kind === 'skip' && f.payload.t === 'skip' && f.payload.playerId === myId) ||
                  (f.kind === 'skipAll' && f.actorId !== myId),
                );
                if (!banned) return null;
                return (
                  <div
                    key={banned.id}
                    className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
                    style={{ animation: 'banPop 1.2s ease-out forwards' }}
                  >
                    <Ban size={isMobile ? 24 : 34} strokeWidth={3} color="#fff" style={{ filter: 'drop-shadow(0 0 6px rgba(226,59,46,.9)) drop-shadow(0 2px 4px rgba(0,0,0,.7))' }} />
                  </div>
                );
              })()}
              <Avatar
                name={me?.name ?? ''}
                preset={avatarPreset}
                size={isMobile ? (myTurn ? 38 : 34) : (myTurn ? 58 : 52)}
                self
                className={`seat__avatar !rounded-full ${myTurn ? 'avatar--turn' : ''}`}
              />
            </div>
          </TurnDial>
          <div>
            <div
              className={`display inline-block max-w-[140px] truncate rounded-[6px] align-bottom ${isMobile ? 'px-1.5 py-0.5 text-[12px]' : 'px-2.5 py-0.5 text-[15px]'}`}
              style={{ background: 'linear-gradient(90deg,#FFB534,#FF8A2B)', color: '#2A1508' }}
            >
              {me?.name}
            </div>
            <div className={`label ${isMobile ? 'mt-0.5 text-[10px]' : 'mt-1 text-[12px]'} ${isNearBlowUp ? '!text-red-400 font-bold' : 'text-[#FFE0B3]'}`}>
              {t('cards', { n: me?.hand.length ?? 0 })} {isNearBlowUp && '⚠️'} · {me?.score ?? 0}
            </div>
          </div>
          <EmotePicker size={isMobile ? 28 : 36} onPick={(emote) => act({ type: 'EMOTE', playerId: myId, emote })} />
          <ChatTriggerButton size={isMobile ? 28 : 36} />
        </div>
      )}

      {me?.eliminated && (
        <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${isMobile ? 'bottom-3' : 'bottom-10'}`}>
          <div
            className={`label rounded-[14px] ${isMobile ? 'px-3 py-1.5 text-[12px]' : 'px-5 py-3 text-[15px]'}`}
            style={{ background: 'rgba(40,8,4,.8)', border: '1px solid rgba(255,132,16,.6)', color: '#FFD34D' }}
          >
            {t('eliminatedBanner')}
          </div>
        </div>
      )}

      {!seated && (
        <div className={`pointer-events-auto absolute ${isMobile ? 'bottom-2.5 left-3 gap-2' : 'bottom-8 left-8 gap-3'} flex items-center`}>
          <div
            className={`label rounded-[14px] ${isMobile ? 'px-3 py-1.5 text-[12px]' : 'px-5 py-3 text-[14px]'} tracking-[.18em]`}
            style={{ background: 'rgba(12,4,8,.66)', border: '1px solid rgba(255,215,140,.35)', color: '#FFE0B3' }}
          >
            {t('spectating')}
            <div className="label-sm mt-1 normal-case tracking-[.1em] opacity-80">
              {queuePos >= 0 ? t('queuePos', { n: queuePos + 1 }) : t('queueWait')}
            </div>
          </div>
          <ChatTriggerButton size={isMobile ? 32 : 44} />
        </div>
      )}

      {/* RUSH + rút bài: dồn về góc phải để không đè lên quạt bài */}
      {seated && (
        <div className={`pointer-events-auto absolute ${isMobile ? 'bottom-2.5 right-3 gap-2' : 'bottom-8 right-9 gap-3'} flex flex-col items-center`}>
          <AnimatePresence>
            {canCallRush && (
              <motion.button
                key="rush"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleCallRush}
                className={`display grid place-items-center rounded-full ${isMobile ? 'text-[22px]' : 'text-[38px]'}`}
                style={{
                  width: isMobile ? 74 : 132,
                  height: isMobile ? 74 : 132,
                  background: 'radial-gradient(circle at 40% 34%,#FFE27A,#F0A21B 62%,#B45A05)',
                  border: isMobile ? '3px solid #fff' : '6px solid #fff',
                  boxShadow: '0 18px 36px rgba(0,0,0,.5), 0 0 44px rgba(255,190,80,.6)',
                  color: '#5A2A05',
                  animation: 'pulseGlow 2.2s ease-in-out infinite',
                }}
              >
                <span className="grid place-items-center leading-none">
                  {t('rush')}
                  {!isMobile && (
                    <kbd className="label mt-1 rounded-[6px] px-1.5 text-[11px] font-bold" style={{ background: 'rgba(0,0,0,.3)', color: '#5A2A05' }}>
                      Space
                    </kbd>
                  )}
                </span>
              </motion.button>
            )}
            {catchable && graceOver && (
              <motion.button
                key="catch"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`btn ${isMobile ? '!py-1.5 !px-3 !text-[13px]' : ''}`}
                style={{ background: 'linear-gradient(#E23B2E,#A5231A)', borderColor: '#FFD34D', color: '#fff' }}
                onClick={() => act({ type: 'CATCH_RUSH', playerId: myId, targetId: catchable.id })}
              >
                {t('catch', { name: catchable.name })}
                {!isMobile && (
                  <kbd className="label ml-2 rounded-[6px] px-1.5 text-[11px] font-bold" style={{ background: 'rgba(0,0,0,.35)' }}>Space</kbd>
                )}
              </motion.button>
            )}
          </AnimatePresence>

        </div>
      )}

      {/* THANH HÀNH ĐỘNG — nằm NGAY TRÊN quạt bài của mình, đúng nơi mắt đang
          nhìn khi chọn bài (trước đây dồn ở góc phải, xa tầm mắt). Nút chỉ
          XUẤT HIỆN khi thật sự dùng được — không hiện nút mờ để bấm không ăn,
          vì đó chính là kiểu "bấm mà game im re" gây hiểu nhầm treo máy. */}
      {seated && (canDraw || canPass || canChallenge || !!sCard) && (
        <div
          className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-2"
          style={{ bottom: isMobile ? 126 : 330 }}
        >
          {canDraw && (
            <ActionButton
              tone={needDrawPrompt ? 'gold' : 'plain'}
              pulse={needDrawPrompt}
              hotkey="E"
              isCompact={isMobile}
              onClick={() => act({ type: 'DRAW', playerId: myId })}
            >
              {/* Vòng 3 lá con: "rút" nghĩa là ôm cả chồng phụ. */}
              {state.pileUp ? t('takePile', { n: state.pileUp.cards.length }) : t('draw')}
            </ActionButton>
          )}
          {!!sCard && (
            <ActionButton tone='gold' pulse hotkey="S" isCompact={isMobile} onClick={playS}>
              {isJump ? t('jumpIn') : t('stackUp')}
            </ActionButton>
          )}
          {canPass && (
            <ActionButton tone='plain' hotkey="Q" isCompact={isMobile} onClick={() => act({ type: 'PASS', playerId: myId })}>
              {t('pass')}
            </ActionButton>
          )}
          {canChallenge && (
            <ActionButton tone='red' hotkey="D" isCompact={isMobile} onClick={() => act({ type: 'CHALLENGE', playerId: myId })}>
              {t('challenge')}
            </ActionButton>
          )}
        </div>
      )}

      <ColorWheel
        open={needColor}
        // Chọn màu cho lá Wild vừa đánh (đang nằm trên đỉnh đống): Hỗn loạn
        // chỉ cho gọi màu cùng hệ với lá đó (Light hoặc Dark).
        colors={colorsFor(state, state.discard[state.discard.length - 1])}
        title={needRoulette ? t('pickRoulette') : undefined}
        seconds={secondsLeft}
        onPick={(c) => act({ type: 'CHOOSE_COLOR', playerId: myId, color: c })}
      />
      {/* Luật 7: chỉ tay vào người muốn đổi bài (không gồm người đã bị loại). */}
      <SeatPointer
        open={needSwap}
        title={t('pickSwap')}
        deadline={state.turnDeadline}
        targets={state.players
          .filter((p) => p.id !== myId && !p.eliminated)
          .map((p) => ({ id: p.id, name: p.name, sub: t('cards', { n: p.hand.length }) }))}
        onPick={(id) => act({ type: 'SWAP_TARGET', playerId: myId, targetId: id })}
      />
      {/* Party — bầu Chỉ tay: cả bàn cùng chỉ tay (bầu kín), đổi được tới khi hết giờ. */}
      <SeatPointer
        open={state.phase === 'awaitVote' && !!state.vote && seated && !me?.eliminated}
        title={t('voteTitle')}
        subtitle={t('voteSub')}
        deadline={state.vote?.deadline}
        progress={(() => {
          const done = Object.keys(state.vote?.votes ?? {}).length;
          const total = state.players.filter((p) => !p.eliminated).length;
          return { done, total, label: t('voteProgress', { n: done, total }) };
        })()}
        targets={state.players
          .filter((p) => p.id !== myId && !p.eliminated)
          .map((p) => ({ id: p.id, name: p.name, sub: t('cards', { n: p.hand.length }) }))}
        picked={myVote && myVote.deadline === state.vote?.deadline ? [myVote.target] : []}
        onPick={(id) => {
          setMyVote({ deadline: state.vote?.deadline ?? 0, target: id });
          act({ type: 'VOTE', playerId: myId, targetId: id });
        }}
      />
      {/* Party — Cọng xích: chỉ lần lượt vào 2 người (có thể gồm chính mình). */}
      <SeatPointer
        key={state.resume?.kind === 'chain' ? state.resume.cardId : 'none'}
        open={state.phase === 'awaitChain' && state.resume?.playerId === myId}
        title={t('chainTitle')}
        subtitle={t('chainSub')}
        deadline={state.turnDeadline}
        picks={2}
        targets={state.players
          .filter((p) => !p.eliminated)
          .map((p) => ({ id: p.id, name: p.id === myId ? t('you') : p.name, sub: t('cards', { n: p.hand.length }) }))}
        onConfirm={([a, b]) => act({ type: 'CHAIN', playerId: myId, a, b })}
      />
      {showInfo && (
        <GameInfo rules={state.rules} deckType={state.deckType} onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}

const EMOTES = ['❤️', '😂', '😢', '😮', '😡', '👏'];

/**
 * Nút thả cảm xúc: hover hiện dải icon (tim/haha/khóc/ngạc nhiên/giận/vỗ tay),
 * bấm 1 icon gửi luôn (act({type:'EMOTE'}) — event thuần hiển thị, không đổi
 * luật ván đấu, xem engine.ts case 'EMOTE'). Hiển thị ở SeatHuds (Scene.tsx)
 * cho mọi người chơi, kể cả online qua room action route có sẵn.
 */
function EmotePicker({ onPick, size = 44 }: { onPick: (emote: string) => void; size?: number }) {
  const t = useTranslations('settings');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const iconSize = size <= 36 ? 'text-[15px]' : 'text-[20px]';

  /**
   * Đóng khi bấm ra ngoài — cần cho cảm ứng, nơi không có `mouseleave` nên nếu
   * chỉ dựa vào rê chuột thì dải icon mở ra là không đóng lại được.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (!box.current?.contains(ev.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div
      ref={box}
      className="pointer-events-auto relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`grid place-items-center rounded-full border ${iconSize} transition-transform hover:scale-110`}
        style={{ width: size, height: size, background: 'rgba(12,4,8,.6)', borderColor: 'rgba(255,215,140,.45)' }}
        // MỞ chứ không TOGGLE: rê chuột tới đã mở sẵn rồi, nếu bấm lại toggle
        // thì cú bấm đầu tiên lại ĐÓNG dải icon — đúng lỗi "mỗi lần bấm nó lại
        // ẩn đi". Đóng đã có: chọn icon, rời chuột, hoặc bấm ra ngoài.
        onClick={() => setOpen(true)}
        aria-label={t('emotePick')}
      >
        🙂
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            className="absolute left-0 flex gap-1 rounded-2xl border p-1.5"
            // Dải cảm xúc nổi ngay trên nút, bám theo cỡ nút.
            style={{ bottom: size + 8, background: 'rgba(12,4,8,.85)', borderColor: 'rgba(255,215,140,.45)' }}
          >
            {EMOTES.map((e, idx) => (
              <button
                key={e}
                className="group relative grid h-9 w-9 place-items-center rounded-xl text-[19px] transition-transform hover:scale-125 cursor-pointer"
                onClick={() => { onPick(e); setOpen(false); }}
                title={`Phím ${idx + 1}`}
              >
                <span>{e}</span>
                <span className="absolute -bottom-1 -right-0.5 rounded px-1 text-[9px] font-mono font-bold bg-black/80 text-amber-300/90 leading-none pointer-events-none border border-amber-300/30">
                  {idx + 1}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const WHEEL_LABEL: Record<string, string> = {
  red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue',
  pink: 'Pink', orange: 'Orange', teal: 'Teal', purple: 'Purple',
};

export { ColorWheel, SwapPicker };


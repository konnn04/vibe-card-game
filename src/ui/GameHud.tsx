'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban } from 'lucide-react';
import { canPlay, colorsOf, hotkeyCard, RUSH_GRACE_MS, type CardColor } from '@u-no/game-engine';
import { useMatch } from '@/src/state/match';
import { useRoom } from '@/src/state/room';
import { useTurnHold, useTurnStage } from '@/src/state/useTurnHold';
import { COLOR_HEX } from '@/src/three/atlas';
import { playSfx } from '@/src/lib/audio';
import { useSettings } from '@/src/lib/settings';
import { Avatar } from './Avatar';
import { DirectionBadge } from './DirectionBadge';
import { UI } from '@/src/config';
import { isTakenOver } from '@/src/lib/takeover';

/**
 * Giây còn lại của lượt — ĐẾM CỤC BỘ, không so với mốc thời gian của server.
 *
 * LỖI ĐÃ SỬA (đồng hồ không chạy khi chơi nhiều người): bản cũ lấy
 * `turnDeadline` — một mốc epoch do SERVER sinh ra — rồi trừ đi giờ của MÁY
 * NGƯỜI CHƠI. Hai đồng hồ đó không bao giờ bằng nhau; mà khi Firebase realtime
 * chưa cấu hình thì còn không có cả offset để bù, nên số giây ra âm hoặc đứng
 * cứng. Chơi một mình với máy thì không lộ vì engine chạy ngay trong tab.
 *
 * Ở đây `turnKey` (chính là turnDeadline) CHỈ dùng làm TÍN HIỆU ĐỔI LƯỢT, không
 * dùng giá trị: hễ nó đổi là nạp lại đủ `seconds` rồi tự trừ dần theo đồng hồ
 * của chính máy này. Hoàn toàn miễn nhiễm lệch giờ.
 *
 * Đây chỉ là phần HIỂN THỊ. Quyền phán "hết giờ" vẫn thuộc về server (xem
 * checkAndScheduleRoom trong src/server/room.ts) — client đếm sai cũng không
 * đổi được kết quả ván.
 *
 * Đang phát animation thì ĐỨNG YÊN, đúng mô hình 3 giai đoạn: chỉ TURN_ACTION
 * mới bị tính giờ.
 */
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
  children, onClick, tone, pulse, hotkey,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'gold' | 'plain' | 'red';
  pulse?: boolean;
  hotkey: string;
}) {
  const skin = {
    gold: { background: 'linear-gradient(135deg, rgba(255,211,77,.32), rgba(26,10,16,.88))', borderColor: '#FFD34D', color: '#FFF3DA' },
    plain: { background: 'rgba(12,4,8,.72)', borderColor: 'rgba(255,215,140,.45)', color: '#FFE9C6' },
    red: { background: 'linear-gradient(135deg, rgba(226,59,46,.5), rgba(26,10,16,.88))', borderColor: '#E23B2E', color: '#FFE9C6' },
  }[tone];
  return (
    <button
      className={`label flex items-center gap-2.5 rounded-[26px] border-2 px-5 py-2 text-[17px] transition-all hover:scale-[1.04] ${
        pulse ? 'shadow-[0_0_26px_rgba(255,211,77,0.8)] ring-2 ring-[#FFD34D]' : 'shadow-[0_4px_18px_rgba(0,0,0,.55)]'
      }`}
      style={skin}
      onClick={onClick}
    >
      {children}
      <kbd
        className="grid h-[22px] min-w-[22px] place-items-center rounded-[6px] px-1 text-[12px] font-bold"
        style={{ background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,215,140,.4)' }}
      >
        {hotkey}
      </kbd>
    </button>
  );
}

/** Đồng hồ lượt = vòng conic quanh avatar (mock 03) — 1 phần tử, cập nhật 4 lần/giây. */
function TurnDial({ left, seconds, active, children }: {
  left: number; seconds: number; active: boolean; children: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(1, left / seconds)) * 100;
  const ring = active ? (left < 5 ? '#E23B2E' : '#FFD34D') : 'rgba(255,255,255,.35)';
  return (
    <div
      className="grid place-items-center rounded-full"
      style={{ width: 86, height: 86, background: `conic-gradient(${ring} 0 ${pct}%, rgba(0,0,0,.45) ${pct}% 100%)` }}
    >
      {children}
    </div>
  );
}

export function GameHud({ onExit, onSettings }: { onExit: () => void; onSettings: () => void }) {
  const t = useTranslations('game');
  const tSettings = useTranslations('settings');
  const state = useMatch((s) => s.state);
  const myId = useMatch((s) => s.myId);
  const act = useMatch((s) => s.act);
  const fx = useMatch((s) => s.fx);
  const avatarPreset = useSettings((s) => s.avatarPreset);
  const animating = useTurnHold();
  const left = useSecondsLeft(state?.turnDeadline ?? 0, animating, state?.rules.turnSeconds ?? 20);

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
  const canCallRush = !!me && me.hand.length === 1 && !me.calledRush;
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
      if (is('e') && canDraw) return run(() => act({ type: 'DRAW', playerId: myId }));
      if (is('s') && sCard) return run(playS);
      if (is('q') && canPass) return run(() => act({ type: 'PASS', playerId: myId }));
      if (is('d') && canChallenge) return run(() => act({ type: 'CHALLENGE', playerId: myId }));
      // MỘT phím Space lo cả hô lẫn bắt: mình còn 1 lá thì là hô, không thì là
      // bắt người đang thiếu tiếng hô. Không bao giờ mập mờ vì 2 điều kiện loại
      // trừ nhau (không thể vừa là chủ cửa sổ vừa là người đi bắt).
      if (isSpace || is('w')) {
        if (canCallRush) return run(() => { playSfx('rush'); act({ type: 'CALL_RUSH', playerId: myId }); });
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
  const needColor = state.phase === 'awaitColor' && state.resume?.playerId === myId;
  const needSwap = state.phase === 'awaitSwapTarget' && state.resume?.playerId === myId;
  const catchable = state.rushWindow && state.rushWindow.playerId !== myId
    ? state.players.find((p) => p.id === state.rushWindow!.playerId)
    : null;
  const secondsLeft = Math.ceil(left);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="pointer-events-auto absolute left-6 top-6 flex items-center gap-2">
        <button className="btn btn--ghost !py-2 !text-[17px]" onClick={onExit}>‹ {t('backToMenu')}</button>
        {/* Cài đặt mở được NGAY TRONG VÁN — chủ yếu để chỉnh âm lượng mà không
            phải thoát ra menu (thoát giữa ván online là mất ghế). */}
        <button
          className="grid h-[38px] w-[38px] place-items-center rounded-full text-[18px] text-[#FFE2A8]"
          style={{ background: 'rgba(20,8,12,.55)', border: '2px solid rgba(255,215,140,.5)' }}
          onClick={() => { playSfx('click'); onSettings(); }}
          aria-label={tSettings('title')}
          title={tSettings('title')}
        >
          ⚙
        </button>
        <span className="label rounded-[10px] border border-[color:var(--line-2)] bg-[color:var(--panel-2)] px-3 py-1.5 text-[13px] text-[color:var(--gold)]">
          {state.side === 'dark' ? t('darkSide') : t('lightSide')}
        </span>
        {state.pending && (
          <motion.span
            initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            className="label rounded-[10px] bg-[color:var(--c-red)] px-3 py-1.5 text-[13px] text-white"
          >
            {state.pending.value === 'drawColor'
              ? t('stackColor', { color: WHEEL_LABEL[state.pending.color] ?? state.pending.color })
              : t('stack', { n: state.pending.amount })}
          </motion.span>
        )}
      </div>

      <div className="absolute right-6 top-6 flex flex-col items-end gap-1.5">
        {state.players.map((p) => (
          <div
            key={p.id}
            className="display rounded-lg px-3 py-1 text-[17px]"
            style={{
              background: p.id === myId ? 'linear-gradient(90deg,#FFB534,#FF8A2B)' : 'rgba(12,4,8,.55)',
              color: p.id === myId ? '#2A1508' : '#FFF3DA',
              border: '1px solid rgba(255,215,140,.3)',
            }}
          >
            {/* Ghế đang bị máy giữ hộ: nói rõ ngay trên bảng điểm, để nhìn một
                chỗ là biết cả bàn ai còn ai rớt. */}
            {isTakenOver(p) && (
              <span
                className="mr-1.5 rounded px-1 text-[10px] font-bold align-middle"
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

      {/* banner lượt (mock 03) + chiều đánh — badge chiều đánh nằm ngoài motion.div
          để không bị remount/giật animation xoay mỗi khi đổi lượt */}
      <div className="absolute left-1/2 top-[84px] flex -translate-x-1/2 items-center gap-2">
        <DirectionBadge direction={state.direction} />
        <motion.div
          key={`${current?.id}-${state.turn}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="label rounded-[20px] border px-5 py-1.5 text-[15px]"
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

      {/* HUD của mình: vòng đếm ngược quanh avatar */}
      {seated && (
      <div className="absolute bottom-8 left-8 flex items-center gap-3">
        <TurnDial left={left} seconds={state.rules.turnSeconds} active={myTurn}>
          <div className="relative">
            {(() => {
              const mine = fx.filter((f) => f.kind === 'emote' && f.payload.t === 'emote' && f.payload.playerId === myId);
              const last = mine[mine.length - 1];
              if (!last || last.payload.t !== 'emote') return null;
              return (
                <div
                  key={last.id}
                  className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 text-[26px]"
                  style={{ animation: 'emotePop 2s ease-out forwards', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.6))' }}
                >
                  {last.payload.emote}
                </div>
              );
            })()}
            {(() => {
              // f.actorId đã được chốt lúc event xảy ra. Đọc state.turn ở đây
              // thì biểu tượng cấm lượt sẽ bật/tắt theo từng lượt kế tiếp —
              // nhìn thành 'chữ skip nháy đi nháy lại'.
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
                  <Ban size={44} strokeWidth={3} color="#fff" style={{ filter: 'drop-shadow(0 0 6px rgba(226,59,46,.9)) drop-shadow(0 2px 4px rgba(0,0,0,.7))' }} />
                </div>
              );
            })()}
            <Avatar
              name={me?.name ?? ''}
              preset={avatarPreset}
              size={myTurn ? 78 : 70}
              self
              className={`seat__avatar !rounded-full ${myTurn ? 'avatar--turn' : ''}`}
            />
          </div>
        </TurnDial>
        <div>
          <div
            className="display inline-block rounded-[7px] px-3.5 py-1 text-[20px]"
            style={{ background: 'linear-gradient(90deg,#FFB534,#FF8A2B)', color: '#2A1508' }}
          >
            {me?.name}
          </div>
          <div className="label mt-1.5 text-[15px] text-[#FFE0B3]">
            {t('cards', { n: me?.hand.length ?? 0 })} · {me?.score ?? 0}
          </div>
        </div>
        <EmotePicker onPick={(emote) => act({ type: 'EMOTE', playerId: myId, emote })} />
      </div>
      )}

      {/* ĐANG XEM — thay hẳn khối cá nhân, không phải một khối rỗng đội lốt nó. */}
      {!seated && (
        <div
          className="label absolute bottom-8 left-8 rounded-[14px] px-5 py-3 text-[14px] tracking-[.18em]"
          style={{ background: 'rgba(12,4,8,.66)', border: '1px solid rgba(255,215,140,.35)', color: '#FFE0B3' }}
        >
          {t('spectating')}
          <div className="label-sm mt-1 normal-case tracking-[.1em] opacity-80">
            {queuePos >= 0 ? t('queuePos', { n: queuePos + 1 }) : t('queueWait')}
          </div>
        </div>
      )}

      {/* RUSH + rút bài: dồn về góc phải để không đè lên quạt bài */}
      {seated && (
      <div className="pointer-events-auto absolute bottom-8 right-9 flex flex-col items-center gap-3">
        <AnimatePresence>
          {me && me.hand.length === 1 && !me.calledRush && (
            <motion.button
              key="rush"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => { playSfx('rush'); act({ type: 'CALL_RUSH', playerId: myId }); }}
              className="display grid place-items-center rounded-full text-[38px]"
              style={{
                width: 132, height: 132,
                background: 'radial-gradient(circle at 40% 34%,#FFE27A,#F0A21B 62%,#B45A05)',
                border: '6px solid #fff',
                boxShadow: '0 18px 36px rgba(0,0,0,.5), 0 0 44px rgba(255,190,80,.6)',
                color: '#5A2A05',
                animation: 'pulseGlow 2.2s ease-in-out infinite',
              }}
            >
              <span className="grid place-items-center leading-none">
                {t('rush')}
                <kbd className="label mt-1 rounded-[6px] px-1.5 text-[11px] font-bold" style={{ background: 'rgba(0,0,0,.3)', color: '#5A2A05' }}>
                  Space
                </kbd>
              </span>
            </motion.button>
          )}
          {catchable && graceOver && (
            <motion.button
              key="catch"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="btn"
              style={{ background: 'linear-gradient(#E23B2E,#A5231A)', borderColor: '#FFD34D', color: '#fff' }}
              onClick={() => act({ type: 'CATCH_RUSH', playerId: myId, targetId: catchable.id })}
            >
              {t('catch', { name: catchable.name })}
              <kbd className="label ml-2 rounded-[6px] px-1.5 text-[11px] font-bold" style={{ background: 'rgba(0,0,0,.35)' }}>Space</kbd>
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
        <div className="pointer-events-auto absolute bottom-[330px] left-1/2 flex -translate-x-1/2 items-center gap-3">
          {canDraw && (
            <ActionButton
              tone={needDrawPrompt ? 'gold' : 'plain'}
              pulse={needDrawPrompt}
              hotkey="E"
              onClick={() => act({ type: 'DRAW', playerId: myId })}
            >
              {t('draw')}
            </ActionButton>
          )}
          {!!sCard && (
            <ActionButton tone='gold' pulse hotkey="S" onClick={playS}>
              {isJump ? t('jumpIn') : t('stackUp')}
            </ActionButton>
          )}
          {canPass && (
            <ActionButton tone='plain' hotkey="Q" onClick={() => act({ type: 'PASS', playerId: myId })}>
              {t('pass')}
            </ActionButton>
          )}
          {canChallenge && (
            <ActionButton tone='red' hotkey="D" onClick={() => act({ type: 'CHALLENGE', playerId: myId })}>
              {t('challenge')}
            </ActionButton>
          )}
        </div>
      )}

      <ColorWheel
        open={needColor}
        side={state.side}
        seconds={secondsLeft}
        onPick={(c) => act({ type: 'CHOOSE_COLOR', playerId: myId, color: c })}
      />
      <SwapPicker
        open={needSwap}
        names={state.players.filter((p) => p.id !== myId).map((p) => ({ id: p.id, name: p.name, n: p.hand.length }))}
        onPick={(id) => act({ type: 'SWAP_TARGET', playerId: myId, targetId: id })}
      />
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
function EmotePicker({ onPick }: { onPick: (emote: string) => void }) {
  const t = useTranslations('settings');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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
        className="grid h-11 w-11 place-items-center rounded-full border text-[20px] transition-transform hover:scale-110"
        style={{ background: 'rgba(12,4,8,.6)', borderColor: 'rgba(255,215,140,.45)' }}
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
            className="absolute bottom-[52px] left-0 flex gap-1 rounded-2xl border p-1.5"
            style={{ background: 'rgba(12,4,8,.85)', borderColor: 'rgba(255,215,140,.45)' }}
          >
            {EMOTES.map((e) => (
              <button
                key={e}
                className="grid h-9 w-9 place-items-center rounded-full text-[19px] transition-transform hover:scale-125"
                onClick={() => { onPick(e); setOpen(false); }}
              >
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const WHEEL_LABEL: Record<string, string> = {
  red: 'Đỏ', yellow: 'Vàng', green: 'Lục', blue: 'Lam',
  pink: 'Hồng', orange: 'Cam', teal: 'Ngọc', purple: 'Tím',
};

/**
 * Bánh xe chọn màu (mock 04): conic-gradient 4 phần + chữ thập trắng.
 * Mỗi phần là 1 button phủ 1/4 vòng, bấm đâu ăn đó.
 */
function ColorWheel({ open, side, seconds, onPick }: {
  open: boolean; side: 'light' | 'dark'; seconds: number; onPick: (c: CardColor) => void;
}) {
  const t = useTranslations('game');
  const colors = colorsOf(side);
  const conic = colors.map((c, i) => `${COLOR_HEX[c]} ${i * 90}deg ${(i + 1) * 90}deg`).join(',');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto absolute inset-0 grid place-items-center"
          style={{ background: 'rgba(8,2,6,.55)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <div className="display text-[46px] text-[#FFF3DA]" style={{ textShadow: '0 5px 0 rgba(0,0,0,.4)' }}>
                {t('pickColor')}
              </div>
              <div className="label mt-1 text-[15px] tracking-[.24em] text-[#FFC98A]">{seconds}s</div>
            </div>

            <motion.div
              className="relative"
              style={{ width: 380, height: 380 }}
              initial={{ scale: 0.8, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${conic})`,
                  border: '8px solid #fff',
                  boxShadow: '0 30px 70px rgba(0,0,0,.6), 0 0 70px rgba(255,170,70,.35)',
                }}
              />
              <div className="pointer-events-none absolute left-1/2 top-0 h-full w-2 -translate-x-1/2 bg-white" />
              <div className="pointer-events-none absolute left-0 top-1/2 h-2 w-full -translate-y-1/2 bg-white" />

              {colors.map((c, i) => (
                <button
                  key={c}
                  onClick={() => { playSfx('click'); onPick(c); }}
                  className="display absolute h-1/2 w-1/2 text-[30px] text-white transition-transform hover:scale-105"
                  style={{
                    ...(i === 0 ? { right: 0, top: 0 } : i === 1 ? { right: 0, bottom: 0 } : i === 2 ? { left: 0, bottom: 0 } : { left: 0, top: 0 }),
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                  }}
                  aria-label={c}
                />
              ))}
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                style={{ width: 132, height: 132, background: '#17141F', border: '8px solid #fff' }}
              >
                <div className="grid grid-cols-2 gap-[5px]">
                  {colors.map((c) => (
                    <span key={`q-${c}`} className="block h-[26px] w-[26px] rounded-[5px]" style={{ background: COLOR_HEX[c] }} />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Luật 7: chọn người để đổi tay bài. */
function SwapPicker({ open, names, onPick }: {
  open: boolean; names: { id: string; name: string; n: number }[]; onPick: (id: string) => void;
}) {
  const t = useTranslations('game');
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto absolute inset-0 grid place-items-center"
          style={{ background: 'rgba(8,2,6,.55)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="panel p-6 text-center">
            <div className="display mb-4 text-[32px] text-[#FFF3DA]">{t('pickSwap')}</div>
            <div className="flex gap-3">
              {names.map((p) => (
                <button key={p.id} className="btn btn--gold" onClick={() => onPick(p.id)}>
                  {p.name}
                  <span className="ml-2 opacity-70">{t('cards', { n: p.n })}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { ColorWheel, SwapPicker };

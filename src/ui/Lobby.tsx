'use client';
/* eslint-disable react-hooks/refs -- useDraggable của @dnd-kit trả về setNodeRef/listeners/transform,
   React Compiler nhận nhầm là ref nội bộ; đây là API công khai của thư viện. */
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useRoom, type Seat } from '@/src/state/room';
import { ThemePicker } from './ThemePicker';
import { useAvatarLookup } from '@/src/state/room';
import { Backdrop } from './Backdrop';
import { themeMeta } from '@/src/lib/themes';
import { useActiveTheme } from '@/src/state/room';
import { Check, Link2 } from 'lucide-react';
import { playSfx } from '@/src/lib/audio';
import { roomShareUrl } from '@/src/lib/roomLink';
import { isDiscordActivity, openDiscordInvite } from '@/src/lib/discord';
import { Avatar } from './Avatar';
import { UI } from '@/src/config';

/** Tự động nhận diện màn hình nhỏ hoặc Discord để thu gọn tỉ lệ UI */
function useIsCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const check = () => {
      setCompact(isDiscordActivity() || window.innerHeight < 780 || window.innerWidth < 1200);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return compact;
}

/** Nhãn nhóm nhỏ viết hoa giãn chữ (mock 02). */
function GroupLabel({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`label tracking-[.16em] text-[#FFD34D] ${compact ? 'text-[12px]' : 'text-[14px]'}`}>
      {children}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`switch ${on ? 'switch--on' : 'switch--off'}`}>
      <i />
    </span>
  );
}

/** 1 ghế quanh bàn oval — kéo-thả để đổi chỗ trước khi bắt đầu. */
function SeatChip({ seat, index, meId, canEdit, position, isCompact }: {
  seat: Seat | null; index: number; meId: string; canEdit: boolean; position: React.CSSProperties; isCompact: boolean;
}) {
  const t = useTranslations('room');
  const kick = useRoom((s) => s.kick);
  const toQueue = useRoom((s) => s.toQueue);
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `seat-${index}` });
  const isMe = seat?.id === meId;
  // Một nguồn duy nhất cho avatar: ảnh tạm trong phòng > ảnh Discord > preset.
  const avatarOf = useAvatarLookup();
  const canDrag = !!seat && (canEdit || isMe);
  const drag = useDraggable({ id: `seat-${index}`, disabled: !canDrag });

  return (
    <div ref={dropRef} className="absolute" style={position}>
      {seat ? (
        <div
          ref={drag.setNodeRef}
          {...(canDrag ? drag.listeners : {})}
          {...(canDrag ? drag.attributes : {})}
          className={`flex items-center gap-2 rounded-[10px] ${isCompact ? 'px-2.5 py-1.5' : 'px-3.5 py-2'} ${canDrag ? 'cursor-grab' : ''}`}
          style={{
            background: isMe ? 'linear-gradient(90deg,#FFB534,#FF8A2B)' : 'rgba(12,4,8,.6)',
            border: `1px solid ${isOver ? '#FFD34D' : 'rgba(255,215,140,.35)'}`,
            transform: drag.transform ? `translate3d(${drag.transform.x}px,${drag.transform.y}px,0)` : undefined,
            touchAction: 'none',
            zIndex: drag.transform ? 20 : 1,
          }}
        >
          <Avatar
            name={seat.name}
            preset={seat.avatarPreset}
            size={isCompact ? 28 : 36}
            avatarUrl={avatarOf(seat.id).url}
            self={isMe}
            className="seat__avatar !rounded-lg overflow-hidden"
          />
          <div className="display" style={{ fontSize: isCompact ? 14 : 17, color: isMe ? '#2A1508' : '#FFF3DA' }}>
            {seat.name}
            {isMe && <span className="ml-1 text-[12px] opacity-70">· {t('you')}</span>}
            {seat.isBot && <span className="ml-1 text-[12px] opacity-60">· {t('bot')}</span>}
          </div>
          {isMe && (
            <button
              className="display text-[14px] opacity-60 hover:opacity-100"
              style={{ color: '#2A1508' }}
              onClick={() => toQueue(index)}
              aria-label={t('leaveSeat')}
            >
              ↩
            </button>
          )}
          {!isMe && canEdit && (
            <button
              className="display text-[14px] opacity-60 hover:opacity-100"
              style={{ color: '#FFC98A' }}
              onClick={() => kick(seat.id)}
              aria-label={t('kick')}
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div
          className={`flex items-center gap-2 rounded-[10px] ${isCompact ? 'px-2.5 py-1.5' : 'px-3.5 py-2'}`}
          style={{ background: 'rgba(12,4,8,.6)', border: `1px dashed ${isOver ? '#FFD34D' : 'rgba(255,215,140,.5)'}` }}
        >
          <span
            className={`display grid place-items-center rounded-lg text-[#FFD34D] ${isCompact ? 'h-7 w-7 text-[16px]' : 'h-9 w-9 text-[20px]'}`}
            style={{ border: '1px dashed rgba(255,215,140,.6)' }}
          >
            +
          </span>
          <span className="display text-[#E5C49F]" style={{ fontSize: isCompact ? 13 : 16 }}>{t('empty')}</span>
        </div>
      )}
    </div>
  );
}

/** Vị trí 4 ghế quanh bàn preview: dưới (mình) - trái - trên - phải. */
const SEAT_POS: React.CSSProperties[] = [
  { left: '50%', bottom: 10, transform: 'translateX(-50%)' },
  { left: 10, top: '50%', transform: 'translateY(-50%)' },
  { left: '50%', top: 10, transform: 'translateX(-50%)' },
  { right: 10, top: '50%', transform: 'translateY(-50%)' },
];

/** 1 người trong hàng chờ — kéo được vào ghế trống HOẶC thả lên ghế đang có
 *  người để đổi chỗ (seat<->queue), có nút rời hàng chờ riêng. */
function QueueChip({ q, index, meId, canEdit, onSit, isCompact }: {
  q: Seat; index: number; meId: string; canEdit: boolean; onSit: () => void; isCompact: boolean;
}) {
  const t = useTranslations('room');
  const kick = useRoom((s) => s.kick);
  const isMe = q.id === meId;
  const canDrag = canEdit || isMe;
  const drag = useDraggable({ id: `queue-${index}`, disabled: !canDrag });

  return (
    <div
      ref={drag.setNodeRef}
      {...(canDrag ? drag.listeners : {})}
      {...(canDrag ? drag.attributes : {})}
      className={`display flex items-center gap-2 rounded-[18px] bg-white/[.09] text-[#FFF3DA] ${
        isCompact ? 'py-1 pl-2.5 pr-1 text-[13px]' : 'py-1.5 pl-3 pr-1.5 text-[15px]'
      } ${canDrag ? 'cursor-grab' : ''}`}
      style={{
        transform: drag.transform ? `translate3d(${drag.transform.x}px,${drag.transform.y}px,0)` : undefined,
        touchAction: 'none',
        zIndex: drag.transform ? 20 : 1,
      }}
    >
      <button onClick={onSit} className="flex items-center gap-2">
        <span className="text-[#FFD34D]">{index + 1}</span> {q.name}
      </button>
      {canDrag && (
        <button
          className="grid h-5 w-5 place-items-center rounded-full text-[12px] opacity-60 hover:opacity-100"
          onClick={() => kick(q.id)}
          aria-label={t('kick')}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Khối hàng chờ FIFO — droppable chung để kéo 1 ghế "ra hàng chờ" (thả vào
 *  bất kỳ đâu trong khối), mỗi người trong hàng chờ lại kéo được vào 1 ghế cụ thể. */
function QueuePanel({ queue, seats, meId, canEdit, seatFromQueue, isCompact }: {
  queue: Seat[]; seats: (Seat | null)[]; meId: string; canEdit: boolean;
  seatFromQueue: (qIndex: number, seatIndex: number) => void;
  isCompact: boolean;
}) {
  const t = useTranslations('room');
  const { setNodeRef, isOver } = useDroppable({ id: 'queue-drop' });
  return (
    <div
      ref={setNodeRef}
      className={`panel transition-colors ${isCompact ? 'p-2.5' : 'p-3.5'}`}
      style={isOver ? { borderColor: '#FFD34D' } : undefined}
    >
      <div className="label-sm">{t('queue')} (FIFO)</div>
      <div className={`mt-2 flex flex-wrap ${isCompact ? 'gap-1.5' : 'gap-2.5'}`}>
        {queue.length === 0 && <span className="text-[13px] font-semibold text-[#C79A76]">—</span>}
        {queue.map((q, i) => (
          <QueueChip
            key={q.id}
            q={q}
            index={i}
            meId={meId}
            canEdit={canEdit}
            isCompact={isCompact}
            onSit={() => {
              const free = seats.findIndex((s) => !s);
              if (free >= 0) seatFromQueue(i, free);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Lobby({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  const t = useTranslations('room');
  const tr = useTranslations('rules');
  const { code, seats, queue, rules, deckType, moveSeat, toQueue, setRules, setDeck, addBot, seatFromQueue } = useRoom();
  const [copied, setCopied] = useState(false);
  const mode = useRoom((s) => s.mode);
  const meId = useRoom((s) => s.meId);
  const hostId = useRoom((s) => s.hostId);
  const theme = useActiveTheme();
  const isCompact = useIsCompact();
  // online: chỉ chủ phòng đổi luật/bắt đầu (server cũng chặn, đây chỉ là UI)
  const canEdit = mode === 'local' || meId === hostId;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const activeId = String(e.active.id);
    const [aType, aIdxRaw] = activeId.split('-');
    const aIdx = Number(aIdxRaw);
    if (Number.isNaN(aIdx)) return;

    if (overId === 'queue-drop') {
      if (aType === 'seat') { playSfx('click'); toQueue(aIdx); }
      return;
    }

    const [oType, oIdxRaw] = overId.split('-');
    const oIdx = Number(oIdxRaw);
    if (Number.isNaN(oIdx)) return;

    if (aType === 'seat' && oType === 'seat' && aIdx !== oIdx) {
      playSfx('click');
      moveSeat(aIdx, oIdx);
    } else if (aType === 'queue' && oType === 'seat') {
      playSfx('click');
      seatFromQueue(aIdx, oIdx);
    } else if (aType === 'seat' && oType === 'queue') {
      playSfx('click');
      toQueue(aIdx);
    }
  };

  const seated = seats.filter(Boolean).length;
  const houseRules: [keyof typeof rules, string, string][] = [
    ['sevenZero', tr('sevenZero'), tr('sevenZeroSub')],
    ['stack', tr('stack'), tr('stackSub')],
    ['jumpIn', tr('jumpIn'), tr('jumpInSub')],
    ['challenge', tr('challenge'), tr('challengeSub')],
    ['rushPenalty', tr('rushPenalty'), tr('rushPenaltySub')],
    ['drawToMatch', tr('drawToMatch'), tr('drawToMatchSub')],
    ['forcePlay', tr('forcePlay'), tr('forcePlaySub')],
    ['teamMode', tr('teamMode'), tr('teamModeSub')],
  ];

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: themeMeta(theme).menu.base }}>
      <Backdrop theme={theme} dim="strong" />
      <div className="absolute inset-0 flex overflow-hidden">
        {/* CỘT TRÁI: Cấu hình phòng & luật */}
        <div
          className={`scroll-y flex w-[54%] flex-col ${
            isCompact ? 'gap-2.5 p-4 pl-6' : 'gap-4 p-7 pl-10'
          } ${canEdit ? '' : 'pointer-events-none opacity-70'}`}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <button className="btn btn--ghost !px-2.5 !py-1 text-[18px]" onClick={onBack}>‹</button>
              <div
                className={`display leading-none text-[#FFF3DA] ${isCompact ? 'text-[28px]' : 'text-[38px]'}`}
                style={{ textShadow: '0 4px 0 rgba(0,0,0,.3)' }}
              >
                {t('lobby')}
              </div>
            </div>
            <div className={`label mt-1 flex flex-wrap items-center gap-2 tracking-[.1em] text-[#F6C79A] ${isCompact ? 'text-[13px]' : 'text-[15px]'}`}>
              <span>{t('code')} · <span className="tracking-[.3em] font-bold">{code}</span></span>

              {mode === 'online' && !!code && (
                <button
                  className="label flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-[11px] tracking-normal transition-colors"
                  style={{
                    borderColor: copied ? '#37A64A' : 'rgba(255,215,140,.45)',
                    background: 'rgba(30,12,18,.55)',
                    color: copied ? '#8BE79A' : '#FFE9C6',
                  }}
                  onClick={() => {
                    playSfx('click');
                    const url = roomShareUrl(code);
                    navigator.clipboard?.writeText(url).then(
                      () => { setCopied(true); setTimeout(() => setCopied(false), UI.copiedMs); },
                      () => window.prompt(tr('copyLink'), url),
                    );
                  }}
                >
                  {copied ? <Check size={13} /> : <Link2 size={13} />}
                  {copied ? tr('copied') : tr('copyLink')}
                </button>
              )}

              {isDiscordActivity() && (
                <button
                  type="button"
                  className="label flex items-center gap-1.5 rounded-[10px] px-3 py-1 text-[11px] font-bold tracking-normal text-white transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                    border: '1px solid rgba(255,255,255,.3)',
                    boxShadow: '0 2px 8px rgba(88,101,242,.4)',
                  }}
                  onClick={() => {
                    playSfx('click');
                    void openDiscordInvite();
                  }}
                  title={t('inviteVoice')}
                >
                  <span>👥</span>
                  <span>{t('inviteVoice')}</span>
                </button>
              )}
            </div>
          </div>

          {/* CHỌN BỘ BÀI */}
          <div className={`panel ${isCompact ? 'p-3' : 'p-4'}`}>
            <GroupLabel compact={isCompact}>{tr('deck')}</GroupLabel>
            <div className={`mt-2 flex ${isCompact ? 'gap-2' : 'gap-3'}`}>
              {(['classic', 'flip'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDeck(d)}
                  className={`display flex-1 rounded-xl transition-all ${
                    isCompact ? 'px-3 py-2 text-[16px]' : 'px-4 py-3 text-[19px]'
                  }`}
                  style={
                    deckType === d
                      ? { background: 'linear-gradient(100deg,#FFD34D,#FF9E2C)', border: '2px solid #fff', color: '#2A1508' }
                      : { background: 'rgba(255,255,255,.08)', border: '2px solid rgba(255,255,255,.28)', color: '#F3E4CE' }
                  }
                >
                  {d === 'classic' ? tr('classic') : tr('flip')}
                </button>
              ))}
            </div>
          </div>

          {/* SỐ LÁ VÀ THỜI GIAN LƯỢT */}
          <div className={`panel grid grid-cols-2 ${isCompact ? 'gap-2 p-3' : 'gap-3 p-4'}`}>
            <div className={`rounded-xl bg-black/25 ${isCompact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
              <div className="label-sm">{tr('startingCards')}</div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <button
                  className={`display grid place-items-center rounded-lg bg-white/15 text-white ${
                    isCompact ? 'h-[26px] w-[26px] text-[16px]' : 'h-[30px] w-[30px] text-[20px]'
                  }`}
                  onClick={() => setRules({ startingCards: Math.max(5, rules.startingCards - 1) })}
                >
                  −
                </button>
                <div className={`display text-[#FFD34D] ${isCompact ? 'text-[22px]' : 'text-[26px]'}`}>
                  {rules.startingCards}
                </div>
                <button
                  className={`display grid place-items-center rounded-lg bg-white/15 text-white ${
                    isCompact ? 'h-[26px] w-[26px] text-[16px]' : 'h-[30px] w-[30px] text-[20px]'
                  }`}
                  onClick={() => setRules({ startingCards: Math.min(7, rules.startingCards + 1) })}
                >
                  +
                </button>
                <span className="text-[12px] font-semibold text-[#C79A76]">5 – 7</span>
              </div>
            </div>
            <div className={`rounded-xl bg-black/25 ${isCompact ? 'px-3 py-2' : 'px-3.5 py-2.5'}`}>
              <div className="label-sm">{tr('turnSeconds')}</div>
              <div className="mt-1.5 flex gap-1.5">
                {[15, 20, 30].map((n) => (
                  <button
                    key={n}
                    className={`chip ${rules.turnSeconds === n ? 'chip--on' : ''} ${isCompact ? '!px-2 !py-0.5 !text-[12px]' : ''}`}
                    onClick={() => setRules({ turnSeconds: n })}
                  >
                    {n}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* LUẬT NHÀ */}
          <div className={`panel ${isCompact ? 'p-3' : 'p-4'}`}>
            <GroupLabel compact={isCompact}>{tr('houseRules')}</GroupLabel>
            <div className={`mt-2 grid grid-cols-2 ${isCompact ? 'gap-1.5' : 'gap-2.5'}`}>
              {houseRules.map(([k, label, sub]) => (
                <button
                  key={k}
                  onClick={() => { playSfx('click'); setRules({ [k]: !rules[k] } as never); }}
                  className={`flex items-center justify-between gap-2 rounded-[10px] bg-white/[.07] ${
                    isCompact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5'
                  } text-left`}
                >
                  <span>
                    <span className={`display block leading-tight text-[#FFF3DA] ${isCompact ? 'text-[14px]' : 'text-[17px]'}`}>{label}</span>
                    <span className={`block font-semibold text-[#C79A76] ${isCompact ? 'text-[10px]' : 'text-[12px]'}`}>{sub}</span>
                  </span>
                  <Toggle on={!!rules[k]} />
                </button>
              ))}
            </div>
          </div>

          {/* CHẾ ĐỘ, ĐIỂM ĐÍCH, CHỦ ĐỀ */}
          <div className={`flex ${isCompact ? 'gap-2' : 'gap-3'}`}>
            <div className={`panel flex-1 ${isCompact ? 'p-2.5' : 'p-3.5'}`}>
              <div className="label-sm">{tr('mode')}</div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  className={`chip ${!rules.teamMode ? 'chip--on' : ''} ${isCompact ? '!px-2 !py-0.5 !text-[12px]' : ''}`}
                  onClick={() => setRules({ teamMode: false })}
                >
                  {tr('single2')}
                </button>
                <button
                  className={`chip ${rules.teamMode ? 'chip--on' : ''} ${isCompact ? '!px-2 !py-0.5 !text-[12px]' : ''}`}
                  onClick={() => setRules({ teamMode: true })}
                >
                  {tr('duo')}
                </button>
              </div>
            </div>
            <div className={`panel flex-1 ${isCompact ? 'p-2.5' : 'p-3.5'}`}>
              <div className="label-sm">{tr('targetScore')}</div>
              <div className="mt-1.5 flex gap-1.5">
                {[0, 200, 500].map((n) => (
                  <button
                    key={n}
                    className={`chip ${rules.targetScore === n ? 'chip--on' : ''} ${isCompact ? '!px-2 !py-0.5 !text-[12px]' : ''}`}
                    onClick={() => setRules({ targetScore: n })}
                  >
                    {n === 0 ? tr('single') : n}
                  </button>
                ))}
              </div>
            </div>
            <div className={`panel ${isCompact ? 'p-2.5' : 'p-3.5'}`}>
              <div className="label-sm">{tr('bgTheme')}</div>
              <div className="mt-1.5">
                <ThemePicker compact />
              </div>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: Bàn preview + hàng chờ + nút bắt đầu */}
        <div className={`flex w-[46%] flex-col ${isCompact ? 'gap-2.5 py-4 pl-2 pr-6' : 'gap-4 py-7 pl-2 pr-10'}`}>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div
              className="relative flex-1 rounded-[18px] min-h-[190px]"
              style={{
                background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,190,120,.35), rgba(0,0,0,.35))',
                border: '1px solid rgba(255,215,140,.3)',
              }}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
                style={{
                  width: isCompact ? '60%' : '66%',
                  height: isCompact ? '40%' : '44%',
                  border: '3px solid rgba(255,225,170,.4)',
                  boxShadow: 'inset 0 0 36px rgba(255,150,60,.4)',
                }}
              />
              <div className="label pointer-events-none absolute left-1/2 top-1/2 max-w-[140px] -translate-x-1/2 -translate-y-1/2 text-center text-[10px] tracking-[.12em] text-[#FFE0B3]/80">
                {t('dragHint')}
              </div>
              {seats.map((s, i) => (
                <SeatChip key={i} seat={s} index={i} meId={meId} canEdit={canEdit} position={SEAT_POS[i]} isCompact={isCompact} />
              ))}
            </div>

            <QueuePanel queue={queue} seats={seats} meId={meId} canEdit={canEdit} seatFromQueue={seatFromQueue} isCompact={isCompact} />
          </DndContext>

          <div className={`flex ${isCompact ? 'gap-2.5' : 'gap-3'}`}>
            <button className={`btn ${isCompact ? '!py-2 !px-3.5 !text-[15px]' : ''}`} disabled={!canEdit} onClick={addBot}>
              {t('addBot')}
            </button>
            <motion.button
              whileHover={{ y: -3 }}
              className={`btn btn--green flex-1 ${isCompact ? '!text-[18px] !py-2' : '!text-[24px]'}`}
              disabled={seated < 2 || !canEdit}
              onClick={() => { playSfx('click'); onStart(); }}
            >
              {canEdit ? t('start') : t('waitHost')}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

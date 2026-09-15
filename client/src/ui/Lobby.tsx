'use client';
/* eslint-disable react-hooks/refs -- useDraggable from @dnd-kit returns setNodeRef/listeners/transform,
   which React Compiler confuses with internal refs; this is the library's public API. */
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
import { Check, Link2, MessageSquare, Settings } from 'lucide-react';
import { playSfx } from '@/src/lib/audio';
import { roomShareUrl } from '@/src/lib/roomLink';
import { isDiscordActivity, openDiscordInvite } from '@/src/lib/discord';
import { Avatar } from './Avatar';
import { UI } from '@/src/config';
import { SegmentedControl } from './CustomSelect';
import { useNetworkStore } from '@/src/state/net';
import { useChat } from '@/src/state/chat';
import { ChatBubble } from './InGameChat';
import type { DeckType } from '@u-no/game-engine';

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

/** 1 ghế quanh bàn oval — dạng ô vuông: Trên là avatar + ping, Dưới là tên người chơi */
function SeatChip({
  seat,
  index,
  meId,
  hostId,
  canEdit,
  position,
  isCompact,
}: {
  seat: Seat | null;
  index: number;
  meId: string;
  hostId: string;
  canEdit: boolean;
  position: React.CSSProperties;
  isCompact: boolean;
}) {
  const t = useTranslations('room');
  const kick = useRoom((s) => s.kick);
  const toQueue = useRoom((s) => s.toQueue);
  const transferHost = useRoom((s) => s.transferHost);
  const presence = useRoom((s) => s.presence);
  const mode = useRoom((s) => s.mode);
  const myPing = useNetworkStore((s) => s.ping);
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `seat-${index}` });
  const isMe = seat?.id === meId;
  const isHost = seat?.id === hostId;
  const avatarOf = useAvatarLookup();
  const canDrag = !!seat && (canEdit || isMe);
  const drag = useDraggable({ id: `seat-${index}`, disabled: !canDrag });
  const isDragging = drag.isDragging;
  const chatMessages = useChat((s) => s.messages);
  const chat = seat ? chatMessages[seat.id] : null;

  const cardW = isCompact ? 'w-[88px]' : 'w-[104px]';
  const cardH = isCompact ? 'h-[96px]' : 'h-[112px]';

  // Tính ping / trạng thái mạng
  const pr = seat ? presence[seat.id] : null;
  const isBot = !!seat?.isBot;
  const pingVal = isMe ? (myPing ?? pr?.ping ?? null) : (pr?.ping ?? null);
  const isOnlineMode = mode === 'online';
  const pingColor = pingVal == null ? '#8A8A8A' : pingVal < 150 ? '#4ED16B' : pingVal < 400 ? '#F0B62E' : '#E2483B';

  return (
    <div ref={dropRef} className="absolute" style={position}>
      {seat ? (
        <div
          ref={drag.setNodeRef}
          {...(canDrag ? drag.listeners : {})}
          {...(canDrag ? drag.attributes : {})}
          className={`relative flex flex-col items-center justify-between rounded-[16px] p-2 ${cardW} ${cardH} ${
            canDrag ? 'cursor-grab active:cursor-grabbing' : ''
          } ${isDragging ? '' : 'transition-all'} select-none shadow-lg`}
          style={{
            background: isMe
              ? 'linear-gradient(145deg, rgba(255,181,52,0.92), rgba(255,138,43,0.96))'
              : 'linear-gradient(145deg, rgba(24,11,18,0.88), rgba(14,5,10,0.92))',
            border: `1.5px solid ${isOver ? '#FFD34D' : isHost ? '#FFD34D' : isMe ? '#FFE29A' : 'rgba(255,215,140,0.3)'}`,
            boxShadow: isMe
              ? '0 6px 18px rgba(255,138,43,0.35), inset 0 1px 0 rgba(255,255,255,0.4)'
              : '0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
            transform: drag.transform ? `translate3d(${drag.transform.x}px,${drag.transform.y}px,0)` : undefined,
            transition: isDragging ? 'none !important' : undefined,
            willChange: isDragging ? 'transform' : 'auto',
            opacity: isDragging ? 0.88 : 1,
            touchAction: 'none',
            zIndex: drag.transform ? 40 : 1,
          }}
        >
          {chat && (
            <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap">
              <ChatBubble message={chat.message} />
            </div>
          )}
          {/* Action buttons ở góc */}
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
            {isMe && (
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold opacity-75 hover:opacity-100 hover:scale-110 transition-transform cursor-pointer"
                style={{ background: 'rgba(0,0,0,0.25)', color: isMe ? '#2A1508' : '#FFF3DA' }}
                onClick={(e) => {
                  e.stopPropagation();
                  playSfx('click');
                  toQueue(index);
                }}
                title={t('leaveSeat')}
                aria-label={t('leaveSeat')}
              >
                ↩
              </button>
            )}
            {!isMe && canEdit && (
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded-full text-[11px] opacity-70 hover:opacity-100 hover:scale-110 transition-transform cursor-pointer"
                style={{ background: 'rgba(0,0,0,0.35)', color: '#FFF3DA' }}
                onClick={(e) => {
                  e.stopPropagation();
                  playSfx('click');
                  kick(seat.id);
                }}
                title={t('kick')}
                aria-label={t('kick')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Top-left: Crown / Transfer Host */}
          <div className="absolute top-1.5 left-1.5 z-10">
            {isHost && (
              <span
                className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[11px] shadow"
                title="Chủ phòng / Room Host"
              >
                👑
              </span>
            )}
            {!isMe && canEdit && !seat.isBot && !isHost && (
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded-full text-[11px] opacity-75 hover:opacity-100 hover:scale-110 transition-transform cursor-pointer"
                style={{ background: 'rgba(0,0,0,0.35)', color: '#FFD34D' }}
                onClick={(e) => {
                  e.stopPropagation();
                  playSfx('click');
                  transferHost(seat.id);
                }}
                title="Chuyển quyền chủ phòng / Transfer Host"
              >
                👑
              </button>
            )}
          </div>

          {/* Avatar (ở trên) */}
          <div className="relative mt-1">
            <Avatar
              name={seat.name}
              preset={seat.avatarPreset}
              size={isCompact ? 32 : 40}
              avatarUrl={avatarOf(seat.id).url}
              self={isMe}
              className="seat__avatar !rounded-full overflow-hidden shadow-md"
            />
          </div>

          {/* Ping indicator (ở giữa) */}
          <div className="flex items-center gap-1">
            {isBot ? (
              <span
                className="rounded px-1.5 py-0.2 text-[9px] font-bold"
                style={{
                  background: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(168,85,247,0.25)',
                  color: isMe ? '#2A1508' : '#D8B4FE',
                  border: isMe ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(168,85,247,0.35)',
                }}
              >
                BOT
              </span>
            ) : isOnlineMode ? (
              <span
                className="flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-bold font-mono"
                style={{
                  background: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.5)',
                  color: isMe ? '#2A1508' : pingColor,
                  border: `1px solid ${pingColor}55`,
                }}
                title={pingVal != null ? `${pingVal}ms` : 'Ping'}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pingColor }} />
                <span>{pingVal != null ? `${pingVal}ms` : '---'}</span>
              </span>
            ) : null}
          </div>

          {/* Tên người chơi (ở dưới) */}
          <div className="w-full text-center px-1">
            <div
              className="display truncate font-bold leading-tight"
              style={{
                fontSize: isCompact ? 12 : 13,
                color: isMe ? '#2A1508' : '#FFF3DA',
              }}
              title={seat.name}
            >
              {seat.name}
            </div>
            {isMe && (
              <div
                className="text-[10px] font-semibold leading-none opacity-80"
                style={{ color: isMe ? '#3E200C' : '#FFD34D' }}
              >
                {t('you')}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed ${cardW} ${cardH} transition-all select-none`}
          style={{
            borderColor: isOver ? '#FFD34D' : 'rgba(255,215,140,0.25)',
            background: isOver ? 'rgba(255,211,77,0.18)' : 'rgba(12,4,8,0.3)',
          }}
        >
          <span className="text-[20px] font-light text-[#FFD34D]/60">+</span>
          <span className="text-[11px] font-medium text-[#C79A76] mt-0.5">{t('openSeat')}</span>
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

/** 1 người trong hàng chờ */
function QueueChip({
  q,
  index,
  meId,
  hostId,
  canEdit,
  onSit,
  isCompact,
}: {
  q: Seat;
  index: number;
  meId: string;
  hostId: string;
  canEdit: boolean;
  onSit: () => void;
  isCompact: boolean;
}) {
  const t = useTranslations('room');
  const kick = useRoom((s) => s.kick);
  const transferHost = useRoom((s) => s.transferHost);
  const isMe = q.id === meId;
  const isHost = q.id === hostId;
  const canDrag = canEdit || isMe;
  const drag = useDraggable({ id: `queue-${index}`, disabled: !canDrag });
  const isDragging = drag.isDragging;
  const chatMessages = useChat((s) => s.messages);
  const chat = chatMessages[q.id];

  return (
    <div
      ref={drag.setNodeRef}
      {...(canDrag ? drag.listeners : {})}
      {...(canDrag ? drag.attributes : {})}
      className={`display relative flex items-center gap-2 rounded-[18px] bg-white/[.09] text-[#FFF3DA] ${isCompact ? 'py-1 pl-2.5 pr-1.5 text-[13px]' : 'py-1.5 pl-3 pr-2 text-[15px]'
        } ${canDrag ? 'cursor-grab' : ''} ${isHost ? 'border border-[#FFD34D]/60' : ''}`}
      style={{
        transform: drag.transform ? `translate3d(${drag.transform.x}px,${drag.transform.y}px,0)` : undefined,
        transition: isDragging ? 'none !important' : undefined,
        willChange: isDragging ? 'transform' : 'auto',
        opacity: isDragging ? 0.85 : 1,
        touchAction: 'none',
        zIndex: drag.transform ? 40 : 1,
      }}
    >
      {chat && (
        <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap">
          <ChatBubble message={chat.message} />
        </div>
      )}
      <button onClick={onSit} className="flex items-center gap-1.5">
        <span className="text-[#FFD34D]">{index + 1}</span>
        {isHost && <span title="Chủ phòng / Room Host">👑</span>}
        <span>{q.name}</span>
      </button>
      {!isMe && canEdit && !q.isBot && (
        <button
          type="button"
          className="text-[12px] opacity-75 hover:opacity-100 hover:scale-110 text-[#FFD34D]"
          onClick={(e) => {
            e.stopPropagation();
            playSfx('click');
            transferHost(q.id);
          }}
          title="Chuyển quyền chủ phòng / Transfer Host"
        >
          👑
        </button>
      )}
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

/** Khối hàng chờ FIFO */
function QueuePanel({
  queue,
  seats,
  meId,
  hostId,
  canEdit,
  seatFromQueue,
  isCompact,
}: {
  queue: Seat[];
  seats: (Seat | null)[];
  meId: string;
  hostId: string;
  canEdit: boolean;
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
            hostId={hostId}
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

export function Lobby({
  onStart,
  onBack,
  onSettings,
}: {
  onStart: () => void;
  onBack: () => void;
  onSettings?: () => void;
}) {
  const t = useTranslations('room');
  const tr = useTranslations('rules');
  const { code, seats, queue, rules, deckType, moveSeat, toQueue, setRules, setDeck, setTheme, addBot, seatFromQueue } = useRoom();
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

    if (aType === 'seat' && oType === 'seat') {
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
    ['randomizeSeats', tr('randomizeSeats'), tr('randomizeSeatsSub')],
  ];

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: themeMeta(theme).menu.base }}>
      <Backdrop theme={theme} dim="strong" />
      <div className="absolute inset-0 flex overflow-hidden">
        {/* CỘT TRÁI: Cấu hình phòng & luật */}
        <div
          className={`scroll-y flex w-[54%] flex-col ${isCompact ? 'gap-2.5 p-4 pl-6' : 'gap-3.5 p-6 pl-10'}`}
        >
          {/* Header phòng: Luôn hoạt động cho cả chủ phòng lẫn khách */}
          <div className="pointer-events-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className="btn btn--ghost !px-2.5 !py-1 text-[18px] cursor-pointer"
                  onClick={onBack}
                  title="Quay lại / Back"
                >
                  ‹
                </button>
                <div
                  className={`display leading-none text-[#FFF3DA] ${isCompact ? 'text-[28px]' : 'text-[36px]'}`}
                  style={{ textShadow: '0 4px 0 rgba(0,0,0,.3)' }}
                >
                  {t('lobby')}
                </div>
              </div>

              {onSettings && (
                <button
                  type="button"
                  className="btn btn--ghost !px-2.5 !py-1 text-[15px] cursor-pointer transition-transform hover:rotate-45"
                  onClick={() => { playSfx('click'); onSettings(); }}
                  title="Cài đặt / Settings"
                  aria-label="Settings"
                >
                  <Settings size={18} />
                </button>
              )}
            </div>

            <div className={`label mt-1 flex flex-wrap items-center gap-2 tracking-[.1em] text-[#F6C79A] ${isCompact ? 'text-[13px]' : 'text-[15px]'}`}>
              <span>{t('code')} · <span className="tracking-[.3em] font-bold">{code}</span></span>

              {mode === 'online' && !!code && (
                <button
                  type="button"
                  className="label flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-[11px] tracking-normal transition-colors cursor-pointer pointer-events-auto"
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

              {mode === 'online' && !!code && (
                <button
                  type="button"
                  className="label flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-[11px] tracking-normal transition-all hover:scale-105 cursor-pointer pointer-events-auto"
                  style={{
                    borderColor: 'rgba(255,211,77,.5)',
                    background: 'rgba(255,211,77,.15)',
                    color: '#FFE9C6',
                    boxShadow: '0 2px 8px rgba(0,0,0,.25)',
                  }}
                  onClick={() => {
                    playSfx('click');
                    useChat.getState().toggleInput();
                  }}
                  title="Chat (Nhấn Enter)"
                >
                  <MessageSquare size={13} className="text-[#FFD34D]" />
                  <span>Chat</span>
                  <span className="opacity-60 text-[9px] hidden sm:inline">(Enter)</span>
                </button>
              )}

              {isDiscordActivity() && (
                <button
                  type="button"
                  className="label flex items-center gap-1.5 rounded-[10px] px-3 py-1 text-[11px] font-bold tracking-normal text-white transition-all hover:scale-105 cursor-pointer pointer-events-auto"
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

          {/* CÁC PHẦN ĐỔI LUẬT & CÀI ĐẶT PHÒNG - chỉ chủ phòng mới chỉnh sửa được */}
          <div className={`flex flex-col ${isCompact ? 'gap-2.5' : 'gap-3.5'} ${canEdit ? '' : 'pointer-events-none opacity-75'}`}>
            {/* CÀI ĐẶT CƠ BẢN (GỌN GÀNG VỚI SEGMENTED CONTROL) */}
            <div className={`panel flex flex-col ${isCompact ? 'gap-2.5 p-3' : 'gap-3 p-4'}`}>
              <GroupLabel compact={isCompact}>{tr('title')}</GroupLabel>

              {/* Hàng 1: Bộ bài */}
              <div>
                <div className="label-sm mb-1 text-[#FFE5C4]/80">{tr('deck')}</div>
              <SegmentedControl
                value={deckType}
                options={[
                  { value: 'classic', label: tr('classic') },
                  { value: 'flip', label: tr('flip') },
                ]}
                onChange={(d) => setDeck(d as DeckType)}
                compact={isCompact}
                disabled={!canEdit}
              />
            </div>

            {/* Hàng 2: Số lá bắt đầu, Thời gian lượt, Điểm đích */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="label-sm mb-1 text-[#FFE5C4]/80">{tr('startingCards')}</div>
                <SegmentedControl
                  value={rules.startingCards}
                  options={[
                    { value: 5, label: '5' },
                    { value: 6, label: '6' },
                    { value: 7, label: '7' },
                  ]}
                  onChange={(sc) => setRules({ startingCards: sc })}
                  compact
                  disabled={!canEdit}
                />
              </div>

              <div>
                <div className="label-sm mb-1 text-[#FFE5C4]/80">{tr('turnSeconds')}</div>
                <SegmentedControl
                  value={rules.turnSeconds}
                  options={[
                    { value: 15, label: '15s' },
                    { value: 20, label: '20s' },
                    { value: 30, label: '30s' },
                  ]}
                  onChange={(ts) => setRules({ turnSeconds: ts })}
                  compact
                  disabled={!canEdit}
                />
              </div>

              <div>
                <div className="label-sm mb-1 text-[#FFE5C4]/80">{tr('targetScore')}</div>
                <SegmentedControl
                  value={rules.targetScore}
                  options={[
                    { value: 0, label: tr('single') },
                    { value: 200, label: '200' },
                    { value: 500, label: '500' },
                  ]}
                  onChange={(score) => setRules({ targetScore: score })}
                  compact
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Hàng 3: Chủ đề nền */}
            <div className="flex items-center justify-between rounded-xl bg-black/25 px-3 py-1.5 border border-white/10">
              <span className="label-sm text-[#FFE5C4]/80">{tr('bgTheme')}</span>
              <ThemePicker
                compact
                value={theme}
                disabled={!canEdit}
                onChange={(th) => setTheme(th)}
              />
            </div>
          </div>

          {/* LUẬT NHÀ (HOUSE RULES) */}
          <div className={`panel ${isCompact ? 'p-3' : 'p-3.5'}`}>
            <GroupLabel compact={isCompact}>{tr('houseRules')}</GroupLabel>
            <div className={`mt-2 grid grid-cols-2 ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
              {houseRules.map(([k, label, sub]) => (
                <button
                  key={k}
                  disabled={!canEdit}
                  onClick={() => { playSfx('click'); setRules({ [k]: !rules[k] } as never); }}
                  className={`flex items-center justify-between gap-2 rounded-[10px] bg-white/[.07] ${isCompact ? 'px-2.5 py-1.5' : 'px-3 py-2'
                    } text-left transition-all hover:bg-white/10 ${!canEdit ? 'cursor-not-allowed opacity-75' : ''}`}
                >
                  <span className="overflow-hidden">
                    <span className={`display block truncate leading-tight text-[#FFF3DA] ${isCompact ? 'text-[13px]' : 'text-[15px]'}`}>{label}</span>
                    <span className={`block truncate font-semibold text-[#C79A76] ${isCompact ? 'text-[10px]' : 'text-[11px]'}`}>{sub}</span>
                  </span>
                  <Toggle on={!!rules[k]} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

        {/* CỘT PHẢI: Bàn preview + hàng chờ + nút bắt đầu */}
        <div className={`flex w-[46%] flex-col ${isCompact ? 'gap-2.5 py-4 pl-2 pr-6' : 'gap-4 py-6 pl-2 pr-10'}`}>
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
                <SeatChip
                  key={i}
                  seat={s}
                  index={i}
                  meId={meId}
                  hostId={hostId}
                  canEdit={canEdit}
                  position={SEAT_POS[i]}
                  isCompact={isCompact}
                />
              ))}
            </div>

            <QueuePanel
              queue={queue}
              seats={seats}
              meId={meId}
              hostId={hostId}
              canEdit={canEdit}
              seatFromQueue={seatFromQueue}
              isCompact={isCompact}
            />
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

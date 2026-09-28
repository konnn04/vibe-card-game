'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Crown, UserX, X } from 'lucide-react';
import type { GameState } from '@u-no/game-engine';
import { playSfx } from '@/src/lib/audio';
import { isTakenOver } from '@/src/lib/takeover';
import { leavesNextRound, MIN_TABLE_AFTER_KICK } from '@/src/lib/rotation';
import { useAvatarLookup, useRoom } from '@/src/state/room';
import { Avatar } from './Avatar';

/**
 * BẢNG NGƯỜI CHƠI TRONG VÁN — mở từ bảng điểm gọn ở góc trên phải.
 *
 * Liệt kê người đang ngồi bàn (điểm, số lá, trạng thái) và người đang xem.
 * Chủ phòng (phòng online) có nút KICK cho từng người thật. Kick không phải
 * chặn: người bị kick vẫn vào lại bằng link được. Đang giữa ván thì máy đánh
 * thay họ tới hết ván rồi ghế được dọn lúc qua ván (xem server kickPlayer).
 */
export function PlayersModal({ state, myId, onClose }: { state: GameState; myId: string; onClose: () => void }) {
  const t = useTranslations('room');
  const tg = useTranslations('game');
  const th = useTranslations('howto');
  const online = useRoom((s) => s.mode === 'online');
  const hostId = useRoom((s) => s.hostId);
  const queue = useRoom((s) => s.queue);
  const seats = useRoom((s) => s.seats);
  const scores = useRoom((s) => s.scores);
  const kick = useRoom((s) => s.kick);
  const avatarOf = useAvatarLookup();
  const isHost = online && hostId === myId;
  // Bấm Kick lần 1 = hỏi lại, lần 2 = kick thật — tránh lỡ tay giữa ván.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ranked = state.players.slice().sort((a, b) => b.score - a.score);
  const bench = queue.filter((q) => !state.players.some((p) => p.id === q.id));

  // Ghế bị kick (kể cả bot) vẫn ngồi tới hết ván — không tính vào số người còn lại.
  const leavingIds = new Set(seats.filter((s) => leavesNextRound(s)).map((s) => s!.id));
  const staying = state.players.filter((p) => !leavingIds.has(p.id)).length;
  // Bàn còn ít người quá thì khoá kick người ĐANG NGỒI (người xem vẫn kick được).
  const tableLocked = staying <= MIN_TABLE_AFTER_KICK;

  const kickButton = (id: string, name: string, seatedTarget: boolean) => {
    if (!isHost || id === myId) return null;
    if (seatedTarget && leavingIds.has(id)) {
      return (
        <span className="label shrink-0 rounded-[9px] px-2 py-1 text-[10px]" style={{ background: 'rgba(255,255,255,.08)', color: '#C6A6F0' }}>
          {t('leavingNext')}
        </span>
      );
    }
    const locked = seatedTarget && tableLocked;
    const confirming = !locked && confirmId === id;
    return (
      <button
        type="button"
        disabled={locked}
        className="label flex shrink-0 cursor-pointer items-center gap-1 rounded-[9px] px-2 py-1 text-[11px] transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        style={confirming
          ? { background: 'linear-gradient(#E23B2E,#A5231A)', border: '1px solid #FFD34D', color: '#fff' }
          : { background: 'rgba(226,59,46,.16)', border: '1px solid rgba(226,59,46,.6)', color: '#FFB4A8' }}
        onClick={() => {
          playSfx('click');
          if (!confirming) { setConfirmId(id); return; }
          setConfirmId(null);
          kick(id);
        }}
        title={locked ? t('kickMinPlayers', { n: MIN_TABLE_AFTER_KICK }) : t('kick')}
      >
        <UserX size={13} />
        {confirming ? t('kickConfirm', { name }) : t('kick')}
      </button>
    );
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 grid place-items-center p-2 sm:p-4"
      style={{ background: 'rgba(10,4,16,.78)' }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-[min(94vw,460px)] flex-col rounded-[20px] p-3 sm:p-5"
        style={{ background: 'rgba(36,21,54,.96)', border: '1px solid rgba(255,255,255,.14)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full"
          style={{ background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
          onClick={onClose}
          aria-label={th('close')}
        >
          <X size={16} />
        </button>

        <div className="display mb-2 text-[20px] text-[#FFD34D] sm:mb-3 sm:text-[22px]">{t('tablePlayers')}</div>

        <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {ranked.map((p, i) => {
            const a = avatarOf(p.id);
            const me = p.id === myId;
            const afk = isTakenOver(p);
            return (
              <div
                key={p.id}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5"
                style={{
                  background: me ? 'linear-gradient(90deg,rgba(255,181,52,.28),rgba(255,138,43,.12))' : 'rgba(255,255,255,.06)',
                  border: `1px solid ${me ? 'rgba(255,181,52,.6)' : 'rgba(255,255,255,.12)'}`,
                  opacity: p.eliminated ? 0.55 : 1,
                }}
              >
                <div className="display w-5 text-center text-[14px] text-[#C6A6F0]">{i + 1}</div>
                <Avatar
                  name={p.name}
                  preset={a.preset}
                  avatarUrl={a.url}
                  self={me}
                  size={32}
                  className="seat__avatar !h-[32px] !w-[32px] !rounded-[8px] !border-2"
                />
                <div className="min-w-0 flex-1">
                  <div className="display flex items-center gap-1 truncate text-[15px] leading-tight text-[#F3ECFA]">
                    {p.id === hostId && online && <Crown size={13} className="shrink-0 text-[#FFD34D]" aria-label={t('host')} />}
                    <span className="truncate">{p.name}{me ? ` (${t('you')})` : ''}</span>
                    {afk && (
                      <span className="shrink-0 rounded px-1 text-[9px] font-bold" style={{ background: 'rgba(226,72,59,.9)', color: '#fff' }} title={tg('aiTookOver', { name: p.name })}>
                        {t('afkBadge')}
                      </span>
                    )}
                    {p.isBot && !afk && <Bot size={13} className="shrink-0 text-[#A48AC8]" aria-label={t('bot')} />}
                  </div>
                  <div className="label text-[10px] leading-tight text-[#A48AC8]">
                    {p.eliminated ? '💥' : tg('cards', { n: p.hand.length })} · {tg('total', { n: p.score })}
                  </div>
                </div>
                {kickButton(p.id, p.name, true)}
              </div>
            );
          })}

          {bench.length > 0 && (
            <>
              <div className="label mt-2 text-[10px] tracking-[.2em] text-[#C6A6F0]">{t('spectatorsLabel')} · {bench.length}</div>
              {bench.map((q) => {
                const a = avatarOf(q.id);
                return (
                  <div
                    key={q.id}
                    className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5"
                    style={{ background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.14)' }}
                  >
                    <div className="w-5" />
                    <Avatar
                      name={q.name}
                      preset={a.preset}
                      avatarUrl={a.url}
                      self={q.id === myId}
                      size={28}
                      className="seat__avatar !h-[28px] !w-[28px] !rounded-[8px] !border-2"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="display truncate text-[14px] leading-tight text-[#E4D8F2]">
                        {q.name}{q.id === myId ? ` (${t('you')})` : ''}
                      </div>
                      <div className="label text-[10px] leading-tight text-[#A48AC8]">{tg('total', { n: scores[q.id] ?? 0 })}</div>
                    </div>
                    {kickButton(q.id, q.name, false)}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {isHost && <div className="label mt-3 text-[10px] normal-case leading-snug tracking-normal text-[#A48AC8]">{t('kickHint')}</div>}
      </div>
    </div>
  );
}

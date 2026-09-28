'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { playSfx } from '@/src/lib/audio';
import { useSeatScreen, type ScreenPoint } from '@/src/state/seats';
import { serverNow } from '@/src/state/clock';

/**
 * CHỈ TAY TRÊN BÀN — thay cho bảng nút khi phải chọn NGƯỜI (bầu Chỉ tay, đổi bài
 * lá 7, Cọng xích). Một bàn tay to ở giữa bàn xoay theo con trỏ; hướng gần ghế
 * nào thì "bắt dính" vào ghế đó và kẻ vạch tới; bấm ở đâu cũng chọn đúng ghế
 * tay đang chỉ. Trên cảm ứng thì chạm thẳng vào ghế (vòng tròn đủ to để bấm).
 *
 * Vị trí ghế lấy từ useSeatScreen (chiếu từ camera 3D thật) nên luôn trùng chỗ
 * ngồi trên bàn, kể cả bàn 8 người hay khi đổi cỡ cửa sổ.
 */
export interface PointerTarget {
  id: string;
  name: string;
  /** Dòng phụ dưới tên (vd "12 lá") — để người chọn cân nhắc. */
  sub: string;
}

/** Trong phạm vi góc này (độ) quanh hướng tay thì coi là đang chỉ vào ghế. */
const SNAP_DEG = 40;

export function SeatPointer({
  open,
  title,
  subtitle,
  status,
  deadline,
  progress,
  targets,
  picks = 1,
  picked = [],
  onPick,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Dòng trạng thái nhỏ phụ thêm. */
  status?: string;
  /**
   * Hạn chót (epoch ms theo đồng hồ SERVER). Có thì hiện đồng hồ đếm ngược to
   * riêng — không mượn đồng hồ lượt vì nó đứng yên trong lúc phát animation.
   */
  deadline?: number;
  /** Tiến độ (vd số người đã bầu) — hiện thành dãy chấm. */
  progress?: { done: number; total: number; label: string };
  targets: PointerTarget[];
  /** Cần chọn mấy người: 1 (bầu, đổi bài) hoặc 2 (Cọng xích). */
  picks?: 1 | 2;
  /** Đã chọn (tô sáng). picks=1: người đang chọn (đổi được); picks=2: quản lý nội bộ. */
  picked?: string[];
  onPick?: (id: string) => void;
  onConfirm?: (ids: string[]) => void;
}) {
  const seats = useSeatScreen((s) => s.seats);
  const center = useSeatScreen((s) => s.center);
  const box = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<ScreenPoint | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  // Đếm ngược theo hạn chót thật (serverNow đã bù lệch đồng hồ với server).
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!open || !deadline) return;
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, [open, deadline]);
  const secs = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;

  // Mở lại (lượt chọn mới) thì xoá lựa chọn cũ của chế độ chọn 2 người.
  useEffect(() => {
    if (!open) return;
    return () => setChosen([]);
  }, [open]);

  // Tâm bàn: khung thông tin nằm ĐÚNG giữa bàn, bàn tay đặt ngay phía trên nó
  // và mọi hướng chỉ tính từ bàn tay. Phía dưới (trên quạt bài của mình) để
  // trống cho vòng "bản thân" khi chọn Cọng xích.
  const mid = center ?? { x: (typeof window !== 'undefined' ? window.innerWidth : 1280) / 2, y: 300 };
  const c = { x: mid.x, y: mid.y - 88 };
  const pts = targets
    .map((t) => ({ ...t, at: seats[t.id] }))
    .filter((t): t is PointerTarget & { at: ScreenPoint } => !!t.at);

  const angleTo = (p: ScreenPoint) => Math.atan2(p.y - c.y, p.x - c.x);
  const mouseAngle = mouse ? angleTo(mouse) : null;
  // Ghế gần hướng tay nhất (trong SNAP_DEG) = ghế đang được chỉ.
  let aimed: (typeof pts)[number] | null = null;
  if (mouseAngle !== null) {
    let best = Infinity;
    for (const t of pts) {
      let d = Math.abs(angleTo(t.at) - mouseAngle);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < best) { best = d; aimed = t; }
    }
    if (best > (SNAP_DEG * Math.PI) / 180) aimed = null;
  }
  const handAngle = aimed ? angleTo(aimed.at) : mouseAngle ?? -Math.PI / 2;
  const deg = (handAngle * 180) / Math.PI;
  // 👉 chỉ sang phải; quay quá 90° thì dùng 👈 để ngón cái không bị lộn ngược.
  const leftSide = Math.abs(deg) > 90;
  const glyph = leftSide ? '👈' : '👉';
  const glyphRot = leftSide ? deg - 180 * Math.sign(deg || 1) : deg;

  const selected = picks === 2 ? chosen : picked;

  const choose = (id: string) => {
    playSfx('click');
    if (picks === 1) {
      onPick?.(id);
      return;
    }
    // Chọn 2 người: bấm lại người đã chọn để bỏ; đủ 2 người là chốt luôn.
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    setChosen(next);
    if (next.length === 2) setTimeout(() => onConfirm?.(next), 280);
  };

  const localPoint = (e: React.PointerEvent): ScreenPoint => {
    const r = box.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={box}
          className="pointer-events-auto absolute inset-0 z-40 cursor-crosshair select-none"
          // Làm tối cả bàn để các ghế chọn được (vòng sáng) nổi hẳn lên.
          style={{ background: 'radial-gradient(ellipse at center, rgba(8,2,6,.45), rgba(8,2,6,.78))', touchAction: 'none' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerMove={(e) => setMouse(localPoint(e))}
          onPointerDown={(e) => {
            const p = localPoint(e);
            setMouse(p);
            // Tính lại ghế đang chỉ theo ĐÚNG điểm vừa bấm (cảm ứng không có hover).
            const a = angleTo(p);
            let best = Infinity;
            let hit: string | null = null;
            for (const t of pts) {
              let d = Math.abs(angleTo(t.at) - a);
              if (d > Math.PI) d = Math.PI * 2 - d;
              if (d < best) { best = d; hit = t.id; }
            }
            if (hit && best <= (SNAP_DEG * Math.PI) / 180) choose(hit);
          }}
        >
          {/* Tiêu đề + đồng hồ + số phiếu: GIỮA BÀN, ngay dưới bàn tay — đặt trên
              cùng màn hình thì đè ghế đối diện, đặt sát đáy thì đè vòng "bản thân". */}
          <div
            className="pointer-events-none absolute z-10 w-[min(80vw,380px)] rounded-[16px] px-4 py-2 text-center"
            style={{
              left: mid.x, top: mid.y, translate: '-50% -30%',
              background: 'rgba(20,8,12,.9)', border: '2px solid rgba(255,211,77,.7)', boxShadow: '0 10px 30px rgba(0,0,0,.6)',
            }}
          >
            <div className="flex items-center justify-center gap-3">
              <div className="display text-[22px] leading-tight text-[#FFD34D] sm:text-[28px]">{title}</div>
              {secs !== null && (
                <div
                  className="display grid h-11 w-11 shrink-0 place-items-center rounded-full text-[22px]"
                  style={{
                    background: secs <= 2 ? '#E23B2E' : '#FFD34D',
                    color: secs <= 2 ? '#fff' : '#2A1508',
                    boxShadow: '0 0 0 3px rgba(255,255,255,.8)',
                  }}
                >
                  {secs}
                </div>
              )}
            </div>
            {subtitle && <div className="mt-0.5 text-[11px] font-semibold leading-snug text-[#EDE0FA] sm:text-[13px]">{subtitle}</div>}
            {progress && (
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className="label text-[12px] tracking-[.12em] text-[#FFC98A]">{progress.label}</span>
                <span className="flex gap-1">
                  {Array.from({ length: progress.total }, (_, i) => (
                    <span
                      key={i}
                      className="h-3 w-3 rounded-full"
                      style={{ background: i < progress.done ? '#34D399' : 'rgba(255,255,255,.2)', boxShadow: i < progress.done ? '0 0 8px #34D399' : 'none' }}
                    />
                  ))}
                </span>
              </div>
            )}
            {status && <div className="label mt-1 text-[11px] tracking-[.2em] text-[#FFC98A] sm:text-[12px]">{status}</div>}
          </div>

          {/* Vạch từ tâm bàn tới ghế đang chỉ */}
          {aimed && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <line
                x1={c.x} y1={c.y} x2={aimed.at.x} y2={aimed.at.y}
                stroke="#FFD34D" strokeWidth={6} strokeDasharray="14 12" strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 6px rgba(255,180,40,.9))' }}
              />
            </svg>
          )}

          {/* Các ghế chọn được */}
          {pts.map((t) => {
            const isAimed = aimed?.id === t.id;
            const isPicked = selected.includes(t.id);
            return (
              <motion.button
                key={t.id}
                type="button"
                className="absolute grid place-items-center rounded-full text-center"
                style={{
                  left: t.at.x, top: t.at.y, translate: '-50% -50%', width: 116, height: 116,
                  // Nền ĐẶC để che hẳn thẻ tên bên dưới (chữ chồng chữ rất khó đọc).
                  background: isPicked
                    ? 'radial-gradient(circle, #FFD34D 0%, #FF9E2C 100%)'
                    : 'radial-gradient(circle, rgba(40,16,26,.97) 0%, rgba(22,8,14,.97) 100%)',
                  border: `5px solid ${isAimed ? '#FFFFFF' : '#FFD34D'}`,
                  boxShadow: isAimed || isPicked
                    ? '0 0 0 6px rgba(255,211,77,.35), 0 0 40px rgba(255,211,77,.95)'
                    : '0 0 18px rgba(255,211,77,.45)',
                }}
                // Ghế chưa chỉ tới thì "thở" nhẹ để báo là bấm được.
                animate={isAimed ? { scale: 1.16 } : { scale: [1, 1.06, 1] }}
                transition={isAimed ? { type: 'spring', stiffness: 400, damping: 22 } : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                // Bấm thẳng vào vòng tròn: chặn để khung ngoài không chọn lần nữa.
                onPointerDown={(e) => { e.stopPropagation(); choose(t.id); }}
              >
                <span className="px-1 leading-tight">
                  <span
                    className="display block max-w-[100px] truncate text-[16px]"
                    style={{ color: isPicked ? '#2A1508' : '#FFF3DA' }}
                  >
                    {t.name}
                  </span>
                  <span className="label block text-[11px]" style={{ color: isPicked ? '#5A2E0A' : '#FFE0B3' }}>{t.sub}</span>
                  {isPicked && <span className="block text-[16px] text-[#2A1508]">✔</span>}
                </span>
              </motion.button>
            );
          })}

          {/* Bàn tay to giữa bàn */}
          <motion.div
            className="pointer-events-none absolute text-[80px] leading-none sm:text-[104px]"
            style={{ left: c.x, top: c.y, translate: '-50% -50%', filter: 'drop-shadow(0 0 18px rgba(255,211,77,.85)) drop-shadow(0 8px 14px rgba(0,0,0,.6))' }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: glyphRot }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            {glyph}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

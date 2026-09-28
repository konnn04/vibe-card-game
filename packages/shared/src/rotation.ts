/**
 * XOAY VÒNG HÀNG CHỜ — ai nhường ghế cho ai ở ván sau.
 *
 * Phòng quá 4 người thì người thừa xếp hàng chờ, và sau mỗi ván một người đang
 * ngồi phải ra để người đầu hàng chờ vào. Quy tắc: ai đã chơi LIÊN TỤC nhiều ván
 * nhất thì ra trước; chủ phòng được giữ ghế (phòng còn cần người điều khiển bot
 * và bấm bắt đầu ván).
 */
export interface RotationInput<T extends { id: string; watchOnly?: boolean; isBot?: boolean }> {
  seats: (T | null)[];
  queue: T[];
  hostId: string;
  /** Số ván liên tục đã chơi, theo id người chơi. */
  consecutive: Record<string, number>;
}

export interface Rotation<T> {
  /** Chỉ số ghế bị đổi người. */
  seat: number;
  /** Vị trí trong hàng chờ của người sắp vào — KHÔNG phải lúc nào cũng là 0,
   *  vì người chọn "chỉ xem" bị bỏ qua. */
  queueIndex: number;
  out: T;
  in: T;
}

export function pickRotation<T extends { id: string; watchOnly?: boolean; isBot?: boolean }>(
  opts: RotationInput<T>,
): Rotation<T> | null {
  // Người trong hàng chờ có thể chọn CHỈ XEM. Họ vẫn ở trong phòng, vẫn thấy
  // bàn, nhưng không bao giờ bị đẩy vào ghế.
  const queueIndex = opts.queue.findIndex((q) => !q.watchOnly);
  const incoming = opts.queue[queueIndex];
  if (!incoming) return null;
  const candidates = opts.seats
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: T; i: number } => !!x.s && x.s.id !== opts.hostId)
    // Ghế đang do bot ngồi (bot thêm vào, hoặc bot giữ hộ người rớt mạng) nhường
    // trước — người thật đang chơi chỉ phải ra khi không còn ghế bot nào.
    .sort((a, b) =>
      Number(!!b.s.isBot) - Number(!!a.s.isBot)
      || (opts.consecutive[b.s.id] ?? 0) - (opts.consecutive[a.s.id] ?? 0));
  const out = candidates[0];
  if (!out) return null;
  return { seat: out.i, queueIndex, out: out.s, in: incoming };
}

/**
 * LẤP GHẾ TRỐNG từ hàng chờ — chạy TRƯỚC xoay vòng.
 *
 * Ván bắt đầu khi chưa đủ người (vd 3/4), rồi có người vào xem giữa chừng: sang
 * ván sau họ vào thẳng ghế trống, không ai phải nhường chỗ. Thiếu bước này thì
 * xoay vòng đổi 1-1 và bàn kẹt mãi ở số người lúc bắt đầu.
 * Trả về các cặp (ghế, vị trí hàng chờ GỐC) theo thứ tự lấp.
 */
export function fillFreeSeats<T extends { id: string; watchOnly?: boolean }>(
  seats: (T | null)[],
  queue: T[],
  maxSeats: number,
): { seat: number; queueIndex: number }[] {
  const out: { seat: number; queueIndex: number }[] = [];
  const taken = new Set<number>();
  for (let i = 0; i < Math.min(maxSeats, seats.length); i++) {
    if (seats[i]) continue;
    const qi = queue.findIndex((q, k) => !q.watchOnly && !taken.has(k));
    if (qi < 0) break;
    taken.add(qi);
    out.push({ seat: i, queueIndex: qi });
  }
  return out;
}

/**
 * GHẾ AFK: người THẬT đang bị máy ngồi giữ hộ (rớt mạng, bỏ đi, để hết giờ
 * nhiều lượt liền, hoặc bị chủ phòng kick giữa ván). Sang ván sau những ghế này
 * bị dọn khỏi phòng. Bot do chủ phòng thêm (id 'bot-...') KHÔNG tính — chúng ở lại.
 */
export const isAfkSeat = (s: { id: string; isBot?: boolean } | null | undefined): boolean =>
  !!s && !!s.isBot && !s.id.startsWith('bot-');

/**
 * Ghế sẽ TRỐNG ở ván sau: ghế AFK, hoặc ghế bị chủ phòng kick giữa ván
 * (`leaving` — áp cho cả bot, vì bot đang cầm bài không rút ra giữa ván được).
 */
export const leavesNextRound = (s: { id: string; isBot?: boolean; leaving?: boolean } | null | undefined): boolean =>
  !!s && (!!s.leaving || isAfkSeat(s));

/** Bỏ các ghế sẽ rời bàn ở ván sau (để trống chỗ) — xem leavesNextRound. */
export function withoutLeavingSeats<T extends { id: string; isBot?: boolean; leaving?: boolean }>(seats: (T | null)[]): (T | null)[] {
  return seats.map((s) => (leavesNextRound(s) ? null : s));
}

/** Số người ít nhất phải còn trên bàn thì chủ phòng mới được kick thêm người đang ngồi. */
export const MIN_TABLE_AFTER_KICK = 2;

/** Danh sách ghế SAU khi xoay vòng — dùng để hiện trước đội hình ván sau. */
export function seatsAfterRotation<T extends { id: string; watchOnly?: boolean; isBot?: boolean }>(
  opts: RotationInput<T> & { maxSeats?: number },
): (T | null)[] {
  const next = opts.seats.slice();
  const fills = fillFreeSeats(opts.seats, opts.queue, opts.maxSeats ?? opts.seats.length);
  if (fills.length) {
    for (const f of fills) next[f.seat] = opts.queue[f.queueIndex];
    return next;
  }
  const swap = pickRotation(opts);
  if (swap) next[swap.seat] = swap.in;
  return next;
}

/**
 * THU NHỎ BÀN (Hỗn loạn 8 ghế -> Cổ điển/Flip 4 ghế) ở phòng chờ.
 *
 * Số người dư được chọn NGẪU NHIÊN để xuống hàng chờ — không phải cứ ai ngồi
 * ghế 5-8 là phải ra. Bot bị bỏ trước (bot không xếp hàng chờ), chủ phòng luôn
 * giữ ghế (phòng cần người bấm bắt đầu). Người bị mời ra đứng ĐẦU hàng chờ vì
 * họ vốn đang ngồi. Những người còn lại dồn vào các ghế trong giới hạn.
 * `rnd` truyền vào để server/client tự chọn nguồn ngẫu nhiên.
 */
export function shrinkSeats<T extends { id: string; isBot?: boolean }>(
  seats: (T | null)[],
  queue: T[],
  maxPlayers: number,
  hostId: string,
  rnd: () => number = Math.random,
): { seats: (T | null)[]; queue: T[] } {
  const next = seats.slice();
  const seated = next.map((p, i) => ({ p, i })).filter((x): x is { p: T; i: number } => !!x.p);
  const excess = seated.length - maxPlayers;
  const bumped: T[] = [];
  if (excess > 0) {
    const bots = seated.filter((x) => x.p.isBot);
    const humans = seated.filter((x) => !x.p.isBot && x.p.id !== hostId);
    for (let i = humans.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [humans[i], humans[j]] = [humans[j], humans[i]];
    }
    for (const x of [...bots, ...humans].slice(0, excess)) {
      next[x.i] = null;
      if (!x.p.isBot) bumped.push(x.p);
    }
  }
  // Ai còn ngồi ngoài giới hạn thì dồn vào ghế trống phía trong.
  for (let i = maxPlayers; i < next.length; i++) {
    const p = next[i];
    if (!p) continue;
    next[i] = null;
    const free = next.findIndex((st, k) => !st && k < maxPlayers);
    if (free >= 0) next[free] = p;
    else if (!p.isBot) bumped.push(p); // không xảy ra khi excess đã tính đúng — lưới an toàn
  }
  return { seats: next, queue: [...bumped, ...queue.filter((q) => !bumped.some((b) => b.id === q.id))] };
}

import type {
  Action, Card, CardColor, DeckSide, DeckType, EngineResult, GameEvent, GameState, Phase, PlayerState, Rules,
} from './types';
import { LIGHT_TO_DARK } from './deck';
import { mulberry32, shuffle } from './rng';
import { DEFAULT_RULES, canJumpIn, canPlay, handScore, isWildValue, pendingKey } from './rules';
import { face } from './palette';
import { baseRulesFor, buildDeck, colorsFor, getMode } from './modes';

const DARK_TO_LIGHT: Record<string, CardColor> = {
  pink: 'red', teal: 'yellow', orange: 'green', purple: 'blue', wild: 'wild',
};

export interface PlayerSeed { id: string; name: string; isBot?: boolean; team?: 0 | 1; score?: number }

export interface CreateGameOpts {
  seed: number;
  deckType?: DeckType;
  rules?: Partial<Rules>;
  players: PlayerSeed[];
  now?: number;
}

function emptyState(opts: CreateGameOpts): GameState {
  const deckType = opts.deckType ?? 'classic';
  const rules = baseRulesFor(deckType, opts.rules, DEFAULT_RULES);
  return {
    seed: opts.seed,
    deckType,
    rules,
    side: 'light',
    players: opts.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      team: (p.team ?? (i % 2)) as 0 | 1,
      hand: [],
      score: p.score ?? 0,
      calledRush: false,
      consecutiveRounds: 0,
      connected: true,
    })),
    turn: 0,
    direction: 1,
    drawPile: [],
    discard: [],
    activeColor: 'red',
    wildColors: {},
    playedSide: {},
    pending: null,
    vote: null,
    chain: null,
    pileUp: null,
    phase: 'dealing',
    turnDeadline: 0,
    turnHoldUntil: 0,
    turnHoldKind: null,
    rushWindow: null,
    resume: null,
    drawnThisTurn: false,
    drawRun: null,
    roundNo: 0,
    winnerId: null,
    lastScores: {},
    roundPoints: {},
    eventSeq: 0,
  };
}

/** Tạo ván mới (đã chia bài + mở lá đầu). `events` là kịch bản cho layer animation. */
export function createGame(opts: CreateGameOpts): EngineResult {
  return startRound(emptyState(opts), opts.seed, opts.now ?? Date.now());
}

export function startRound(prev: GameState, seed: number, now = Date.now()): EngineResult {
  const s: GameState = {
    ...prev,
    seed,
    side: 'light',
    drawPile: buildDeck(prev.deckType, seed),
    discard: [],
    pending: null,
    vote: null,
    chain: null,
    pileUp: null,
    resume: null,
    direction: 1,
    drawnThisTurn: false,
    drawRun: null,
    rushWindow: null,
    winnerId: null,
    lastScores: {},
    roundPoints: {},
    wildColors: {}, playedSide: {}, // ván mới -> id lá đánh số lại, màu Wild ván trước không còn ý nghĩa
    roundNo: prev.roundNo + 1,
    phase: 'dealing',
    players: prev.players.map((p) => ({ ...p, hand: [], calledRush: false, eliminated: false })),
  };
  const events: GameEvent[] = [];
  // chia bài vòng tròn từng lá một (khớp animation "chia bài thật")
  for (let round = 0; round < s.rules.startingCards; round++) {
    for (let i = 0; i < s.players.length; i++) {
      const card = s.drawPile.pop()!;
      s.players[i].hand.push(card);
    }
  }
  for (const p of s.players) {
    events.push({ t: 'deal', playerId: p.id, cardId: '', order: 0 });
  }
  // lá mở đầu: bỏ qua wild/action để ván bắt đầu sạch
  let first = s.drawPile.pop()!;
  let guard = 0;
  while (guard++ < 120 && !/^\d$/.test(face(first, 'light').value)) {
    s.drawPile.unshift(first);
    first = s.drawPile.pop()!;
  }
  s.discard.push(first);
  s.playedSide[first.id] = s.side;
  s.activeColor = face(first, s.side).color;
  s.turn = Math.floor(mulberry32(seed ^ 0x51ed)() * s.players.length) % s.players.length;
  s.phase = 'awaitPlay';
  // 4000ms buffer cho intro countdown 3-2-1 + animation chia bài để người chơi không bị trừ thời gian oan
  s.turnHoldUntil = now + 4000;
  s.turnHoldKind = 'effect';
  s.turnDeadline = now + 4000 + s.rules.turnSeconds * 1000;
  events.push({ t: 'play', playerId: '', cardId: first.id, pileIndex: 0 });
  events.push({ t: 'turn', playerId: s.players[s.turn].id, deadline: s.turnDeadline });
  return { state: s, events };
}

/* ------------------------------------------------------------------ helpers */

const clone = (s: GameState): GameState => ({
  ...s,
  players: (s.players || []).map((p) => ({ ...p, hand: Array.isArray(p.hand) ? p.hand.slice() : [] })),
  drawPile: Array.isArray(s.drawPile) ? s.drawPile.slice() : [],
  discard: Array.isArray(s.discard) ? s.discard.slice() : [],
  pending: s.pending ? { ...s.pending } : null,
  vote: s.vote ? { ...s.vote, votes: { ...s.vote.votes } } : null,
  chain: s.chain ? { ...s.chain } : null,
  pileUp: s.pileUp ? { ...s.pileUp, cards: s.pileUp.cards.slice() } : null,
  resume: s.resume ? { ...s.resume } : null,
  rushWindow: s.rushWindow ? { ...s.rushWindow } : null,
  lastScores: { ...(s.lastScores || {}) },
  roundPoints: { ...(s.roundPoints || {}) },
  wildColors: { ...(s.wildColors || {}) },
  playedSide: { ...(s.playedSide || {}) },
});

const idx = (s: GameState, playerId: string) => s.players.findIndex((p) => p.id === playerId);
const wrap = (s: GameState, i: number) => ((i % s.players.length) + s.players.length) % s.players.length;
/**
 * Người thứ n tính từ `from` theo chiều đang chơi, BỎ QUA người đã bị loại (vỡ
 * trận). n âm = đi ngược chiều. `from` có thể chính là người vừa bị loại.
 */
const step = (s: GameState, from: number, n = 1) => {
  const dir = s.direction * Math.sign(n || 1);
  let i = from;
  for (let k = 0; k < Math.abs(n); k++) {
    let guard = 0;
    do { i = wrap(s, i + dir); } while (s.players[i].eliminated && guard++ < s.players.length);
  }
  return i;
};
/** Số người CÒN trong ván (chưa bị loại). */
const activeCount = (s: GameState) => s.players.filter((p) => !p.eliminated).length;

/*
 * VỠ TRẬN — luật tuỳ chọn Rules.blowUp, ngưỡng Rules.blowUpAt (mặc định theo
 * mode: DeckMode.eliminateOver — Hỗn loạn 30, Party 36, No Mercy 24).
 * Tay bài vượt ngưỡng (do bị phạt/rút bài) thì bị loại ngay: bộ Hỗn loạn dày
 * đặc lá phạt, 8 người chồng qua chồng lại thì bài dồn hết lên tay và ván không
 * bao giờ kết thúc (mô phỏng 8 bot: ~7% số ván kẹt vĩnh viễn, tay tới 80+ lá).
 */

function ensureDraw(s: GameState, n: number, events: GameEvent[]): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (!s.drawPile.length) {
      if (s.discard.length <= 1) break;
      const top = s.discard.pop()!;
      // Lá quay lại bộ rút là lá "sạch": xoá màu Wild đã chọn và mặt lúc đánh.
      // LỖI CŨ: wildColors giữ nguyên tới hết ván nên rút lại đúng lá Wild +4
      // đó thì nó hiện sẵn màu cũ trên tay (dù đánh ra vẫn phải chọn màu).
      for (const c of s.discard) {
        delete s.wildColors[c.id];
        delete s.playedSide[c.id];
      }
      s.drawPile = shuffle(s.discard, mulberry32(s.seed ^ (s.eventSeq + 7) ^ 0xbeef));
      s.discard = [top];
      events.push({ t: 'reshuffle' });
    }
    const c = s.drawPile.pop();
    if (!c) break;
    out.push(c);
  }
  return out;
}

/**
 * Rút `n` lá cho người chơi. Party — nếu người này đang bị Cọng xích, người bị
 * xích cùng tự rút đúng số lá vừa rút (`mirror=false` ở lượt nhân bản để hai
 * người không kéo nhau vô hạn).
 */
function give(s: GameState, playerIdx: number, n: number, penalty: boolean, events: GameEvent[], fast = false, mirror = true) {
  const cards = ensureDraw(s, n, events);
  s.players[playerIdx].hand.push(...cards);
  if (cards.length) {
    if (s.players[playerIdx].hand.length > 1) s.players[playerIdx].calledRush = false;
    // Đã rút thêm bài thì KHÔNG còn 1 lá -> đóng cửa sổ hô. Thiếu dòng này thì
    // người vừa bị phạt rút lên 3 lá vẫn bị bắt Ú Nồ và ăn thêm +2.
    if (s.rushWindow?.playerId === s.players[playerIdx].id && s.players[playerIdx].hand.length !== 1) {
      s.rushWindow = null;
    }
    events.push({ t: 'draw', playerId: s.players[playerIdx].id, cardIds: cards.map((c) => c.id), penalty, fast });
    checkEliminate(s, playerIdx, events);
    if (mirror) pullChain(s, playerIdx, cards.length, penalty, events);
  }
  return cards;
}

/** Party — người kia trong Cọng xích rút theo `n` lá. */
function pullChain(s: GameState, playerIdx: number, n: number, penalty: boolean, events: GameEvent[]) {
  const ch = s.chain;
  if (!ch || n <= 0) return;
  const me = s.players[playerIdx].id;
  const other = me === ch.a ? ch.b : me === ch.b ? ch.a : null;
  if (!other) return;
  const oi = idx(s, other);
  if (oi < 0 || s.players[oi].eliminated) return;
  events.push({ t: 'chainPull', from: me, to: other, n });
  give(s, oi, n, penalty, events, true, false);
}

/**
 * Loại người chơi nếu tay bài vượt ELIMINATE_OVER (chỉ bộ Hỗn loạn). Bài của
 * họ xáo lại vào ĐÁY chồng rút (không ai được biết thứ tự). Trả về true nếu bị
 * loại — caller tự lo chuyển lượt / kết ván (xem settleEliminations).
 */
// RULE-ASSUMPTION (No Mercy): spec để bài người bị loại "riêng, gộp vào khi
// xáo lại". Ở đây xáo chúng vào ĐÁY chồng rút ngay: chỉ tới lượt được rút khi
// chồng rút cũ đã cạn — cùng kết quả, nhưng không cần thêm một chồng bài nữa.
function checkEliminate(s: GameState, playerIdx: number, events: GameEvent[]): boolean {
  const p = s.players[playerIdx];
  if (!s.rules.blowUp || p.eliminated || p.hand.length <= s.rules.blowUpAt) return false;
  const cards = p.hand.length;
  s.drawPile = [...shuffle(p.hand, mulberry32(s.seed ^ (s.eventSeq + 13) ^ 0x5eed)), ...s.drawPile];
  p.hand = [];
  p.eliminated = true;
  p.calledRush = false;
  if (s.rushWindow?.playerId === p.id) s.rushWindow = null;
  events.push({ t: 'eliminated', playerId: p.id, cards });
  return true;
}

/**
 * Sau một nước có thể loại người: còn đúng 1 người thì người đó thắng ván.
 * Trả về true nếu ván đã kết thúc (caller dừng xử lý tiếp).
 */
function settleEliminations(s: GameState, events: GameEvent[]): boolean {
  if (s.phase === 'roundEnd' || s.phase === 'matchEnd') return true;
  if (activeCount(s) > 1) return false;
  const last = s.players.findIndex((p) => !p.eliminated);
  s.drawRun = null;
  endRound(s, Math.max(0, last), events);
  return true;
}

/**
 * Rút tới khi lộ đúng màu, TẤT CẢ TRONG MỘT NHỊP.
 *
 * Chỉ còn dùng cho đúng một chỗ: lá cuối cùng của ván là Wild Draw Color —
 * người kế tiếp vẫn phải ăn phạt trước khi chốt điểm. Ván kết thúc ngay sau đó
 * nên không có ai đang chờ animation, không cần tách từng lá như drawRun.
 * Mọi đường rút bài TRONG ván đều đi qua drawRun (từng lá một).
 */
function giveUntilColor(s: GameState, playerIdx: number, color: CardColor, events: GameEvent[]): number {
  const drawn: Card[] = [];
  let guard = 0;
  while (guard++ < MAX_DRAW_RUN) {
    const c = ensureDraw(s, 1, events)[0];
    if (!c) break;
    drawn.push(c);
    if (face(c, s.side).color === color) break;
  }
  s.players[playerIdx].hand.push(...drawn);
  if (drawn.length) {
    if (s.players[playerIdx].hand.length > 1) s.players[playerIdx].calledRush = false;
    events.push({ t: 'draw', playerId: s.players[playerIdx].id, cardIds: drawn.map((c) => c.id), penalty: true });
    pullChain(s, playerIdx, drawn.length, true, events);
  }
  return drawn.length;
}

/**
 * Buffer thời gian (ms) cộng thêm vào turnDeadline của lượt KẾ TIẾP khi lượt
 * hiện tại kết thúc bằng 1 animation dài phía client (rút bài tuần tự từng lá
 * 0.5s/lá, hoặc biểu tượng cấm lượt) — để không ai bị trừ oan thời gian nghĩ
 * trong lúc animation đang chạy. Không "tạm dừng" đồng hồ theo nghĩa dừng hẳn
 * (turnDeadline vẫn là 1 mốc thời gian tuyệt đối, đơn giản & đúng cho cả
 * online lẫn offline) — chỉ DỜI mốc đó ra xa thêm đúng bằng thời lượng
 * animation dự kiến, hiệu quả tương đương với người chơi không hề bị đếm giờ
 * trong lúc animation diễn ra.
 */
/** Bài bay từ tay ra đống discard (client: dur 0.42s + đệm) — giai đoạn SAU ĐÁNH. */
const PLAY_ANIM_MS = 550;
const SKIP_ANIM_MS = 1300;
/** Lật cả bàn (Flip): mọi lá xoay đổi mặt. */
const FLIP_ANIM_MS = 900;
/** Luật 0/7: gom bài -> trao cho nhau -> xoè lại. */
const SWAP_ANIM_MS = 1100;
/** Bắt lỗi +4: lật ngửa tay bài kẻ bị nghi cho cả bàn xem rồi mới phạt. */
const CHALLENGE_ANIM_MS = 1400;

/**
 * PARTY — Chỉ tay: thời gian bầu kín (tính từ lúc lá bay xong) và trần số lá
 * phải rút theo số phiếu. Đủ phiếu sớm thì lộ kết quả ngay, không chờ hết giờ.
 */
export const VOTE_MS = 6000;
export const VOTE_MAX_DRAW = 5;
/** Màn lộ kết quả bình chọn trước khi bài phạt bay. */
const VOTE_REVEAL_MS = 1600;
/** Cọng xích nối 2 người. */
const CHAIN_ANIM_MS = 1100;
/** No Mercy — màu Roulette vừa chọn hiện lên trước khi bắt đầu lật bài. */
const COLOR_PICK_MS = 700;
/** Mở chồng phụ 3 lá con (lật lá mồi) / ôm cả chồng phụ về tay. */
const PILE_START_MS = 900;
const PILE_TAKE_MS = 1100;

/**
 * Trần an toàn cho mọi khoảng "giữ nhịp" (turnHoldUntil). Chỉ là lưới chống
 * TREO VĨNH VIỄN nếu một mốc thời gian bị hỏng — KHÔNG phải để cắt ngắn
 * animation, nên phải rộng hơn animation dài nhất có thật:
 *   rút chồng phạt nặng nhất (+4 chồng +4 chồng +4 = 12 lá) x DRAW_STEP_MS
 *   = 12 * 600 = 7200ms.
 * Đặt 8000ms. Client (useTurnHold) và server (room.ts) PHẢI dùng chung hằng số
 * này: lệch nhau là bot hành động giữa lúc animation rút bài còn đang chạy.
 */
export const MAX_HOLD_MS = 8000;

/**
 * ÂN HẠN HÔ Ú NỒ: sau khi ai đó đánh xuống còn 1 lá, trong chừng này chỉ CHÍNH
 * HỌ được bấm hô. Hết ân hạn người khác mới bắt được.
 *
 * Chặn ở ENGINE chứ không chỉ ẩn nút phía client: ẩn nút chỉ là gợi ý giao diện,
 * ai sửa client hoặc bot phản xạ nhanh vẫn bắt được ngay lập tức, và người chơi
 * thật thì không đời nào kịp — đúng cái "spam bắt uno mà không kịp hô".
 */
export const RUSH_GRACE_MS = 2000;

function setTurn(
  s: GameState,
  next: number,
  now: number,
  events: GameEvent[],
  extraMs = 0,
  kind: 'effect' | 'play' = 'play',
) {
  s.turn = next;
  s.drawnThisTurn = false;
  s.drawRun = null;
  s.mustPlayCardId = null;
  s.turnHoldUntil = now + extraMs;
  s.turnHoldKind = extraMs > 0 ? kind : null;
  s.turnDeadline = now + extraMs + s.rules.turnSeconds * 1000;
  events.push({ t: 'turn', playerId: s.players[next].id, deadline: s.turnDeadline });
}

/**
 * Rút bài CHỦ ĐỘNG giữa lượt (lượt KHÔNG đổi người, vd bấm "Rút bài" khi
 * không bị stack) — GIỮ NGUYÊN thời gian nghĩ còn lại, chỉ dời turnDeadline
 * ra xa thêm đúng bằng thời lượng animation, và đóng băng hiển thị (client)
 * trong lúc đó qua turnHoldUntil — đúng yêu cầu "rút bài dừng thời gian, chờ
 * rút xong mới đếm tiếp" mà KHÔNG reset về nguyên 1 lượt turnSeconds mới
 * (khác setTurn — đó là bắt đầu lượt mới, còn đây vẫn cùng 1 lượt).
 */
function pauseFor(s: GameState, now: number, ms: number, kind: 'effect' | 'play' = 'effect') {
  if (ms <= 0) return;
  s.turnDeadline += ms;
  s.turnHoldUntil = Math.max(s.turnHoldUntil, now + ms);
  s.turnHoldKind = kind;
}

/**
 * Thời lượng animation của ĐÚNG 1 lá rút (bay từ chồng bài về tay, ~0.42-0.56s
 * ở client) + một nhịp nghỉ nhỏ để mắt kịp nhận ra đã thêm lá mới.
 */
const DRAW_STEP_MS = 600;

/** Trần số lá của 1 chuỗi rút — chống lặp vô hạn nếu bộ bài hỏng. */
const MAX_DRAW_RUN = 60;

/**
 * MỘT BƯỚC của chuỗi rút: lấy đúng 1 lá, rồi mới xét đã đủ điều kiện dừng chưa.
 *
 * Chưa đủ -> giữ nguyên lượt, đóng băng đồng hồ đúng bằng thời lượng bay của
 * lá vừa rút (pauseFor) và để `drawRun` khác null; người chơi/bot sẽ gửi DRAW
 * tiếp khi hết hold. Nhờ vậy "rút 1 lá - chờ animation - check - rút tiếp"
 * đúng theo nhịp nhìn thấy trên màn hình, thay vì quyết định sẵn cả chuỗi rồi
 * bù thời gian sau.
 */
function drawStep(s: GameState, pi: number, now: number, events: GameEvent[]): EngineResult {
  const run = s.drawRun!;
  // 'fixed' biết trước phải rút mấy lá -> đổ nhanh. 'toMatch'/'color' phải lật
  // xem từng lá mới biết dừng chưa -> chậm, có nhịp nghỉ.
  const card = give(s, pi, 1, run.penalty, events, run.kind === 'fixed')[0];
  run.count++;

  // Vỡ trận giữa chuỗi rút -> dừng chuỗi, lượt sang người kế (hoặc kết ván).
  if (s.players[pi].eliminated) {
    s.drawRun = null;
    if (!settleEliminations(s, events)) setTurn(s, step(s, pi), now, events, DRAW_STEP_MS, 'effect');
    return { state: s, events };
  }

  let done: boolean;
  if (!card) done = true;                    // hết sạch bài cả rút lẫn discard
  else if (run.kind === 'fixed') done = (run.remaining = (run.remaining ?? 1) - 1) <= 0;
  else if (run.kind === 'color') done = face(card, s.side).color === run.color;
  else done = canPlay(card, s);              // toMatch
  if (run.count >= MAX_DRAW_RUN) done = true;

  if (!done) {
    // Còn rút tiếp: lượt KHÔNG đổi người, đồng hồ đứng yên chờ lá này bay xong.
    pauseFor(s, now, DRAW_STEP_MS);
    return { state: s, events };
  }

  s.drawRun = null;
  if (run.endsTurn) {
    setTurn(s, step(s, pi), now, events, DRAW_STEP_MS, 'effect');
  } else {
    // Rút chủ động: rút được lá đánh được thì vẫn là lượt mình (đánh tiếp),
    // không thì mất lượt.
    s.drawnThisTurn = true;
    if (card && canPlay(card, s)) {
      // No Mercy: rút trúng lá đánh được thì BẮT BUỘC đánh đúng lá đó.
      if (getMode(s.deckType).mustPlayDrawn && s.rules.forcePlay) s.mustPlayCardId = card.id;
      pauseFor(s, now, DRAW_STEP_MS);
    } else setTurn(s, step(s, pi), now, events, DRAW_STEP_MS, 'effect');
  }
  return { state: s, events };
}

/**
 * TAY BÀI ĐỔI CHỦ (luật 7 đổi 1-1, luật 0 xoay cả bàn) -> gán lại quyền và
 * nghĩa vụ hô Ú Nồ THEO BÀI, không dính vào người.
 *
 * LỖI ĐÃ SỬA: `rushWindow` trỏ vào người chơi và không hề được cập nhật khi đổi
 * bài. Kịch bản thật: tôi còn 2 lá, đánh lá 7 (còn 1 lá) -> cửa sổ hô mở trên
 * TÔI. Đổi bài xong, lá đơn độc đó sang tay người kia, tôi cầm nguyên tay bài
 * dày của họ — nhưng cửa sổ vẫn ghi tên tôi, nên người khác hô bắt là TÔI ăn
 * +2 dù tôi chẳng còn 1 lá nào.
 *
 * Sau khi đổi: ai cầm tay bài MỚI thì phải hô lại từ đầu (tay bài khác rồi,
 * không thể ăn theo tiếng hô cũ), cửa sổ đóng nếu chủ cũ không còn đúng 1 lá,
 * và mở cho người thật sự đang cầm 1 lá.
 */
function refreshRushWindow(s: GameState, now: number, events: GameEvent[], changed: number[]) {
  // Tay bài mới => tiếng hô cũ không còn giá trị.
  for (const i of changed) s.players[i].calledRush = false;
  // Không còn đúng 1 lá thì cũng chẳng có gì để hô.
  for (const p of s.players) if (p.hand.length !== 1) p.calledRush = false;

  const holder = s.rushWindow ? s.players.find((p) => p.id === s.rushWindow!.playerId) : null;
  if (!holder || holder.hand.length !== 1 || holder.calledRush) s.rushWindow = null;

  const needCall = s.players.find((p) => p.hand.length === 1 && !p.calledRush);
  if (!needCall) return;
  if (!s.rules.rushPenalty) {
    // Tắt luật phạt -> tự hô hộ, không ai bị bắt.
    needCall.calledRush = true;
    events.push({ t: 'rush', playerId: needCall.id });
    return;
  }
  if (!s.rushWindow) s.rushWindow = { playerId: needCall.id, openedAt: now, until: now + s.rules.turnSeconds * 1000 };
}

/** Còn đúng 1 lá -> mở cửa sổ hô RUSH (tự hô hộ nếu tắt luật phạt). */
function openRushIfOneCard(s: GameState, pi: number, now: number, events: GameEvent[]) {
  if (s.players[pi].hand.length !== 1 || s.players[pi].calledRush) return;
  if (s.rules.rushPenalty) {
    s.players[pi].calledRush = false;
    s.rushWindow = { playerId: s.players[pi].id, openedAt: now, until: now + s.rules.turnSeconds * 1000 };
  } else {
    s.players[pi].calledRush = true;
    events.push({ t: 'rush', playerId: s.players[pi].id });
  }
}

/**
 * PARTY — chốt vòng bình chọn Chỉ tay: lộ phiếu, ai nhận N phiếu rút
 * min(N, VOTE_MAX_DRAW) lá, rồi lượt sang người kế của người đánh lá.
 */
function resolveVote(s: GameState, now: number, events: GameEvent[]) {
  const v = s.vote!;
  // Đảm bảo bot chưa kịp gửi phiếu trước deadline luôn được tự động bỏ phiếu hợp lệ
  for (const p of s.players) {
    if (p.isBot && !p.eliminated && !v.votes[p.id]) {
      const target = s.players
        .filter((t) => t.id !== p.id && !t.eliminated && !(s.rules.teamMode && t.team === p.team))
        .sort((a, b) => a.hand.length - b.hand.length)[0]
        ?? s.players.find((t) => t.id !== p.id && !t.eliminated);
      if (target) {
        v.votes[p.id] = target.id;
      }
    }
  }
  const tally: Record<string, number> = {};
  for (const target of Object.values(v.votes)) if (target) tally[target] = (tally[target] ?? 0) + 1;
  events.push({ t: 'voteResult', tally, votes: { ...v.votes } });
  s.vote = null;
  s.phase = 'awaitPlay';
  let most = 0;
  s.players.forEach((p, i) => {
    const n = Math.min(tally[p.id] ?? 0, VOTE_MAX_DRAW);
    if (n <= 0 || p.eliminated) return;
    give(s, i, n, true, events, true);
    award(s, v.by, n * ACTION_POINTS.drawPerCard);
    most = Math.max(most, n);
  });
  if (settleEliminations(s, events)) return;
  const byIdx = Math.max(0, idx(s, v.by));
  if (byIdx >= 0) openRushIfOneCard(s, byIdx, now, events);
  const drawAnim = most > 0 ? Math.min((most - 1) * 75 + 260 + 250, 3000) : 0;
  setTurn(s, step(s, byIdx), now, events, VOTE_REVEAL_MS + drawAnim, 'effect');
}

/**
 * Hai người bị xích khi người đánh không kịp chọn (hết giờ) hoặc là bot: hai
 * ĐỐI THỦ ít bài nhất (xích người sắp thắng lại với nhau). Bàn chỉ có 2 người
 * thì xích đối thủ với chính mình.
 */
export function autoChainTargets(s: GameState, playerId: string): [string, string] {
  const others = s.players
    .filter((p) => p.id !== playerId && !p.eliminated)
    .sort((a, b) => a.hand.length - b.hand.length)
    .map((p) => p.id);
  return [others[0] ?? playerId, others[1] ?? playerId];
}

/**
 * Màu (trong số màu lá `card` được gọi) mà người chơi đang giữ NHIỀU NHẤT —
 * dùng khi hết giờ phải chọn màu hộ. Hoà thì lấy màu đứng trước trong bảng màu.
 */
function mostHeldColor(s: GameState, playerId: string, card: Card | undefined): CardColor {
  const palette = colorsFor(s, card);
  const hand = s.players.find((p) => p.id === playerId)?.hand ?? [];
  const count = (c: CardColor) => hand.filter((h) => face(h, s.side).color === c).length;
  return palette.reduce((best, c) => (count(c) > count(best) ? c : best), palette[0]);
}

function reject(s: GameState, playerId: string, reason: string): EngineResult {
  return { state: s, events: [{ t: 'reject', playerId, reason }] };
}

/**
 * ĐIỂM THƯỞNG THEO HÀNH ĐỘNG — để cả 4 người đều có điểm, không phải chỉ người
 * thắng ôm trọn.
 *
 * Thưởng cho việc GÂY ÁP LỰC lên người khác chứ không phải cho may mắn: bắt
 * người ta rút bài, cấm lượt, bẻ chiều, chộp được tiếng hô thiếu. Nhờ vậy người
 * thua vẫn có điểm an ủi tương xứng với những gì họ làm được trong ván.
 */
export const ACTION_POINTS = {
  /** Mỗi lá đánh ra — điểm nền, ai chơi tích cực cũng có. */
  play: 1,
  /** Đánh chen cướp lượt. */
  jumpIn: 4,
  /** Bẻ chiều. */
  reverse: 3,
  /** Cấm lượt người khác (skip / skip all). */
  skip: 5,
  /** Mỗi LÁ bắt người khác phải rút (+2 -> 4đ, +4 -> 8đ). */
  drawPerCard: 2,
  /** Hô Ú Nồ kịp lúc. */
  rush: 5,
  /** Chộp được người quên hô. */
  catch: 10,
  /** Bắt lỗi +4 thành công. */
  challenge: 12,
} as const;

function award(s: GameState, playerId: string, points: number) {
  if (points <= 0) return;
  s.roundPoints[playerId] = (s.roundPoints[playerId] ?? 0) + points;
}

function endRound(s: GameState, winnerIdx: number, events: GameEvent[]) {
  const winner = s.players[winnerIdx];
  // Điểm từ bài còn lại của đối thủ + thưởng cho mỗi người bị loại (No Mercy: 250,
  // bỏ qua bài của họ — bài đó đã trả về chồng rút lúc bị loại).
  const bonus = getMode(s.deckType).eliminationBonus;
  const pot = s.players.reduce(
    (sum, p, i) => (i === winnerIdx ? sum : sum + (p.eliminated ? bonus : handScore(p.hand, s.side, s.deckType))),
    0,
  );
  const scores: Record<string, number> = {};
  for (const p of s.players) {
    const potShare = s.rules.teamMode ? (p.team === winner.team ? pot : 0) : p.id === winner.id ? pot : 0;
    // Người thua vẫn nhận điểm hành động đã tích trong ván -> không ai về 0.
    const gain = potShare + (s.roundPoints[p.id] ?? 0);
    p.score += gain;
    scores[p.id] = gain;
    p.consecutiveRounds += 1;
  }
  s.lastScores = scores;
  s.winnerId = winner.id;
  s.phase = 'roundEnd';
  s.rushWindow = null;
  s.pending = null;
  s.resume = null;
  events.push({ t: 'roundEnd', winnerId: winner.id, scores });
  if (s.rules.targetScore > 0 && s.players.some((p) => p.score >= s.rules.targetScore)) {
    const champ = s.players.slice().sort((a, b) => b.score - a.score)[0];
    s.phase = 'matchEnd';
    events.push({ t: 'matchEnd', winnerId: champ.id });
  }
}

/** Đổi side Light/Dark (lá Flip) — activeColor phải map sang hệ màu tương ứng. */
function flipSide(s: GameState, events: GameEvent[]) {
  s.side = s.side === 'light' ? 'dark' : 'light';

  // Lật bàn = LẬT LUÔN LÁ TRÊN ĐỈNH đống, và mặt vừa lộ ra chính là lá đang
  // phải chặn. Nên màu hiệu lực lấy thẳng từ mặt mới đó.
  //
  // Cách cũ ánh xạ MÀU CŨ qua bảng LIGHT_TO_DARK. Nó cho ra một màu hợp lệ,
  // nhưng chẳng liên quan gì tới lá đang nằm trên bàn — hình một đằng, luật một
  // nẻo, người chơi nhìn lá mà đoán sai màu phải đánh.
  const top = s.discard[s.discard.length - 1];
  const topColor = top ? face(top, s.side).color : 'wild';
  if (topColor !== 'wild') {
    s.activeColor = topColor;
  } else {
    // Lá trên đỉnh là Wild (chưa/không có màu riêng) -> giữ nguyên ý định của
    // người đã chọn màu, chỉ đổi sang hệ màu của mặt mới.
    const map = s.side === 'dark' ? LIGHT_TO_DARK : DARK_TO_LIGHT;
    s.activeColor = map[s.activeColor] ?? s.activeColor;
  }
  events.push({ t: 'flip', side: s.side });
}

/** Áp dụng hiệu ứng lá vừa đánh rồi chuyển lượt. */
function applyEffect(s: GameState, playerIdx: number, card: Card, now: number, events: GameEvent[], wild4Illegal = false, wild4Card?: Card) {
  const f = face(card, s.side);
  const two = activeCount(s) === 2;

  switch (f.value) {
    case 'skip':
      award(s, s.players[playerIdx].id, ACTION_POINTS.skip);
      events.push({ t: 'skip', playerId: s.players[step(s, playerIdx)].id });
      setTurn(s, step(s, playerIdx, 2), now, events, PLAY_ANIM_MS + SKIP_ANIM_MS, 'effect');
      return;
    case 'skipAll':
      // Dark: bỏ lượt TẤT CẢ người khác -> quay lại chính mình
      award(s, s.players[playerIdx].id, ACTION_POINTS.skip * (activeCount(s) - 1));
      events.push({ t: 'skipAll' });
      setTurn(s, playerIdx, now, events, PLAY_ANIM_MS + SKIP_ANIM_MS, 'effect');
      return;
    case 'reverse':
      s.direction = (s.direction * -1) as 1 | -1;
      award(s, s.players[playerIdx].id, ACTION_POINTS.reverse);
      events.push({ t: 'reverse', direction: s.direction });
      // 2 người: reverse hoạt động như skip -> người đánh chơi tiếp
      setTurn(s, two ? playerIdx : step(s, playerIdx), now, events, PLAY_ANIM_MS);
      return;
    case 'flip':
      flipSide(s, events);
      setTurn(s, step(s, playerIdx), now, events, PLAY_ANIM_MS + FLIP_ANIM_MS, 'effect');
      return;
    case 'draw1':
    case 'draw2':
    case 'wild2':
    case 'wild4':
    case 'draw5':
    case 'draw4':
    case 'wildRev4':
    case 'wild6':
    case 'wild10': {
      const pk = pendingKey(f.value)! as { value: 'draw1' | 'draw2' | 'draw2f' | 'draw4' | 'draw5'; amount: number };
      const prevAmount = s.pending && s.pending.value !== 'drawColor' ? s.pending.amount : 0;
      // `last` = giá trị của CHÍNH lá này — No Mercy chỉ cho chồng lá >= nó.
      s.pending = { value: pk.value, amount: prevAmount + pk.amount, last: pk.amount };
      if (f.value === 'wildRev4') {
        // Wild Đảo chiều +4: đảo chiều TRƯỚC, rồi mới phạt người kế theo chiều mới.
        s.direction = (s.direction * -1) as 1 | -1;
        events.push({ t: 'reverse', direction: s.direction });
      }
      // Thưởng theo số lá CHÍNH LÁ NÀY thêm vào chuỗi, không phải tổng chuỗi —
      // chồng lên phần người trước đã gây ra thì người trước đã được tính rồi.
      award(s, s.players[playerIdx].id, pk.amount * ACTION_POINTS.drawPerCard);
      // Chỉ lá Wild Draw mới bị bắt lỗi. Lá chồng sau GHI ĐÈ thông tin bắt lỗi:
      // người bị phạt luôn chỉ được bắt lỗi lá VỪA đánh vào mặt mình.
      if ((f.value === 'wild4' || f.value === 'wild2') && s.rules.challenge) {
        s.pending.wild4 = { by: s.players[playerIdx].id, illegal: wild4Illegal, revealedCard: wild4Card };
      }
      const victim = step(s, playerIdx);
      if (s.rules.stack || ((f.value === 'wild4' || f.value === 'wild2') && s.rules.challenge)) {
        // cho người kế tiếp cơ hội chồng thêm (hoặc bắt lỗi); nếu họ rút thì nhận cả chuỗi
        setTurn(s, victim, now, events, PLAY_ANIM_MS);
      } else {
        const amount = s.pending.amount;
        s.pending = null;
        events.push({ t: 'skip', playerId: s.players[victim].id });
        // Nạn nhân nhận trọn gói toàn bộ số lá phạt đã biết trước trong 1 nhịp dồn
        give(s, victim, amount, true, events, true);
        if (settleEliminations(s, events)) return;
        const animBudget = PLAY_ANIM_MS + SKIP_ANIM_MS + Math.min((amount - 1) * 75 + 260 + 250, 3000);
        setTurn(s, step(s, victim), now, events, animBudget, 'effect');
      }
      return;
    }
    case 'wildColor': {
      // Wild Draw Color: treo MÀU cần tìm (không phải số) — xem giveUntilColor().
      s.pending = { value: 'drawColor', color: s.activeColor };
      const victim = step(s, playerIdx);
      if (s.rules.stack) {
        setTurn(s, victim, now, events, PLAY_ANIM_MS);
      } else {
        const color = s.activeColor;
        s.pending = null;
        events.push({ t: 'skip', playerId: s.players[victim].id });
        setTurn(s, victim, now, events, PLAY_ANIM_MS + SKIP_ANIM_MS, 'effect');
        s.drawRun = { kind: 'color', color, count: 0, penalty: true, endsTurn: true };
      }
      return;
    }
    case 'wildRoulette': {
      // Color Roulette: NGƯỜI KẾ TIẾP chọn màu (không phải người đánh), rồi lật
      // từng lá tới khi ra màu đó (drawRun 'color') và mất lượt. Không phải lá
      // rút -> không tạo pending, không chồng được.
      const victim = step(s, playerIdx);
      s.turn = victim;
      s.phase = 'awaitRoulette';
      s.resume = { kind: 'roulette', cardId: card.id, playerId: s.players[victim].id };
      events.push({ t: 'roulette', playerId: s.players[victim].id });
      s.turnHoldUntil = now + PLAY_ANIM_MS;
      s.turnHoldKind = 'play';
      s.turnDeadline = now + PLAY_ANIM_MS + s.rules.turnSeconds * 1000;
      return;
    }
    case 'pointTaken': {
      // Chỉ tay phá Cọng xích đang có TRƯỚC khi phát bài phạt của vòng bầu.
      if (s.chain) {
        s.chain = null;
        events.push({ t: 'chainBreak' });
      }
      const by = s.players[playerIdx].id;
      const deadline = now + PLAY_ANIM_MS + VOTE_MS;
      s.phase = 'awaitVote';
      s.vote = { by, deadline, votes: {} };
      s.turn = playerIdx;
      // Lượt tạm dừng: turnDeadline = hạn bầu, để server/client gửi TIMEOUT đúng lúc chốt phiếu.
      s.turnHoldUntil = now + PLAY_ANIM_MS;
      s.turnHoldKind = 'play';
      s.turnDeadline = deadline;
      events.push({ t: 'voteStart', by, deadline });
      return;
    }
    case 'wildTogether':
      // Đã chọn màu xong -> chờ người đánh chỉ định 2 người bị xích (CHAIN).
      s.phase = 'awaitChain';
      s.resume = { kind: 'chain', cardId: card.id, playerId: s.players[playerIdx].id };
      pauseFor(s, now, PLAY_ANIM_MS, 'play');
      return;
    case 'wildPileUp': {
      // Mở vòng phụ: lật 1 lá từ chồng rút làm mồi cho chồng phụ màu vừa chọn.
      const seed = ensureDraw(s, 1, events)[0];
      s.pileUp = { color: s.activeColor, by: s.players[playerIdx].id, cards: seed ? [seed] : [] };
      if (seed) {
        s.playedSide[seed.id] = s.side;
        events.push({ t: 'pileUpStart', color: s.activeColor, cardId: seed.id });
      }
      setTurn(s, step(s, playerIdx), now, events, PLAY_ANIM_MS + PILE_START_MS, 'effect');
      return;
    }
    case '0':
      if (s.rules.sevenZero) {
        // luật 0: cả bàn chuyển tay bài theo chiều đang chơi
        // Chỉ chuyền giữa những người còn trong ván (người bị loại tay trống).
        const hands = s.players.map((p) => p.hand);
        const rotated = s.players.map((p, i) => (p.eliminated ? p.hand : hands[step(s, i, -1)]));
        s.players.forEach((p, i) => { p.hand = rotated[i]; });
        refreshRushWindow(s, now, events, s.players.map((_, i) => i));
        events.push({ t: 'rotate', direction: s.direction });
        // Mercy/Vỡ trận xét cả sau khi chuyền bài (tay mới có thể đã quá ngưỡng).
        s.players.forEach((_, i) => checkEliminate(s, i, events));
        if (settleEliminations(s, events)) return;
        // Có animation gom bài -> trao -> xoè lại: không tính vào giờ của ai.
        setTurn(s, step(s, playerIdx), now, events, PLAY_ANIM_MS + SWAP_ANIM_MS, 'effect');
        return;
      }
      setTurn(s, step(s, playerIdx), now, events, PLAY_ANIM_MS);
      return;
    case '7':
      if (s.rules.sevenZero && s.players.length > 1) {
        // luật 7: chờ người đánh chọn 1 đối thủ để đổi tay bài
        s.phase = 'awaitSwapTarget';
        s.resume = { kind: 'swap', cardId: card.id, playerId: s.players[playerIdx].id };
        // Cùng lý do với nhánh awaitColor ở trên: lượt chưa đổi người nhưng lá
        // 7 vẫn đang bay ra bàn, phải có giai đoạn "sau đánh" che animation.
        pauseFor(s, now, PLAY_ANIM_MS, 'play');
        return;
      }
      setTurn(s, step(s, playerIdx), now, events, PLAY_ANIM_MS);
      return;
    default:
      setTurn(s, step(s, playerIdx), now, events, PLAY_ANIM_MS);
  }
}

/* ------------------------------------------------------------------ reducer */

export function reduce(prev: GameState, action: Action, now = Date.now()): EngineResult {
  const r = reduceCore(prev, action, now);
  const s = r.state;
  // CHỐT CHUNG cho vỡ trận: người đang giữ lượt có thể bị loại gián tiếp (Cọng
  // xích kéo theo khi NGƯỜI KHÁC rút bài). Vá từng đường dễ sót, nên sau mọi
  // nước đi: lượt đang nằm ở người đã bị loại thì chuyển sang người kế tiếp.
  if (s !== prev && s.phase === 'awaitPlay' && s.players[s.turn]?.eliminated) {
    // Người bị loại đang gánh chuỗi phạt treo -> xoá phạt, không đẩy sang ai.
    s.pending = null;
    setTurn(s, step(s, s.turn), now, r.events, DRAW_STEP_MS, 'effect');
  }
  return r;
}

function reduceCore(prev: GameState, action: Action, now: number): EngineResult {
  const s = clone(prev);
  s.eventSeq += 1;
  const events: GameEvent[] = [];
  if (s.phase === 'dealing') s.phase = 'awaitPlay';

  // Người đã vỡ trận chỉ còn được thả cảm xúc.
  if ('playerId' in action && action.type !== 'EMOTE' && s.players.find((p) => p.id === action.playerId)?.eliminated)
    return reject(prev, action.playerId, 'eliminated');

  switch (action.type) {
    case 'NEXT_ROUND': {
      if (s.phase !== 'roundEnd') return reject(prev, '', 'round-not-ended');
      return startRound(s, (s.seed * 1103515245 + 12345) >>> 0, now);
    }

    case 'PLAY': {
      const pi = idx(s, action.playerId);
      if (pi < 0) return reject(prev, action.playerId, 'no-player');
      if (s.phase !== 'awaitPlay') return reject(prev, action.playerId, 'phase');
      // Đang rút dở giữa chừng thì chưa được đánh — phải rút xong chuỗi đã.
      if (s.drawRun) return reject(prev, action.playerId, 'drawing');
      const ci = s.players[pi].hand.findIndex((c) => c.id === action.cardId);
      if (ci < 0) return reject(prev, action.playerId, 'no-card');
      const card = s.players[pi].hand[ci];

      const myTurn = s.turn === pi;
      const jump = !myTurn && canJumpIn(card, s);
      if (!myTurn && !jump) {
        // PARTY — Đánh nhanh SAI (lá số không giống hệt lá trên đỉnh): phạt rút,
        // lượt vẫn của người cũ. Chỉ phạt khi bàn đang mở cho đánh nhanh (không
        // giữa animation, vòng phụ, bình chọn, chồng phạt) để không phạt oan cú bấm lỡ.
        const penalty = getMode(s.deckType).jumpInPenalty;
        const openForJump = s.rules.jumpIn && !s.pending && !s.pileUp && !s.vote && now >= s.turnHoldUntil;
        if (penalty > 0 && openForJump && /^\d$/.test(face(card, s.side).value)) {
          give(s, pi, penalty, true, events, true);
          events.push({ t: 'jumpFail', playerId: action.playerId, amount: penalty });
          return { state: s, events };
        }
        return reject(prev, action.playerId, 'not-your-turn');
      }
      if (myTurn && !canPlay(card, s)) return reject(prev, action.playerId, 'illegal-card');

      // jump-in: cướp lượt về người đánh chen
      if (jump) s.turn = pi;
      // Khi lượt này đánh bài: nếu lượt trước có ai chưa bị bắt Ú Nồ, họ an toàn
      if (s.rushWindow) {
        if (s.rushWindow.playerId !== s.players[pi].id) {
          const prevPi = idx(s, s.rushWindow.playerId);
          if (prevPi >= 0) s.players[prevPi].calledRush = true;
        }
        s.rushWindow = null;
      }

      // PARTY — vòng 3 lá con: lá đúng màu vào CHỒNG PHỤ, không có hiệu ứng gì,
      // lượt sang người kế để tiếp tục nối đuôi.
      if (s.pileUp) {
        s.players[pi].hand.splice(ci, 1);
        s.pileUp.cards.push(card);
        s.playedSide[card.id] = s.side;
        events.push({ t: 'pileUp', playerId: action.playerId, cardId: card.id, count: s.pileUp.cards.length });
        award(s, action.playerId, ACTION_POINTS.play);
        openRushIfOneCard(s, pi, now, events);
        if (s.players[pi].hand.length === 0) {
          endRound(s, pi, events);
          return { state: s, events };
        }
        setTurn(s, step(s, pi), now, events, PLAY_ANIM_MS);
        return { state: s, events };
      }

      s.players[pi].hand.splice(ci, 1);
      s.discard.push(card);
      // Ghi lại mặt HIỆN TẠI (trước khi lá 'flip' này tự đổi s.side ở applyEffect
      // bên dưới) — đây đúng là mặt lá bài được hiển thị lúc đánh, cần đóng băng.
      s.playedSide[card.id] = s.side;
      events.push({ t: 'play', playerId: action.playerId, cardId: card.id, pileIndex: s.discard.length - 1, jump });
      award(s, action.playerId, ACTION_POINTS.play + (jump ? ACTION_POINTS.jumpIn : 0));

      const f = face(card, s.side);

      // RULE-ASSUMPTION: các lá bỏ kèm KHÔNG kích hoạt hiệu ứng (kể cả +2, Cấm lượt).
      // No Mercy — BỎ HẾT: mọi lá CÙNG MÀU còn trên tay theo xuống cùng lúc, không
      // kích hoạt hiệu ứng. Xếp chúng DƯỚI lá Discard All để lá này vẫn nằm trên
      // đỉnh (màu hiện hành = màu của nó). Hết bài thì thắng như thường.
      if (f.value === 'discardAll') {
        const same = s.players[pi].hand.filter((c) => face(c, s.side).color === f.color);
        if (same.length) {
          s.players[pi].hand = s.players[pi].hand.filter((c) => face(c, s.side).color !== f.color);
          s.discard.splice(s.discard.length - 1, 0, ...same);
          for (const c of same) s.playedSide[c.id] = s.side;
          events.push({ t: 'discardAll', playerId: action.playerId, cardIds: same.map((c) => c.id) });
          award(s, action.playerId, same.length * ACTION_POINTS.play);
        }
      }

      // BẮT LỖI WILD +N: luật chuẩn chỉ cho đánh Wild Draw khi trên tay KHÔNG
      // còn lá nào đúng màu đang hiệu lực. Phải chốt NGAY ĐÂY vì đây là thời
      // điểm duy nhất còn đủ dữ kiện: lá vừa bị splice khỏi tay, và `activeColor`
      // vẫn là màu CŨ (lá wild chưa đổi màu — việc đó xảy ra ở CHOOSE_COLOR).
      // Đang CHỒNG PHẠT (pending) thì lá đúng màu không đánh được (canPlay chặn),
      // Wild +N là nước hợp lệ duy nhất -> không bao giờ tính là sai luật.
      // LỖI CŨ: chồng +4 lên +2 đỏ mà trên tay còn lá đỏ là bị bắt lỗi oan.
      const isWildDraw = f.value === 'wild4' || f.value === 'wild2';
      const matchingCard = isWildDraw && !s.pending
        ? s.players[pi].hand.find((c) => face(c, s.side).color === s.activeColor)
        : undefined;
      const wild4Illegal = isWildDraw && !!matchingCard;

      if (f.color !== 'wild') s.activeColor = f.color;

      // Lá chức năng / lá yêu cầu người đánh chọn:
      // - Wild card (trừ wildRoulette) chưa có màu hợp lệ
      // - WildTogether (kể cả có sẵn màu vẫn phải chọn cặp bị xích)
      // - Lá 7 đổi bài (luật sevenZero và phòng > 1 người)
      // - Chỉ tay (pointTaken): cả bàn cùng bầu
      // -> Khoan mở cửa sổ đếm ngược Ú Nồ để người chơi chọn xong mới đếm,
      // tránh bị đối thủ / bot bắt Ú Nồ oan khi đang chọn màu hoặc chọn người đổi bài.
      const isChoiceCard =
        (isWildValue(f.value) && f.value !== 'wildRoulette' && (!action.chosenColor || !colorsFor(s, card).includes(action.chosenColor) || f.value === 'wildTogether')) ||
        (f.value === '7' && !!s.rules.sevenZero && s.players.length > 1) ||
        (f.value === 'pointTaken');

      if (!isChoiceCard) {
        openRushIfOneCard(s, pi, now, events);
      }

      if (s.players[pi].hand.length === 0) {
        // lá cuối vẫn có hiệu lực phạt: người kế ăn đủ trước khi chốt ván.
        // RULE-ASSUMPTION (No Mercy): spec chỉ nói 0/7 lá cuối thì thắng không
        // đổi bài; lá rút là lá cuối thì vẫn phạt người kế như mọi mode khác
        // (phạt đó có thể làm họ bị loại vì Mercy — không đổi người thắng).
        if (isWildValue(f.value)) {
          const palette = colorsFor(s, card);
          s.activeColor = action.chosenColor && palette.includes(action.chosenColor) ? action.chosenColor : palette[0];
          s.wildColors[card.id] = s.activeColor;
        }
        if (f.value === 'wildColor') {
          giveUntilColor(s, step(s, pi), s.activeColor, events);
          s.pending = null;
        } else {
          const pk = pendingKey(f.value);
          // pendingKey không bao giờ trả 'drawColor' khi f.value !== 'wildColor'
          // (đã tách nhánh ở trên) — check lại cho TypeScript hẹp kiểu union.
          if (pk && pk.value !== 'drawColor') {
            const prevAmount = s.pending && s.pending.value !== 'drawColor' ? s.pending.amount : 0;
            give(s, step(s, pi), prevAmount + pk.amount, true, events, true);
            s.pending = null;
          }
        }
        endRound(s, pi, events);
        return { state: s, events };
      }

      // Color Roulette là Wild nhưng người ĐÁNH không chọn màu — người bị nhắm chọn.
      if (f.value === 'wildRoulette') {
        applyEffect(s, pi, card, now, events);
        return { state: s, events };
      }

      if (isWildValue(f.value)) {
        if (action.chosenColor && colorsFor(s, card).includes(action.chosenColor)) {
          s.activeColor = action.chosenColor;
          s.wildColors[card.id] = action.chosenColor;
          events.push({ t: 'color', color: action.chosenColor });
          applyEffect(s, pi, card, now, events, wild4Illegal, matchingCard);
        } else {
          // chờ client chọn màu (color wheel) rồi mới resolve tiếp
          s.phase = 'awaitColor';
          s.resume = { kind: 'color', cardId: card.id, playerId: action.playerId, wild4Illegal, wild4Card: matchingCard };
          // GIAI ĐOẠN "SAU ĐÁNH" vẫn phải có, dù lượt CHƯA đổi người.
          // LỖI CŨ: nhánh này không gọi setTurn nên turnHoldUntil giữ nguyên mốc
          // của nước đi TRƯỚC (đã trôi qua) -> đo được hold = -200ms: lá Wild
          // bay ra mà không có khoảng dừng nào bảo vệ, bot chọn màu ngay lập
          // tức, animation chồng lên nhau và đồng hồ không bao giờ đứng.
          pauseFor(s, now, PLAY_ANIM_MS, 'play');
        }
        return { state: s, events };
      }

      applyEffect(s, pi, card, now, events, wild4Illegal, matchingCard);
      return { state: s, events };
    }

    case 'CHOOSE_COLOR': {
      // No Mercy — Color Roulette: NGƯỜI BỊ NHẮM chọn màu, rồi lật từng lá công
      // khai tới khi ra màu đó (Wild lật ra không tính), nhận hết và mất lượt.
      if (s.phase === 'awaitRoulette' && s.resume?.kind === 'roulette' && s.resume.playerId === action.playerId) {
        const vi = idx(s, action.playerId);
        const card = s.discard[s.discard.length - 1];
        if (!colorsFor(s, card).includes(action.color)) return reject(prev, action.playerId, 'bad-color');
        s.activeColor = action.color;
        s.wildColors[card.id] = action.color;
        s.phase = 'awaitPlay';
        s.resume = null;
        events.push({ t: 'color', color: action.color });
        setTurn(s, vi, now, events, COLOR_PICK_MS, 'effect');
        // Lật từng lá (mỗi lá một event 'draw', không dồn nhanh) — chuỗi tự chạy.
        s.drawRun = { kind: 'color', color: action.color, count: 0, penalty: true, endsTurn: true };
        return { state: s, events };
      }
      if (s.phase !== 'awaitColor' || !s.resume || s.resume.playerId !== action.playerId)
        return reject(prev, action.playerId, 'phase');
      const pi = idx(s, action.playerId);
      const card = s.discard[s.discard.length - 1];
      if (!colorsFor(s, card).includes(action.color)) return reject(prev, action.playerId, 'bad-color');
      // Đọc TRƯỚC khi xoá resume — cờ "đánh +N sai luật" được chốt từ lúc đánh
      // và gửi kèm qua đây (lúc này activeColor đã bị đổi, không tính lại được).
      const illegal = !!s.resume.wild4Illegal;
      const matchingCard = s.resume.wild4Card;
      s.activeColor = action.color;
      s.wildColors[card.id] = action.color;
      s.phase = 'awaitPlay';
      s.resume = null;
      events.push({ t: 'color', color: action.color });
      applyEffect(s, pi, card, now, events, illegal, matchingCard);
      // Nếu applyEffect chuyển sang awaitChain (lá wildTogether) thì vẫn chờ chọn xích xong;
      // còn lại người đánh đã hoàn tất lựa chọn -> mở cửa sổ Ú Nồ nếu còn đúng 1 lá.
      if ((s.phase as Phase) !== 'awaitChain') {
        openRushIfOneCard(s, pi, now, events);
      }
      return { state: s, events };
    }

    case 'SWAP_TARGET': {
      if (s.phase !== 'awaitSwapTarget' || !s.resume || s.resume.playerId !== action.playerId)
        return reject(prev, action.playerId, 'phase');
      const pi = idx(s, action.playerId);
      const ti = idx(s, action.targetId);
      // Không đổi bài với người đã bị loại (vỡ trận/Mercy): họ tay trống, đổi
      // xong người đánh mất sạch bài còn người "đã chết" lại cầm bài mà không
      // bao giờ tới lượt — ván hỏng.
      if (ti < 0 || ti === pi || s.players[ti].eliminated) return reject(prev, action.playerId, 'bad-target');
      const tmp = s.players[pi].hand;
      s.players[pi].hand = s.players[ti].hand;
      s.players[ti].hand = tmp;
      refreshRushWindow(s, now, events, [pi, ti]);
      events.push({ t: 'swap', a: action.playerId, b: action.targetId });
      s.phase = 'awaitPlay';
      s.resume = null;
      // Mercy/Vỡ trận xét cả sau khi đổi bài.
      checkEliminate(s, pi, events);
      checkEliminate(s, ti, events);
      if (settleEliminations(s, events)) return { state: s, events };
      // Luật 7: animation gom bài -> trao cho nhau -> xoè lại, không tính giờ.
      setTurn(s, step(s, pi), now, events, SWAP_ANIM_MS, 'effect');
      return { state: s, events };
    }

    case 'DRAW': {
      const pi = idx(s, action.playerId);
      if (pi < 0 || s.turn !== pi || s.phase !== 'awaitPlay') return reject(prev, action.playerId, 'not-your-turn');

      // Khi người này bắt đầu rút bài: nếu lượt trước có ai chưa bị bắt Ú Nồ, họ an toàn
      if (s.rushWindow && s.rushWindow.playerId !== action.playerId) {
        const prevPi = idx(s, s.rushWindow.playerId);
        if (prevPi >= 0) s.players[prevPi].calledRush = true;
        s.rushWindow = null;
      }

      // Đang rút dở -> action này chỉ lấy THÊM 1 LÁ nữa.
      if (s.drawRun) return drawStep(s, pi, now, events);

      // PARTY — vòng 3 lá con: không đánh được/không muốn đánh -> ÔM CẢ CHỒNG PHỤ.
      // Vòng chính chạy lại từ CHÍNH người vừa ôm bài (vẫn là lượt của họ).
      if (s.pileUp) {
        const taken = s.pileUp.cards;
        s.pileUp = null;
        const me = s.players[pi];
        me.hand.push(...taken);
        if (me.hand.length > 1) me.calledRush = false;
        if (s.rushWindow?.playerId === me.id && me.hand.length !== 1) s.rushWindow = null;
        events.push({ t: 'pileUpTake', playerId: me.id, cardIds: taken.map((c) => c.id) });
        checkEliminate(s, pi, events);
        pullChain(s, pi, taken.length, true, events);
        if (settleEliminations(s, events)) return { state: s, events };
        setTurn(s, me.eliminated ? step(s, pi) : pi, now, events, PILE_TAKE_MS, 'effect');
        return { state: s, events };
      }

      if (s.pending) {
        const p = s.pending;
        s.pending = null;
        if (p.value === 'drawColor') {
          s.drawRun = { kind: 'color', color: p.color, count: 0, penalty: true, endsTurn: true };
          return drawStep(s, pi, now, events);
        }
        // Chuỗi phạt đã biết trước số lượng (+2, +4, stack): rút dồn nhanh 1 nhịp
        give(s, pi, p.amount, true, events, true);
        if (settleEliminations(s, events)) return { state: s, events };
        const animBudget = Math.min((p.amount - 1) * 75 + 260 + 250, 3000);
        setTurn(s, step(s, pi), now, events, animBudget, 'effect');
        return { state: s, events };
      }
      if (s.drawnThisTurn) return reject(prev, action.playerId, 'already-drawn');

      if (s.rules.drawToMatch) {
        s.drawRun = { kind: 'toMatch', count: 0, penalty: false, endsTurn: false };
        return drawStep(s, pi, now, events);
      }

      // Rút thường: đúng 1 lá, không cần chuỗi.
      const c = give(s, pi, 1, false, events)[0];
      s.drawnThisTurn = true;
      if (settleEliminations(s, events)) return { state: s, events };
      if (!c || s.players[pi].eliminated || !canPlay(c, s)) setTurn(s, step(s, pi), now, events, DRAW_STEP_MS, 'effect');
      else pauseFor(s, now, DRAW_STEP_MS); // vẫn lượt mình -> giữ nguyên thời gian còn lại, chỉ dời ra
      return { state: s, events };
    }

    case 'PASS': {
      const pi = idx(s, action.playerId);
      if (pi < 0 || s.turn !== pi || !s.drawnThisTurn) return reject(prev, action.playerId, 'cannot-pass');
      if (s.drawRun) return reject(prev, action.playerId, 'drawing');

      if (s.rushWindow && s.rushWindow.playerId !== action.playerId) {
        const prevPi = idx(s, s.rushWindow.playerId);
        if (prevPi >= 0) s.players[prevPi].calledRush = true;
        s.rushWindow = null;
      }
      // Luật nhà "bắt buộc đánh": còn lá đánh được thì không được bỏ lượt.
      if (s.rules.forcePlay && s.players[pi].hand.some((c) => canPlay(c, s)))
        return reject(prev, action.playerId, 'must-play');
      setTurn(s, step(s, pi), now, events);
      return { state: s, events };
    }

    /**
     * BẮT LỖI WILD +N. Luật chuẩn: chỉ được đánh Wild Draw khi trên tay không
     * còn lá đúng màu đang hiệu lực. Người bị phạt có quyền nghi ngờ:
     *  - Bắt ĐÚNG  -> kẻ đánh sai tự rút đủ chuỗi phạt, người bắt GIỮ NGUYÊN
     *                 lượt (được đánh tiếp, không mất gì).
     *  - Bắt SAI   -> người bắt rút chuỗi phạt + 2 lá và mất lượt.
     * `illegal` đã được chốt từ lúc đánh (xem PLAY) nên ở đây không phải dựng
     * lại tay bài quá khứ — chỉ đọc ra.
     */
    case 'CHALLENGE': {
      const pi = idx(s, action.playerId);
      if (pi < 0 || s.turn !== pi || s.phase !== 'awaitPlay') return reject(prev, action.playerId, 'not-your-turn');
      if (!s.rules.challenge) return reject(prev, action.playerId, 'no-challenge');
      if (s.drawRun) return reject(prev, action.playerId, 'drawing');
      const p = s.pending;
      if (!p || p.value === 'drawColor' || !p.wild4) return reject(prev, action.playerId, 'nothing-to-challenge');
      const ti = idx(s, p.wild4.by);
      if (ti < 0) return reject(prev, action.playerId, 'no-player');

      const success = p.wild4.illegal;
      const amount = p.amount;
      const revealedCard = success ? p.wild4.revealedCard : undefined;
      s.pending = null;
      events.push({ t: 'challenge', playerId: action.playerId, targetId: p.wild4.by, success, revealedCard });

      // Nếu bắt đúng (rút lá ra bàn kèm thông báo): 1600ms.
      // Nếu bắt sai (không có bài gian lận): 1200ms báo thất bại ngay.
      const challengeAnim = success ? 1600 : 1200;
      if (success) {
        award(s, action.playerId, ACTION_POINTS.challenge);
        give(s, ti, amount, true, events, true);
        if (settleEliminations(s, events)) return { state: s, events };
        // Người bắt đúng vẫn đang ở lượt mình -> cấp lại lượt cho CHÍNH HỌ.
        const animBudget = challengeAnim + Math.min((amount - 1) * 75 + 260 + 250, 3000);
        setTurn(s, pi, now, events, animBudget, 'effect');
      } else {
        give(s, pi, amount + 2, true, events, true);
        if (settleEliminations(s, events)) return { state: s, events };
        const animBudget = challengeAnim + Math.min((amount + 1) * 75 + 260 + 250, 3000);
        setTurn(s, step(s, pi), now, events, animBudget, 'effect');
      }
      return { state: s, events };
    }

    case 'CALL_RUSH': {
      const pi = idx(s, action.playerId);
      if (pi < 0) return reject(prev, action.playerId, 'no-player');
      if (s.players[pi].hand.length !== 1) return reject(prev, action.playerId, 'not-one-card');
      if (s.players[pi].calledRush) return reject(prev, action.playerId, 'already-called');
      s.players[pi].calledRush = true;
      if (s.rushWindow?.playerId === action.playerId) s.rushWindow = null;
      award(s, action.playerId, ACTION_POINTS.rush);
      events.push({ t: 'rush', playerId: action.playerId });
      return { state: s, events };
    }

    case 'CATCH_RUSH': {
      const w = s.rushWindow;
      if (!w || w.playerId !== action.targetId || now > w.until)
        return reject(prev, action.playerId, 'nothing-to-catch');
      // Trong thời gian ân hạn, chỉ chủ nhân cửa sổ được hô — chưa ai bắt được.
      if (now < w.openedAt + RUSH_GRACE_MS) return reject(prev, action.playerId, 'too-early');
      const ti = idx(s, action.targetId);
      if (ti < 0 || s.players[ti].calledRush) return reject(prev, action.playerId, 'already-called');
      // Chốt chặn cuối: chỉ bắt được người ĐANG THỰC SỰ cầm đúng 1 lá, bất kể
      // cửa sổ có bị bỏ sót chưa đóng ở đường nào đó.
      if (s.players[ti].hand.length !== 1) return reject(prev, action.playerId, 'nothing-to-catch');
      give(s, ti, 2, true, events, true);
      s.rushWindow = null;
      if (settleEliminations(s, events)) return { state: s, events };
      award(s, action.playerId, ACTION_POINTS.catch);
      events.push({ t: 'caught', playerId: action.targetId, amount: 2 });
      return { state: s, events };
    }

    case 'TIMEOUT': {
      // PARTY — hết giờ bầu: chốt với những phiếu đã có (ai không bầu thì mất phiếu).
      // Xử lý trước điều kiện s.turn !== pi vì cả bàn cùng bầu đồng thời.
      // Dung sai 100ms tránh lệch timer giữa các môi trường runtime.
      if (s.phase === 'awaitVote' && s.vote) {
        if (now < s.vote.deadline - 100) return reject(prev, action.playerId, 'too-early');
        resolveVote(s, now, events);
        return { state: s, events };
      }
      const pi = idx(s, action.playerId);
      if (pi < 0 || s.turn !== pi) return reject(prev, action.playerId, 'not-your-turn');
      if (s.phase === 'awaitChain' && s.resume?.kind === 'chain') {
        const [a, b] = autoChainTargets(s, s.resume.playerId);
        return reduce(prev, { type: 'CHAIN', playerId: s.resume.playerId, a, b }, now);
      }
      // Vòng 3 lá con hết giờ = không đánh -> ôm chồng phụ.
      if (s.pileUp) return reduce(prev, { type: 'DRAW', playerId: action.playerId }, now);
      // Đang rút dở mà hết giờ -> KHÔNG kết lượt (sẽ bỏ sót số lá phải rút),
      // chỉ tiến thêm 1 bước của chuỗi; pauseFor tự dời deadline nên vòng sau
      // lại có thời gian cho lá kế tiếp, tới khi chuỗi kết thúc.
      if (s.drawRun) return drawStep(s, pi, now, events);
      // Hết giờ chọn màu (Wild, hoặc bị Color Roulette): tự chọn màu mình giữ nhiều nhất.
      // RULE-ASSUMPTION: spec chỉ nói về Wild; bị Roulette hết giờ cũng dùng cùng cách.
      if (s.phase === 'awaitColor' || s.phase === 'awaitRoulette')
        return reduce(prev, { type: 'CHOOSE_COLOR', playerId: action.playerId, color: mostHeldColor(s, action.playerId, s.discard[s.discard.length - 1]) }, now);
      if (s.phase === 'awaitSwapTarget') {
        const target = s.players.find((p) => p.id !== action.playerId && !p.eliminated)!;
        return reduce(prev, { type: 'SWAP_TARGET', playerId: action.playerId, targetId: target.id }, now);
      }
      // Hết giờ mà đang bị luật "bắt buộc đánh" chặn bỏ lượt -> TỰ ĐÁNH 1 lá
      // hợp lệ thay vì PASS. Không có bước này thì PASS bị reject và KHÔNG AI
      // chuyển được lượt -> ván kẹt vĩnh viễn.
      const autoPlay = (st: GameState): EngineResult | null => {
        if (!st.rules.forcePlay) return null;
        const me = st.players[idx(st, action.playerId)];
        const playable = me?.hand.filter((c) => canPlay(c, st)) ?? [];
        // Ưu tiên lá thường, rồi Wild, Wild +N để cuối — tự đánh hộ mà chọn
        // Wild +N trong khi còn lá đúng màu là tự dâng lỗi cho người ta bắt.
        const rank = (c: Card) => {
          const v = face(c, st.side).value;
          return v === 'wild4' || v === 'wild2' || v === 'wildColor' ? 2 : isWildValue(v) ? 1 : 0;
        };
        const card = playable.sort((a, b) => rank(a) - rank(b))[0];
        if (!card) return null;
        return reduce(st, {
          type: 'PLAY',
          playerId: action.playerId,
          cardId: card.id,
          chosenColor: mostHeldColor(st, action.playerId, card),
        }, now);
      };

      if (s.drawnThisTurn) return autoPlay(prev) ?? reduce(prev, { type: 'PASS', playerId: action.playerId }, now);
      const r = reduce(prev, { type: 'DRAW', playerId: action.playerId }, now);
      // rút xong mà vẫn tới lượt mình (lá rút đánh được) -> hết giờ thì đánh
      // luôn (nếu luật bắt buộc đánh) hoặc bỏ lượt.
      if (r.state.phase === 'awaitPlay' && r.state.turn === idx(r.state, action.playerId))
        return autoPlay(r.state) ?? reduce(r.state, { type: 'PASS', playerId: action.playerId }, now);
      return r;
    }

    case 'VOTE': {
      if (s.phase !== 'awaitVote' || !s.vote) return reject(prev, action.playerId, 'phase');
      const pi = idx(s, action.playerId);
      const ti = idx(s, action.targetId);
      if (pi < 0 || ti < 0 || pi === ti || s.players[ti].eliminated) return reject(prev, action.playerId, 'bad-target');
      // Bầu kín, đổi phiếu được tới lúc chốt. Đủ phiếu của mọi người còn trong ván -> lộ ngay.
      s.vote.votes[action.playerId] = action.targetId;
      // Luôn có event: nước đi hợp lệ mà không event nào thì server (bước phản
      // ứng của bot) từng coi là thất bại và vứt luôn phiếu — vòng bầu treo.
      events.push({ t: 'vote', playerId: action.playerId });
      if (s.players.every((p) => p.eliminated || s.vote!.votes[p.id])) resolveVote(s, now, events);
      return { state: s, events };
    }

    case 'CHAIN': {
      if (s.phase !== 'awaitChain' || !s.resume || s.resume.kind !== 'chain' || s.resume.playerId !== action.playerId)
        return reject(prev, action.playerId, 'phase');
      const ai = idx(s, action.a);
      const bi = idx(s, action.b);
      if (ai < 0 || bi < 0 || ai === bi || s.players[ai].eliminated || s.players[bi].eliminated)
        return reject(prev, action.playerId, 'bad-target');
      // Xích mới thay xích cũ (mỗi lúc chỉ một cặp bị xích).
      s.chain = { a: action.a, b: action.b };
      s.phase = 'awaitPlay';
      s.resume = null;
      events.push({ t: 'chain', a: action.a, b: action.b });
      const pi = idx(s, action.playerId);
      if (pi >= 0) openRushIfOneCard(s, pi, now, events);
      setTurn(s, step(s, idx(s, action.playerId)), now, events, CHAIN_ANIM_MS, 'effect');
      return { state: s, events };
    }

    case 'EMOTE': {
      // Thuần hiển thị: không đổi state ván đấu, chỉ phát event để mọi client
      // (kể cả online qua room action route) render bong bóng cảm xúc.
      const pi = idx(s, action.playerId);
      if (pi < 0) return reject(prev, action.playerId, 'no-player');
      events.push({ t: 'emote', playerId: action.playerId, emote: action.emote });
      return { state: s, events };
    }
  }
}

const MASK: CardColor = 'wild';
const BLANK = { color: MASK, value: 'wild' as const };

/**
 * Che một lá trong tay người chơi trước khi phát cho cả phòng.
 *
 * BỘ CLASSIC: che sạch. Lá chỉ có một mặt, lộ ra là lộ hết.
 *
 * BỘ FLIP: lá có HAI MẶT THẬT, và mặt đang úp xuống là THÔNG TIN CÔNG KHAI.
 * Ngoài đời ai ngồi bàn cũng nhìn thấy mặt còn lại của bài người khác — toàn bộ
 * chiến thuật của Flip nằm ở đó: lật bàn xong đối thủ sẽ cầm gì, có nên lật hay
 * không. Che nốt mặt đó KHÔNG phải "an toàn hơn", mà là chơi sai luật: người
 * chơi mất hẳn thứ duy nhất phân biệt Flip với bộ thường.
 *
 * Vẫn chỉ lộ ĐÚNG MỘT NỬA — mặt ĐANG CÓ HIỆU LỰC luôn bị che, nên không ai
 * biết đối thủ đánh được lá gì ngay bây giờ. Đúng quy tắc đã dùng cho lá trên
 * cùng chồng bài rút (xem publicView).
 */
function maskCard(c: Card, side: DeckSide): Card {
  if (!c.dark) return { id: c.id, light: BLANK, hidden: true };
  return side === 'dark'
    ? { id: c.id, light: c.light, dark: BLANK, hidden: true }
    : { id: c.id, light: BLANK, dark: c.dark, hidden: true };
}

/**
 * State công khai gửi cho MỌI client: giấu mặt bài của tất cả người chơi, giấu
 * seed và thứ tự bộ bài (nếu lộ seed thì client tự dựng lại được cả cỗ bài).
 * ID lá giữ nguyên để mesh 3D không bị mount lại khi bài đổi vùng.
 */
export function publicView(s: GameState): GameState {
  const drawPile = Array.isArray(s.drawPile) ? s.drawPile : [];
  const players = Array.isArray(s.players) ? s.players : [];
  return {
    ...s,
    seed: 0,
    // Bầu kín: chỉ lộ AI đã bầu, không lộ bầu AI (kết quả nằm trong event voteResult).
    vote: s.vote ? { ...s.vote, votes: Object.fromEntries(Object.keys(s.vote.votes).map((k) => [k, ''])) } : null,
    // Chồng bài rút: che hết, TRỪ mặt còn lại của lá TRÊN CÙNG ở bộ Flip.
    //
    // Ngoài đời lá Flip có hai mặt thật, nên mặt đang ngửa lên của chồng bài
    // rút CHÍNH LÀ mặt sau của lá sắp được rút — ai ngồi bàn cũng nhìn thấy và
    // tính toán theo nó. Giấu đi là sai luật chơi chứ không phải "an toàn hơn".
    // Vẫn chỉ lộ ĐÚNG MỘT NỬA: mặt đang có hiệu lực vẫn bị che, không ai biết
    // rút lên sẽ ra lá gì.
    drawPile: drawPile.slice(-8).map((card, i, arr) => {
      const masked = { id: `deck#${i}`, light: { color: MASK, value: 'wild' as const }, hidden: true };
      const isTop = i === arr.length - 1;
      if (!isTop || !card?.dark) return masked; // bộ classic: mặt lưng là hình chung
      return s.side === 'dark'
        ? { id: masked.id, light: card.light, dark: { color: MASK, value: 'wild' as const }, hidden: true }
        : { id: masked.id, light: { color: MASK, value: 'wild' as const }, dark: card.dark, hidden: true };
    }),
    players: players.map((p) => ({
      ...p,
      hand: (Array.isArray(p?.hand) ? p.hand : []).map((c) => maskCard(c, s.side)),
    })),
  };
}

/** Bài thật của riêng 1 người — gửi qua private channel của chính họ. */
export function handOf(s: GameState, playerId: string): Card[] {
  return s.players.find((p) => p.id === playerId)?.hand ?? [];
}

export type { Action, Card, CardColor, DeckType, GameEvent, GameState, PlayerState, Rules };

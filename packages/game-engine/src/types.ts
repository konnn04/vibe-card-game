/** Màu bài. Light: red/yellow/green/blue. Dark (Ú Nô Flip): pink/teal/orange/purple. */
export type CardColor =
  | 'red' | 'yellow' | 'green' | 'blue'
  | 'pink' | 'teal' | 'orange' | 'purple'
  | 'wild';

export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  // Classic (mặt Light của bộ classic — bộ Flip KHÔNG có lá "0" ở cả 2 mặt,
  // đúng theo bộ ảnh thật được cấp — xem deck.ts)
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild4'
  // Flip — mặt Light: Draw One (+1) và Wild Draw Two (+2), nhẹ hơn hẳn classic
  | 'draw1' | 'wild2'
  // Flip — mặt Dark: Skip Everyone, Draw Five (+5), Wild Draw Color (rút tới khi ra đúng màu)
  | 'draw5' | 'skipAll' | 'wildColor'
  // Flip — dùng chung cho cả 2 mặt (lá nào cũng có, chỉ đổi hình khi lật)
  | 'flip';

export type DeckSide = 'light' | 'dark';

export interface CardFace {
  color: CardColor;
  value: CardValue;
}

/** 1 lá bài vật lý. Bộ Flip có 2 mặt; bộ classic chỉ có `light`. */
export interface Card {
  id: string;
  light: CardFace;
  dark?: CardFace;
  /** true = lá đã bị che khi gửi qua mạng (chỉ biết id, không biết mặt). */
  hidden?: boolean;
}

export type DeckType = 'classic' | 'flip';

export interface Rules {
  sevenZero: boolean;      // 0 = đổi bài cả bàn theo chiều, 7 = chọn 1 người để đổi
  stack: boolean;          // chồng +2 lên +2, +4 lên +4/+2
  jumpIn: boolean;         // đánh chen khi có lá y hệt lá trên đống
  challenge: boolean;      // được bắt lỗi Wild +4 đánh sai luật
  rushPenalty: boolean;     // không hô RUSH -> bị bắt +2 (mặc định BẬT)
  drawToMatch: boolean;    // rút đến khi có lá đánh được
  /** Bắt buộc đánh: còn lá đánh được thì KHÔNG được bỏ lượt (mặc định BẬT). */
  forcePlay: boolean;
  startingCards: number;   // 5..7
  turnSeconds: number;     // 15/20/30
  maxPlayers: number;      // 2..4
  teamMode: boolean;       // 2v2 khi đủ 4 người, ghế đối diện cùng đội
  targetScore: number;     // 0 = chơi 1 ván; >0 = race-to-N
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  team: 0 | 1;
  hand: Card[];
  score: number;
  calledRush: boolean;
  /** Số ván liên tục đã chơi (dùng cho queue rotation ở lobby). */
  consecutiveRounds: number;
  connected: boolean;
}

/**
 * Chuỗi phạt đang treo. 2 dạng:
 *  - Số cố định (+N): 'draw1'/'draw2' (yếu, còn chồng được lá cùng loại HOẶC lá
 *    wild mạnh hơn), 'draw2f'/'draw4' (đã bị chồng lên bởi wild mạnh — chỉ còn
 *    chồng được đúng loại wild đó), 'draw5' (Flip Dark).
 *  - Màu cần tìm (Wild Draw Color, Flip Dark): KHÔNG phải số cố định — nạn nhân
 *    phải rút TỪNG LÁ tới khi lộ đúng màu, xem giveUntilColor() trong engine.ts.
 */
export type PendingDraw =
  | {
      value: 'draw1' | 'draw2' | 'draw2f' | 'draw4' | 'draw5';
      amount: number;
      /**
       * Chỉ có khi chuỗi phạt này do một lá Wild +4 tạo ra — dữ liệu để xử lý
       * CHALLENGE. `illegal` được chốt NGAY LÚC ĐÁNH (engine còn nhìn thấy tay
       * bài và màu đang hiệu lực trước đó), nên lúc bắt lỗi chỉ việc đọc ra,
       * không phải dựng lại quá khứ.
       */
      wild4?: { by: string; illegal: boolean };
    }
  | { value: 'drawColor'; color: CardColor }
  | null;

export type Phase =
  | 'dealing'
  | 'awaitPlay'
  | 'awaitColor'      // vừa đánh wild, chờ chọn màu
  | 'awaitSwapTarget' // vừa đánh 7, chờ chọn người đổi bài
  | 'roundEnd'
  | 'matchEnd';

export interface GameState {
  seed: number;
  deckType: DeckType;
  rules: Rules;
  side: DeckSide;
  players: PlayerState[];
  turn: number;              // index trong players
  direction: 1 | -1;
  drawPile: Card[];
  discard: Card[];           // cuối mảng = lá trên cùng
  activeColor: CardColor;    // màu hiệu lực (wild -> màu đã chọn)
  /**
   * Màu đã chọn cho TỪNG lá Wild cụ thể (key = Card.id), VĨNH VIỄN tới hết
   * ván — kể cả sau khi lá đó bị đè bởi lá khác trong đống discard. Đây là
   * game state thật (không phải cache riêng client) để mọi client/người vào
   * sau đều thấy đúng 1 kết quả, và server vẫn authoritative. KHÔNG đổi màu
   * ngay trên Card.light/dark.color — giữ 'wild' để lá còn đánh được đúng
   * luật nếu vô tình quay lại bộ rút qua reshuffle.
   */
  wildColors: Record<string, CardColor>;
  /**
   * Mặt (light/dark) TẠI THỜI ĐIỂM lá bài được đánh ra (key = Card.id) — bài
   * đã nằm trên đống discard giữ NGUYÊN mặt lúc đánh, không tự đổi hiển thị
   * khi ván sau đó bị lật (Flip) — chỉ bài CÒN TRONG bộ rút/trên tay mới đổi
   * mặt theo state.side hiện tại. Giống cơ chế wildColors: lưu vào state thật
   * để mọi client thấy đúng 1 kết quả, VĨNH VIỄN tới hết ván.
   */
  playedSide: Record<string, DeckSide>;
  pending: PendingDraw;      // chuỗi phạt đang treo (+N hoặc "rút tới khi ra màu")
  phase: Phase;
  turnDeadline: number;      // epoch ms
  /**
   * Trong khoảng [now, turnHoldUntil) đồng hồ CHƯA đếm ngược — client hiển thị
   * đầy/đứng yên (KHÔNG chạy số) trong lúc animation đang phát (rút bài tuần
   * tự, cấm lượt, lật bài...) hoặc trong lúc đang rút bài chủ động giữa lượt.
   * Qua khỏi mốc này mới thực sự đếm ngược tới turnDeadline. 2 field tách
   * riêng (không dùng 1 mốc duy nhất) vì lúc rút bài giữa lượt (turn KHÔNG
   * đổi người) cần GIỮ NGUYÊN thời gian nghĩ còn lại (chỉ dời turnDeadline ra
   * xa thêm đúng bằng thời lượng animation — xem pauseFor() trong engine.ts),
   * trong khi lúc bắt đầu lượt mới (setTurn) turnDeadline được tính lại từ
   * đầu — turnHoldUntil cho phép cả 2 kiểu "y hệt 1 công thức hiển thị ở
   * client" mà không cần suy ngược từ turnDeadline (dễ sai như đã từng bị).
   */
  turnHoldUntil: number;     // epoch ms
  /**
   * MỖI LƯỢT CHIA 3 GIAI ĐOẠN (suy ra từ 2 mốc trên, không cần ai "chạy" state):
   *  1. TRƯỚC ĐÁNH  — turnHoldKind==='effect' && now < turnHoldUntil:
   *     người tới lượt đang NHẬN HIỆU ỨNG (rút bài phạt, bị cấm lượt, lật bàn,
   *     đổi bài luật 0/7). Đồng hồ CHƯA chạy, KHÔNG ai được thao tác.
   *  2. TRONG ĐÁNH  — now >= turnHoldUntil: đếm ngược tới turnDeadline, thao
   *     tác bình thường. Nếu chủ động rút bài giữa chừng -> pauseFor() dời
   *     turnDeadline + đặt lại turnHoldUntil (kind='effect') nên thời gian
   *     tạm dừng đúng bằng thời lượng rút, hết rút mới đếm tiếp.
   *  3. SAU ĐÁNH    — turnHoldKind==='play' && now < turnHoldUntil: bài vừa
   *     đánh đang bay ra đống discard. Đồng hồ của người KẾ TIẾP chưa chạy,
   *     nên animation không ăn vào thời gian của ai.
   */
  turnHoldKind: 'effect' | 'play' | null;
  /**
   * Người vừa đánh xuống còn đúng 1 lá và chưa hô -> có thể bị bắt.
   * `openedAt` để tính thời gian ÂN HẠN: trong RUSH_GRACE_MS đầu chỉ CHÍNH HỌ
   * được hô, người khác chưa bắt được — nếu không thì ai bấm nhanh tay hơn là
   * người ta không bao giờ kịp hô.
   */
  rushWindow: { playerId: string; openedAt: number; until: number } | null;
  /** Hiệu ứng đang chờ input client (chọn màu wild / chọn người đổi bài luật 7). */
  resume: {
    kind: 'color' | 'swap';
    cardId: string;
    playerId: string;
    /** Lá Wild +N này có bị đánh SAI LUẬT không (còn lá đúng màu trên tay).
     *  Chốt lúc đánh, mang theo qua bước chọn màu để applyEffect ghi vào pending. */
    wild4Illegal?: boolean;
  } | null;
  drawnThisTurn: boolean;    // đã rút trong lượt này (không được rút tiếp)
  /**
   * CHUỖI RÚT BÀI ĐANG DỞ — mỗi action DRAW chỉ rút ĐÚNG 1 LÁ, rút xong chờ
   * hết animation của lá đó rồi mới xét điều kiện dừng; chưa thoả thì rút lá
   * tiếp theo. Khi khác null: người ở lượt đang rút dở, KHÔNG được đánh/bỏ
   * lượt, và lượt chưa chuyển cho ai.
   *
   * Trước đây cả chuỗi (tới 25 lá "rút tới khi đánh được", 60 lá "rút tới khi
   * ra màu") được giải quyết TRONG MỘT action, rồi bù lại bằng một cục
   * drawAnimMs(n). Hold và animation là hai đại lượng rời nhau nên chỉ cần
   * lệch là bot hành động khi bài còn đang bay. Tách từng lá thì mỗi bước chỉ
   * phải phủ đúng 1 lá -> không còn chỗ để lệch.
   *
   *  - 'fixed'   : rút đủ `remaining` lá (chồng phạt +2/+4/+5)
   *  - 'color'   : rút tới khi lộ đúng `color` (Wild Draw Color, Flip Dark)
   *  - 'toMatch' : rút tới khi ra lá đánh được (luật nhà drawToMatch)
   */
  drawRun: {
    kind: 'fixed' | 'color' | 'toMatch';
    /** còn phải rút mấy lá nữa (chỉ kind='fixed') */
    remaining?: number;
    /** màu cần lộ ra (chỉ kind='color') */
    color?: CardColor;
    /** đã rút được mấy lá trong chuỗi này (chặn vòng lặp vô hạn) */
    count: number;
    /** lá rút ra có tính là rút phạt không (đổi SFX + hiệu ứng client) */
    penalty: boolean;
    /** rút xong thì mất lượt luôn (phạt) hay vẫn là lượt mình (rút chủ động) */
    endsTurn: boolean;
  } | null;
  roundNo: number;
  winnerId: string | null;
  lastScores: Record<string, number>;
  /** Điểm hành động tích trong ván HIỆN TẠI (đánh bài, cấm lượt, bắt hô...).
   *  Cộng vào điểm tổng lúc chốt ván, cho cả người thua. */
  roundPoints: Record<string, number>;
  eventSeq: number;
}

export type Action =
  | { type: 'PLAY'; playerId: string; cardId: string; chosenColor?: CardColor }
  | { type: 'DRAW'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: CardColor }
  | { type: 'SWAP_TARGET'; playerId: string; targetId: string }
  | { type: 'CALL_RUSH'; playerId: string }
  | { type: 'CATCH_RUSH'; playerId: string; targetId: string }
  | { type: 'TIMEOUT'; playerId: string }
  /** Bắt lỗi Wild +4: nghi người trước đánh +4 trong khi vẫn còn lá đúng màu. */
  | { type: 'CHALLENGE'; playerId: string }
  | { type: 'NEXT_ROUND' }
  /** Thả cảm xúc — thuần hiển thị, KHÔNG đổi state ván đấu (xem case 'EMOTE' trong engine.ts). */
  | { type: 'EMOTE'; playerId: string; emote: string };

export type GameEvent =
  | { t: 'deal'; playerId: string; cardId: string; order: number }
  /** `jump` = nước ĐÁNH CHEN (cướp lượt), để client phát âm riêng. */
  | { t: 'play'; playerId: string; cardId: string; pileIndex: number; jump?: boolean }
  /**
   *  = rút DỒN, số lá biết trước (chồng phạt +N, phạt bắt lỗi, phạt quên
   * hô): bài đổ về nhanh gọn. Ngược lại là rút CHẬM có hồi hộp — rút tới khi
   * đánh được / tới khi ra màu / chủ động rút 1 lá: phải kịp nhìn mặt từng lá
   * (text.txt: Draw -> Reveal -> Check).
   */
  | { t: 'draw'; playerId: string; cardIds: string[]; penalty: boolean; fast?: boolean }
  | { t: 'reshuffle' }
  | { t: 'skip'; playerId: string }
  | { t: 'skipAll' }
  | { t: 'reverse'; direction: 1 | -1 }
  | { t: 'color'; color: CardColor }
  | { t: 'flip'; side: DeckSide }
  | { t: 'swap'; a: string; b: string }
  | { t: 'rotate'; direction: 1 | -1 }
  /** Kết quả bắt lỗi +4: `success` = người đánh +4 đã phạm luật. */
  | { t: 'challenge'; playerId: string; targetId: string; success: boolean }
  | { t: 'rush'; playerId: string }
  | { t: 'caught'; playerId: string; amount: number }
  | { t: 'turn'; playerId: string; deadline: number }
  | { t: 'roundEnd'; winnerId: string; scores: Record<string, number> }
  | { t: 'matchEnd'; winnerId: string }
  | { t: 'emote'; playerId: string; emote: string }
  | { t: 'reject'; playerId: string; reason: string };

export interface EngineResult {
  state: GameState;
  events: GameEvent[];
}

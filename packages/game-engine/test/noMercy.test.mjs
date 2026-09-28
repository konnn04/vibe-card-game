/**
 * Kiểm thử luật Ú Nồ No Mercy — chạy trên bản build (dist): `pnpm build && pnpm test`.
 * Dùng node:test có sẵn trong Node, không cần thư viện test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeck, createGame, reduce, botAction, botReaction, legalActions, face, RUSH_GRACE_MS,
} from '../dist/index.js';

const TOTAL = 168;
let uid = 0;
const card = (color, value) => ({ id: `t${uid++}`, light: { color, value } });

/** Ván No Mercy với `n` người, đã dọn sạch để tự xếp bài. */
function table(n = 3, rules = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const { state: s } = createGame({ seed: 7, deckType: 'noMercy', players, rules, now: 0 });
  s.turn = 0;
  s.direction = 1;
  s.turnHoldUntil = 0;
  s.pending = null;
  s.discard = [card('red', '5')];
  s.activeColor = 'red';
  s.drawPile = Array.from({ length: 30 }, () => card('blue', '1'));
  for (const p of s.players) p.hand = [card('green', '9'), card('green', '8')];
  return s;
}
const act = (s, a, now = 10) => {
  const r = reduce(s, a, now);
  assert.notEqual(r.events[0]?.t, 'reject', `bị từ chối: ${JSON.stringify(r.events[0])} cho ${JSON.stringify(a)}`);
  return r;
};
const rejected = (s, a, now = 10) => reduce(s, a, now).events[0]?.t === 'reject';
/** Chạy hết chuỗi rút từng lá (drawRun) như server tự làm. */
function finishDrawRun(s) {
  let guard = 0;
  while (s.drawRun && guard++ < 200) s = act(s, { type: 'DRAW', playerId: s.players[s.turn].id }, s.turnHoldUntil + 1).state;
  return s;
}

test('1. Bộ bài đủ 168 lá, đúng số lượng từng loại', () => {
  const deck = buildDeck('noMercy', 1);
  assert.equal(deck.length, TOTAL);
  const count = (pred) => deck.filter((c) => pred(c.light)).length;
  assert.equal(count((f) => /^\d$/.test(f.value)), 80);
  for (const color of ['red', 'yellow', 'green', 'blue']) for (let v = 0; v <= 9; v++)
    assert.equal(count((f) => f.color === color && f.value === String(v)), 2, `${color} ${v}`);
  const expect = { skip: 12, reverse: 12, draw2: 12, discardAll: 12, skipAll: 8, draw4: 8, wildRev4: 8, wild6: 4, wild10: 4, wildRoulette: 8 };
  for (const [v, n] of Object.entries(expect)) assert.equal(count((f) => f.value === v), n, v);
  assert.equal(count((f) => f.value === 'wild' || f.value === 'wild4'), 0, 'không có Wild thường / Wild +4 cổ điển');
  assert.equal(count((f) => f.value === 'draw4' && f.color === 'wild'), 0, '+4 là lá MÀU');
  assert.equal(new Set(deck.map((c) => c.id)).size, TOTAL, 'id không trùng');
});

test('2. Lá mở đầu luôn là lá số (lá hành động/Wild bị nhét lại)', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const { state } = createGame({ seed, deckType: 'noMercy', players: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], now: 0 });
    assert.match(face(state.discard[0], 'light').value, /^\d$/, `seed ${seed}`);
    assert.equal(state.players.reduce((k, p) => k + p.hand.length, 0) + state.drawPile.length + state.discard.length, TOTAL);
  }
});

test('3. Rút tới khi đánh được, rồi BẮT BUỘC đánh đúng lá đó', () => {
  let s = table(3);
  s.players[0].hand = [card('green', '9'), card('green', '8')];
  const drawn = card('red', '2');
  // pop() lấy từ cuối: 2 lá không đánh được rồi mới tới lá đỏ.
  s.drawPile = [card('blue', '1'), drawn, card('yellow', '3'), card('blue', '4')];
  s = act(s, { type: 'DRAW', playerId: 'p0' }).state;
  s = finishDrawRun(s);
  assert.equal(s.turn, 0, 'vẫn là lượt mình');
  assert.equal(s.players[0].hand.length, 5);
  assert.equal(s.mustPlayCardId, drawn.id);
  // Có thêm một lá đỏ khác đánh được nhưng bị cấm — phải đánh đúng lá vừa rút.
  const other = card('red', '7');
  s.players[0].hand.push(other);
  assert.ok(rejected(s, { type: 'PLAY', playerId: 'p0', cardId: other.id }, s.turnHoldUntil + 1));
  assert.ok(rejected(s, { type: 'PASS', playerId: 'p0' }, s.turnHoldUntil + 1), 'không được bỏ lượt');
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: drawn.id }, s.turnHoldUntil + 1).state;
  assert.equal(s.discard.at(-1).id, drawn.id);
});

test('4. Chồng phạt: +2 -> +4 -> +6 cộng dồn; +2 không lên +4; màu bỏ qua; Skip không né được', () => {
  let s = table(4);
  const p2 = card('red', 'draw2'), p4 = card('blue', 'draw4'), p6 = card('wild', 'wild6'), small = card('red', 'draw2'), sk = card('red', 'skip');
  s.players[0].hand.push(p2);
  s.players[1].hand.push(p4);
  s.players[2].hand.push(p6, sk);
  s.players[3].hand.push(small);
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: p2.id }).state;
  assert.equal(s.pending.amount, 2);
  // +4 màu XANH chồng lên +2 ĐỎ: màu không quan trọng.
  s = act(s, { type: 'PLAY', playerId: 'p1', cardId: p4.id }, 20).state;
  assert.equal(s.pending.amount, 6);
  assert.ok(rejected(s, { type: 'PLAY', playerId: 'p2', cardId: sk.id }, 30), 'Skip không né được phạt');
  s = act(s, { type: 'PLAY', playerId: 'p2', cardId: p6.id, chosenColor: 'green' }, 30).state;
  assert.equal(s.pending.amount, 12);
  assert.equal(s.activeColor, 'green', 'Wild dùng để chồng vẫn chọn màu');
  // p3 chỉ có +2 < +6 -> không chồng được, phải rút đủ 12 và mất lượt.
  assert.ok(rejected(s, { type: 'PLAY', playerId: 'p3', cardId: small.id }, 40), '+2 không lên được +6');
  const before = s.players[3].hand.length;
  s = act(s, { type: 'DRAW', playerId: 'p3' }, 40).state;
  assert.equal(s.players[3].hand.length, before + 12);
  assert.equal(s.pending, null);
  assert.equal(s.turn, 0);
});

test('5. Wild Đảo chiều +4: 3+ người phạt người kế theo CHIỀU MỚI; 2 người thì phạt đối thủ', () => {
  let s = table(4);
  const r4 = card('wild', 'wildRev4');
  s.players[1].hand.push(r4);
  s.turn = 1;
  s = act(s, { type: 'PLAY', playerId: 'p1', cardId: r4.id, chosenColor: 'blue' }).state;
  assert.equal(s.direction, -1);
  assert.equal(s.turn, 0, 'chiều mới: người kế của p1 là p0');
  assert.equal(s.pending.amount, 4);

  let t = table(2);
  const r = card('wild', 'wildRev4');
  t.players[0].hand.push(r);
  // Đánh lá WildRev4 không truyền sẵn màu -> vào awaitColor
  t = act(t, { type: 'PLAY', playerId: 'p0', cardId: r.id }).state;
  assert.equal(t.phase, 'awaitColor');
  // Chọn màu -> kết thúc lựa chọn, hiệu ứng đổi chiều + phạt 4 chuyển sang P1
  t = act(t, { type: 'CHOOSE_COLOR', playerId: 'p0', color: 'blue' }).state;
  assert.equal(t.direction, -1);
  assert.equal(t.turn, 1, '2 người: đối thủ p1 nhận phạt, KHÔNG phải p0');
  assert.equal(t.pending.amount, 4);

  // Nếu p1 không chồng được mà phải rút: p1 rút 4 lá và mất lượt, lượt về lại p0
  const p1HandBefore = t.players[1].hand.length;
  t = act(t, { type: 'DRAW', playerId: 'p1' }, t.turnHoldUntil + 1).state;
  assert.equal(t.players[1].hand.length, p1HandBefore + 4, 'p1 phải gánh 4 lá phạt');
  assert.equal(t.pending, null);
  assert.equal(t.turn, 0, 'sau khi p1 nhận phạt, lượt quay về p0');

  // Test thêm trường hợp chồng phạt ngược lại
  let t2 = table(2);
  const r2 = card('wild', 'wildRev4');
  t2.players[0].hand.push(r2);
  t2 = act(t2, { type: 'PLAY', playerId: 'p0', cardId: r2.id, chosenColor: 'blue' }).state;
  assert.equal(t2.turn, 1);
  assert.equal(t2.pending.amount, 4);
  const back = card('red', 'draw4');
  t2.players[1].hand.push(back);
  t2 = act(t2, { type: 'PLAY', playerId: 'p1', cardId: back.id }, t2.turnHoldUntil + 1).state;
  assert.equal(t2.turn, 0);
  assert.equal(t2.pending.amount, 8);
});

test('6. Đổi chiều khi còn 2 người = Cấm lượt; Cấm cả bàn trả lượt về người đánh', () => {
  let s = table(2);
  const rv = card('red', 'reverse');
  s.players[0].hand.push(rv);
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: rv.id }).state;
  assert.equal(s.turn, 0);

  let t = table(4);
  const sa = card('red', 'skipAll');
  t.players[2].hand.push(sa);
  t.turn = 2;
  t = act(t, { type: 'PLAY', playerId: 'p2', cardId: sa.id }).state;
  assert.equal(t.turn, 2);
});

test('7. Bỏ hết: mọi lá cùng màu theo xuống; hết bài là thắng', () => {
  let s = table(3);
  const da = card('red', 'discardAll');
  s.players[0].hand = [da, card('red', '1'), card('red', 'skip'), card('blue', '3')];
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: da.id }).state;
  assert.deepEqual(s.players[0].hand.map((c) => c.light.color), ['blue']);
  assert.equal(s.discard.at(-1).id, da.id, 'lá Bỏ hết vẫn nằm trên đỉnh');
  assert.equal(s.discard.length, 4);

  let t = table(3);
  const d2 = card('red', 'discardAll');
  t.players[0].hand = [d2, card('red', '1'), card('red', '2')];
  t = act(t, { type: 'PLAY', playerId: 'p0', cardId: d2.id }).state;
  assert.equal(t.phase, 'roundEnd');
  assert.equal(t.winnerId, 'p0');
});

test('8. Color Roulette: người bị nhắm chọn màu, Wild lật ra không tính, nhận hết lá và mất lượt; không chồng được', () => {
  let s = table(3);
  const ro = card('wild', 'wildRoulette');
  s.players[0].hand.push(ro);
  const hit = card('yellow', '4');
  // Lật từ cuối: xanh, Wild +6 (không tính màu), đỏ, rồi vàng.
  s.drawPile = [card('blue', '1'), hit, card('red', '3'), card('wild', 'wild6'), card('blue', '2')];
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: ro.id }).state;
  assert.equal(s.phase, 'awaitRoulette');
  assert.equal(s.resume.playerId, 'p1');
  assert.ok(rejected(s, { type: 'CHOOSE_COLOR', playerId: 'p0', color: 'yellow' }), 'người đánh không được chọn màu');
  const before = s.players[1].hand.length;
  s = act(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'yellow' }).state;
  s = finishDrawRun(s);
  assert.equal(s.players[1].hand.length, before + 4, 'nhận cả 4 lá đã lật, kể cả lá khớp');
  assert.ok(s.players[1].hand.some((c) => c.id === hit.id));
  assert.equal(s.activeColor, 'yellow');
  assert.equal(s.turn, 2, 'người bị Roulette mất lượt');
  assert.equal(s.pending, null);

  // Không dùng Roulette để né / chồng lên chuỗi phạt.
  let t = table(3);
  const p2 = card('red', 'draw2'), r2 = card('wild', 'wildRoulette');
  t.players[0].hand.push(p2);
  t.players[1].hand.push(r2);
  t = act(t, { type: 'PLAY', playerId: 'p0', cardId: p2.id }).state;
  assert.ok(rejected(t, { type: 'PLAY', playerId: 'p1', cardId: r2.id }, 20));
});

test('9. Lá 7 đổi bài, lá 0 chuyền bài theo chiều hiện tại; 0/7 là lá cuối thì thắng ngay', () => {
  let s = table(3);
  const seven = card('red', '7');
  s.players[0].hand = [seven, card('green', '1'), card('green', '2')];
  const p2Hand = s.players[2].hand.map((c) => c.id);
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: seven.id }).state;
  assert.equal(s.phase, 'awaitSwapTarget');
  s = act(s, { type: 'SWAP_TARGET', playerId: 'p0', targetId: 'p2' }).state;
  assert.deepEqual(s.players[0].hand.map((c) => c.id), p2Hand);

  let t = table(3);
  t.direction = -1;
  const zero = card('red', '0');
  t.players[0].hand = [zero, card('green', '1')];
  const before = t.players.map((p) => p.hand.filter((c) => c.id !== zero.id).map((c) => c.id));
  t = act(t, { type: 'PLAY', playerId: 'p0', cardId: zero.id }).state;
  // Chiều -1: p0 -> p2 -> p1 -> p0. Mỗi người nhận bài của người ĐỨNG TRƯỚC mình theo chiều chơi.
  assert.deepEqual(t.players[2].hand.map((c) => c.id), before[0]);
  assert.deepEqual(t.players[1].hand.map((c) => c.id), before[2]);
  assert.deepEqual(t.players[0].hand.map((c) => c.id), before[1]);

  let u = table(3);
  const last7 = card('red', '7');
  u.players[0].hand = [last7];
  u = act(u, { type: 'PLAY', playerId: 'p0', cardId: last7.id }).state;
  assert.equal(u.phase, 'roundEnd');
  assert.equal(u.winnerId, 'p0');
});

test('10. Mercy: đủ 25 lá sau rút / đổi bài / Roulette là bị loại; bài quay lại chồng rút', () => {
  // Sau rút phạt
  let s = table(3);
  s.players[1].hand = Array.from({ length: 22 }, () => card('green', '1'));
  const p4 = card('red', 'draw4');
  s.players[0].hand.push(p4);
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: p4.id }).state;
  const pileBefore = s.drawPile.length;
  s = act(s, { type: 'DRAW', playerId: 'p1' }, 20).state;
  assert.equal(s.players[1].eliminated, true);
  assert.equal(s.players[1].hand.length, 0);
  assert.equal(s.drawPile.length, pileBefore - 4 + 26, 'bài người bị loại (26 lá) về chồng rút');
  assert.equal(s.turn, 2, 'lượt sang người hợp lệ kế tiếp');

  // Sau đổi bài (lá 7): nhận về 25 lá là bị loại.
  let u = table(3);
  u.players[0].hand = [card('red', '7'), ...Array.from({ length: 25 }, () => card('green', '1'))];
  u = act(u, { type: 'PLAY', playerId: 'p0', cardId: u.players[0].hand[0].id }).state;
  u = act(u, { type: 'SWAP_TARGET', playerId: 'p0', targetId: 'p1' }).state;
  assert.equal(u.players[1].eliminated, true, 'nhận 25 lá qua đổi bài -> bị loại');

  // Sau Roulette
  let v = table(3);
  const ro = card('wild', 'wildRoulette');
  v.players[0].hand.push(ro);
  v.players[1].hand = Array.from({ length: 23 }, () => card('green', '1'));
  v.drawPile = [card('yellow', '4'), card('red', '1'), card('blue', '1')];
  v = act(v, { type: 'PLAY', playerId: 'p0', cardId: ro.id }).state;
  v = act(v, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'yellow' }).state;
  v = finishDrawRun(v);
  assert.equal(v.players[1].eliminated, true);
});

test('11. Người cuối cùng còn lại thắng ván (và được +250 cho mỗi người bị loại)', () => {
  let s = table(2);
  s.players[1].hand = Array.from({ length: 23 }, () => card('green', '1'));
  const p2 = card('red', 'draw2');
  s.players[0].hand = [p2, card('blue', '3')];
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: p2.id }).state;
  s = act(s, { type: 'DRAW', playerId: 'p1' }, 20).state;
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.winnerId, 'p0');
  assert.ok(s.lastScores.p0 >= 250);
});

test('12. Quên hô Ú Nồ: bị bắt sau ân hạn thì rút 2; trong ân hạn thì chưa bắt được; hô rồi không hô lại được', () => {
  let s = table(3);
  const c = card('red', '1');
  s.players[0].hand = [c, card('red', '2')];
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: c.id }, 100).state;
  assert.equal(s.rushWindow.playerId, 'p0');
  assert.ok(rejected(s, { type: 'CATCH_RUSH', playerId: 'p1', targetId: 'p0' }, 100 + RUSH_GRACE_MS - 1));

  // Kiểm tra hô Ú Nồ chỉ được 1 lần:
  let sRush = act(s, { type: 'CALL_RUSH', playerId: 'p0' }, 110).state;
  assert.equal(sRush.players[0].calledRush, true);
  assert.equal(sRush.rushWindow, null);
  // Bấm hô lần 2 bị từ chối, không thể spam tiếng hô hay điểm:
  assert.ok(rejected(sRush, { type: 'CALL_RUSH', playerId: 'p0' }, 120));

  const r = act(s, { type: 'CATCH_RUSH', playerId: 'p1', targetId: 'p0' }, 100 + RUSH_GRACE_MS + 1);
  assert.equal(r.state.players[0].hand.length, 3);
  // Người kế tiếp đã bắt đầu lượt (rút/đánh) -> cửa sổ đóng, hết bắt được.
  const next = act(s, { type: 'DRAW', playerId: 'p1' }, 200).state;
  assert.equal(next.rushWindow, null);
  assert.ok(rejected(next, { type: 'CATCH_RUSH', playerId: 'p2', targetId: 'p0' }, 200 + RUSH_GRACE_MS + 1));
});

test('13. Bảo toàn 168 lá và luật Mercy qua cả ván (bot tự chơi, nhiều seed, 2-6 người)', () => {
  for (let n = 2; n <= 6; n++) for (let g = 0; g < 8; g++) {
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
    let { state: s } = createGame({ seed: g * 97 + n, deckType: 'noMercy', players, now: 0 });
    let now = 0;
    for (let step = 0; step < 20000 && s.phase !== 'roundEnd'; step++) {
      now = Math.max(now + 50, s.turnHoldUntil);
      const actor = s.resume?.playerId ?? s.players[s.turn].id;
      let a = botAction(s, actor);
      if (!a) for (const p of s.players) { a = botReaction(s, p.id); if (a) break; }
      if (!a) { now = Math.max(now, s.turnDeadline + 1); a = { type: 'TIMEOUT', playerId: actor }; }
      let r = reduce(s, a, now);
      if (r.events[0]?.t === 'reject') { now = Math.max(now, s.turnDeadline + 1); r = reduce(s, { type: 'TIMEOUT', playerId: actor }, now); }
      assert.notEqual(r.events[0]?.t, 'reject', 'ván không được kẹt');
      s = r.state;
      const total = s.players.reduce((k, p) => k + p.hand.length, 0) + s.drawPile.length + s.discard.length;
      assert.equal(total, TOTAL);
      for (const p of s.players) if (!p.eliminated) assert.ok(p.hand.length < 25);
    }
    assert.equal(s.phase, 'roundEnd', `${n} người seed ${g} phải kết thúc`);
  }
});

test('legalActions: lá sáng đúng luật (chồng phạt chỉ liệt kê lá chồng được)', () => {
  let s = table(3);
  const p4 = card('red', 'draw4'), two = card('blue', 'draw2'), ten = card('wild', 'wild10');
  s.players[0].hand.push(p4);
  s.players[1].hand.push(two, ten);
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: p4.id }).state;
  const plays = legalActions(s, 'p1', 20).filter((a) => a.type === 'PLAY');
  assert.ok(plays.every((a) => a.cardId === ten.id), 'chỉ +10 chồng được lên +4');
  assert.equal(plays.length, 4, '+10 là Wild: một nước cho mỗi màu');
  assert.ok(legalActions(s, 'p1', 20).some((a) => a.type === 'DRAW'));
});

test('Lá 7 không đổi bài được với người đã bị loại (người, bot, hết giờ)', () => {
  let s = table(3);
  s.players[2].eliminated = true;
  s.players[2].hand = [];
  const seven = card('red', '7');
  s.players[0].hand = [seven, card('green', '1'), card('green', '2')];
  s = act(s, { type: 'PLAY', playerId: 'p0', cardId: seven.id }).state;
  assert.ok(rejected(s, { type: 'SWAP_TARGET', playerId: 'p0', targetId: 'p2' }), 'người chơi không chọn được');
  assert.equal(botAction(s, 'p0').targetId, 'p1', 'bot không chọn người 0 lá đã bị loại');
  const t = act(s, { type: 'TIMEOUT', playerId: 'p0' }, s.turnDeadline + 1).state;
  assert.equal(t.players[2].hand.length, 0, 'hết giờ cũng không đổi với người bị loại');
  assert.ok(t.players[0].hand.length > 0, 'người đánh vẫn còn bài');
});

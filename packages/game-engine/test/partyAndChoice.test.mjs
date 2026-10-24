import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, createGame, maxPlayersFor, minPlayersFor, reduce } from '../dist/index.js';

test('1. Đánh lá Wild khi còn 2 lá -> CHƯA mở rushWindow khi đang ở awaitColor, chọn màu xong mới mở', () => {
  const players = [
    { id: 'p0', name: 'Player 0', score: 0 },
    { id: 'p1', name: 'Player 1', score: 0 },
    { id: 'p2', name: 'Player 2', score: 0 },
  ];
  const { state: init } = createGame({ seed: 42, players, deckType: 'classic' });
  let s = init;
  s.players[0].hand = [
    { id: 'w1', light: { color: 'wild', value: 'wild' } },
    { id: 'r5', light: { color: 'red', value: '5' } },
  ];
  s.turn = 0;
  const now = 10000;

  const rPlay = reduce(s, { type: 'PLAY', playerId: 'p0', cardId: 'w1' }, now);
  s = rPlay.state;

  assert.equal(s.players[0].hand.length, 1, 'p0 còn đúng 1 lá sau khi đánh');
  assert.equal(s.phase, 'awaitColor', 'Vào pha chờ chọn màu');
  assert.equal(s.rushWindow, null, 'Cửa sổ Ú Nồ KHÔNG ĐƯỢC MỞ khi đang chọn màu (tránh bị bắt oan)');

  const rCatch = reduce(s, { type: 'CATCH_RUSH', playerId: 'p1', targetId: 'p0' }, now + 2000);
  assert.ok(rCatch.events.some((e) => e.t === 'reject' && e.reason === 'nothing-to-catch'), 'Không thể bắt Ú Nồ khi chưa mở cửa sổ');

  const rColor = reduce(s, { type: 'CHOOSE_COLOR', playerId: 'p0', color: 'red' }, now + 500);
  s = rColor.state;

  assert.equal(s.phase, 'awaitPlay', 'Pha chuyển về awaitPlay');
  assert.ok(s.rushWindow, 'Cửa sổ Ú Nồ ĐƯỢC MỞ sau khi đã chọn xong màu');
  assert.equal(s.rushWindow.playerId, 'p0');
  assert.equal(s.rushWindow.openedAt, now + 500, 'Thời gian mở cửa sổ tính từ lúc chọn màu xong');
});

test('2. Đánh lá 7 đổi bài khi còn 2 lá -> CHƯA mở rushWindow khi đang ở awaitSwapTarget', () => {
  const players = [
    { id: 'p0', name: 'Player 0', score: 0 },
    { id: 'p1', name: 'Player 1', score: 0 },
    { id: 'p2', name: 'Player 2', score: 0 },
  ];
  const { state: init } = createGame({
    seed: 42,
    players,
    deckType: 'classic',
    rules: { sevenZero: true },
  });
  let s = init;
  s.activeColor = 'blue';
  s.players[0].hand = [
    { id: 'b7', light: { color: 'blue', value: '7' } },
    { id: 'b1', light: { color: 'blue', value: '1' } },
  ];
  // Cho p1 có 3 lá
  s.players[1].hand = [
    { id: 'r1', light: { color: 'red', value: '1' } },
    { id: 'r2', light: { color: 'red', value: '2' } },
    { id: 'r3', light: { color: 'red', value: '3' } },
  ];
  s.turn = 0;
  const now = 10000;

  // p0 đánh lá 7
  const rPlay = reduce(s, { type: 'PLAY', playerId: 'p0', cardId: 'b7' }, now);
  s = rPlay.state;

  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.phase, 'awaitSwapTarget');
  assert.equal(s.rushWindow, null, 'Không mở rushWindow khi đang chọn người đổi bài');

  // p0 chọn đổi với p1 -> p0 nhận 3 lá, p1 nhận 1 lá
  const rSwap = reduce(s, { type: 'SWAP_TARGET', playerId: 'p0', targetId: 'p1' }, now + 600);
  s = rSwap.state;

  assert.equal(s.players[0].hand.length, 3, 'p0 nhận 3 lá từ p1');
  assert.equal(s.players[1].hand.length, 1, 'p1 nhận 1 lá từ p0');
  assert.ok(s.rushWindow, 'rushWindow mở cho người thực sự cầm 1 lá sau đổi');
  assert.equal(s.rushWindow.playerId, 'p1');
});

test('3. Party Chỉ tay: TIMEOUT hết giờ không bị reject not-your-turn và tự động bầu cho bot chưa bầu', () => {
  const players = [
    { id: 'user', name: 'User', isBot: false, score: 0 },
    { id: 'bot1', name: 'Bot 1', isBot: true, score: 0 },
    { id: 'bot2', name: 'Bot 2', isBot: true, score: 0 },
    { id: 'bot3', name: 'Bot 3', isBot: true, score: 0 },
  ];
  const { state: init } = createGame({ seed: 999, players, deckType: 'party' });
  let s = init;
  s.players[0].hand = [
    { id: 'pt1', light: { color: s.activeColor, value: 'pointTaken' } },
    { id: 'c2', light: { color: s.activeColor, value: '2' } },
  ];
  s.turn = 0;
  const now = 20000;

  // user đánh pointTaken
  const rPlay = reduce(s, { type: 'PLAY', playerId: 'user', cardId: 'pt1' }, now);
  s = rPlay.state;

  assert.equal(s.phase, 'awaitVote');
  assert.ok(s.vote);
  assert.equal(s.rushWindow, null, 'Chưa mở rushWindow khi đang vòng bầu');

  // Giả sử user bỏ phiếu cho bot1
  const rVoteUser = reduce(s, { type: 'VOTE', playerId: 'user', targetId: 'bot1' }, now + 200);
  s = rVoteUser.state;
  assert.ok(rVoteUser.events.some((e) => e.t === 'vote' && e.playerId === 'user'), 'VOTE phát sinh event vote');

  // Giả sử chỉ có bot1 bỏ phiếu, bot2 và bot3 chưa kịp bỏ phiếu
  const rVoteBot1 = reduce(s, { type: 'VOTE', playerId: 'bot1', targetId: 'user' }, now + 400);
  s = rVoteBot1.state;

  // Hết giờ bầu (deadline) -> Server gửi TIMEOUT (kể cả gửi bằng id của bất kỳ ai trong bàn)
  const deadline = s.vote.deadline;
  const rTimeout = reduce(s, { type: 'TIMEOUT', playerId: 'user' }, deadline + 50);
  s = rTimeout.state;

  assert.equal(s.phase, 'awaitPlay', 'Vòng bầu kết thúc thành công sau TIMEOUT');
  const voteResult = rTimeout.events.find((e) => e.t === 'voteResult');
  assert.ok(voteResult, 'Có event voteResult');
  // Cả 4 người (user + 3 bots) đều phải có phiếu trong voteResult.votes
  assert.ok(voteResult.votes['user'], 'User có phiếu');
  assert.ok(voteResult.votes['bot1'], 'Bot 1 có phiếu');
  assert.ok(voteResult.votes['bot2'], 'Bot 2 tự động được bỏ phiếu');
  assert.ok(voteResult.votes['bot3'], 'Bot 3 tự động được bỏ phiếu');
});

test('4. Tất cả gamemode hỗ trợ 4-8 người và tự nhân bộ bài khi đông người', () => {
  for (const mode of ['classic', 'flip', 'chaos', 'party', 'noMercy']) {
    assert.equal(minPlayersFor(mode), 4, `${mode} minPlayers = 4`);
    assert.equal(maxPlayersFor(mode), 8, `${mode} maxPlayers = 8`);
  }
  assert.equal(buildDeck('classic', 1, 4).length, 108);
  assert.equal(buildDeck('classic', 1, 8).length, 216);
  assert.equal(buildDeck('flip', 1, 4).length, 112);
  assert.equal(buildDeck('flip', 1, 8).length, 224);
  assert.equal(buildDeck('noMercy', 1, 6).length, 168);
  assert.equal(buildDeck('noMercy', 1, 8).length, 336);
  assert.equal(buildDeck('party', 1, 6).length, 168);
  assert.equal(buildDeck('party', 1, 8).length, 336);
});

test('5. UNO Party: Challenge +4 bắt đúng kể cả khi chồng bài mà người đánh vẫn còn màu activeColor', () => {
  const players = [
    { id: 'p0', name: 'P0' },
    { id: 'p1', name: 'P1' },
    { id: 'p2', name: 'P2' },
    { id: 'p3', name: 'P3' },
  ];
  let { state: s } = createGame({ seed: 12, players, deckType: 'party' });
  s.turn = 0;
  s.activeColor = 'red';
  // P0 đánh +2 đỏ -> pending = +2, activeColor = red
  s.players[0].hand = [
    { id: 'r_d2', light: { color: 'red', value: 'draw2' } },
    { id: 'g1', light: { color: 'green', value: '1' } },
  ];
  // P1 vẫn còn lá Đỏ 9 trên tay nhưng lại đánh chồng Wild +4!
  s.players[1].hand = [
    { id: 'w4', light: { color: 'wild', value: 'wild4' } },
    { id: 'r9', light: { color: 'red', value: '9' } },
  ];
  s = reduce(s, { type: 'PLAY', playerId: 'p0', cardId: 'r_d2' }, 1000).state;
  s = reduce(s, { type: 'PLAY', playerId: 'p1', cardId: 'w4', chosenColor: 'blue' }, 2000).state;

  // P2 bắt lỗi (CHALLENGE) -> phải THÀNH CÔNG vì P1 còn lá đỏ 'r9' lúc đánh w4!
  const rChal = reduce(s, { type: 'CHALLENGE', playerId: 'p2' }, 3000);
  const chalEv = rChal.events.find((e) => e.t === 'challenge');
  assert.ok(chalEv && chalEv.success, 'Challenge phải thành công vì P1 còn màu đỏ');
  assert.equal(chalEv.revealedCard?.id, 'r9');
});

test('6. UNO Party: Người chơi bị nổ chết qua Cọng xích trong drawRun chỉ còn 1 người -> kết thúc ván ngay không treo', () => {
  const players = [
    { id: 'p0', name: 'P0' },
    { id: 'p1', name: 'P1' },
    { id: 'p2', name: 'P2' },
    { id: 'p3', name: 'P3' },
  ];
  let { state: s } = createGame({ seed: 55, players, deckType: 'party', rules: { drawToMatch: true, blowUp: true, blowUpAt: 24 } });
  // Giả sử p2 và p3 đã nổ trước đó, chỉ còn p0 và p1 sống, và đang bị xích với nhau
  s.players[2].eliminated = true;
  s.players[2].hand = [];
  s.players[3].eliminated = true;
  s.players[3].hand = [];
  s.chain = { a: 'p0', b: 'p1' };
  s.turn = 0;
  s.activeColor = 'red';
  s.discard = [{ id: 'top', light: { color: 'red', value: '5' } }];
  // p0 có 3 lá, p1 đã có 24 lá (rút thêm 1 lá do xích kéo là p1 nổ!)
  s.players[0].hand = [{ id: 'b1', light: { color: 'blue', value: '1' } }];
  s.players[1].hand = Array.from({ length: 24 }, (_, i) => ({ id: `h${i}`, light: { color: 'green', value: '2' } }));
  s.drawPile = [{ id: 'd1', light: { color: 'yellow', value: '9' } }, { id: 'd2', light: { color: 'yellow', value: '8' } }];

  // p0 rút bài (drawRun toMatch) -> kéo p1 rút 1 lá -> p1 lên 25 lá nổ tung -> chỉ còn p0 sống -> roundEnd ngay!
  const r = reduce(s, { type: 'DRAW', playerId: 'p0' }, 5000);
  assert.equal(r.state.players[1].eliminated, true, 'p1 nổ tung vì xích kéo');
  assert.equal(r.state.phase, 'roundEnd', 'Game kết thúc ván ngay khi chỉ còn 1 người sống');
  assert.equal(r.state.winnerId, 'p0', 'p0 là người thắng');
  assert.ok(r.state.lastScores['p0'] >= 250, 'Người sống sót cuối được cộng điểm thưởng');
});

test('7. Đánh stack 2 lá cùng màu cùng số trong lượt (combo = true đánh cả 2, hoặc đánh lẻ từng lá)', () => {
  const players = [
    { id: 'p0', name: 'P0' },
    { id: 'p1', name: 'P1' },
    { id: 'p2', name: 'P2' },
    { id: 'p3', name: 'P3' },
  ];
  let { state: s } = createGame({ seed: 77, players, deckType: 'classic', rules: { jumpIn: false } });
  s.turn = 0;
  s.activeColor = 'red';
  s.discard = [{ id: 'top', light: { color: 'red', value: '3' } }];
  s.players[0].hand = [
    { id: 'r5_a', light: { color: 'red', value: '5' } },
    { id: 'r5_b', light: { color: 'red', value: '5' } },
    { id: 'b9', light: { color: 'blue', value: '9' } },
  ];

  // Cách 1: Chọn đánh lần cả 2 lá (combo: true)
  const rCombo = reduce(s, { type: 'PLAY', playerId: 'p0', cardId: 'r5_a', combo: true }, 1000);
  assert.equal(rCombo.state.players[0].hand.length, 1, 'Cả 2 lá Đỏ 5 đều được đánh xuống, còn 1 lá');
  assert.equal(rCombo.state.players[0].hand[0].id, 'b9');

  // Cách 2: Không bật combo (đánh 1 lá trước), rồi bấm bồi tiếp lá thứ 2 cùng màu cùng số
  const rOne = reduce(s, { type: 'PLAY', playerId: 'p0', cardId: 'r5_a' }, 1000);
  assert.equal(rOne.state.players[0].hand.length, 2, 'Chỉ đánh 1 lá khi không truyền combo');
  const rTwo = reduce(rOne.state, { type: 'PLAY', playerId: 'p0', cardId: 'r5_b' }, 1100);
  assert.equal(rTwo.state.players[0].hand.length, 1, 'Đánh bồi tiếp lá giống hệt thứ 2 thành công');
});

test('8. Đổi chỗ ngẫu nhiên (randomizeSeats) khi kết thúc ván và qua ván mới (NEXT_ROUND)', () => {
  const players = [
    { id: 'p0', name: 'P0' },
    { id: 'p1', name: 'P1' },
    { id: 'p2', name: 'P2' },
    { id: 'p3', name: 'P3' },
  ];
  let { state: s } = createGame({ seed: 101, players, deckType: 'classic', rules: { randomizeSeats: true } });
  s.phase = 'roundEnd';
  s.winnerId = 'p0';

  const prevIds = s.players.map((p) => p.id);
  const rNext = reduce(s, { type: 'NEXT_ROUND' }, 2000);
  const nextIds = rNext.state.players.map((p) => p.id);

  assert.equal(rNext.state.roundNo, 2, 'Sang ván 2');
  // Kiểm tra thứ tự vòng tròn quanh bàn thực sự đổi khác so với ván trước
  const idx0 = nextIds.indexOf(prevIds[0]);
  const sameCircle = prevIds.every((id, k) => nextIds[(idx0 + k) % prevIds.length] === id);
  assert.equal(sameCircle, false, 'Thứ tự chỗ ngồi quanh bàn đã được xáo trộn');

  // Khi tắt randomizeSeats -> giữ nguyên thứ tự ghế
  let { state: sFixed } = createGame({ seed: 101, players, deckType: 'classic', rules: { randomizeSeats: false } });
  sFixed.phase = 'roundEnd';
  const rFixed = reduce(sFixed, { type: 'NEXT_ROUND' }, 2000);
  assert.deepEqual(
    rFixed.state.players.map((p) => p.id),
    ['p0', 'p1', 'p2', 'p3'],
    'Tắt randomizeSeats thì giữ nguyên thứ tự ghế',
  );
});

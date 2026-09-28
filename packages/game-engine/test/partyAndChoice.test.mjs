import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduce } from '../dist/index.js';

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

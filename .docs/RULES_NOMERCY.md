# Ú Nồ No Mercy

> Bản trong game của các luật này nằm ở tab **No Mercy** trong *Hướng dẫn chơi* và bảng **(i)** trong ván (khoá i18n `howto.nm*`). File này là bản tham chiếu đầy đủ.
> The in-game version lives in the **No Mercy** tab of *How to play* and the in-match **(i)** panel (`howto.nm*` i18n keys). This file is the full reference.

---

## Tiếng Việt

**2–6 người · 168 lá · không có Đổi màu thường.**

### Bộ bài
| Lá | Số lượng |
|---|---|
| Số 0–9 (mỗi số 2 lá mỗi màu) | 80 |
| Cấm lượt, Đổi chiều, +2, Bỏ hết (3 lá mỗi màu) | 48 |
| Cấm cả bàn, +4 màu (2 lá mỗi màu) | 16 |
| Wild Đảo chiều +4 | 8 |
| Wild +6 / Wild +10 | 4 / 4 |
| Wild Color Roulette | 8 |

### Lượt chơi
- Đánh lá cùng màu, cùng số hoặc cùng ký hiệu. Lá Wild đánh lúc nào cũng được (trừ khi đang bị phạt).
- Không có lá hợp lệ: **rút liên tục tới khi ra lá đánh được, rồi bắt buộc đánh đúng lá đó**.

### Lá đặc biệt
- **7**: bắt buộc đổi toàn bộ bài với một người. **0**: cả bàn chuyền bài theo chiều chơi. 0 hoặc 7 là lá cuối thì thắng luôn, không đổi/chuyền.
- **Đổi chiều**: còn 2 người thì như Cấm lượt.
- **Cấm cả bàn**: mọi người khác mất lượt, bạn đánh tiếp.
- **Bỏ hết**: bỏ cùng lúc tất cả lá cùng màu với lá này. Hết bài là thắng.
- **Wild Đảo chiều +4**: đảo chiều, người kế theo chiều mới rút 4. Còn 2 người thì chính người đánh chịu 4 (vẫn được chồng lá ≥ 4).
- **Color Roulette**: người kế tiếp chọn màu, lật từng lá tới khi ra màu đó (Wild không tính), nhận hết số lá đã lật và mất lượt. Không phải lá rút, không chồng được.

### Chồng phạt
Bị phạt thì chỉ được đánh lá rút **có giá trị ≥ lá vừa chồng**, màu không quan trọng (+2 → +4 → +6 → +10). Không chồng được thì rút cả tổng và mất lượt. Không lá nào khác né được phạt.

### Mercy
Có **từ 25 lá** trở lên (sau rút, bị phạt, đổi bài, chuyền bài, Roulette) là **bị loại ngay**. Người cuối cùng còn lại thắng ván.

### Hô Ú Nồ
Còn 1 lá phải bấm hô. Bị bắt trước khi người kế bắt đầu lượt thì rút 2 lá.

### Tính điểm (đua 1000)
Lá số theo số, lá màu chức năng 20, lá Wild 50, **mỗi người bị loại +250**.

---

## English

**2–6 players · 168 cards · no plain Wild.**

### Deck
| Card | Count |
|---|---|
| Numbers 0–9 (2 of each per colour) | 80 |
| Skip, Reverse, +2, Discard All (3 per colour) | 48 |
| Skip Everyone, colour +4 (2 per colour) | 16 |
| Wild Reverse +4 | 8 |
| Wild +6 / Wild +10 | 4 / 4 |
| Wild Color Roulette | 8 |

### Turn
- Match the colour, number or symbol. Wilds can be played any time (except under a penalty).
- No legal card: **keep drawing until you can play, then you must play that card**.

### Special cards
- **7**: you must swap your whole hand with someone. **0**: everyone passes their hand in the direction of play. A 0 or 7 as your last card wins at once — no swap.
- **Reverse**: acts as a Skip with 2 players.
- **Skip Everyone**: everyone else is skipped, you play again.
- **Discard All**: discard every card of that colour at once. Emptying your hand wins.
- **Wild Reverse +4**: reverse, then the next player in the new direction draws 4. With 2 players the player who played it takes the 4 (they may still stack a card worth ≥ 4).
- **Color Roulette**: the next player picks a colour and flips cards until it shows (Wilds don't count), takes every flipped card and loses their turn. Not a draw card — can't be stacked.

### Stacking
Under a penalty you may only play a draw card **worth at least the last one stacked**, any colour (+2 → +4 → +6 → +10). Otherwise draw the total and lose your turn. Nothing else dodges it.

### Mercy
Holding **25 or more cards** (after drawing, penalties, swaps, passes or Roulette) knocks you out immediately. The last player standing wins the round.

### Calling Ú Nồ
Hit the button at one card. Caught before the next player starts their turn: draw 2.

### Scoring (race to 1000)
Numbers at face value, coloured action cards 20, Wilds 50, **+250 per knocked-out player**.

---

## Rule assumptions / Giả định luật

Chỗ spec không nói rõ — được đánh dấu `RULE-ASSUMPTION` trong code:

1. Bài của người bị loại được xáo vào **đáy** chồng rút ngay (chỉ rút tới khi chồng cũ cạn) — tương đương "để riêng rồi gộp khi xáo lại".
2. Lá rút là lá cuối thì vẫn phạt người kế (như mọi mode), rồi mới chốt thắng.
3. Các lá bỏ kèm lá **Bỏ hết** không kích hoạt hiệu ứng.
4. Ngưỡng Mercy cố định 25, chỉ bật/tắt được (công tắc *Vỡ trận* chung).
5. "Bắt buộc đánh lá vừa rút" gắn với luật *Bắt buộc đánh*; tắt luật đó thì rút xong được chọn.
6. Hết giờ khi bị Color Roulette nhắm: tự chọn màu mình giữ nhiều nhất (giống hết giờ chọn màu Wild).
7. Còn 2 người đánh Wild Đảo chiều +4: người đánh chịu phạt (theo luật chính thức), vẫn được chồng.

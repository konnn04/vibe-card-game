# @u-no/game-engine

Luật Ú Nô thuần TypeScript. **Không được import** React / Next / Three.js / DOM API
ở package này — nó chỉ nhận `Action` và trả về `{ state, events }`.

- `engine.ts` — state machine authoritative (reducer thuần, deterministic theo seed).
- `rules.ts` — canPlay / điểm / mapping Flip.
- `deck.ts` — build bộ classic (108 lá) & Flip (2 mặt).
- `bot.ts` — AI chọn nước đi, cũng thuần data.

Layer render 3D chỉ đọc `state` + phát animation theo `events`.

# Ú Nồ - Rules Engine & Mechanics

This document details the mechanics, deck structures, special cards, and rule options implemented in `@u-no/game-engine`.

---

## 1. Decks

### Classic Deck
- Standard 108 cards across 4 colors (`red`, `yellow`, `green`, `blue`).
- Numbers: `0` (1 per color), `1-9` (2 per color).
- Action cards: `skip` (x2), `reverse` (x2), `draw2` (x2).
- Wild cards: `wild` (x4), `wild4` (x4).

### Flip Deck (Double-Sided Cards)
- 112 cards with two active sides: **Light** side and **Dark** side.
- Light Side colors: `red`, `yellow`, `green`, `blue`.
  - Action cards: `skip`, `reverse`, `draw1`, `flip`.
  - Wild cards: `wild`, `wild2`.
- Dark Side colors: `pink`, `teal`, `orange`, `purple`.
  - Tougher action cards: `skipAll` (skips everyone, returning turn to player), `reverse`, `draw5`, `flip`.
  - Wild cards: `wildColor` (draw until a designated color is drawn).

### Chaos Deck (`chaos`, 2–8 players)
- 212 cards: the full classic deck + 104 single-sided Dark cards (4 Dark colors: `1-9` x2, `skipAll`/`reverse`/`draw5` x2) + 4 Dark `wild` + 4 `wildColor`. 8 colors on the table.
- Color choice: a plain `wild` (either art) may call any of the 8 colors; `wild4` only the 4 Light colors; `wildColor` only the 4 Dark colors.
- `drawToMatch` is forced off. Optional **Blow-up** at 30 cards.

### Party Deck (`party`, 4–8 players, UNO Party! 2025 edition)
- 168 cards: numbers 76 (`0` x1, `1-9` x2 per color), `skip`/`reverse`/`draw2` x2 per color, `wild` 16, `wild4` 12, `pointTaken` 16 (4 per color), `wildTogether` 12, `wildPileUp` 12.
- `stack` and `jumpIn` are forced on. Speed Play only accepts **number** cards; a wrong out-of-turn number card costs 1 penalty card.
- `pointTaken` (colored) → phase `awaitVote`: every active player casts a hidden `VOTE` within `VOTE_MS`; resolves early once everyone voted. Each target draws `min(votes, 5)`. Breaks an existing chain.
- `wildTogether` → phase `awaitChain`: the player sends `CHAIN {a, b}`; from then on any draw by one of them is mirrored to the other (`state.chain`) until a `pointTaken` or the round ends.
- `wildPileUp` → opens `state.pileUp` (one seed card from the draw pile). While active only cards of the chosen color can be played, into the side pile. `DRAW` (or timeout) takes the whole side pile and the main loop resumes from that player.
- Optional **Blow-up** at 36 cards (without it, bot simulations of this deck almost never finish a round).

### No Mercy Deck (`noMercy`, 2–6 players)
- 168 cards, no plain Wild — see [RULES_NOMERCY.md](RULES_NOMERCY.md) for the full rules and the list of rule assumptions.
- `drawToMatch` forced on, `challenge` forced off; `sevenZero` and `stack` on by default. With `forcePlay`, the drawn playable card must be the one played (`state.mustPlayCardId`).
- Stacking by value via `NoMercyMode.canStackOn` (`pending.last` = value of the last stacked card).
- Color Roulette → phase `awaitRoulette`: the targeted player answers with `CHOOSE_COLOR`, then a `drawRun` of kind `color` flips cards until that colour.
- Mercy (Blow-up) at 25 cards, also checked after 0/7 hand changes; +250 points per knocked-out player.
- Tests: `pnpm -C packages/game-engine build && pnpm -C packages/game-engine test` (node:test, `test/noMercy.test.mjs`).

### Adding a new mode
Every mode is a `DeckMode` subclass in `packages/game-engine/src/modes.ts` (deck composition, min/max players, `forcedRules`, `eliminateOver`, `jumpInPenalty`, `colorsFor`). Register it in `MODES`, add its name to `DeckType`, and add its visuals (atlases, sprite mapping, how-to slides, lobby note) to `MODE_VISUALS` in `client/src/modes.ts`. Server, lobby, seat counts and locked rules read from these registries. New card values also need effect handling in `engine.ts` (`applyEffect`) and a sprite name in `client/src/three/photoAtlas.ts`.

---

## 2. Special Rules & Variants

Configurable per-room via `room.rules`:

| Rule Key | Default | Description |
| :--- | :--- | :--- |
| `sevenZero` | `false` | **7-0 Rule**: Playing a `7` allows the player to swap hands with any opponent; playing a `0` shifts all hands in the current direction of play. |
| `stack` | `true` | **Stacking (+2/+4/+5)**: When targeted with a draw penalty, players can stack a matching or higher penalty card to pass the accumulated total to the next player. |
| `jumpIn` | `true` | **Jump-In**: Any player can play out of turn if they hold an exact clone (identical color and value) of the top discard card, stealing the turn. |
| `drawToMatch` | `false` | **Draw Until Playable**: When drawing without a valid card, keep drawing until a playable card is found. |
| `forcePlay` | `true` | Players must play a playable card if they possess one before passing. |
| `rushPenalty` | `true` | **Ú Nồ Rush Rule**: When down to 1 card, the player must call "Ú Nồ" before an opponent calls them out. If caught, a penalty of 2 cards is drawn. |
| `startingCards` | `7` | Cards dealt to each player at the beginning of a round. |
| `turnSeconds` | `15` | Turn countdown timer before bot take-over / forced pass. |
| `maxPlayers` | mode max | Seats the host opens (clamped to the mode's min..max). |
| `blowUp` | `true` | **Blow-up** (Chaos/Party only): a hand over the mode's limit is eliminated from the round; last player standing wins. |

---

## 3. State & Actions

### Engine Actions
- `PLAY`: Play a card from hand.
- `DRAW`: Draw from the draw pile.
- `PASS`: Pass turn after drawing without playing.
- `CHOOSE_COLOR`: Select target color after playing a Wild card.
- `RUSH`: Call "Ú Nồ!" when holding 1 card.
- `CATCH_RUSH`: Challenge an opponent who failed to call "Ú Nồ!".
- `CHALLENGE`: Challenge an illegal Wild Draw 4 play.
- `SWAP_SEVEN`: Choose player to swap hands with after playing a `7`.
- `NEXT_ROUND`: Reset table and deal cards for the next round.
- `VOTE` (Party): hidden vote during a Point Taken round.
- `CHAIN` (Party): pick the two players linked by Wild Drawn Together.

`legalActions(state, playerId)` lists every legal action for a player (UI highlighting, bots, tests).

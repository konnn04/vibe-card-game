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

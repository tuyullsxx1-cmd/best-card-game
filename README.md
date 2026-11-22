# EMBERFALL — Duel of the Last Flame

[![make.fun](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/bounty/best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/tuyullsxx1-cmd/best-card-game/rank.svg)](https://make.fun/bounty/best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/tuyullsxx1-cmd/best-card-game/reward.svg)](https://make.fun/bounty/best-card-game-20261122-1826)

A complete, original card game for the [make.fun bounty](https://make.fun/bounty/best-card-game-20261122-1826):
"Make the best card game". Two Keepers of the last flame duel across a
table — 20 life each, three suits, and one rule that decides every hand.

## How it plays

Each turn: gain 3 ember (max 10), draw 1 card, play up to 2 cards.

- **Flame** (orange, flame shape) deals damage. **Ash** (grey-blue, shield
  shape) gains shield that soaks damage. **Spark** (gold, star shape) draws
  cards or gains ember.
- **Kindle:** play two cards of the same suit in one turn and the second one
  gets +2. Spend a card now, or hold it for a Kindle — that is the decision
  of every hand.
- **The Warden** announces its intent before it strikes ("a killing blow is
  coming", "raises its guard", "a combo is coming"), so you can read it and
  answer it. It plays by the same rules you do.

Click a card to play it (keys 1–5), End Turn or Space to pass, R to restart.
First side to 0 life loses; the winner's screen lands in a fall of embers.

## Files

- `game/index.html` — the table, the title screen, the win/loss screens.
- `game/css/style.css` — the warm dark table, the cards, the animations.
- `game/js/cards.js` — the three suits and the twelve cards, the deck.
- `game/js/ai.js` — the Warden: its readable intent and its plays.
- `game/js/game.js` — the duel: turns, ember, the Kindle combo, the end.
- `game/js/render.js` — the table as the player sees it, and how it moves.
- `game/js/main.js` — boot, input, the Warden's turn, screenshot scenes.

Vanilla JavaScript, no library, no network request. Serve `game/` from any
static server and open `index.html` in a desktop browser.

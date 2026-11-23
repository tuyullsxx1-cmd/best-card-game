// Boot and the one loop: EMBERFALL's table, input, and the Warden's turn.
//
// The game moves between four screens: title, play, won and lost. The player
// plays by choosing a card (click, or keys 1-5) and then a slot of the battle
// line (click the slot, keys 1-3, or Enter for the slot that favours the
// card's suit), ends the turn with the button or Space/Enter, restarts with
// R. The Warden answers on a timer: its intent is announced first, then its
// cards play one at a time, so the player can watch the threat land and
// answer it.
//
// ?seed=N fixes the shuffle. ?shot=title|table|win|loss (with &seed=N) stages
// that scene instead of running the loop: it plays the real rules forward
// from a fresh duel, paints the scene twice and sets window.__shotReady for
// a screenshot. The frame is what a real game looks like, and the same seed
// always gives the same frame.

import { SUIT_FLAME, cardById } from './cards.js';
import { AI_NAME, chooseAiIntent, chooseAiPlays, chooseAiStance } from './ai.js';
import {
  PHASE_LOST,
  PHASE_PLAY,
  PHASE_TITLE,
  PHASE_WON,
  SLOTS,
  canPlay,
  createGame,
  draftCard,
  endTurn,
  playCard,
  slotForSuit,
  startGame,
  startTurn,
} from './game.js';
import { SCREEN_LOST, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON, createRenderer } from './render.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const state = createGame(seed);
// A handle for play-tests and debugging: the live game state.
window.__game = state;
const renderer = createRenderer(document);
const { els } = renderer;

let aiTimer = null;
// Drafted cards, carried from duel to duel in this session: the campaign
// deck grows by one card after every duel, win or lose.
let campaignExtra = [];
// The card the player has chosen and not yet placed into a slot, as its
// index in the hand — an index, not an id, because a hand can hold two
// copies of one card and only one of them is chosen.
let selectedCard = null;

/** What the renderer needs: playable cards, the Kindle suit, the chosen card, and callbacks. */
function uiFor() {
  const playableIds = state.phase === PHASE_PLAY && state.turn === 'player'
    ? state.player.hand.filter((id) => canPlay(state, 'player', id))
    : [];
  const played = state.player.playedThisTurn;
  const kindleSuit = played.length === 1 ? played[0] : null;
  return {
    playableIds,
    kindleSuit,
    selectedIndex: selectedCard,
    onPlayCard: (index) => selectPlayerCard(index),
    onPlaySlot: (slot) => playSelectedToSlot(slot),
    onEndTurn: () => endPlayerTurn(),
    onDraft: (id) => draftPick(id),
  };
}

function render() {
  const screen =
    state.phase === PHASE_TITLE ? SCREEN_TITLE
      : state.phase === PHASE_WON ? SCREEN_WON
        : state.phase === PHASE_LOST ? SCREEN_LOST
          : SCREEN_PLAY;
  renderer.render(state, uiFor());
  return screen;
}

function showDamageIfAny() {
  if (state.lastDamage) {
    renderer.showDamage(state.lastDamage.target, state.lastDamage.amount, state.lastDamage.absorbed);
  }
}

/** The player chooses a card: a click on the chosen card again lets it go. */
function selectPlayerCard(index) {
  if (state.phase !== PHASE_PLAY || state.turn !== 'player') return;
  const id = state.player.hand[index];
  if (!id) return;
  if (selectedCard === index) {
    selectedCard = null;
  } else if (canPlay(state, 'player', id)) {
    selectedCard = index;
  }
  render();
}

/** The player places the chosen card into a slot of the battle line. */
function playSelectedToSlot(slot) {
  if (selectedCard === null) return;
  const id = state.player.hand[selectedCard];
  selectedCard = null;
  if (!id) return;
  if (state.phase !== PHASE_PLAY || state.turn !== 'player') return;
  if (!playCard(state, 'player', id, slot)) return;
  showDamageIfAny();
  render();
}

/** The player ends the turn: the Warden announces its intent, then plays. */
function endPlayerTurn() {
  if (state.phase !== PHASE_PLAY || state.turn !== 'player') return;
  selectedCard = null;
  state.intent = null;
  endTurn(state);
  render();
  runAiTurn();
}

/** The player drafts one of the three cards offered after a duel. */
function draftPick(id) {
  if (state.phase !== PHASE_WON && state.phase !== PHASE_LOST) return;
  if (!draftCard(state, id)) return;
  campaignExtra.push(id);
  render();
}

/** The Warden's turn, on a timer so the player watches it land. */
function runAiTurn() {
  if (state.phase !== PHASE_PLAY || state.turn !== 'ai') return;
  startTurn(state, 'ai');
  state.aiStance = chooseAiStance(state);
  state.intent = chooseAiIntent(state, state.aiStance);
  render();
  const plays = chooseAiPlays(state, state.aiStance);
  let step = 0;
  const stepMs = 950;
  function nextPlay() {
    if (state.phase !== PHASE_PLAY || state.turn !== 'ai') return;
    if (step >= plays.length) {
      state.intent = null;
      endTurn(state);
      startTurn(state, 'player');
      state.log.push(`Round ${state.round} — your move.`);
      render();
      return;
    }
    playCard(state, 'ai', plays[step].id, plays[step].slot);
    step += 1;
    showDamageIfAny();
    render();
    aiTimer = window.setTimeout(nextPlay, stepMs);
  }
  aiTimer = window.setTimeout(nextPlay, 900);
}

/** Start a fresh duel from the title screen, keeping the drafted cards. */
function newDuel() {
  window.clearTimeout(aiTimer);
  selectedCard = null;
  const fresh = createGame(Math.floor(Math.random() * 4294967296), campaignExtra);
  Object.assign(state, fresh);
  startGame(state);
  render();
}

// ---- Input: mouse and keyboard. ----

els.endTurn.addEventListener('click', endPlayerTurn);
document.getElementById('start-button').addEventListener('click', () => {
  startGame(state);
  render();
});
document.getElementById('again-button').addEventListener('click', newDuel);
document.getElementById('how-button').addEventListener('click', () => {
  document.getElementById('how-panel').classList.toggle('open');
});

document.addEventListener('keydown', (event) => {
  if (event.key >= '1' && event.key <= '5') {
    const index = Number(event.key) - 1;
    if (selectedCard !== null) {
      // A card is chosen: 1-3 place it into a slot of the battle line.
      if (index < SLOTS.length) playSelectedToSlot(SLOTS[index].id);
    } else {
      selectPlayerCard(index);
    }
    return;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (state.phase === PHASE_TITLE) {
      startGame(state);
      render();
    } else if (state.phase === PHASE_PLAY && state.turn === 'player') {
      if (selectedCard !== null && event.key === 'Enter') {
        // Enter places the chosen card into the slot that favours its suit.
        playSelectedToSlot(slotForSuit(cardById(state.player.hand[selectedCard]).suit));
      } else {
        endPlayerTurn();
      }
    }
    return;
  }
  if (event.key === 'Escape') {
    selectedCard = null;
    render();
    return;
  }
  if (event.key === 'r' || event.key === 'R') {
    if (state.phase !== PHASE_TITLE) newDuel();
  }
});

// ---- Screenshot scenes: real rules, staged deterministically. ----

/** Put a named card from a side's deck into its hand (for staged scenes). */
function stageCardToHand(who, cardId) {
  const side = who === 'player' ? state.player : state.ai;
  const deckIndex = side.deck.indexOf(cardId);
  if (deckIndex >= 0) side.deck.splice(deckIndex, 1);
  side.hand.push(cardId);
}

/** A mid-game table: several turns already played, life chipped, shields up.
 * The frame shows every system at once: the Vanguard plays Kindled, the
 * Ash-then-Spark chain Ignited and the banked spark fires on the third Flame
 * of the duel — so the Ember Surge fires too — and the last Flame Lash
 * Kindles after it. */
function stageTable() {
  startGame(state);
  // Turn 1 — the player Kindles two Flame cards into the Vanguard.
  stageCardToHand('player', 'cinder-slash');
  stageCardToHand('player', 'ember-bite');
  stageCardToHand('ai', 'cinder-wall');
  stageCardToHand('ai', 'ember-bite');
  playCard(state, 'player', 'cinder-slash', 'vanguard');
  playCard(state, 'player', 'ember-bite', 'vanguard');
  endTurn(state);
  startTurn(state, 'ai');
  playCard(state, 'ai', 'cinder-wall', 'hearth');
  playCard(state, 'ai', 'ember-bite', 'vanguard');
  endTurn(state);
  startTurn(state, 'player');
  // Turn 2 — Ash into the Hearth, then Spark into the Ember slot: the chain
  // Ignites, banking +2 on the player's next Flame.
  stageCardToHand('player', 'cinder-wall');
  stageCardToHand('player', 'spark-draw');
  stageCardToHand('ai', 'flame-lash');
  stageCardToHand('ai', 'cinder-wall');
  playCard(state, 'player', 'cinder-wall', 'hearth');
  playCard(state, 'player', 'spark-draw', 'ember');
  endTurn(state);
  startTurn(state, 'ai');
  playCard(state, 'ai', 'flame-lash', 'vanguard');
  playCard(state, 'ai', 'cinder-wall', 'hearth');
  endTurn(state);
  startTurn(state, 'player');
  // Turn 3 — the banked Ignite fires on the third Flame of the duel, so the
  // Ember Surge fires too, and the Flame Lash Kindles after it. The Warden
  // is given a little extra life first, so the frame stays a mid-game table
  // instead of a win.
  state.ai.life = 18;
  state.ai.shield = 0;
  stageCardToHand('player', 'ember-bite');
  stageCardToHand('player', 'flame-lash');
  state.player.ember = 6;
  playCard(state, 'player', 'ember-bite', 'vanguard');
  playCard(state, 'player', 'flame-lash', 'vanguard');
  render();
}

/** A win: the Warden at 4 life, the player finishes with a Flame. */
function stageWin() {
  stageTable();
  state.ai.life = 4;
  state.ai.shield = 0;
  stageCardToHand('player', 'inferno');
  state.player.ember = 6;
  // The table already holds two plays this turn; clear the count so the
  // finishing blow is legal — the table itself stays as it was.
  state.player.playedThisTurn = [];
  playCard(state, 'player', 'inferno', 'vanguard');
  render();
}

/** A loss: the player at 3 life, the Warden finishes with a Flame. */
function stageLoss() {
  stageTable();
  state.player.life = 3;
  state.player.shield = 0;
  endTurn(state);
  startTurn(state, 'ai');
  stageCardToHand('ai', 'flame-lash');
  state.ai.ember = 6;
  playCard(state, 'ai', 'flame-lash', 'vanguard');
  render();
}

function runShot(name) {
  if (name === 'table') stageTable();
  else if (name === 'win') stageWin();
  else if (name === 'loss') stageLoss();
  else {
    // Title: the duel waits behind the title screen.
    state.phase = PHASE_TITLE;
    render();
  }
  let painted = 0;
  function paint() {
    render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) {
  runShot(shot);
} else {
  render();
}

// The Warden's name, for the table header.
document.getElementById('ai-name').textContent = AI_NAME;

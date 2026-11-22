// Boot and the one loop: EMBERFALL's table, input, and the Warden's turn.
//
// The game moves between four screens: title, play, won and lost. The player
// plays by clicking a card (or keys 1-5), ends the turn with the button or
// Space/Enter, restarts with R. The Warden answers on a timer: its intent is
// announced first, then its cards play one at a time, so the player can watch
// the threat land and answer it.
//
// ?seed=N fixes the shuffle. ?shot=title|table|win|loss (with &seed=N) stages
// that scene instead of running the loop: it plays the real rules forward
// from a fresh duel, paints the scene twice and sets window.__shotReady for
// a screenshot. The frame is what a real game looks like, and the same seed
// always gives the same frame.

import { SUIT_FLAME, cardById } from './cards.js';
import { AI_NAME, chooseAiIntent, chooseAiPlays } from './ai.js';
import {
  PHASE_LOST,
  PHASE_PLAY,
  PHASE_TITLE,
  PHASE_WON,
  canPlay,
  createGame,
  endTurn,
  playCard,
  startGame,
  startTurn,
} from './game.js';
import { SCREEN_LOST, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON, createRenderer } from './render.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const state = createGame(seed);
const renderer = createRenderer(document);
const { els } = renderer;

let aiTimer = null;

/** What the renderer needs: playable cards, the Kindle suit, and callbacks. */
function uiFor() {
  const playableIds = state.phase === PHASE_PLAY && state.turn === 'player'
    ? state.player.hand.filter((id) => canPlay(state, 'player', id))
    : [];
  const played = state.player.playedThisTurn;
  const kindleSuit = played.length === 1 ? played[0] : null;
  return {
    playableIds,
    kindleSuit,
    onPlayCard: (id) => playPlayerCard(id),
    onEndTurn: () => endPlayerTurn(),
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

/** The player plays a card; the table updates and the Warden may answer. */
function playPlayerCard(id) {
  if (state.phase !== PHASE_PLAY || state.turn !== 'player') return;
  if (!playCard(state, 'player', id)) return;
  showDamageIfAny();
  render();
}

/** The player ends the turn: the Warden announces its intent, then plays. */
function endPlayerTurn() {
  if (state.phase !== PHASE_PLAY || state.turn !== 'player') return;
  state.intent = null;
  endTurn(state);
  render();
  runAiTurn();
}

/** The Warden's turn, on a timer so the player watches it land. */
function runAiTurn() {
  if (state.phase !== PHASE_PLAY || state.turn !== 'ai') return;
  startTurn(state, 'ai');
  state.intent = chooseAiIntent(state);
  render();
  const plays = chooseAiPlays(state);
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
    playCard(state, 'ai', plays[step]);
    step += 1;
    showDamageIfAny();
    render();
    aiTimer = window.setTimeout(nextPlay, stepMs);
  }
  aiTimer = window.setTimeout(nextPlay, 900);
}

/** Start a fresh duel from the title screen. */
function newDuel() {
  window.clearTimeout(aiTimer);
  const fresh = createGame(Math.floor(Math.random() * 4294967296));
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
    const id = state.player.hand[index];
    if (id) playPlayerCard(id);
    return;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (state.phase === PHASE_TITLE) {
      startGame(state);
      render();
    } else if (state.phase === PHASE_PLAY && state.turn === 'player') {
      endPlayerTurn();
    }
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

/** A mid-game table: several turns already played, life chipped, shields up. */
function stageTable() {
  startGame(state);
  // Player: two Flame plays (Kindled), Warden: one Ash, one Flame.
  stageCardToHand('player', 'cinder-slash');
  stageCardToHand('player', 'ember-bite');
  stageCardToHand('ai', 'cinder-wall');
  stageCardToHand('ai', 'ember-bite');
  playCard(state, 'player', 'cinder-slash');
  playCard(state, 'player', 'ember-bite');
  endTurn(state);
  startTurn(state, 'ai');
  playCard(state, 'ai', 'cinder-wall');
  playCard(state, 'ai', 'ember-bite');
  endTurn(state);
  startTurn(state, 'player');
  stageCardToHand('player', 'flame-lash');
  stageCardToHand('player', 'ash-veil');
  stageCardToHand('player', 'spark-draw');
  stageCardToHand('player', 'ember-bite');
  state.player.ember = 6;
  playCard(state, 'player', 'flame-lash');
  playCard(state, 'player', 'ember-bite');
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
  playCard(state, 'player', 'inferno');
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
  playCard(state, 'ai', 'flame-lash');
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

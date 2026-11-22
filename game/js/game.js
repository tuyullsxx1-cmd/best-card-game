// The rules of EMBERFALL: state, turns, and the Kindle combo.
//
// A duel between two Keepers of the last flame. Each has 20 life. A turn:
//   1. gain 3 ember (at most 10), draw 1 card,
//   2. play at most 2 cards, each paid for in ember,
//   3. end the turn; the other side goes.
// Flame deals damage (shield absorbs it first). Ash gains shield. Spark
// draws cards or gains ember. Playing two cards of the SAME suit in one turn
// Kindles the second one: +2 to what it does. That is the whole decision of
// every hand — spend a card now, or hold it for a Kindle.
// The first side whose life reaches 0 loses; the other wins.

import { SUIT_ASH, SUIT_FLAME, SUIT_SPARK, buildDeck, cardById, drawCard } from './cards.js';

export const MAX_LIFE = 20;
export const MAX_EMBER = 10;
export const EMBER_PER_TURN = 3;
export const MAX_PLAYS_PER_TURN = 2;
export const KINDLE_BONUS = 2;
export const STARTING_HAND = 5;

export const PHASE_TITLE = 'title';
export const PHASE_PLAY = 'play';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

/** Deterministic random from a seed (mulberry32), so shots and replays agree. */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSide(random) {
  const deck = buildDeck(random);
  const hand = [];
  for (let i = 0; i < STARTING_HAND; i += 1) hand.push(drawCard(deck, [], random));
  return { life: MAX_LIFE, shield: 0, ember: EMBER_PER_TURN, hand, deck, discard: [], playedThisTurn: [] };
}

/** A fresh duel. `seed` fixes the shuffle, so a shot can be replayed. */
export function createGame(seed) {
  const random = createRandom(seed);
  return {
    seed,
    random,
    phase: PHASE_TITLE,
    turn: 'player',
    round: 1,
    player: createSide(random),
    ai: createSide(random),
    log: ['The last flame is lit. Two Keepers step to the table.'],
    intent: null,
    lastPlay: null,
    lastDamage: null,
    kindled: false,
    // The cards played this round, for the table in the middle of the screen.
    table: [],
  };
}

/** Begin the duel from the title screen. */
export function startGame(state) {
  state.phase = PHASE_PLAY;
  state.turn = 'player';
  state.round = 1;
  state.log.push('You go first. Spend your ember well.');
}

function sideOf(state, who) {
  return who === 'player' ? state.player : state.ai;
}

function otherOf(state, who) {
  return who === 'player' ? state.ai : state.player;
}

/** Start a side's turn: +3 ember (max 10), draw 1, clear the played list. */
export function startTurn(state, who) {
  const side = sideOf(state, who);
  side.ember = Math.min(MAX_EMBER, side.ember + EMBER_PER_TURN);
  const drawn = drawCard(side.deck, side.discard, state.random);
  if (drawn) side.hand.push(drawn);
  side.playedThisTurn = [];
  state.turn = who;
  // A new round starts with the player: the table clears for fresh plays.
  if (who === 'player') state.table = [];
}

/** Can this side play this card right now? */
export function canPlay(state, who, cardId) {
  if (state.phase !== PHASE_PLAY || state.turn !== who) return false;
  const side = sideOf(state, who);
  if (side.playedThisTurn.length >= MAX_PLAYS_PER_TURN) return false;
  const index = side.hand.indexOf(cardId);
  if (index < 0) return false;
  return side.ember >= cardById(cardId).cost;
}

/**
 * Play a card. Returns false when the play is not legal. The second card of
 * a turn Kindles when it shares the first card's suit: +2 to what it does.
 */
export function playCard(state, who, cardId) {
  if (!canPlay(state, who, cardId)) return false;
  const side = sideOf(state, who);
  const foe = otherOf(state, who);
  const card = cardById(cardId);
  const index = side.hand.indexOf(cardId);
  side.hand.splice(index, 1);
  side.ember -= card.cost;
  side.discard.push(cardId);

  const kindled = side.playedThisTurn.length === 1 && side.playedThisTurn[0] === card.suit;
  const bonus = kindled ? KINDLE_BONUS : 0;
  const power = card.power + bonus;
  state.kindled = kindled;
  side.playedThisTurn.push(card.suit);

  const whoName = who === 'player' ? 'You' : 'The Warden';
  if (card.suit === SUIT_FLAME) {
    const absorbed = Math.min(foe.shield, power);
    foe.shield -= absorbed;
    const through = power - absorbed;
    foe.life = Math.max(0, foe.life - through);
    state.lastDamage = { target: who === 'player' ? 'ai' : 'player', amount: power, absorbed };
    state.log.push(
      `${whoName} played ${card.name}${kindled ? ' — KINDLED!' : ''} — ${power} damage` +
        (absorbed > 0 ? ` (${absorbed} soaked by shield)` : '') + '.',
    );
  } else if (card.suit === SUIT_ASH) {
    side.shield += power;
    state.lastDamage = null;
    state.log.push(`${whoName} played ${card.name}${kindled ? ' — KINDLED!' : ''} — +${power} shield.`);
  } else if (card.suit === SUIT_SPARK) {
    if (card.id === 'kindling') {
      side.ember = Math.min(MAX_EMBER, side.ember + power);
      state.log.push(`${whoName} played ${card.name}${kindled ? ' — KINDLED!' : ''} — +${power} ember.`);
    } else if (card.id === 'bright-idea') {
      for (let i = 0; i < power; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      side.ember = Math.min(MAX_EMBER, side.ember + 1);
      state.log.push(`${whoName} played ${card.name}${kindled ? ' — KINDLED!' : ''} — drew ${power}, +1 ember.`);
    } else {
      for (let i = 0; i < power; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      state.log.push(`${whoName} played ${card.name}${kindled ? ' — KINDLED!' : ''} — drew ${power} cards.`);
    }
    state.lastDamage = null;
  }

  state.lastPlay = { who, card, kindled, bonus };
  state.table.push({ who, card, kindled });
  checkEnd(state);
  return true;
}

/** End the current side's turn. The player ends; the AI answers, then play returns. */
export function endTurn(state) {
  if (state.phase !== PHASE_PLAY) return;
  state.turn = state.turn === 'player' ? 'ai' : 'player';
  if (state.turn === 'ai') {
    state.round += 1;
  }
}

/** Has either side's life hit 0? Set the phase and log the result. */
export function checkEnd(state) {
  if (state.phase !== PHASE_PLAY) return;
  if (state.ai.life <= 0) {
    state.phase = PHASE_WON;
    state.log.push('The Warden’s flame goes out. You hold the last flame.');
  } else if (state.player.life <= 0) {
    state.phase = PHASE_LOST;
    state.log.push('Your flame goes out. The Warden holds the last flame.');
  }
}

// The Warden: the opponent AI for EMBERFALL.
//
// The AI is deliberately readable. Before it acts, its intent is announced in
// plain words, so the player can see the threat coming and answer it:
//   - a killing blow when the player is nearly out of life,
//   - a raised guard when its own life is low,
//   - a Kindle combo when it holds two cards of one suit,
//   - gathering embers otherwise.
// Its plays follow the same rules as the player's: the same ember budget,
// at most two cards a turn, the same Kindle bonus, the same battle line
// (every card goes to the slot that favours its suit), the same chains and
// the same Ember Surge.

import { SUIT_ASH, SUIT_FLAME, SUIT_SPARK, cardById } from './cards.js';
import { chainFor, slotForSuit } from './game.js';

export const AI_NAME = 'The Warden';

/** The intent the AI announces before its turn, as plain text the player reads. */
export function chooseAiIntent(state) {
  const ai = state.ai;
  const player = state.player;
  const hand = ai.hand.map(cardById);
  const hasFlame = hand.some((card) => card.suit === SUIT_FLAME);
  const hasPair = new Set(hand.map((card) => card.suit)).size < hand.length;

  if (player.life <= 6 && hasFlame) {
    return { kind: 'kill', text: 'The Warden smells blood — a killing blow is coming.' };
  }
  if (ai.life <= 8) {
    return { kind: 'guard', text: 'The Warden raises its guard, ash thick in the air.' };
  }
  if (hasPair) {
    return { kind: 'combo', text: 'The Warden’s embers kindle — a combo is coming.' };
  }
  return { kind: 'gather', text: 'The Warden gathers embers, watching your hand.' };
}

/**
 * Pick the AI's plays for this turn: up to two { id, slot } pairs, in order,
 * that it can afford with its ember and that follow its intent. Every card
 * goes to the slot that favours its suit.
 */
export function chooseAiPlays(state) {
  const ai = state.ai;
  const player = state.player;
  const hand = ai.hand.map(cardById);
  let ember = ai.ember;
  const plays = [];
  const used = new Set();

  // Value a card: damage that kills is worth everything; a shield that saves
  // a life is next; raw power per ember after that. A banked Ignite makes a
  // Flame worth two more.
  function value(card) {
    const damage = card.suit === SUIT_FLAME ? card.power : 0;
    const shield = card.suit === SUIT_ASH ? card.power : 0;
    let score = card.power / card.cost;
    if (card.suit === SUIT_FLAME && player.life - player.shield <= damage) score += 100;
    if (card.suit === SUIT_FLAME && ai.ignite) score += 2;
    if (card.suit === SUIT_ASH && ai.life <= 8) score += shield / 2;
    if (card.suit === SUIT_SPARK && ai.hand.length <= 2) score += 2;
    return score;
  }

  // First pick: the best card it can afford.
  const affordable = hand.filter((card) => card.cost <= ember);
  if (affordable.length === 0) return plays;
  affordable.sort((a, b) => value(b) - value(a));
  const first = affordable[0];
  plays.push({ id: first.id, slot: slotForSuit(first.suit) });
  used.add(first.id);
  ember -= first.cost;

  // Second pick: prefer the same suit, to Kindle the combo (+2 on the second
  // card) — or a chain off the first card (Quench, Ignite, Flare). Otherwise
  // the best remaining card it can still afford.
  const rest = hand.filter((card) => !used.has(card.id) && card.cost <= ember);
  if (rest.length === 0) return plays;
  function secondValue(card) {
    let score = value(card);
    if (card.suit === first.suit) score += 2;
    if (chainFor(first.suit, card.suit)) score += 1.5;
    return score;
  }
  rest.sort((a, b) => secondValue(b) - secondValue(a));
  const second = rest[0];
  plays.push({ id: second.id, slot: slotForSuit(second.suit) });
  return plays;
}

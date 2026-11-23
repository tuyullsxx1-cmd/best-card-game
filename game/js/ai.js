// The Warden: the opponent AI for EMBERFALL, now with two stances.
//
// The Warden fights the way a person does: it reads its own life and picks
// a stance, and the stance is shown on the table before it acts, so the
// player can see the threat coming and answer it.
//   - AGGRESSIVE (flame icon): while its life is above 10. It pushes Flame,
//     hunts the killing blow, and Kindles whenever it can.
//   - DEFENSIVE (shield icon): at 10 life or below. It walls up with Ash,
//     banks embers, and only swings when the blow is safe.
// The stance flips the moment its life crosses 10, in either direction — a
// Warden healed back above 10 by nothing (it has no healing) never comes
// back, but a Warden that was defensive and is still losing stays defensive.
// Its plays follow the same rules as the player's: the same ember budget,
// at most two cards a turn, the same Kindle bonus, the same battle line
// (every card goes to the slot that favours its suit), the same chains and
// the same Ember Surge.

import { SUIT_ASH, SUIT_FLAME, SUIT_SPARK, cardById } from './cards.js';
import { chainFor, slotForSuit } from './game.js';

export const AI_NAME = 'The Warden';

export const STANCE_AGGRESSIVE = 'aggressive';
export const STANCE_DEFENSIVE = 'defensive';

export const STANCES = {
  [STANCE_AGGRESSIVE]: { label: 'AGGRESSIVE', icon: '🔥', text: 'pressing the attack' },
  [STANCE_DEFENSIVE]: { label: 'DEFENSIVE', icon: '🛡', text: 'behind its guard' },
};

/** The stance the Warden fights in: defensive at 10 life or below. */
export function chooseAiStance(state) {
  return state.ai.life <= 10 ? STANCE_DEFENSIVE : STANCE_AGGRESSIVE;
}

/** The intent the AI announces before its turn, as plain text the player reads. */
export function chooseAiIntent(state, stance) {
  const ai = state.ai;
  const player = state.player;
  const hand = ai.hand.map(cardById);
  const hasFlame = hand.some((card) => card.suit === SUIT_FLAME);
  const hasPair = new Set(hand.map((card) => card.suit)).size < hand.length;
  const stanceText = STANCES[stance].text;

  if (stance === STANCE_AGGRESSIVE && player.life <= 6 && hasFlame) {
    return { kind: 'kill', text: `The Warden is AGGRESSIVE 🔥 — it smells blood, a killing blow is coming.` };
  }
  if (stance === STANCE_DEFENSIVE) {
    return { kind: 'guard', text: `The Warden is DEFENSIVE 🛡 — ash thick in the air, ${stanceText}.` };
  }
  if (hasPair) {
    return { kind: 'combo', text: `The Warden is AGGRESSIVE 🔥 — its embers kindle, a combo is coming.` };
  }
  return { kind: 'gather', text: `The Warden is AGGRESSIVE 🔥 — it gathers embers, watching your hand.` };
}

/**
 * Pick the AI's plays for this turn: up to two { id, slot } pairs, in order,
 * that it can afford with its ember and that follow its intent. Every card
 * goes to the slot that favours its suit. The stance bends the values: an
 * aggressive Warden pays extra for Flame, a defensive one for Ash.
 */
export function chooseAiPlays(state, stance) {
  const ai = state.ai;
  const player = state.player;
  const hand = ai.hand.map(cardById);
  let ember = ai.ember;
  const plays = [];
  const used = new Set();

  // Value a card: damage that kills is worth everything; a shield that saves
  // a life is next; raw power per ember after that. A banked Ignite makes a
  // Flame worth two more. The stance adds its own weight: aggressive pays
  // for Flame, defensive for Ash.
  function value(card) {
    const damage = card.suit === SUIT_FLAME ? card.power : 0;
    const shield = card.suit === SUIT_ASH ? card.power : 0;
    let score = card.power / card.cost;
    if (card.suit === SUIT_FLAME && player.life - player.shield <= damage) score += 100;
    if (card.suit === SUIT_FLAME && ai.ignite > 0) score += 2 * ai.ignite;
    if (card.suit === SUIT_ASH && ai.life <= 10) score += shield / 2;
    if (card.suit === SUIT_SPARK && ai.hand.length <= 2) score += 2;
    if (stance === STANCE_AGGRESSIVE && card.suit === SUIT_FLAME) score += 2;
    if (stance === STANCE_DEFENSIVE && card.suit === SUIT_ASH) score += 2;
    if (card.fx === 'pierce' && player.shield >= 4) score += 3;
    if (card.fx === 'reflect' && stance === STANCE_DEFENSIVE) score += 2;
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

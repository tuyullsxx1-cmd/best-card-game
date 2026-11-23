// The rules of EMBERFALL: state, turns, and the Kindle combo.
//
// A duel between two Keepers of the last flame. Each has 20 life. A turn:
//   1. gain 3 ember (at most 10), draw 1 card,
//   2. play at most 2 cards, each paid for in ember, each into a slot of the
//      battle line,
//   3. end the turn; the other side goes.
// Flame deals damage (shield absorbs it first). Ash gains shield. Spark
// draws cards or gains ember. Playing two cards of the SAME suit in one turn
// Kindles the second one: +2 to what it does.
// Three more systems braid into that decision:
//   - the battle line: a card played into the slot that favours its suit
//     (Vanguard for Flame, Hearth for Ash, Ember for Spark) gets +1, or +2
//     for Ash in the Hearth;
//   - chains: the second card of a turn reacts to the first — Flame into
//     Ash Quenches (+2 shield), Ash into Spark Ignites (the side's next
//     Flame gets +2, whenever it comes), Spark into Flame Flares (+1 damage
//     and a drawn card);
//   - Ember Surge: every third Flame a side plays in the duel feeds the
//     brazier and returns +1 ember.
// A chain and a Kindle never meet on one card: Kindle needs the same suit
// twice, a chain needs two suits in a named order. So every second card of
// a turn is exactly one of Kindle, Quench, Ignite, Flare — or nothing.
// The first side whose life reaches 0 loses; the other wins. Then the
// duel is not quite over: the winner — and the loser — drafts one of three
// cards into their deck for the next duel, so a run of duels builds a deck
// that is yours. The Warden answers in stances (see ai.js): aggressive
// while it is healthy, defensive when it is hurt.

import { CARD_POOL, SUIT_ASH, SUIT_FLAME, SUIT_SPARK, buildDeck, cardById, drawCard } from './cards.js';

export const MAX_LIFE = 20;
export const MAX_EMBER = 10;
export const EMBER_PER_TURN = 3;
export const MAX_PLAYS_PER_TURN = 2;
export const KINDLE_BONUS = 2;
export const STARTING_HAND = 5;

// The battle line: three slots in the middle of the table. A card played
// into the slot that favours its suit is stronger: Flame in the Vanguard
// hits +1 harder, Ash in the Hearth shields +2 more, Spark in the Ember
// slot does +1 of what it does. A card may be played into any slot; only
// the favoured suit earns the bonus.
export const SLOT_VANGUARD = 'vanguard';
export const SLOT_HEARTH = 'hearth';
export const SLOT_EMBER = 'ember';
export const SLOTS = [
  { id: SLOT_VANGUARD, name: 'Vanguard', suit: SUIT_FLAME, bonus: 1, text: 'Flame +1' },
  { id: SLOT_HEARTH, name: 'Hearth', suit: SUIT_ASH, bonus: 2, text: 'Ash +2' },
  { id: SLOT_EMBER, name: 'Ember', suit: SUIT_SPARK, bonus: 1, text: 'Spark +1' },
];

/** The slot that favours this suit (where a card goes when no slot is picked). */
export function slotForSuit(suit) {
  const slot = SLOTS.find((entry) => entry.suit === suit);
  return slot ? slot.id : SLOT_HEARTH;
}

/** The bonus a card earns for being played into this slot (0 when unfavoured). */
export function slotBonusFor(slotId, suit) {
  const slot = SLOTS.find((entry) => entry.id === slotId);
  if (!slot || slot.suit !== suit) return 0;
  return slot.bonus;
}

// Chains: the order cards are played in one turn. The second card of a turn
// reacts to the first:
//   Flame -> Ash   = Quench: the Ash gains +2 shield.
//   Ash -> Spark   = Ignite: the side's next Flame gets +2 damage, whenever
//                     it is played (the spark is banked until then).
//   Spark -> Flame = Flare: the Flame gets +1 damage and draws 1 card.
export const CHAIN_QUENCH = 'quench';
export const CHAIN_IGNITE = 'ignite';
export const CHAIN_FLARE = 'flare';

export function chainFor(prevSuit, suit) {
  if (prevSuit === SUIT_FLAME && suit === SUIT_ASH) return CHAIN_QUENCH;
  if (prevSuit === SUIT_ASH && suit === SUIT_SPARK) return CHAIN_IGNITE;
  if (prevSuit === SUIT_SPARK && suit === SUIT_FLAME) return CHAIN_FLARE;
  return null;
}

// Ember Surge: every third Flame a side plays in a duel feeds the brazier
// and returns +1 ember. The count never resets — it is a second resource
// that rewards pressing the attack instead of holding Flame cards for a
// Kindle.
export const SURGE_EVERY = 3;

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

function createSide(random, extraCards = []) {
  const deck = buildDeck(random, extraCards);
  const hand = [];
  for (let i = 0; i < STARTING_HAND; i += 1) hand.push(drawCard(deck, [], random));
  return {
    life: MAX_LIFE,
    shield: 0,
    ember: EMBER_PER_TURN,
    hand,
    deck,
    discard: [],
    playedThisTurn: [],
    // Ember Surge: Flame cards played this duel (the meter shows surge % 3).
    surge: 0,
    // True just after a Surge fired, so the brazier can burst once.
    surgeFlash: false,
    // Ignite: how many banked +2s the next Flame carries (Ash -> Spark
    // chains bank one each; a doubled chain banks two).
    ignite: 0,
    // Ashen Mirror: damage reflected the next time this side is hit.
    reflect: 0,
    // Surge Spark: the next Flame counts double toward the Surge.
    surgeNext: false,
    // Slot Swap: the next card earns its favoured slot bonus in any slot.
    wildSlot: false,
    // Chain Link: the next Chain fires twice.
    chainDouble: false,
  };
}

/** A fresh duel. `seed` fixes the shuffle, so a shot can be replayed.
 * `extraCards` are drafted cards carried over from earlier duels. */
export function createGame(seed, extraCards = []) {
  const random = createRandom(seed);
  return {
    seed,
    random,
    phase: PHASE_TITLE,
    turn: 'player',
    round: 1,
    player: createSide(random, extraCards),
    ai: createSide(random),
    log: ['The last flame is lit. Two Keepers step to the table.'],
    intent: null,
    lastPlay: null,
    lastDamage: null,
    kindled: false,
    // The cards played this round, for the table in the middle of the screen.
    table: [],
    // The last chain fired this duel (for Cinder Echo), and the draft
    // offered when the duel ends (three card ids, or null before then).
    lastChain: null,
    draft: null,
    drafted: null,
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
 * Play a card into a slot of the battle line. Returns false when the play
 * is not legal. The second card of a turn earns exactly one of: a Kindle
 * (same suit as the first, +2), a chain (Quench +2 shield, Ignite banking
 * +2 on the next Flame, Flare +1 damage and a drawn card), or nothing. On
 * top of that, a card in its favoured slot earns its slot bonus, a banked
 * Ignite fires on a Flame, and every third Flame in the duel Surges +1
 * ember. All of it folds into one power number, and the log names it.
 */
export function playCard(state, who, cardId, slotId) {
  if (!canPlay(state, who, cardId)) return false;
  const side = sideOf(state, who);
  const foe = otherOf(state, who);
  const card = cardById(cardId);
  const index = side.hand.indexOf(cardId);
  side.hand.splice(index, 1);
  side.ember -= card.cost;
  side.discard.push(cardId);
  side.surgeFlash = false;

  const slot = slotId || slotForSuit(card.suit);
  const slotName = SLOTS.find((entry) => entry.id === slot).name;
  // Slot Swap: the next card earns its favoured slot bonus in any slot.
  const slotBonus = side.wildSlot
    ? slotBonusFor(slotForSuit(card.suit), card.suit)
    : slotBonusFor(slot, card.suit);
  if (side.wildSlot) side.wildSlot = false;
  const kindled = side.playedThisTurn.length === 1 && side.playedThisTurn[0] === card.suit;
  const prevSuit = side.playedThisTurn.length === 1 ? side.playedThisTurn[0] : null;
  const chain = prevSuit ? chainFor(prevSuit, card.suit) : null;
  // Chain Link: the next Chain fires twice (Quench +4, Flare +2 and two
  // cards, Ignite banks two +2s). The doubling is spent on this chain.
  const chainMult = chain && side.chainDouble ? 2 : 1;
  if (chain) side.chainDouble = false;
  let ignited = false;
  let bonus = slotBonus + (kindled ? KINDLE_BONUS : 0);
  if (chain === CHAIN_QUENCH) bonus += 2 * chainMult;
  if (chain === CHAIN_FLARE) bonus += 1 * chainMult;
  if (card.suit === SUIT_FLAME && side.ignite > 0) {
    ignited = true;
    bonus += 2 * side.ignite;
    side.ignite = 0;
  }
  if (chain === CHAIN_IGNITE) side.ignite += chainMult;
  // Twin Spark: a Flame played after a Spark in the same turn hits +2 harder.
  if (card.fx === 'sparkBonus' && side.playedThisTurn.includes(SUIT_SPARK)) bonus += 2;
  // Stone Song: an Ash played below 10 life shields +3 more.
  if (card.fx === 'lowLife' && side.life < 10) bonus += 3;
  // Cinder Echo: repeats the last Chain fired this duel — Quench shields
  // +2, Ignite banks +2 on the next Flame, Flare hits +1 and draws a card.
  // It reads the chain from BEFORE this card; this card's own chain then
  // becomes the last one.
  const whoName = who === 'player' ? 'You' : 'The Warden';
  let echoedFlare = false;
  if (card.fx === 'echo' && state.lastChain) {
    const echo = state.lastChain;
    if (echo === CHAIN_QUENCH) {
      side.shield += 2;
      state.log.push(`${whoName} echoed Quench — +2 shield.`);
    } else if (echo === CHAIN_IGNITE) {
      side.ignite += 1;
      state.log.push(`${whoName} echoed Ignite — the next Flame gets +2 damage.`);
    } else if (echo === CHAIN_FLARE) {
      bonus += 1;
      echoedFlare = true;
    }
  }
  if (chain) state.lastChain = chain;
  const power = card.power + bonus;
  state.kindled = kindled;
  side.playedThisTurn.push(card.suit);

  // Ember Surge: every third Flame this duel returns an ember. A Flame
  // that counts twice (Ember Lash, or a Surge Spark before it) can cross
  // the line in one step, so the check is a crossing, not a remainder.
  let surged = false;
  if (card.suit === SUIT_FLAME) {
    const surgeInc = card.fx === 'surge2' || side.surgeNext ? 2 : 1;
    if (side.surgeNext) side.surgeNext = false;
    const before = side.surge;
    side.surge += surgeInc;
    if (Math.floor(side.surge / SURGE_EVERY) > Math.floor(before / SURGE_EVERY)) {
      side.ember = Math.min(MAX_EMBER, side.ember + 1);
      side.surgeFlash = true;
      surged = true;
    }
  }

  const tag = kindled
    ? ' — KINDLED!'
    : chain === CHAIN_QUENCH
      ? ' — QUENCHED!'
      : chain === CHAIN_FLARE
        ? ' — FLARED!'
        : ignited
          ? ' — IGNITED!'
          : '';
  if (card.suit === SUIT_FLAME) {
    // Wildfire ignores shield: the damage goes straight to life, and the
    // shield stays where it was.
    const absorbed = card.fx === 'pierce' ? 0 : Math.min(foe.shield, power);
    foe.shield -= absorbed;
    const through = power - absorbed;
    foe.life = Math.max(0, foe.life - through);
    state.lastDamage = { target: who === 'player' ? 'ai' : 'player', amount: power, absorbed };
    state.log.push(
      `${whoName} played ${card.name} to ${slotName}${tag} — ${power} damage` +
        (absorbed > 0 ? ` (${absorbed} soaked by shield)` : '') + '.',
    );
    // Ashen Mirror: the side that was hit throws 2 damage back at the
    // attacker, once, the first time a blow lands through.
    if (through > 0 && foe.reflect > 0) {
      const reflected = foe.reflect;
      foe.reflect = 0;
      side.life = Math.max(0, side.life - reflected);
      state.log.push(`${whoName} was mirrored — ${reflected} damage reflected back.`);
    }
    let flareDraws = 0;
    if (chain === CHAIN_FLARE) flareDraws += chainMult;
    if (echoedFlare) flareDraws += 1;
    if (flareDraws > 0) {
      for (let i = 0; i < flareDraws; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      state.log.push(`${whoName} flared — drew ${flareDraws} card${flareDraws > 1 ? 's' : ''}.`);
    }
  } else if (card.suit === SUIT_ASH) {
    side.shield += power;
    state.lastDamage = null;
    state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — +${power} shield.`);
    if (card.fx === 'ember') {
      side.ember = Math.min(MAX_EMBER, side.ember + 2);
      state.log.push(`${whoName} banked 2 ember with it.`);
    }
    if (card.fx === 'reflect') {
      side.reflect = 2;
      state.log.push(`${whoName} raised a mirror — the next hit throws 2 damage back.`);
    }
    if (card.fx === 'draw') {
      const drawn = drawCard(side.deck, side.discard, state.random);
      if (drawn) side.hand.push(drawn);
      state.log.push(`${whoName} drew 1 card.`);
    }
  } else if (card.suit === SUIT_SPARK) {
    if (card.fx === 'surgeNext') {
      side.ember = Math.min(MAX_EMBER, side.ember + power);
      side.surgeNext = true;
      state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — +${power} ember. The next Flame counts double toward Surge.`);
    } else if (card.fx === 'wildSlot') {
      for (let i = 0; i < power; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      side.wildSlot = true;
      state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — drew ${power}. The next card earns its slot bonus in any slot.`);
    } else if (card.fx === 'bloom') {
      for (let i = 0; i < power; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      const flames = side.hand.filter((id) => cardById(id).suit === SUIT_FLAME).length;
      side.ember = Math.min(MAX_EMBER, side.ember + flames);
      state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — drew ${power}, +${flames} ember for the Flames in hand.`);
    } else if (card.fx === 'chainDouble') {
      for (let i = 0; i < power; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      side.chainDouble = true;
      state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — drew ${power}. The next Chain fires twice.`);
    } else if (card.id === 'kindling') {
      side.ember = Math.min(MAX_EMBER, side.ember + power);
      state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — +${power} ember.`);
    } else if (card.id === 'bright-idea') {
      for (let i = 0; i < power; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      side.ember = Math.min(MAX_EMBER, side.ember + 1);
      state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — drew ${power}, +1 ember.`);
    } else {
      for (let i = 0; i < power; i += 1) {
        const drawn = drawCard(side.deck, side.discard, state.random);
        if (drawn) side.hand.push(drawn);
      }
      state.log.push(`${whoName} played ${card.name} to ${slotName}${tag} — drew ${power} cards.`);
    }
    state.lastDamage = null;
  }
  if (chain === CHAIN_IGNITE) {
    state.log.push(`${whoName} ignited — the next Flame gets +${2 * chainMult} damage.`);
  }
  if (surged) {
    state.log.push(`${whoName} — Ember Surge! +1 ember.`);
  }

  state.lastPlay = { who, card, kindled, bonus, slot, chain, ignited };
  state.table.push({ who, card, kindled, bonus, slot, chain, ignited });
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

/** Has either side's life hit 0? Set the phase, offer the draft, log the result. */
export function checkEnd(state) {
  if (state.phase !== PHASE_PLAY) return;
  if (state.ai.life <= 0) {
    state.phase = PHASE_WON;
    state.log.push('The Warden’s flame goes out. You hold the last flame.');
    state.draft = pickDraft(state);
  } else if (state.player.life <= 0) {
    state.phase = PHASE_LOST;
    state.log.push('Your flame goes out. The Warden holds the last flame.');
    state.draft = pickDraft(state);
  }
}

/** Three random cards offered as a draft when a duel ends. */
export function pickDraft(state) {
  const pool = [...CARD_POOL];
  const draft = [];
  while (draft.length < 3 && pool.length > 0) {
    const index = Math.floor(state.random() * pool.length);
    draft.push(pool.splice(index, 1)[0].id);
  }
  return draft;
}

/** Take one of the three draft cards. Returns false when there is no draft. */
export function draftCard(state, cardId) {
  if (!state.draft || state.drafted) return false;
  if (!state.draft.includes(cardId)) return false;
  state.drafted = cardId;
  state.log.push(`You drafted ${cardById(cardId).name} — it joins your deck for the next duel.`);
  return true;
}

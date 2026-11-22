// Card definitions and decks for EMBERFALL: Duel of the Last Flame.
//
// Three suits, told apart by colour AND shape (never by text alone):
//   FLAME — attack, orange, flame shape. Deals damage.
//   ASH   — shield, grey-blue, shield shape. Gains shield that absorbs damage.
//   SPARK — utility, gold, four-point star shape. Draws cards or gains ember.
// Every card has a COST in ember (1-4) and a POWER (1-8). The numbers are the
// card: cost is what you pay, power is what it does.

export const SUIT_FLAME = 'flame';
export const SUIT_ASH = 'ash';
export const SUIT_SPARK = 'spark';

export const SUITS = {
  [SUIT_FLAME]: {
    name: 'Flame',
    color: '#ff7a1a',
    dark: '#7a2e00',
    glow: 'rgba(255, 122, 26, 0.55)',
    icon: 'icon-flame',
    verb: 'Deal',
    target: 'damage',
  },
  [SUIT_ASH]: {
    name: 'Ash',
    color: '#9fb2c3',
    dark: '#2c3944',
    glow: 'rgba(159, 178, 195, 0.55)',
    icon: 'icon-shield',
    verb: 'Gain',
    target: 'shield',
  },
  [SUIT_SPARK]: {
    name: 'Spark',
    color: '#ffd23f',
    dark: '#6b5200',
    glow: 'rgba(255, 210, 63, 0.55)',
    icon: 'icon-spark',
    verb: 'Spark',
    target: 'trick',
  },
};

// One card of each kind. A deck holds two copies of each: 24 cards.
export const CARD_POOL = [
  // Flame — attack.
  { id: 'ember-bite', name: 'Ember Bite', suit: SUIT_FLAME, cost: 1, power: 2, text: 'Deal 2 damage.' },
  { id: 'cinder-slash', name: 'Cinder Slash', suit: SUIT_FLAME, cost: 2, power: 4, text: 'Deal 4 damage.' },
  { id: 'flame-lash', name: 'Flame Lash', suit: SUIT_FLAME, cost: 3, power: 6, text: 'Deal 6 damage.' },
  { id: 'inferno', name: 'Inferno', suit: SUIT_FLAME, cost: 4, power: 8, text: 'Deal 8 damage.' },
  // Ash — shield.
  { id: 'ash-veil', name: 'Ash Veil', suit: SUIT_ASH, cost: 1, power: 2, text: 'Gain 2 shield.' },
  { id: 'cinder-wall', name: 'Cinder Wall', suit: SUIT_ASH, cost: 2, power: 4, text: 'Gain 4 shield.' },
  { id: 'stone-hearth', name: 'Stone Hearth', suit: SUIT_ASH, cost: 3, power: 6, text: 'Gain 6 shield.' },
  { id: 'ashen-bastion', name: 'Ashen Bastion', suit: SUIT_ASH, cost: 4, power: 8, text: 'Gain 8 shield.' },
  // Spark — utility.
  { id: 'spark-draw', name: 'Spark Draw', suit: SUIT_SPARK, cost: 1, power: 2, text: 'Draw 2 cards.' },
  { id: 'kindling', name: 'Kindling', suit: SUIT_SPARK, cost: 2, power: 3, text: 'Gain 3 ember.' },
  { id: 'bright-idea', name: 'Bright Idea', suit: SUIT_SPARK, cost: 2, power: 2, text: 'Draw 2, gain 1 ember.' },
  { id: 'wild-spark', name: 'Wild Spark', suit: SUIT_SPARK, cost: 3, power: 3, text: 'Draw 3 cards.' },
];

/** Look a card up by id. */
export function cardById(id) {
  return CARD_POOL.find((card) => card.id === id) ?? null;
}

/** A fresh shuffled deck: two copies of every card in the pool. */
export function buildDeck(random) {
  const deck = [];
  for (const card of CARD_POOL) deck.push(card.id, card.id);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Draw the top card of a deck into a hand; reshuffles the discard when empty. */
export function drawCard(deck, discard, random) {
  if (deck.length === 0) {
    if (discard.length === 0) return null;
    deck.push(...discard.splice(0));
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop();
}

/** The effect line a card shows, with its Kindle bonus already added. */
export function effectText(card, bonus) {
  const power = card.power + (bonus || 0);
  if (card.suit === SUIT_FLAME) return `Deal ${power} damage.`;
  if (card.suit === SUIT_ASH) return `Gain ${power} shield.`;
  if (card.id === 'spark-draw') return `Draw ${power} cards.`;
  if (card.id === 'kindling') return `Gain ${power} ember.`;
  if (card.id === 'bright-idea') return `Draw ${power}, gain 1 ember.`;
  if (card.id === 'wild-spark') return `Draw ${power} cards.`;
  return card.text;
}

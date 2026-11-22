// The table: everything the player sees, and how it moves.
//
// EMBERFALL is DOM, not canvas: a card is a real element, so its numbers stay
// sharp at any size and its suit is told by colour AND shape. The renderer
// paints the whole state — both fighters' life and shield, both hands, the
// ember meter, the played cards, the log — and animates the moments that
// matter: a dealt hand slides in, a played card flips onto the table, damage
// floats up off the fighter it hit, a win lands in a fall of embers.

import { SUITS, cardById, effectText } from './cards.js';
import { MAX_EMBER, MAX_LIFE, SLOTS, SURGE_EVERY } from './game.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WON = 'won';
export const SCREEN_LOST = 'lost';

/** One card element, face up, with its numbers big enough to read at a glance. */
export function cardElement(card, options = {}) {
  const suit = SUITS[card.suit];
  const el = document.createElement(options.tag || 'button');
  el.className = `card suit-${card.suit}`;
  el.type = 'button';
  el.dataset.id = card.id;
  el.setAttribute('aria-label', `${card.name}, ${suit.name}, cost ${card.cost}, ${effectText(card, 0)}`);
  if (options.playable) el.classList.add('playable');
  if (options.disabled) el.classList.add('unplayable');
  if (options.kindle) el.classList.add('kindle-ready');
  if (options.selected) el.classList.add('selected');
  // A played card wears exactly one badge: its Kindle, or its chain.
  const badge = options.kindle
    ? '<span class="kindle-tag">KINDLE +2</span>'
    : options.chain === 'quench'
      ? '<span class="chain-tag quench-tag">QUENCHED</span>'
      : options.chain === 'ignite'
        ? '<span class="chain-tag ignite-tag">IGNITED</span>'
        : options.chain === 'flare'
          ? '<span class="chain-tag flare-tag">FLARED</span>'
          : options.ignited
            ? '<span class="chain-tag ignite-tag">IGNITED</span>'
            : '';
  const slot = options.slot ? SLOTS.find((entry) => entry.id === options.slot) : null;
  const slotTag = slot ? `<span class="slot-tag">${slot.name}</span>` : '';
  el.innerHTML =
    `<span class="cost" title="ember cost">${card.cost}</span>` +
    `<span class="suit-band"><svg class="suit-icon" aria-hidden="true"><use href="#${suit.icon}"></use></svg><span>${suit.name}</span></span>` +
    `<span class="suit-big" aria-hidden="true"><svg class="suit-icon" aria-hidden="true"><use href="#${suit.icon}"></use></svg></span>` +
    `<span class="card-name">${card.name}</span>` +
    `<span class="card-text">${effectText(card, options.bonus || 0)}</span>` +
    `<span class="power" title="power">${card.power + (options.bonus || 0)}</span>` +
    badge + slotTag;
  return el;
}

/** A face-down card back, for the Warden's hand. */
export function cardBackElement() {
  const el = document.createElement('div');
  el.className = 'card card-back';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="back-flame" aria-hidden="true"><svg class="suit-icon"><use href="#icon-flame"></use></svg></span>';
  return el;
}

/** Build the renderer over the page's static skeleton. */
export function createRenderer(doc) {
  const els = {
    table: doc.getElementById('table'),
    aiLifeFill: doc.getElementById('ai-life-fill'),
    aiLifeText: doc.getElementById('ai-life-text'),
    aiShield: doc.getElementById('ai-shield'),
    aiHand: doc.getElementById('ai-hand'),
    intent: doc.getElementById('intent'),
    brazier: doc.getElementById('brazier'),
    battleLine: doc.getElementById('battle-line'),
    slots: Array.from(doc.querySelectorAll('#battle-line .slot')),
    chainHint: doc.getElementById('chain-hint'),
    playedRow: doc.getElementById('played-row'),
    log: doc.getElementById('log'),
    playerLifeFill: doc.getElementById('player-life-fill'),
    playerLifeText: doc.getElementById('player-life-text'),
    playerShield: doc.getElementById('player-shield'),
    playerHand: doc.getElementById('player-hand'),
    emberMeter: doc.getElementById('ember-meter'),
    emberText: doc.getElementById('ember-text'),
    surgeMeter: doc.getElementById('surge-meter'),
    endTurn: doc.getElementById('end-turn'),
    titleOverlay: doc.getElementById('title-overlay'),
    endOverlay: doc.getElementById('end-overlay'),
    endTitle: doc.getElementById('end-title'),
    endText: doc.getElementById('end-text'),
    floaters: doc.getElementById('floaters'),
    confetti: doc.getElementById('confetti'),
    status: doc.getElementById('status'),
  };

  // The slots are wired once; they call whatever UI the latest render gave.
  let liveUi = null;
  for (const slotEl of els.slots) {
    slotEl.addEventListener('click', () => {
      if (liveUi && liveUi.onPlaySlot) liveUi.onPlaySlot(slotEl.dataset.slot);
    });
  }

  let lastPlayerSig = '';
  let lastAiSig = '';
  let lastTableSig = '';
  let lastLogSig = '';

  function lifeFill(fill, text, life) {
    const pct = Math.max(0, Math.min(100, (life / MAX_LIFE) * 100));
    fill.style.width = `${pct}%`;
    fill.classList.toggle('low', life <= 6);
    text.textContent = `${life}`;
  }

  function shieldBadge(el, shield) {
    el.textContent = shield > 0 ? `Shield ${shield}` : '';
    el.classList.toggle('has-shield', shield > 0);
  }

  /** A number that floats up off a fighter when they take damage. */
  function showDamage(target, amount, absorbed) {
    const anchor = target === 'ai' ? els.aiLifeText : els.playerLifeText;
    const rect = anchor.getBoundingClientRect();
    const tableRect = els.table.getBoundingClientRect();
    const floater = doc.createElement('span');
    floater.className = 'floater damage';
    floater.textContent = `-${amount}`;
    floater.style.left = `${rect.left - tableRect.left + rect.width / 2}px`;
    floater.style.top = `${rect.top - tableRect.top}px`;
    els.floaters.appendChild(floater);
    window.setTimeout(() => floater.remove(), 1400);
    if (absorbed > 0) {
      const soak = doc.createElement('span');
      soak.className = 'floater soak';
      soak.textContent = `shield soaked ${absorbed}`;
      soak.style.left = `${rect.left - tableRect.left + rect.width / 2}px`;
      soak.style.top = `${rect.top - tableRect.top + 28}px`;
      els.floaters.appendChild(soak);
      window.setTimeout(() => soak.remove(), 1400);
    }
  }

  /** Embers that fall over a win, the flourish a victory lands with. */
  function burstConfetti() {
    els.confetti.innerHTML = '';
    for (let i = 0; i < 48; i += 1) {
      const ember = doc.createElement('span');
      ember.className = 'ember-bit';
      ember.style.left = `${Math.random() * 100}%`;
      ember.style.animationDelay = `${Math.random() * 1.6}s`;
      ember.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
      const size = 5 + Math.random() * 9;
      ember.style.width = `${size}px`;
      ember.style.height = `${size}px`;
      els.confetti.appendChild(ember);
    }
  }

  /**
   * Paint the state. `ui` carries what the renderer cannot know: which cards
   * the player may play, which would Kindle, and the callbacks for a card
   * click and for ending the turn.
   */
  function render(state, ui) {
    liveUi = ui;
    const player = state.player;
    const ai = state.ai;

    // Fighters: life bars, numbers, shields.
    lifeFill(els.aiLifeFill, els.aiLifeText, ai.life);
    lifeFill(els.playerLifeFill, els.playerLifeText, player.life);
    shieldBadge(els.aiShield, ai.shield);
    shieldBadge(els.playerShield, player.shield);

    // The Warden's hand: backs only, one per card, so its size is readable.
    const aiSig = ai.hand.join(',');
    if (aiSig !== lastAiSig) {
      lastAiSig = aiSig;
      els.aiHand.innerHTML = '';
      for (const _id of ai.hand) els.aiHand.appendChild(cardBackElement());
    }

    // The player's hand: rebuild only when it changes, so the deal animation
    // plays once and a card does not jump while the player reads it.
    const playerSig = player.hand.join(',') + '|' + (ui.playableIds || []).join(',') + '|' + (ui.kindleSuit || '') + '|' + (ui.selectedIndex ?? '');
    if (playerSig !== lastPlayerSig) {
      lastPlayerSig = playerSig;
      els.playerHand.innerHTML = '';
      els.playerHand.classList.toggle('many', player.hand.length > 6);
      player.hand.forEach((id, index) => {
        const card = cardById(id);
        const playable = (ui.playableIds || []).includes(id);
        const kindle = playable && ui.kindleSuit === card.suit;
        const el = cardElement(card, {
          playable,
          disabled: !playable,
          kindle,
          bonus: kindle ? 2 : 0,
          selected: ui.selectedIndex === index,
        });
        el.style.animationDelay = `${index * 70}ms`;
        el.addEventListener('click', () => ui.onPlayCard(index));
        els.playerHand.appendChild(el);
      });
    }

    // Ember meter: ten pips, lit for what the player holds.
    els.emberMeter.innerHTML = '';
    for (let i = 0; i < MAX_EMBER; i += 1) {
      const pip = doc.createElement('span');
      pip.className = `ember-pip${i < player.ember ? ' lit' : ''}`;
      els.emberMeter.appendChild(pip);
    }
    els.emberText.textContent = `${player.ember} ember`;

    // Ember Surge meter: three pips, lit for the Flame cards played this
    // duel toward the next Surge; all three blaze when one just fired.
    const surgePips = player.surge % SURGE_EVERY;
    els.surgeMeter.innerHTML = '';
    for (let i = 0; i < SURGE_EVERY; i += 1) {
      const pip = doc.createElement('span');
      pip.className = 'surge-pip' + (player.surgeFlash ? ' surge-lit' : i < surgePips ? ' lit' : '');
      els.surgeMeter.appendChild(pip);
    }

    // The brazier burns hotter as the Surge nears, and bursts when it fires.
    els.brazier.className = `hot-${surgePips}${player.surgeFlash ? ' burst' : ''}`;

    // The battle line: when a card is chosen, its slots light up — the one
    // that favours the card's suit brightest — and a click plays it there.
    const selectedCard = ui.selectedIndex != null ? cardById(player.hand[ui.selectedIndex]) : null;
    for (const slotEl of els.slots) {
      const slot = SLOTS.find((entry) => entry.id === slotEl.dataset.slot);
      slotEl.classList.toggle('lit', Boolean(selectedCard));
      slotEl.classList.toggle('match', Boolean(selectedCard) && slot.suit === selectedCard.suit);
    }

    // Chain hint: after one card of a turn, name what the second card could do.
    if (state.phase === 'play' && state.turn === 'player' && player.playedThisTurn.length === 1) {
      const first = player.playedThisTurn[0];
      els.chainHint.textContent =
        first === 'flame'
          ? 'Flame played — play Ash to Quench (+2 shield), or Flame to Kindle (+2).'
          : first === 'ash'
            ? 'Ash played — play Spark to Ignite (next Flame +2), or Ash to Kindle (+2).'
            : 'Spark played — play Flame to Flare (+1 damage, draw 1), or Spark to Kindle (+2).';
    } else {
      els.chainHint.textContent = '';
    }

    // The table: the cards played this round, newest last, flipping in —
    // each wearing its slot and its Kindle or chain badge.
    const tableSig = (state.table || []).map((play) => `${play.who}:${play.card.id}:${play.slot || ''}:${play.chain || ''}:${play.ignited ? 'i' : ''}`).join(',');
    if (tableSig !== lastTableSig) {
      lastTableSig = tableSig;
      els.playedRow.innerHTML = '';
      for (const play of state.table || []) {
        const el = cardElement(play.card, {
          tag: 'div',
          bonus: play.bonus || 0,
          kindle: play.kindled,
          chain: play.chain,
          ignited: play.ignited,
          slot: play.slot,
        });
        el.classList.add('played', play.who === 'player' ? 'played-by-player' : 'played-by-ai');
        els.playedRow.appendChild(el);
      }
    }

    // Intent: what the Warden is about to do, in plain words.
    els.intent.textContent = state.intent ? state.intent.text : '';
    els.intent.classList.toggle('show', Boolean(state.intent));

    // Log: the last few lines, newest last.
    const logSig = state.log.slice(-4).join('|');
    if (logSig !== lastLogSig) {
      lastLogSig = logSig;
      els.log.innerHTML = '';
      for (const line of state.log.slice(-4)) {
        const p = doc.createElement('p');
        p.textContent = line;
        els.log.appendChild(p);
      }
    }

    // Controls: End Turn is live only on the player's turn, in play.
    const canEnd = state.phase === 'play' && state.turn === 'player';
    els.endTurn.disabled = !canEnd;
    els.endTurn.classList.toggle('ready', canEnd);

    // Screens: title, play, won, lost.
    els.titleOverlay.classList.toggle('hidden', state.phase !== 'title');
    const over = state.phase === 'won' || state.phase === 'lost';
    els.endOverlay.classList.toggle('hidden', !over);
    if (over) {
      const won = state.phase === 'won';
      els.endTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
      els.endTitle.className = won ? 'end-title win' : 'end-title loss';
      els.endText.textContent = won
        ? `The Warden's flame goes out. You hold the last flame — ${player.life} life to spare.`
        : `Your flame goes out at ${ai.life} life to the Warden. The embers remember you.`;
      if (won && !els.confetti.hasChildNodes()) burstConfetti();
    } else {
      els.confetti.innerHTML = '';
    }

    els.status.textContent =
      state.phase === 'play'
        ? `Your life ${player.life}, shield ${player.shield}, ember ${player.ember}. The Warden: life ${ai.life}, shield ${ai.shield}.`
        : state.phase === 'won'
          ? 'Victory. You hold the last flame.'
          : state.phase === 'lost'
            ? 'Defeat. The Warden holds the last flame.'
            : 'Emberfall. Press Start Duel to play.';
  }

  return { render, showDamage, burstConfetti, els };
}

/**
 * Rendering.
 *
 * Everything here is a function of the view the host sent plus a small set of
 * callbacks. No game logic lives in this file — if the UI thinks an action is
 * available it is because the host said so in view.legalActions, and the host
 * checks again when the action comes back.
 */

const $ = (id) => document.getElementById(id);

/* Clock offset between this device and the host, so the countdown everyone
 * sees agrees even if someone's phone clock is minutes out. */
let clockOffset = 0;

export function syncClock(hostNow) {
  if (typeof hostNow === 'number') clockOffset = hostNow - Date.now();
}

export function hostNow() {
  return Date.now() + clockOffset;
}

export function showScreen(name) {
  for (const screen of document.querySelectorAll('.screen')) {
    screen.hidden = screen.id !== `screen-${name}`;
  }
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

export function renderCard(card, { big = false, onClick } = {}) {
  const el = document.createElement(onClick ? 'button' : 'div');
  el.className = `card${big ? ' card-big' : ''}`;
  if (onClick) {
    el.type = 'button';
    el.addEventListener('click', () => onClick(card));
  }

  const img = document.createElement('img');
  img.src = card.image;
  img.alt = `${card.deck === 'event' ? 'Event Card' : 'Mini Game'} ${card.n}: ${card.title}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  el.append(img);

  el.title = `${card.title} — ${card.text}`;
  return el;
}

/* ------------------------------------------------------------------ *
 * Lobby
 * ------------------------------------------------------------------ */

export function renderLobby(view, { code, isHost, canStart }) {
  $('lobby-code').textContent = code || '····';
  $('code-block').hidden = !code;

  $('lobby-players').replaceChildren(
    ...view.players.map((player) => {
      const li = document.createElement('li');

      const who = document.createElement('div');
      who.className = 'who';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = player.name + (player.id === view.you?.id ? ' (you)' : '');
      const wrestler = document.createElement('span');
      wrestler.className = 'wrestler';
      wrestler.textContent = player.wrestler || 'no wrestler picked';
      who.append(name, wrestler);
      li.append(who);

      if (player.isHost) li.append(tag('Host', 'tag-host'));
      li.append(tag(player.ready ? 'Ready' : 'Waiting', player.ready ? 'tag-ready' : ''));
      return li;
    }),
  );

  const you = view.players.find((p) => p.id === view.you?.id);
  const readyBtn = $('btn-ready');
  readyBtn.textContent = you?.ready ? "I'm ready ✓" : "I'm ready";
  readyBtn.classList.toggle('is-on', !!you?.ready);

  const startBtn = $('btn-start');
  startBtn.hidden = !isHost;
  startBtn.disabled = !canStart;

  const missing = view.players.filter((p) => !p.wrestler).length;
  $('lobby-hint').textContent = isHost
    ? canStart
      ? missing
        ? `Ready to go — though ${missing} ${missing === 1 ? 'player has' : 'players have'} no wrestler yet.`
        : 'Everyone is ready.'
      : 'The night starts once everyone has marked themselves ready.'
    : 'Waiting for the host to start.';
}

function tag(text, className) {
  const el = document.createElement('span');
  el.className = `tag ${className}`.trim();
  el.textContent = text;
  return el;
}

/* ------------------------------------------------------------------ *
 * Game
 * ------------------------------------------------------------------ */

export function renderGame(view, handlers) {
  renderHud(view);
  renderBanners(view);
  renderDrinks(view, handlers);
  renderTable(view, handlers);
  renderPlayers(view, handlers);
  renderHand(view, handlers);
  renderLog(view);
}

function renderHud(view) {
  const current = view.players.find((p) => p.id === view.turn);
  const el = $('hud-turn');
  el.classList.toggle('is-you', !!view.yourTurn);
  el.replaceChildren(
    text('span', view.yourTurn ? 'Your turn' : `${current?.name ?? '—'}'s turn`),
    text('span', `Round ${view.round} · ${view.deckCount} Mini Games left`, 'sub'),
  );
}

function renderBanners(view) {
  $('title-banner').hidden = !view.titleMatch;
  $('house-rules').replaceChildren(
    ...(view.houseRules || []).map((rule) => {
      const el = document.createElement('div');
      el.className = 'house-rule';
      el.append(text('b', `${rule.by}'s rule: `), document.createTextNode(rule.rule));
      return el;
    }),
  );
}

/**
 * Outstanding drinks. Yours render as a full-width countdown you cannot miss;
 * everyone else's as a quiet line so the table knows who they're waiting on.
 */
function renderDrinks(view, { onAct }) {
  const mine = view.orders.filter((o) => o.playerId === view.you?.id);
  const theirs = view.orders.filter((o) => o.playerId !== view.you?.id);

  const nodes = [];

  for (const order of mine) {
    const el = document.createElement('div');
    el.className = 'drink';
    el.append(text('div', drinkHeadline(order), 'drink-who'));
    el.append(text('div', order.label, 'drink-why'));

    if (order.down) {
      el.append(button('Down it — done', () => onAct({ type: 'finishOrder', orderId: order.id })));
    } else if (!order.startedAt) {
      el.append(
        text('div', order.stopwatch ? '0.0' : String(order.seconds), 'countdown', {
          'data-order': order.id,
        }),
      );
      el.append(button('Start', () => onAct({ type: 'startOrder', orderId: order.id })));
    } else {
      el.append(text('div', '', 'countdown', { 'data-order': order.id }));
      el.append(button('Done', () => onAct({ type: 'finishOrder', orderId: order.id })));
    }
    nodes.push(el);
  }

  for (const order of theirs) {
    const who = view.players.find((p) => p.id === order.playerId);
    const el = document.createElement('div');
    el.className = 'drink is-theirs';
    el.append(text('div', `${who?.name ?? 'Someone'} — ${drinkHeadline(order)}`, 'drink-who'));
    el.append(text('div', order.label, 'drink-why'));
    nodes.push(el);
  }

  $('drinks').replaceChildren(...nodes);
  tickCountdowns(view);
}

function drinkHeadline(order) {
  if (order.down) return 'Down your drink';
  if (order.stopwatch) return 'On the clock';
  return `Drink for ${order.seconds}s`;
}

/**
 * Re-render just the countdown numbers. Called on every view update and on a
 * 100ms timer, so the digits move smoothly without re-rendering the page.
 */
export function tickCountdowns(view) {
  if (!view?.orders) return;
  for (const el of document.querySelectorAll('.countdown[data-order]')) {
    const order = view.orders.find((o) => String(o.id) === el.dataset.order);
    if (!order || !order.startedAt) continue;

    const elapsed = (hostNow() - order.startedAt) / 1000;
    if (order.stopwatch) {
      el.textContent = elapsed.toFixed(1);
      continue;
    }
    const left = Math.max(0, order.seconds - elapsed);
    el.textContent = left > 0 ? left.toFixed(1) : 'GO';
    el.classList.toggle('is-up', left <= 0);
  }
}

function renderTable(view, handlers) {
  const area = $('table-area');
  area.className = 'table-area';
  const current = view.current;

  if (!current) {
    const deck = document.createElement('div');
    deck.className = 'card card-deck';
    deck.textContent = `${view.deckCount} Mini Games`;
    area.replaceChildren(deck);

    const canDraw = view.legalActions.some((a) => a.type === 'draw');
    if (canDraw) {
      area.append(
        button('Draw a Mini Game', () => handlers.onAct({ type: 'draw' }), 'btn btn-primary'),
      );
    } else {
      const who = view.players.find((p) => p.id === view.turn);
      area.append(text('p', `Waiting for ${who?.name ?? 'the next player'} to draw.`, 'table-prompt'));
    }
    return;
  }

  const drawer = view.players.find((p) => p.id === current.drawnBy);
  area.replaceChildren(
    renderCard(current.card, { big: true, onClick: () => handlers.onShowCard(current.card) }),
    text('div', current.card.title, 'card-title'),
    text('p', current.card.text, 'card-text'),
  );

  const outcomes = view.legalActions.filter((a) => a.type === 'outcome');
  if (outcomes.length) {
    const box = document.createElement('div');
    box.className = 'outcomes';
    for (const action of outcomes) {
      box.append(button(action.label, () => handlers.onOutcome(action), 'btn btn-gold'));
    }
    box.append(button('Next player', () => handlers.onAct({ type: 'endTurn' })));
    area.append(box);
  } else {
    area.append(text('p', `${drawer?.name ?? 'Someone'} is resolving this one.`, 'table-prompt'));
  }
}

function renderPlayers(view, handlers) {
  const now = hostNow();
  $('players-strip').replaceChildren(
    ...view.players.map((player) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'player-chip';
      if (player.id === view.turn) el.classList.add('is-turn');
      if (!player.connected) el.classList.add('is-offline');

      el.append(text('span', player.name + (player.id === view.you?.id ? ' (you)' : ''), 'n'));
      if (player.wrestler) el.append(text('span', player.wrestler, 'w'));
      el.append(text('span', tallyText(player), 's'));

      const badges = document.createElement('div');
      badges.className = 'badges';
      if (player.doubledUntil > now) badges.append(text('span', 'x2', 'badge badge-double'));
      if (player.cursed > 0) badges.append(text('span', `cursed ${player.cursed}`, 'badge badge-cursed'));
      if (badges.children.length) el.append(badges);

      el.addEventListener('click', () => handlers.onShowPlayer(player));
      return el;
    }),
  );
}

export function tallyText(player) {
  const bits = [];
  if (player.seconds) bits.push(`${player.seconds}s`);
  if (player.downs) bits.push(`${player.downs} down${player.downs === 1 ? '' : 's'}`);
  return bits.join(' · ') || 'clean sheet';
}

function renderHand(view, handlers) {
  const hand = view.you?.hand ?? [];
  $('hand-count').textContent = hand.length ? `(${hand.length})` : '';
  $('hand').replaceChildren(
    ...hand.map((card) => renderCard(card, { onClick: () => handlers.onShowCard(card) })),
  );
}

function renderLog(view) {
  $('log').replaceChildren(
    ...[...view.log].reverse().map((entry) => text('li', entry.message)),
  );
}

/* ------------------------------------------------------------------ *
 * Sheet (the one modal, reused for cards, pickers, votes and the tally)
 * ------------------------------------------------------------------ */

export function openSheet(build) {
  const content = $('sheet-content');
  content.replaceChildren();
  build(content, closeSheet);
  $('sheet').hidden = false;
}

export function closeSheet() {
  $('sheet').hidden = true;
  $('sheet-content').replaceChildren();
}

export function sheetIsOpen() {
  return !$('sheet').hidden;
}

/** A card, its printed text, and whatever the holder may do with it. */
export function cardSheet(card, actions, { onPick } = {}) {
  return (root, close) => {
    root.append(text('h2', card.title, 'sheet-title'));
    root.append(
      text('p', `${card.deck === 'event' ? 'Event Card' : 'Mini Game'} ${card.n}`, 'sheet-text'),
    );

    const holder = document.createElement('div');
    holder.className = 'sheet-card';
    holder.append(renderCard(card, { big: true }));
    root.append(holder);

    root.append(text('p', card.text, 'sheet-text'));

    if (actions.length) {
      const box = document.createElement('div');
      box.className = 'sheet-actions';
      for (const action of actions) {
        box.append(
          button(action.label, () => {
            close();
            onPick?.(action);
          }, 'btn btn-gold'),
        );
      }
      root.append(box);
    }
  };
}

/**
 * Pick one or more players. `needs` is 1 for a single pick and -1 for any
 * number; the confirm button stays disabled until the selection is valid.
 */
export function pickerSheet({ title, hint, players, needs = 1, confirmLabel = 'Confirm' }, onDone) {
  return (root, close) => {
    root.append(text('h2', title, 'sheet-title'));
    if (hint) root.append(text('p', hint, 'sheet-text'));

    const chosen = new Set();
    const list = document.createElement('div');
    list.className = 'pick-list';

    const confirm = button(confirmLabel, () => {
      close();
      onDone([...chosen]);
    }, 'btn btn-primary');
    confirm.disabled = true;

    for (const player of players) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick';
      row.append(text('span', player.name));
      row.append(text('span', player.wrestler || tallyText(player), 'sub'));

      row.addEventListener('click', () => {
        if (needs === 1) {
          // Single pick: tapping a name is the whole interaction.
          close();
          onDone([player.id]);
          return;
        }
        if (chosen.has(player.id)) chosen.delete(player.id);
        else chosen.add(player.id);
        row.classList.toggle('is-picked', chosen.has(player.id));
        confirm.disabled = chosen.size === 0;
      });
      list.append(row);
    }

    root.append(list);
    if (needs !== 1) root.append(confirm);
  };
}

export function tallySheet(view) {
  return (root) => {
    root.append(text('h2', 'The tally', 'sheet-title'));
    root.append(text('p', 'Time spent drinking, worst first.', 'sheet-text'));

    const ranked = [...view.players].sort(
      (a, b) => b.seconds + b.downs * 20 - (a.seconds + a.downs * 20),
    );
    const list = document.createElement('ul');
    list.className = 'tally';
    for (const player of ranked) {
      const li = document.createElement('li');
      const who = document.createElement('div');
      who.append(text('div', player.name));
      if (player.wrestler) who.append(text('div', player.wrestler, 'sub'));
      li.append(who, text('span', tallyText(player), 'amount'));
      list.append(li);
    }
    root.append(list);
  };
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

export function text(tagName, content, className, attrs) {
  const el = document.createElement(tagName);
  if (content) el.textContent = content;
  if (className) el.className = className;
  if (attrs) for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

export function button(label, onClick, className = 'btn') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

export function toast(message, { error = false, ms = 3600 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' is-error' : ''}`;
  el.textContent = message;
  $('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

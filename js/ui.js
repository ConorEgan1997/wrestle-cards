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

/*
 * The five kinds of card, in the words printed on them. Pack 1 had two; the
 * cards3.1 set added three more, and the difference matters to a player —
 * a PPV Card is a standing trigger you keep, a Private Player Card is a
 * one-shot power, a Money in the Bank card only means anything on MITB night.
 */
const KIND_LABEL = {
  event: 'Event Card',
  mini: 'Mini Game',
  ppv: 'PPV Card',
  private: 'Private Player Card',
  mitb: 'Money in the Bank',
};

export function kindLabel(kind) {
  return KIND_LABEL[kind] ?? 'Card';
}

/**
 * The art is not one shape any more.
 *
 * Pack 1 is drawn 380x1020 — a long, narrow card. The cards3.1 set is mostly
 * the same, but its PPV, Private and Money in the Bank cards are drawn much
 * squatter (around 400x728), and two cards are their own shapes again. Letting
 * one ratio stand for all of them cropped the bottom off the rule box, which
 * on a squat card is most of the card. So every card carries the size of its
 * own art and sizes its own frame from it.
 */
function applyShape(el, card) {
  const [w, h] = Array.isArray(card.size) && card.size.length === 2 ? card.size : [380, 1020];
  el.style.setProperty('--card-ratio', `${w} / ${h}`);
  // The same number, as a plain ratio, for the places that work out a width
  // from the height left on screen rather than the other way round.
  el.style.setProperty('--card-ar', String(w / h));
}

export function renderCard(card, { big = false, onClick } = {}) {
  const el = document.createElement(onClick ? 'button' : 'div');
  el.className = `card${big ? ' card-big' : ''}`;
  if (onClick) {
    el.type = 'button';
    el.addEventListener('click', () => onClick(card));
  }
  applyShape(el, card);

  const img = document.createElement('img');
  img.src = card.image;
  img.alt = `${kindLabel(card.kind)} ${card.n}: ${card.title}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  el.append(img);

  el.title = card.text ? `${card.title} — ${card.text}` : card.title;
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

/**
 * Tonight's rules, rendered from the schema so adding an option needs no work
 * here. The host taps to change them; everyone else sees the same panel with
 * the buttons inert, so the table can see what it has agreed to.
 */
export function renderSettings(view, schema, { isHost, onChange, into = 'settings' }) {
  const slot = document.getElementById(into);
  if (!slot) return;
  const settings = view.settings ?? {};

  slot.replaceChildren(
    ...Object.entries(schema).map(([key, option]) => {
      const row = document.createElement('div');
      row.className = 'setting';
      row.append(text('div', option.label, 'setting-label'));

      const choices = document.createElement('div');
      choices.className = 'setting-choices';
      for (const choice of option.choices) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'choice';
        el.classList.toggle('is-on', settings[key] === choice.value);
        el.disabled = !isHost;
        el.append(text('span', choice.label, 'c-label'));
        if (choice.detail) el.append(text('span', choice.detail, 'c-detail'));
        if (isHost) el.addEventListener('click', () => onChange({ [key]: choice.value }));
        choices.append(el);
      }
      row.append(choices);
      if (option.note && isHost) row.append(text('div', option.note, 'setting-note'));
      return row;
    }),
  );
}

/**
 * The seat list in the one-screen lobby.
 *
 * Just names, in the order people are sitting, because that order is the
 * game: half the deck says "the person to your left". No ready buttons and
 * no wrestler pickers — there are no phones here to tap them on.
 */
export function renderLocalLobby(seats, { code, onRemove }) {
  const list = document.getElementById('local-seats');
  if (!list) return;

  list.replaceChildren(
    ...seats.map((seat, i) => {
      const row = document.createElement('li');
      row.className = 'seat';
      row.append(text('span', String(i + 1), 'seat-n'));
      row.append(text('span', seat.name, 'seat-name'));
      row.append(button('Remove', () => onRemove(seat.id), 'btn btn-quiet btn-tiny'));
      return row;
    }),
  );

  const hint = document.getElementById('local-hint');
  if (!hint) return;
  if (seats.length < 2) {
    hint.textContent = 'Add at least two players.';
  } else if (code) {
    hint.textContent =
      `Ready. Anyone who wants a hand of cards can join at this address with code ${code} — `
      + 'during the game is fine, they get dealt in where they sit.';
  } else {
    hint.textContent = 'Ready. No room code tonight, so it is the screen only — which is the whole game.';
  }
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

/** How long the full-screen reveal holds before dropping to the banner. */
export const FLASH_MS = 4500;
/** How long the banner then lingers. */
export const ANNOUNCE_MS = 12000;

export function renderGame(view, handlers) {
  /*
   * One renderer, two audiences. A phone shows you your own game; a screen in
   * the middle of the table shows the room its game, and acts for whichever
   * seat is up. Almost everything is shared — the card, the clock, the
   * announcements — so the difference is a class on the game screen plus the
   * three parts that are genuinely about *you*: your hand, your turn, and
   * your buttons.
   */
  const screen = !!view.screen;
  // On the body, not the game section: the clock takeover and the focus view
  // are siblings of it, and they need to go big on a television too.
  document.body.classList.toggle('is-screen', screen);

  renderHud(view, screen);
  renderAnnounce(view);
  renderPending(view);
  renderBanners(view);
  renderTimer(view, handlers);
  renderDrinks(view);
  renderTable(view, handlers);
  renderPlayers(view, handlers);
  if (screen) renderSeatActions(view, handlers);
  else renderDockActions(view, handlers);
  renderHand(view, handlers);
  renderLog(view);
}

function renderHud(view, screen = false) {
  const current = view.players.find((p) => p.id === view.turn);
  const el = $('hud-turn');
  el.classList.toggle('is-you', !screen && !!view.yourTurn);
  el.replaceChildren(
    text('span', screen
      ? `${current?.name ?? '—'} is up`
      : view.yourTurn ? 'Your turn' : `${current?.name ?? '—'}'s turn`),
    text('span', `Round ${view.round} · ${view.deckCount} Mini Games left`, 'sub'),
  );
}

/**
 * The buttons on a shared screen.
 *
 * Whoever is up has no phone, so their options appear here with their name on
 * them — "Conor: draw a Mini Game" — and the screen sends them as that seat.
 * Only the one seat's buttons are shown: the whole room is looking at this,
 * and four people's options at once is how you end up pressing the wrong one
 * four drinks in.
 */
function renderSeatActions(view, handlers) {
  const dock = $('dock-actions');
  const seat = view.players.find((p) => p.id === view.turn);
  const actions = view.seatActions?.[view.turn] ?? [];
  const measure = view.settings?.measure;

  // Resolving the card that is on the table beats everything else.
  const outcomes = actions.filter((a) => a.type === 'outcome');
  const shown = outcomes.length
    ? outcomes
    : actions.filter((a) => ['draw', 'endTurn', 'unstick'].includes(a.type));

  if (!seat || !shown.length) {
    dock.replaceChildren();
    return;
  }

  dock.replaceChildren(
    text('div', `${seat.name} —`, 'seat-turn'),
    ...shown.map((action) => button(
      relabel(action, measure),
      () => handlers.onSeatAct(seat.id, action),
      action.type === 'draw' ? 'btn btn-gold btn-big' : 'btn btn-big',
    )),
  );
}

/**
 * "Conor played NO SELL on Jude" — on every device, with the card art.
 * Re-checked on the tick so it clears itself without another state update.
 */
export function renderAnnounce(view) {
  const slot = document.getElementById('announce');
  if (!slot) return;
  const play = view?.lastPlay;
  const age = play ? hostNow() - play.at : Infinity;

  renderFlash(play, age);

  if (!play || age > ANNOUNCE_MS) {
    if (slot.dataset.showing) {
      slot.replaceChildren();
      delete slot.dataset.showing;
    }
    return;
  }
  // Already on screen for this play — leave it alone so the animation and any
  // in-progress scroll aren't restarted on every state update.
  if (slot.dataset.showing === String(play.at)) return;
  slot.dataset.showing = String(play.at);

  const el = document.createElement('div');
  el.className = 'announce';

  const img = document.createElement('img');
  img.src = play.card.image;
  img.alt = play.card.title;
  applyShape(img, play.card);
  el.append(img);

  const body = document.createElement('div');
  body.className = 'announce-body';
  body.append(text('div', `${play.by} played`, 'announce-who'));
  body.append(text('div', play.card.title, 'announce-card'));

  const on = play.targets?.length ? play.targets.join(', ') : null;
  body.append(text('div', on ? `on ${on}` : play.outcome, 'announce-target'));
  el.append(body);

  slot.replaceChildren(el);
}

/**
 * The card turning over. Full screen for a few seconds so the room looks up,
 * because this is the moment the guess is settled.
 */
function renderFlash(play, age) {
  const box = document.getElementById('flash');
  if (!box) return;

  if (!play || age > FLASH_MS) {
    if (!box.hidden) {
      box.hidden = true;
      delete box.dataset.showing;
    }
    return;
  }
  if (box.dataset.showing === String(play.at)) return;
  box.dataset.showing = String(play.at);
  box.hidden = false;

  const art = document.getElementById('flash-art');
  art.src = play.card.image;
  art.alt = play.card.title;
  applyShape(art, play.card);
  document.getElementById('flash-who').textContent = `${play.by} played`;
  document.getElementById('flash-card').textContent = play.card.title;

  const result = document.getElementById('flash-result');
  const botched = play.botched?.length ? play.botched.join(', ') : null;
  result.classList.toggle('is-countered', !!play.counteredBy);
  result.classList.toggle('is-botched', !!botched);

  if (play.counteredBy) {
    result.textContent = `${play.counteredBy} called it — it lands on ${play.by}`;
  } else if (botched) {
    result.textContent = `Botched counter — ${botched} drinks double`;
  } else if (play.targets?.length) {
    result.textContent = `on ${play.targets.join(', ')}`;
  } else {
    result.textContent = play.outcome;
  }
}

/** "3 seconds" / "your whole drink" — what is riding on a face-down card. */
export function stakeText(stake, measure = 'seconds') {
  if (!stake) return 'something';
  if (stake.down) return 'your whole drink';
  if (stake.stopwatch) return 'a timed drink';
  if (measure === 'sips') {
    const n = sips(stake.seconds);
    return `${n} sip${n === 1 ? '' : 's'}`;
  }
  return `${stake.seconds} second${stake.seconds === 1 ? '' : 's'}`;
}

/** What a wrong call turns that into. */
export function botchText(stake, measure = 'seconds') {
  if (!stake || stake.down || stake.stopwatch || !stake.seconds) return null;
  const doubled = stake.seconds * (stake.botchMultiplier ?? 2);
  return measure === 'sips' ? `${sips(doubled)} sips` : `${doubled} seconds`;
}

/** A card is face down on the table and the game is waiting on somebody. */
function renderPending(view) {
  const slot = document.getElementById('pending');
  if (!slot) return;
  const pending = view?.pending;

  if (!pending) {
    slot.replaceChildren();
    return;
  }

  const names = (ids) =>
    ids.map((id) => view.players.find((p) => p.id === id)?.name ?? '?').join(', ');

  const el = document.createElement('div');
  el.className = 'pending-banner';
  el.append(text('div', '', 'pending-back'));

  const body = document.createElement('div');
  body.className = 'pending-text';
  body.append(
    text('b', pending.byName),
    document.createTextNode(` played a card face down at ${names(pending.targets)}`),
  );
  const measure = view.settings?.measure;
  const botched = botchText(pending.stake, measure);
  body.append(
    text('span',
      pending.youCanCounter
        ? `${stakeText(pending.stake, measure)} at stake${botched ? ` — a wrong call makes it ${botched}` : ''}`
        : pending.waitingOn.length
          ? `${stakeText(pending.stake, measure)} at stake · waiting on ${names(pending.waitingOn)}…`
          : 'Turning it over…',
      'sub'),
  );
  el.append(body);
  slot.replaceChildren(el);
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
 * Group the outstanding drinks by the play that created them, so "everyone
 * drinks" is one countdown for the room rather than five separate ones.
 */
export function drinkBatches(view) {
  const map = new Map();
  for (const order of view.orders ?? []) {
    if (!map.has(order.batch)) map.set(order.batch, []);
    map.get(order.batch).push(order);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function batchSeconds(orders) {
  return Math.max(...orders.map((o) => o.seconds || 0));
}

function batchStartedAt(orders) {
  const started = orders.map((o) => o.startedAt).filter(Boolean);
  return started.length ? Math.min(...started) : null;
}

/** Seconds left on a batch, or null if it hasn't been started. */
export function batchRemaining(orders) {
  const startedAt = batchStartedAt(orders);
  if (!startedAt) return null;
  const elapsed = (hostNow() - startedAt) / 1000;
  if (orders.some((o) => o.stopwatch)) return -elapsed; // counts up
  return Math.max(0, batchSeconds(orders) - elapsed);
}

/**
 * The clock, full screen, on every device in the room.
 *
 * The playtest was clear about this: after the card is resolved the room wants
 * one big shared timer rather than a banner each. Whoever dealt the drink out
 * starts it, because they can see whether everyone is actually ready.
 */
function renderTimer(view, { onAct }) {
  const box = $('timer');
  const batches = drinkBatches(view);

  if (!batches.length) {
    box.hidden = true;
    return;
  }

  const [batch, orders] = batches[0];
  box.hidden = false;

  const names = orders
    .map((o) => view.players.find((p) => p.id === o.playerId)?.name ?? 'Someone')
    .filter((n, i, all) => all.indexOf(n) === i);
  const everyone = names.length >= view.players.length && view.players.length > 1;

  const order = orders[0];
  const measure = view.settings?.measure;
  const plural = names.length > 1 || everyone;

  $('timer-why').textContent = order.label;
  $('timer-who').textContent = everyone ? 'Everyone' : names.join(' & ');
  $('timer-what').textContent = order.shot
    ? 'hardcore match — take a shot'
    : order.down ? 'down your drink'
      : order.stopwatch ? 'on the clock'
        : measure === 'sips'
          ? `${plural ? 'take' : 'takes'} ${sips(batchSeconds(orders))} sips`
          : `${plural ? 'drink' : 'drinks'} for ${batchSeconds(orders)} seconds`;

  const count = $('timer-count');
  count.dataset.batch = String(batch);
  // A shot, a downed can and a count of sips are all "do it and say when" —
  // only a timed drink gets a countdown.
  count.hidden = !!order.down || !!order.shot || measure === 'sips';
  if (!count.hidden && !batchStartedAt(orders)) {
    count.textContent = order.stopwatch ? '0.0' : String(batchSeconds(orders));
    count.classList.remove('is-up');
  }
  $('timer-inner')?.classList.toggle('is-shot', !!order.shot);

  // Only the player who dealt it out (plus the drinkers and the host) gets the
  // button; everyone else is told who they're waiting on.
  const action = view.legalActions.find(
    (a) => (a.type === 'startBatch' || a.type === 'finishBatch') && a.batch === batch,
  );
  const dealer = view.players.find((p) => p.id === orders[0].from);

  if (!action) {
    $('timer-actions').replaceChildren(
      text('p', `Waiting for ${dealer?.name ?? 'the table'}…`, 'timer-wait'),
    );
    return;
  }

  const immediate = order.down || order.shot || measure === 'sips';
  const label = action.type === 'startBatch'
    ? (immediate ? 'Done' : 'Start')
    : (order.stopwatch ? 'Stop' : 'Done');
  $('timer-actions').replaceChildren(
    button(label, () => {
      onAct({ type: action.type, batch });
      // Nothing to time, so the one tap both starts and settles it.
      if (immediate && action.type === 'startBatch') onAct({ type: 'finishBatch', batch });
    }, 'btn btn-light'),
  );
}

/** Any further batches queued behind the one on the clock. */
function renderDrinks(view) {
  const rest = drinkBatches(view).slice(1);
  $('drinks').replaceChildren(
    ...rest.map(([, orders]) => {
      const who = orders
        .map((o) => view.players.find((p) => p.id === o.playerId)?.name ?? 'Someone')
        .join(', ');
      const el = document.createElement('div');
      el.className = 'drink is-theirs';
      el.append(text('div', `${who} — ${drinkHeadline(orders[0], view.settings?.measure)}`, 'drink-who'));
      el.append(text('div', orders[0].label, 'drink-why'));
      return el;
    }),
  );
}

function drinkHeadline(order, measure) {
  if (order.shot) return 'a shot';
  if (order.down) return 'down your drink';
  if (order.stopwatch) return 'on the clock';
  return measure === 'sips' ? `${sips(order.seconds)} sips` : `${order.seconds}s`;
}

/**
 * Re-render just the countdown digits. Called on every view update and on a
 * 100ms timer, so the numbers move smoothly without re-rendering the page.
 */
export function tickCountdowns(view) {
  renderAnnounce(view);
  if (!view?.orders) return;

  const el = $('timer-count');
  if (!el || el.hidden) return;

  const batch = Number(el.dataset.batch);
  const orders = (view.orders ?? []).filter((o) => o.batch === batch);
  if (!orders.length) return;

  const left = batchRemaining(orders);
  if (left === null) return; // not started yet

  if (left < 0) {
    el.textContent = (-left).toFixed(1); // stopwatch counts up
    return;
  }
  el.textContent = left > 0 ? left.toFixed(1) : "TIME";
  el.classList.toggle('is-up', left <= 0);
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

    if (!view.legalActions.some((a) => a.type === 'draw')) {
      const who = view.players.find((p) => p.id === view.turn);
      area.append(text('p', `Waiting for ${who?.name ?? 'the next player'} to draw.`, 'table-prompt'));
    }
    return;
  }

  const drawer = view.players.find((p) => p.id === current.drawnBy);
  area.replaceChildren(
    renderCard(current.card, { big: true, onClick: () => handlers.onShowCard(current.card) }),
    text('div', current.card.title, 'card-title'),
  );
  // Only pack 1 was transcribed; the cards3.1 set prints its rule on the art,
  // so there is nothing to set under the card and the tap-to-read prompt goes
  // there instead of an empty paragraph.
  area.append(
    current.card.text
      ? text('p', current.card.text, 'card-text')
      : text('p', 'Tap the card to read it', 'card-text card-text-hint'),
  );

  /*
   * On a phone this says who you are waiting for. On the shared screen the
   * answer is "you, on the telly in front of you", so it would be telling
   * the room to wait for itself.
   */
  if (!view.screen && !view.legalActions.some((a) => a.type === 'outcome')) {
    area.append(text('p', `${drawer?.name ?? 'Someone'} is resolving this one.`, 'table-prompt'));
  }
}

/**
 * The buttons live in the dock, not under the card. On a short phone the card
 * art plus its text is taller than the screen, and buttons in the flow ended up
 * behind the hand — so whatever you have to press is pinned instead.
 */
function renderDockActions(view, handlers) {
  const dock = $('dock-actions');
  const outcomes = view.legalActions.filter((a) => a.type === 'outcome');

  if (view.current && outcomes.length) {
    dock.replaceChildren(
      ...outcomes.map((action) =>
        button(relabel(action, view.settings?.measure),
          () => handlers.onOutcome(action), 'btn btn-gold'),
      ),
      button('Next player', () => handlers.onAct({ type: 'endTurn' })),
    );
    return;
  }

  if (!view.current && view.legalActions.some((a) => a.type === 'draw')) {
    dock.replaceChildren(
      button('Draw a Mini Game', () => handlers.onAct({ type: 'draw' }), 'btn btn-primary'),
    );
    return;
  }

  /*
   * Waiting on somebody else. The dock would otherwise be empty, which is
   * exactly the moment a table gets stuck — so it holds the way out instead,
   * quietly, below whatever the screen is already saying.
   */
  const out = view.legalActions.find((a) => a.type === 'unstick');
  if (out) {
    dock.replaceChildren(button(out.label, () => handlers.onAct({ type: 'unstick' }), 'btn btn-quiet'));
    return;
  }
  dock.replaceChildren();
}

/**
 * Keep --dock-h in step with however tall the dock actually is, so the page
 * below always has room to scroll clear of it. The dock grows and shrinks as
 * buttons come and go, so a fixed guess would be wrong half the time.
 */
export function watchDock() {
  const dock = document.getElementById('dock');
  if (!dock || typeof ResizeObserver === 'undefined') return;
  const apply = () => {
    const height = Math.round(dock.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--dock-h', `${height}px`);
  };
  new ResizeObserver(apply).observe(dock);
  apply();
}

function renderPlayers(view, handlers) {
  const now = hostNow();
  $('players-strip').replaceChildren(
    // A screen runs the table; it has no cards and no tally, so showing it
    // among the players is just a permanent clean sheet at the top.
    ...view.players.filter((p) => !p.screen).map((player) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'player-chip';
      if (player.id === view.turn) el.classList.add('is-turn');
      if (!player.connected) el.classList.add('is-offline');

      el.append(text('span', player.name + (player.id === view.you?.id ? ' (you)' : ''), 'n'));
      if (player.wrestler) el.append(text('span', player.wrestler, 'w'));
      // A seat with no phone holds no cards, so "0 cards" is just noise on
      // the one screen where every seat is like that.
      const tally = tallyText(player, view.settings?.measure);
      el.append(text('span', player.local ? tally : `${player.handCount ?? 0} cards · ${tally}`, 's'));

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

export function tallyText(player, measure = 'seconds') {
  const bits = [];
  if (player.seconds) {
    bits.push(measure === 'sips' ? `${sips(player.seconds)} sips` : `${player.seconds}s`);
  }
  if (player.downs) bits.push(`${player.downs} down${player.downs === 1 ? '' : 's'}`);
  if (player.shots) bits.push(`${player.shots} shot${player.shots === 1 ? '' : 's'}`);
  return bits.join(' · ') || 'clean sheet';
}

function renderHand(view, handlers) {
  const hand = view.screen ? [] : (view.you?.hand ?? []);
  const section = document.getElementById('hand-section');
  if (section) section.hidden = view.screen && !hand.length;
  $('hand-count').textContent = view.canSwap
    ? `(${hand.length}) · tap one to play or swap`
    : hand.length ? `(${hand.length})` : '';
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

/**
 * A card, full screen and readable.
 *
 * The art is 380px wide at source with the rules printed small on it, so at
 * hand size it is something you recognise, not something you read. Tapping any
 * card lands here: art as big as the screen allows, the same words set as real
 * text underneath, and whatever you can do with it docked at the bottom.
 */
export function openFocus(card, actions = [], { onPick, measure = 'seconds' } = {}) {
  const box = document.getElementById('focus');
  if (!box) return;

  document.getElementById('focus-art').src = card.image;
  document.getElementById('focus-art').alt = card.title;
  document.getElementById('focus-kind').textContent = `${kindLabel(card.kind)} ${card.n}`;
  document.getElementById('focus-title').textContent = card.title;
  const body = document.getElementById('focus-text');
  body.textContent = card.text || '';
  body.hidden = !card.text;

  document.getElementById('focus-actions').replaceChildren(
    ...actions.map((action) => {
      // Playing a card is the headline; binning it is the quiet option.
      const style = action.type === 'swapCard' ? 'btn' : 'btn btn-gold';
      return button(relabel(action, measure), () => {
        closeFocus();
        onPick?.(action);
      }, style);
    }),
  );

  // The view wires its own close button rather than relying on the caller,
  // so it behaves the same everywhere it is opened from.
  const close = document.getElementById('focus-close');
  if (close) close.onclick = closeFocus;

  box.hidden = false;
  box.querySelector('.focus-scroll').scrollTop = 0;
}

export function closeFocus() {
  const box = document.getElementById('focus');
  if (box) box.hidden = true;
}

export function focusIsOpen() {
  return !document.getElementById('focus')?.hidden;
}

/** "drinks 5s" reads as "drinks 3 sips" when the table is on spirits. */
export function relabel(action, measure) {
  if (measure !== 'sips') return action.label;
  return String(action.label).replace(/(\d+)\s*s\b/g, (_, n) => `${sips(Number(n))} sips`);
}

export function sips(seconds) {
  return Math.max(1, Math.round((seconds || 0) / 2));
}

/**
 * Pick one or more players. `needs` is 1 for a single pick and -1 for any
 * number; the confirm button stays disabled until the selection is valid.
 */
export function pickerSheet(
  { title, hint, players, needs = 1, confirmLabel = 'Confirm', preselected = [] },
  onDone,
) {
  return (root, close) => {
    root.append(text('h2', title, 'sheet-title'));
    if (hint) root.append(text('p', hint, 'sheet-text'));

    // Event Cards open with whoever the card names already ticked, so the
    // common case is one tap on the confirm button.
    const chosen = new Set(preselected.filter((id) => players.some((p) => p.id === id)));
    const list = document.createElement('div');
    list.className = 'pick-list';

    const confirm = button(confirmLabel, () => {
      close();
      onDone([...chosen]);
    }, 'btn btn-primary');
    confirm.disabled = chosen.size === 0;

    for (const player of players) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick';
      row.append(text('span', player.name));
      row.append(text('span', player.wrestler || tallyText(player), 'sub'));
      if (chosen.has(player.id)) row.classList.add('is-picked');

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

/**
 * Name the card, or take it.
 *
 * The box completes against every Event Card title — the pack's contents are
 * public, only the holder's hand is secret — so this is a memory game, not a
 * lucky dip. A blank guess just takes it.
 */
export function counterSheet({ byName, stake, kind, measure = 'seconds', onGuess, onAccept }) {
  return (root, close) => {
    root.append(text('h2', 'Name the card', 'sheet-title'));
    /*
     * The type of the card is given away on purpose. There are 156 cards you
     * can be holding (172 on a Money in the Bank night) and a blind guess
     * against that many is a lottery, not a read — so the counter is narrowed
     * to one kind, which is what makes it a judgement about the player rather
     * than luck.
     */
    root.append(
      text('p',
        kind
          ? `${byName} played a ${kindLabel(kind)} at you. Name it and it lands on them instead.`
          : `${byName} played something at you. Name it and it lands on them instead.`,
        'sheet-text'),
    );

    // The whole point of the risk is being able to weigh it up before you try.
    const botched = botchText(stake, measure);
    const odds = document.createElement('div');
    odds.className = 'stake';
    odds.append(text('div', stakeText(stake, measure), 'stake-amount'));
    odds.append(
      text('div',
        botched ? `at stake — botch it and you drink ${botched}` : 'at stake',
        'stake-note'),
    );
    root.append(odds);

    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('list', 'event-card-list');
    input.placeholder = 'Start typing a card name…';
    input.autocomplete = 'off';
    root.append(input);

    const box = document.createElement('div');
    box.className = 'sheet-actions';

    const send = () => {
      const guess = input.value.trim();
      if (!guess) return;
      close();
      onGuess(guess);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') send();
    });

    box.append(button('Call it', send, 'btn btn-gold'));
    box.append(button(`Just take it (${stakeText(stake, measure)})`, () => {
      close();
      onAccept();
    }));
    root.append(box);
    setTimeout(() => input.focus(), 60);
  };
}

/** Fill the datalist the guess box completes against. */
export function fillCardList(options) {
  const list = document.getElementById('event-card-list');
  if (!list) return;
  list.replaceChildren(
    ...options.map(({ title, text: body }) => {
      const option = document.createElement('option');
      option.value = title;
      option.label = body;
      return option;
    }),
  );
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
      li.append(who, text('span', tallyText(player, view.settings?.measure), 'amount'));
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

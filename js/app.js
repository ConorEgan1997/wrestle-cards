/**
 * Wiring: screens, the URL hash router, and the one `room` object that is
 * either a HostRoom or a ClientRoom. Everything below this line is identical
 * for both — that symmetry is deliberate, so a feature is never written twice.
 */

import { HostRoom, ClientRoom, myIdentity, rememberName } from './room.js';
import { normaliseCode } from './net.js';
import { DEFAULT_RULESET, loadDeck, deckLoaded, eventCardOptions } from './rules/index.js';
import {
  showScreen, renderLobby, renderGame, tickCountdowns, syncClock,
  drinkBatches, batchRemaining, watchDock,
  openSheet, closeSheet, sheetIsOpen, cardSheet, pickerSheet, tallySheet,
  counterSheet, fillCardList,
  toast, text, button,
} from './ui.js';

const $ = (id) => document.getElementById(id);

const WRESTLER_KEY = 'cardgame.wrestler';

let room = null;
let view = null;
let resultShown = false;

/* ---------------------------- bootstrapping --------------------------- */

function init() {
  const identity = myIdentity();
  if (identity.name) $('input-name').value = identity.name;
  $('input-wrestler').value = savedWrestler();

  $('btn-host').addEventListener('click', hostTable);
  $('form-join').addEventListener('submit', (event) => {
    event.preventDefault();
    joinTable($('input-code').value);
  });
  $('btn-copy').addEventListener('click', copyInvite);
  $('btn-ready').addEventListener('click', toggleReady);
  $('btn-start').addEventListener('click', () => room?.start());
  $('input-wrestler-lobby').addEventListener('change', (event) => {
    const name = event.target.value.trim();
    saveWrestler(name);
    room?.setProfile({ wrestler: name });
  });

  $('btn-tally').addEventListener('click', () => view && openSheet(tallySheet(view)));
  $('btn-menu').addEventListener('click', openMenu);
  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', (event) => {
    if (event.target === $('sheet')) closeSheet();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheetIsOpen()) closeSheet();
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', () => room?.close());

  // The countdowns need to move between state updates, so they get their own
  // light loop rather than re-rendering the whole screen ten times a second.
  setInterval(() => {
    tickCountdowns(view);
    autoFinishExpired();
  }, 100);

  watchDock();
  route();
}

/** #/join/ABCD prefills the code so an invite link is one tap to join. */
function route() {
  const match = window.location.hash.match(/^#\/join\/([A-Za-z0-9]+)/);
  if (match && !room) {
    $('input-code').value = normaliseCode(match[1]);
    $('input-name').focus();
  }
}

/* ------------------------------- joining ------------------------------ */

function playerName() {
  const name = $('input-name').value.trim();
  if (name) rememberName(name);
  return name || 'Player';
}

function savedWrestler() {
  try {
    return localStorage.getItem(WRESTLER_KEY) || '';
  } catch {
    return '';
  }
}

function saveWrestler(name) {
  try {
    localStorage.setItem(WRESTLER_KEY, name);
  } catch {
    /* storage disabled — the wrestler just won't be remembered next time */
  }
}

/**
 * The host needs the deck to run the game; everyone needs it for the guess
 * box to complete against. The pack's contents are public — only who holds
 * what is secret — so every client loads it.
 */
async function ensureDeck() {
  if (!deckLoaded()) await loadDeck();
  fillCardList(eventCardOptions());
}

async function hostTable() {
  const button = $('btn-host');
  button.disabled = true;
  button.textContent = 'Opening the table…';
  try {
    await ensureDeck();

    room = new HostRoom({
      rulesetId: DEFAULT_RULESET,
      onUpdate: onView,
      onError: (msg) => toast(msg, { error: true }),
    });
    room.onChat = ({ from, text: body }) => toast(`${from}: ${body}`);

    const code = await room.open(playerName());
    room.setProfile({ wrestler: enteredWrestler() });
    window.location.hash = `#/join/${code}`;
    showScreen('lobby');
  } catch (err) {
    room = null;
    toast(err.message, { error: true });
  } finally {
    button.disabled = false;
    button.textContent = 'Start a table';
  }
}

async function joinTable(rawCode) {
  const code = normaliseCode(rawCode);
  if (code.length < 4) return toast('That room code looks too short', { error: true });

  const button = $('btn-join');
  button.disabled = true;
  button.textContent = 'Joining…';
  try {
    await ensureDeck();

    room = new ClientRoom({
      onUpdate: onView,
      onError: (msg) => toast(msg, { error: true }),
      onClosed: leaveRoom,
      onChat: ({ from, text: body }) => toast(`${from}: ${body}`),
    });
    await room.join(code, playerName());
    room.setProfile({ wrestler: enteredWrestler() });
    showScreen('lobby');
  } catch (err) {
    room = null;
    toast(err.message, { error: true });
  } finally {
    button.disabled = false;
    button.textContent = 'Join';
  }
}

function enteredWrestler() {
  const name = $('input-wrestler').value.trim();
  saveWrestler(name);
  return name;
}

function leaveRoom(reason) {
  if (reason) toast(reason, { error: true });
  room?.close();
  room = null;
  view = null;
  resultShown = false;
  finished.clear();
  closeSheet();
  window.location.hash = '';
  showScreen('home');
}

/* ------------------------------ view loop ----------------------------- */

/** Single entry point for state: every update from the host lands here. */
function onView(next) {
  view = next;
  syncClock(next.now);

  if (next.phase === 'lobby') {
    showScreen('lobby');
    if ($('input-wrestler-lobby').value !== (next.you?.wrestler ?? '')) {
      $('input-wrestler-lobby').value = next.you?.wrestler ?? '';
    }
    renderLobby(next, {
      code: room?.code,
      isHost: !!room?.isHost,
      canStart: !!room?.canStart(),
    });
    return;
  }

  showScreen('game');
  renderGame(next, {
    onAct: act,
    onOutcome: resolveOutcome,
    onShowCard: showCard,
    onShowPlayer: showPlayer,
  });

  if (next.vote) promptVote(next);
  if (next.pending?.youCanCounter) promptCounter(next);

  if (next.phase === 'over' && !resultShown) {
    resultShown = true;
    openSheet(finalSheet(next));
  }
}

function act(action) {
  room?.act(action);
}

/**
 * Close a countdown out the moment it hits zero, so nobody has to remember to
 * tap Done. Only the device that can actually run the clock sends it, and each
 * batch is only sent once — the host would reject a repeat, but there is no
 * sense firing a message per tick while the state update is in flight.
 */
const finished = new Set();

function autoFinishExpired() {
  if (!view?.orders?.length) return;
  for (const [batch, orders] of drinkBatches(view)) {
    if (finished.has(batch) || orders[0].down || orders[0].stopwatch) continue;
    const left = batchRemaining(orders);
    if (left === null || left > 0) continue;

    const canFinish = view.legalActions.some(
      (a) => a.type === 'finishBatch' && a.batch === batch,
    );
    if (!canFinish) continue;
    finished.add(batch);
    act({ type: 'finishBatch', batch });
  }
}

/* --------------------------- resolving cards -------------------------- */

/**
 * Turn an outcome button into an action.
 *
 * Event Cards always ask who it lands on — the holder decides, and the card's
 * printed target is only a suggestion, pre-ticked so accepting it is one tap.
 * Mini Game outcomes are different: "the person to your right drinks" is worked
 * out from the seating and isn't up for negotiation.
 */
function resolveOutcome(action) {
  const isEvent = action.type === 'playEvent';
  const needs = action.needs ?? 0;
  if (!isEvent && needs === 0) return act(action);

  const suggested = action.suggested ?? [];
  openSheet(
    pickerSheet(
      {
        title: 'Who does it hit?',
        hint: suggested.length
          ? `${action.label} — tap to change who it lands on.`
          : action.label,
        players: view.players.filter((p) => p.connected),
        needs: isEvent ? -1 : needs,
        preselected: suggested,
        confirmLabel: isEvent ? 'Play it' : 'Send it',
      },
      (targets) => act({ ...action, targets }),
    ),
  );
}

/** Tapping any card opens it full size, with whatever you can do with it. */
function showCard(card) {
  const actions = view.legalActions.filter(
    (a) => ((a.type === 'playEvent' || a.type === 'swapCard') && a.cardId === card.id) ||
           (a.type === 'outcome' && view.current?.card.id === card.id),
  );
  openSheet(
    cardSheet(card, actions, {
      onPick: (action) => {
        if (action.type === 'swapCard') return act(action);
        if (action.cardId === 'event-50') return promptHouseRule(action);
        resolveOutcome(action);
      },
    }),
  );
}

/** Tapping a player shows their Event Cards — they are public rules. */
function showPlayer(player) {
  openSheet((root) => {
    root.append(text('h2', player.name, 'sheet-title'));
    root.append(
      text('p', [player.wrestler, tallyLine(player)].filter(Boolean).join(' · '), 'sheet-text'),
    );

    root.append(
      text('p',
        player.id === view.you?.id
          ? `You are holding ${view.you.hand.length} cards.`
          : `Holding ${player.handCount ?? 0} cards — face down.`,
        'sheet-text'),
    );

    const box = document.createElement('div');
    box.className = 'sheet-actions';
    box.append(
      button('Give them a drink', () => {
        closeSheet();
        promptGive(player);
      }, 'btn btn-gold'),
    );
    root.append(box);
  });
}

function tallyLine(player) {
  const bits = [];
  if (player.seconds) bits.push(`${player.seconds}s`);
  if (player.downs) bits.push(`${player.downs} downed`);
  return bits.join(' · ');
}

/* ------------------------------- prompts ------------------------------ */

function promptGive(player) {
  openSheet((root, close) => {
    root.append(text('h2', `Give ${player.name} a drink`, 'sheet-title'));
    root.append(text('p', 'For the cards that just say "someone decides".', 'sheet-text'));

    const box = document.createElement('div');
    box.className = 'sheet-actions';
    for (const seconds of [3, 5, 10]) {
      box.append(
        button(`${seconds} seconds`, () => {
          close();
          act({ type: 'give', targets: [player.id], seconds, label: 'Handed out' });
        }, 'btn btn-gold'),
      );
    }
    box.append(
      button('Down their drink', () => {
        close();
        act({ type: 'give', targets: [player.id], down: true, label: 'Handed out' });
      }),
    );
    root.append(box);
  });
}

function promptHouseRule(action) {
  openSheet((root, close) => {
    root.append(text('h2', 'Your rule', 'sheet-title'));
    root.append(text('p', 'Everyone has to follow it for the rest of the night.', 'sheet-text'));

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 140;
    input.placeholder = 'No first names — ring names only';
    root.append(input);

    const box = document.createElement('div');
    box.className = 'sheet-actions';
    box.append(
      button('Make it law', () => {
        const rule = input.value.trim();
        close();
        act({ ...action, rule });
      }, 'btn btn-primary'),
    );
    root.append(box);
    setTimeout(() => input.focus(), 50);
  });
}

function promptVote(current) {
  if (sheetIsOpen()) return;
  if (!current.legalActions.some((a) => a.type === 'vote')) return;

  openSheet(
    pickerSheet(
      {
        title: 'Vote',
        hint: `${current.vote.cardTitle} — who drinks?`,
        players: current.players.filter((p) => p.connected),
        needs: 1,
      },
      (targets) => act({ type: 'vote', targets }),
    ),
  );
}

/**
 * A card has been played at you. Opened automatically, because the game is
 * waiting on your answer and nobody should have to hunt for a button.
 */
function promptCounter(current) {
  if (sheetIsOpen()) return;
  openSheet(
    counterSheet({
      byName: current.pending.byName,
      stake: current.pending.stake,
      onGuess: (guess) => act({ type: 'guessCard', guessText: guess }),
      onAccept: () => act({ type: 'acceptCard' }),
    }),
  );
}

function openMenu() {
  openSheet((root, close) => {
    root.append(text('h2', 'More', 'sheet-title'));
    const box = document.createElement('div');
    box.className = 'sheet-actions';

    for (const action of view.legalActions) {
      if (action.type === 'revealCard') {
        box.append(button('Turn the card over', () => {
          close();
          act({ type: 'revealCard' });
        }, 'btn btn-gold'));
      }
      if (action.type === 'toggleTitleMatch') {
        box.append(button(action.label, () => {
          close();
          act({ type: 'toggleTitleMatch' });
        }, 'btn btn-gold'));
      }
      if (action.type === 'endGame') {
        box.append(button('End the night', () => {
          close();
          act({ type: 'endGame' });
        }));
      }
    }

    box.append(button('Leave the table', () => {
      close();
      leaveRoom();
    }));
    root.append(box);
  });
}

function finalSheet(final) {
  return (root) => {
    root.append(text('h2', 'That is a wrap', 'sheet-title'));
    root.append(text('p', 'Final tally, worst first.', 'sheet-text'));

    const list = document.createElement('ul');
    list.className = 'tally';
    for (const score of final.result.scores) {
      const li = document.createElement('li');
      const who = document.createElement('div');
      who.append(text('div', score.name));
      if (score.wrestler) who.append(text('div', score.wrestler, 'sub'));
      const bits = [`${score.seconds}s`];
      if (score.downs) bits.push(`${score.downs} downed`);
      li.append(who, text('span', bits.join(' · '), 'amount'));
      list.append(li);
    }
    root.append(list);
  };
}

/* ------------------------------ lobby bits ---------------------------- */

function toggleReady() {
  const you = view?.players.find((p) => p.id === view.you?.id);
  room?.setReady(!you?.ready);
}

async function copyInvite() {
  const url = room?.inviteUrl || window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast('Invite link copied');
  } catch {
    // Clipboard access is blocked in some contexts; showing the link still helps.
    toast(url);
  }
}

init();

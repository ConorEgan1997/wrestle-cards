/**
 * Wiring: screens, the URL hash router, and the one `room` object that is
 * either a HostRoom or a ClientRoom. Everything below this line is identical
 * for both — that symmetry is deliberate, so a feature is never written twice.
 */

import { HostRoom, ClientRoom, myIdentity, rememberName } from './room.js';
import { normaliseCode } from './net.js';
import { DEFAULT_RULESET, loadDeck, deckLoaded } from './rules/index.js';
import {
  showScreen, renderLobby, renderGame, tickCountdowns, syncClock,
  openSheet, closeSheet, sheetIsOpen, cardSheet, pickerSheet, tallySheet,
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
  setInterval(() => tickCountdowns(view), 100);

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

async function hostTable() {
  const button = $('btn-host');
  button.disabled = true;
  button.textContent = 'Opening the table…';
  try {
    // Only the host runs the engine, so only the host needs the deck data.
    if (!deckLoaded()) await loadDeck();

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

  if (next.phase === 'over' && !resultShown) {
    resultShown = true;
    openSheet(finalSheet(next));
  }
}

function act(action) {
  room?.act(action);
}

/* --------------------------- resolving cards -------------------------- */

/**
 * Turn an outcome button into an action. Outcomes that land on a named player
 * ('choose'/'many') open the picker first; everything else the host can work
 * out on its own from the seating.
 */
function resolveOutcome(action) {
  const needs = action.needs ?? 0;
  if (needs === 0) return act(action);

  openSheet(
    pickerSheet(
      {
        title: needs === 1 ? 'Who?' : 'Who? (pick any number)',
        hint: action.label,
        players: view.players.filter((p) => p.connected),
        needs,
        confirmLabel: 'Send it',
      },
      (targets) => act({ ...action, targets }),
    ),
  );
}

/** Tapping any card opens it full size, with whatever you can do with it. */
function showCard(card) {
  const actions = view.legalActions.filter(
    (a) => (a.type === 'playEvent' && a.cardId === card.id) ||
           (a.type === 'outcome' && view.current?.card.id === card.id),
  );
  openSheet(
    cardSheet(card, actions, {
      onPick: (action) => {
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

    if (!player.hand?.length) {
      root.append(text('p', 'No Event Cards.', 'sheet-text'));
    } else {
      const strip = document.createElement('div');
      strip.className = 'hand';
      for (const card of player.hand) {
        strip.append(cardThumb(card));
      }
      root.append(strip);
    }

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

function cardThumb(card) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card';
  const img = document.createElement('img');
  img.src = card.image;
  img.alt = card.title;
  img.loading = 'lazy';
  el.append(img);
  el.addEventListener('click', () => showCard(card));
  return el;
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

function openMenu() {
  openSheet((root, close) => {
    root.append(text('h2', 'More', 'sheet-title'));
    const box = document.createElement('div');
    box.className = 'sheet-actions';

    for (const action of view.legalActions) {
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

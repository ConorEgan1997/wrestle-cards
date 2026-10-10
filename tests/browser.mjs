/**
 * Browser smoke test. Serves the site, then:
 *   1. runs tests/harness.html — a full 3-player game through the real modules
 *   2. checks index.html loads clean and the lobby flow behaves
 *
 * Run with `npm run test:browser` (needs playwright available).
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8099;
const BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ['tools/dev-server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch();
try {
  /* ---------------- 1. full game through the real modules --------------- */
  const harness = await browser.newPage();
  const harnessErrors = [];
  harness.on('pageerror', (err) => harnessErrors.push(err.message));

  await harness.goto(`${BASE}/tests/harness.html`);

  /*
   * A broken import anywhere in the module graph stops the harness before it
   * can report anything. Catch that rather than dying on a bare timeout — the
   * page errors below are what actually tell you what went wrong, and the
   * checks against the real page still get to run.
   */
  let harnessRan = true;
  try {
    await harness.waitForFunction(() => window.__harness, null, { timeout: 20000 });
  } catch {
    harnessRan = false;
    record('harness: finished at all', false, harnessErrors.join('; ') || 'timed out with no error');
  }

  if (harnessRan) {
    const outcome = await harness.evaluate(() => window.__harness);
    for (const check of outcome.checks) record(`harness: ${check.name}`, check.pass, check.detail);
    record('harness: no uncaught errors', harnessErrors.length === 0, harnessErrors.join('; '));
  }

  /* -------------------- 1e. the card focus view -------------------------- */
  if (harnessRan) {
    /*
     * Opened on a card from each pack. The first pack was transcribed, so its
     * rules must be real text under the art; the cards3.1 set never was, and
     * for those the text block has to get out of the way rather than sit there
     * empty. Both are opened by id, because picking whatever happened to be
     * dealt made this check depend on the shuffle.
     */
    const look = async (id) => harness.evaluate(async (id) => {
      const deck = await (await fetch('/cards/deck.json')).json();
      const card = deck.find((c) => c.id === id);
      window.__openFocus(card, [{ type: 'swapCard', cardId: card.id, label: 'Bin it' }], {});
      await new Promise((r) => setTimeout(r, 60));

      const box = document.getElementById('focus');
      const art = document.getElementById('focus-art');
      const body = document.getElementById('focus-text');
      return {
        open: !box.hidden,
        src: art.getAttribute('src'),
        title: document.getElementById('focus-title').textContent,
        kind: document.getElementById('focus-kind').textContent,
        text: body.textContent,
        textShown: !body.hidden,
        artWidth: Math.round(art.getBoundingClientRect().width),
        artHeight: Math.round(art.getBoundingClientRect().height),
        viewport: window.innerWidth,
        fontSize: parseFloat(getComputedStyle(body).fontSize),
        actions: document.querySelectorAll('#focus-actions .btn').length,
      };
    }, id);

    const focus = await look('event-24');
    record('harness: tapping a card opens it full screen', focus.open);
    record('harness: with its own art', /cards\/[a-z]+-\d+\.webp/.test(focus.src), focus.src);
    record('harness: its rules are real text, not just pixels', focus.text.length > 20, focus.title);
    record('harness: and it says what kind of card it is', /Event Card/.test(focus.kind), focus.kind);
    record(
      'harness: the art fills the width',
      focus.artWidth >= Math.min(380, focus.viewport * 0.85),
      `${focus.artWidth}px of ${focus.viewport}px`,
    );
    record('harness: at a readable size', focus.fontSize >= 16, `${focus.fontSize}px`);
    record('harness: with its actions docked', focus.actions === 1);
    await harness.click('#focus-close');

    // A squat card from the second pack: the art must not be squeezed into the
    // first pack's shape, and the empty text block must not leave a gap.
    const squat = await look('mg-421');
    record('harness: a second-pack card opens too', squat.open);
    record('harness: labelled as its own kind', /Mini Game/.test(squat.kind), squat.kind);
    record('harness: with no empty text block under it', !squat.textShown);
    record(
      'harness: and its own proportions, not pack 1\'s',
      Math.abs(squat.artHeight / squat.artWidth - 728 / 400) < 0.08,
      `${squat.artWidth}x${squat.artHeight}`,
    );

    await harness.click('#focus-close');
    record('harness: and it closes', !(await harness.isVisible('#focus')));
  }

  /* ------------- 1f. the table can always be unstuck ------------------- */
  if (harnessRan) {
    /*
     * The harness renders Ann's screen. Put the turn on somebody else and
     * leave them doing nothing — the state that used to leave Ann with an
     * empty dock and no way to move the night on.
     */
    const stalled = await harness.evaluate(async () => {
      const host = window.__host;
      host.engine.state.turn = window.__guests[0].room.playerId; // Bob's turn
      host.engine.state.vars.stage = 'draw';
      host.engine.state.vars.current = null;
      window.__render();
      await new Promise((r) => setTimeout(r, 60));
      const btn = document.querySelector('#dock-actions .btn');
      return { label: btn?.textContent ?? null, turn: host.engine.state.turn };
    });
    record('harness: a stalled table still has a button', !!stalled.label, stalled.label);
    record('harness: which says whose turn it is skipping', /Skip /.test(stalled.label || ''),
      stalled.label);

    await harness.click('#dock-actions .btn');
    await harness.waitForTimeout(150);
    const moved = await harness.evaluate(() => window.__host.engine.state.turn);
    record('harness: and pressing it moves play on', moved !== stalled.turn, moved);
  }

  /* ---------------- 1c. countering a card, through the UI ---------------- */
  if (harnessRan) {
  // Bob plays a card at Ann (the host, whose screen the harness renders).
  const played = await harness.evaluate(() => {
    const bob = window.__guests[0].room;
    const host = window.__host;
    const card = host.engine.getPlayer(bob.playerId).hand[0];
    bob.act({ type: 'playEvent', cardId: card.id, index: 0, targets: [host.playerId] });
    return card.id;
  });
  await harness.waitForTimeout(200);

  record('harness: a face-down card is announced', await harness.isVisible('#pending .pending-banner'));
  record(
    'harness: the card itself is not in the page',
    !(await harness.content()).includes(`cards/${played}.webp`),
    played,
  );

  // A wrong guess, typed the way a player would.
  await harness.evaluate(() => {
    window.__host.act({ type: 'guessCard', guessText: 'not a real card' });
  });
  await harness.waitForTimeout(250);
  record('harness: a wrong guess resolves the card', await harness.isVisible('#flash'));
  record(
    'harness: the reveal shows the card art',
    (await harness.getAttribute('#flash-art', 'src')) === `cards/${played}.webp`,
  );
  record(
    'harness: and it landed on the player it was aimed at',
    await harness.evaluate((id) => {
      const host = window.__host;
      const order = host.engine.state.vars.orders.at(-1);
      return !order || order.playerId === host.playerId;
    }, played),
  );

  // Now a correct guess: it should turn back on whoever played it.
  const countered = await harness.evaluate(async () => {
    const host = window.__host;
    const bob = window.__guests[0].room;
    for (const o of [...host.engine.state.vars.orders]) host.act({ type: 'finishBatch', batch: o.batch });
    const card = host.engine.getPlayer(bob.playerId).hand[0];
    bob.act({ type: 'playEvent', cardId: card.id, index: 0, targets: [host.playerId] });
    await new Promise((r) => setTimeout(r, 30));
    host.act({ type: 'guessCard', guessId: card.id });
    await new Promise((r) => setTimeout(r, 30));
    return {
      counteredBy: host.engine.state.vars.lastPlay.counteredBy,
      landedOn: host.engine.state.vars.orders.at(-1)?.playerId ?? null,
      bobId: bob.playerId,
    };
  });
  await harness.waitForTimeout(200);
  record('harness: calling it right is recorded', !!countered.counteredBy, countered.counteredBy);
  record(
    'harness: and the drink goes back on the player who played it',
    countered.landedOn === null || countered.landedOn === countered.bobId,
  );
  record(
    'harness: the reveal says who called it',
    (await harness.textContent('#flash-result')).includes('called it'),
  );

  // Clear the decks before the later checks.
  await harness.evaluate(() => {
    const host = window.__host;
    for (const o of [...host.engine.state.vars.orders]) host.act({ type: 'finishBatch', batch: o.batch });
    host.engine.state.vars.lastPlay = null;
  });
  await harness.waitForTimeout(150);

  /* ------------------ 1d. the stake, the botch and the swap -------------- */
  const stake = await harness.evaluate(async () => {
    const host = window.__host;
    const bob = window.__guests[0].room;
    const card = host.engine.getPlayer(bob.playerId).hand[0];
    bob.act({ type: 'playEvent', cardId: card.id, index: 0, targets: [host.playerId] });
    await new Promise((r) => setTimeout(r, 30));
    return host.engine.viewFor(host.playerId).pending.stake;
  });
  await harness.waitForTimeout(200);
  record(
    'harness: the stake is shown while the card is face down',
    (await harness.textContent('#pending')).includes('at stake'),
    `${stake.seconds ?? 'down'}`,
  );

  // Botch it deliberately and check the doubling reaches the screen.
  const botch = await harness.evaluate(async () => {
    const host = window.__host;
    const base = host.engine.viewFor(host.playerId).pending.stake.seconds;
    host.act({ type: 'guessCard', guessText: 'definitely not the card' });
    await new Promise((r) => setTimeout(r, 30));
    const order = host.engine.state.vars.orders.at(-1);
    return { base, got: order?.seconds ?? null, down: !!order?.down };
  });
  await harness.waitForTimeout(250);
  record(
    'harness: a botched counter doubles the drink',
    botch.down || botch.base === null || botch.got === botch.base * 2,
    `${botch.base} -> ${botch.got}`,
  );
  record(
    'harness: and the reveal says it was botched',
    botch.down || (await harness.textContent('#flash-result')).toLowerCase().includes('botched'),
  );

  await harness.evaluate(() => {
    const host = window.__host;
    for (const o of [...host.engine.state.vars.orders]) host.act({ type: 'finishBatch', batch: o.batch });
    host.engine.state.vars.lastPlay = null;
  });
  await harness.waitForTimeout(150);

  // The swap: once per turn, costs a sip.
  const swap = await harness.evaluate(async () => {
    const host = window.__host;
    host.engine.state.turn = host.playerId;
    host.engine.state.vars.swappedThisTurn = false;
    const before = host.engine.getPlayer(host.playerId).hand.map((c) => c.id);
    host.act({ type: 'swapCard', cardId: before[0] });
    await new Promise((r) => setTimeout(r, 30));
    const after = host.engine.getPlayer(host.playerId).hand.map((c) => c.id);
    return {
      gone: !after.includes(before[0]),
      size: after.length,
      sip: host.engine.state.vars.orders.at(-1)?.seconds ?? null,
      offeredAgain: host.engine.legalActions(host.playerId).some((a) => a.type === 'swapCard'),
    };
  });
  record('harness: swapping bins the card and refills the hand', swap.gone && swap.size === 4);
  record('harness: and costs a 3 second sip', swap.sip === 3, `${swap.sip}s`);
  record('harness: only once a turn', !swap.offeredAgain);

  await harness.evaluate(() => {
    const host = window.__host;
    for (const o of [...host.engine.state.vars.orders]) host.act({ type: 'finishBatch', batch: o.batch });
  });
  await harness.waitForTimeout(150);

  /* ------------- 1a. the dock keeps the buttons out of the hand ---------- */
  // Put a card in play as the host so the outcome buttons appear.
  await harness.evaluate(() => {
    const host = window.__host;
    host.engine.state.turn = host.playerId;
    host.act({ type: 'draw' });
  });
  await harness.waitForTimeout(250);
  const dock = await harness.evaluate(() => {
    const buttons = [...document.querySelectorAll('#dock-actions .btn')];
    const hand = document.querySelector('.hand').getBoundingClientRect();
    const last = buttons.at(-1)?.getBoundingClientRect();
    return {
      count: buttons.length,
      clearsHand: !!last && last.bottom <= hand.top + 1,
      onScreen: !!last && last.bottom <= window.innerHeight + 1 && last.top >= 0,
    };
  });
  record('harness: outcome buttons are docked', dock.count >= 2, `${dock.count} buttons`);
  record('harness: they sit above the hand, not behind it', dock.clearsHand);
  record('harness: and are on screen without scrolling', dock.onScreen);
  await harness.evaluate(() => window.__host.act({ type: 'endTurn' }));
  await harness.waitForTimeout(200);

  /* -------------------- 1b. the clock takes over the screen -------------- */
  // Ann deals a drink out to Bob and Cat — one play, so one shared countdown.
  // Anything still outstanding is cleared first, so this owns the clock.
  const clockBatch = await harness.evaluate(() => {
    const host = window.__host;
    for (const o of [...host.engine.state.vars.orders]) {
      host.act({ type: 'finishBatch', batch: o.batch });
    }
    const others = host.engine.state.players.filter((p) => p.id !== host.playerId);
    host.act({
      type: 'give',
      targets: others.map((p) => p.id),
      seconds: 20,
      label: 'Countdown check',
    });
    return host.engine.state.vars.orders.at(-1).batch;
  });
  record('harness: the clock covers the screen', await harness.isVisible('#timer'));
  record(
    'harness: one timer for the whole play, not one each',
    (await harness.locator('#timer-count').count()) === 1,
  );
  record(
    'harness: it names who is drinking',
    /Bob/.test(await harness.textContent('#timer-who')),
    await harness.textContent('#timer-who'),
  );
  record(
    'harness: the dealer gets the start button',
    (await harness.textContent('#timer-actions')).includes('Start'),
  );

  await harness.click('#timer-actions .btn');
  const first = await harness.textContent('#timer-count');
  await harness.waitForTimeout(1200);
  const second = await harness.textContent('#timer-count');
  record(
    'harness: the countdown counts down',
    Number(first) > Number(second) && Number(second) > 0,
    `${first} -> ${second}`,
  );

  // Finishing scores the time against everyone who was on that clock.
  const scored = await harness.evaluate((batch) => {
    const host = window.__host;
    const before = Object.fromEntries(host.engine.state.players.map((p) => [p.id, p.seconds]));
    host.act({ type: 'finishBatch', batch });
    return host.engine.state.players
      .filter((p) => p.id !== host.playerId)
      .map((p) => p.seconds - before[p.id]);
  }, clockBatch);
  record(
    'harness: finishing scores everyone on that clock',
    scored.every((s) => s >= 20),
    `+${scored.join('s, +')}s`,
  );
  record('harness: and the takeover clears', !(await harness.isVisible('#timer')));

  } // end of the harness-dependent checks

  /* ------------------------- 2. the real page --------------------------- */
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  /*
   * Stand in for PeerJS so the host flow can be clicked through without the
   * CDN or a real WebRTC connection.
   *
   * This exists because "Start a table" silently did nothing once: app.js
   * imported something js/rules/index.js didn't export yet, so the module
   * never loaded and no button on the page was wired up. Nothing here caught
   * it, because nothing here had ever clicked the button.
   */
  await page.addInitScript(() => {
    class FakeConnection {
      constructor() { this.open = true; }
      on() {} send() {} close() {}
    }
    window.Peer = class {
      constructor(id) {
        this.id = id || 'fake-peer';
        this.handlers = {};
        setTimeout(() => (this.handlers.open || []).forEach((fn) => fn(this.id)), 10);
      }
      on(event, fn) { (this.handlers[event] ||= []).push(fn); }
      once(event, fn) { this.on(event, fn); }
      connect() { return new FakeConnection(); }
      destroy() {} reconnect() {}
    };
  });

  await page.goto(BASE);
  record('app: home screen visible', await page.isVisible('#screen-home'));
  record('app: game screen hidden until play starts', !(await page.isVisible('#screen-game')));
  record('app: no uncaught errors on load', pageErrors.length === 0, pageErrors.join('; '));
  // Informational: some sandboxed/offline environments block the CDN. The app
  // only needs PeerJS at the moment someone hosts or joins, so everything else
  // here is still meaningful without it.
  const peerLoaded = await page.evaluate(() => typeof Peer !== 'undefined');
  console.log(`${peerLoaded ? 'PASS' : 'SKIP'}  app: peerjs loaded from the CDN`);
  record('app: wrestler field present', await page.isVisible('#input-wrestler'));
  record(
    'app: deck.json is served',
    (await page.evaluate(async () => (await fetch('cards/deck.json')).ok)),
  );
  record(
    'app: card art is served',
    (await page.evaluate(async () => (await fetch('cards/mini-01.webp')).ok)),
  );

  // An invite link prefills the code field.
  await page.goto(`${BASE}/#/join/WXYZ`);
  record('app: invite link prefills the code', (await page.inputValue('#input-code')) === 'WXYZ');

  // A too-short code is refused before any network call.
  await page.fill('#input-code', 'AB');
  await page.click('#btn-join');
  await page.waitForSelector('.toast', { timeout: 3000 });
  record(
    'app: short room code is rejected',
    (await page.textContent('.toast')).includes('too short'),
  );

  // Hosting a table: the whole path from the button to a room code.
  await page.goto(BASE);
  await page.fill('#input-name', 'Conor');
  await page.fill('#input-wrestler', 'Roman Reigns');
  await page.click('#btn-host');
  await page.waitForTimeout(900);

  record('app: starting a table opens the lobby', await page.isVisible('#screen-lobby'));
  record(
    'app: and issues a room code',
    /^[A-Z0-9]{4}$/.test((await page.textContent('#lobby-code')).trim()),
    (await page.textContent('#lobby-code')).trim(),
  );
  record(
    'app: the wrestler carried into the lobby',
    (await page.textContent('#lobby-players')).includes('Roman Reigns'),
  );
  record('app: no errors hosting', pageErrors.length === 0, pageErrors.join('; '));

  // Every module the page needs must actually resolve — a missing export
  // anywhere in the graph stops app.js dead and unwires every button.
  const modules = await page.evaluate(async () => {
    const paths = ['js/app.js', 'js/ui.js', 'js/room.js', 'js/net.js', 'js/engine.js',
                   'js/cards.js', 'js/rules/index.js', 'js/rules/wrestling.js'];
    const broken = [];
    for (const path of paths) {
      try { await import(`/${path}`); } catch (err) { broken.push(`${path}: ${err.message}`); }
    }
    return broken;
  });
  record('app: every module loads', modules.length === 0, modules.join(' | '));

  /* ----------------- one screen, no phones ------------------------- */

  /*
   * The whole local path through the real page: open the lobby, seat four
   * people, start, and play a turn — drawing and resolving as the seat whose
   * go it is, which is what the shared screen does for every action.
   */
  await page.goto(BASE);
  await page.click('#btn-local');
  await page.waitForTimeout(900);
  record('local: "Play on this screen" opens its own lobby', await page.isVisible('#screen-local'));

  for (const name of ['Conor', 'Jude', 'Rouse', 'Papi']) {
    await page.fill('#input-seat', name);
    await page.click('#btn-add-seat');
  }
  await page.waitForTimeout(200);
  const seats = await page.$$eval('.seat-name', (els) => els.map((e) => e.textContent));
  record('local: seats are added in the order they are typed',
    seats.join(',') === 'Conor,Jude,Rouse,Papi', seats.join(','));
  record('local: and the options panel is there to set',
    (await page.$$('#local-settings .setting')).length === 6);

  // Removing one takes it out and leaves the order alone.
  await page.click('.seat:nth-child(2) .btn-tiny');
  await page.waitForTimeout(200);
  const afterRemove = await page.$$eval('.seat-name', (els) => els.map((e) => e.textContent));
  record('local: a seat can be removed', afterRemove.join(',') === 'Conor,Rouse,Papi',
    afterRemove.join(','));

  await page.fill('#input-seat', 'Jude');
  await page.click('#btn-add-seat');
  await page.click('#btn-local-start');
  await page.waitForTimeout(600);

  record('local: starting goes straight to the game', await page.isVisible('#screen-game'));

  const table = await page.evaluate(() => {
    const host = window.__room;
    const state = host.engine.state;
    return {
      phase: state.phase,
      seated: state.players.filter((p) => !p.screen).map((p) => p.name),
      screenPlays: state.players.some((p) => p.screen && state.turn === p.id),
      hands: state.players.map((p) => p.hand.length),
      deck: state.deck.length,
      turn: state.players.find((p) => p.id === state.turn)?.name,
    };
  });
  record('local: four players seated, the screen not among them',
    table.seated.join(',') === 'Conor,Rouse,Papi,Jude', table.seated.join(','));
  record('local: the screen never takes a turn', !table.screenPlays);
  record('local: nobody holds cards', table.hands.every((n) => n === 0));
  record('local: the full Mini Game pile is in play', table.deck === 430, table.deck);
  record('local: and it is somebody\'s go', !!table.turn, table.turn);

  const played = await page.evaluate(async () => {
    const host = window.__room;
    const seat = host.engine.state.turn;
    host.actAs(seat, { type: 'draw' });
    await new Promise((r) => setTimeout(r, 60));
    const outcome = host.engine.legalActions(seat).find((a) => a.type === 'outcome');
    const others = host.engine.state.players.filter((p) => !p.screen && p.id !== seat);
    host.actAs(seat, {
      type: 'outcome',
      index: outcome.index,
      targets: outcome.needs === 0 ? undefined : [others[0].id],
    });
    await new Promise((r) => setTimeout(r, 60));
    return {
      drew: !!host.engine.state.vars.current,
      deck: host.engine.state.deck.length,
      orders: host.engine.state.vars.orders.length,
    };
  });
  record('local: the screen draws for whoever is up', played.drew);
  record('local: off the shared pile', played.deck === 429, played.deck);
  record('local: and hands out the drink', played.orders > 0, `${played.orders} orders`);
  record('local: no errors playing from one screen', pageErrors.length === 0, pageErrors.join('; '));

  /*
   * And it has to be readable from the other side of a room. At TV shape the
   * whole game must sit in one screenful — nobody scrolls a television — with
   * the card beside its rule rather than marooned in the middle.
   */
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  const tv = await page.evaluate(() => {
    const body = document.body;
    const card = document.querySelector('#table-area .card-big');
    const title = document.querySelector('#table-area .card-title');
    const strip = document.querySelector('#players-strip');
    const r = (el) => el?.getBoundingClientRect();
    return {
      flagged: body.classList.contains('is-screen'),
      scrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      handShown: !document.getElementById('hand-section').hidden,
      screenInStrip: strip.textContent.includes('The screen'),
      seats: strip.children.length,
      card: r(card) && { h: Math.round(r(card).height), bottom: Math.round(r(card).bottom) },
      titleLeftOfCard: r(title) && r(card) ? r(title).left > r(card).right - 2 : null,
      titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
      vh: window.innerHeight,
    };
  });
  record('screen: the layout knows it is a screen', tv.flagged);
  record('screen: the whole game fits one screenful', !tv.scrolls);
  record('screen: no hand strip — this device holds no cards', !tv.handShown);
  record('screen: the screen is not listed as a player',
    !tv.screenInStrip && tv.seats === 4, `${tv.seats} seats`);
  record('screen: the card is sized to the room', tv.card.h > 240, `${tv.card.h}px tall`);
  record('screen: and stays inside the viewport', tv.card.bottom <= tv.vh, `${tv.card.bottom} of ${tv.vh}`);
  record('screen: the rule is set beside the card, not under it', tv.titleLeftOfCard === true);
  record('screen: at a size that reads across a room', tv.titleSize >= 30, `${tv.titleSize}px`);

  // Back to a phone-ish viewport so the later checks are unaffected.
  await page.setViewportSize({ width: 1280, height: 800 });

  // Mobile width must not produce a horizontal scrollbar.
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(BASE);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  record('app: no horizontal overflow at 390px', !overflows);
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

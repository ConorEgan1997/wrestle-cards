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
  await harness.waitForFunction(() => window.__harness, null, { timeout: 20000 });
  const outcome = await harness.evaluate(() => window.__harness);
  for (const check of outcome.checks) record(`harness: ${check.name}`, check.pass, check.detail);
  record('harness: no uncaught errors', harnessErrors.length === 0, harnessErrors.join('; '));

  /* ------------------- 1b. the drink countdown actually runs ------------- */
  await harness.evaluate(() => {
    const host = window.__host;
    host.act({ type: 'give', targets: [host.playerId], seconds: 20, label: 'Countdown check' });
    const mine = host.engine.state.vars.orders.find((o) => o.playerId === host.playerId);
    host.act({ type: 'startOrder', orderId: mine.id });
  });
  const first = await harness.textContent('.countdown[data-order]');
  await harness.waitForTimeout(1200);
  const second = await harness.textContent('.countdown[data-order]');
  record(
    'harness: the countdown counts down',
    Number(first) > Number(second) && Number(second) > 0,
    `${first} -> ${second}`,
  );

  // Finishing it scores the time against the drinker.
  const scored = await harness.evaluate(() => {
    const host = window.__host;
    const mine = host.engine.state.vars.orders.find((o) => o.playerId === host.playerId);
    host.act({ type: 'finishOrder', orderId: mine.id });
    return host.engine.getPlayer(host.playerId).seconds;
  });
  record('harness: finishing a drink adds to the tally', scored >= 20, `${scored}s`);

  /* ------------------------- 2. the real page --------------------------- */
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

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

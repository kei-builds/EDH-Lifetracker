// The verification session: a fresh Chrome context at phone size, the app served from this checkout, Scryfall stubbed,
// and an evidence folder that outlives the run. Journeys receive { page, app, evidence, assert } and throw to fail.
import { chromium } from 'playwright-core';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { serve } from './server.mjs';

export { assert };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(HERE, '..');
export const REPO_DIR = path.resolve(SKILL_DIR, '../../..');
export const APP_DIR = path.join(REPO_DIR, 'life-tracker');
export const EVIDENCE_DIR = path.join(SKILL_DIR, 'evidence');
export const RUN_DIR = path.join(HERE, '.run');
export const STORE_KEY = 'edhLife.v2';
export const CHROME_CHANNELS = ['chrome', 'msedge'];

// The target screen is a Samsung S25 class phone; 360x780 CSS px is what the design prototypes were drawn at.
export const PHONE = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// What Chrome leaves the app on that phone once its own bars are on screen.
export const PHONE_WITH_BARS = { width: 360, height: 704 };

export function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function appVersion() {
  try { return /VERSION = '([^']+)'/.exec(readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8'))?.[1] || 'unknown'; } catch { return 'unknown'; }
}
export function gitHead() {
  try { return execSync('git rev-parse --short HEAD', { cwd: REPO_DIR, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

// Records the browsers this harness launched, so `cleanup` kills only those, never Chrome by name.
async function trackBrowser(browser) {
  await fs.mkdir(path.join(RUN_DIR, 'browsers'), { recursive: true });
  let pid = null;
  try {
    // Playwright does not expose the pid; Chromium's own process list does.
    const cdp = await browser.newBrowserCDPSession();
    const info = await cdp.send('SystemInfo.getProcessInfo');
    pid = info.processInfo.find(p => p.type === 'browser')?.id ?? null;
    await cdp.detach();
  } catch { pid = null; }
  if (!pid) return async () => {};
  const file = path.join(RUN_DIR, 'browsers', `${pid}.json`);
  await fs.writeFile(file, JSON.stringify({ pid, started: Date.now() }));
  return () => fs.rm(file, { force: true });
}

export async function launchBrowser(opts = {}) {
  const headless = !process.env.EDH_VERIFY_HEADED;
  let last;
  for (const channel of CHROME_CHANNELS) {
    try { return await chromium.launch({ channel, headless, ...opts }); } catch (e) { last = e; }
  }
  throw new Error(`No Chrome or Edge could be launched: ${last?.message?.split('\n')[0]}`);
}

// Scryfall is the app's only runtime network dependency. `stub` (default) answers any exact-name lookup with a card of
// that name, green identity and no art, so setup is deterministic offline; `block` fails every request, which is how
// the app behaves with no connection; `live` lets real requests through (slow, rate limited, needs network).
// One adventure card answers like the real Scryfall: either face's name finds the card, named by both faces, and the
// two-faced name itself finds nothing.
export const ADVENTURE = { faces: ['Kellan, the Fae-Blooded', 'Birthright Boon'], name: 'Kellan, the Fae-Blooded // Birthright Boon', color_identity: ['R', 'W'] };
const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
export async function routeScryfall(context, mode = process.env.EDH_SCRYFALL || 'stub') {
  if (mode === 'live') return;
  await context.route('https://api.scryfall.com/**', route => {
    if (mode === 'block') return route.abort('internetdisconnected');
    const u = new URL(route.request().url());
    const exact = u.searchParams.get('exact');
    const q = (u.searchParams.get('q') || '').toLowerCase();
    if (u.pathname === '/cards/named' && exact && ADVENTURE.faces.some(f => f.toLowerCase() === exact.toLowerCase())) {
      return route.fulfill({ json: { object: 'card', name: ADVENTURE.name, layout: 'adventure', color_identity: ADVENTURE.color_identity, card_faces: ADVENTURE.faces.map(name => ({ name })) } });
    }
    if (u.pathname === '/cards/named' && exact && exact !== ADVENTURE.name) return route.fulfill({ json: { object: 'card', name: exact, color_identity: ['G'] } });
    // Typing in a seat asks for name suggestions: the typed text is the one suggestion, the adventure for its first letters.
    if (u.pathname === '/cards/autocomplete' && ADVENTURE.name.toLowerCase().startsWith(q)) return route.fulfill({ json: { object: 'catalog', data: [ADVENTURE.name] } });
    if (u.pathname === '/cards/autocomplete') return route.fulfill({ json: { object: 'catalog', data: [u.searchParams.get('q') || ''] } });
    // The Radiation token the rad reminder shows; its image is a 1x1 PNG so the <img> path runs without the network.
    if (u.pathname === '/cards/tpip/22') return route.fulfill({ json: { object: 'card', name: 'Radiation', image_uris: { normal: PIXEL_PNG } } });
    return route.fulfill({ status: 404, json: { object: 'error', status: 404, details: 'stubbed' } });
  });
}

// What a journey drives the app through: real taps on the real controls, never internal setters.
export function appFor(page) {
  const $ = id => page.locator(`#${id}`);
  const seg = (id, label) => $(id).getByRole('button', { name: label, exact: true });
  const app = {
    $, seg,
    panel: p => page.locator('#board > .panel').nth(p),
    panelCount: () => page.locator('#board > .panel').count(),
    async screen() {
      return page.evaluate(() => [...document.querySelectorAll('.screen')].find(s => !s.classList.contains('hidden'))?.id);
    },
    async store() { return page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), STORE_KEY); },
    async game() { return (await app.store())?.game ?? null; },
    async theme() { return page.evaluate(() => document.documentElement.dataset.theme); },
    // Life as the panel shows it: the first text node, because a floating delta is appended after it.
    async life(p) { return app.panel(p).locator('.num').evaluate(e => Number(e.firstChild.nodeValue)); },
    async delta(p) { const d = app.panel(p).locator('.delta'); return (await d.count()) ? d.textContent() : null; },
    async rotation(p) { return app.panel(p).evaluate(e => Number((/\br(\d+)\b/.exec(e.className) || [0, 0])[1])); },
    lifeButton: (p, dir) => app.panel(p).getByRole('button', { name: dir > 0 ? 'Gain 1 life' : 'Lose 1 life' }),
    async tapLife(p, dir, times = 1) { for (let i = 0; i < times; i++) await app.lifeButton(p, dir).tap(); },
    // A press-and-hold: the first count lands at 80 ms, repeats start 450 ms in and come every 110 ms.
    async hold(locator, ms) {
      const b = await locator.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(ms);
      await page.mouse.up();
    },
    // In Minimal the tiles hide until the player's name is tapped; Companion shows them always.
    async showTools(p) {
      const panel = app.panel(p);
      if (!(await panel.evaluate(e => e.classList.contains('tools')))) await panel.locator('.head').tap();
    },
    async openTool(p, kind) { await app.showTools(p); await app.panel(p).locator(`.a-${kind}`).tap(); },
    sheet: p => app.panel(p).locator('.sheet'),
    async tileHeader(p, kind) {
      const rot = await app.rotation(p);
      const alongPanelDown = async loc => {
        const b = await loc.boundingBox();
        return { 0: [b.y, b.y + b.height], 90: [-(b.x + b.width), -b.x], 180: [-(b.y + b.height), -b.y], 270: [b.x, b.x + b.width] }[rot];
      };
      const tile = app.panel(p).locator(`.a-${kind}`), tax = app.panel(p).locator('.a-tax');
      const [box, icon, label, row, taxBox, taxIcon] = await Promise.all(
        [tile, tile.locator(':scope > svg'), tile.locator('.l'), tile.locator('.vals .v').first(), tax, tax.locator(':scope > svg')].map(alongPanelDown));
      return { labelUnderIcon: label[0] >= icon[1] - .5, rowUnderLabel: row[0] >= label[1] - .5, iconTop: icon[0] - box[0], taxIconTop: taxIcon[0] - taxBox[0] };
    },
    // A sideways swipe from the player's seat: along the panel's x when it faces up or down, along y when it faces a side.
    async swipe(p) {
      const b = await app.panel(p).boundingBox();
      const rot = await app.rotation(p);
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const len = Math.min(rot % 180 ? b.height : b.width, 160) * 0.5;
      const [dx, dy] = rot % 180 ? [0, len] : [len, 0];
      await page.mouse.move(cx - dx / 2, cy - dy / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(cx - dx / 2 + dx * i / 8, cy - dy / 2 + dy * i / 8);
      await page.mouse.up();
      // The app swallows any click within 400 ms of a swipe, so a tap straight after one would count for nothing.
      await page.waitForTimeout(450);
    },
    async openMenu() { await $('menuBtn').tap(); await $('menu').waitFor({ state: 'visible' }); },
    // Setup screen to table, through the same controls a player taps. names[i] fills seat i; blanks are allowed below 4 players.
    // onSetup runs with the setup screen filled in, before Start game, for a screenshot or an extra assertion.
    async newGame({ players = 2, life = 40, look, layout, names = [], first = 0, startAnyway = false, onSetup } = {}) {
      await $('newGame').tap();
      if (await $('confirm').isVisible()) await $('confirmOk').tap();
      await $('setup').waitFor({ state: 'visible' });
      await seg('startLife', String(life)).tap();
      await seg('playerCount', String(players)).tap();
      if (players === 4 && layout) await $('layout').locator('button').nth(layout === 'sides' ? 0 : 1).tap();
      if (look) await seg('look', look === 'minimal' ? 'Minimal' : 'Companion').tap();
      for (let i = 0; i < names.length; i++) if (names[i]) await $(`seat${i}`).fill(names[i]);
      await seg('first', first === 0 ? 'You' : `Opponent ${first}`).tap();
      if (onSetup) await onSetup();
      await $('startGame').tap();
      if (startAnyway) { await $('confirm').waitFor({ state: 'visible' }); await $('confirmOk').tap(); }
      await $('table').waitFor({ state: 'visible' });
      await page.locator('#board > .panel').first().waitFor();
    },
  };
  return app;
}

export async function session(name, fn, { headedPause = 0 } = {}) {
  const runDir = path.join(EVIDENCE_DIR, `${stamp()}-${name}`);
  await fs.mkdir(runDir, { recursive: true });
  const steps = [];
  const pageErrors = [];
  const summary = { journey: name, started: new Date().toISOString(), app: appVersion(), commit: gitHead(), url: null, result: 'running' };
  const server = process.env.EDH_VERIFY_URL ? null : await serve(APP_DIR);
  summary.url = process.env.EDH_VERIFY_URL || server.url;
  const browser = await launchBrowser();
  const untrack = await trackBrowser(browser);
  const context = await browser.newContext({ ...PHONE, serviceWorkers: 'block' });
  await routeScryfall(context);
  const page = await context.newPage();
  // A journey fails on an uncaught exception in the page and on any failed load of the app's own files. Console errors
  // and failed requests elsewhere (the stubbed Scryfall, say) are recorded in summary.json for the reader to weigh.
  const consoleErrors = [];
  const failedLoads = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failedLoads.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => failedLoads.push(`${r.failure()?.errorText || 'failed'} ${r.url()}`));
  let shots = 0;
  const evidence = {
    dir: runDir,
    async shot(label) {
      const file = path.join(runDir, `${String(++shots).padStart(2, '0')}-${label}.png`);
      await page.screenshot({ path: file });
      steps.push({ at: Date.now(), shot: path.basename(file) });
      return file;
    },
    async aria(label) {
      const file = path.join(runDir, `${label}.aria.yml`);
      await fs.writeFile(file, await page.locator('body').ariaSnapshot());
      steps.push({ at: Date.now(), aria: path.basename(file) });
      return file;
    },
    async storeDump(label) {
      const file = path.join(runDir, `${label}.store.json`);
      await fs.writeFile(file, JSON.stringify(await appFor(page).store(), null, 2));
      steps.push({ at: Date.now(), store: path.basename(file) });
      return file;
    },
    note(step, detail) {
      steps.push({ at: Date.now(), step, ...(detail || {}) });
      console.log(`  - ${step}${detail ? ' ' + JSON.stringify(detail) : ''}`);
    },
  };
  console.log(`journey ${name}  app ${summary.app} @ ${summary.commit}  ${summary.url}`);
  try {
    await page.goto(summary.url);
    await page.locator('#home, #table').first().waitFor({ state: 'visible' });
    await fn({ page, app: appFor(page), evidence, assert });
    if (pageErrors.length) throw new Error(`page errors during the journey:\n${pageErrors.join('\n')}`);
    const ownFailures = failedLoads.filter(f => f.includes(summary.url));
    if (ownFailures.length) throw new Error(`the app's own files failed to load:\n${ownFailures.join('\n')}`);
    summary.result = 'passed';
  } catch (e) {
    summary.result = 'failed';
    summary.error = e.stack || String(e);
    try { await page.screenshot({ path: path.join(runDir, 'FAILED.png') }); } catch {}
    console.error(`  FAILED: ${e.message}`);
  } finally {
    if (headedPause) await page.waitForTimeout(headedPause);
    summary.pageErrors = pageErrors;
    summary.consoleErrors = consoleErrors;
    summary.failedLoads = failedLoads;
    summary.steps = steps;
    summary.ended = new Date().toISOString();
    await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await untrack();
    if (server) await server.close();
  }
  console.log(`  ${summary.result.toUpperCase()}  evidence: ${runDir}`);
  return summary;
}

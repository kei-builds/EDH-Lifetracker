// Regression checks for sync POST/recovery, partner & self commander damage, setup async safety,
// finish validation, keyboard/Escape controls, undo delta clearing, bring-back active recovery, and corrupt-store boot.
import { ADVENTURE, SHEET } from '../lib.mjs';

export default async ({ page, app, evidence, assert }) => {
  // 1. Settings: sync key is masked by default with Show/Hide toggle, and list fetch uses POST (no key in URL).
  const seenUrls = [];
  const seenMethods = [];
  await page.route(`${SHEET.url}**`, async route => {
    const req = route.request();
    seenUrls.push(req.url());
    seenMethods.push(req.method());
    await route.fallback();
  });
  await app.$('openSettings').tap();
  assert.equal(await app.$('setKey').getAttribute('type'), 'password', 'sync key is masked by default');
  await app.$('toggleKey').tap();
  assert.equal(await app.$('setKey').getAttribute('type'), 'text', 'Show reveals the sync key');
  await app.$('toggleKey').tap();
  assert.equal(await app.$('setKey').getAttribute('type'), 'password', 'Hide masks it again');
  await app.$('setUrl').fill(SHEET.url);
  await app.$('setKey').fill(SHEET.key);
  await app.$('saveSettings').tap();
  await page.locator('#settingsMsg', { hasText: 'Connected.' }).waitFor({ timeout: 3000 });
  assert.equal(seenMethods[0], 'POST', 'lists fetch uses POST so the key stays out of the URL');
  assert.ok(!seenUrls[0].includes(SHEET.key), 'sync key is not in the request URL');
  await app.$('closeSettings').tap();
  await page.unroute(`${SHEET.url}**`);
  evidence.note('settings key masked and lists fetched via POST');

  // 2. Setup: controls disabled during name check (except Cancel), and extra whitespace around // stays one DFC.
  await page.route('https://api.scryfall.com/cards/named**', async route => {
    await new Promise(r => setTimeout(r, 350));
    await route.fallback();
  });
  await app.$('newGame').tap();
  await app.$('setup').waitFor({ state: 'visible' });
  await app.seg('playerCount', '2').tap();
  await app.$('seat0').fill(SHEET.pair);
  await app.$('seat1').fill(`${ADVENTURE.faces[0]}  //  ${ADVENTURE.faces[1]}`);
  await app.seg('first', 'You').tap();
  await app.$('startGame').tap();
  assert.ok(await app.$('startGame').isDisabled(), 'Start game disabled while checking');
  assert.ok(await app.seg('playerCount', '4').isDisabled(), 'playerCount disabled while checking');
  assert.ok(!(await app.$('cancelSetup').isDisabled()), 'Cancel stays enabled while checking');
  await app.$('table').waitFor({ state: 'visible', timeout: 5000 });
  await page.unroute('https://api.scryfall.com/cards/named**');
  let g = await app.game();
  assert.equal(g.players[1].name, ADVENTURE.faces[0], 'whitespace-padded adventure card stays one commander');
  assert.equal(g.players[1].partner, false);
  evidence.note('setup locked during checking and whitespace adventure normalized');

  // 3. Companion Damage tile shows split partner damage (a/b) instead of summing a + b, and Undo clears floating delta.
  await app.tapLife(1, -1, 3);
  assert.equal(await app.delta(1), '-3');
  await app.$('undo').tap();
  assert.equal(await app.delta(1), null, 'Undo clears the floating delta immediately');

  await app.openTool(1, 'damage');
  const p0Ctrs = app.panel(0).locator('.dmgRow.split .ctr');
  for (let i = 0; i < 4; i++) await p0Ctrs.nth(0).getByRole('button', { name: '+', exact: true }).tap();
  for (let i = 0; i < 3; i++) await p0Ctrs.nth(1).getByRole('button', { name: '+', exact: true }).tap();
  await app.$('dmgDone').tap();
  assert.equal(await app.panel(1).locator('.a-damage .vals .n').textContent(), '4/3',
    'Companion Damage tile shows partner damage split as 4/3 rather than summed as 7');
  await evidence.shot('companion-partner-split');

  // 4. Keyboard activation on life button and Escape closing Options menu & Rad dialog.
  await app.lifeButton(0, 1).focus();
  await page.keyboard.press('Enter');
  assert.equal(await app.life(0), 41, 'Enter on a life button counts a change');
  await app.openMenu();
  await page.keyboard.press('Escape');
  assert.ok(await app.$('menu').evaluate(e => e.classList.contains('hidden')), 'Escape closes Options menu');
  await app.openTool(0, 'counters');
  await app.sheet(0).getByRole('button', { name: 'What rad counters do' }).tap();
  await app.$('radInfo').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await app.$('radInfo').waitFor({ state: 'hidden' });
  await app.sheet(0).getByRole('button', { name: 'Done' }).tap();
  evidence.note('keyboard life control and Escape on menu/radInfo verified');

  // 4b. Multi-touch: two distinct pointers pressing two panels at once both count independently.
  const [l0Before, l1Before] = [await app.life(0), await app.life(1)];
  await page.evaluate(async () => {
    const b0 = document.querySelectorAll('#board > .panel')[0].querySelector('.zone.plus');
    const b1 = document.querySelectorAll('#board > .panel')[1].querySelector('.zone.minus');
    const r0 = b0.getBoundingClientRect(), r1 = b1.getBoundingClientRect();
    b0.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 10, pointerType: 'touch', clientX: r0.left + 10, clientY: r0.top + 10, bubbles: true }));
    b1.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: r1.left + 10, clientY: r1.top + 10, bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, pointerType: 'touch', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 10, pointerType: 'touch', bubbles: true }));
  });
  assert.ok(await app.life(0) >= l0Before + 4, 'pointer 10 kept counting after pointer 11 lifted');
  assert.ok(await app.life(1) <= l1Before - 2, 'pointer 11 counted simultaneously');

  // 5. Minimal status card shows self-commander damage when non-zero.
  await app.openMenu();
  await app.$('switchLook').tap();
  assert.equal(await app.theme(), 'minimal');
  await app.openTool(0, 'damage');
  const selfCtrs = app.panel(0).locator('.dmgRow.split .ctr');
  for (let i = 0; i < 5; i++) await selfCtrs.nth(0).getByRole('button', { name: '+', exact: true }).tap();
  await app.$('dmgDone').tap();
  await app.panel(0).locator('.badges .tiled').first().tap();
  const infoText = await app.panel(0).locator('.sheet.info').textContent();
  assert.match(infoText, /5 \/ 0/, 'Minimal status card includes non-zero self-commander damage');
  await evidence.shot('minimal-self-cmd-info');
  await app.panel(0).locator('.sheet.info').tap();

  // Switch back to Companion for remaining checks.
  await app.openMenu();
  await app.$('switchLook').tap();

  // 6. Non-sheet Finish screen hides Sol Rings / 1st elimination / Notes, and brought-back elimination does not prefill victory.
  await app.openTool(1, 'counters');
  const poisonPlus = app.sheet(1).locator('.ctr').nth(0).getByRole('button', { name: '+', exact: true });
  for (let i = 0; i < 10; i++) await poisonPlus.tap();
  await app.sheet(1).getByRole('button', { name: 'Done' }).tap();
  await app.panel(1).getByRole('button', { name: 'Bring back' }).tap();
  const life0 = await app.life(0);
  await app.tapLife(0, -1, life0);
  await app.panel(0).locator('.out').waitFor();
  await app.$('pass').tap();
  assert.equal(await app.screen(), 'finish');
  assert.ok(await app.$('solWrap').evaluate(e => e.classList.contains('hidden')), 'Sol Rings hidden on non-sheet finish');
  assert.ok(await app.$('elimWrap').evaluate(e => e.classList.contains('hidden')), '1st elim hidden on non-sheet finish');
  assert.ok(await app.$('notesWrap').evaluate(e => e.classList.contains('hidden')), 'Notes hidden on non-sheet finish');
  assert.equal(await app.$('victory').locator('button.on').count(), 0,
    'brought-back poison knockout does not pre-fill Poison when the other player lost to life');
  await app.$('saveGame').tap();
  assert.equal(await app.screen(), 'home');
  evidence.note('non-sheet finish clutter hidden and stale lastOut ignored');

  // 7. Bring-back active-player recovery (3 players: active dies leaving 1 alive, then others brought back).
  await app.newGame({ players: 3, life: 20, first: 0 });
  await app.tapLife(1, -1, 20);
  await app.panel(1).locator('.out').waitFor();
  await app.tapLife(0, -1, 20);
  await app.panel(0).locator('.out').waitFor();
  // Active player 0 died leaving only player 2 alive, so g.active stayed 0 (who is out).
  await app.panel(1).getByRole('button', { name: 'Bring back' }).tap();
  g = await app.game();
  assert.ok(!g.players[g.active].out, `active player after Bring back must be alive (got ${g.active})`);
  await app.openMenu();
  await app.$('abandon').tap();
  await app.$('confirmOk').tap();
  evidence.note('active player recovered after bring back');

  // 8. 4-player Finish validation (solWin required when sol > 0, elim <= turns, case-insensitive pod dedup) & failed-sync Discard recovery.
  let failFirstPost = true;
  let syncedIds = [];
  let allowSync = true;
  await page.route(`${SHEET.url}**`, async route => {
    const req = route.request();
    const body = req.method() === 'POST' ? JSON.parse(req.postData() || '{}') : {};
    if (body.game) {
      if (failFirstPost || !allowSync) {
        failFirstPost = false;
        return route.fulfill({ json: { ok: false, error: 'Simulated permanent failure' } });
      }
      syncedIds.push(body.game.id);
      return route.fulfill({ json: { ok: true, row: 2 } });
    }
    if (body.action === 'lists') {
      return route.fulfill({ json: { ok: true, decks: SHEET.decks, commanders: SHEET.commanders, pods: ['Friday Pod'], last: {} } });
    }
    return route.fallback();
  });

  const NAMES = ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow", 'Edgar Markov'];
  await app.newGame({ players: 4, names: NAMES, first: 0, onSetup: async () => { await app.$('setupPod').fill('Friday Pod'); } });
  await app.openMenu();
  await app.$('finishNow').tap();
  await app.seg('winner', 'Krenko, Mob Boss').tap();
  await app.seg('sol', '1').tap();
  await app.$('saveGame').tap();
  assert.equal(await app.$('finishMsg').textContent(), 'Pick whether a turn 1 Sol Ring player won.');
  await app.seg('solWin', 'No').tap();
  await app.$('turns').fill('5');
  await app.$('elim').fill('8');
  await app.$('saveGame').tap();
  assert.equal(await app.$('finishMsg').textContent(), '1st elimination must be between 1 and the turn count.');
  await app.$('elim').fill('4');
  await app.$('detailsWrap').locator('summary').tap();
  await app.seg('power', 'Mid').tap();
  await app.$('saveGame').tap();
  assert.equal(await app.screen(), 'home');
  await page.locator('#queueHelp').waitFor({ state: 'visible', timeout: 3000 });
  assert.match(await app.$('syncStatus').textContent(), /Simulated permanent failure/);
  assert.deepEqual((await app.store()).lists.pods, ['Friday Pod']);
  await evidence.shot('sync-failed-recovery');

  // Discard the stuck game cleanly via the recovery button.
  await app.$('discardQueued').tap();
  await app.$('confirmOk').tap();
  assert.equal((await app.store()).queue.length, 0, 'Discard failed removed the stuck game');
  assert.ok(await app.$('queueHelp').evaluate(e => e.classList.contains('hidden')));

  // Case-insensitive pod dedup: saving "friday pod" does not duplicate "Friday Pod" locally before sync.
  allowSync = false;
  await app.newGame({ players: 4, names: NAMES, first: 0, onSetup: async () => { await app.$('setupPod').fill('friday pod'); } });
  await app.openMenu();
  await app.$('finishNow').tap();
  await app.seg('winner', 'Krenko, Mob Boss').tap();
  await app.$('saveGame').tap();
  await page.locator('#queueHelp').waitFor({ state: 'visible', timeout: 3000 });
  assert.deepEqual((await app.store()).lists.pods, ['Friday Pod'], 'pod list deduplicates case-insensitively');
  allowSync = true;
  await app.$('syncNow').tap();
  await page.locator('#syncStatus', { hasText: 'All games synced.' }).waitFor({ timeout: 3000 });
  assert.equal(syncedIds.length, 1, 'second game synced cleanly on Sync now');
  await page.unroute(`${SHEET.url}**`);
  evidence.note('finish validation, case-insensitive pod dedup, and stuck queue discard verified');

  // 9. Corrupt store.game recovers cleanly to Home on reload instead of crashing.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('edhLife.v2') || '{}');
    s.game = { layout: 'broken', n: 99, active: 99, players: [] };
    localStorage.setItem('edhLife.v2', JSON.stringify(s));
  });
  await page.reload();
  await app.$('home').waitFor({ state: 'visible' });
  assert.equal(await app.game(), null, 'corrupt game cleared cleanly on startup');
  evidence.note('corrupt game startup recovery verified');
};

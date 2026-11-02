// New game: home, setup, table, in both looks; the game and the setup preferences land in storage.
const NAMES = ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss'];

export default async ({ page, app, evidence, assert }) => {
  assert.equal(await app.screen(), 'home');
  assert.match(await app.$('syncStatus').textContent(), /Add your sync URL/);
  await evidence.shot('home');

  await app.newGame({ players: 2, life: 40, look: 'companion', names: NAMES, first: 0, onSetup: () => evidence.shot('setup-filled') });
  assert.equal(await app.screen(), 'table');
  assert.equal(await app.panelCount(), 2);
  assert.equal(await app.life(0), 40);
  assert.equal(await app.life(1), 40);
  assert.match(await app.panel(0).locator('.name').textContent(), /Atraxa/);
  assert.match(await app.panel(1).locator('.name').textContent(), /Krenko/);
  assert.equal(await app.rotation(1), 180, 'the opponent panel faces the top edge');
  assert.equal(await app.theme(), 'companion');
  assert.ok(await app.panel(0).evaluate(e => e.classList.contains('tools')), 'Companion shows the tiles without a tap');
  assert.equal(await app.panel(0).locator('.actions button').count(), 4, 'Tax, Damage, Mana, Counters');
  await evidence.shot('table-companion');
  await evidence.aria('table-companion');
  let g = await app.game();
  assert.equal(g.n, 2);
  assert.equal(g.life0, 40);
  assert.deepEqual(g.players.map(p => p.name), NAMES);
  assert.deepEqual(g.named, [true, true]);
  assert.equal(g.active, 0);
  assert.equal(g.round, 1);
  const store = await app.store();
  assert.equal(store.prefs.life, '40');
  assert.equal(store.prefs.players, '2');
  await evidence.storeDump('after-start');
  evidence.note('companion game started', { players: g.n, life: g.life0 });

  // Leaving for home keeps the game; starting another discards it after a confirmation.
  await app.openMenu();
  await app.$('toHome').tap();
  assert.equal(await app.screen(), 'home');
  await app.$('resumeGame').waitFor({ state: 'visible' });
  assert.equal(await app.$('newGame').textContent(), 'New game (discards current)');
  await evidence.shot('home-with-game');

  await app.newGame({ players: 3, life: 20, look: 'minimal', first: 2 });
  assert.equal(await app.theme(), 'minimal');
  assert.equal(await app.panelCount(), 3);
  for (let p = 0; p < 3; p++) assert.equal(await app.life(p), 20);
  assert.deepEqual([await app.rotation(0), await app.rotation(1), await app.rotation(2)], [0, 90, 270]);
  g = await app.game();
  assert.equal(g.first, 2);
  assert.equal(g.active, 2);
  assert.deepEqual(g.players.map(p => p.name), ['You', 'Player 2', 'Player 3'], 'blank seats get placeholder names');
  assert.ok(!(await app.panel(0).evaluate(e => e.classList.contains('tools'))), 'Minimal hides the tiles');
  await evidence.shot('table-minimal');
  await app.panel(0).locator('.head').tap();
  assert.ok(await app.panel(0).evaluate(e => e.classList.contains('tools')), 'a tap on the name shows the tiles');
  await evidence.shot('table-minimal-tools');
  await page.waitForTimeout(4300);
  assert.ok(!(await app.panel(0).evaluate(e => e.classList.contains('tools'))), 'the tiles hide again after 4 s');
  evidence.note('minimal game started', { players: g.n, life: g.life0, first: g.first });
};

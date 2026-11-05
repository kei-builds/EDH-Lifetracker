// New game: home, setup, table, in both looks; the game and the setup preferences land in storage.
import { ADVENTURE } from '../lib.mjs';

// The second seat is typed the way Scryfall names an adventure card, by both faces; the game knows it by its front face.
const NAMES = ["Atraxa, Praetors' Voice", ADVENTURE.name];

export default async ({ page, app, evidence, assert }) => {
  assert.equal(await app.screen(), 'home');
  assert.match(await app.$('syncStatus').textContent(), /Add your sync URL/);
  const [card, button] = await Promise.all([app.$('syncCard').boundingBox(), app.$('newGame').boundingBox()]);
  assert.ok(Math.abs(card.width - button.width) < 1 && Math.abs(card.x - button.x) < 1, 'the sync card is as wide as the New game button and lines up with it');
  await evidence.shot('home');

  const suggestion = text => page.locator('#suggest button', { hasText: text });
  const focused = () => page.evaluate(() => document.activeElement && document.activeElement.id);
  const suggestions = async () => {
    await app.$('seat0').fill('atr');
    await suggestion('atr').waitFor({ timeout: 3000 })
      .catch(() => assert.fail('your own seat gets Scryfall suggestions like the others, in a row under the field'));
    await suggestion('atr').tap();
    assert.equal(await app.$('seat0').inputValue(), 'atr', 'a tapped suggestion fills the field');
    assert.equal(await focused(), 'seat1', 'and moves on to the next seat');
    assert.ok(!(await page.locator('#suggest button').count()), 'the empty next seat has nothing to suggest yet');
    await app.$('seat0').fill(NAMES[0]);
    await page.route(u => u.pathname === '/cards/autocomplete' && u.searchParams.get('q') === 'kre',
      route => route.fulfill({ status: 429, json: { object: 'error', status: 429 } }), { times: 1 });
    const limited = page.waitForResponse(r => r.url().includes('/cards/autocomplete') && r.status() === 429);
    await app.$('seat1').fill('kre');
    await limited;
    await app.$('seat1').fill('kren');
    await suggestion('kren').waitFor({ timeout: 3000 })
      .catch(() => assert.fail('a rate-limited lookup is forgotten, so the next letters ask Scryfall again'));
    await app.$('seat1').fill('kellan');
    await suggestion('Kellan').waitFor({ timeout: 3000 })
      .catch(() => assert.fail('an adventure card is suggested by its front face, not as "Front // Adventure"'));
    assert.equal(await suggestion('Kellan').textContent(), ADVENTURE.faces[0]);
    await evidence.shot('suggestions');
    await suggestion('Kellan').tap();
    assert.equal(await app.$('seat1').inputValue(), ADVENTURE.faces[0]);
    assert.notEqual(await focused(), 'seat1', 'a suggestion tapped on the last seat puts the keyboard away');
    assert.ok(await page.locator('#suggest').isHidden(), 'and the row goes with it');
    await app.$('seat1').fill(NAMES[1]);
  };
  await app.newGame({ players: 2, life: 40, look: 'companion', names: NAMES, first: 0,
    onSetup: async () => { await evidence.shot('setup-filled'); await suggestions(); } });
  assert.equal(await app.screen(), 'table');
  assert.equal(await app.panelCount(), 2);
  assert.equal(await app.life(0), 40);
  assert.equal(await app.life(1), 40);
  assert.match(await app.panel(0).locator('.name').textContent(), /Atraxa/);
  assert.match(await app.panel(1).locator('.name').textContent(), /Kellan/);
  assert.equal(await app.rotation(1), 180, 'the opponent panel faces the top edge');
  assert.equal(await app.theme(), 'companion');
  assert.ok(await app.panel(0).evaluate(e => e.classList.contains('tools')), 'Companion shows the tiles without a tap');
  const headBelowNumeral = await app.panel(0).evaluate(e => {
    const head = e.querySelector('.head').getBoundingClientRect(), num = e.querySelector('.num').getBoundingClientRect(), strip = e.querySelector('.strip').getBoundingClientRect();
    return head.top >= num.bottom - 1 && head.bottom <= strip.bottom + 1 && strip.top < head.top - num.height;
  });
  assert.ok(headBelowNumeral, 'Companion puts the name along the bottom of a life box that spans the panel, under the numeral');
  assert.equal(await app.panel(0).locator('.head .sub').count(), 0, 'no subtitle repeats the name');
  assert.equal(await app.panel(0).locator('.actions button').count(), 4, 'Tax, Damage, Mana, Counters');
  await evidence.shot('table-companion');
  await evidence.aria('table-companion');
  let g = await app.game();
  assert.equal(g.n, 2);
  assert.equal(g.life0, 40);
  assert.deepEqual(g.players.map(p => p.name), [NAMES[0], ADVENTURE.faces[0]], 'an adventure card typed by both faces is one commander, named by its front');
  assert.equal(g.players[1].partner, false, 'the adventure half is not a partner');
  assert.equal(g.players[1].letters, 'WR');
  assert.deepEqual(g.named, [true, true]);
  await app.openTool(0, 'damage');
  assert.equal(await app.panel(1).locator('.dmgRow .ctr').count(), 1, 'Kellan deals commander damage as one commander, with no counter for the adventure');
  assert.equal(await app.panel(1).locator('.dmgRow.split').count(), 0);
  await evidence.shot('damage-one-commander');
  await app.$('dmgDone').tap();
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
  const prefs = (await app.store()).prefs;
  assert.equal(prefs.life, '20', 'the second game\'s life is the remembered preference');
  assert.equal(prefs.players, '3');
  await evidence.shot('table-minimal');
  await app.panel(0).locator('.head').tap();
  assert.ok(await app.panel(0).evaluate(e => e.classList.contains('tools')), 'a tap on the name shows the tiles');
  await evidence.shot('table-minimal-tools');
  await page.waitForTimeout(4300);
  assert.ok(!(await app.panel(0).evaluate(e => e.classList.contains('tools'))), 'the tiles hide again after 4 s');
  evidence.note('minimal game started', { players: g.n, life: g.life0, first: g.first });
};

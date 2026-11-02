// Turns and finishing: the turn button, the round count, undoing a pass, the options menu, leaving and resuming, and
// ending a game that is not sent to the sheet.
const NAMES = ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow"];

export default async ({ page, app, evidence, assert }) => {
  await app.newGame({ players: 3, names: NAMES, first: 0 });
  const active = () => page.locator('#board > .panel.active').evaluate(e => [...e.parentNode.children].indexOf(e));

  assert.equal(await app.$('turnLabel').textContent(), 'Turn 1');
  assert.equal(await app.$('activeLabel').textContent(), 'Atraxa');
  assert.equal(await active(), 0);
  await app.$('pass').tap();
  assert.equal(await active(), 1);
  assert.equal(await app.$('activeLabel').textContent(), 'Krenko');
  await app.$('pass').tap();
  assert.equal(await active(), 2);
  await app.$('pass').tap();
  assert.equal(await active(), 0);
  assert.equal(await app.$('turnLabel').textContent(), 'Turn 2', 'the round goes up when play returns to the first player');
  let g = await app.game();
  assert.equal(g.round, 2);
  assert.equal(g.events.filter(e => 'turn' in e).length, 3);
  await evidence.shot('turn-2');
  await app.$('undo').tap();
  g = await app.game();
  assert.equal(g.round, 1);
  assert.equal(g.active, 2, 'a pass is its own undo step');
  evidence.note('three passes, one undone', { round: g.round, active: g.active });

  await app.openMenu();
  await evidence.shot('menu');
  await app.$('toHome').tap();
  assert.equal(await app.screen(), 'home');
  await app.$('resumeGame').tap();
  assert.equal(await app.screen(), 'table');
  assert.equal(await app.life(0), 40);
  evidence.note('left for home and resumed');

  await app.openMenu();
  await app.$('finishNow').tap();
  assert.equal(await app.screen(), 'finish');
  assert.match(await app.$('finishNote').textContent(), /won't be sent/);
  assert.equal(await app.$('saveGame').textContent(), 'End game');
  assert.equal(await app.$('winner').locator('button').count(), 4, 'three players plus "Not sure which opponent"');
  assert.equal(await app.$('turns').inputValue(), '1');
  assert.ok(await app.$('detailsWrap').evaluate(e => e.classList.contains('hidden')), 'sheet-only details stay hidden');
  await evidence.shot('finish-screen');
  await evidence.aria('finish-screen');
  await app.$('saveGame').tap();
  assert.equal(await app.$('finishMsg').textContent(), 'Pick who won.');
  await app.seg('winner', 'Krenko, Mob Boss').tap();
  await app.seg('victory', 'Combo').tap();
  await app.$('saveGame').tap();
  assert.equal(await app.screen(), 'home');
  assert.equal(await app.$('toast').textContent(), 'Game ended');
  const store = await app.store();
  assert.equal(store.game, null);
  assert.equal(store.queue.length, 0, 'a 3-player game is not queued for the sheet');
  assert.ok(await app.$('resumeGame').evaluate(e => e.classList.contains('hidden')));
  assert.equal(await app.$('newGame').textContent(), 'New game');
  await evidence.shot('home-after-end');
  await evidence.storeDump('after-end');
  evidence.note('game ended without a sheet entry');
};

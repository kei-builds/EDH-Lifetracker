// Save game: a 4-player game with every seat named goes through the finish screen and lands in the sync queue.
const NAMES = ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow", 'Edgar Markov'];
const DATE = '2026-10-31';

export default async ({ page, app, evidence, assert }) => {
  await app.newGame({ players: 4, names: NAMES, first: 0 });
  assert.equal(await app.panelCount(), 4);
  assert.deepEqual((await app.game()).named, [true, true, true, true]);

  await app.tapLife(1, -1, 3);
  await app.tapLife(2, 1, 2);
  await app.tapLife(3, -1, 40);
  await app.panel(3).locator('.out').waitFor();
  const g = await app.game();
  assert.equal(g.players[1].life, 37);
  assert.equal(g.players[2].life, 42);
  assert.equal(g.players[3].out.cause, 'life');
  await evidence.shot('table-before-finish');

  await app.openMenu();
  await app.$('finishNow').tap();
  assert.equal(await app.screen(), 'finish');
  assert.equal(await app.$('finishNote').textContent(), '', 'a fully named 4-player game goes to the sheet');
  assert.equal(await app.$('saveGame').textContent(), 'Save game');
  assert.ok(!(await app.$('detailsWrap').evaluate(e => e.classList.contains('hidden'))), 'Game details show');
  assert.equal(await app.$('turns').inputValue(), '1');
  assert.equal(await app.$('elim').inputValue(), '1', 'the first elimination is pre-filled from the knockout');

  await app.seg('winner', 'Krenko, Mob Boss').tap();
  await app.seg('victory', 'Combat Damage').tap();
  await app.$('notes').fill('Turn two Krenko');
  await app.$('saveGame').tap();
  assert.equal(await app.$('finishMsg').textContent(), 'Fill in the pod and power under Game details.');
  assert.ok(await app.$('detailsWrap').evaluate(e => e.open), 'the refusal opens Game details');
  assert.equal(await app.screen(), 'finish');
  await app.$('date').fill(DATE);
  await app.$('pod').fill('Tuesday pod');
  await app.seg('power', 'Mid').tap();
  await app.seg('bracket', '3').tap();
  await evidence.shot('finish-filled');
  await evidence.aria('finish-filled');

  await app.$('saveGame').tap();
  assert.equal(await app.screen(), 'home');
  assert.equal(await app.$('toast').textContent(), 'Game saved');
  const store = await app.store();
  assert.equal(store.game, null);
  assert.equal(store.queue.length, 1, 'the game waits in the sync queue');
  const q = store.queue[0];
  assert.equal(typeof q.id, 'string');
  assert.equal(q.setup.date, DATE);
  assert.equal(q.setup.pod, 'Tuesday pod');
  assert.equal(q.setup.power, 'Mid Power');
  assert.equal(q.setup.bracket, '3');
  assert.equal(q.setup.deck, NAMES[0]);
  assert.deepEqual(q.setup.opps, NAMES.slice(1));
  assert.equal(q.setup.seat, '1');
  assert.equal(q.winner, 'Opponent 1');
  assert.equal(q.victory, 'Combat Damage');
  assert.equal(q.turns, '1');
  assert.equal(q.elim, '1');
  assert.equal(q.notes, 'Turn two Krenko');
  assert.deepEqual(q.eliminations, [{ name: NAMES[3], turn: 1, cause: 'life' }]);
  assert.equal(q.events.length, 46, '45 life taps and one knockout make the event log');
  assert.equal(await app.$('syncStatus').textContent(),
    '1 game saved on this phone. Add your sync URL and key in Settings to send games to your sheet.');
  await evidence.shot('home-after-save');
  await evidence.storeDump('after-save');
  evidence.note('4-player game saved to the queue', { id: q.id, winner: q.winner, eliminations: q.eliminations.length });
};

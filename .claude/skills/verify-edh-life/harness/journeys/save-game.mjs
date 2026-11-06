// Save game: a 4-player game with every seat named goes through the finish screen and lands in the sync queue.
const NAMES = ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow", 'Edgar Markov'];
const DATE = '2026-10-31';

export default async ({ page, app, evidence, assert }) => {
  await app.newGame({ players: 4, names: NAMES, first: 0, onSetup: async () => {
    assert.ok(!(await app.$('podWrap').evaluate(e => e.classList.contains('hidden'))), 'a 4-player game asks for the pod in setup');
    assert.equal(await app.$('setupPod').inputValue(), '', 'nothing to pre-fill before a first game');
    assert.ok(await app.$('podPick').evaluate(e => e.classList.contains('hidden')), 'and no pills until a pod is known');
    await app.$('setupPod').fill('Tuesday pod');
    await evidence.shot('setup-pod');
  } });
  assert.equal(await app.panelCount(), 4);
  assert.deepEqual((await app.game()).named, [true, true, true, true]);
  assert.equal((await app.game()).pod, 'Tuesday pod', 'the pod is saved with the game');

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
  assert.equal(await app.$('pod').inputValue(), 'Tuesday pod', 'the pod from setup is pre-filled under Game details');
  assert.match(await app.$('detailsSummary').textContent(), /Tuesday pod/, 'and shows in the summary while the details are closed');

  await app.seg('winner', 'Krenko, Mob Boss').tap();
  await app.seg('victory', 'Combat Damage').tap();
  assert.ok(await app.$('solWinWrap').evaluate(e => e.classList.contains('hidden')), 'with 0 turn 1 Sol Rings the win question stays hidden');
  await app.seg('sol', '2').tap();
  assert.ok(!(await app.$('solWinWrap').evaluate(e => e.classList.contains('hidden'))), 'picking a Sol Ring count asks whether such a player won');
  await app.seg('solWin', 'Yes').tap();
  await app.$('notes').fill('Turn two Krenko');
  await app.$('saveGame').tap();
  assert.equal(await app.$('finishMsg').textContent(), 'Fill in the pod and power under Game details.');
  assert.ok(await app.$('detailsWrap').evaluate(e => e.open), 'the refusal opens Game details');
  assert.equal(await app.screen(), 'finish');
  await app.$('date').fill(DATE);
  await app.seg('power', 'Mid').tap();
  await app.seg('bracket', '3').tap();
  await app.$('date').fill('');
  await app.$('saveGame').tap();
  assert.equal(await app.$('finishMsg').textContent(), 'Pick a date.', 'a cleared date is refused before the game is queued');
  assert.equal((await app.store()).queue.length, 0);
  await app.$('date').fill(DATE);
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
  assert.equal(q.sol, '2', 'the turn 1 Sol Ring count goes to the sheet');
  assert.equal(q.solWin, 'Yes', 'and whether a Sol Ring player won');
  assert.equal(q.notes, 'Turn two Krenko');
  assert.deepEqual(q.eliminations, [{ name: NAMES[3], turn: 1, cause: 'life' }]);
  assert.equal(q.events.length, 46, '45 life taps and one knockout make the event log');
  assert.equal(await app.$('syncStatus').textContent(),
    '1 game saved on this phone. Add your sync URL and key in Settings to send games to your sheet.');
  await evidence.shot('home-after-save');
  await evidence.storeDump('after-save');
  evidence.note('4-player game saved to the queue', { id: q.id, winner: q.winner, eliminations: q.eliminations.length });

  // The next setup offers the saved game's pod back, before any sync: pre-filled, with its pill lit.
  assert.deepEqual(store.lists.pods, ['Tuesday pod']);
  assert.deepEqual(store.lists.last, { pod: 'Tuesday pod', power: 'Mid Power', bracket: '3' });
  await app.$('newGame').tap();
  await app.$('setup').waitFor({ state: 'visible' });
  await app.seg('playerCount', '4').tap();
  assert.equal(await app.$('setupPod').inputValue(), 'Tuesday pod', 'the next setup is pre-filled with the last pod');
  const pill = app.$('podPick').getByRole('button', { name: 'Tuesday pod' });
  assert.ok(await pill.evaluate(e => e.classList.contains('on')), 'and its pill is lit');
  await app.$('setupPod').fill('Thursday');
  assert.ok(!(await pill.evaluate(e => e.classList.contains('on'))), 'typing another pod unlights it');
  await pill.tap();
  assert.equal(await app.$('setupPod').inputValue(), 'Tuesday pod', 'a tap on a pill fills the field');
  await evidence.shot('setup-pod-pill');
  await app.$('cancelSetup').tap();
  assert.equal(await app.screen(), 'home');
  evidence.note('the next setup offers the saved pod', { pods: store.lists.pods });
};

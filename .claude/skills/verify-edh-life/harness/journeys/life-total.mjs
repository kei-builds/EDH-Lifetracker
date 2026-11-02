// Life total: taps, the floating delta, press-and-hold, undo grouping, low-life colors and a knockout at zero.
export default async ({ page, app, evidence, assert }) => {
  await app.newGame({ players: 2, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss'] });

  await app.tapLife(1, -1, 3);
  assert.equal(await app.life(1), 37);
  assert.equal(await app.delta(1), '-3', 'the running total floats next to the life');
  await evidence.shot('three-taps');
  let g = await app.game();
  assert.equal(g.players[1].life, 37);
  assert.equal(g.events.filter(e => e.life).length, 3, 'each tap is an event');
  assert.equal((await app.store()).undo.length, 1, 'quick taps on one control are one undo step');

  await app.$('undo').tap();
  assert.equal(await app.life(1), 40, 'one Undo takes the whole burst back');
  assert.equal((await app.store()).undo.length, 0);
  evidence.note('undo restored the burst');

  await app.hold(app.lifeButton(0, 1), 900);
  const held = await app.life(0);
  assert.ok(held >= 42 && held <= 47, `a 900 ms hold keeps counting (got ${held})`);
  await evidence.shot('after-hold');
  await app.$('undo').tap();
  assert.equal(await app.life(0), 40, 'the hold is one undo step');
  evidence.note('hold counted and undid as one step', { held });

  await app.tapLife(1, -1, 30);
  assert.equal(await app.life(1), 10);
  assert.equal(await app.panel(1).locator('.num.warn').count(), 1, 'amber at 10');
  await app.tapLife(1, -1, 5);
  assert.equal(await app.life(1), 5);
  assert.equal(await app.panel(1).locator('.num.lethal').count(), 1, 'red at 5');
  await evidence.shot('low-life');

  await app.tapLife(1, -1, 5);
  await app.panel(1).locator('.out').waitFor();
  assert.match(await app.panel(1).locator('.out').textContent(), /Out[\s\S]*turn 1 · life/);
  g = await app.game();
  assert.equal(g.players[1].out.cause, 'life');
  assert.equal(await app.$('turnLabel').textContent(), 'Finish', 'with one player left the turn button offers to finish');
  await evidence.shot('knocked-out');
  await evidence.aria('knocked-out');
  await evidence.storeDump('knocked-out');

  await app.$('undo').tap();
  assert.equal(await app.life(1), 40, 'the unbroken run of taps was one step');
  assert.equal(await app.panel(1).locator('.out').count(), 0);
  assert.equal((await app.game()).players[1].out, null);
  await evidence.shot('undone');
  evidence.note('knockout undone');
};

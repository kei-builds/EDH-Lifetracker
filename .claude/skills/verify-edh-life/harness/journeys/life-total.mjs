// Life total: taps, the floating delta, press-and-hold, undo grouping, low-life colors and a knockout at zero.
const AMBER = /rgba\(255, 189, 74, 0\.35\)/;
const RED = /rgba\(255, 106, 94, 0\.4\)/;

export default async ({ page, app, evidence, assert }) => {
  await app.newGame({ players: 2, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss'] });
  const glow = p => app.panel(p).locator('.num').evaluate(e => getComputedStyle(e).textShadow);

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

  const beforeLong = (await app.store()).undo.length;
  await app.hold(app.lifeButton(0, -1), 2000);
  await app.tapLife(0, -1);
  const afterLong = await app.life(0);
  assert.ok(afterLong >= 22 && afterLong <= 27, `a 2 s hold then a tap keeps counting (got ${afterLong})`);
  assert.equal((await app.store()).undo.length, beforeLong + 1, 'a tap right after a long hold joins the hold\'s undo step');
  await app.$('undo').tap();
  assert.equal(await app.life(0), 40, 'one Undo takes back the hold and the tap');
  evidence.note('long hold and a tap undid as one step', { life: afterLong });

  const steps = (await app.store()).undo.length;
  await app.tapLife(1, -1, 2);
  await page.waitForTimeout(1700);
  await app.tapLife(1, -1, 2);
  assert.equal(await app.life(1), 36);
  assert.equal((await app.store()).undo.length, steps + 2, 'a pause longer than the burst window starts a new step');
  await app.$('undo').tap();
  assert.equal(await app.life(1), 38, 'one Undo takes back only the taps after the pause');
  await app.$('undo').tap();
  assert.equal(await app.life(1), 40);
  evidence.note('a pause split the taps into two steps');

  await app.tapLife(1, -1, 30);
  assert.equal(await app.life(1), 10);
  assert.equal(await app.panel(1).locator('.num.warn').count(), 1, 'amber at 10');
  assert.match(await glow(1), AMBER, 'the numeral glows amber');
  await app.tapLife(1, -1, 5);
  assert.equal(await app.life(1), 5);
  assert.equal(await app.panel(1).locator('.num.lethal').count(), 1, 'red at 5');
  assert.match(await glow(1), RED, 'the numeral glows red');
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

  // Brought back, a player plays on at the numbers they have and goes out again only by crossing a line again.
  await app.panel(1).getByRole('button', { name: 'Bring back' }).tap();
  g = await app.game();
  assert.equal(g.players[1].out, null, 'Bring back puts the player back in');
  assert.equal(await app.panel(1).locator('.out').count(), 0);
  assert.equal(await app.life(1), 0, 'at the life they had');
  assert.notEqual(await app.$('turnLabel').textContent(), 'Finish', 'and the game goes on');
  await app.tapLife(1, -1, 2);
  assert.equal(await app.life(1), -2);
  assert.equal((await app.game()).players[1].out, null, 'already at 0, losing more life crosses nothing');
  await evidence.shot('brought-back');
  await page.waitForTimeout(1700);
  await app.tapLife(1, 1, 3);
  await app.tapLife(1, -1);
  g = await app.game();
  assert.equal(g.players[1].life, 0);
  assert.equal(g.players[1].out.cause, 'life', 'back above 0 and down to it again is a new knockout');
  await app.$('undo').tap();
  assert.equal(await app.life(1), -2, 'Undo takes back the run that knocked them out again');
  assert.equal((await app.game()).players[1].out, null);
  await app.$('undo').tap();
  assert.equal(await app.life(1), 0);
  assert.equal((await app.game()).players[1].out, null);
  await app.$('undo').tap();
  assert.equal((await app.game()).players[1].out.cause, 'life', 'Bring back is one undo step of its own');
  evidence.note('brought back at 0, stayed in below it, went out again on a new crossing');

  await app.$('undo').tap();
  assert.equal(await app.life(1), 40, 'the unbroken run of taps was one step');
  assert.equal(await app.panel(1).locator('.out').count(), 0);
  assert.equal((await app.game()).players[1].out, null);
  await evidence.shot('undone');
  evidence.note('knockout undone');

  await app.openMenu();
  await app.$('toHome').tap();
  await app.newGame({ players: 2, look: 'minimal' });
  await app.tapLife(1, -1, 30);
  assert.equal(await app.panel(1).locator('.num.warn').count(), 1);
  assert.match(await glow(1), AMBER, 'Minimal keeps the amber glow at 10');
  await app.tapLife(1, -1, 5);
  assert.match(await glow(1), RED, 'Minimal keeps the red glow at 5');
  await evidence.shot('low-life-minimal');
  evidence.note('low-life glow shows in Minimal too');
};

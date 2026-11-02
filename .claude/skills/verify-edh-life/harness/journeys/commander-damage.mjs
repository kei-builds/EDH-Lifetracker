// Commander damage: the Damage tile and a sideways swipe open damage mode for a player; damage lowers life, shows on the
// tile afterwards, and 21 from one commander knocks the player out.
export default async ({ page, app, evidence, assert }) => {
  await app.newGame({ players: 3, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow"] });
  const dmgMode = () => app.$('table').evaluate(e => e.classList.contains('dmgMode'));
  const plus = p => app.panel(p).locator('.ctr').getByRole('button', { name: '+', exact: true });

  await app.openTool(1, 'damage');
  assert.ok(await dmgMode());
  assert.equal((await app.game()).dmgTarget, 1);
  assert.match(await app.panel(1).locator('.dmg.target').textContent(), /Commander damage target/);
  assert.equal(await app.panel(0).locator('.dmgRow .ctr').count(), 1, 'each other panel offers its commander\'s damage');
  assert.equal(await app.panel(2).locator('.dmgRow .ctr').count(), 1);
  const rots = [await app.rotation(0), await app.rotation(1), await app.rotation(2)];
  assert.deepEqual(rots, [90, 90, 90], 'every panel turns to face the target');
  await evidence.shot('damage-mode');

  for (let i = 0; i < 3; i++) await plus(2).tap();
  assert.equal(await app.panel(2).locator('.ctr b').textContent(), '3');
  assert.match(await app.panel(1).locator('.dmgLife').textContent(), /37/);
  let g = await app.game();
  assert.equal(g.players[1].cmd[2][0], 3);
  assert.equal(g.players[1].life, 37);
  await evidence.shot('three-damage');

  await app.$('dmgDone').tap();
  assert.ok(!(await dmgMode()));
  assert.equal((await app.game()).dmgTarget, null);
  assert.match(await app.panel(1).locator('.a-damage').textContent(), /3/, 'the Damage tile lists the damage taken');
  await evidence.shot('tile-shows-damage');
  evidence.note('three commander damage from Yuriko to Krenko', { life: g.players[1].life });

  await app.swipe(1);
  assert.ok(await dmgMode(), 'a sideways swipe opens damage mode');
  assert.equal((await app.game()).dmgTarget, 1);
  await app.swipe(1);
  assert.ok(!(await dmgMode()), 'swiping the target again leaves it');
  evidence.note('swipe opened and closed damage mode');

  await app.openTool(1, 'damage');
  await app.hold(plus(2), 2800);
  g = await app.game();
  assert.ok(g.players[1].cmd[2][0] >= 21, `a hold reaches lethal (got ${g.players[1].cmd[2][0]})`);
  assert.equal(g.players[1].out.cause, 'cmd');
  assert.equal(g.players[1].life, 40 - g.players[1].cmd[2][0]);
  await evidence.shot('lethal-in-damage-mode');
  await app.$('dmgDone').tap();
  assert.match(await app.panel(1).locator('.out').textContent(), /commander damage/);
  await evidence.shot('knocked-out-by-commander');
  await evidence.storeDump('knocked-out-by-commander');
  evidence.note('21 from one commander knocked Krenko out', { cmd: g.players[1].cmd[2][0] });
};

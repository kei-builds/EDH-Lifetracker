// Commander damage: the Damage tile and a sideways swipe open damage mode for a player; damage lowers life, shows on the
// tile afterwards, and 21 from one commander knocks the player out.
import { PHONE_WITH_BARS } from '../lib.mjs';

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
  const header = async p => {
    assert.ok(await app.panel(p).locator('.a-damage > svg').isVisible(), 'Companion keeps the Damage icon while the tile lists damage');
    const h = await app.tileHeader(p, 'damage');
    assert.ok(h.labelUnderIcon && h.rowUnderLabel, 'the label sits under the icon and the damage rows under the label');
    assert.ok(Math.abs(h.iconTop - h.taxIconTop) <= 2, `the Damage header starts ${h.iconTop}px down its tile, the Tax tile's ${h.taxIconTop}px`);
  };
  await header(1);
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

  await app.openMenu();
  await app.$('toHome').tap();
  await page.setViewportSize(PHONE_WITH_BARS);
  await app.newGame({ players: 4, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow", 'Edgar Markov'] });
  await app.openTool(0, 'damage');
  for (const p of [1, 2, 3]) await plus(p).tap();
  await app.$('dmgDone').tap();
  await app.openTool(0, 'counters');
  const counter = n => app.sheet(0).locator('.ctr').nth(n).getByRole('button', { name: '+', exact: true });
  await counter(0).tap();
  await counter(0).tap();
  await counter(1).tap();
  await app.sheet(0).getByRole('button', { name: 'Done' }).tap();
  assert.equal(await app.panel(0).locator('.a-damage .vals .v').count(), 3, 'one damage row per hitter');
  assert.equal(await app.panel(0).locator('.a-counters .vals .v').count(), 2, 'one counters row per nonzero counter');
  await header(0);
  const size = async (p, kind) => { const b = await app.panel(p).locator(`.a-${kind}`).boundingBox(); return [Math.round(b.width), Math.round(b.height)]; };
  assert.deepEqual(await size(1, 'damage'), await size(1, 'tax'), 'an empty Damage tile matches the Tax tile in size');
  assert.deepEqual(await size(1, 'counters'), await size(1, 'mana'), 'an empty Counters tile matches the Mana tile in size');
  assert.notDeepEqual(await size(0, 'damage'), await size(0, 'tax'), 'a Damage tile with rows has grown past the Tax tile');
  const inside = (p, kind) => app.panel(p).locator(`.a-${kind}`).evaluate(tile => {
    const t = tile.getBoundingClientRect();
    return [...tile.querySelectorAll('.vals .v')].every(r => { const b = r.getBoundingClientRect(); return b.left >= t.left - .5 && b.top >= t.top - .5 && b.right <= t.right + .5 && b.bottom <= t.bottom + .5; });
  });
  assert.ok(await inside(0, 'damage') && await inside(0, 'counters'), 'every row sits inside its tile');
  await app.openTool(0, 'damage');
  await plus(0).tap();
  await app.$('dmgDone').tap();
  assert.equal(await app.panel(0).locator('.a-damage .vals .v').count(), 4, 'damage from your own commander makes a fourth row');
  assert.ok(await inside(0, 'damage'), 'four rows still fit inside the tile on a phone with bars');
  await evidence.shot('four-player-tiles');
  evidence.note('four players at 360x704 with three damage rows and two counter rows on You');
};

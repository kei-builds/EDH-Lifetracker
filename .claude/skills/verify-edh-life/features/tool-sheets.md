# Tool sheets

The Tax, Mana and Counters tiles open a sheet over the panel. Tax counts commander tax in steps of 2 and has a Partner
switch; Mana counts storm for the whole table and a floating pool of six colors with Empty pool; Counters tracks poison,
energy, experience and rad, opens the rad reminder, and holds Concede. Nonzero values show as chips or on the tiles.

## Sub-features

- `ts-tax` raises and lowers commander tax by 2 and shows a crown chip with the total.
- `ts-storm` counts spells cast this turn, shows a storm chip, and resets to 0 when the turn passes.
- `ts-mana` counts each color of floating mana, shows a mana chip, and Empty pool clears it.
- `ts-counters` raises and lowers poison, energy, experience and rad; the Counters tile lists nonzero ones.
- `ts-rad` opens the Radiation reminder with its rules text from the Rad name, and Close dismisses it.
- `ts-poison-out` knocks a player out at 10 poison; Concede becomes a disabled Out.
- `ts-concede` knocks the player out with cause conceded.
- `ts-done` closes a sheet with Done.

## How to get to it (user POV)

- Tap the `Tax`, `Mana` or `Counters` tile on a panel (in Minimal, tap the name first).
- Tap `Rad` inside the Counters sheet for the reminder.
- Tap `Concede` inside the Counters sheet.

## Driving it with the verify-edh-life harness

Preconditions:

- A 2-player game is on the table: `await app.newGame({ players: 2, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss'] })`.
- `plusIn(scope, n)` means `scope.locator('.ctr').nth(n).getByRole('button', { name: '+', exact: true })`.

- **Tax.** `await app.openTool(0, 'tax')`; the sheet's `h3` reads `Commander tax`. Tap `plusIn(app.sheet(0))` twice: the counter reads `4` and `game.players[0].tax` is `[4, 0]`. `Done` closes the sheet and `app.panel(0).locator('.badges')` contains `4`.
- **Storm and mana.** `await app.openTool(0, 'mana')`. Tap `app.sheet(0).locator('.storm')` twice: its `b` reads `2` and `game.storm` is 2. Tap `plusIn(app.sheet(0), 0)`: `players[0].mana.W` is 1. `Empty pool` sets it to 0. After `Done` the badges contain `2`.
- **Storm resets.** `await app.$('pass').tap()`: `game.storm` is 0 and `game.active` is 1.
- **Undo the pass.** `await app.$('undo').tap()`: `game.storm` is 2 again and `game.active` is 0. Pass again before going on.
- **Counters.** `await app.openTool(1, 'counters')`; `h3` reads `Counters`. Tap `plusIn(app.sheet(1), 0)` three times and `plusIn(app.sheet(1), 1)` once: `players[1].counters` has poison 3 and energy 1.
- **Rad reminder.** Tap `app.sheet(1).getByRole('button', { name: 'What rad counters do' })`. `#radInfo` is visible and `#radText` mentions rad counters. `await app.$('radClose').tap()` hides it.
- **Tile.** After `Done`, `app.panel(1).locator('.a-counters')` contains `3` and `1`.
- **Poison knockout.** Reopen Counters on player 1 and `await app.hold(plusIn(app.sheet(1), 0), 1400)`. Poison is at least 10, `players[1].out.cause` is `poison`, the `Out` button in the sheet is disabled, and after `Done` the panel's `.out` reads `poison`.
- **Concede.** `await app.openTool(0, 'counters')` then tap `Concede`. `players[0].out.cause` is `concede` and the panel's `.out` reads `conceded`.
- **Proof.** `await evidence.shot('tax-sheet')`, `('mana-sheet')`, `('counters-sheet')`, `('rad-reminder')`, `('counters-tile')`, `('poisoned-out')`, `('conceded')`, `await evidence.storeDump('both-out')`.

## Gotchas

- Storm, mana, tax, Partner and Move my seat add no undo step of their own; poison and the other counters do. Undo returns the whole game to before the last step, those included, so undoing a pass brings the storm count back and undoing a life tap drops any mana tapped after it.
- In Companion the poison and commander-damage chips are hidden (the tiles list them); assert on the Counters tile. In Minimal the chips show and open the status card.
- The counters inside a sheet are `.ctr` in order: Tax has one (two with Partner on), Mana has six (W U B R G C), Counters has four (poison, energy, experience, rad).
- The rad image needs Scryfall once; under the stub it is a 1x1 PNG, so do not judge the picture, only that `#radInfo` opened and closed.
- Holding past 10 poison keeps counting; assert `>= 10`.
- Once both players in a 2-player game are out the hub's turn button reads `Finish`.

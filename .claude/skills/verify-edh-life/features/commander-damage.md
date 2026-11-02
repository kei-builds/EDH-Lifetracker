# Commander damage

Commander damage switches the whole table to damage mode for one player: every panel turns to face them and shows the
damage its commander has dealt them, each point also lowers their life, the Damage tile lists the totals afterwards,
and 21 from a single commander knocks them out.

## Sub-features

- `cmd-open-tile` opens damage mode from a panel's Damage tile.
- `cmd-open-swipe` opens damage mode with a sideways swipe across the panel, and a second swipe on the target leaves it.
- `cmd-face` turns every panel to face the target.
- `cmd-count` adds damage from another player's commander and lowers the target's life by the same amount.
- `cmd-done` leaves damage mode with Done in the hub or the back chevron on the target panel.
- `cmd-tile` lists each source's total on the target's Damage tile, in Companion as rows under the tile's icon and label, which start where the Tax tile's do. The tile is the Tax tile's size while empty and grows with its rows; four rows, your own commander's included, fit on every panel. Rows are in one order on every panel, the player's own commander first, then each opponent clockwise from their left, with the numbers aligned on their right edge.
- `cmd-lethal` knocks the target out at 21 from one commander, with cause commander damage.

## How to get to it (user POV)

- Tap the `Damage` tile on a player's panel (in Minimal, tap the name first).
- Swipe sideways across a player's panel, sideways from that player's seat, lifting the finger to act.
- Leave with `Done` in the hub, the `‹` chevron on the target panel, or a second swipe on the target.

## Driving it with the verify-edh-life harness

Preconditions:

- A 3-player game is on the table: `await app.newGame({ players: 3, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow"] })`.

- **Open from the tile.** `await app.openTool(1, 'damage')`. `#table` has class `dmgMode`; `game.dmgTarget` is 1; `app.panel(1).locator('.dmg.target')` reads `Commander damage target`; panels 0 and 2 each have one `.dmgRow .ctr`; rotations are all 90.
- **Add damage.** Tap `+` three times on Yuriko's row. `await app.panel(2).locator('.ctr').getByRole('button', { name: '+', exact: true }).tap()` ×3. The row's `b` reads `3`, `app.panel(1).locator('.dmgLife')` shows 37, `game.players[1].cmd[2][0]` is 3 and `players[1].life` is 37.
- **Done.** `await app.$('dmgDone').tap()`. `dmgMode` is gone, `game.dmgTarget` is null, and `app.panel(1).locator('.a-damage')` contains `3`. The tile's `svg` is visible, and `app.tileHeader(1, 'damage')` reports the label under the icon, the first row under the label, and `iconTop` within 2 px of `taxIconTop`.
- **Four players at 360x704.** Leave for home through the menu, `page.setViewportSize({ width: 360, height: 704 })`, start a 4-player game with every seat named, deal one damage from each opponent to You, then add two poison and one energy on You. `.a-damage .vals .v` counts 3, `.a-counters .vals .v` counts 2, and the header check holds on panel 0.
- **Swipe in and out.** `await app.swipe(1)` enters damage mode for player 1; `await app.swipe(1)` again leaves it.
- **Lethal.** Reopen from the tile and hold `+` on Yuriko's row: `await app.hold(plus(2), 2800)`. `cmd[2][0]` is at least 21, `players[1].out.cause` is `cmd`, and life equals 40 minus the damage. After `Done`, `app.panel(1).locator('.out')` reads `commander damage`.
- **Proof.** `await evidence.shot('damage-mode')`, `('three-damage')`, `('tile-shows-damage')`, `('lethal-in-damage-mode')`, `('knocked-out-by-commander')`, `await evidence.storeDump('knocked-out-by-commander')`, `await evidence.shot('four-player-tiles')`.

## Gotchas

- Any click within 400 ms of a swipe is swallowed on purpose. `app.swipe` waits 450 ms before returning; a hand-rolled swipe must too.
- A swipe that starts within 24 px of a side edge or 32 px of the bottom is left to the phone's gestures and does nothing. `app.swipe` starts from the panel center.
- Sideways is from the player's seat: along x for a panel facing up or down (`r0`, `r180`), along y for a side panel (`r90`, `r270`). `app.swipe` reads the panel's class.
- A swipe on a player who is Out, or while a tool sheet is open, does nothing. With fewer than 2 players there is no damage mode.
- The hold goes past 21; the knockout happens once at the first point that reaches 21. Assert `>= 21`, not `== 21`.
- With a partner pair the row splits in two counters (`.dmgRow.split`); this journey covers single commanders only.

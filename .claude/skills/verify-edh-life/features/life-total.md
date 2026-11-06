# Life total

Life total lets a player tap the left half of their panel for −1 and the right half for +1, hold to keep counting, see a
floating running total, undo a burst of taps as one step, watch the numeral turn amber at 10 and red at 5, and get
knocked out at 0.

## Sub-features

- `life-tap` changes life by one per tap on either half.
- `life-delta` floats the running total (`+3`, `-3`) beside the numeral for about 1.5 s.
- `life-hold` keeps counting while a half is held.
- `life-undo-burst` treats taps on one control within 1.5 s of each other, or one hold and any tap within 1.5 s of its last count, as a single undo step.
- `life-colors` tints the numeral amber at 10 or below and red at 5 or below, with a matching glow, in both looks.
- `life-out` marks the player Out on the change that takes them to 0 or below, with the turn and cause, and offers Finish when one player is left.
- `life-back` brings an Out player back in with `Bring back` on their panel, at the life they have. They stay in below 0 and go out again only by crossing the line again. Bring back is one undo step.

## How to get to it (user POV)

- Tap the left or right half of any panel on the table.
- Press and hold a half.
- Tap `Undo` in the hub.
- Tap `Bring back` on a panel that is Out.

## Driving it with the verify-edh-life harness

Preconditions:

- A 2-player game at 40 life is on the table: `await app.newGame({ players: 2, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss'] })`.

- **Three taps.** Tap the opponent's minus half three times. `await app.tapLife(1, -1, 3)`. `await app.life(1)` is 37 and `await app.delta(1)` is `-3`. `await app.game()` has `players[1].life` 37 and three events with a `life` field; `(await app.store()).undo.length` is 1.
- **Undo the burst.** Tap Undo. `await app.$('undo').tap()`. Life is back to 40 and the undo stack is empty.
- **Hold.** Hold the user's plus half. `await app.hold(app.lifeButton(0, 1), 900)`. Life is between 42 and 47. One `Undo` returns it to 40.
- **Long hold then tap.** `await app.hold(app.lifeButton(0, -1), 2000); await app.tapLife(0, -1)`. Life is between 22 and 27 and the undo stack grew by 1. One `Undo` returns it to 40.
- **A pause splits.** `await app.tapLife(1, -1, 2); await page.waitForTimeout(1700); await app.tapLife(1, -1, 2)`. Life is 36 and the undo stack grew by 2. One `Undo` gives 38, a second 40.
- **Low life.** Tap the opponent down. `await app.tapLife(1, -1, 30)` gives 10 and `app.panel(1).locator('.num.warn')` exists; five more give 5 and `.num.lethal` exists. The numeral's computed `textShadow` contains `rgba(255, 189, 74, 0.35)` at 10 and `rgba(255, 106, 94, 0.4)` at 5.
- **Low life in Minimal.** After the knockout undo, go home through the menu and `await app.newGame({ players: 2, look: 'minimal' })`. Thirty taps down on the opponent give `.num.warn` with the amber glow in `textShadow`; five more give the red glow.
- **Knockout.** Five more taps reach 0. `app.panel(1).locator('.out')` reads `Out` and `turn 1 · life`; `game.players[1].out.cause` is `life`; `#turnLabel` reads `Finish`.
- **Bring back.** `await app.panel(1).getByRole('button', { name: 'Bring back' }).tap()`. `players[1].out` is null, life is 0, and `#turnLabel` no longer reads `Finish`. Two more taps down give -2 with `out` still null. After a 1.7 s pause, three taps up and one down reach 0 again and `players[1].out.cause` is `life`.
- **Undo the lot.** Four `Undo` taps: life -2 and in; life 0 and in; Out again with cause `life` (Bring back was a step of its own); then life 40, no `.out`, `players[1].out` null, because the whole first run of taps was one step.
- **Proof.** `await evidence.shot('three-taps')`, `('after-hold')`, `('low-life')`, `('knocked-out')`, `await evidence.aria('knocked-out')`, `await evidence.storeDump('knocked-out')`, `await evidence.shot('brought-back')`, `('low-life-minimal')`.

## Gotchas

- A finger that moves more than 12 px before lifting is a swipe, not a tap, and counts nothing. `tap()` does not move.
- The hold counts once at 80 ms and then every 110 ms from 450 ms in, so a 900 ms hold lands on 44 to 46; assert a range.
- The floating delta lives 1.5 s. Read `app.delta` right after the taps, before a screenshot wait.
- `app.life` reads the numeral's first text node; `textContent` of `.num` would include the delta.
- A long run of quick taps is one undo step by design. To get separate steps, pause more than 1.5 s between them.
- A knockout fires on the change that crosses a line (0 life, 21 from one commander, 10 poison), not for being past it. Taking the number back leaves the player Out; only `Bring back` or `Undo` brings them in. The Out overlay covers the life halves, so an Out player's life cannot be tapped.
- The red and amber tints are classes `lethal` and `warn` on `.num`; the screenshot shows the color, the class proves it, and the computed `textShadow` proves the glow is not lost to a look's own shadow rule.

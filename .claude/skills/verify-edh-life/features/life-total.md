# Life total

Life total lets a player tap the left half of their panel for −1 and the right half for +1, hold to keep counting, see a
floating running total, undo a burst of taps as one step, watch the numeral turn amber at 10 and red at 5, and get
knocked out at 0.

## Sub-features

- `life-tap` changes life by one per tap on either half.
- `life-delta` floats the running total (`+3`, `-3`) beside the numeral for about 1.5 s.
- `life-hold` keeps counting while a half is held.
- `life-undo-burst` treats taps on one control within 1.5 s of each other, or one hold, as a single undo step.
- `life-colors` tints the numeral amber at 10 or below and red at 5 or below.
- `life-out` marks the player Out at 0 with the turn and cause, and offers Finish when one player is left.

## How to get to it (user POV)

- Tap the left or right half of any panel on the table.
- Press and hold a half.
- Tap `Undo` in the hub.

## Driving it with the verify-edh-life harness

Preconditions:

- A 2-player game at 40 life is on the table: `await app.newGame({ players: 2, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss'] })`.

- **Three taps.** Tap the opponent's minus half three times. `await app.tapLife(1, -1, 3)`. `await app.life(1)` is 37 and `await app.delta(1)` is `-3`. `await app.game()` has `players[1].life` 37 and three events with a `life` field; `(await app.store()).undo.length` is 1.
- **Undo the burst.** Tap Undo. `await app.$('undo').tap()`. Life is back to 40 and the undo stack is empty.
- **Hold.** Hold the user's plus half. `await app.hold(app.lifeButton(0, 1), 900)`. Life is between 42 and 47. One `Undo` returns it to 40.
- **Low life.** Tap the opponent down. `await app.tapLife(1, -1, 30)` gives 10 and `app.panel(1).locator('.num.warn')` exists; five more give 5 and `.num.lethal` exists.
- **Knockout.** Five more taps reach 0. `app.panel(1).locator('.out')` reads `Out` and `turn 1 · life`; `game.players[1].out.cause` is `life`; `#turnLabel` reads `Finish`.
- **Undo the knockout.** `await app.$('undo').tap()`. Life is 40, no `.out`, `players[1].out` is null, because the whole unbroken run of taps was one step.
- **Proof.** `await evidence.shot('three-taps')`, `('after-hold')`, `('low-life')`, `('knocked-out')`, `await evidence.aria('knocked-out')`, `await evidence.storeDump('knocked-out')`.

## Gotchas

- A finger that moves more than 12 px before lifting is a swipe, not a tap, and counts nothing. `tap()` does not move.
- The hold counts once at 80 ms and then every 110 ms from 450 ms in, so a 900 ms hold lands on 44 to 46; assert a range.
- The floating delta lives 1.5 s. Read `app.delta` right after the taps, before a screenshot wait.
- `app.life` reads the numeral's first text node; `textContent` of `.num` would include the delta.
- A long run of quick taps is one undo step by design. To get separate steps, pause more than 1.5 s between them.
- The red and amber tints are classes `lethal` and `warn` on `.num`; the screenshot shows the color, the class proves it.

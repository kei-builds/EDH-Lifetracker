# Turns and finish

The turn button passes the turn clockwise, the round goes up when play returns to whoever went first, a pass can be
undone, Options opens the menu, a game survives going home and resuming, and Finish game leads to the end screen, which
for anything but a fully named 4-player game ends the game on the phone without queueing it for the sheet.

## Sub-features

- `tf-pass` moves the white outline and the hub's name to the next living player.
- `tf-round` increments the turn count when play returns to the first player.
- `tf-undo-pass` undoes one pass as one step.
- `tf-menu` opens the options menu from the hub.
- `tf-switch-look` switches the look from the menu, rebuilds the table in place, saves it as the preference, and switches back the same way.
- `tf-keep` goes home with the game kept and resumes from the home screen.
- `tf-restart` restarts with the same players after a confirmation: a new game id, round 1, the first player active, every life back at the start, no undo history, and any sheet left open closed.
- `tf-abandon` abandons the game after a confirmation: home with nothing to resume, and the next game starts with every panel on its face, whatever was open when the last one was abandoned.
- `tf-finish-screen` opens the end screen pre-filled from the game, with the sheet-only details hidden for a game that is not sent.
- `tf-winner-required` refuses to end without a winner.
- `tf-end` ends the game, clears it from storage, leaves the queue alone, and shows the home screen.

## How to get to it (user POV)

- Tap the turn button in the middle of the hub.
- Tap `Options` in the hub, then `Finish game`, `Back to home (keep game)`, and so on.
- Tap `Finish` on the turn button once only one player is left.
- Tap `Resume game` on the home screen.

## Driving it with the verify-edh-life harness

Preconditions:

- A 3-player game with You going first: `await app.newGame({ players: 3, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow"], first: 0 })`.
- `active()` means the index of `#board > .panel.active` among the panels.

- **Pass three times.** `#turnLabel` reads `Turn 1` and `#activeLabel` `Atraxa`. `await app.$('pass').tap()` moves `active()` to 1 and the label to `Krenko`; again to 2; again to 0 with `Turn 2`. `game.round` is 2 and three events carry a `turn` field.
- **Undo a pass.** `await app.$('undo').tap()`: `game.round` is 1 and `game.active` is 2.
- **Menu, leave, resume.** `await app.openMenu()` shows `#menu`. `await app.$('toHome').tap()` shows the home screen; `await app.$('resumeGame').tap()` shows the table again with `await app.life(0)` 40.
- **Restart.** `await app.tapLife(1, -1, 2); await app.$('pass').tap(); await app.openTool(1, 'mana')`, then `await app.openMenu(); await app.$('resetLife').tap(); await app.$('confirmOk').tap()`. `game.id` has changed, `game.round` is 1, `game.active` 0, the names are the same, `await app.life(1)` is 40, `app.sheet(1)` is gone and `store.undo` is empty; `await app.$('undo').tap()` toasts `Nothing to undo`.
- **Abandon.** `await app.openTool(0, 'mana'); await app.openMenu(); await app.$('abandon').tap(); await app.$('confirmOk').tap()`. Home shows, `store.game` is null, `Resume game` is hidden. Start the 3-player game again with `app.newGame`: `app.sheet(0)` count is 0.
- **Finish screen.** `await app.openMenu(); await app.$('finishNow').tap()`. `await app.screen()` is `finish`; `#finishNote` says the game won't be sent; `#saveGame` reads `End game`; `#winner` has 4 buttons; `#turns` holds `1`; `#detailsWrap` is hidden.
- **Winner required.** `await app.$('saveGame').tap()` sets `#finishMsg` to `Pick who won.`
- **End.** `await app.seg('winner', 'Krenko, Mob Boss').tap(); await app.seg('victory', 'Combo').tap(); await app.$('saveGame').tap()`. The home screen shows, `#toast` reads `Game ended`, `store.game` is null, `store.queue.length` is 0, `Resume game` is hidden and the primary button reads `New game`.
- **Proof.** `await evidence.shot('turn-2')`, `('menu')`, `('restarted')`, `('finish-screen')`, `await evidence.aria('finish-screen')`, `await evidence.shot('home-after-end')`, `await evidence.storeDump('after-end')`.

## Gotchas

- Passing skips players who are Out; with one player left the turn button reads `Finish` and opens the end screen instead of passing.
- The round only rises when the turn reaches a position at or before the first player's, so with the first player Out it still counts correctly, but asserting `round` after knockouts needs that in mind.
- The toast lives 2.2 s; read it right after the tap.
- The `Save game` path, with Game details, pod and power required and a `queue` entry written, only happens for 4 players with every seat named, and is not covered by this journey.
- `Restart with same players` and `Abandon game` each show a confirmation card (`#confirm`); `Cancel` on it reopens the menu.
- A restart keeps the art already loaded and starts the loader again for what is missing; the harness stub has no art, so that part is not proven here.

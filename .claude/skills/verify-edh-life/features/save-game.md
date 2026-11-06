# Save game

Save game is the end of a 4-player game in which every seat has a commander name. Finish game opens the end screen
with the sheet-only Game details showing, Save game writes one entry to the sync queue with the setup, the winner, the
eliminations and the whole event log, clears the game from the phone, and the home screen counts the game as saved.

## Sub-features

- `sg-finish-screen` opens the end screen with `Game details` showing, the turn count and the first elimination
  pre-filled from the game, and the button reading `Save game`.
- `sg-pod-setup` asks for the pod in setup for a 4-player game (`#setupPod`, under the Look row), pre-filled with the last game's pod, with a wrapping row of pills (`#podPick`) for every pod the sheet or a saved game knows: a tap fills the field, the pill matching the field is lit. The pod is saved with the game and pre-fills the finish screen's Pod field.
- `sg-details-required` refuses to save until the pod, power and date under Game details are filled.
- `sg-sol-rings` asks how many turn 1 Sol Rings there were (0 to 4, 0 by default) and, only when there was one, whether a Sol Ring player won.
- `sg-queue` writes one entry to `store.queue` with `id`, `setup` (date, pod, power, bracket, deck, opps, seat),
  `winner`, `victory`, `turns`, `elim`, `sol`, `solWin`, `notes`, `eliminations` and `events`.
- `sg-cleared` leaves `store.game` null and shows the home screen with `Game saved`.
- `sg-home-count` counts the saved game on the home screen when no sync URL is set.

## How to get to it (user POV)

- Start a 4-player game with every commander named, tap `Options` in the hub, then `Finish game`.
- Tap `Finish` on the turn button once only one player is left.
- Tap `Game details` on the end screen to open the date, pod, power and bracket fields.

## Driving it with the verify-edh-life harness

Preconditions:

- A 4-player game with every seat named and You going first: `await app.newGame({ players: 4, names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss', "Yuriko, the Tiger's Shadow", 'Edgar Markov'], first: 0, onSetup })`, where `onSetup` fills the pod (below).
- No sync URL is set, so the queue entry stays on the phone and the home screen counts it.

- **Pod in setup.** Inside `onSetup`: `#podWrap` is not hidden, `#setupPod` is empty and `#podPick` is hidden (no pod known yet). `await app.$('setupPod').fill('Tuesday pod')`. After Start game, `(await app.game()).pod` is `Tuesday pod`.

- **Play.** `await app.tapLife(1, -1, 3)`, `await app.tapLife(2, 1, 2)`, `await app.tapLife(3, -1, 40)`. Player 3's panel shows `.out` and `game.players[3].out.cause` is `life`.
- **Finish screen.** `await app.openMenu(); await app.$('finishNow').tap()`. `await app.screen()` is `finish`, `#finishNote` is empty, `#saveGame` reads `Save game`, `#detailsWrap` is not hidden, `#turns` holds `1` and `#elim` holds `1`. `#pod` already holds `Tuesday pod` and `#detailsSummary` shows it.
- **Fill.** `await app.seg('winner', 'Krenko, Mob Boss').tap(); await app.seg('victory', 'Combat Damage').tap(); await app.$('notes').fill('Turn two Krenko')`.
- **Details required.** `await app.$('saveGame').tap()` with the power still unpicked: `#finishMsg` reads `Fill in the pod and power under Game details.`, `#detailsWrap` is open and the screen is still `finish`.
- **Details.** `await app.$('date').fill('2026-10-31'); await app.seg('power', 'Mid').tap(); await app.seg('bracket', '3').tap()`.
- **Date required.** `await app.$('date').fill(''); await app.$('saveGame').tap()`: `#finishMsg` reads `Pick a date.` and `store.queue` is still empty. Fill the date again before saving.
- **Save.** `await app.$('saveGame').tap()`. The home screen shows and `#toast` reads `Game saved`.
- **Queue entry.** `const store = await app.store()`: `store.game` is null and `store.queue` has one entry whose `id` is a string, `setup.date` is `2026-10-31`, `setup.pod` is `Tuesday pod`, `setup.power` is `Mid Power`, `setup.bracket` is `3`, `setup.deck` is the first name, `setup.opps` is the other three, `setup.seat` is `1`, `winner` is `Opponent 1`, `victory` is `Combat Damage`, `turns` and `elim` are `1`, `notes` is what was typed, `eliminations` is `[{ name: 'Edgar Markov', turn: 1, cause: 'life' }]` and `events` has 46 entries.
- **Home count.** `#syncStatus` reads `1 game saved on this phone. Add your sync URL and key in Settings to send games to your sheet.`
- **The pod comes back.** `store.lists.pods` is `['Tuesday pod']` and `store.lists.last` is `{ pod: 'Tuesday pod', power: 'Mid Power', bracket: '3' }` before any sync. `await app.$('newGame').tap()` (4 players is the remembered count): `#setupPod` holds `Tuesday pod` and the `#podPick` button `Tuesday pod` has class `on`; `fill('Thursday')` takes the class away; tapping the pill puts `Tuesday pod` back in the field. `cancelSetup` returns home.
- **Proof.** `await evidence.shot('setup-pod')`, `('table-before-finish')`, `('finish-filled')`, `await evidence.aria('finish-filled')`, `await evidence.shot('home-after-save')`, `await evidence.storeDump('after-save')`, `await evidence.shot('setup-pod-pill')`.

## Gotchas

- The date, pod, power and bracket fields sit inside a closed `<details>`; `fill` on them fails until the summary is tapped or a refused save opens it. Reading `#pod` with `inputValue()` works while it is closed.
- The pod pills are only there once `store.lists.pods` has entries: from the sheet stand-in (which has none) or from a game saved on this phone. Before that `#podPick` is hidden.
- `#date` is pre-filled with today; fill a fixed date so the assertion does not depend on the clock.
- The toast lives 2.2 s; read it right after the tap.
- The harness stops at the queue. Syncing the entry needs the owner's Apps Script deployment and is not covered.
- A 4-player game with any seat blank refuses to start, so the "won't be sent" path is covered by `turns-and-finish` with 3 players, not here.

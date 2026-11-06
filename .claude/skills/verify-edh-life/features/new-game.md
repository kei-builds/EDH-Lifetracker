# New game

New game takes a player from the home screen through setup (life, player count, layout, seat, look, commanders, who
goes first) to the table, remembers the setup choices, keeps a game across leaving for home, and discards it only after
a confirmation.

## Sub-features

- `ng-home` shows the home screen with New game, the sync status line and Settings.
- `ng-setup` fills the setup screen and starts a game whose panels show the chosen life and names.
- `ng-prefs` remembers life, player count and layout for the next setup.
- `ng-look` starts the table in Companion (tiles always showing, the name along the bottom of a full-height life box) or Minimal (tiles on demand, hide after 4 s).
- `ng-keep` leaves for home with the game kept and resumes it.
- `ng-discard` starts a new game over a kept one after a confirmation card.
- `ng-placeholders` names blank seats You, Player 2, Player 3 and so on when fewer than 4 players.
- `ng-suggest` offers commander names in a row under any seat as it is typed, your own included: your decks and known commanders first, then Scryfall's matches; a refused lookup is forgotten so the next letters ask again. A tapped suggestion fills the seat and moves the focus to the next field; on the last field it blurs, which puts the phone's keyboard away.
- `ng-faces` treats a card with two faces or an adventure as one commander: Scryfall names it "Kellan, the Fae-Blooded // Birthright Boon", the suggestion shows the front face, and a seat typed either way starts as Kellan alone, not a partner pair. That holds when the name came from the sheet too (an older app version saved it by both faces): a sheet name in two halves is checked on Scryfall before it is trusted.
- `ng-tap-under-row` lands a tap on anything below the showing suggestion row (Who goes first, Start game): the row hides once the tap is over, never at the press, so nothing moves up under the finger.
- `ng-checking` disables Start game while the names are being checked, and Cancel during the check cancels it: the game does not start when the answers arrive, and the next visit to setup starts fresh.
- `ng-pod-4` asks for the pod (`#podWrap`) only with 4 players; see `save-game.md` for the field itself.
- `ng-sheet` connects to the sheet in Settings (Save and test answers `Connected. N decks and M commanders loaded.`), after which its decks and commanders are suggested first and a partner pair picked into one box, "Thrasios, Triton Hero // Tymna the Weaver", starts as a pair.

## How to get to it (user POV)

- Tap `New game` on the home screen.
- Tap `New game (discards current)` on the home screen while a game is kept, then `Discard` on the card.
- Tap `Resume game` on the home screen to go back to a kept game.
- The `Look` row appears both in setup and under Settings; both set the same preference.

## Driving it with the verify-edh-life harness

Preconditions:

- Baseline state; the home screen is showing (`await app.screen()` is `home`).
- `#syncStatus` says to add a sync URL (no settings). The journey then connects to the harness's sheet stand-in (`SHEET` in `lib.mjs`, routed for every journey): tap `openSettings`, fill `setUrl` and `setKey` from `SHEET`, tap `saveSettings`, wait for `#settingsMsg` to read `Connected. 2 decks and 2 commanders loaded.`, tap `closeSettings`.

- **Home.** Look at the home screen. `await evidence.shot('home')`. `New game` is the primary button; `Resume game` is hidden.
- **A suggestion fills and moves on.** Inside `onSetup`, before Start game, with `seat0` holding `SHEET.pair` and `seat1` blank: `await app.$('seat0').fill('atr')`, `page.locator('#suggest button', { hasText: 'atr' })` appears under the seat; tap it, `seat0`'s value is `atr` and `document.activeElement.id` is `seat1`. Fill the pair back.
- **Suggestions after a refusal.** `page.route` answers the `/cards/autocomplete` request for `q=kre` with a 429 once (`{ times: 1 }`), then `await app.$('seat1').fill('kre')` and wait for that response, `await app.$('seat1').fill('kren')`, and a `#suggest button` reading `kren` appears.
- **A tap under the row lands.** With the `kren` row showing and `You` picked: `await app.seg('first', 'Opponent 1').tap()`. `#first button.on` reads `Opponent 1` after that one tap and `#suggest` is hidden. Tap `You` back.
- **An adventure is one commander, and the last seat closes the keyboard.** `await app.$('seat1').fill('kellan')` and two pills appear: one reading exactly `Kellan, the Fae-Blooded` (Scryfall's answer, `ADVENTURE` in `lib.mjs`, by its front face) and one reading `ADVENTURE.name`, both faces, from the sheet. Tap the sheet's: `seat1` reads `ADVENTURE.name`, the active element is no longer `seat1` (the last field blurs) and `#suggest` is hidden.
- **Setup and start.** Fill setup and start. `await app.newGame({ players: 2, life: 40, look: 'companion', names: [SHEET.pair], first: 0, onSetup })` with `onSetup` ending on the Kellan pill above. The table shows with 2 panels; `await app.life(0)` and `app.life(1)` are 40; `app.panel(0).locator('.name')` contains `Thrasios` and `app.panel(1).locator('.name')` contains `Kellan`; `await app.rotation(1)` is 180. `g.players[0]` is the pair with `partner` true; `g.players[1]` is named `Kellan, the Fae-Blooded` with `partner` false and `letters` `WR`. `await app.openTool(0, 'damage')` shows one `.dmgRow .ctr` on panel 1 and no `.dmgRow.split`; `await app.openTool(1, 'damage')` shows two `.dmgRow.split .ctr` on panel 0. `await app.$('dmgDone').tap()` after each.
- **Companion look.** Check the tiles. `app.panel(0)` has class `tools` and `.actions button` count is 4; `await app.theme()` is `companion`.
- **Persistence.** Read the state. `const g = await app.game()`: `g.n` 2, `g.life0` 40, `g.players[1].name` `Krenko, Mob Boss`, `g.named` `[true, true]`, `g.active` 0, `g.round` 1. `(await app.store()).prefs.life` is `'40'` and `.players` is `'2'`. `await evidence.storeDump('after-start')`.
- **Leave and keep.** Open the menu and go home. `await app.openMenu(); await app.$('toHome').tap()`. The home screen shows `Resume game` and the primary button reads `New game (discards current)`.
- **Discard and Minimal.** Start another game in Minimal with blank seats. `await app.newGame({ players: 3, life: 20, look: 'minimal', first: 2 })` (the helper taps `Discard` on the card). `await app.theme()` is `minimal`; 3 panels at 20 life; rotations are `[0, 90, 270]`; `g.players` names are `You`, `Player 2`, `Player 3`; `g.active` is 2; `(await app.store()).prefs.life` is now `'20'` and `.players` `'3'`.
- **Tiles on demand.** Tap the name. `await app.panel(0).locator('.head').tap()`. The panel gains class `tools`; after `await page.waitForTimeout(4300)` it loses it again.
- **Cancel during the check.** Go home (`openMenu`, `toHome`), `page.route` the `/cards/named**` lookups with a 600 ms delay before `route.fallback()`, and fill a 2-player setup with two names not on the sheet. `await app.$('startGame').tap()`: `#setupMsg` reads `Checking names…` and `#startGame` is disabled. `await app.$('cancelSetup').tap()` shows home; 3 s later the screen is still `home`, `(await app.game()).n` is still 3 (the kept game) and the route counted 2 lookups. Unroute, open setup again: `#startGame` is enabled and `#setupMsg` empty.
- **Proof.** `await evidence.shot('table-companion')`, `await evidence.aria('table-companion')`, `await evidence.shot('table-minimal-tools')`. The screenshots show the panels, the life numerals and the hub; the ARIA snapshot lists the four tiles as buttons.

## Gotchas

- With 4 players every seat must have a name or Start game refuses with `Fill in every commander so the game can go to your sheet.` Fewer players may leave seats blank.
- Unknown names are looked up on Scryfall. Under the stub every name resolves; under `EDH_SCRYFALL=block` a `Couldn't find ... Start anyway?` card appears and `newGame` needs `startAnyway: true`.
- The stub's exact lookup answers either face of its adventure card with the whole card (named by both faces, red-white) and, like Scryfall, finds nothing for the two-faced name itself; every other name resolves as typed.
- The seat picker (`#seatPick`) and the 4-player layout row only show for 4 players and are not covered by this journey.
- `Pick at random` picks who goes first and shows a toast; the journey always picks explicitly.
- Reading `.name` with `innerText()` returns `KRENKO`; use `textContent()`.
- In Minimal the tiles hide 4 s after the name tap, and again as soon as a tile is picked; `app.openTool` handles the first tap for you.
- Suggestions are asked for from 3 letters on, 250 ms after the last keystroke, and a complete answer is filtered for longer queries instead of asked again. The stub echoes the typed text as the only suggestion, so a longer query after a successful stubbed answer finds nothing; the recipe above refuses the first query so the second is a real request. A page route outranks the context stub, so `{ times: 1 }` matters. The 429 lands in `summary.json`'s `failedLoads`; it is not the app's origin, so it does not fail the run.
- The row (`#suggest`) shows only names containing the typed text, at most 8. It does not follow the focus: it stays up until a suggestion is picked, the field's text matches nothing, the seats are redrawn (a player count change), or a click lands anywhere else on the setup screen. A `pointerdown` on the row is cancelled so the field keeps the focus until the tap's click lands; use `tap()` or `click()`, not `dispatchEvent`. Blurring a field by script does not hide the row.
- `#startGame` is disabled during the check, so `.tap()` on it then waits for it to be enabled; assert `isDisabled()` instead of tapping twice.

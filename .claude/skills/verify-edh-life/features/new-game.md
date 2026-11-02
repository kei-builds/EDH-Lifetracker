# New game

New game takes a player from the home screen through setup (life, player count, layout, seat, look, commanders, who
goes first) to the table, remembers the setup choices, keeps a game across leaving for home, and discards it only after
a confirmation.

## Sub-features

- `ng-home` shows the home screen with New game, the sync status line and Settings.
- `ng-setup` fills the setup screen and starts a game whose panels show the chosen life and names.
- `ng-prefs` remembers life, player count and layout for the next setup.
- `ng-look` starts the table in Companion (tiles always showing) or Minimal (tiles on demand, hide after 4 s).
- `ng-keep` leaves for home with the game kept and resumes it.
- `ng-discard` starts a new game over a kept one after a confirmation card.
- `ng-placeholders` names blank seats You, Player 2, Player 3 and so on when fewer than 4 players.

## How to get to it (user POV)

- Tap `New game` on the home screen.
- Tap `New game (discards current)` on the home screen while a game is kept, then `Discard` on the card.
- Tap `Resume game` on the home screen to go back to a kept game.
- The `Look` row appears both in setup and under Settings; both set the same preference.

## Driving it with the verify-edh-life harness

Preconditions:

- Baseline state; the home screen is showing (`await app.screen()` is `home`).
- `#syncStatus` says to add a sync URL (no settings).

- **Home.** Look at the home screen. `await evidence.shot('home')`. `New game` is the primary button; `Resume game` is hidden.
- **Setup and start.** Fill setup and start. `await app.newGame({ players: 2, life: 40, look: 'companion', names: ["Atraxa, Praetors' Voice", 'Krenko, Mob Boss'], first: 0, onSetup: () => evidence.shot('setup-filled') })`. The table shows with 2 panels; `await app.life(0)` and `app.life(1)` are 40; `app.panel(1).locator('.name')` contains `Krenko`; `await app.rotation(1)` is 180.
- **Companion look.** Check the tiles. `app.panel(0)` has class `tools` and `.actions button` count is 4; `await app.theme()` is `companion`.
- **Persistence.** Read the state. `const g = await app.game()`: `g.n` 2, `g.life0` 40, `g.players[1].name` `Krenko, Mob Boss`, `g.named` `[true, true]`, `g.active` 0, `g.round` 1. `(await app.store()).prefs.life` is `'40'` and `.players` is `'2'`. `await evidence.storeDump('after-start')`.
- **Leave and keep.** Open the menu and go home. `await app.openMenu(); await app.$('toHome').tap()`. The home screen shows `Resume game` and the primary button reads `New game (discards current)`.
- **Discard and Minimal.** Start another game in Minimal with blank seats. `await app.newGame({ players: 3, life: 20, look: 'minimal', first: 2 })` (the helper taps `Discard` on the card). `await app.theme()` is `minimal`; 3 panels at 20 life; rotations are `[0, 90, 270]`; `g.players` names are `You`, `Player 2`, `Player 3`; `g.active` is 2; `(await app.store()).prefs.life` is now `'20'` and `.players` `'3'`.
- **Tiles on demand.** Tap the name. `await app.panel(0).locator('.head').tap()`. The panel gains class `tools`; after `await page.waitForTimeout(4300)` it loses it again.
- **Proof.** `await evidence.shot('table-companion')`, `await evidence.aria('table-companion')`, `await evidence.shot('table-minimal-tools')`. The screenshots show the panels, the life numerals and the hub; the ARIA snapshot lists the four tiles as buttons.

## Gotchas

- With 4 players every seat must have a name or Start game refuses with `Fill in every commander so the game can go to your sheet.` Fewer players may leave seats blank.
- Unknown names are looked up on Scryfall. Under the stub every name resolves; under `EDH_SCRYFALL=block` a `Couldn't find ... Start anyway?` card appears and `newGame` needs `startAnyway: true`.
- The seat picker (`#seatPick`) and the 4-player layout row only show for 4 players and are not covered by this journey.
- `Pick at random` picks who goes first and shows a toast; the journey always picks explicitly.
- Reading `.name` with `innerText()` returns `KRENKO`; use `textContent()`.
- In Minimal the tiles hide 4 s after the name tap, and again as soon as a tile is picked; `app.openTool` handles the first tap for you.

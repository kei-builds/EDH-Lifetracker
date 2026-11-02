---
name: verify-edh-life
description: "Drive EDH Life, the phone life tracker in life-tracker/, in a real Chrome the way a player does and prove a change works: launch, doctor, scripted journeys, screenshots, ARIA snapshots and localStorage dumps as evidence. Use after changing app.js, index.html or style.css, or whenever asked to verify, prove or screenshot a feature of the app."
---

# Verify EDH Life

EDH Life is a static web app (`life-tracker/index.html`, `app.js`, `style.css`, `sw.js`; no build step) meant to be
installed on a phone. This skill drives it in headless Chrome at phone size through Playwright, with the app served from
this checkout and Scryfall stubbed, and leaves evidence a reader can check without rerunning anything.

Everything lives under `.claude/skills/verify-edh-life/`:

| Path | What it is |
| --- | --- |
| `harness/edh.mjs` | The CLI. Run it as `node .claude/skills/verify-edh-life/harness/edh.mjs <command>` from the repo root. |
| `harness/lib.mjs` | The session (server, browser, Scryfall stub, evidence) and the `app` helpers journeys use. |
| `harness/journeys/*.mjs` | One scripted journey per mapped feature. |
| `features/` | The feature map: what each feature is, how a player reaches it, how to drive it, what proves it. Read `features/README.md` first. |
| `evidence/` | Run output, one folder per run. Git-ignored, never deleted by the harness. |

Requirements: Node 24 (present), Google Chrome or Microsoft Edge installed (both are), and `playwright-core` in
`harness/node_modules`. It is git-ignored, so on a fresh clone run once:

```
cd .claude/skills/verify-edh-life/harness && npm install
```

No browser download happens: Playwright drives the installed Chrome, falling back to Edge.

## Launch

There is nothing to build and nothing to start before a journey. Every `journey` run starts its own static server on a
free 127.0.0.1 port, opens its own Chrome context at 360x780 CSS px with touch (the Samsung S25 class target), blocks the
service worker so the files always come from disk, and closes both when it ends. Ready means the home screen (`#home`)
or a resumed table (`#table`) is visible; the session waits for that before the journey body runs.

Isolation: each run has its own origin (its port) and a fresh browser profile, so its `localStorage` is empty at start
and shared with nothing. Runs can go side by side, and none touches the dev server on 8766 or the user's phone.

To look at the app by hand, or to point another tool at it:

```
node .claude/skills/verify-edh-life/harness/edh.mjs serve start          # ready when it prints "ready: pid N at http://127.0.0.1:8767/"
node .claude/skills/verify-edh-life/harness/edh.mjs serve stop
```

To watch a journey run in a visible window: `EDH_VERIFY_HEADED=1`, and `EDH_VERIFY_HEADED_PAUSE=3000` to hold the last
screen for 3 s. To drive an app that is already being served elsewhere (the dev server, or the GitHub Pages site):
`EDH_VERIFY_URL=http://localhost:8766/`. The session then starts no server of its own.

## Doctor

```
node .claude/skills/verify-edh-life/harness/edh.mjs doctor
```

Read-only. It prints `ok`/`FAIL` for: the four app files present, the app version from `sw.js` and the git commit,
`playwright-core` installed, Chrome or Edge present, a persistent server (if one is recorded) alive and answering with
this checkout's `sw.js`, and no browser left behind by an earlier run. Exit 0 means healthy. Run it first whenever a
journey fails in a way that does not look like the app's fault.

## Drive

```
node .claude/skills/verify-edh-life/harness/edh.mjs list
node .claude/skills/verify-edh-life/harness/edh.mjs journey life-total
node .claude/skills/verify-edh-life/harness/edh.mjs journey all
```

Exit code 1 if any journey failed. The journeys are the recipes in `features/`, scripted:

| Journey | Feature file | Proves |
| --- | --- | --- |
| `new-game` | `features/new-game.md` | Home, setup, table in both looks; game and preferences in storage |
| `life-total` | `features/life-total.md` | Taps, the floating delta, press-and-hold, undo grouping, low-life colors, knockout at 0 |
| `commander-damage` | `features/commander-damage.md` | Damage tile and swipe open damage mode; damage lowers life; 21 knocks out |
| `tool-sheets` | `features/tool-sheets.md` | Tax, mana and storm, counters, the rad reminder, poison knockout, Concede |
| `turns-and-finish` | `features/turns-and-finish.md` | Turn passing and rounds, the options menu, leave and resume, ending a game |
| `save-game` | `features/save-game.md` | A fully named 4-player game through Finish game to one entry in the sync queue |

A journey is a file in `harness/journeys/<name>.mjs` exporting one async function. Copy an existing one. It receives:

- `page`: the Playwright page.
- `app`: helpers that go through the real controls (listed below).
- `evidence`: `shot(label)`, `aria(label)`, `storeDump(label)`, `note(step, detail)`.
- `assert`: `node:assert/strict`. Throw to fail; the session writes `FAILED.png` and the error into `summary.json`.

`app` helpers, with the handles they use (all from `index.html` and `app.js`):

| Helper | Does |
| --- | --- |
| `app.$('id')` | Locator for an element id: `newGame`, `startGame`, `pass`, `undo`, `menuBtn`, `dmgDone`, `finishNow`, `toHome`, `resumeGame`, `saveGame`, `radClose`, `confirmOk`, `confirmCancel`, `toast`, ... |
| `app.seg('startLife', '40')` | A segmented-control button by its label: `startLife`, `playerCount`, `look`, `first`, `winner`, `victory`, `power`, `bracket`, `theme` |
| `app.newGame({ players, life, look, layout, names, first, onSetup })` | Home to table through the setup screen. `names[i]` fills `#seat<i>`. `startAnyway: true` accepts the "Couldn't find ... Start anyway?" card. |
| `app.panel(p)` | `#board > .panel` number `p`, in player order (0 is You). Classes: `r0`/`r90`/`r180`/`r270` facing, `active` on the turn player, `tools` when tiles show. |
| `app.life(p)`, `app.delta(p)`, `app.rotation(p)` | The life numeral, the floating `+3`/`-3` if showing, the facing in degrees |
| `app.tapLife(p, -1, times)` | Taps the half labelled `Lose 1 life` / `Gain 1 life` |
| `app.hold(locator, ms)` | Press-and-hold with the mouse: first count at 80 ms, repeats from 450 ms every 110 ms |
| `app.openTool(p, 'tax' \| 'damage' \| 'mana' \| 'counters')` | Taps the tile (`.a-<kind>`), tapping the name first in Minimal where tiles are hidden |
| `app.sheet(p)` | The open tool sheet; counters inside are `.ctr` with buttons named `−` and `+` and the value in `b` |
| `app.tileHeader(p, 'damage' \| 'counters')` | Measured along the panel's own down axis: `labelUnderIcon`, `rowUnderLabel`, and `iconTop` next to `taxIconTop`, how far down each tile its icon starts |
| `app.swipe(p)` | A sideways swipe from that player's seat, then the 450 ms the app needs before it will count a tap again |
| `app.openMenu()` | Options menu (`#menu`) |
| `app.screen()`, `app.theme()` | The visible `.screen` id; `html[data-theme]` |
| `app.store()`, `app.game()` | The persisted state (`localStorage['edhLife.v2']`) and its `game`. Read only. Never write state this way. |

Rules that keep journeys honest and green:

- Tap with `.tap()` on table controls; the real input is a finger. Form screens accept `.tap()` too.
- Read text with `textContent()`, not `innerText()`: the CSS uppercases most labels, so `innerText` gives `TURN 1`.
- Prefer ids, ARIA names and the classes above over coordinates. Panels are CSS-rotated; Playwright taps their centers correctly.
- Scryfall is stubbed by default (`EDH_SCRYFALL=stub`): any exact name resolves, with green identity and no art, so no "Start anyway?" card appears and no art loads. `EDH_SCRYFALL=block` makes every request fail like being offline (then `startAnyway: true` is needed for named seats). `EDH_SCRYFALL=live` reaches the real API.
- Nothing in the harness calls app functions. State changes only through the UI; `localStorage` is only read.

## Evidence

Each run writes `evidence/<yyyymmdd-hhmmss>-<journey>/`:

- `NN-<label>.png`: screenshots in order, the phone-sized viewport at 2x.
- `<label>.aria.yml`: an ARIA snapshot of the whole page, for text and roles without pixels.
- `<label>.store.json`: the persisted state at that moment, the side effect of what was tapped.
- `summary.json`: result, app version, commit, URL, every step and note, `pageErrors` (uncaught exceptions; any fails the run), `failedLoads` (4xx/5xx and aborted requests; one from the app's own origin fails the run), `consoleErrors` (recorded, not fatal).
- `FAILED.png`: the screen at the moment of failure, when there is one.

Proof standards for this app:

- Exercise the real player path: the setup screen, the panel halves, the tiles, the menu. Not `page.evaluate` into app internals.
- Capture the action and the state it produced: the screenshot after the taps and the `store.json` or `app.game()` assertion that shows the number landed in `game`, not only the numeral on screen.
- Verify the side effect: ending a game must leave `store.game` null; a 4-player game with every seat named must add one entry to `store.queue` with `setup`, `winner`, `events`; anything else must leave the queue alone.
- The mock boundary is Scryfall only, and only because the app already treats it as optional (offline works). Everything else is real.
- What this harness cannot prove: the Apps Script sync (needs the user's deployed endpoint and key; the queue entry is as far as it goes), the installed PWA and its service worker (blocked here), the screen wake lock, safe-area insets, and real Scryfall art and name matching unless run with `EDH_SCRYFALL=live`. Say so in a report instead of implying them.

## Cleanup

Journeys close their own browser and server in a `finally`, even on failure. For anything left behind:

```
node .claude/skills/verify-edh-life/harness/edh.mjs cleanup
```

It stops the persistent server by the pid it recorded in `harness/.run/server.json` and kills only the browsers recorded
in `harness/.run/browsers/` that are still alive. It never kills by process name and never touches `evidence/`. Evidence
accumulates; delete old run folders by hand when they are no longer wanted.

## Helpers

| Command | Does |
| --- | --- |
| `node harness/edh.mjs doctor` | Health check, exit 0 when healthy |
| `node harness/edh.mjs list` | Names the journeys |
| `node harness/edh.mjs journey <name...>` or `all` | Runs journeys in order, prints the evidence folder of each, exit 1 on any failure |
| `node harness/edh.mjs serve start\|stop\|status [--port 8767]` | A persistent server for manual use |
| `node harness/edh.mjs cleanup` | Stops what the harness started |

Environment: `EDH_VERIFY_HEADED=1`, `EDH_VERIFY_HEADED_PAUSE=<ms>`, `EDH_VERIFY_URL=<url>`, `EDH_SCRYFALL=stub|block|live`.

## Reporting a verification

Name the journey and the evidence folder, state what passed and what was not covered, and quote `summary.json`'s
`failedLoads` if it is not empty. A journey that drove one entry point is not proof for the others the feature file
lists. When a precondition is missing, the journey fails and the reason goes into that feature's `Gotchas`; do not
loosen the journey to make it pass.

Proven on 2026-11-02 against app `edh-life-17` at commit `755f525`: all six journeys passed in headless Chrome 156 on
Windows, emulating 360x780 with touch. That emulation stands in for the phone; the items listed under "cannot prove"
above stay unverified until checked on the real device.

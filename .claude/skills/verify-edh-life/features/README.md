# EDH Life verification map

This directory is the maintained source for verifying the user-facing behavior of EDH Life, the phone life tracker in
`life-tracker/`. Read this index before driving the app, then use the matching feature file as the recipe. The harness
and its commands are described in `../SKILL.md`.

## Baseline preconditions

- A journey run serves this checkout on a free `127.0.0.1` port and opens it in a fresh headless Chrome context at
  360x780 with touch. `localStorage` starts empty: no sync URL, no key, no lists, no game, Companion look, 40 life,
  4 players and the "one at each end" layout as the remembered preferences.
- Scryfall is stubbed: every exact name resolves to a card of that name with green color identity and no art, name
  suggestions echo what was typed, and the Radiation token has a 1x1 image.
- `node .claude/skills/verify-edh-life/harness/edh.mjs doctor` is healthy.
- Never drive an instance this run did not start, except deliberately through `EDH_VERIFY_URL`.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer element ids, ARIA names and the panel classes over coordinates or DOM position.
- Tap with `.tap()`. Read text with `textContent()`; CSS uppercases the labels on screen.
- Treat every helper call and label as literal; keep quoted names unchanged.
- The panel for player `p` is `app.panel(p)`, in turn order from You. Player 0 is the user.
- Restore nothing by hand: each run starts empty. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is a screenshot plus an ARIA snapshot or a text assertion with the app identity visible (the table, the home
  screen title `EDH Life`, or the finish screen).
- Mutation proof includes a read of the persisted state (`app.game()`, `app.store()`, or `evidence.storeDump`).
- Record the feature ID and entry point used with every artifact (`evidence.note`).
- Report an unreachable path with the attempted helper call and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly
four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with the verify-edh-life harness` starts with `Preconditions:` and uses labeled bullets that pair each
   user action with the exact helper call and the observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, calls and
observable proof.

## Features

- [New game](./new-game.md) covers the home screen, the setup screen, both looks, and starting, leaving and resuming a game. Journey `new-game`.
- [Life total](./life-total.md) covers taps, the floating total, press-and-hold, undo grouping, low-life colors and the knockout at zero. Journey `life-total`.
- [Commander damage](./commander-damage.md) covers the Damage tile, the sideways swipe, entering damage from a seat, the tile afterwards and the lethal 21. Journey `commander-damage`.
- [Tool sheets](./tool-sheets.md) covers Tax, Mana with storm, Counters with the rad reminder, the poison knockout and Concede. Journey `tool-sheets`.
- [Turns and finish](./turns-and-finish.md) covers passing the turn, rounds, undoing a pass, the options menu, and ending a game that stays on the phone. Journey `turns-and-finish`.

## Not yet mapped

These are user-facing and should get a feature file and a journey before a change to them is called verified:
Settings and the sync test, saving a 4-player game to the queue and syncing it, the two 4-player layouts and picking
your seat, Move my seat, partner commanders and the split tax and damage, commander art and its crop, the Minimal
look's status card (tapping the damage or poison chip), Restart with same players, Abandon game, and 5 and 6 players.

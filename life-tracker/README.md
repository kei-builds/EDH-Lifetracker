# EDH Life

A 4-player Commander life tracker for your phone. It records turns, eliminations, commander damage and poison, and sends each finished game to your EDH Tracker sheet.

- Plain HTML, CSS and JavaScript, with no build step. `app.js` holds all the logic.
- Works offline. Finished games wait on the phone until it's online, then sync.
- Keeps the screen awake during a game.

## How it fits together

```
phone app (GitHub Pages)  ──POST game + key──▶  EDH Sync (Apps Script web app)  ──▶  your sheet
                          ◀──decks, commanders──
```

The sync endpoint is its own Apps Script project, separate from the game form, so opening it up to the app doesn't expose the form. It rejects any request without your key. The key lives only in the app's settings on your phone, never in this code.

## 1. Set up the sync endpoint

1. Go to script.google.com → **New project** and name it `EDH Sync`.
2. Replace the starter code with `sync/Sync.gs`.
3. Put your sheet's ID in `SHEET_ID`. It's the long part of the sheet's URL: `docs.google.com/spreadsheets/d/<THIS PART>/edit`.
4. Choose `setupKey` in the function dropdown, click **Run**, and approve the permissions. The **Execution log** shows your key. Copy it.
5. Click **Deploy → New deployment → Web app**. Set Execute as **Me** and Who has access **Anyone**, then click **Deploy** and copy the web app URL.

"Anyone" means anyone who has the URL can reach the endpoint, but without the key every request gets "Wrong sync key." To change the key, run `setupKey` again and update it in the app.

## 2. Host the app (GitHub Pages, free)

1. On github.com, create a new **public** repository (Pages on a free account needs public).
2. Push this whole project to its `main` branch. `.github/workflows/pages.yml` publishes the `life-tracker` folder on every push.
3. If the first workflow run fails on the Pages step, go to **Settings → Pages** and set Source to **GitHub Actions**, then rerun it.
4. After a minute the site is live at `https://<your-username>.github.io/<repository>/`.
5. To ship a change: bump `VERSION` in `sw.js`, commit, push. The installed app picks the new version up on its next open.

## 3. Install on your phone

1. Open the GitHub Pages URL on your phone.
2. Add it to your home screen. On iPhone: Share → **Add to Home Screen**. On Android: menu → **Install app**.
3. Open it, go to **Settings**, paste the sync URL and key, and tap **Save and test**. It should say how many decks and commanders it loaded.

## Playing

- **Setup:**
  - Starting life (20–60), players (1–6), and for 4 players the layout: two per side, or one at each end.
  - **Your seat:** tap the cell of the table you're sitting at. The others follow clockwise in turn order, each panel facing its own edge of the phone, so the phone can lie whichever way the table needs. The app remembers your pick per layout. **Options → Move my seat** steps it one cell clockwise during a game.
  - The look, Companion or Minimal. It's the same setting as **Settings → Look**.
  - Each seat's commander. Seats go left around the table from you, which is also turn order, so the seat next on your left is Opponent 1.
  - For partner commanders, turn on **Partner** beside the seat and type the second commander in the field that appears under it. The game stores the pair as "First // Second", the same as typing both names that way.
  - Who goes first, or let the app pick at random.
  - Names are matched to your sheet first, then looked up on Scryfall by exact name.
  - Only 4-player games with every commander named are sent to your sheet. Other games are just a life counter.
- **Art:** each panel shows its commander's art from Scryfall, split in two for partners, over a tint of the commander's color identity. Art loads in the background after the game starts, so the tint shows first and stays if you're offline. Art you've already seen is kept for offline use. Turn it off in Settings.
- **Look:** pick it in setup or under **Settings → Look**. It changes only how the table looks, never what it records.
  - **Companion** (the default): each panel shows its four tools as tiles, two at each end, and a bar along the bottom holds **Undo**, the turn button and **Options**.
  - **Minimal:** each panel is just the art and the life total. Tap the player's name or the ⋯ button to bring up the tools; they hide again after 4 seconds, once you pick one, or when you tap ✕. The undo, turn and menu buttons sit in the middle of the table, lined up along the gap between panels. During commander damage they move to the edge of the damaged player's panel and turn to face them.
- **Table:** each panel faces its player. Tap the left half for −1 and the right half for +1, or press and hold to keep counting. A running total such as +3 floats next to the life total for a moment after you tap. The life total itself turns amber at 10 and red at 5. Small chips show tax, floating mana and the storm count when they aren't zero.
  - Minimal also has chips for commander damage and poison. They turn red as a player gets close to losing to either.
  - Companion lists those on its tiles instead. The **Damage** tile shows each player whose commanders have hit this one: their initial (or seat number if the seat has no name) and the total, amber once one commander has dealt 15 and red at 21. The **Counters** tile shows each counter that isn't zero as its icon and count; poison turns amber at 7 and red at 10.
  - **Tax:** commander tax in steps of 2, split per commander when Partner is on. Its **Partner** switch is how you add a partner you didn't enter in setup.
  - **Damage:** switches the whole board to commander damage for that player, and turns every panel to face them so they can enter it from their seat. Every other panel shows the damage its commander dealt them, split in two for a partner pair. It also lowers life, and 21 from one commander knocks them out. Tap **Done** in place of the turn button to go back. Companion also puts ‹ on their panel.
  - **Mana:** **Storm** across the top counts the spells everyone has cast this turn. Tap it to add 1. It goes back to 0 when the turn passes. Below it is a floating mana pool (W U B R G C) with an Empty pool button. Storm taps and mana changes aren't undo steps.
  - **Counters:** poison (10 knocks a player out), energy, experience and rad, each with its icon, plus Concede. Tap **Rad** to see what rad counters do: the Radiation token from Scryfall, with its rules text under it. After the first look the token shows offline too, and the rules text always shows.
  - The turn button passes the turn. The white outline shows whose turn it is, and the turn count goes up when play gets back to whoever went first.
  - **Undo** reverses the last change. **Options** opens the menu: finish early, restart with the same players, move your seat one cell clockwise, go home and keep the game, or abandon it.
- **After the game:** winner, how it ended, turns and first elimination are pre-filled from the game. Commander damage, poison and concessions set the victory type; damage from life loss you pick yourself. Add notes. Pod, power and bracket are under Game details, pre-filled from your last game. Save, and it syncs.

On the sheet, synced games show Source = "Life Tracker". A **Tracker Log** tab, created on the first sync, stores each game's start and end time, length in minutes, the eliminations, and the full event history.

## Updating the app

Edit the files, upload them to the repo again, and change `VERSION` in `sw.js` (for example `edh-life-2`) so phones pick up the new version instead of the cached one. If you add a file the app needs offline, add it to `FILES` in `sw.js` too, or to `EXTRAS` if the app still works without it (the fonts are there, so a missing font never blocks the install).

## Credits

- Fonts in `fonts/`: [Oswald](https://fonts.google.com/specimen/Oswald) and [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed), both under the SIL Open Font License. The license texts are in `licenses/`.
- Icons: [Lucide](https://lucide.dev), under the ISC License (`licenses/Lucide-ISC.txt`). The ones the app uses are inlined in `ICONS` in `app.js`. The experience icon, a pair of wings, is drawn for this app in the same style.

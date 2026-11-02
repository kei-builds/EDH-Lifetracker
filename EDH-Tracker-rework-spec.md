# EDH Tracker rework spec

Target file: **EDH Tracker** (Google Sheets). Source data: **EDH 2025** (Game Log 2025, Game Log 2026, Retired).
After the rework, EDH Tracker is the only place games are logged, and it stays as lean as possible. EDH 2025 stays as a notes sheet (playgroup deck grids, future decks, deckbuilding lists, 2HG, Emperor, 3- and 5-player logs) and nothing is copied out of those tabs.

## Ground rules

- Only 4-player games are tracked. 3- and 5-player games are not carried over.
- Data you type in is stored in exactly one place. Everything else is a formula that reads from it.
- Every game is entered once, in one row, on the Games tab. Every other tab is derived from it.
- Commander names are picked from dropdowns fed by the Commanders tab, so spellings can't drift.
- Wording is "Opponent", never "Enemy".

## Seating convention

My deck, then Opponent 1 sits to my left, Opponent 2 to Opponent 1's left, then Opponent 3.
Turns pass to the left, so turn order is me → Opponent 1 → Opponent 2 → Opponent 3 (wrapping around).
Seat of Opponent k = ((My Seat − 1 + k) mod 4) + 1.

## Games tab

One row per game. Columns in this order:

| Column | Entered or auto | Notes |
|---|---|---|
| Date | entered | |
| Pod | entered | dropdown |
| Power | entered | dropdown: Low / Mid / High Power |
| Bracket | entered | dropdown 1–5 |
| My Deck | entered | dropdown from Decks I've Played |
| Opponent 1 | entered | dropdown from Commanders, seated to my left |
| Opponent 2 | entered | dropdown from Commanders |
| Opponent 3 | entered | dropdown from Commanders |
| Winner | entered | dropdown: Me / Opponent 1 / Opponent 2 / Opponent 3 |
| My Seat | entered | 1–4, turn order position |
| Result | auto | Win if Winner = Me, else Loss |
| Victory | entered | dropdown: Combat Damage, Combo, etc. |
| Turns | entered | |
| 1st Elim | entered | |
| Notes | entered | |
| T1 Sol Rings | entered | number of turn-1 Sol Rings in the game |
| T1 Sol Ring Win | entered | did a player with a T1 Sol Ring win the game |

Grouped and collapsed past Notes: Source, Winner Seat, Winning Commander, Month, My Color Identity, In Range (stats filter flag), and anything else the stats need.

## Migration

- **2026 games** from Game Log 2026. Winner = Me on a win, otherwise the bolded opponent. My Seat = Winner Turn Order on a win, otherwise worked backward from the winner's seat. Bold check passed on 2026-10-29. Row 58 still has a stray bold, but W/L takes priority.
- **2025 games** from Game Log 2025 and Retired, 4-player games only. My Seat stays blank. Winner = Me on a win, otherwise blank.
- **3- and 5-player games** (the 103 already migrated from Three Player Log and Five Player Log) are removed from EDH Tracker. They're still in EDH 2025.
- **Retired tab games** are migrated like 2025 games, and their decks get Status = Retired.
- **Missing 2026 games:** 3/8 Ruby uses the Game Log 2025 version (Leonardo // Michelangelo), so fix Game Log 2026, which says Raphael. 4/6 Jor Kadeen was added back by hand. Add back from Game Log 2025:
  - 4/24 Ashling, the Limitless: Win, My Seat blank.
  - 5/29 Ruby: Loss, Winner = Opponent 3 (Clavileño, went 2nd), My Seat = 3.
  - 7/13 Ashling, Rekindled: Win, My Seat blank.
  - 8/1 First Doctor: Loss, Winner = Opponent 1 (Ratonhnhaké꞉ton), My Seat = 1.
- **Unidentified opponents:** "Placeholder" (9/24/2026) and "Unknown" (11/17/2024) both become "Unknown" and are left out of matchup stats.
- **Custom cards:** "Custom - WUBRG" stays as is and is added to Commanders by hand with color identity WUBRG. It counts toward color stats but not Scryfall lookups.
- **Name fixes approved 2026-10-29:** 7 capitalization fixes and 11 spelling fixes (Nazgûl, Eladamri, Commissar, Breya Shaper, Dáin, Hugs Grisly, The Lord of Pain, Hazel Rootbloom, Jodah, Atraxa Praetors', Abby). Double-faced cards keep their front-face name.
- **Cutover:** after the script runs, games are logged only in the new tracker.
- **Scryfall lookups:** use exact-name lookups, never fuzzy or substring matching. The card named "X" (UST #137) has to resolve exactly and must never match as a substring. Names with special characters (Ratonhnhaké꞉ton, Clavileño, Éowyn) need checking.
- **Decks I've Played** only lists decks with at least one tracked game. Unplayed decks added from the Kei tab are cut.
- **Name cleanup:** fold case and spelling variants into one name, e.g. "Nahiri, Forged In Fury" → "Nahiri, Forged in Fury", "Wilhelt, the Rot-Cleaver" → "Wilhelt, the Rotcleaver", "Aesi, of Gyre Strait" → "Aesi, Tyrant of Gyre Strait". Produce the full variant list for review before applying it.
- **Colors:** give every color combination a name (4-color combos currently show letters like "W,U,B,R"), and fill in the "?" entries.

## Seats tab

Built by formula from Games, 4 rows per game (me plus 3 opponents), with commander, seat, won, color identity, date and the In Range flag. Never edited by hand.

## Stats tab

Two-column layout.

**Top left: filters**
- From date / To date. Defaults are Jan 1 of the current year and blank (meaning today).
- Pod, Power, Bracket, My Deck. Each is a dropdown with "All".

**Left column:** My Deck | Win % | Wins | Losses | Games. An "All games" row at the top, then every deck, sorted by games played.

**Right column, top to bottom:**
1. Global: average game length (turns) and average turn of first elimination.
2. By seat: Win % / W / L / G for seats 1–4. If From date is before 2026-01-01, show "Seat stats need games from 2026 on, so set From to 1/1/2026 or later" instead of numbers.
3. T1 Sol Ring: T1 Sol Rings per game, % of games with at least one, % of those games won by a player who had one.
4. By power: Win % / W / L / G.
5. By pod: Win % / W / L / G.
6. How games end.
7. Opponents I face most (faced, my wins, win %).
8. Opponent colors (faced, win %).
9. My colors (win %, W, L, G).
10. By month (win %, W, L, G).

Sections 6–10 may move to a separate Matchups tab later.

## Decks I've Played tab

Renamed from My Decks. Holds every deck I've piloted in a tracked game, including loaners and temporary builds.

- Status is a dropdown: **Active**, **Retired** or **Temporary**. Temporary covers anything that isn't active or retired: loaners, borrowed decks, one-off builds.
- Columns: Commander, Status, Power, Archetype, Color Identity, Games, Wins, Win %, Last Played, Avg CMC, Price, EDHREC Rank, Game Changers. Games, Wins, Win %, Last Played and Color Identity are formulas. The rest is entered.
- Any deck that appears in Games but is missing here gets added during migration (as Retired or Temporary, for me to sort).

## Final tab list

| Tab | Type |
|---|---|
| Stats | calculated |
| Games | entered |
| Decks I've Played | entered, with calculated stat columns |
| Commanders | reference (names and color identity) |
| Colors | reference |
| Seats | calculated, could be hidden |

Playgroup is deleted. Migration Report is deleted once the open items below are resolved.

## Game form (phone web app)

Files: `Form.gs` and `GamePage.html`, in the same Apps Script project as the build script. Deployed as a web app that runs as me, with access limited to me.

- **New game (before):** date (today), pod, power and bracket (pre-filled from the last game), my deck, Opponents 1–3 (left around the table), my turn order. Saving adds a Games row with Winner empty, so it doesn't count in stats yet.
- **Finish game (after):** pick the unfinished game if there's more than one. Winner buttons show the actual commanders, plus "Not sure which opponent". Then victory, turns, 1st elimination, turn-1 Sol Rings (0–3), "Did a Sol Ring player win?" (only shown if at least 1), and notes. A game that never happened can be discarded.
- New commander or deck names are matched to known names ignoring case, otherwise looked up on Scryfall by exact name and added to Commanders, or to Decks I've Played as Temporary.
- Rows added by the form have Source = "Form".

## Open items


- The 2026 games that appear only in Game Log 2025 (listed in Migration Report): add them or drop them?
- Build method (decided): an Apps Script run in a new, blank spreadsheet. It reads EDH 2025 (games) and the current EDH Tracker (deck details from My Decks: Power, Archetype, Avg CMC, Price, EDHREC Rank, Game Changers) by file ID, read-only. Neither old file is modified.

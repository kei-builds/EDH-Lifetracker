/**
 * Game form: a phone web app that writes to the Games tab.
 * Step 1 (before the game) adds a row with no winner. Step 2 (after) fills in the result.
 * Uses resolveNames, COLOR_NAMES, clean and UNKNOWN from the build script in the same project.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('GamePage')
    .setTitle('EDH game')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function trackerSS_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (e) { /* not available in web app context */ }
  if (ss) return ss;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Open the spreadsheet once so the form can find it, then reload.');
  return SpreadsheetApp.openById(id);
}

// Row number of the last game (column A), ignoring the array formulas that run to the bottom.
function lastGameRow_(sh) {
  const a = sh.getRange('A2:A').getValues();
  let i = a.length;
  while (i > 0 && a[i - 1][0] === '') i--;
  return i + 1;
}

function getFormData() {
  const ss = trackerSS_();
  const tz = ss.getSpreadsheetTimeZone();
  const games = ss.getSheetByName('Games');
  const last = lastGameRow_(games);
  const rows = last > 1 ? games.getRange(2, 1, last - 1, 10).getValues() : [];

  const open = [];
  rows.forEach((r, i) => {
    if (r[0] !== '' && r[8] === '') {
      open.push({ row: i + 2, date: Utilities.formatDate(new Date(r[0]), tz, 'M/d'), deck: r[4], opps: [r[5], r[6], r[7]] });
    }
  });
  const lastRow = rows.length ? rows[rows.length - 1] : null;

  const statusOrder = { Active: 0, Temporary: 1, Retired: 2 };
  const decks = ss.getSheetByName('Decks I\'ve Played').getRange('A2:B').getValues()
    .filter(r => r[0] !== '')
    .sort((a, b) => (statusOrder[a[1]] ?? 3) - (statusOrder[b[1]] ?? 3) || String(a[0]).localeCompare(b[0]))
    .map(r => String(r[0]));
  const commanders = ss.getSheetByName('Commanders').getRange('A2:A').getValues()
    .map(r => String(r[0])).filter(Boolean);
  const pods = [...new Set(rows.map(r => clean(r[1])).filter(Boolean))].sort();

  return {
    today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    pods, decks, commanders, victories: VICTORIES, open: open.reverse(),
    last: lastRow ? { pod: lastRow[1], power: lastRow[2], bracket: String(lastRow[3]) } : {},
  };
}

function saveSetup(f) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = trackerSS_();
    const sh = ss.getSheetByName('Games');
    const opps = (f.opps || []).map(clean);
    if (!f.date || !clean(f.pod) || !clean(f.power) || !clean(f.deck) || opps.length !== 3 || opps.some(o => !o) || !f.seat) {
      throw new Error('Fill in every field before saving.');
    }
    const canon = canonicalNames_(ss, [clean(f.deck)].concat(opps), clean(f.deck));
    const row = lastGameRow_(sh) + 1;
    const date = Utilities.parseDate(f.date, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    sh.getRange(row, 1, 1, 10).setValues([[
      date, clean(f.pod), clean(f.power), f.bracket ? Number(f.bracket) : '',
      canon(clean(f.deck)), canon(opps[0]), canon(opps[1]), canon(opps[2]), '', Number(f.seat),
    ]]);
    sh.getRange(row, 18).setValue('Form');
    return { row };
  } finally {
    lock.releaseLock();
  }
}

function saveResult(f) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = trackerSS_().getSheetByName('Games');
    const row = Number(f.row);
    if (!row || sh.getRange(row, 1).getValue() === '') throw new Error('That game no longer exists. Reload the form.');
    if (!['Me', 'Opponent 1', 'Opponent 2', 'Opponent 3', 'Unknown opponent'].includes(f.winner)) {
      throw new Error('Pick who won.');
    }
    const n = v => (v === '' || v == null ? '' : Number(v));
    sh.getRange(row, 9).setValue(f.winner);
    sh.getRange(row, 12, 1, 6).setValues([[
      clean(f.victory), n(f.turns), n(f.elim), clean(f.notes), n(f.sol), Number(f.sol) > 0 ? clean(f.solWin) : '',
    ]]);
    // A game is long enough for Scryfall to stop throttling, so try any names it couldn't look up at the start.
    try { retryPendingLookups_(trackerSS_()); } catch (e) { /* stays pending for the menu */ }
    return { row };
  } finally {
    lock.releaseLock();
  }
}

function discardGame(row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = trackerSS_().getSheetByName('Games');
    if (sh.getRange(row, 9).getValue() !== '') throw new Error('Only unfinished games can be discarded.');
    sh.deleteRow(row);
  } finally {
    lock.releaseLock();
  }
}

// Matches typed names to known ones (ignoring case), looks up new ones on Scryfall,
// and adds new commanders and decks to their tabs. Returns name -> canonical name.
function canonicalNames_(ss, names, deck) {
  const cmdSh = ss.getSheetByName('Commanders');
  const known = cmdSh.getRange('A2:A').getValues().map(r => String(r[0])).filter(Boolean);
  const lower = {};
  known.forEach(k => { lower[k.toLowerCase()] = k; });
  const map = {};
  const fresh = [];
  names.forEach(n => {
    if (lower[n.toLowerCase()]) map[n] = lower[n.toLowerCase()];
    else if (!fresh.includes(n)) fresh.push(n);
  });
  if (fresh.length) {
    const resolved = resolveNames(fresh, null, true);
    const rows = [];
    fresh.forEach(n => {
      const r = resolved[n];
      const existing = lower[r.display.toLowerCase()];
      if (existing) { map[n] = existing; return; }
      map[n] = r.display;
      lower[r.display.toLowerCase()] = r.display;
      rows.push([r.display, r.letters, r.letters ? (COLOR_NAMES[r.letters] || r.letters) : '', r.source]);
    });
    if (rows.length) {
      const start = known.length + 2;
      cmdSh.getRange(start, 1, rows.length, 4).setValues(rows);
      cmdSh.getRange(2, 1, start + rows.length - 2, 4).sort(1);
    }
  }
  const canon = n => map[n] || n;

  const decksSh = ss.getSheetByName('Decks I\'ve Played');
  const deckNames = decksSh.getRange('A2:A').getValues().map(r => String(r[0])).filter(Boolean);
  const d = canon(deck);
  if (!deckNames.includes(d)) {
    decksSh.getRange(deckNames.length + 2, 1, 1, 2).setValues([[d, 'Temporary']]);
  }
  return canon;
}

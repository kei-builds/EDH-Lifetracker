/**
 * Sync endpoint for the life tracker app.
 *
 * A standalone Apps Script project (not the one bound to the sheet), deployed as a web app
 * that runs as you and is reachable by anyone, so the app can call it from outside Google.
 * Every request must carry the secret key. Run setupKey() once and copy the key into the app.
 */

const SHEET_ID = 'PASTE_YOUR_NEW_SHEET_ID_HERE';
const SOURCE = 'Life Tracker';

function setupKey() {
  const key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_KEY', key);
  Logger.log('Your sync key (paste it into the app settings): ' + key);
}

function doGet(e) {
  return respond_(() => {
    checkKey_(e.parameter && e.parameter.key);
    return lists_(SpreadsheetApp.openById(SHEET_ID));
  });
}

function doPost(e) {
  return respond_(() => {
    const body = JSON.parse(e.postData.contents);
    checkKey_(body.key);
    if (body.action === 'lists') return lists_(SpreadsheetApp.openById(SHEET_ID));
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return saveGame_(SpreadsheetApp.openById(SHEET_ID), body.game);
    } finally {
      lock.releaseLock();
    }
  });
}

function respond_(fn) {
  let out;
  try {
    out = Object.assign({ ok: true }, fn());
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!expected || key !== expected) throw new Error('Wrong sync key.');
}

function sheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet tab: ' + name);
  return sh;
}

// Prefix text starting with formula characters so Sheets stores literal text (e.g. "+1/+1 counters") instead of formulas.
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function ensureRows_(sh, needed) {
  const max = sh.getMaxRows();
  if (needed > max) sh.insertRowsAfter(max, needed - max);
}

function lastRow_(sh) {
  if (sh.getMaxRows() < 2) return 1;
  const a = sh.getRange(2, 1, sh.getMaxRows() - 1, 1).getValues();
  let i = a.length;
  while (i > 0 && a[i - 1][0] === '') i--;
  return i + 1;
}

function fitJson_(items, maxLen) {
  let out = JSON.stringify(items);
  if (out.length <= maxLen) return out;
  let lo = 0, hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (JSON.stringify(items.slice(0, mid).concat({ truncated: items.length - mid })).length <= maxLen) lo = mid;
    else hi = mid - 1;
  }
  return JSON.stringify(items.slice(0, lo).concat({ truncated: items.length - lo }));
}

function lists_(ss) {
  const games = sheet_(ss, 'Games');
  const last = lastRow_(games);
  const rows = last > 1 ? games.getRange(2, 1, last - 1, 4).getValues() : [];
  const order = { Active: 0, Temporary: 1, Retired: 2 };
  const decksSh = sheet_(ss, 'Decks I\'ve Played');
  const decks = decksSh.getMaxRows() > 1 ? decksSh.getRange(2, 1, decksSh.getMaxRows() - 1, 2).getValues()
    .filter(r => r[0] !== '')
    .sort((a, b) => (order[a[1]] ?? 3) - (order[b[1]] ?? 3) || String(a[0]).localeCompare(b[0]))
    .map(r => String(r[0])) : [];
  const cmdSh = sheet_(ss, 'Commanders');
  const commanders = cmdSh.getMaxRows() > 1 ? cmdSh.getRange(2, 1, cmdSh.getMaxRows() - 1, 2).getValues()
    .filter(r => r[0] !== '').map(r => [String(r[0]), String(r[1])]) : [];
  const pods = [...new Set(rows.map(r => String(r[1]).trim()).filter(Boolean))].sort();
  const lastRow = rows[rows.length - 1];
  return {
    decks, commanders, pods,
    last: lastRow ? { pod: lastRow[1], power: lastRow[2], bracket: String(lastRow[3]) } : {},
  };
}

function saveGame_(ss, g) {
  if (!g || !g.id || !g.setup || !g.setup.date || !Array.isArray(g.setup.opps) || g.setup.opps.length < 3) {
    throw new Error('Missing game data.');
  }
  const log = trackerLog_(ss);
  const logLast = log.getLastRow();
  const ids = logLast > 1 ? log.getRange(2, 1, logLast - 1, 1).getValues().map(r => r[0]) : [];
  if (ids.includes(g.id)) return { duplicate: true };

  const s = g.setup;
  const parsedDate = Utilities.parseDate(String(s.date), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const names = addCommanders_(ss, [s.deck].concat(s.opps), g.colors || {});
  addDeck_(ss, names(s.deck));

  const games = sheet_(ss, 'Games');
  const row = lastRow_(games) + 1;
  ensureRows_(games, row);
  const n = v => (v === '' || v == null ? '' : Number(v));
  games.getRange(row, 1, 1, 10).setValues([[
    parsedDate, safeCell_(s.pod), safeCell_(s.power), n(s.bracket),
    safeCell_(names(s.deck)), safeCell_(names(s.opps[0])), safeCell_(names(s.opps[1])), safeCell_(names(s.opps[2])),
    safeCell_(g.winner), n(s.seat),
  ]]);
  games.getRange(row, 12, 1, 7).setValues([[
    safeCell_(g.victory || ''), n(g.turns), n(g.elim), safeCell_(g.notes || ''), n(g.sol),
    Number(g.sol) > 0 ? safeCell_(g.solWin || '') : '', SOURCE,
  ]]);

  const minutes = g.started && g.ended ? Math.round((g.ended - g.started) / 60000) : '';
  const elims = (g.eliminations || []).map(x => `${x.name}: turn ${x.turn} (${x.cause})`).join('; ');
  log.appendRow([
    g.id, parsedDate, safeCell_(names(s.deck)), row,
    g.started ? new Date(g.started) : '', g.ended ? new Date(g.ended) : '', minutes,
    safeCell_(elims),
    safeCell_(fitJson_(g.events || [], 49000)),
  ]);
  return { row };
}

function trackerLog_(ss) {
  let sh = ss.getSheetByName('Tracker Log');
  if (!sh) {
    sh = ss.insertSheet('Tracker Log');
    sh.getRange(1, 1, 1, 9).setValues([['Game ID', 'Date', 'My Deck', 'Games Row', 'Started', 'Ended',
      'Minutes', 'Eliminations', 'Events']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('M/d/yyyy');
    sh.getRange('E:F').setNumberFormat('M/d/yyyy h:mm');
  }
  return sh;
}

// Adds unknown commanders (matched ignoring case) and returns a name -> canonical name function.
// `colors` holds color identity letters the app already got from Scryfall; anything missing is looked up here.
function addCommanders_(ss, names, colors) {
  const sh = sheet_(ss, 'Commanders');
  const existingLast = lastRow_(sh);
  const known = existingLast > 1 ? sh.getRange(2, 1, existingLast - 1, 1).getValues().map(r => String(r[0])).filter(Boolean) : [];
  const lower = {};
  known.forEach(k => { lower[k.toLowerCase()] = k; });
  const colorNames = {};
  const colorsSh = sheet_(ss, 'Colors');
  if (colorsSh.getMaxRows() > 1) {
    colorsSh.getRange(2, 1, colorsSh.getMaxRows() - 1, 2).getValues().forEach(r => { if (r[0]) colorNames[r[0]] = r[1]; });
  }
  const map = {};
  const rows = [];
  names.forEach(n => {
    if (!n || map[n]) return;
    const hit = lower[n.toLowerCase()];
    if (hit) { map[n] = hit; return; }
    let letters = colors[n];
    let source = 'Scryfall';
    if (letters == null) {
      letters = scryfallLetters_(n);
      if (letters == null) { letters = ''; source = 'Not found'; }
    }
    map[n] = n;
    lower[n.toLowerCase()] = n;
    rows.push([safeCell_(n), letters, letters ? (colorNames[letters] || letters) : '', source]);
  });
  if (rows.length) {
    const start = existingLast + 1;
    ensureRows_(sh, start + rows.length - 1);
    sh.getRange(start, 1, rows.length, 4).setValues(rows);
    const sortCols = Math.max(4, sh.getLastColumn());
    sh.getRange(2, 1, start + rows.length - 2, sortCols).sort(1);
  }
  return n => map[n] || n;
}

// Exact-name lookup; partner pairs ("A // B") fall back to looking up each half.
function scryfallLetters_(name) {
  const exact = n => {
    try {
      const res = UrlFetchApp.fetch('https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n.trim()),
        { muteHttpExceptions: true, headers: { Accept: 'application/json', 'User-Agent': 'EDH-Life-Sync/1.0' } });
      return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()).color_identity : null;
    } catch (e) {
      return null;
    }
  };
  let ci = exact(name);
  if (!ci && name.includes(' // ')) {
    const parts = [];
    for (const p of name.split(' // ')) {
      Utilities.sleep(100);
      parts.push(exact(p));
    }
    if (parts.every(Boolean)) ci = [].concat(...parts);
  }
  if (!ci) return null;
  const order = 'WUBRG';
  return [...new Set(ci)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('') || 'C';
}

function addDeck_(ss, deck) {
  if (!deck) return;
  const sh = sheet_(ss, 'Decks I\'ve Played');
  const existingLast = lastRow_(sh);
  const decks = existingLast > 1 ? sh.getRange(2, 1, existingLast - 1, 1).getValues().map(r => String(r[0]).toLowerCase()).filter(Boolean) : [];
  if (!decks.includes(deck.toLowerCase())) {
    const row = existingLast + 1;
    ensureRows_(sh, row);
    sh.getRange(row, 1, 1, 2).setValues([[safeCell_(deck), 'Temporary']]);
  }
}

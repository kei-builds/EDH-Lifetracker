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
    checkKey_(e.parameter.key);
    return lists_(SpreadsheetApp.openById(SHEET_ID));
  });
}

function doPost(e) {
  return respond_(() => {
    const body = JSON.parse(e.postData.contents);
    checkKey_(body.key);
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

function lastGameRow_(sh) {
  const a = sh.getRange('A2:A').getValues();
  let i = a.length;
  while (i > 0 && a[i - 1][0] === '') i--;
  return i + 1;
}

function lists_(ss) {
  const games = ss.getSheetByName('Games');
  const last = lastGameRow_(games);
  const rows = last > 1 ? games.getRange(2, 1, last - 1, 4).getValues() : [];
  const order = { Active: 0, Temporary: 1, Retired: 2 };
  const decks = ss.getSheetByName('Decks I\'ve Played').getRange('A2:B').getValues()
    .filter(r => r[0] !== '')
    .sort((a, b) => (order[a[1]] ?? 3) - (order[b[1]] ?? 3) || String(a[0]).localeCompare(b[0]))
    .map(r => String(r[0]));
  const commanders = ss.getSheetByName('Commanders').getRange('A2:B').getValues()
    .filter(r => r[0] !== '').map(r => [String(r[0]), String(r[1])]);
  const pods = [...new Set(rows.map(r => String(r[1]).trim()).filter(Boolean))].sort();
  const lastRow = rows[rows.length - 1];
  return {
    decks, commanders, pods,
    last: lastRow ? { pod: lastRow[1], power: lastRow[2], bracket: String(lastRow[3]) } : {},
  };
}

function saveGame_(ss, g) {
  if (!g || !g.id) throw new Error('Missing game.');
  const log = trackerLog_(ss);
  const ids = log.getRange('A2:A').getValues().map(r => r[0]);
  if (ids.includes(g.id)) return { duplicate: true };

  const s = g.setup;
  const names = addCommanders_(ss, [s.deck].concat(s.opps), g.colors || {});
  addDeck_(ss, names(s.deck));

  const games = ss.getSheetByName('Games');
  const row = lastGameRow_(games) + 1;
  const tz = ss.getSpreadsheetTimeZone();
  const n = v => (v === '' || v == null ? '' : Number(v));
  games.getRange(row, 1, 1, 10).setValues([[
    Utilities.parseDate(s.date, tz, 'yyyy-MM-dd'), s.pod, s.power, n(s.bracket),
    names(s.deck), names(s.opps[0]), names(s.opps[1]), names(s.opps[2]), g.winner, n(s.seat),
  ]]);
  games.getRange(row, 12, 1, 7).setValues([[
    g.victory || '', n(g.turns), n(g.elim), g.notes || '', n(g.sol), Number(g.sol) > 0 ? (g.solWin || '') : '', SOURCE,
  ]]);

  const minutes = g.started && g.ended ? Math.round((g.ended - g.started) / 60000) : '';
  log.appendRow([
    g.id, Utilities.parseDate(s.date, tz, 'yyyy-MM-dd'), names(s.deck), row,
    g.started ? new Date(g.started) : '', g.ended ? new Date(g.ended) : '', minutes,
    (g.eliminations || []).map(x => `${x.name}: turn ${x.turn} (${x.cause})`).join('; '),
    JSON.stringify(g.events || []).slice(0, 49000),
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
  const sh = ss.getSheetByName('Commanders');
  const known = sh.getRange('A2:A').getValues().map(r => String(r[0])).filter(Boolean);
  const lower = {};
  known.forEach(k => { lower[k.toLowerCase()] = k; });
  const colorNames = {};
  ss.getSheetByName('Colors').getRange('A2:B').getValues().forEach(r => { if (r[0]) colorNames[r[0]] = r[1]; });
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
    rows.push([n, letters, letters ? (colorNames[letters] || letters) : '', source]);
  });
  if (rows.length) {
    const start = known.length + 2;
    sh.getRange(start, 1, rows.length, 4).setValues(rows);
    sh.getRange(2, 1, start + rows.length - 2, 4).sort(1);
  }
  return n => map[n] || n;
}

// Exact-name lookup; partner pairs ("A // B") fall back to looking up each half.
function scryfallLetters_(name) {
  const exact = n => {
    const res = UrlFetchApp.fetch('https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(n.trim()),
      { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
    return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()).color_identity : null;
  };
  let ci = exact(name);
  if (!ci && name.includes(' // ')) {
    const parts = name.split(' // ').map(exact);
    if (parts.every(Boolean)) ci = [].concat(...parts);
  }
  if (!ci) return null;
  const order = 'WUBRG';
  return [...new Set(ci)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('') || 'C';
}

function addDeck_(ss, deck) {
  const sh = ss.getSheetByName('Decks I\'ve Played');
  const decks = sh.getRange('A2:A').getValues().map(r => String(r[0])).filter(Boolean);
  if (!decks.includes(deck)) sh.getRange(decks.length + 2, 1, 1, 2).setValues([[deck, 'Temporary']]);
}

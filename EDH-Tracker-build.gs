/**
 * EDH Tracker build script.
 *
 * Run buildTracker() once, from a NEW, BLANK Google Sheet (Extensions > Apps Script).
 * It reads games from EDH 2025 and deck details from the old EDH Tracker. Both are read-only.
 * After that, use the "EDH Tracker" menu to add new decks and commanders.
 */

const CFG = {
  EDH2025_ID: '14I57RUa2xtksUkZlQMuuVZg-55KULkvQfEUWHcVSre0',
  OLD_TRACKER_ID: '1ifAyq8Eeorelntrf7Ald99C6OE46kQOL_J1ac86OAuU',
};

const UNKNOWN = 'Unknown';
const UNKNOWN_OPP = 'Unknown opponent';
const WINNERS = ['Me', 'Opponent 1', 'Opponent 2', 'Opponent 3', UNKNOWN_OPP];

// Approved spelling and capitalization fixes. Capitalization is also corrected automatically from Scryfall.
const NAME_FIXES = {
  'Lord of the Nazgul': 'Lord of the Nazgûl',
  'Eladamri Korvecdal': 'Eladamri, Korvecdal',
  'Comissar Severina Raine': 'Commissar Severina Raine',
  'Breya, Etherium Sculptor': 'Breya, Etherium Shaper',
  'Dain of the Ancient Halls': 'Dáin of the Ancient Halls',
  'Hugs, Grizzly Guardian': 'Hugs, Grisly Guardian',
  'Lord of Pain': 'The Lord of Pain',
  'Hazel of the Rotbloom': 'Hazel of the Rootbloom',
  'Jodah the Unifier': 'Jodah, the Unifier',
  'Atraxa, Praetor\'s Voice': 'Atraxa, Praetors\' Voice',
  'Abbie, Merciless Soldier // Ellie, Vengeful Hunter': 'Abby, Merciless Soldier // Ellie, Vengeful Hunter',
  'Aesi, of Gyre Strait': 'Aesi, Tyrant of Gyre Strait',
  'Placeholder': UNKNOWN,
};

// Cards Scryfall doesn't know, with their color identity.
const CUSTOM_COLORS = { 'Custom - WUBRG': 'WUBRG' };

// 2026 games that were only logged in Game Log 2025. `vs` is one of the opponents, to tell same-day games apart.
const EXTRA_GAMES = [
  { date: '2026-04-24', deck: 'Ashling, the Limitless', vs: 'Ratadrabik of Urborg', winner: 'Me', seat: '' },
  { date: '2026-05-29', deck: 'Ruby, Daring Tracker', vs: 'Teval, the Balanced Scale', winner: 'Opponent 3', seat: 3 },
  { date: '2026-07-13', deck: 'Ashling, Rekindled', vs: 'Eshki, Temur\'s Roar', winner: 'Me', seat: '' },
  { date: '2026-08-01', deck: 'The First Doctor // Susan Foreman', vs: 'Silverquill, the Disputant', winner: 'Opponent 1', seat: 1 },
];

// One-off corrections to individual games.
const OPPONENT_FIXES = [
  { date: '2026-03-08', deck: 'Ruby, Daring Tracker',
    from: 'Leonardo, the Balance // Raphael, the Muscle', to: 'Leonardo, the Balance // Michelangelo, the Heart' },
];

const TURN_ORDER = { First: 1, Second: 2, Third: 3, Fourth: 4 };
const POWERS = ['Low Power', 'Mid Power', 'High Power'];
const VICTORIES = ['Combat Damage', 'Non-Combat Damage', 'Commander Damage', 'Combo', 'Alternate Win Condition',
  'Poison', 'Infect', 'Mill', 'Lockout', 'Concession'];

const COLOR_NAMES = {
  C: 'Colorless', W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green',
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WUG: 'Bant',
  WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  WUBR: 'Sans Green', UBRG: 'Sans White', WBRG: 'Sans Blue', WURG: 'Sans Black', WUBG: 'Sans Red',
  WUBRG: 'WUBRG',
};

const GAMES_HEADERS = ['Date', 'Pod', 'Power', 'Bracket', 'My Deck', 'Opponent 1', 'Opponent 2', 'Opponent 3',
  'Winner', 'My Seat', 'Result', 'Victory', 'Turns', '1st Elim', 'Notes', 'T1 Sol Rings', 'T1 Sol Ring Win', 'Source'];

function onOpen() {
  // Lets the game form (a web app) find this spreadsheet.
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', SpreadsheetApp.getActive().getId());
  SpreadsheetApp.getUi().createMenu('EDH Tracker')
    .addItem('Add new decks and commanders', 'syncNewNames')
    .addToUi();
}

// ---------- build ----------

function buildTracker() {
  const ss = SpreadsheetApp.getActive();
  const sheets = ss.getSheets();
  if (sheets.length !== 1 || sheets[0].getLastRow() !== 0) {
    throw new Error('Run this in a new, blank spreadsheet.');
  }
  const src = SpreadsheetApp.openById(CFG.EDH2025_ID);
  const tz = src.getSpreadsheetTimeZone();
  ss.setSpreadsheetTimeZone(tz);
  const log = [];

  const games = []
    .concat(readGameLog2025(src, tz, log))
    .concat(readRetired(src, log))
    .concat(readGameLog2026(src, tz, log));
  games.forEach((g, i) => { g.order = i; });
  games.sort((a, b) => a.date - b.date || a.order - b.order);

  const oldDecks = readOldDecks(log);

  const names = new Set();
  games.forEach(g => [g.deck].concat(g.opps).forEach(n => names.add(n)));
  const resolved = resolveNames([...names], log);
  const canon = n => (resolved[n] ? resolved[n].display : n);
  games.forEach(g => { g.deck = canon(g.deck); g.opps = g.opps.map(canon); });

  const decks = buildDecks(games, oldDecks, canon);

  // Sheets, in display order.
  const stats = sheets[0].setName('Stats');
  const gamesSh = ss.insertSheet('Games');
  const decksSh = ss.insertSheet('Decks I\'ve Played');
  const cmdSh = ss.insertSheet('Commanders');
  const colorsSh = ss.insertSheet('Colors');
  const seatsSh = ss.insertSheet('Seats');
  const logSh = ss.insertSheet('Build Log');

  writeColors(colorsSh);
  writeCommanders(cmdSh, resolved, canon);
  writeStatsFilters(ss, stats);
  writeGames(gamesSh, games);
  writeDecks(decksSh, decks);
  writeSeats(seatsSh);
  writeStatsBody(stats);
  writeLog(logSh, games, decks, log);

  stats.activate();
  SpreadsheetApp.flush();
}

function readGameLog2025(src, tz, log) {
  const rows = src.getSheetByName('Game Log 2025').getDataRange().getValues();
  const out = [];
  const extrasFound = new Set();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const deck = fixName(r[0]);
    if (!deck) continue;
    const date = toDate(r[7]);
    if (!date) { log.push(['Skipped (no date)', `Game Log 2025 row ${i + 1}`]); continue; }
    const opps = [r[1], r[2], r[3]].map(fixName);
    const base = {
      date, pod: clean(r[6]), power: clean(r[8]), bracket: '', deck, opps,
      victory: clean(r[10]), turns: num(r[15]), elim: num(r[16]), notes: clean(r[9]), sol: '', solWin: '',
    };
    if (date.getFullYear() >= 2026) {
      const key = ymd(date, tz);
      const extra = EXTRA_GAMES.find(e => e.date === key && fixName(e.deck) === deck && opps.includes(e.vs)
        && !extrasFound.has(e.date + e.deck));
      if (extra) {
        out.push(Object.assign(base, { winner: extra.winner, seat: extra.seat, source: 'Game Log 2025 (added back)' }));
        extrasFound.add(extra.date + extra.deck);
      }
      continue;
    }
    if (clean(r[4]) || opps.some(o => !o)) continue;  // not a 4-player game
    out.push(Object.assign(base, { winner: winnerFromResult(r[5]), seat: '', source: 'Game Log 2025' }));
  }
  EXTRA_GAMES.filter(e => !extrasFound.has(e.date + e.deck))
    .forEach(e => log.push(['Added-back game not found', `${e.date} ${e.deck}`]));
  return out;
}

function readRetired(src, log) {
  const rows = src.getSheetByName('Retired').getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const deck = fixName(r[0]);
    if (!deck) continue;
    const date = toDate(r[7]);
    const opps = [r[1], r[2], r[3]].map(fixName);
    if (!date) { log.push(['Skipped (no date)', `Retired row ${i + 1}`]); continue; }
    if (clean(r[4]) || opps.some(o => !o)) continue;
    out.push({
      date, pod: clean(r[6]), power: clean(r[8]), bracket: '', deck, opps,
      winner: winnerFromResult(r[5]), seat: '', victory: clean(r[10]), turns: '', elim: '',
      notes: clean(r[9]), sol: '', solWin: '', source: 'Retired', retired: true,
    });
  }
  return out;
}

function readGameLog2026(src, tz, log) {
  const sh = src.getSheetByName('Game Log 2026');
  const rows = sh.getDataRange().getValues();
  const n = rows.length - 1;
  const weights = n > 0 ? sh.getRange(2, 2, n, 3).getFontWeights() : [];
  const rich = n > 0 ? sh.getRange(2, 2, n, 3).getRichTextValues() : [];
  const isBold = (i, k) => {
    if (weights[i][k] === 'bold') return true;
    const rt = rich[i][k];
    return !!rt && rt.getRuns().some(run => run.getTextStyle().isBold() && run.getText().trim() !== '');
  };
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const deck = fixName(r[0]);
    if (!deck) continue;
    const date = toDate(r[6]);
    if (!date) { log.push(['Skipped (no date)', `Game Log 2026 row ${i + 1}`]); continue; }
    let opps = [r[1], r[2], r[3]].map(fixName);
    OPPONENT_FIXES.forEach(f => {
      if (f.date === ymd(date, tz) && fixName(f.deck) === deck) opps = opps.map(o => (o === f.from ? f.to : o));
    });
    const result = clean(r[4]);
    const wto = TURN_ORDER[clean(r[13])] || '';
    let winner = winnerFromResult(result);
    let seat = '';
    if (result === 'Win') {
      seat = wto;
    } else if (result === 'Loss') {
      const bolded = [0, 1, 2].filter(k => isBold(i - 1, k));
      if (bolded.length === 1) {
        const k = bolded[0] + 1;
        winner = 'Opponent ' + k;
        if (wto) seat = (((wto - 1 - k) % 4) + 4) % 4 + 1;
      } else {
        log.push(['Loss without exactly one bolded winner', `Game Log 2026 row ${i + 1}`]);
      }
    }
    out.push({
      date, pod: clean(r[5]), power: clean(r[7]), bracket: num(r[20]), deck, opps, winner, seat,
      victory: clean(r[9]), turns: num(r[14]), elim: num(r[15]), notes: clean(r[8]),
      sol: num(r[21]), solWin: clean(r[22]), source: 'Game Log 2026',
    });
  }
  return out;
}

function readOldDecks(log) {
  const sh = SpreadsheetApp.openById(CFG.OLD_TRACKER_ID).getSheetByName('My Decks');
  const out = {};
  if (!sh) { log.push(['Old My Decks tab not found', 'Deck details start empty']); return out; }
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = fixName(r[0]);
    if (!name) continue;
    out[name] = { status: clean(r[1]), power: clean(r[2]), archetype: clean(r[3]),
      cmc: r[9], price: r[10], rank: r[11], gc: r[12] };
  }
  return out;
}

function buildDecks(games, oldDecks, canon) {
  const played = {};
  games.forEach(g => {
    played[g.deck] = played[g.deck] || { retired: false };
    if (g.retired) played[g.deck].retired = true;
  });
  const old = {};
  Object.keys(oldDecks).forEach(k => { old[canon(k)] = oldDecks[k]; });
  const rank = { Active: 0, Temporary: 1, Retired: 2 };
  return Object.keys(played).map(name => {
    const o = old[name] || {};
    const status = ['Active', 'Retired', 'Temporary'].includes(o.status) ? o.status
      : (played[name].retired ? 'Retired' : 'Temporary');
    return { name, status, power: o.power || '', archetype: o.archetype || '',
      cmc: blank(o.cmc), price: blank(o.price), rank: blank(o.rank), gc: blank(o.gc) };
  }).sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}

// ---------- Scryfall ----------

// With soft = true (the form and the menu), a failed Scryfall request doesn't throw: the names come back
// as 'Lookup pending', so the game still saves and the menu can look them up later.
const PENDING = 'Lookup pending';
function resolveNames(names, log, soft) {
  const lookup = names.filter(n => n && n !== UNKNOWN && !CUSTOM_COLORS[n]);
  const parts = new Set();
  lookup.forEach(n => {
    parts.add(n);
    if (n.includes(' // ')) n.split(' // ').forEach(p => parts.add(p.trim()));
  });
  const byName = {};
  let cards = [];
  let failed = false;
  try {
    cards = scryfallCollection([...parts]);
  } catch (e) {
    if (!soft) throw e;
    failed = true;
  }
  cards.forEach(c => {
    byName[c.name.toLowerCase()] = c;
    if (c.name.includes(' // ')) byName[c.name.split(' // ')[0].toLowerCase()] = c;
  });
  // Exact lookups only. Double-faced cards keep the front face name.
  const one = n => {
    const c = byName[n.toLowerCase()];
    if (!c) return null;
    const display = c.name.includes(' // ') && c.name.toLowerCase() !== n.toLowerCase()
      ? c.name.split(' // ')[0] : c.name;
    return { display, ci: c.color_identity || [] };
  };
  const out = {};
  names.forEach(n => {
    if (!n) return;
    if (n === UNKNOWN) { out[n] = { display: n, letters: '', source: 'Placeholder' }; return; }
    if (CUSTOM_COLORS[n]) { out[n] = { display: n, letters: CUSTOM_COLORS[n], source: 'Custom' }; return; }
    let r = one(n);
    if (!r && n.includes(' // ')) {
      const ps = n.split(' // ').map(p => one(p.trim()));
      if (ps.every(Boolean)) {
        r = { display: ps.map(p => p.display).join(' // '), ci: [].concat(...ps.map(p => p.ci)) };
      }
    }
    if (r) {
      out[n] = { display: r.display, letters: colorLetters(r.ci), source: 'Scryfall' };
    } else if (failed) {
      out[n] = { display: n, letters: '', source: PENDING };
    } else {
      out[n] = { display: n, letters: '', source: 'Not found' };
      if (log) log.push(['Not found on Scryfall', n]);
    }
  });
  return out;
}

function scryfallCollection(names) {
  const cards = [];
  for (let i = 0; i < names.length; i += 75) {
    const res = UrlFetchApp.fetch('https://api.scryfall.com/cards/collection', {
      method: 'post',
      contentType: 'application/json',
      headers: { Accept: 'application/json' },
      payload: JSON.stringify({ identifiers: names.slice(i, i + 75).map(name => ({ name })) }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Scryfall request failed: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    }
    cards.push(...JSON.parse(res.getContentText()).data);
    Utilities.sleep(150);
  }
  return cards;
}

function colorLetters(ci) {
  const order = 'WUBRG';
  const s = [...new Set(ci)].filter(c => order.includes(c)).sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('');
  return s || 'C';
}

// ---------- writers ----------

function writeColors(sh) {
  const rows = Object.keys(COLOR_NAMES).map(k => [k, COLOR_NAMES[k]]);
  sh.getRange(1, 1, 1, 2).setValues([['Letters', 'Color Identity']]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setFrozenRows(1);
}

function writeCommanders(sh, resolved, canon) {
  const seen = new Set();
  const rows = [];
  Object.keys(resolved).forEach(n => {
    const r = resolved[n];
    const name = canon(n);
    if (seen.has(name)) return;
    seen.add(name);
    rows.push([name, r.letters, r.letters ? (COLOR_NAMES[r.letters] || r.letters) : '', r.source]);
  });
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  sh.getRange(1, 1, 1, 4).setValues([['Name', 'Colors', 'Color Identity', 'Source']]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumn(1);
}

function writeStatsFilters(ss, sh) {
  sh.getRange('A1').setValue('Filters').setFontWeight('bold');
  sh.getRange('A2:B7').setValues([
    ['From', new Date(new Date().getFullYear(), 0, 1)],
    ['To', ''],
    ['Pod', 'All'],
    ['Power', 'All'],
    ['Bracket', 'All'],
    ['My Deck', 'All'],
  ]);
  sh.getRange('B2:B3').setNumberFormat('M/d/yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange('B3').setNote('Leave blank for today.');
  ss.setNamedRange('FromDate', sh.getRange('B2'));
  ss.setNamedRange('ToDate', sh.getRange('B3'));
  ss.setNamedRange('PodFilter', sh.getRange('B4'));
  ss.setNamedRange('PowerFilter', sh.getRange('B5'));
  ss.setNamedRange('BracketFilter', sh.getRange('B6'));
  ss.setNamedRange('DeckFilter', sh.getRange('B7'));

  // Hidden dropdown lists for the filters (columns Z:AC).
  sh.getRange('Z1').setFormula('=VSTACK("All",SORT(UNIQUE(FILTER(Games!B2:B,Games!B2:B<>""))))');
  sh.getRange('AA1:AA4').setValues([['All'], ...POWERS.map(p => [p])]);
  sh.getRange('AB1:AB6').setValues([['All'], [1], [2], [3], [4], [5]]);
  // My Deck: the three statuses first, then every deck grouped Active, Temporary, Retired.
  sh.getRange('AC1').setFormula(`=VSTACK("All","Active","Temporary","Retired",LET(d,FILTER('Decks I''ve Played'!A2:B,'Decks I''ve Played'!A2:A<>""),` +
    `CHOOSECOLS(SORT(d,IFERROR(MATCH(CHOOSECOLS(d,2),{"Active";"Temporary";"Retired"},0),4),TRUE,CHOOSECOLS(d,1),TRUE),1)))`);
  const fromList = col => SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange(`${col}1:${col}300`), true).setAllowInvalid(false).build();
  sh.getRange('B4').setDataValidation(fromList('Z'));
  sh.getRange('B5').setDataValidation(fromList('AA'));
  sh.getRange('B6').setDataValidation(fromList('AB'));
  sh.getRange('B7').setDataValidation(fromList('AC'));
  sh.hideColumns(26, 4);
}

function writeGames(sh, games) {
  const rows = games.map(g => [
    g.date, g.pod, g.power, g.bracket, g.deck, g.opps[0], g.opps[1], g.opps[2],
    g.winner, g.seat, '', g.victory, g.turns, g.elim, g.notes, g.sol, g.solWin, g.source,
  ]);
  sh.getRange(1, 1, 1, GAMES_HEADERS.length).setValues([GAMES_HEADERS]);
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange('K2:K').clearContent();  // Result is a formula

  // Calculated columns (row-1 array formulas so new rows fill in on their own).
  sh.getRange('K1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Result",IF(A:A="","",IF(I:I="Me","Win",IF(I:I="","","Loss")))))');
  sh.getRange('S1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Winner Seat",IF((A:A="")+(J:J="")+(I:I="")+(I:I="' + UNKNOWN_OPP + '"),"",IF(I:I="Me",J:J,MOD(J:J-1+IFERROR(VALUE(RIGHT(I:I,1)),0),4)+1))))');
  sh.getRange('T1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Winning Commander",IF(A:A="","",IFS(I:I="Me",E:E,I:I="Opponent 1",F:F,I:I="Opponent 2",G:G,I:I="Opponent 3",H:H,TRUE,""))))');
  sh.getRange('U1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Month",IF(A:A="","",TEXT(A:A,"yyyy-mm"))))');
  sh.getRange('V1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"My Colors",IF(A:A="","",IFERROR(VLOOKUP(E:E,Commanders!A:C,3,FALSE),""))))');
  sh.getRange('W1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"In Range",IF(A:A="",0,' +
    '(A:A>=FromDate)*(A:A<=IF(ToDate="",TODAY(),ToDate))' +
    '*((PodFilter="All")+(B:B=PodFilter)>0)' +
    '*((PowerFilter="All")+(C:C=PowerFilter)>0)' +
    '*((BracketFilter&""="All")+(D:D&""=BracketFilter&"")>0)' +
    `*((DeckFilter="All")+(E:E=DeckFilter)+(IFERROR(VLOOKUP(E:E,'Decks I''ve Played'!A:B,2,FALSE),"")=DeckFilter)>0))))`);

  // Dropdowns.
  const n = sh.getMaxRows() - 1;
  const list = (items, strict) => SpreadsheetApp.newDataValidation()
    .requireValueInList(items, true).setAllowInvalid(!strict).build();
  const fromRange = range => SpreadsheetApp.newDataValidation()
    .requireValueInRange(range, true).setAllowInvalid(true).build();
  const ss = sh.getParent();
  sh.getRange(2, 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  const pods = [...new Set(games.map(g => g.pod).filter(Boolean))].sort();
  sh.getRange(2, 2, n, 1).setDataValidation(list(pods, false));
  sh.getRange(2, 3, n, 1).setDataValidation(list(POWERS, true));
  sh.getRange(2, 4, n, 1).setDataValidation(list(['1', '2', '3', '4', '5'], true));
  sh.getRange(2, 5, n, 1).setDataValidation(fromRange(ss.getSheetByName('Decks I\'ve Played').getRange('A2:A')));
  sh.getRange(2, 6, n, 3).setDataValidation(fromRange(ss.getSheetByName('Commanders').getRange('A2:A')));
  sh.getRange(2, 9, n, 1).setDataValidation(list(WINNERS, true));
  sh.getRange(2, 10, n, 1).setDataValidation(list(['1', '2', '3', '4'], true));
  sh.getRange(2, 12, n, 1).setDataValidation(list(VICTORIES, false));
  sh.getRange(2, 17, n, 1).setDataValidation(list(['Yes', 'No'], false));

  // Formatting.
  sh.getRange('A:A').setNumberFormat('M/d/yyyy');
  sh.getRange(1, 1, 1, 23).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.setColumnWidths(5, 4, 220);
  sh.setColumnWidth(15, 280);
  sh.getRange('S:W').shiftColumnGroupDepth(1);
  sh.getColumnGroup(19, 1).collapse();
}

function writeDecks(sh, decks) {
  sh.getRange(1, 1, 1, 13).setValues([['Commander', 'Status', 'Power', 'Archetype', 'Color Identity',
    'Games', 'Wins', 'Win %', 'Last Played', 'Avg CMC', 'Price', 'EDHREC Rank', 'Game Changers']]).setFontWeight('bold');
  sh.getRange(2, 1, decks.length, 4).setValues(decks.map(d => [d.name, d.status, d.power, d.archetype]));
  sh.getRange(2, 10, decks.length, 4).setValues(decks.map(d => [d.cmc, d.price, d.rank, d.gc]));
  sh.getRange('E1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Color Identity",IF(A:A="","",IFERROR(VLOOKUP(A:A,Commanders!A:C,3,FALSE),"?"))))');
  sh.getRange('F1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Games",IF(A:A="","",COUNTIF(Games!E:E,A:A))))');
  sh.getRange('G1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Wins",IF(A:A="","",COUNTIFS(Games!E:E,A:A,Games!K:K,"Win"))))');
  sh.getRange('H1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Win %",IF(A:A="","",IFERROR(G:G/F:F,""))))');
  sh.getRange('I1').setFormula('=ARRAYFORMULA(IF(ROW(A:A)=1,"Last Played",IF(A:A="","",IFERROR(VLOOKUP(A:A,SORT({Games!E2:E,Games!A2:A},2,FALSE),2,FALSE),""))))');
  const n = sh.getMaxRows() - 1;
  sh.getRange(2, 2, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Active', 'Retired', 'Temporary'], true).setAllowInvalid(false).build());
  sh.getRange(2, 3, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Low', 'Mid', 'Mid-High', 'High'], true).setAllowInvalid(true).build());
  sh.getRange('H:H').setNumberFormat('0%');
  sh.getRange('I:I').setNumberFormat('M/d/yyyy');
  sh.getRange('K:K').setNumberFormat('$#,##0.00');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 320);
}

function writeSeats(sh) {
  const block = (p, label, col) =>
    `b(${p},"${label}",Games!${col}2:${col})`;
  sh.getRange('A1').setFormula(
    '=ARRAYFORMULA(LET(m,Games!A2:A<>"",' +
    'b,LAMBDA(p,lbl,cmd,HSTACK(' +
    'FILTER(ROW(Games!A2:A),m),' +
    'FILTER(Games!A2:A,m),' +
    'FILTER(IF(m,lbl,""),m),' +
    'FILTER(IF(Games!J2:J="","",MOD(Games!J2:J-1+p,4)+1),m),' +
    'FILTER(cmd,m),' +
    'FILTER(IF(Games!I2:I=lbl,TRUE,IF((Games!I2:I="' + UNKNOWN_OPP + '")*(p>0),"",FALSE)),m),' +
    'IFERROR(VLOOKUP(FILTER(cmd,m),Commanders!A:C,3,FALSE),""),' +
    'FILTER(N(Games!K2:K="Win"),m),' +
    'FILTER(Games!W2:W,m))),' +
    'VSTACK({"Game Row","Date","Player","Seat","Commander","Won","Color Identity","My Win","In Range"},' +
    'SORT(VSTACK(' + [block(0, 'Me', 'E'), block(1, 'Opponent 1', 'F'), block(2, 'Opponent 2', 'G'), block(3, 'Opponent 3', 'H')].join(',') +
    '),1,TRUE,3,TRUE))))');
  sh.getRange('B:B').setNumberFormat('M/d/yyyy');
  sh.getRange('1:1').setFontWeight('bold');
  sh.setFrozenRows(1);
}

// Win %, W, L, G grouped by one Games column, for the current filters.
function grp(keyRange, numeric, order) {
  const notNull = numeric ? 'Col1 is not null' : 'Col1 <> \'\'';
  return `=IFERROR(QUERY({${keyRange},ARRAYFORMULA(N(Games!K2:K="Win")),ARRAYFORMULA(N(Games!K2:K="Loss")),Games!W2:W},` +
    `"select Col1, sum(Col2)/count(Col1), sum(Col2), sum(Col3), count(Col1) where Col4 = 1 and ${notNull} ` +
    `group by Col1 order by ${order || 'count(Col1) desc'} ` +
    `label Col1 '', sum(Col2)/count(Col1) '', sum(Col2) '', sum(Col3) '', count(Col1) ''",0),"")`;
}

// Faced, my wins and win % against opponents, grouped by one Seats column.
function opp(keyCol, extra) {
  return `=IFERROR(QUERY({Seats!${keyCol}2:${keyCol},Seats!H2:H,Seats!I2:I,Seats!C2:C},` +
    `"select Col1, count(Col1), sum(Col2), sum(Col2)/count(Col1) where Col3 = 1 and Col4 <> 'Me' and Col1 <> '' ` +
    `${extra || ''}group by Col1 order by count(Col1) desc ` +
    `label Col1 '', count(Col1) '', sum(Col2) '', sum(Col2)/count(Col1) ''",0),"")`;
}

function writeStatsBody(sh) {
  // Left column: my decks.
  sh.getRange('A9:E9').setValues([['My Deck', 'Win %', 'Wins', 'Losses', 'Games']]).setFontWeight('bold');
  sh.getRange('A10:E10').setValues([['All games', '=IFERROR(C10/E10,"")',
    '=COUNTIFS(Games!W2:W,1,Games!K2:K,"Win")', '=COUNTIFS(Games!W2:W,1,Games!K2:K,"Loss")', '=C10+D10']])
    .setFontWeight('bold');
  sh.getRange('A11').setFormula(grp('Games!E2:E'));
  sh.getRange('B10:B').setNumberFormat('0%');

  // Right column: sections stacked from row 1, each with a fixed number of rows.
  let r = 1;
  const pctCols = [];
  const section = (title, headers, formula, rows, pctOffsets) => {
    sh.getRange(r, 7).setValue(title).setFontWeight('bold').setFontSize(12);
    sh.getRange(r + 1, 7, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.getRange(r + 2, 7).setFormula(formula);
    (pctOffsets || []).forEach(o => pctCols.push(sh.getRange(r + 2, 7 + o, rows, 1)));
    r += rows + 4;
  };

  sh.getRange(r, 7).setValue('Global').setFontWeight('bold').setFontSize(12);
  sh.getRange(r + 1, 7, 3, 2).setValues([
    ['Avg game length (turns)', '=IFERROR(AVERAGEIFS(Games!M2:M,Games!W2:W,1,Games!M2:M,">0"),"")'],
    ['Avg 1st elimination (turn)', '=IFERROR(AVERAGEIFS(Games!N2:N,Games!W2:W,1,Games!N2:N,">0"),"")'],
    ['Games with turn data', '=COUNTIFS(Games!W2:W,1,Games!M2:M,">0")'],
  ]);
  sh.getRange(r + 1, 8, 2, 1).setNumberFormat('0.0');
  r += 6;

  section('By seat', ['Seat', 'Win %', 'Wins', 'Losses', 'Games'],
    '=IF(FromDate<DATE(2026,1,1),"Seat stats need games from 2026 on, so set From to 1/1/2026 or later",' +
    grp('Games!J2:J', true, 'Col1').slice(1) + ')', 4, [1]);

  sh.getRange(r, 7).setValue('T1 Sol Ring').setFontWeight('bold').setFontSize(12);
  sh.getRange(r + 1, 7, 4, 2).setValues([
    ['T1 Sol Rings per game', '=IFERROR(AVERAGEIFS(Games!P2:P,Games!W2:W,1,Games!P2:P,"<>"),"")'],
    ['Games with a T1 Sol Ring', '=IFERROR(COUNTIFS(Games!W2:W,1,Games!P2:P,">0")/COUNTIFS(Games!W2:W,1,Games!P2:P,"<>"),"")'],
    ['Ring player won', '=IFERROR(COUNTIFS(Games!W2:W,1,Games!P2:P,">0",Games!Q2:Q,"Yes")/COUNTIFS(Games!W2:W,1,Games!P2:P,">0"),"")'],
    ['Games with Sol Ring data', '=COUNTIFS(Games!W2:W,1,Games!P2:P,"<>")'],
  ]);
  sh.getRange(r + 1, 8).setNumberFormat('0.00');
  sh.getRange(r + 2, 8, 2, 1).setNumberFormat('0%');
  r += 7;

  section('By power', ['Power', 'Win %', 'Wins', 'Losses', 'Games'], grp('Games!C2:C'), 4, [1]);
  section('By pod', ['Pod', 'Win %', 'Wins', 'Losses', 'Games'], grp('Games!B2:B'), 12, [1]);

  const victoryTotal = 'MAX(1,COUNTIFS(Games!W2:W,1,Games!L2:L,"<>"))';
  section('How games end', ['Victory', 'Games', 'Share'],
    `=IFERROR(LET(t,${victoryTotal},QUERY({Games!L2:L,Games!W2:W},` +
    `"select Col1, count(Col1), count(Col1)/"&t&" where Col2 = 1 and Col1 <> '' group by Col1 order by count(Col1) desc ` +
    `label Col1 '', count(Col1) '', count(Col1)/"&t&" ''",0)),"")`, 15, [2]);
  section('Opponents I face most', ['Opponent', 'Faced', 'My Wins', 'Win %'],
    opp('E', 'and Col1 <> \'' + UNKNOWN + '\' ').replace('desc ', 'desc limit 25 '), 25, [3]);
  section('Opponent colors', ['Colors', 'Faced', 'My Wins', 'Win %'], opp('G'), 33, [3]);
  section('My colors', ['Colors', 'Win %', 'Wins', 'Losses', 'Games'], grp('Games!V2:V'), 33, [1]);
  section('By month', ['Month', 'Win %', 'Wins', 'Losses', 'Games'], grp('Games!U2:U', false, 'Col1 desc'), 60, [1]);

  pctCols.forEach(rg => rg.setNumberFormat('0%'));
  sh.setColumnWidth(1, 300);
  sh.setColumnWidth(6, 30);
  sh.setColumnWidth(7, 300);
}

function writeLog(sh, games, decks, log) {
  const count = f => games.filter(f).length;
  const rows = [
    ['Games', games.length],
    ['  from Game Log 2025', count(g => g.source === 'Game Log 2025')],
    ['  from Retired', count(g => g.source === 'Retired')],
    ['  from Game Log 2026', count(g => g.source === 'Game Log 2026')],
    ['  added back from Game Log 2025', count(g => g.source === 'Game Log 2025 (added back)')],
    ['Wins', count(g => g.winner === 'Me')],
    ['Losses', count(g => g.winner && g.winner !== 'Me')],
    ['Games with My Seat', count(g => g.seat !== '')],
    ['Decks I\'ve Played', decks.length],
    ['', ''],
  ].concat(log);
  sh.getRange(1, 1, 1, 2).setValues([['Item', 'Detail']]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.autoResizeColumn(1);
}

// ---------- menu: add new decks and commanders ----------

function syncNewNames() {
  const ss = SpreadsheetApp.getActive();
  const games = ss.getSheetByName('Games');
  const cmdSh = ss.getSheetByName('Commanders');
  const decksSh = ss.getSheetByName('Decks I\'ve Played');
  const last = games.getLastRow();
  if (last < 2) return;
  const block = games.getRange(2, 5, last - 1, 4);
  const values = block.getValues().map(r => r.map(clean));
  const known = new Set(cmdSh.getRange('A2:A').getValues().flat().filter(String));
  const fresh = [...new Set(values.flat().filter(n => n && !known.has(n)))];
  let added = 0;
  const retried = retryPendingLookups_(ss);
  if (fresh.length) {
    const resolved = resolveNames(fresh, null, true);
    const canon = n => (resolved[n] ? resolved[n].display : n);
    block.setValues(values.map(r => r.map(canon)));
    const rows = [];
    fresh.forEach(n => {
      const name = canon(n);
      if (known.has(name)) return;
      known.add(name);
      const r = resolved[n];
      rows.push([name, r.letters, r.letters ? (COLOR_NAMES[r.letters] || r.letters) : '', r.source]);
    });
    if (rows.length) {
      cmdSh.getRange(cmdSh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
      cmdSh.getRange(2, 1, cmdSh.getLastRow() - 1, 4).sort(1);
      added = rows.length;
    }
  }
  const myDecks = new Set(decksSh.getRange('A2:A').getValues().flat().filter(String));
  const newDecks = [...new Set(games.getRange(2, 5, last - 1, 1).getValues().flat().map(clean)
    .filter(n => n && !myDecks.has(n)))];
  if (newDecks.length) {
    const start = decksSh.getRange('A:A').getValues().filter(r => r[0] !== '').length + 1;
    decksSh.getRange(start, 1, newDecks.length, 2).setValues(newDecks.map(n => [n, 'Temporary']));
  }
  const rows = cmdSh.getRange('A2:D').getValues();
  const missing = rows.filter(r => r[3] === 'Not found').map(r => r[0]);
  const pending = rows.filter(r => r[3] === PENDING).map(r => r[0]);
  SpreadsheetApp.getUi().alert(`Added ${added} commander(s) and ${newDecks.length} deck(s).` +
    (retried ? ` Looked up ${retried} that were waiting.` : '') +
    (missing.length ? `\n\nNot found on Scryfall (check the spelling): ${missing.join(', ')}` : '') +
    (pending.length ? `\n\nScryfall is busy, so these are still waiting. Try again in a minute: ${pending.join(', ')}` : ''));
}

// Looks up commanders saved while Scryfall was unavailable. Fixes their colors, and their spelling
// everywhere in Games if Scryfall's name differs. Returns how many were resolved.
function retryPendingLookups_(ss) {
  const cmdSh = ss.getSheetByName('Commanders');
  const last = cmdSh.getLastRow();
  if (last < 2) return 0;
  const range = cmdSh.getRange(2, 1, last - 1, 4);
  const rows = range.getValues();
  const pending = rows.filter(r => r[3] === PENDING).map(r => String(r[0]));
  if (!pending.length) return 0;
  const resolved = resolveNames(pending, null, true);
  const renames = {};
  let done = 0;
  rows.forEach(r => {
    const res = r[3] === PENDING && resolved[r[0]];
    if (!res || res.source === PENDING) return;
    if (res.display !== r[0]) renames[r[0]] = res.display;
    r[0] = res.display;
    r[1] = res.letters;
    r[2] = res.letters ? (COLOR_NAMES[res.letters] || res.letters) : '';
    r[3] = res.source;
    done++;
  });
  range.setValues(rows);
  if (Object.keys(renames).length) {
    const games = ss.getSheetByName('Games');
    const gl = games.getLastRow();
    if (gl > 1) {
      const block = games.getRange(2, 5, gl - 1, 4);
      block.setValues(block.getValues().map(r => r.map(v => renames[v] || v)));
    }
  }
  return done;
}

// ---------- helpers ----------

function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function fixName(v) { const n = clean(v); return NAME_FIXES[n] || n; }
function toDate(v) { if (v instanceof Date) return v; const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; }
function num(v) { return v === '' || v == null ? '' : Number(v); }
function blank(v) { return v == null ? '' : v; }
function ymd(d, tz) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
function winnerFromResult(v) { const r = clean(v); return r === 'Win' ? 'Me' : r === 'Loss' ? UNKNOWN_OPP : ''; }

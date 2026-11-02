'use strict';

const STORE_KEY = 'edhLife.v2';
const VICTORIES = ['Combat Damage', 'Non-Combat Damage', 'Commander Damage', 'Combo', 'Alternate Win Condition',
  'Poison', 'Infect', 'Mill', 'Lockout', 'Concession'];
const CAUSE_VICTORY = { cmd: 'Commander Damage', poison: 'Poison', concede: 'Concession' };
const CAUSE_LABEL = { life: 'life', cmd: 'commander damage', poison: 'poison', concede: 'conceded' };
const MANA = ['W', 'U', 'B', 'R', 'G', 'C'];
const COUNTERS = [['poison', 'Poison', 'biohazard'], ['energy', 'Energy', 'zap'], ['experience', 'Experience', 'experience'], ['rad', 'Rad', 'radiation']];
const $ = id => document.getElementById(id);

/*
 * Layouts. Seats are listed clockwise around the table starting with you, which is also the turn order
 * (turns pass to the left). So seat i is "Opponent i" on the sheet. rot is how far that player's
 * panel is turned so it reads upright from their side: 0 bottom, 90 left edge, 180 top, 270 right edge.
 */
const LAYOUTS = {
  1: { cols: '1fr', rows: '1fr', areas: '"a"', seats: [['a', 0]] },
  2: { cols: '1fr', rows: '1fr 1fr', areas: '"b" "a"', seats: [['a', 0], ['b', 180]] },
  3: { cols: '1fr 1fr', rows: '1.5fr 1fr', areas: '"b c" "a a"',
    seats: [['a', 0], ['b', 90], ['c', 270]] },
  '4ends': { cols: '1fr 1fr', rows: '1fr 1.5fr 1fr', areas: '"c c" "b d" "a a"',
    seats: [['a', 0], ['b', 90], ['c', 180], ['d', 270]] },
  '4sides': { cols: '1fr 1fr', rows: '1fr 1fr', areas: '"b c" "a d"',
    seats: [['a', 90], ['b', 90], ['c', 270], ['d', 270]] },
  5: { cols: '1fr 1fr', rows: '1fr 1fr 1fr', areas: '"c d" "b e" "a a"',
    seats: [['a', 0], ['b', 90], ['c', 90], ['d', 270], ['e', 270]] },
  6: { cols: '1fr 1fr', rows: '0.85fr 1fr 1fr 0.85fr', areas: '"d d" "c e" "b f" "a a"',
    seats: [['a', 0], ['b', 90], ['c', 90], ['d', 180],
      ['e', 270], ['f', 270]] },
};
const layoutKey = (n, style) => (n === 4 ? `4${style}` : String(n));

// The table's looks. style.css keys off html[data-theme]; the one behavior a look sets is whether each
// panel's tools are always showing or appear on demand.
// Where player p's panel is drawn: you pick your cell in setup (or move it from the menu), and the others follow
// clockwise in turn order. Games saved before this sit at cell 0.
function cellOf(g, p) {
  const seats = LAYOUTS[g.layout].seats;
  return seats[((g.seat || 0) + p) % seats.length];
}

const THEMES = {
  companion: { label: 'Companion', toolsOnDemand: false },
  minimal: { label: 'Minimal', toolsOnDemand: true },
};

// ---------- storage ----------

function defaults() {
  return { settings: { url: '', key: '' }, lists: { decks: [], commanders: [], pods: [], last: {} },
    listsAt: 0, prefs: { life: '40', players: '4', layout: 'ends', theme: 'companion' }, game: null, undo: [], queue: [], radArt: '' };
}
const store = (() => {
  try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); }
  catch (e) { return defaults(); }
})();
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable */ }
}
function applyTheme() {
  if (!THEMES[store.prefs.theme]) store.prefs.theme = 'companion';
  document.documentElement.dataset.theme = store.prefs.theme;
}

// ---------- small UI helpers ----------

const picked = {};
function seg(id, options, value, onPick) {
  const el = $(id);
  el.innerHTML = '';
  picked[id] = value == null ? '' : String(value);
  options.forEach(o => {
    const opt = typeof o === 'object' ? o : { value: String(o), label: String(o) };
    const b = document.createElement('button');
    b.type = 'button';
    if (opt.html) b.innerHTML = opt.html; else b.textContent = opt.label;
    b.classList.toggle('on', opt.value === picked[id]);
    b.onclick = () => {
      picked[id] = opt.value;
      [...el.children].forEach(c => c.classList.toggle('on', c === b));
      if (onPick) onPick(opt.value);
    };
    el.appendChild(b);
  });
}
function fillList(id, items) {
  const el = $(id);
  el.innerHTML = '';
  items.forEach(v => { const o = document.createElement('option'); o.value = v; el.appendChild(o); });
}
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}
// A yes/no question in the app's own card. The browser's confirm dialog is swallowed by some webviews and looks foreign on a phone.
function ask(text, okLabel) {
  return new Promise(resolve => {
    $('confirmText').textContent = text;
    $('confirmOk').textContent = okLabel;
    $('confirm').classList.remove('hidden');
    const done = yes => { $('confirm').classList.add('hidden'); document.removeEventListener('keydown', onKey); resolve(yes); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    $('confirmOk').onclick = () => done(true);
    $('confirmCancel').onclick = () => done(false);
    $('confirmOk').focus();
  });
}
function msg(id, text, isError) {
  $(id).textContent = text || '';
  $(id).classList.toggle('error', !!isError);
}
function show(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== screen));
  // The table is drawn once it is showing, because renderTable measures the panels.
  if (screen === 'table') { renderTable(); keepAwake(); } else releaseAwake();
  window.scrollTo(0, 0);
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const shortName = n => String(n).split(' // ')[0].split(',')[0];
const halves = n => String(n).split(' // ').map(shortName);
// Labels for a player's two commanders; a partner that wasn't typed in is just "Partner".
const commanderNames = pl => { const h = halves(pl.name); return h.length > 1 ? h.slice(0, 2) : [h[0], 'Partner']; };
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- sync ----------

async function api(game) {
  const { url, key } = store.settings;
  if (!url || !key) throw new Error('Add your sync URL and key in Settings.');
  let res;
  try {
    res = game
      ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key, game }) })
      : await fetch(`${url}?key=${encodeURIComponent(key)}`);
  } catch (e) {
    throw new Error('Couldn\'t reach your sync URL. Check the address and your connection.');
  }
  let data;
  try { data = await res.json(); } catch (e) {
    throw new Error('That URL didn\'t answer like the sync script. Check it\'s deployed with access set to Anyone.');
  }
  if (!data.ok) throw new Error(data.error || 'Sync failed.');
  return data;
}

async function refreshLists() {
  const data = await api();
  store.lists = { decks: data.decks, commanders: data.commanders, pods: data.pods, last: data.last };
  store.listsAt = Date.now();
  persist();
}

let syncing = false;
let syncError = '';
async function syncQueue() {
  if (syncing || !store.queue.length || !store.settings.url) { renderHome(); return; }
  syncing = true;
  syncError = '';
  renderHome();
  try {
    while (store.queue.length) {
      await api(store.queue[0]);
      store.queue.shift();
      persist();
    }
    toast('Synced to your sheet');
    await refreshLists().catch(() => {});
  } catch (e) {
    syncError = e.message;
  } finally {
    syncing = false;
    renderHome();
  }
}
window.addEventListener('online', syncQueue);

// ---------- home & settings ----------

function renderHome() {
  $('resumeGame').classList.toggle('hidden', !store.game);
  $('newGame').textContent = store.game ? 'New game (discards current)' : 'New game';
  const q = store.queue.length;
  const games = `${q} game${q > 1 ? 's' : ''}`;
  let text = q ? `${games} waiting to sync.` : 'All games synced.';
  if (syncing) text = 'Syncing…';
  else if (q && syncError) text += ` Last try: ${syncError}`;
  if (!store.settings.url) {
    text = (q ? `${games} saved on this phone. ` : '') + 'Add your sync URL and key in Settings to send games to your sheet.';
  }
  $('syncStatus').textContent = text;
  $('syncNow').classList.toggle('hidden', !q || syncing || !store.settings.url);
}

// The Look row, in Settings and in setup. Both set the one pref, so the next table drawn follows whichever was picked last.
function lookRow(id) {
  seg(id, Object.keys(THEMES).map(k => ({ value: k, label: THEMES[k].label })), store.prefs.theme, v => {
    store.prefs.theme = v;
    persist();
    applyTheme();
  });
}

$('openSettings').onclick = () => {
  $('setUrl').value = store.settings.url;
  $('setKey').value = store.settings.key;
  lookRow('theme');
  $('setArt').checked = store.prefs.art !== false;
  msg('settingsMsg', '');
  show('settings');
};
$('closeSettings').onclick = () => { renderHome(); show('home'); };
$('setArt').onchange = () => { store.prefs.art = $('setArt').checked; persist(); };
$('saveSettings').onclick = async () => {
  store.settings = { url: $('setUrl').value.trim(), key: $('setKey').value.trim() };
  persist();
  msg('settingsMsg', 'Testing…');
  try {
    await refreshLists();
    msg('settingsMsg', `Connected. ${store.lists.decks.length} decks and ${store.lists.commanders.length} commanders loaded.`);
    syncQueue();
  } catch (e) {
    msg('settingsMsg', e.message, true);
  }
};
$('syncNow').onclick = syncQueue;

// ---------- names ----------

function knownColors() {
  const m = {};
  store.lists.commanders.forEach(([name, letters]) => { m[name.toLowerCase()] = [name, letters]; });
  return m;
}

// One card from Scryfall's API by path ('named?exact=…', or a set and collector number); null if there is no such card.
// Scryfall asks for about 100 ms between requests and answers a burst with 429, so requests go out one at a time with a
// gap, each path is fetched once per session (the art lookup reuses the name check), and a 429 gets one retry after a
// short wait. Not found caches as null; a failure (offline, or still rate-limited) throws and is not cached.
const sfCache = new Map();
let sfQueue = Promise.resolve();
let sfLast = 0;
function scryfall(path) {
  if (!sfCache.has(path)) {
    const run = sfQueue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        await new Promise(r => setTimeout(r, Math.max(0, sfLast + 120 - Date.now())));
        const res = await fetch(`https://api.scryfall.com/cards/${path}`).finally(() => { sfLast = Date.now(); });
        if (res.ok) return res.json();
        if (res.status === 404) return null;
        if (res.status === 429 && attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
        throw new Error(`Scryfall ${res.status}`);
      }
    });
    sfQueue = run.catch(() => {});
    sfCache.set(path, run);
    run.catch(() => sfCache.delete(path));
  }
  return sfCache.get(path);
}

// Exact-name Scryfall lookup (front face for double-faced cards). Returns null offline or if not found.
async function scryfallExact(name) {
  const one = async n => {
    const c = await scryfall(`named?exact=${encodeURIComponent(n)}`);
    if (!c) return null;
    const front = c.name.includes(' // ') && c.name.toLowerCase() !== n.toLowerCase() ? c.name.split(' // ')[0] : c.name;
    return { name: front, ci: c.color_identity };
  };
  try {
    let r = await one(name);
    if (!r && name.includes(' // ')) {
      const parts = await Promise.all(name.split(' // ').map(p => one(p.trim())));
      if (parts.every(Boolean)) r = { name: parts.map(p => p.name).join(' // '), ci: [].concat(...parts.map(p => p.ci)) };
    }
    if (!r) return null;
    const order = 'WUBRG';
    return { name: r.name, letters: [...new Set(r.ci)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('') || 'C' };
  } catch (e) {
    return null;
  }
}

// Card art (Scryfall's art crop) for a commander, or one per half for a partner pair. null offline or if not found.
async function cardArt(name) {
  const one = async n => {
    const c = await scryfall(`named?exact=${encodeURIComponent(n)}`);
    const uris = c && (c.image_uris || (c.card_faces && c.card_faces[0].image_uris));
    return uris ? uris.art_crop : null;
  };
  try {
    const whole = await one(name);
    if (whole) return [whole];
    if (name.includes(' // ')) {
      const parts = await Promise.all(name.split(' // ').map(p => one(p.trim())));
      if (parts.every(Boolean)) return parts;
    }
  } catch (e) { /* offline */ }
  return null;
}

// Fills in art for named players in the background, so starting a game never waits on it.
async function loadArt() {
  const g = G();
  if (!g || !navigator.onLine || store.prefs.art === false) return;
  const id = g.id;
  for (const i of g.players.map((pl, n) => n).filter(n => g.named[n] && !g.players[n].art)) {
    const art = await cardArt(g.players[i].name);
    if (!G() || G().id !== id) return;
    if (art) { G().players[i].art = art; commit(); }
  }
}
window.addEventListener('online', () => loadArt());

async function resolveName(n) {
  if (!n) return { name: '', letters: '', known: true };
  const hit = knownColors()[n.toLowerCase()];
  if (hit) return { name: hit[0], letters: hit[1], known: true };
  const sf = await scryfallExact(n);
  return sf ? { name: sf.name, letters: sf.letters, known: false } : { name: n, letters: null, known: false };
}

// Name suggestions: Scryfall's autocomplete answers at most 20 names. When an answer had fewer, every longer query that
// starts with the same letters is a subset of it, so those are filtered here instead of asked for again.
let acTimer = null;
let acLast = null;
function autocomplete(e) {
  const q = e.target.value.trim();
  clearTimeout(acTimer);
  if (q.length < 3) return;
  const suggest = names => fillList('cmdList', [...new Set(names.concat(store.lists.commanders.map(c => c[0])))]);
  const lq = q.toLowerCase();
  if (acLast && acLast.complete && lq.startsWith(acLast.q)) { suggest(acLast.names.filter(n => n.toLowerCase().includes(lq))); return; }
  if (!navigator.onLine) return;
  acTimer = setTimeout(async () => {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
      const names = (await res.json()).data || [];
      acLast = { q: lq, names, complete: names.length < 20 };
      suggest(names);
    } catch (err) { /* offline: keep the known list */ }
  }, 250);
}

// ---------- setup ----------

function miniLayout(key) {
  const l = LAYOUTS[key];
  const tiles = [...new Set(l.areas.replace(/"/g, '').split(/\s+/))].map(a => `<i style="grid-area:${a}"></i>`).join('');
  const areas = l.areas.replace(/"/g, '\'');
  return `<span class="mini" style="grid-template-columns:${l.cols};grid-template-rows:${l.rows};grid-template-areas:${areas}">${tiles}</span>`;
}

function currentLayout() {
  return LAYOUTS[layoutKey(Number(picked.playerCount), picked.layout)];
}

// The seat picker: the layout's cells drawn like the Layout diagrams but tappable, with "You" in the chosen cell turned
// the way that panel will face. The choice is kept per layout.
function renderSeatPick(key) {
  const l = LAYOUTS[key];
  if (!(key in picked.seatBy)) picked.seatBy[key] = Math.min((store.prefs.seat || {})[key] || 0, l.seats.length - 1);
  $('seatWrap').classList.toggle('hidden', l.seats.length < 2);
  const pick = $('seatPick');
  pick.innerHTML = '';
  pick.style.gridTemplateColumns = l.cols;
  pick.style.gridTemplateRows = l.rows;
  pick.style.gridTemplateAreas = l.areas;
  l.seats.forEach(([area, rot], k) => {
    const on = k === picked.seatBy[key];
    const b = el('button', on ? 'on' : null);
    b.type = 'button';
    b.style.gridArea = area;
    b.setAttribute('aria-label', `Seat ${k + 1}`);
    b.setAttribute('aria-pressed', on);
    if (on) {
      const you = el('span', null, 'You');
      you.style.transform = `rotate(${rot === 270 ? -90 : rot}deg)`;
      b.appendChild(you);
    }
    b.onclick = () => { picked.seatBy[key] = k; renderSeatPick(key); };
    pick.appendChild(b);
  });
}

function renderSeats() {
  const n = Number(picked.playerCount);
  $('layoutWrap').classList.toggle('hidden', n !== 4);
  renderSeatPick(layoutKey(n, picked.layout));
  const seats = currentLayout().seats;
  // Names and Partner switches carry over to the seats that remain when the player count or layout changes.
  const old = {};
  document.querySelectorAll('#seats input').forEach(i => { old[i.id] = i.value; });
  picked.partner = seats.map((s, i) => !!picked.partner[i]);
  const wrap = $('seats');
  wrap.innerHTML = '';
  seats.forEach((s, i) => {
    const lab = el('label');
    // Seats are numbered in turn order, clockwise from you; where each one sits follows from that.
    lab.textContent = i === 0 ? 'Your deck' : `Opponent ${i}`;
    const input = el('input');
    input.id = `seat${i}`;
    input.autocomplete = 'off';
    input.setAttribute('list', i === 0 ? 'deckList' : 'cmdList');
    input.placeholder = 'Commander';
    input.value = old[input.id] || '';
    if (i > 0) input.addEventListener('input', autocomplete);
    // Off, the partner field is only hidden, so its name comes back if the switch goes on again.
    const partner = el('input', picked.partner[i] ? '' : 'hidden');
    partner.id = `partner${i}`;
    partner.autocomplete = 'off';
    partner.setAttribute('list', 'cmdList');
    partner.placeholder = 'Partner';
    partner.value = old[partner.id] || '';
    partner.addEventListener('input', autocomplete);
    const tog = el('button', 'toggle' + (picked.partner[i] ? ' on' : ''), 'Partner');
    tog.type = 'button';
    tog.setAttribute('aria-pressed', String(picked.partner[i]));
    tog.onclick = () => {
      picked.partner[i] = !picked.partner[i];
      tog.classList.toggle('on', picked.partner[i]);
      tog.setAttribute('aria-pressed', String(picked.partner[i]));
      partner.classList.toggle('hidden', !picked.partner[i]);
    };
    const seat = el('div', 'seat');
    seat.append(input, tog, partner);
    wrap.append(lab, seat);
  });
  const firstOpts = seats.map((s, i) => ({ value: String(i), label: i === 0 ? 'You' : `Opponent ${i}` }));
  seg('first', firstOpts, picked.first && Number(picked.first) < n ? picked.first : '');
  $('syncNote').textContent = n === 4 ? '' : 'Only 4-player games are sent to your sheet. This one is just for counting life.';
}

function openSetup() {
  const p = store.prefs;
  fillList('podList', store.lists.pods);
  fillList('deckList', store.lists.decks);
  fillList('cmdList', store.lists.commanders.map(c => c[0]));
  $('seats').innerHTML = '';
  seg('startLife', ['20', '25', '30', '40', '50', '60'], p.life);
  seg('playerCount', ['1', '2', '3', '4', '5', '6'], p.players, renderSeats);
  seg('layout', [{ value: 'sides', html: `${miniLayout('4sides')}Two per side` },
    { value: 'ends', html: `${miniLayout('4ends')}One at each end` }], p.layout, renderSeats);
  lookRow('look');
  picked.first = '';
  picked.partner = [];
  picked.seatBy = {};
  renderSeats();
  msg('setupMsg', '');
  show('setup');
}
$('newGame').onclick = async () => {
  if (store.game && !await ask('Discard the game in progress?', 'Discard')) return;
  openSetup();
};
$('resumeGame').onclick = () => { show('table'); loadArt(); };
$('cancelSetup').onclick = () => { renderHome(); show('home'); };
$('randomFirst').onclick = () => {
  const btns = $('first').children;
  const i = Math.floor(Math.random() * btns.length);
  btns[i].click();
  toast(`${btns[i].textContent} goes first`);
};

function newPlayer(name, letters, life, n) {
  return { name, letters: letters || '', partner: name.includes(' // '), life,
    cmd: Array.from({ length: n }, () => [0, 0]), tax: [0, 0],
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, counters: { poison: 0, energy: 0, experience: 0, rad: 0 }, out: null };
}

$('startGame').onclick = async () => {
  const n = Number(picked.playerCount);
  const key = layoutKey(n, picked.layout);
  const seatNames = LAYOUTS[key].seats.map((s, i) => [$(`seat${i}`).value.trim()].concat(picked.partner[i] ? [$(`partner${i}`).value.trim()] : []));
  if (picked.first === '') { msg('setupMsg', 'Pick who goes first.', true); return; }
  if (seatNames.some(h => h.length > 1 && !(h[0] && h[1]))) { msg('setupMsg', 'Type both partners\' names, or turn Partner off.', true); return; }
  // A partner pair becomes "First // Second", the way it has always been typed, so everything downstream reads it unchanged.
  const typed = seatNames.map(h => h.join(' // '));
  if (n === 4 && typed.some(t => !t)) { msg('setupMsg', 'Fill in every commander so the game can go to your sheet.', true); return; }
  msg('setupMsg', 'Checking names…');
  const resolved = await Promise.all(typed.map(resolveName));
  const unknown = resolved.filter(r => r.name && r.letters == null).map(r => r.name);
  if (unknown.length && !await ask(`Couldn't find ${unknown.join(', ')} on Scryfall. Start anyway?`, 'Start anyway')) {
    msg('setupMsg', 'Check the spelling and try again.', true);
    return;
  }
  const life = Number(picked.startLife);
  const seat = picked.seatBy[key] || 0;
  Object.assign(store.prefs, { life: picked.startLife, players: picked.playerCount, layout: picked.layout || 'ends',
    seat: Object.assign({}, store.prefs.seat, { [key]: seat }) });
  const colors = {};
  resolved.forEach(r => { if (!r.known && r.letters != null) colors[r.name] = r.letters; });
  const first = Number(picked.first);
  store.game = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
    n, layout: key, seat, life0: life, colors, first, active: first, round: 1, started: Date.now(), events: [], storm: 0,
    players: resolved.map((r, i) => newPlayer(r.name || (i === 0 ? 'You' : `Player ${i + 1}`), r.letters, life, n)),
    named: resolved.map(r => !!r.name),
    dmgTarget: null,
  };
  store.undo = [];
  persist();
  msg('setupMsg', '');
  show('table');
  loadArt();
};

// ---------- game rules ----------

const G = () => store.game;
const turnPos = i => (i - G().first + G().n) % G().n;  // 0 for whoever went first
const alive = () => G().players.map((p, i) => i).filter(i => !G().players[i].out);

// Undo history is saved with the game so it survives the phone closing the app. Snapshots keep only the
// event log's length and leave out the art, so they stay small.
const UNDO_MAX = 80;
let repeating = false;  // true while a press-and-hold repeats, so the whole hold is one undo step
// Taps on the same control within the delta float's window are one undo step, so Undo takes back what the float
// showed. A held button already is: its repeats take no snapshot. Anything without a key is always its own step.
const BURST = 1500;
let lastSnap = { key: null, at: 0 };
function snapshot(key) {
  if (repeating) return;
  const now = Date.now();
  if (key && key === lastSnap.key && now - lastSnap.at < BURST) { lastSnap.at = now; return; }
  lastSnap = { key: key || null, at: now };
  const g = G();
  store.undo.push(JSON.stringify(Object.assign({}, g, {
    events: g.events.length,
    players: g.players.map(pl => Object.assign({}, pl, { art: undefined })),
  })));
  if (store.undo.length > UNDO_MAX) store.undo.shift();
}
function undo() {
  if (!store.undo.length) return false;
  const g = G();
  const prev = JSON.parse(store.undo.pop());
  lastSnap = { key: null, at: 0 };
  prev.events = g.events.slice(0, prev.events);
  prev.players.forEach((pl, i) => { pl.art = g.players[i] && g.players[i].art; });
  store.game = prev;
  return true;
}
function logEvent(e) {
  G().events.push(Object.assign({ t: Math.round((Date.now() - G().started) / 1000), r: G().round }, e));
}
function commit() { persist(); renderTable(); }

function changeLife(p, d) {
  snapshot(`life ${p}`);
  G().players[p].life += d;
  logEvent({ p, life: d });
  checkOut(p, 'life');
  showDelta(p, d);
  commit();
}
function changeCmd(target, from, half, d) {
  const pl = G().players[target];
  if (pl.cmd[from][half] + d < 0) return;
  snapshot(`cmd ${target} ${from} ${half}`);
  pl.cmd[from][half] += d;
  pl.life -= d;
  logEvent({ p: target, cmd: d, from, half });
  checkOut(target, 'cmd');
  showDelta(target, -d);
  commit();
}
function changeCounter(p, key, d) {
  const pl = G().players[p];
  if (pl.counters[key] + d < 0) return;
  snapshot(`counter ${p} ${key}`);
  pl.counters[key] += d;
  logEvent({ p, [key]: d });
  if (key === 'poison') checkOut(p, 'poison');
  commit();
}
function changeTax(p, half, d) {
  const pl = G().players[p];
  if (pl.tax[half] + d < 0) return;
  pl.tax[half] += d;
  commit();
}
function changeMana(p, c, d) {
  const pl = G().players[p];
  if (pl.mana[c] + d < 0) return;
  pl.mana[c] += d;
  commit();
}
function checkOut(p, via) {
  const pl = G().players[p];
  if (pl.out) return;
  let cause = null;
  if (pl.counters.poison >= 10) cause = 'poison';
  else if (pl.cmd.some(c => c[0] >= 21 || c[1] >= 21)) cause = 'cmd';
  else if (pl.life <= 0) cause = via === 'cmd' ? 'cmd' : 'life';
  if (cause) eliminate(p, cause);
}
function eliminate(p, cause) {
  G().players[p].out = { turn: G().round, cause };
  logEvent({ p, out: cause });
  if (G().active === p && alive().length > 1) advanceTurn();
}
function advanceTurn() {
  const g = G();
  let next = g.active;
  for (let i = 0; i < g.n; i++) {
    next = (next + 1) % g.n;
    if (!g.players[next].out) break;
  }
  if (turnPos(next) <= turnPos(g.active)) g.round += 1;
  g.active = next;
  g.storm = 0;
  logEvent({ turn: next });
}

const deltas = {};
function showDelta(p, d) {
  const cur = deltas[p] || { sum: 0 };
  clearTimeout(cur.timer);
  cur.sum += d;
  cur.at = Date.now();
  cur.timer = setTimeout(() => { delete deltas[p]; if (G()) renderTable(); }, 1500);
  deltas[p] = cur;
}

// Press-and-hold repeats. The table re-renders on every change, so the pressed button is replaced
// mid-hold; releasing anywhere on the page stops the repeat.
let holdTimers = [];
function stopHolds() { holdTimers.forEach(t => { clearTimeout(t); clearInterval(t); }); holdTimers = []; }
['pointerup', 'pointercancel', 'blur'].forEach(t => window.addEventListener(t, stopHolds));
// A tap counts when the finger lifts, or 80 ms in if it is still down, so a hold starts at once and keeps counting.
// Moving more than 12 px before that is the start of a swipe, not a tap, and counts nothing.
function holdRepeat(btn, fn) {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    stopHolds();
    const x = e.clientX, y = e.clientY, id = e.pointerId;
    let done = false;
    const fire = () => { if (!done) { done = true; fn(); } };
    const again = () => { repeating = true; try { fn(); } finally { repeating = false; } };
    const off = () => { btn.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', off); };
    const move = ev => { if (ev.pointerId === id && Math.hypot(ev.clientX - x, ev.clientY - y) > 12) { done = true; stopHolds(); off(); } };
    const up = ev => { if (ev.pointerId === id) { fire(); off(); } };
    btn.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', off);
    holdTimers.push(setTimeout(() => { fire(); holdTimers.push(setTimeout(() => { holdTimers.push(setInterval(again, 110)); }, 370)); }, 80));
  });
}

// A sideways swipe, from the player's own point of view, flips their panel to its status card and back. It is tracked
// on the board, which outlives the re-render a counted tap causes mid-gesture. A swipe that began on a button must not
// also count as that button's tap, so the click that follows it is swallowed.
let swipedAt = 0;
(() => {
  const board = $('board');
  let start = null;
  board.addEventListener('pointerdown', e => {
    const panel = e.target.closest('.panel');
    const p = panel ? [...board.children].indexOf(panel) : -1;
    start = p < 0 ? null : { x: e.clientX, y: e.clientY, id: e.pointerId, p, rot: cellOf(G(), p)[1] };
  });
  board.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const [along, across] = start.rot % 180 ? [dy, dx] : [dx, dy];
    if (Math.abs(along) < 40 || Math.abs(along) < Math.abs(across) * 1.5) return;
    const p = start.p;
    start = null;
    stopHolds();
    swipedAt = Date.now();
    if (ui[p].sheet || G().dmgTarget != null) return;
    ui[p].info = !ui[p].info;
    renderTable();
  });
  ['pointerup', 'pointercancel'].forEach(t => board.addEventListener(t, () => { start = null; }));
  board.addEventListener('click', e => { if (Date.now() - swipedAt < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
})();

// The status card a swipe flips a panel to: commander damage from every opponent, then the player's nonzero counters.
function infoCard(p) {
  const g = G();
  const pl = g.players[p];
  const card = el('div', 'sheet info');
  card.appendChild(el('h3', null, 'Commander damage'));
  const rows = el('div', 'infoRows');
  g.players.forEach((src, s) => {
    if (s === p) return;
    const [a, b] = pl.cmd[s];
    const row = el('div', 'infoRow' + (a >= 21 || b >= 21 ? ' lethal' : a >= 15 || b >= 15 ? ' warn' : ''));
    const who = el('i', null, g.named[s] ? shortName(src.name)[0].toUpperCase() : String(s + 1));
    who.style.background = tint(src.letters);
    const split = src.partner || b > 0;
    row.append(who, el('span', 'nm', split ? commanderNames(src).join(' & ') : shortName(src.name)), el('b', null, split ? `${a} / ${b}` : String(a)));
    rows.appendChild(row);
  });
  COUNTERS.forEach(([k, label, icon]) => {
    const n = pl.counters[k];
    if (!n) return;
    const row = el('div', 'infoRow' + (k === 'poison' ? (n >= 10 ? ' lethal' : n >= 7 ? ' warn' : '') : ''));
    const ic = el('i', 'ic');
    ic.innerHTML = iconSvg(icon);
    row.append(ic, el('span', 'nm', label), el('b', null, String(n)));
    rows.appendChild(row);
  });
  card.appendChild(rows);
  card.appendChild(el('small', 'hint', 'Swipe or tap to go back'));
  card.onclick = () => { ui[p].info = false; renderTable(); };
  return card;
}

// ---------- the table ----------

function tint(letters) {
  const cols = (letters || 'C').split('').map(c => `var(--${c})`);
  return cols.length === 1 ? cols[0] : `linear-gradient(135deg, ${cols.join(', ')})`;
}
// Panel background: the color identity tint, with card art on top when there is some (split for partners).
function backdrop(pl) {
  const t = el('div', 'tint');
  t.style.background = tint(pl.letters);
  if (store.prefs.art !== false && pl.art) {
    t.classList.add('art');
    pl.art.forEach(u => { const a = el('div'); a.style.backgroundImage = `url("${u}")`; t.appendChild(a); });
  }
  return t;
}
function counter(label, value, dec, inc, extra) {
  const c = el('div', 'ctr');
  const minus = el('button', null, '−');
  const plus = el('button', null, '+');
  if (extra) c.appendChild(extra);
  if (label) c.appendChild(el('span', null, label));
  c.appendChild(minus);
  c.appendChild(el('b', null, value));
  c.appendChild(plus);
  holdRepeat(minus, dec);
  holdRepeat(plus, inc);
  return c;
}

// Per-panel view state that isn't part of the game, so it's never saved. sheet is the open overlay
// ('tax' | 'mana' | 'counters' | null); tools is whether the on-demand toolbar is showing, and timer hides it again.
const ui = LAYOUTS[6].seats.map(() => ({ sheet: null, info: false, tools: false, timer: null }));
function setTools(p, on) {
  clearTimeout(ui[p].timer);
  ui[p].tools = on;
  ui[p].timer = on ? setTimeout(() => { setTools(p, false); renderTable(); }, 4000) : null;
}

// Lucide icons (ISC license), inlined so they work offline and take the text color. Lucide has no experience symbol,
// so experience is drawn here in the same stroke style: a pair of upswept wings.
const ICONS = {
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  swords: '<path d="m13 19 6-6"/><path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/><path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m5 14 4 4"/><path d="m5 21-2-2"/><path d="M7.5 16.5 4 20"/>',
  droplets: '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  biohazard: '<circle cx="12" cy="11.9" r="2"/><path d="M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6"/><path d="m8.9 10.1 1.4.8"/><path d="M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5"/><path d="m15.1 10.1-1.4.8"/><path d="M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2"/><path d="M12 13.9v1.6"/><path d="M13.5 5.4c-1-.2-2-.2-3 0"/><path d="M17 16.4c.7-.7 1.2-1.6 1.5-2.5"/><path d="M5.5 13.9c.3.9.8 1.8 1.5 2.5"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  'undo-2': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'cloud-lightning': '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
  zap: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  radiation: '<path d="M12 12h.01"/><path d="M14 15.4641a4 4 0 0 1-4 0L7.52786 19.74597 A 1 1 0 0 0 7.99303 21.16211 10 10 0 0 0 16.00697 21.16211 1 1 0 0 0 16.47214 19.74597z"/><path d="M16 12a4 4 0 0 0-2-3.464l2.472-4.282a1 1 0 0 1 1.46-.305 10 10 0 0 1 4.006 6.94A1 1 0 0 1 21 12z"/><path d="M8 12a4 4 0 0 1 2-3.464L7.528 4.254a1 1 0 0 0-1.46-.305 10 10 0 0 0-4.006 6.94A1 1 0 0 0 3 12z"/>',
  experience: '<path d="M12 19C11 12 7.5 5.5 3 4l1 6 2-1.5 1 5 2-1.5z"/><path d="M12 19c1-7 4.5-13.5 9-15l-1 6-2-1.5-1 5-2-1.5z"/>',
};
const iconSvg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
function withIcon(tag, cls, name, label) {
  const e = el(tag, cls);
  e.innerHTML = iconSvg(name);
  if (label != null) e.appendChild(el('span', 'l', label));
  return e;
}
const TOOLS = [['tax', 'Tax', 'crown'], ['damage', 'Damage', 'swords'], ['mana', 'Mana', 'droplets'], ['counters', 'Counters', 'layers']];

function renderTable() {
  const g = G();
  if (!g) return;
  const layout = LAYOUTS[g.layout];
  const onDemand = THEMES[store.prefs.theme].toolsOnDemand;
  const board = $('board');
  board.style.gridTemplateColumns = layout.cols;
  board.style.gridTemplateRows = layout.rows;
  board.style.gridTemplateAreas = layout.areas;
  board.dataset.layout = g.layout;
  board.innerHTML = '';
  g.players.forEach((pl, p) => {
    // In damage mode every panel turns to face the target, who enters the damage from their seat.
    const rot = cellOf(g, g.dmgTarget != null ? g.dmgTarget : p)[1];
    const panel = el('div', `panel r${rot}` + (g.active === p && !pl.out ? ' active' : ''));
    panel.classList.toggle('tools', !onDemand || ui[p].tools);
    panel.style.gridArea = cellOf(g, p)[0];
    const face = el('div', 'face');
    face.appendChild(backdrop(pl));
    if (g.dmgTarget != null) face.appendChild(damageView(p));
    else buildFace(face, p);
    panel.appendChild(face);
    board.appendChild(panel);
  });
  $('table').classList.toggle('dmgMode', g.dmgTarget != null);
  const hub = $('hub');
  hub.classList.toggle('edge', g.n === 1);
  // The hub lines up along the seam through the middle of the board: top to bottom between two columns, except in
  // two per side, where the middle is a four-way junction and a row across it reads better.
  hub.style.setProperty('--seam', layout.cols === '1fr' || g.layout === '4sides' ? 'row' : 'column');
  if (g.dmgTarget != null) {
    // The middle of the edge where the target's panel meets the table (its face's top edge), so a look can put the
    // hub on that seam, turned to face the target like every panel.
    const r = board.children[g.dmgTarget].getBoundingClientRect();
    const rot = cellOf(g, g.dmgTarget)[1];
    const [fx, fy] = { 0: [0.5, 0], 90: [1, 0.5], 180: [0.5, 1], 270: [0, 0.5] }[rot];
    hub.style.setProperty('--dmg-x', `${r.left + r.width * fx}px`);
    hub.style.setProperty('--dmg-y', `${r.top + r.height * fy}px`);
    hub.style.setProperty('--dmg-rot', `${rot}deg`);
  }
  $('moveSeat').classList.toggle('hidden', g.n < 2);
  const over = alive().length <= 1 && g.n > 1;
  $('pass').classList.toggle('over', over);
  $('turnLabel').replaceChildren(...(over ? ['Finish'] : [el('span', 'l', 'Turn '), String(g.round)]));
  $('activeLabel').textContent = over ? 'game over' : shortName(g.players[g.active].name);
}

function buildFace(face, p) {
  const pl = G().players[p];
  const head = el('div', 'head');
  const name = el('div', 'name');
  if (p === 0) name.appendChild(el('span', 'you', 'You · '));
  name.append(shortName(pl.name));
  head.appendChild(name);
  const full = halves(pl.name).length > 1 ? halves(pl.name).join(' & ') : pl.name;
  if (G().named[p]) head.appendChild(el('div', 'sub', (p === 0 ? 'You · ' : '') + full));
  const badges = el('div', 'badges');
  const chip = (name, label, value, cls) => {
    const c = withIcon('span', cls, name, label);
    c.append(String(value));
    // The chips a look leaves to its tiles open the status card where they do show (Minimal).
    if (cls && cls.includes('tiled')) { c.onclick = () => { ui[p].info = true; renderTable(); }; c.setAttribute('role', 'button'); }
    badges.appendChild(c);
  };
  // "tiled" chips repeat what the Damage and Counters tiles list, so a look whose tiles always show can drop them.
  const cmdMax = Math.max(...pl.cmd.flat());
  if (cmdMax) chip('swords', 'Cmd', cmdMax, cmdMax >= 15 ? 'tiled warn' : 'tiled');
  if (pl.counters.poison) chip('biohazard', 'Poison', pl.counters.poison, pl.counters.poison >= 7 ? 'tiled warn' : 'tiled');
  const tax = pl.tax[0] + pl.tax[1];
  if (tax) chip('crown', 'Tax', pl.partner ? pl.tax.join('/') : tax);
  const manaTotal = MANA.reduce((s, c) => s + pl.mana[c], 0);
  if (manaTotal) chip('droplets', 'Mana', manaTotal);
  if (G().storm) chip('cloud-lightning', 'Storm', G().storm);
  const strip = el('div', 'strip');
  const minus = el('button', 'zone minus', '−');
  const plus = el('button', 'zone plus', '+');
  minus.setAttribute('aria-label', 'Lose 1 life');
  plus.setAttribute('aria-label', 'Gain 1 life');
  holdRepeat(minus, () => changeLife(p, -1));
  holdRepeat(plus, () => changeLife(p, 1));
  // The numeral tints amber when life is low and red when it is nearly gone, as the tiles do for damage and poison.
  const num = el('div', 'num' + (String(pl.life).length > 2 ? ' w3' : '') + (pl.life <= 5 ? ' lethal' : pl.life <= 10 ? ' warn' : ''), pl.life);
  const d = deltas[p];
  if (d) {
    const delta = el('span', 'delta' + (d.sum < 0 ? ' neg' : ''), (d.sum > 0 ? '+' : '') + d.sum);
    // A re-render picks the fade up where it was instead of restarting it.
    delta.style.animationDelay = `${d.at - Date.now()}ms`;
    num.appendChild(delta);
  }
  strip.append(minus, num, plus);
  const actions = el('div', 'actions');
  TOOLS.forEach(([k, label, name]) => {
    const b = withIcon('button', `a-${k}`, name, label);
    const vals = tileValues(p, k);
    if (vals) b.insertBefore(vals, b.lastChild);
    b.onclick = () => {
      setTools(p, false);
      if (k === 'damage') { G().dmgTarget = p; commit(); return; }
      ui[p].sheet = k;
      renderTable();
    };
    actions.appendChild(b);
  });
  const more = withIcon('button', 'more', ui[p].tools ? 'x' : 'ellipsis');
  more.setAttribute('aria-label', ui[p].tools ? 'Hide tools' : 'Tools');
  head.onclick = more.onclick = () => { setTools(p, !ui[p].tools); renderTable(); };
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.onclick(); } };
  const lay = el('div', 'lay');
  lay.append(head, badges, strip, actions, more);
  face.appendChild(lay);
  if (ui[p].info) face.appendChild(infoCard(p));
  if (ui[p].sheet) face.appendChild(sheet(p, ui[p].sheet));
  if (pl.out) {
    const out = el('div', 'out');
    out.appendChild(el('div', null, 'Out'));
    out.appendChild(el('small', null, `turn ${pl.out.turn} · ${CAUSE_LABEL[pl.out.cause]}`));
    face.appendChild(out);
  }
}

// What a tool's tile lists, like the official Companion app's tiles: Damage gets one entry per player whose commanders hit
// this one (their initial, or seat number when unnamed, and the total; amber once one commander has dealt 15, red at a
// lethal 21), and Counters one per nonzero counter (icon and count; poison amber at 7, red at 10). null when there's
// nothing to list, so the tile stays as it was.
function tileValues(p, kind) {
  const g = G();
  const pl = g.players[p];
  const vals = el('span', 'vals');
  if (kind === 'damage') {
    pl.cmd.forEach(([a, b], s) => {
      if (!a && !b) return;
      const who = el('i', null, g.named[s] ? shortName(g.players[s].name)[0].toUpperCase() : String(s + 1));
      who.style.background = tint(g.players[s].letters);
      const v = el('span', a >= 21 || b >= 21 ? 'v lethal' : a >= 15 || b >= 15 ? 'v warn' : 'v');
      v.append(who, String(a + b));
      vals.appendChild(v);
    });
  } else if (kind === 'counters') {
    COUNTERS.forEach(([k, , icon]) => {
      if (!pl.counters[k]) return;
      const n = pl.counters[k];
      const v = el('span', k === 'poison' && n >= 10 ? 'v lethal' : k === 'poison' && n >= 7 ? 'v warn' : 'v');
      v.innerHTML = iconSvg(icon);
      v.append(String(pl.counters[k]));
      vals.appendChild(v);
    });
  }
  return vals.childElementCount ? vals : null;
}

function sheet(p, kind) {
  const pl = G().players[p];
  const s = el('div', 'sheet');
  const btns = el('div', 'sheetBtns');
  if (kind === 'tax') {
    s.appendChild(el('h3', null, 'Commander tax'));
    const split = pl.partner || pl.tax[1] > 0;
    const grid = el('div', 'grid tax' + (split ? ' two' : ''));
    const names = split ? commanderNames(pl) : [shortName(pl.name)];
    names.forEach((nm, h) => grid.appendChild(counter(nm, pl.tax[h], () => changeTax(p, h, -2), () => changeTax(p, h, 2))));
    s.appendChild(grid);
    const t = el('button', null, pl.partner ? 'Partner: on' : 'Partner: off');
    t.onclick = () => { pl.partner = !pl.partner; commit(); };
    btns.appendChild(t);
  } else if (kind === 'mana') {
    // Storm counts spells cast this turn by everyone, so it is one number for the game; games saved before it existed
    // have none. Like the mana pool it stays out of the undo history.
    const storm = el('button', 'storm');
    storm.append(el('span', 'l', 'Storm'), el('b', null, G().storm || 0));
    storm.onclick = () => { G().storm = (G().storm || 0) + 1; commit(); };
    s.appendChild(storm);
    const grid = el('div', 'grid six');
    MANA.forEach(c => {
      const pip = el('i', 'pip');
      pip.style.background = `var(--${c})`;
      const ctr = counter('', pl.mana[c], () => changeMana(p, c, -1), () => changeMana(p, c, 1), pip);
      ctr.classList.add('vert');
      grid.appendChild(ctr);
    });
    s.appendChild(grid);
    const clear = el('button', null, 'Empty pool');
    clear.onclick = () => { MANA.forEach(c => { pl.mana[c] = 0; }); commit(); };
    btns.appendChild(clear);
  } else {
    s.appendChild(el('h3', null, 'Counters'));
    const grid = el('div', 'grid two');
    COUNTERS.forEach(([k, label, icon]) => {
      // Rad counters are the ones people forget the rules for, so Rad's name opens the reminder.
      const name = withIcon(k === 'rad' ? 'button' : 'span', 'ctrName', icon, label);
      if (k === 'rad') { name.setAttribute('aria-label', 'What rad counters do'); name.onclick = () => showRad(p); }
      grid.appendChild(counter('', pl.counters[k], () => changeCounter(p, k, -1), () => changeCounter(p, k, 1), name));
    });
    s.appendChild(grid);
    const concede = el('button', 'danger', pl.out ? 'Out' : 'Concede');
    concede.disabled = !!pl.out;
    concede.onclick = () => { snapshot(); eliminate(p, 'concede'); ui[p].sheet = null; commit(); };
    btns.appendChild(concede);
  }
  const done = el('button', null, 'Done');
  done.onclick = () => { ui[p].sheet = null; renderTable(); };
  btns.appendChild(done);
  s.appendChild(btns);
  return s;
}

// The Radiation token, turned to face whoever opened it like their panel. Its rules text always shows; the image needs
// Scryfall once, and its URL is kept so the service worker's art cache can show it offline after that.
async function showRad(p) {
  $('radInfo').className = `radInfo r${cellOf(G(), p)[1]}`;
  if (!store.radArt) {
    const card = await scryfall('tpip/22').catch(() => null);
    if (card && card.image_uris) { store.radArt = card.image_uris.normal; persist(); }
  }
  if (store.radArt && !$('radInfo').classList.contains('hidden')) {
    $('radImg').src = store.radArt;
    $('radImg').classList.remove('hidden');
  }
}
$('radImg').onerror = () => $('radImg').classList.add('hidden');
$('radInfo').onclick = e => {
  if (e.target.id === 'radClose' || !e.target.closest('.radCard')) $('radInfo').classList.add('hidden');
};

// Commander damage: every panel shows the damage its commander(s) dealt to the target player.
function damageView(p) {
  const g = G();
  const t = g.dmgTarget;
  const src = g.players[p];
  const target = g.players[t];
  const v = el('div', 'dmg' + (p === t ? ' target' : ''));
  if (p === t) {
    const back = withIcon('button', 'dmgBack', 'chevron-left');
    back.setAttribute('aria-label', 'Back');
    back.onclick = () => { g.dmgTarget = null; commit(); };
    v.appendChild(back);
    v.appendChild(withIcon('div', 'dmgLife', 'heart', target.life));
  }
  v.appendChild(withIcon('h4', null, 'swords', shortName(src.name)));
  if (p === t) v.appendChild(el('div', 'sub', 'Commander damage target'));
  // Damage already dealt by the second commander stays visible even if Partner is switched off.
  const split = src.partner || target.cmd[p][1] > 0;
  const row = el('div', 'dmgRow' + (split ? ' split' : ''));
  const names = split ? commanderNames(src) : [''];
  names.forEach((nm, h) => row.appendChild(counter(nm, target.cmd[p][h],
    () => changeCmd(t, p, h, -1), () => changeCmd(t, p, h, 1))));
  v.appendChild(row);
  return v;
}

$('pass').onclick = () => {
  if (alive().length <= 1 && G().n > 1) { openFinish(); return; }
  snapshot();
  advanceTurn();
  commit();
};
$('undo').onclick = () => {
  if (!undo()) { toast('Nothing to undo'); return; }
  commit();
};
$('undo').insertAdjacentHTML('afterbegin', iconSvg('undo-2'));
$('menuBtn').onclick = () => $('menu').classList.remove('hidden');
$('menuBtn').insertAdjacentHTML('beforeend', iconSvg('menu'));
$('dmgDone').onclick = () => { G().dmgTarget = null; commit(); };
$('closeMenu').onclick = () => $('menu').classList.add('hidden');
$('finishNow').onclick = () => { $('menu').classList.add('hidden'); openFinish(); };
$('toHome').onclick = () => { $('menu').classList.add('hidden'); renderHome(); show('home'); };
$('resetLife').onclick = async () => {
  $('menu').classList.add('hidden');
  if (!await ask('Restart with the same players? This game won\'t be saved.', 'Restart')) { $('menu').classList.remove('hidden'); return; }
  const g = G();
  g.players = g.players.map(pl => Object.assign(newPlayer(pl.name, pl.letters, g.life0, g.n), { partner: pl.partner, art: pl.art }));
  Object.assign(g, { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), active: g.first, round: 1,
    started: Date.now(), events: [], storm: 0, dmgTarget: null });
  store.undo = [];
  $('menu').classList.add('hidden');
  commit();
};
// Steps your panel one cell clockwise, for a seat noticed after the game started. Not an undo step, like the look.
$('moveSeat').onclick = () => {
  const g = G();
  g.seat = ((g.seat || 0) + 1) % g.n;
  store.prefs.seat = Object.assign({}, store.prefs.seat, { [g.layout]: g.seat });
  $('menu').classList.add('hidden');
  commit();
};
$('abandon').onclick = async () => {
  $('menu').classList.add('hidden');
  if (!await ask('Abandon this game? It won\'t be saved.', 'Abandon')) { $('menu').classList.remove('hidden'); return; }
  store.game = null;
  store.undo = [];
  persist();
  $('menu').classList.add('hidden');
  renderHome();
  show('home');
};

// ---------- finish ----------

const logsToSheet = g => g.n === 4 && g.named.every(Boolean);

function openFinish() {
  const g = G();
  const left = alive();
  const outs = g.players.filter(pl => pl.out);
  const lastOut = g.events.filter(e => e.out).pop();
  const opts = g.players.map((pl, p) => ({ value: String(p), label: (p === 0 ? 'You · ' : '') + pl.name }));
  if (g.n > 1) opts.push({ value: 'unknown', label: 'Not sure which opponent' });
  seg('winner', opts, left.length === 1 ? String(left[0]) : '');
  seg('victory', VICTORIES, lastOut && left.length === 1 ? (CAUSE_VICTORY[lastOut.out] || '') : '');
  $('turns').value = g.round;
  $('elim').value = outs.length ? Math.min(...outs.map(pl => pl.out.turn)) : '';
  $('notes').value = '';
  const last = store.lists.last || {};
  fillList('podList', store.lists.pods);
  $('date').value = today();
  $('pod').value = last.pod || '';
  seg('power', [{ value: 'Low Power', label: 'Low' }, { value: 'Mid Power', label: 'Mid' },
    { value: 'High Power', label: 'High' }], last.power, summarizeDetails);
  seg('bracket', ['1', '2', '3', '4', '5'], last.bracket, summarizeDetails);
  $('pod').oninput = summarizeDetails;
  summarizeDetails();
  const logs = logsToSheet(g);
  $('detailsWrap').classList.toggle('hidden', !logs);
  $('finishNote').textContent = logs ? '' : 'This game won\'t be sent to your sheet (only 4-player games with every commander named).';
  $('saveGame').textContent = logs ? 'Save game' : 'End game';
  msg('finishMsg', '');
  show('finish');
}
function summarizeDetails() {
  const parts = [$('pod').value, (picked.power || '').replace(' Power', ''), picked.bracket && `B${picked.bracket}`].filter(Boolean);
  $('detailsSummary').textContent = parts.length ? `· ${parts.join(' · ')}` : '· tap to fill in';
}
$('backToTable').onclick = () => show('table');

$('saveGame').onclick = () => {
  const g = G();
  if (!picked.winner) { msg('finishMsg', 'Pick who won.', true); return; }
  if (logsToSheet(g)) {
    if (!$('pod').value.trim() || !picked.power) {
      $('detailsWrap').open = true;
      msg('finishMsg', 'Fill in the pod and power under Game details.', true);
      return;
    }
    const w = picked.winner;
    const mySeat = turnPos(0) + 1;
    store.queue.push({
      id: g.id,
      setup: { date: $('date').value, pod: $('pod').value.trim(), power: picked.power, bracket: picked.bracket,
        deck: g.players[0].name, opps: g.players.slice(1).map(pl => pl.name), seat: String(mySeat) },
      colors: g.colors,
      winner: w === 'unknown' ? 'Unknown opponent' : w === '0' ? 'Me' : `Opponent ${w}`,
      victory: picked.victory, turns: $('turns').value, elim: $('elim').value, sol: '', solWin: '',
      notes: $('notes').value.trim(), started: g.started, ended: Date.now(),
      eliminations: g.players.filter(pl => pl.out).map(pl => ({ name: pl.name, turn: pl.out.turn, cause: CAUSE_LABEL[pl.out.cause] })),
      events: g.events,
    });
    toast('Game saved');
  } else {
    toast('Game ended');
  }
  store.game = null;
  store.undo = [];
  persist();
  renderHome();
  show('home');
  syncQueue();
};

// ---------- keep the screen on during a game ----------

let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); }
  catch (e) { wakeLock = null; }
  if (wakeLock) wakeLock.addEventListener('release', () => { wakeLock = null; });
}
function releaseAwake() { if (wakeLock) wakeLock.release().catch(() => {}); wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('table').classList.contains('hidden')) keepAwake();
});

// ---------- start ----------

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
applyTheme();
renderHome();
if (store.game) { show('table'); loadArt(); } else { show('home'); }
if (store.settings.url && navigator.onLine) {
  syncQueue();
  if (Date.now() - store.listsAt > 6 * 3600 * 1000) refreshLists().catch(() => {});
}

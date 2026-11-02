#!/usr/bin/env node
// Verification CLI for EDH Life. Run from anywhere: node <this file> <command>.
//   doctor                 read-only health check of the checkout, the browser and this harness
//   journey <name...>|all  drive mapped features and leave evidence under ../evidence/
//   list                   name the journeys
//   serve start|stop|status [--port 8767]  a persistent server for looking at the app by hand
//   cleanup                stop the persistent server and any browser this harness launched and left behind
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_DIR, RUN_DIR, EVIDENCE_DIR, CHROME_CHANNELS, appVersion, gitHead, session } from './lib.mjs';
import { serve } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JOURNEYS = path.join(HERE, 'journeys');
const SERVER_FILE = path.join(RUN_DIR, 'server.json');
const [cmd, ...args] = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };

const CHROME_PATHS = {
  chrome: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app', '/usr/bin/google-chrome'],
  msedge: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
};

async function fetchText(url) {
  try { const r = await fetch(url); return r.ok ? r.text() : null; } catch { return null; }
}
async function readJson(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

async function doctor() {
  let ok = true;
  const check = (good, label, detail = '') => { ok &&= good; console.log(`${good ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`); };
  for (const f of ['index.html', 'app.js', 'style.css', 'sw.js']) check(existsSync(path.join(APP_DIR, f)), `app file ${f}`);
  console.log(`     app version ${appVersion()} at commit ${gitHead()}`);
  const pw = existsSync(path.join(HERE, 'node_modules', 'playwright-core'));
  check(pw, 'playwright-core installed', pw ? '' : 'run: npm install  (in the harness folder)');
  const browsers = CHROME_CHANNELS.filter(c => CHROME_PATHS[c].some(existsSync));
  check(browsers.length > 0, 'a Chrome-family browser is installed', browsers.join(', ') || 'install Chrome or Edge');
  const srv = await readJson(SERVER_FILE);
  if (srv) {
    const live = alive(srv.pid);
    const body = await fetchText(`http://127.0.0.1:${srv.port}/sw.js`);
    const ours = !!body && body.includes(`VERSION = '${appVersion()}'`);
    check(live && ours, `persistent server pid ${srv.pid} on port ${srv.port} serves this checkout`, live ? (ours ? '' : 'answers, but not with this checkout\'s sw.js') : 'pid is gone; run: serve stop');
  } else console.log('     no persistent server running (journeys start their own on a free port)');
  const browsersDir = path.join(RUN_DIR, 'browsers');
  const strays = existsSync(browsersDir) ? (await fs.readdir(browsersDir)).filter(f => alive(Number(f.replace('.json', '')))) : [];
  check(strays.length === 0, 'no browser left behind by an earlier run', strays.length ? `${strays.length} alive; run: cleanup` : '');
  console.log(ok ? 'doctor: healthy' : 'doctor: NOT healthy');
  process.exit(ok ? 0 : 1);
}

async function listJourneys() {
  return (await fs.readdir(JOURNEYS)).filter(f => f.endsWith('.mjs')).map(f => f.replace(/\.mjs$/, '')).sort();
}

async function runJourneys(names) {
  const all = await listJourneys();
  if (!names.length || names[0] === 'all') names = all;
  const unknown = names.filter(n => !all.includes(n));
  if (unknown.length) { console.error(`unknown journey: ${unknown.join(', ')}  (have: ${all.join(', ')})`); process.exit(2); }
  const results = [];
  for (const n of names) {
    const mod = await import(pathToFileURL(path.join(JOURNEYS, `${n}.mjs`)).href);
    results.push(await session(n, mod.default, { headedPause: Number(process.env.EDH_VERIFY_HEADED_PAUSE || 0) }));
  }
  const failed = results.filter(r => r.result !== 'passed');
  console.log(`\n${results.length - failed.length}/${results.length} journeys passed`);
  process.exit(failed.length ? 1 : 0);
}

async function serveCmd(sub) {
  const port = Number(flag('port', 8767));
  await fs.mkdir(RUN_DIR, { recursive: true });
  if (sub === 'fg') {
    const s = await serve(APP_DIR, port);
    console.log(`serving ${APP_DIR} at ${s.url}`);
    await new Promise(() => {});
  } else if (sub === 'start') {
    const existing = await readJson(SERVER_FILE);
    if (existing && alive(existing.pid)) { console.log(`already running: pid ${existing.pid} at http://127.0.0.1:${existing.port}/`); return; }
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', 'fg', '--port', String(port)], { detached: true, stdio: 'ignore' });
    child.unref();
    await fs.writeFile(SERVER_FILE, JSON.stringify({ pid: child.pid, port, started: Date.now(), root: APP_DIR }));
    for (let i = 0; i < 50; i++) {
      if (await fetchText(`http://127.0.0.1:${port}/index.html`)) { console.log(`ready: pid ${child.pid} at http://127.0.0.1:${port}/`); return; }
      await new Promise(r => setTimeout(r, 100));
    }
    console.error('server did not answer within 5 s'); process.exit(1);
  } else if (sub === 'stop') {
    const srv = await readJson(SERVER_FILE);
    if (!srv) { console.log('no persistent server recorded'); return; }
    if (alive(srv.pid)) { process.kill(srv.pid); console.log(`stopped pid ${srv.pid}`); } else console.log(`pid ${srv.pid} was already gone`);
    await fs.rm(SERVER_FILE, { force: true });
  } else {
    const srv = await readJson(SERVER_FILE);
    console.log(srv ? `${alive(srv.pid) ? 'running' : 'stale record'}: pid ${srv.pid} port ${srv.port}` : 'not running');
  }
}

async function cleanup() {
  await serveCmd('stop');
  const dir = path.join(RUN_DIR, 'browsers');
  if (existsSync(dir)) for (const f of await fs.readdir(dir)) {
    const pid = Number(f.replace('.json', ''));
    if (alive(pid)) { try { process.kill(pid); console.log(`killed browser pid ${pid}`); } catch (e) { console.log(`could not kill ${pid}: ${e.message}`); } }
    await fs.rm(path.join(dir, f), { force: true });
  }
  console.log(`cleanup done; evidence kept in ${EVIDENCE_DIR}`);
}

switch (cmd) {
  case 'doctor': await doctor(); break;
  case 'journey': await runJourneys(args.filter(a => !a.startsWith('--'))); break;
  case 'list': console.log((await listJourneys()).join('\n')); break;
  case 'serve': await serveCmd(args[0] || 'status'); break;
  case 'cleanup': await cleanup(); break;
  default: console.log('usage: node edh.mjs doctor | journey <name...>|all | list | serve start|stop|status [--port N] | cleanup'); process.exit(cmd ? 2 : 0);
}

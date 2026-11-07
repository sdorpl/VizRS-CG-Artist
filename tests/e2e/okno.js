// Test w działaniu okna VizRS CG Artist (GTK 4 + WebKitGTK 6.0) z prawdziwym serwerem `vizrs`:
//   node tests/e2e/okno.js [ścieżka-do-vizrs] [ścieżka-do-vizrs-cg-artist]
// Sprawdza: most okna (pytanie przy zamykaniu, plik od okna), jedną instancję, uruchamianie `vizrs serve --idle-exit`
// i dołączanie do działającego serwera, koniec serwera bez okien i wyjść, okno „Połącz z serwerem” z tokenem
// i zapisem połączenia, odrzucenie przełączenia adresu przez stronę serwera.
// Otwiera na kilka sekund widoczne okna (w CI: xvfb-run). Katalogi użytkownika (konfiguracja, stan, wpis .desktop,
// gniazdo instancji) są w katalogu tymczasowym – test nie rusza danych użytkownika.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const BIN = path.resolve(process.argv[2] || process.env.VIZRS_BIN || path.join(ROOT, '../VizRS CG System/source/target/release/vizrs'));
const APP = path.resolve(process.argv[3] || path.join(ROOT, 'target/release/vizrs-cg-artist'));
const PORT = 19900 + Math.floor(Math.random() * 300);
let failures = 0;
const ok = (cond, msg, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && info !== undefined ? ' → ' + JSON.stringify(info) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vizrs-cg-artist-e2e-'));
const data = path.join(tmp, 'data');

// Własne katalogi XDG. Gniazdo Waylanda leży w XDG_RUNTIME_DIR, więc jego nazwę zamieniamy na ścieżkę bezwzględną.
const ENV = { ...process.env, VIZRS_CONFIG: path.join(tmp, 'cfg'), XDG_STATE_HOME: path.join(tmp, 'state'), XDG_DATA_HOME: path.join(tmp, 'share'), XDG_RUNTIME_DIR: path.join(tmp, 'run') };
for (const k of ['VIZRS_DATA', 'VIZRS_PORT', 'VIZRS_TOKEN', 'VIZRS_CONNECT', 'VIZRS_BIN']) delete ENV[k];
fs.mkdirSync(ENV.XDG_RUNTIME_DIR, { mode: 0o700 });
if (process.env.WAYLAND_DISPLAY && !path.isAbsolute(process.env.WAYLAND_DISPLAY) && process.env.XDG_RUNTIME_DIR) {
  ENV.WAYLAND_DISPLAY = path.join(process.env.XDG_RUNTIME_DIR, process.env.WAYLAND_DISPLAY);
}

const write = (name, js) => { const p = path.join(tmp, name); fs.writeFileSync(p, js); return p; };
// sonda: czeka na połączenie z serwerem, zwraca tytuł, wskaźnik i liczbę scen
const PROBE = write('probe.js', `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
  await sleep(500);
  const r = { title: document.title, conn: document.querySelector('#conn')?.textContent, scenes: document.querySelectorAll('#sceneSel option').length };
  window.ipc.postMessage('probe:' + JSON.stringify(r));
})();`);
const health = (port = PORT) => new Promise((res) => {
  http.get(`http://127.0.0.1:${port}/health`, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch { res(null); } }); }).on('error', () => res(null));
});
const run = (args, script, name, env = ENV) => {
  const out = path.join(tmp, name + '.json');
  const r = spawnSync(APP, [...args, '--probe', script, '--probe-out', out], { encoding: 'utf8', timeout: 60000, env });
  return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { error: r.status, signal: r.signal, stderr: (r.stderr || '').slice(-2000) };
};
const local = ['--data', data, '--port', String(PORT), '--vizrs', BIN];

(async () => {
  let obs;
  try {
    for (const f of [BIN, APP]) if (!fs.existsSync(f)) throw new Error('brak programu: ' + f);

    // 0. most okna: pytanie przy zamykaniu, plik od okna trafia do zasobów, nieznany komunikat nic nie robi
    const nat = run(local, write('native.js', `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 50 && !document.querySelector('#sceneSel option'); i++) await sleep(100);
      await sleep(400);
      const r = { cmd: typeof window.__vizrsCmd, file: typeof window.__vizrsFile };
      window.ipc.postMessage('app:' + JSON.stringify({ action: 'nieznany', x: 1 }));
      window.ipc.postMessage('app:' + 'x'.repeat(100000));
      window.__vizrsCmd('fit');
      window.__vizrsCmd('close'); await sleep(50);
      r.modal = !!document.querySelector('#nativeClose');
      document.querySelector('[data-nc="stay"]')?.click();
      const before = (await (await fetch('/api/assets')).json()).length;
      window.__vizrsFile.begin('kropka.png');
      window.__vizrsFile.chunk(btoa('nie-obraz-ale-plik'));
      window.__vizrsFile.end();
      await sleep(800);
      r.uploaded = (await (await fetch('/api/assets')).json()).length - before;
      r.dirty = document.querySelector('#bSave')?.classList.contains('dirty');
      window.ipc.postMessage('probe:' + JSON.stringify(r));
    })();`), 'native');
    ok(nat.cmd === 'function' && nat.file === 'object', 'strona widzi most okna (__vizrsCmd, __vizrsFile)', nat);
    ok(nat.modal === true, 'pytanie o niezapisane zmiany przy zamykaniu', nat);
    ok(nat.uploaded === 1 && nat.dirty === true, 'plik od okna trafia do zasobów i dodaje element', nat);
    const log = fs.readdirSync(path.join(ENV.XDG_STATE_HOME, 'vizrs')).filter((f) => f.endsWith('.log'));
    ok(log.length > 0, 'log serwera w katalogu stanu', fs.readdirSync(ENV.XDG_STATE_HOME));

    // 0b. jedna instancja: drugie uruchomienie przekazuje prośbę i kończy pracę
    const first = spawn(APP, local, { env: ENV, stdio: 'ignore' });
    await sleep(3000);
    const second = spawnSync(APP, local, { env: ENV, timeout: 5000 });
    ok(second.status === 0 && first.exitCode === null, 'drugie uruchomienie kończy się od razu, pierwsze działa', { second: second.status, first: first.exitCode });
    first.kill();
    for (let i = 0; i < 60 && await health(); i++) await sleep(500);
    ok(!(await health()), 'serwer po zamknięciu okna kończy pracę (--idle-exit)');

    // 1. okno uruchamia serwer i łączy się z nim
    const a = run(local, PROBE, 'artist');
    ok(a.title === 'VizRS Artist' && a.conn === 'połączono' && a.scenes > 0, 'Artist w oknie: strona, połączenie, sceny', a);
    const h1 = await health();
    ok(!!h1, 'serwer uruchomiony przez okno działa po jego zamknięciu (czeka na --idle-exit)');
    ok(fs.existsSync(path.join(data, '.vizrs.lock')), 'serwer trzyma blokadę katalogu danych');

    // 2. drugie okno dołącza do tego samego serwera. Podłączone „wyjście” trzyma serwer dłużej niż start WebKitGTK.
    obs = await new Promise((res) => {
      const req = http.get(`http://127.0.0.1:${PORT}/events`, () => res(req));
      req.on('error', () => res(req));
    });
    const b = run(['--data', data, '--port', String(PORT + 5), '--vizrs', BIN], PROBE, 'artist2');
    ok(b.conn === 'połączono' && b.scenes > 0, 'okno dołącza do działającego serwera na tym katalogu danych (inny --port bez znaczenia)', b);
    const h2 = await health();
    ok(h2 && h1 && h2.instance === h1.instance, 'to ten sam serwer (instance)', [h1?.instance, h2?.instance]);
    ok(!(await health(PORT + 5)), 'drugi serwer nie powstał');

    // 3. z podłączonym wyjściem serwer działa; bez okien i wyjść kończy pracę sam
    await sleep(14000);
    ok(!!(await health()), 'z podłączonym wyjściem serwer działa dalej');
    obs.destroy();
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) { await sleep(1000); gone = !(await health()); }
    ok(gone, 'bez okien i wyjść serwer kończy pracę sam');
    ok(!fs.existsSync(path.join(data, '.vizrs.lock')), 'blokada zwolniona');

    // 4a. `connect` bez programu vizrs: okno wyboru otwiera się, serwer lokalny nie powstaje przed wyborem
    const NOVIZRS = path.join(tmp, 'brak', 'vizrs');
    const pre = run(['connect', '--data', path.join(tmp, 'local'), '--port', String(PORT + 2), '--vizrs', NOVIZRS], write('pre.js', `(async () => {
  await new Promise((r) => setTimeout(r, 300));
  window.ipc.postMessage('probe:' + JSON.stringify({ title: document.title, now: document.getElementById('now')?.textContent, url: document.getElementById('url')?.value }));
})();`), 'pre');
    ok(pre.title === 'Połącz z serwerem' && pre.now === 'Teraz: nie połączono' && pre.url === '', 'connect bez programu vizrs: okno wyboru, „nie połączono”', pre);

    // 4. okno „Połącz z serwerem”: zły token → komunikat, dobry → Artist na serwerze „zdalnym”, zapis na liście
    const RPORT = PORT + 1, TOKEN = 'zdalny-token-1234567';
    const remote = spawn(BIN, ['--port', String(RPORT), '--tcp', '0', '--data', path.join(tmp, 'remote'), '--token', TOKEN], { stdio: 'ignore' });
    try {
      for (let i = 0; i < 50 && !(await health(RPORT)); i++) await sleep(100);
      const CPROBE = write('connect.js', `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  if (document.title === 'Połącz z serwerem') {
    $('url').value = 'http://127.0.0.1:${RPORT}'; $('token').value = 'zly-token-12345678'; $('go').click();
    for (let i = 0; i < 50 && !$('err').textContent; i++) await sleep(100);
    $('token').value = '${TOKEN}'; $('keep').checked = true; $('go').click();
    return;
  }
  // strona serwera nie może przełączyć okna na inny adres
  window.ipc.postMessage(JSON.stringify({ action: 'connect', url: 'http://127.0.0.1:1' }));
  window.ipc.postMessage('connect:' + JSON.stringify({ url: 'http://127.0.0.1:1' }));
  for (let i = 0; i < 100 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
  await sleep(500);
  window.ipc.postMessage('probe:' + JSON.stringify({ href: location.href, title: document.title, conn: document.querySelector('#conn')?.textContent, scenes: document.querySelectorAll('#sceneSel option').length }));
})();`);
      const c = run(['connect', '--data', path.join(tmp, 'local'), '--port', String(PORT + 2), '--vizrs', NOVIZRS], CPROBE, 'connect');
      ok(c.conn === 'połączono' && c.scenes > 0 && c.href?.startsWith(`http://127.0.0.1:${RPORT}/artist`), 'okno połączenia przełącza Artist na serwer zdalny z tokenem; strona serwera nie zmienia adresu', c);
      const file = path.join(ENV.VIZRS_CONFIG, 'connections.json');
      const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
      ok(saved.servers?.[0]?.url === `http://127.0.0.1:${RPORT}` && saved.servers?.[0]?.token === TOKEN, 'serwer i token na liście zapisanych', saved);
      if (fs.existsSync(file)) ok((fs.statSync(file).mode & 0o077) === 0, 'lista zapisanych tylko dla właściciela');
      ok(!(await health(PORT + 2)), 'połączenie zdalne nie uruchamia serwera lokalnego (i nie potrzebuje programu vizrs)');
    } finally {
      remote.kill();
    }
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    obs?.destroy();
    if (process.env.KEEP_TMP) console.log('katalog testu: ' + tmp);
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} NIEUDANYCH` : '\nWszystkie testy okna zaliczone');
  process.exit(failures ? 1 : 0);
})();

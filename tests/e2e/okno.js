// Test w działaniu okna VizRS CG Artist (Tauri 2):
//   node tests/e2e/okno.js [ścieżka-do-vizrs] [ścieżka-do-vizrs-cg-artist]
// Sprawdza: pracę lokalną bez serwera (strona z binarki, zapis sceny do show.json, zasoby, brak stron Trio),
// most okna (pytanie przy zamykaniu, plik od okna), jedną instancję, wzajemną blokadę katalogu z `vizrs`,
// dołączanie do `vizrs` na tym samym katalogu, okno „Połącz z serwerem” (token, zapis, praca lokalna) i to,
// że strona nie przełącza okna na inny adres. `vizrs` jest potrzebny tylko w krokach z serwerem.
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
for (const k of ['VIZRS_ARTIST_DATA', 'VIZRS_DATA', 'VIZRS_TOKEN', 'VIZRS_CONNECT']) delete ENV[k];
fs.mkdirSync(ENV.XDG_RUNTIME_DIR, { mode: 0o700 });
if (process.env.WAYLAND_DISPLAY && !path.isAbsolute(process.env.WAYLAND_DISPLAY) && process.env.XDG_RUNTIME_DIR) {
  ENV.WAYLAND_DISPLAY = path.join(process.env.XDG_RUNTIME_DIR, process.env.WAYLAND_DISPLAY);
}

const write = (name, js) => { const p = path.join(tmp, name); fs.writeFileSync(p, js); return p; };
// sonda: czeka na połączenie, zwraca tytuł, wskaźnik, adres i liczbę scen
const PROBE = write('probe.js', `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
  await sleep(500);
  const r = { title: document.title, conn: document.querySelector('#conn')?.textContent, href: location.href, scenes: document.querySelectorAll('#sceneSel option').length };
  r.mode = (await (await fetch('/api/state')).json()).mode;
  (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify(r));
})();`);
const health = (port = PORT) => new Promise((res) => {
  http.get(`http://127.0.0.1:${port}/health`, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch { res(null); } }); }).on('error', () => res(null));
});
const run = (args, script, name, env = ENV) => {
  const out = path.join(tmp, name + '.json');
  const r = spawnSync(APP, [...args, '--probe', script, '--probe-out', out], { encoding: 'utf8', timeout: 60000, env });
  return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { error: r.status, signal: r.signal, stderr: (r.stderr || '').slice(-2000) };
};
const showOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'show.json'), 'utf8')); } catch { return null; } };

(async () => {
  try {
    if (!fs.existsSync(APP)) throw new Error('brak programu: ' + APP);
    const haveVizrs = fs.existsSync(BIN);

    // 1. praca lokalna bez serwera: strona z binarki, zapis sceny, plik od okna → zasoby, pytanie przy zamykaniu
    const loc = run(['--data', data], write('local.js', `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
      await sleep(400);
      const r = { title: document.title, conn: document.querySelector('#conn')?.textContent, href: location.href,
        cmd: typeof window.__vizrsCmd, nav: !!document.querySelector('.topbar nav'), mkPage: !!document.querySelector('#mkPage') };
      r.state = await (await fetch('/api/state')).json();
      r.pages = (await fetch('/api/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"scene":"x"}' })).status;
      window.__vizrsCmd('save'); await sleep(800);
      r.saved = (await (await fetch('/api/show')).json()).scenes.length;
      window.__vizrsFile.begin('kropka.png'); window.__vizrsFile.chunk(btoa('nie-obraz-ale-plik')); window.__vizrsFile.end();
      await sleep(800);
      r.assets = (await (await fetch('/api/assets')).json()).map((a) => a.name);
      r.dirty = document.querySelector('#bSave')?.classList.contains('dirty');
      // pytanie idzie do systemowego okna dialogowego; pod --probe okno odpowiada od razu „Anuluj”
      window.__vizrsCmd('close'); await sleep(400);
      r.modal = /niezapisane zmiany/.test(window.__vizrsShell?.lastDialog || '');
      r.stayed = !document.hidden;
      (window.__vizrsPost || window.ipc.postMessage)('app:' + JSON.stringify({ t: 'nieznany' }));
      (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify(r));
    })();`), 'local');
    ok(loc.title === 'VizRS Artist' && loc.conn === 'połączono' && /^http:\/\/127\.0\.0\.1:\d+\/artist/.test(loc.href || ''), 'praca lokalna: strona z binarki, połączona z magazynem okna', loc);
    ok(loc.state?.mode === 'local' && loc.pages === 400 && !loc.mkPage && !loc.nav, 'bez Trio: tryb lokalny, strony Trio odrzucone, brak zakładek i „Utwórz stronę”', loc);
    ok(loc.saved === 1 && showOf(data)?.scenes?.length === 1, 'zapis sceny trafia do show.json w katalogu danych', { saved: loc.saved, show: showOf(data) });
    ok(loc.assets?.includes('kropka.png') && fs.existsSync(path.join(data, 'assets', 'kropka.png')) && loc.dirty, 'plik od okna trafia do assets/ i dodaje element', loc);
    ok(loc.modal === true, 'pytanie o niezapisane zmiany przy zamykaniu (systemowe okno dialogowe)', loc);
    ok(!fs.existsSync(path.join(data, '.vizrs.lock')), 'blokada katalogu zwolniona po zamknięciu okna');
    const port = loc.href ? Number(new URL(loc.href).port) : 0;
    ok(port > 0 && !(await health(port)), 'magazyn lokalny kończy się razem z oknem');

    // 2. jedna instancja: drugie uruchomienie przekazuje prośbę i kończy pracę; vizrs nie wystartuje na tym katalogu
    const first = spawn(APP, ['--data', data], { env: ENV, stdio: 'ignore' });
    for (let i = 0; i < 50 && !fs.existsSync(path.join(data, '.vizrs.lock')); i++) await sleep(100);
    await sleep(1500);
    const second = spawnSync(APP, ['--data', data], { env: ENV, timeout: 5000 });
    ok(second.status === 0 && first.exitCode === null, 'drugie uruchomienie kończy się od razu, pierwsze działa', { second: second.status, first: first.exitCode });
    let lock = {};
    try { lock = JSON.parse(fs.readFileSync(path.join(data, '.vizrs.lock'), 'utf8')); } catch { /* brak */ }
    ok(lock.app === 'vizrs-cg-artist' && /^127\.0\.0\.1:\d+$/.test(lock.addr || ''), 'blokada katalogu w formacie serwera', lock);
    if (haveVizrs) {
      const v = spawnSync(BIN, ['--port', String(PORT + 7), '--tcp', '0', '--data', data], { encoding: 'utf8', timeout: 10000 });
      ok(v.status !== 0 && v.status !== null, 'vizrs nie startuje na katalogu otwartym w Artist', { status: v.status, err: (v.stderr || '').slice(-300) });
    }
    first.kill();
    await sleep(500);

    if (haveVizrs) {
      // 3. vizrs pracuje na katalogu danych → okno dołącza do niego (jeden zapisujący)
      const vdata = path.join(tmp, 'vdata');
      const srv = spawn(BIN, ['--port', String(PORT), '--tcp', '0', '--data', vdata], { stdio: 'ignore' });
      try {
        for (let i = 0; i < 50 && !(await health()); i++) await sleep(100);
        const j = run(['--data', vdata], PROBE, 'join');
        ok(j.conn === 'połączono' && j.scenes > 0 && j.mode !== 'local' && !j.href?.startsWith(`http://127.0.0.1:${PORT}/`), 'okno dołącza do vizrs pracującego na tym katalogu danych (przez pośrednika okna)', j);
      } finally {
        srv.kill();
      }

      // 4. okno „Połącz z serwerem”: zły token → komunikat, dobry → Artist na serwerze zdalnym, zapis na liście
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
  (window.__vizrsPost || window.ipc.postMessage)(JSON.stringify({ action: 'connect', url: 'http://127.0.0.1:1' }));
  (window.__vizrsPost || window.ipc.postMessage)('connect:' + JSON.stringify({ url: 'http://127.0.0.1:1' }));
  for (let i = 0; i < 100 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
  await sleep(500);
  const mode = (await (await fetch('/api/state')).json()).mode;
  (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify({ href: location.href, mode, conn: document.querySelector('#conn')?.textContent, scenes: document.querySelectorAll('#sceneSel option').length }));
})();`);
        const c = run(['connect', '--data', path.join(tmp, 'local')], CPROBE, 'connect');
        ok(c.conn === 'połączono' && c.scenes > 0 && c.mode !== 'local' && !c.href?.includes(TOKEN), 'okno połączenia przełącza Artist na serwer zdalny z tokenem (token nie trafia do strony); strona nie zmienia adresu', c);
        const file = path.join(ENV.VIZRS_CONFIG, 'connections.json');
        const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
        ok(saved.servers?.[0]?.url === `http://127.0.0.1:${RPORT}` && saved.servers?.[0]?.token === TOKEN, 'serwer i token na liście zapisanych', saved);
        if (fs.existsSync(file)) ok((fs.statSync(file).mode & 0o077) === 0, 'lista zapisanych tylko dla właściciela');
        ok(!fs.existsSync(path.join(tmp, 'local', 'show.json')), 'połączenie zdalne nie zakłada magazynu lokalnego');

        // 6. wysyłka z pracy lokalnej na serwer (zapisany z tokenem w kroku 4): nowa → bez zmian → konflikt → nadpisz
        const SRV = `http://127.0.0.1:${RPORT}`, ddata = path.join(tmp, 'deploy');
        const dep = (name, js) => run(['--data', ddata], write(name + '.js', `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
  const j = async (m, u, b) => { const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
  const check = async () => (await j('POST', '/api/deploy/check', { server: '${SRV}', scenes: ['dep1'] })).scenes?.[0]?.status;
  const r = {};
  ${js}
  (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify(r));
})();`), name);
        const d1 = dep('deploy1', `
  r.servers = await (await fetch('/api/deploy/servers')).json();
  r.btn = !document.querySelector('#bDeploy').hidden;
  await fetch('/api/assets?name=logo-wysylka.png', { method: 'POST', body: 'PNG' });
  await j('PUT', '/api/scenes/dep1', { name: 'Wysyłka', layer: 'main', nodes: [] });
  r.before = await check();
  r.send = await j('POST', '/api/deploy', { server: '${SRV}', scenes: [{ id: 'dep1', assets: ['logo-wysylka.png'] }] });
  r.after = await check();
  r.foreign = (await j('POST', '/api/deploy/check', { server: 'http://127.0.0.1:1', scenes: [] })).status;`);
        ok(Array.isArray(d1.servers) && d1.servers.some((x) => x.url === SRV && x.hasToken && !('token' in x)) && d1.btn, 'wysyłka: lista zapisanych serwerów bez tokenów, przycisk „Wyślij” w pracy lokalnej', d1);
        ok(d1.before === 'new' && d1.send?.results?.[0]?.ok && d1.send.results[0].uploaded?.[0] === 'logo-wysylka.png' && d1.after === 'same', 'wysyłka: nowa scena z zasobem trafia na serwer; potem „bez zmian”', d1);
        ok(d1.foreign === 400, 'wysyłka tylko na serwery z listy zapisanych', d1.foreign);
        const remoteShow = await new Promise((res) => http.get(`${SRV}/api/show`, { headers: { Authorization: `Bearer ${TOKEN}` } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b))); }));
        const rs = remoteShow.scenes.find((x) => x.id === 'dep1');
        ok(rs?.name === 'Wysyłka', 'scena jest w show serwera', rs);
        // ktoś zmienia scenę na serwerze
        await new Promise((res) => {
          const body = JSON.stringify({ ...rs, name: 'Zmiana w studiu' });
          const req = http.request(`${SRV}/api/scenes/dep1`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => { r.resume(); r.on('end', res); });
          req.end(body);
        });
        const d2 = dep('deploy2', `
  r.status = await check();
  r.plain = (await j('POST', '/api/deploy', { server: '${SRV}', scenes: [{ id: 'dep1' }] })).results?.[0];
  r.over = (await j('POST', '/api/deploy', { server: '${SRV}', scenes: [{ id: 'dep1', overwrite: true }] })).results?.[0];
  r.after = await check();
  window.__vizrsCmd('deploy');
  for (let i = 0; i < 50 && !document.querySelector('#deployDlg [data-row="dep1"]'); i++) await sleep(100);
  const box = document.querySelector('#deployDlg [data-row="dep1"] input');
  box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 50 && !document.querySelector('#deployDlg [data-row="dep1"] .dpSt')?.textContent; i++) await sleep(100);
  r.dialog = document.querySelector('#deployDlg [data-row="dep1"] .dpSt')?.textContent;`);
        ok(d2.status === 'changed' && d2.plain?.conflict === true && d2.over?.ok && d2.after === 'same', 'wysyłka: zmiana na serwerze = konflikt; „nadpisz” zastępuje', d2);
        ok(/bez zmian na serwerze/.test(d2.dialog || ''), 'okno „Wyślij na serwer” (menu) pokazuje stan sceny', d2.dialog);
      } finally {
        remote.kill();
      }
    } else {
      console.log(`POMINIĘTO kroki z serwerem – brak ${BIN}`);
    }

    // 5. `connect` → „Praca lokalna (bez serwera)”
    const lp = run(['connect', '--data', path.join(tmp, 'local2')], write('connlocal.js', `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.title === 'Połącz z serwerem') {
    const b = document.getElementById('local');
    if (b.hidden || !b.offsetParent) return (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify({ hidden: true, now: document.getElementById('now').textContent }));
    b.click(); return;
  }
  for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
  (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify({ href: location.href, conn: document.querySelector('#conn')?.textContent, mode: (await (await fetch('/api/state')).json()).mode }));
})();`), 'connlocal');
    ok(lp.conn === 'połączono' && lp.mode === 'local', 'connect → „Praca lokalna” otwiera Artist na magazynie okna', lp);
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    if (process.env.KEEP_TMP) console.log('katalog testu: ' + tmp);
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} NIEUDANYCH` : '\nWszystkie testy okna zaliczone');
  process.exit(failures ? 1 : 0);
})();

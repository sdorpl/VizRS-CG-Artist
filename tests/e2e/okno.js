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

    // 1b. sceny odniesienia i położenie względem innej sceny: belka (w niewidocznym kontenerze 1920×1080) dosunięta 8 px
    //     nad ticker, zapis do show.json; klik w puste miejsce kontenera nie chwyta grupy; ostrzeżenie o nachodzeniu
    const rdata = path.join(tmp, 'refs');
    fs.mkdirSync(rdata, { recursive: true });
    const rect = (id, x, y, w, h) => ({ id, type: 'rect', name: id, props: { x, y, w, h, color: '#336699' } });
    fs.writeFileSync(path.join(rdata, 'show.json'), JSON.stringify({ rev: 1, scenes: [
      { id: 'belka', name: 'Belka', layer: 'main', width: 1920, height: 1080, duration: 2, stops: [1], nodes: [{ id: 'kont', type: 'group', name: 'kont', props: { x: 0, y: 0, w: 1920, h: 1080 }, children: [rect('bar', 160, 820, 1600, 110)] }] },
      { id: 'ticker', name: 'Ticker', layer: 'back', width: 1920, height: 1080, duration: 2, stops: [1], nodes: [rect('pas', 160, 960, 1600, 60)] },
    ] }));
    const refs = run(['--data', rdata], write('refs.js', `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
      await sleep(400);
      const r = {};
      document.querySelector('#vRefs').click(); await sleep(150);
      const c = document.querySelector('#pRefs [data-rfid="ticker"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
      r.under = document.querySelectorAll('#refsU .vz-scene[data-ref="ticker"] .vz-node').length;
      const gap = document.querySelector('[data-rel="gap"]'); gap.value = 8; gap.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-relop="above"][data-relfor="scene"]').click(); await sleep(200);
      r.y = document.querySelector('[data-sp="y"]').value;
      const st = document.querySelector('#stage').getBoundingClientRect(), k = st.width / 1920;
      const at = (x, y) => ({ clientX: st.left + x * k, clientY: st.top + y * k, button: 0, bubbles: true, detail: 1 });
      document.querySelector('#box').dispatchEvent(new MouseEvent('mousedown', at(960, 300))); dispatchEvent(new MouseEvent('mouseup', at(960, 300))); await sleep(150);
      r.emptyHit = document.querySelector('#propsTitle').textContent;
      document.querySelector('#box').dispatchEvent(new MouseEvent('mousedown', at(960, 870))); dispatchEvent(new MouseEvent('mouseup', at(960, 870))); await sleep(150);
      r.barHit = document.querySelector('#pname')?.value;
      document.querySelector('#tree .item[data-id=""]').click(); await sleep(150);
      const sy = document.querySelector('[data-sp="y"]'); sy.value = 60; sy.dispatchEvent(new Event('input', { bubbles: true })); await sleep(200);
      r.warn = !document.querySelector('#overWarn').hidden;
      sy.value = 22; sy.dispatchEvent(new Event('input', { bubbles: true })); await sleep(200);
      r.warnOff = document.querySelector('#overWarn').hidden;
      window.__vizrsCmd('save'); await sleep(800);
      r.saved = (await (await fetch('/api/show')).json()).scenes.find((s) => s.id === 'belka')?.y;
      (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify(r));
    })();`), 'refs');
    ok(refs.under === 1, 'scena odniesienia (ticker, warstwa back) narysowana pod bieżącą sceną', refs);
    ok(refs.emptyHit === 'Scena' && refs.barHit === 'bar', 'klik w puste miejsce kontenera nie chwyta grupy, klik w prostokąt chwyta prostokąt', refs);
    ok(refs.warn === true && refs.warnOff === true, 'ostrzeżenie o nachodzeniu na ticker pojawia się i znika', refs);
    ok(refs.y === '22' && refs.saved === 22 && showOf(rdata)?.scenes?.find((s) => s.id === 'belka')?.y === 22, 'dosunięcie belki 8 px nad ticker ustawia położenie sceny i trafia do show.json', refs);

    // 1c. powiązanie (dock) z kanwy i z podglądu: „＋ Z odniesienia” (cel = ticker), przeciągnięcie belki o 100 px w górę
    //     w trybie „Ustaw z kanwy” zmienia dy reguły, nie położenie sceny; podgląd przesuwa scenę o wynik reguł; Esc kończy
    const ddata = path.join(tmp, 'dock');
    fs.mkdirSync(ddata, { recursive: true });
    fs.writeFileSync(path.join(ddata, 'show.json'), JSON.stringify({ rev: 1, scenes: [
      { id: 'belka', name: 'Belka', layer: 'main', width: 1920, height: 1080, duration: 2, stops: [1], nodes: [rect('bar', 160, 820, 1600, 110)] },
      { id: 'ticker', name: 'Ticker', layer: 'back', width: 1920, height: 1080, duration: 2, stops: [1], nodes: [rect('pas', 160, 960, 1600, 60)] },
    ] }));
    const dock = run(['--data', ddata], write('dock.js', `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
      await sleep(400);
      const r = {}, key = (k, o = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
      const tf = () => document.querySelector('#stage > .vz-scene').style.transform;
      document.querySelector('#vRefs').click(); await sleep(150);
      const c = document.querySelector('#pRefs [data-rfid="ticker"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
      document.querySelector('#vRefs').click();
      document.querySelector('#tree .item[data-id=""]').click(); await sleep(150);
      document.querySelector('#dkRef').click(); await sleep(200);
      r.target = document.querySelector('[data-dk="0::target"]')?.value;
      r.bar = !document.querySelector('#dockBar').hidden;
      const st = document.querySelector('#stage').getBoundingClientRect(), k = st.width / 1920;
      const at = (x, y, o = {}) => ({ clientX: st.left + x * k, clientY: st.top + y * k, button: 0, bubbles: true, detail: 1, ...o });
      document.querySelector('#box').dispatchEvent(new MouseEvent('mousedown', at(960, 870)));
      dispatchEvent(new MouseEvent('mousemove', at(960, 820, { ctrlKey: true })));
      dispatchEvent(new MouseEvent('mousemove', at(960, 770, { ctrlKey: true })));
      dispatchEvent(new MouseEvent('mouseup', at(960, 770))); await sleep(100);
      r.during = tf();
      key('Enter'); await sleep(200);
      r.dy = document.querySelector('[data-dk="0::dy"]')?.value;
      r.sceneY = document.querySelector('[data-sp="y"]').value;
      r.after = tf();
      document.querySelector('[data-dkpv="0"]').click(); await sleep(100);
      r.preview = tf(); r.refs = document.querySelectorAll('#refsU .vz-scene[data-ref="ticker"]').length;
      key('Escape'); await sleep(100);
      r.previewOff = tf(); r.barOff = document.querySelector('#dockBar').hidden;
      document.querySelector('[data-dkset="0"]').click(); await sleep(100);
      key('ArrowUp', { shiftKey: true }); await sleep(50);
      r.arrow = tf();
      key('Escape'); await sleep(150);
      r.dyCancel = document.querySelector('[data-dk="0::dy"]')?.value;
      window.__vizrsCmd('save'); await sleep(800);
      const b = (await (await fetch('/api/show')).json()).scenes.find((s) => s.id === 'belka');
      r.saved = b?.dock; r.savedY = b?.y ?? 0;
      (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify(r));
    })();`), 'dock');
    ok(dock.target === 'scene:Ticker' && dock.bar === true, '„＋ Z odniesienia” tworzy regułę z celem scene:Ticker i włącza „Ustaw z kanwy”', dock);
    // przeciągnięcie myszą o 100 px kadru – ± 1 px z zaokrąglenia skali kanwy
    const ddy = Number(dock.dy), tr = (v) => `translate(0px, ${v}px)`;
    ok(Math.abs(ddy + 100) <= 1 && dock.during === tr(ddy) && dock.sceneY === '0' && dock.after === '', 'przeciągnięcie w „Ustaw z kanwy” zmienia dy reguły (−100), nie położenie sceny', dock);
    ok(dock.preview === tr(ddy) && dock.refs === 1 && dock.previewOff === '' && dock.barOff === true, 'podgląd pokazuje cel i przesuwa scenę o wynik reguł, Esc kończy', dock);
    ok(dock.arrow === tr(ddy - 10) && dock.dyCancel === dock.dy, 'strzałki w „Ustaw z kanwy” zmieniają przesunięcie, Esc anuluje', dock);
    ok(dock.saved?.[0]?.target === 'scene:Ticker' && dock.saved?.[0]?.dy === ddy && dock.savedY === 0
      && showOf(ddata)?.scenes?.find((s) => s.id === 'belka')?.dock?.[0]?.dy === ddy, 'reguła powiązania trafia do show.json', dock);

    // 1d. zaznaczanie ramką i edycja wielu zaznaczonych (K1): ramka przez 3 z 4 prostokątów, kolor wszystkim jednym krokiem
    //     cofania, „—” przy różnych szerokościach, S + przeciągnięcie przesuwa scenę, klik w puste miejsce odznacza
    const mdata = path.join(tmp, 'marq');
    fs.mkdirSync(mdata, { recursive: true });
    fs.writeFileSync(path.join(mdata, 'show.json'), JSON.stringify({ rev: 1, scenes: [
      { id: 'kafle', name: 'Kafle', layer: 'main', width: 1920, height: 1080, duration: 2, stops: [1], nodes: [
        rect('k1', 100, 100, 200, 100), rect('k2', 400, 100, 250, 100), rect('k3', 700, 100, 200, 100), rect('k4', 100, 700, 200, 100)] },
    ] }));
    const marq = run(['--data', mdata], write('marq.js', `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
      await sleep(400);
      const r = {}, box = document.querySelector('#box');
      const st = document.querySelector('#stage').getBoundingClientRect(), k = st.width / 1920;
      const at = (x, y, o = {}) => ({ clientX: st.left + x * k, clientY: st.top + y * k, button: 0, bubbles: true, detail: 1, ...o });
      const drag = async (a, b, o = {}) => { box.dispatchEvent(new MouseEvent('mousedown', at(...a, o))); dispatchEvent(new MouseEvent('mousemove', at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, o))); dispatchEvent(new MouseEvent('mousemove', at(...b, o))); await sleep(50); r.marqShown = r.marqShown || !document.querySelector('#marq').hidden; dispatchEvent(new MouseEvent('mouseup', at(...b, o))); await sleep(150); };
      await drag([50, 50], [800, 300]);
      r.title = document.querySelector('#propsTitle').textContent;
      r.marqHidden = document.querySelector('#marq').hidden;
      const w = document.querySelector('#props [data-p="w"]'); r.wVal = w?.value; r.wPh = w?.placeholder;
      const c = document.querySelector('#props input[data-p="color"]'); c.focus(); c.value = '#ff0000'; c.dispatchEvent(new Event('input', { bubbles: true })); c.blur(); await sleep(150);
      window.__vizrsCmd('save'); await sleep(800);
      const col = async () => (await (await fetch('/api/show')).json()).scenes[0].nodes.map((n) => n.props.color);
      r.colors = await col();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); await sleep(150);
      window.__vizrsCmd('save'); await sleep(800);
      r.undone = await col();
      await drag([50, 650], [400, 850], { shiftKey: true });
      r.added = document.querySelector('#propsTitle').textContent;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      await drag([1500, 900], [1500, 860]);
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 's', bubbles: true }));
      r.sceneY = document.querySelector('[data-sp="y"]')?.value;
      box.dispatchEvent(new MouseEvent('mousedown', at(1500, 500))); dispatchEvent(new MouseEvent('mouseup', at(1500, 500))); await sleep(150);
      r.cleared = document.querySelector('#propsTitle').textContent;
      (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify(r));
    })();`), 'marq');
    ok(marq.title === 'Właściwości – 3 elementy' && marq.marqShown === true && marq.marqHidden === true, 'ramka zaznacza 3 z 4 prostokątów (ramka widoczna w trakcie, znika po puszczeniu)', marq);
    ok(marq.wVal === '' && marq.wPh === '—', 'różne szerokości zaznaczonych – pole puste z „—”', marq);
    ok(JSON.stringify(marq.colors) === JSON.stringify(['#ff0000', '#ff0000', '#ff0000', '#336699'])
      && JSON.stringify(marq.undone) === JSON.stringify(['#336699', '#336699', '#336699', '#336699']), 'kolor z panelu trafia do trzech zaznaczonych, jedno Ctrl+Z cofa wszystkie', marq);
    ok(marq.added === 'Właściwości – 4 elementy', 'Shift + ramka dodaje do zaznaczenia', marq);
    // przesunięcie o 40 px (± przyciąganie do kadru i prowadnic)
    ok(Number(marq.sceneY) <= -30 && Number(marq.sceneY) >= -50 && marq.cleared === 'Scena', 'S + przeciągnięcie przesuwa scenę, klik w puste miejsce odznacza', marq);

    // 1e. uchwyty (K2): róg nw (róg se stoi), bok e elementu obróconego o 90° (bok w stoi), Shift – proporcje, obrót co 15°
    const hdata = path.join(tmp, 'handles');
    fs.mkdirSync(hdata, { recursive: true });
    const rr = (id, x, y, w, h, extra = {}) => ({ id, type: 'rect', name: id, props: { x, y, w, h, color: '#336699', ...extra } });
    fs.writeFileSync(path.join(hdata, 'show.json'), JSON.stringify({ rev: 1, scenes: [
      { id: 'uch', name: 'Uchwyty', layer: 'main', width: 1920, height: 1080, duration: 2, stops: [1], nodes: [
        rr('a', 400, 300, 200, 100), rr('b', 1200, 300, 200, 100, { rotation: 90 }), rr('c', 400, 700, 200, 100), rr('d', 1200, 700, 200, 100, { anchorX: 'center', anchorY: 'middle' })] },
    ] }));
    const hand = run(['--data', hdata], write('handles.js', `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 50 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
      await sleep(400);
      const r = {}, box = document.querySelector('#box');
      const st = document.querySelector('#stage').getBoundingClientRect(), k = st.width / 1920;
      const at = (x, y, o = {}) => ({ clientX: st.left + x * k, clientY: st.top + y * k, button: 0, bubbles: true, detail: 1, ...o });
      const pick = async (x, y) => { box.dispatchEvent(new MouseEvent('mousedown', at(x, y))); dispatchEvent(new MouseEvent('mouseup', at(x, y))); await sleep(200); };
      // przeciągnięcie uchwytu o (dx, dy) px kadru
      const grab = async (sel, dx, dy, o = {}) => {
        const h = document.querySelector(sel), b = h.getBoundingClientRect(), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
        const ev = (X, Y) => ({ clientX: X, clientY: Y, button: 0, bubbles: true, detail: 1, ...o });
        h.dispatchEvent(new MouseEvent('mousedown', ev(x, y)));
        dispatchEvent(new MouseEvent('mousemove', ev(x + dx * k / 2, y + dy * k / 2))); dispatchEvent(new MouseEvent('mousemove', ev(x + dx * k, y + dy * k)));
        dispatchEvent(new MouseEvent('mouseup', ev(x + dx * k, y + dy * k))); await sleep(150);
      };
      await pick(500, 350);
      r.handles = [...document.querySelectorAll('#sel .h')].filter((h) => getComputedStyle(h).display !== 'none').length;
      await grab('#sel .h[data-h="nw"]', -50, -20);
      await pick(1300, 350);
      await grab('#sel .h[data-h="e"]', 0, 40);
      await pick(500, 750);
      await grab('#sel .h[data-h="se"]', 100, 10, { shiftKey: true });
      await pick(1300, 750);
      const hr = document.querySelector('#sel .hr').getBoundingClientRect();
      await grab('#sel .hr', 200, 200, { shiftKey: true });
      window.__vizrsCmd('save'); await sleep(800);
      r.nodes = (await (await fetch('/api/show')).json()).scenes[0].nodes.map((n) => ({ id: n.id, ...n.props }));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); await sleep(150);
      r.undoRot = +(document.querySelector('#props [data-p="rotation"]')?.value || 0);
      (window.__vizrsPost || window.ipc.postMessage)('probe:' + JSON.stringify(r));
    })();`), 'handles');
    const N = Object.fromEntries((hand.nodes || []).map((n) => [n.id, n]));
    const near = (a, b, e = 1.5) => Math.abs(a - b) <= e;
    ok(hand.handles === 8, 'zaznaczony prostokąt ma 8 uchwytów rozmiaru', hand);
    ok(N.a && near(N.a.w, 250) && near(N.a.h, 120) && near(N.a.x + N.a.w, 600) && near(N.a.y + N.a.h, 400), 'róg nw zmienia rozmiar, róg se stoi w miejscu', N.a);
    // b: obrót 90° wokół środka, punkt zaczepienia lewy górny; bok w (lokalnie) = środek ramki − R·(w/2, 0)
    const wMid = (n) => { const cx = n.x + n.w / 2, cy = n.y + n.h / 2; return [cx + 0 * n.w / 2, cy - n.w / 2]; };
    ok(N.b && near(N.b.w, 240) && near(N.b.h, 100) && near(wMid(N.b)[0], 1300) && near(wMid(N.b)[1], 250), 'bok e elementu obróconego o 90° – przeciągnięcie w dół wydłuża, bok w stoi', N.b);
    ok(N.c && near(N.c.w / N.c.h, 2, 0.02) && near(N.c.w, 300) && near(N.c.x, 400) && near(N.c.y, 700), 'Shift na rogu trzyma proporcje, róg nw stoi', N.c);
    ok(N.d && N.d.rotation % 15 === 0 && N.d.rotation !== 0 && hand.undoRot === 0, 'obrót uchwytem z Shift co 15°, jedno Ctrl+Z cofa', { d: N.d, undoRot: hand.undoRot });

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
        // reguły plików paczki: zajęta nazwa z inną treścią → nazwa_2 i przepisany odnośnik; ponowna wysyłka – bez kolejnej kopii
        await new Promise((res) => {
          const req = http.request(`${SRV}/api/assets?name=tlo.png`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Length': 5 } }, (r) => { r.resume(); r.on('end', res); });
          req.end('STARE');
        });
        const d3 = dep('deploy3', `
  await fetch('/api/assets?name=tlo.png', { method: 'POST', body: 'NOWE' });
  await j('PUT', '/api/scenes/dep2', { name: 'Tło', layer: 'main', nodes: [{ id: 'i', type: 'image', props: { src: 'tlo.png' } }] });
  r.first = (await j('POST', '/api/deploy', { server: '${SRV}', scenes: [{ id: 'dep2', assets: ['tlo.png'] }] })).results?.[0];
  await j('PUT', '/api/scenes/dep2', { ...(await j('GET', '/api/show')).scenes.find((x) => x.id === 'dep2'), name: 'Tło 2' });
  r.again = (await j('POST', '/api/deploy', { server: '${SRV}', scenes: [{ id: 'dep2', assets: ['tlo.png'] }] })).results?.[0];
  r.local = (await j('GET', '/api/show')).scenes.find((x) => x.id === 'dep2')?.nodes[0].props.src;`);
        const remote2 = await new Promise((res) => http.get(`${SRV}/api/show`, { headers: { Authorization: `Bearer ${TOKEN}` } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b))); }));
        const old = await new Promise((res) => http.get(`${SRV}/assets/tlo.png`, { headers: { Authorization: `Bearer ${TOKEN}` } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)); }));
        ok(d3.first?.ok && d3.first.renamed?.[0]?.[1] === 'tlo_2.png' && remote2.scenes.find((x) => x.id === 'dep2')?.nodes[0].props.src === 'tlo_2.png' && old === 'STARE' && d3.local === 'tlo.png',
          'wysyłka: zajęta nazwa → tlo_2.png na serwerze, odnośnik przepisany, stary plik i scena lokalna bez zmian', { d3, old, src: remote2.scenes.find((x) => x.id === 'dep2')?.nodes[0].props.src });
        ok(d3.again?.ok && !d3.again.uploaded.length && d3.again.skipped?.[0] === 'tlo_2.png', 'ponowna wysyłka używa tlo_2.png (bez tlo_3.png)', d3.again);
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

// Test dymny okna Artist na dowolnym systemie (Linux, Windows, macOS), bez serwera vizrs:
//   node tests/e2e/smoke.js ŚCIEŻKA-DO-PROGRAMU
// Okno startuje na pustym katalogu danych, strona łączy się z magazynem lokalnym, zapisuje scenę (show.json)
// i plik od okna (assets/), most odsyła wynik.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = path.resolve(process.argv[2] || '');
if (!fs.existsSync(APP)) { console.error('brak programu: ' + APP); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vizrs-artist-smoke-'));
const data = path.join(tmp, 'data');
const env = { ...process.env, VIZRS_CONFIG: path.join(tmp, 'cfg'), XDG_STATE_HOME: path.join(tmp, 'state'), XDG_DATA_HOME: path.join(tmp, 'share'), LOCALAPPDATA: path.join(tmp, 'local') };
const probe = path.join(tmp, 'probe.js'), out = path.join(tmp, 'out.json');
fs.writeFileSync(probe, `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (m) => (window.__vizrsPost || window.ipc.postMessage)(m);
  for (let i = 0; i < 150 && document.querySelector('#conn')?.textContent !== 'połączono'; i++) await sleep(100);
  const r = { title: document.title, conn: document.querySelector('#conn')?.textContent, ua: navigator.userAgent };
  r.mode = (await (await fetch('/api/state')).json()).mode;
  window.__vizrsCmd('save'); await sleep(1000);
  r.scenes = (await (await fetch('/api/show')).json()).scenes.length;
  window.__vizrsFile.begin('kropka.png'); window.__vizrsFile.chunk(btoa('nie-obraz-ale-plik')); window.__vizrsFile.end();
  await sleep(1000);
  r.assets = (await (await fetch('/api/assets')).json()).map((a) => a.name);
  send('probe:' + JSON.stringify(r));
})();`);
const t0 = Date.now();
const p = spawnSync(APP, ['--data', data, '--probe', probe, '--probe-out', out], { env, encoding: 'utf8', timeout: 120000 });
const r = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
let fail = 0;
const ok = (c, m, i) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' → ' + JSON.stringify(i))); if (!c) fail++; };
ok(r && r.conn === 'połączono' && r.mode === 'local', 'strona z magazynu lokalnego, połączona', r || { status: p.status, signal: p.signal, stderr: (p.stderr || '').slice(-1500) });
ok(r && r.scenes === 1 && fs.existsSync(path.join(data, 'show.json')), 'zapis sceny do show.json', r);
ok(r && r.assets?.includes('kropka.png') && fs.existsSync(path.join(data, 'assets', 'kropka.png')), 'plik od okna w assets/', r);
ok(!fs.existsSync(path.join(data, '.vizrs.lock')), 'blokada katalogu zwolniona po zamknięciu');
console.log(`czas do wyniku: ${Date.now() - t0} ms; silnik: ${r?.ua || '?'}`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

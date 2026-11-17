// E2E edytora scen w Chromium (Playwright): drzewo, panel właściwości, oś czasu, pola kontrolne, kanwa, cofanie, zapis.
//   node tests/e2e/editor.js [ścieżka-do-vizrs]
// Strona `web/artist.html` z tego repo działa na serwerze VizRS CG System (`vizrs --web web`, to samo API co magazyn okna);
// `native.css` (plik tylko tego repo) podaje test. Wynik sprawdzany przez `/api/show` po zapisie. Dane: katalog tymczasowy.
// Pilnuje zachowania edytora przy podziale `artist.html` na moduły (plan refaktoryzacji pakietu, A1).
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

function loadPlaywright() {
  for (const d of [process.env.PLAYWRIGHT_DIR].filter(Boolean)) { try { return require(require.resolve('playwright', { paths: [d] })); } catch { /* dalej */ } }
  return require('playwright');
}
const ROOT = path.join(__dirname, '../..');
const WEB = path.join(ROOT, 'web');
const BIN = path.resolve(process.argv[2] || process.env.VIZRS_BIN || path.join(ROOT, '../VizRS CG System/source/target/release/vizrs'));
let failures = 0;
const ok = (cond, msg, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && info !== undefined ? ' → ' + JSON.stringify(info) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const findNode = (nodes, id) => { for (const n of nodes || []) { if (n.id === id) return n; const c = findNode(n.children, id); if (c) return c; } return null; };

(async () => {
  if (!fs.existsSync(BIN)) { console.error('brak vizrs: ' + BIN); process.exit(2); }
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'vizrs-artist-editor-'));
  const port = await freePort();
  const srv = spawn(BIN, ['serve', '--port', String(port), '--tcp', '0', '--data', data, '--web', WEB], { stdio: 'ignore' });
  const B = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/health'); break; } catch { await sleep(100); } }
  const api = (p) => fetch(B + p).then((r) => r.json());
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const errs = [];
  try {
    if (srv.exitCode !== null) throw new Error('vizrs nie wystartował');
    const p = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (globalThis.promptAnswer ?? d.defaultValue()) : undefined));
    await p.route('**/native.css', (r) => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(WEB, 'native.css'), 'utf8') }));
    await p.goto(B + '/artist');
    await p.waitForFunction(() => document.querySelector('#conn')?.textContent === 'połączono', null, { timeout: 10000 });
    await sleep(500);

    // ---- start: lista scen, drzewo pierwszej sceny
    const sceneId = await p.inputValue('#sceneSel');
    const scene0 = (await api('/api/show')).scenes.find((s) => s.id === sceneId);
    ok(scene0 && (await p.locator('#sceneSel option').count()) >= 2, 'lista scen z serwera', sceneId);
    const items = () => p.locator('#tree .item[data-id]');
    const n0 = await items().count();
    ok(n0 >= 2 && (await p.textContent('#tree .item[data-id=""]')).includes(scene0.name), 'drzewo: scena i jej elementy', n0);
    ok((await p.textContent('#propsTitle')) === 'Scena', 'bez zaznaczenia: właściwości sceny');

    // ---- drzewo: zaznaczenie
    const firstId = await items().nth(1).getAttribute('data-id');
    await items().nth(1).click();
    ok((await p.textContent('#propsTitle')).startsWith('Właściwości'), 'klik w drzewie zaznacza element (panel właściwości)', await p.textContent('#propsTitle'));
    ok(await p.locator(`#tree .item.sel[data-id="${firstId}"]`).count() === 1, 'zaznaczony wiersz drzewa');

    // ---- dodanie elementu tekstowego
    await items().first().click(); // scena: nowy element na najwyższym poziomie
    await p.selectOption('#addSel', 'text');
    ok(await items().count() === n0 + 1, 'Dodaj… → tekst: nowy wiersz drzewa', await items().count());
    const newId = await p.getAttribute('#tree .item.sel[data-id]', 'data-id');
    ok(newId && newId !== firstId, 'nowy element zaznaczony', newId);

    // ---- panel właściwości: X, Y i tekst
    const setP = async (prop, v) => { const el = p.locator(`#props [data-p="${prop}"]`).first(); await el.fill(String(v)); await el.dispatchEvent('change'); await el.dispatchEvent('input'); };
    await setP('x', 123); await setP('y', 77);
    await setP('text', 'Ala ma kota');
    await sleep(200);
    const nodeEl = p.locator(`#stage [data-id="${newId}"]`);
    ok((await nodeEl.count()) === 1 && (await nodeEl.textContent()).includes('Ala ma kota'), 'kanwa rysuje nowy element z tekstem z panelu');

    // ---- pole kontrolne
    globalThis.promptAnswer = 'tytul';
    await p.locator('#props [data-field="text"]').first().click();
    await sleep(200);
    globalThis.promptAnswer = undefined;
    ok((await p.textContent(`#tree .item[data-id="${newId}"]`)).includes('tytul'), 'pole kontrolne „tytul” widoczne w drzewie', await p.textContent(`#tree .item[data-id="${newId}"]`));

    // ---- klucze animacji: dwa klucze właściwości X w różnym czasie (scena otwiera się w pierwszym stop poincie – czas 0 jawnie)
    await p.fill('#tc', '0'); await p.locator('#tc').dispatchEvent('change');
    await p.locator('#props [data-key="x"]').first().click();
    await p.fill('#tc', '0.5'); await p.locator('#tc').dispatchEvent('change');
    await setP('x', 300);
    await sleep(150);
    ok((await p.locator(`#tl .tl-area[data-row="${newId}|x"]`).count()) === 1, 'oś czasu: ścieżka klucza X elementu');

    // ---- długość sceny i stop point
    await p.fill('#dur', '2'); await p.locator('#dur').dispatchEvent('change');
    await p.fill('#tc', '1'); await p.locator('#tc').dispatchEvent('change');
    await p.click('#addStop');

    // ---- kolejność w drzewie, usunięcie i cofnięcie
    await p.click(`#tree .item[data-id="${newId}"]`);
    const order = async () => (await items().evaluateAll((els) => els.map((e) => e.dataset.id))).slice(1);
    const before = await order();
    await p.click('#tUp');
    const afterUp = await order();
    ok(afterUp.indexOf(newId) === before.indexOf(newId) - 1, 'W górę przesuwa element w drzewie', [before, afterUp]);
    await p.click('#tDown');
    ok(JSON.stringify(await order()) === JSON.stringify(before), 'W dół przywraca kolejność');
    await p.click('#tDel');
    ok(!(await order()).includes(newId), 'Usuń usuwa element');
    await p.click('#bUndo');
    ok((await order()).includes(newId), 'Cofnij przywraca element');
    await p.click('#bRedo');
    ok(!(await order()).includes(newId), 'Ponów usuwa go znowu');
    await p.click('#bUndo');

    // ---- kanwa: przeciągnięcie elementu
    await p.click(`#tree .item[data-id="${newId}"]`);
    await p.fill('#tc', '0'); await p.locator('#tc').dispatchEvent('change');
    const box = await nodeEl.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 });
    await p.mouse.up();
    await sleep(200);

    // ---- zapis i wynik na serwerze
    await p.click('#bSave');
    await sleep(800);
    const saved = (await api('/api/show')).scenes.find((s) => s.id === sceneId);
    const n = findNode(saved?.nodes, newId);
    ok(n && n.type === 'text' && n.props.text === 'Ala ma kota', 'zapis: nowy element tekstowy w show', n);
    ok(n?.fields?.text === 'tytul', 'zapis: pole kontrolne', n?.fields);
    ok(n?.anim?.x?.length === 2 && n.anim.x.some((k) => Math.abs(k.t - 0.5) < 1e-6 && k.v === 300), 'zapis: dwa klucze X (0,5 s → 300)', n?.anim?.x);
    ok(n && Math.abs(n.anim.x.find((k) => k.t === 0)?.v - 123) > 5 && n.props.y !== 77, 'zapis: przeciągnięcie na kanwie zmienia położenie (klucz X w 0 s i Y)', { x: n?.anim?.x, y: n?.props?.y });
    ok(saved.duration === 2 && saved.stops.includes(1), 'zapis: długość 2 s i stop point w 1 s', { d: saved.duration, s: saved.stops });
    ok(JSON.stringify(saved.nodes.map((x) => x.id)) === JSON.stringify(before), 'zapis: kolejność elementów po cofnięciu', saved.nodes.map((x) => x.id));
    ok(!(await p.locator('#bSave.dirty').count()), 'po zapisie brak niezapisanych zmian');

    // ---- inna scena i powrót
    const other = await p.locator('#sceneSel option').nth(1).getAttribute('value');
    await p.selectOption('#sceneSel', other === sceneId ? await p.locator('#sceneSel option').nth(0).getAttribute('value') : other);
    await sleep(300);
    await p.selectOption('#sceneSel', sceneId);
    await sleep(300);
    ok((await p.locator(`#tree .item[data-id="${newId}"]`).count()) === 1, 'przełączenie sceny i powrót: element zostaje');

    // ---- zakładki panelu właściwości
    await p.click(`#tree .item[data-id="${newId}"]`);
    for (const tab of ['ruch', 'dane', 'wl']) {
      await p.click(`[data-ptab="${tab}"]`);
      ok(await p.locator(`[data-ptab="${tab}"].on`).count() === 1 && (await p.locator('#props').innerText()).trim().length > 0, `zakładka panelu „${tab}”`);
    }

    // ---- grupowanie dwóch elementów i rozgrupowanie
    await p.click(`#tree .item[data-id="${newId}"]`);
    await p.click(`#tree .item[data-id="${firstId}"]`, { modifiers: ['Control'] });
    const nTop = (await order()).length;
    await p.click('#tGrp');
    const grp = await p.getAttribute('#tree .item.sel[data-id]', 'data-id');
    ok((await order()).length === nTop + 1 && grp && ![newId, firstId].includes(grp), 'Grupuj: nowa grupa z zaznaczonych', { grp, n: (await order()).length });
    await p.click('#tUngrp');
    ok(!(await order()).includes(grp) && (await order()).includes(newId), 'Rozgrupuj: elementy wracają na poziom sceny');

    // ---- właściwości sceny: wariant i powiązanie (dock)
    await items().first().click();
    globalThis.promptAnswer = undefined;
    await p.click('#addVar'); // domyślnie: styl = info, pilne
    await sleep(200);
    await p.click('#dkAdd');
    await sleep(200);
    ok(await p.locator('#props').getByText('styl', { exact: false }).count() > 0, 'wariant „styl” w panelu sceny');

    // ---- sceny: nowa, kopia, usunięcie
    await p.click('#bSave'); await sleep(600);
    const sc1 = (await api('/api/show')).scenes;
    const me = sc1.find((s) => s.id === sceneId);
    ok(me.fieldMeta?.styl && me.dock?.some((r) => r.target === 'layer:back'), 'zapis: wariant i reguła powiązania', { fm: me.fieldMeta, dock: me.dock });
    ok(!findNode(me.nodes, grp), 'zapis: bez rozgrupowanej grupy');
    globalThis.promptAnswer = 'Test e2e';
    await p.click('#bNew'); await sleep(600);
    globalThis.promptAnswer = undefined;
    const sc2 = (await api('/api/show')).scenes;
    const created = sc2.find((s) => s.name === 'Test e2e');
    ok(sc2.length === sc1.length + 1 && created && (await p.inputValue('#sceneSel')) === created.id, 'Nowa scena: zapisana i otwarta');
    ok(await items().count() === 1, 'nowa scena bez elementów');
    await p.click('#bDup'); await sleep(600);
    const sc3 = (await api('/api/show')).scenes;
    ok(sc3.some((s) => s.name === 'Test e2e kopia'), 'Kopia sceny', sc3.map((s) => s.name));
    await p.click('#bDel'); await sleep(600);
    const sc4 = (await api('/api/show')).scenes;
    ok(sc4.length === sc3.length - 1 && !sc4.some((s) => s.name === 'Test e2e kopia'), 'Usuń scenę');

    ok(errs.length === 0, 'bez błędów JS', errs);
  } catch (e) {
    console.error(e); failures++;
  } finally {
    await browser.close();
    const exited = srv.exitCode !== null ? Promise.resolve() : new Promise((r) => srv.once('exit', r));
    srv.kill();
    await Promise.race([exited, sleep(5000)]);
    fs.rmSync(data, { recursive: true, force: true, maxRetries: 5 });
    console.log(failures ? `\n${failures} FAIL` : '\nOK');
    process.exit(failures ? 1 : 0);
  }
})();

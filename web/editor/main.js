// Artist – punkt wejścia: inicjalizacja modułów w kolejności, okno natywne, wysyłka na serwer, połączenie.

import { html, setHtml } from '/dom.js';
import { init as coreInit } from './core.js';
import { init as editInit } from './edit.js';
import { init as treeInit } from './tree.js';
import { init as canvasInit } from './canvas.js';
import { init as refsInit } from './refs.js';
import { init as handlesInit } from './handles.js';
import { init as dockInit } from './dock.js';
import { init as keysInit } from './keys.js';
import { init as treedragInit } from './treedrag.js';
import { init as presetsInit } from './presets.js';
import { init as scenesInit } from './scenes.js';
import { init as keyboardInit } from './keyboard.js';
import * as PACK from '/cgpack.js';
import { connectEvents } from '/renderer.js';
import { nativeBridge, confirmBox } from '/native.js';
import { $, TRIO, api, assets, box, checkpoint, dirty, doRedo, doUndo, esc, lastArea, loadAssets, player, redo, renderSceneSel, save, scene, scenes, selKey, setScene, t, toast, undo } from './core.js';
import { renderAll, renderTree } from './props.js';
import { treeOp } from './tree.js';
import { resetView, zoom100, zoomSel } from './canvas.js';
import { buildRefs } from './refs.js';
import { addMarker, deleteSelKey } from './keys.js';
import { openFile, showReport } from './scenes.js';
import { canvasOnly, loaded, togglePanel } from './keyboard.js';

// ------------------------------------------------------------ okno natywne: stan dla powłoki, komendy menu, kopia robocza
const click = (id) => () => $(id).click();
export let native;
// ------------------------------------------------------------ wysyłka na serwer (praca lokalna)
// Okno wysyła scenę zapisaną na dysku; token serwera zna tylko okno (lista zapisanych w „Połącz z serwerem”).
const DEPLOY_STATUS = {
  new: ['nowa na serwerze', ''],
  same: ['bez zmian na serwerze od ostatniej wysyłki', ''],
  changed: ['zmieniona na serwerze od ostatniej wysyłki', 'warn'],
  foreign: ['na serwerze jest scena o tym id, niewysłana stąd', 'warn'],
  'name-taken': ['na serwerze jest inna scena o tej nazwie – powstanie druga', 'warn'],
};
const DEPLOY_OVER = new Set(['changed', 'foreign']);
 // „nadpisz” – tylko scena o tym id zmieniona na serwerze
async function deployDialog() {
  if (TRIO) return toast('Okno pracuje na serwerze – Zapisz od razu zmienia scenę na serwerze');
  if (dirty && !(await save())) return;
  const servers = await api('GET', '/api/deploy/servers').catch(() => []);
  await loadAssets();
  const known = assets.map((a) => a.name);
  let remembered = ''; try { remembered = localStorage.getItem('vizrs.deploy') || ''; } catch { /* brak localStorage */ }
  const d = document.createElement('div');
  d.id = 'deployDlg';
  d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;display:flex;align-items:center;justify-content:center';
  const box = (inner) => html`<div style="width:min(760px,94vw);max-height:86vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px">
    <b style="font-size:15px">Wyślij na serwer</b>${inner}</div>`;
  if (!servers.length) {
    setHtml(d, box(html`<div style="margin:10px 0 14px;line-height:1.5">Brak zapisanych serwerów. Dodaj serwer w <b>Plik → Połącz z serwerem</b>
      (adres, token operatora, „zapamiętaj token”), potem wróć przyciskiem <b>Praca lokalna</b> w tym samym oknie.</div>
      <button id="dpNo" class="acc">OK</button>`));
    document.body.appendChild(d);
    d.querySelector('#dpNo').onclick = () => d.remove();
    return;
  }
  setHtml(d, box(html`<div class="dim" style="margin:4px 0 10px;font-size:12px">Sceny trafiają na serwer razem z grafikami i czcionkami, których brakuje na serwerze
      (pliku o tej samej nazwie nie nadpisuje). Strony w Trio korzystające ze sceny pokażą nową wersję.</div>
    <div class="row" style="gap:6px;margin-bottom:8px"><label>Serwer</label><select id="dpSrv" class="grow">${servers.map((s) => html`<option value="${esc(s.url)}" ${s.url === remembered ? 'selected' : ''}>${esc(s.url)}${s.hasToken ? '' : ' (bez zapamiętanego tokenu)'}</option>`)}</select></div>
    <div class="row" style="gap:6px;margin-bottom:6px"><button data-dp="all">zaznacz wszystkie</button><button data-dp="none">żadna</button></div>
    <div id="dpList" style="max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px 8px">${scenes.map((s) => html`<label style="display:flex;gap:8px;align-items:center;padding:3px 0" data-row="${esc(s.id)}"><input type="checkbox" value="${esc(s.id)}" ${scene && s.id === scene.id ? 'checked' : ''}><span class="grow">${esc(s.name)}</span><span class="dim dpSt" style="font-size:11px"></span></label>`)}</div>
    <div id="dpMsg" class="dim" style="margin:8px 0;font-size:12px"></div>
    <div class="row" style="gap:6px"><button id="dpGo" class="acc" disabled>⇧ Wyślij</button><button id="dpNo">Anuluj</button></div>`));
  document.body.appendChild(d);
  const picked = () => [...d.querySelectorAll('#dpList input[type=checkbox]:not(.dpOver):checked')].map((c) => c.value);
  let checked = null, seq = 0;
  const check = async () => {
    const my = ++seq, ids = picked(), server = $('#dpSrv', d).value;
    checked = null; $('#dpGo', d).disabled = true;
    for (const st of d.querySelectorAll('.dpSt')) st.textContent = '';
    if (!ids.length) { $('#dpMsg', d).textContent = 'Zaznacz sceny do wysłania.'; return; }
    $('#dpMsg', d).textContent = 'Sprawdzam serwer…';
    try {
      const r = await api('POST', '/api/deploy/check', { server, scenes: ids });
      if (my !== seq) return;
      checked = r;
      for (const sc of r.scenes) {
        const row = d.querySelector(`[data-row="${CSS.escape(sc.id)}"]`); if (!row) continue;
        const [txt, cls] = DEPLOY_STATUS[sc.status] || [sc.status, ''];
        const air = sc.onAir?.length ? html` · <b style="color:#e55">NA ANTENIE (${sc.onAir.join(', ')})</b>` : '';
        const over = DEPLOY_OVER.has(sc.status) ? html` <label title="Zastąp wersję na serwerze"><input type="checkbox" class="dpOver" data-over="${esc(sc.id)}"> nadpisz</label>` : '';
        setHtml(row.querySelector('.dpSt'), html`<span style="${cls ? 'color:var(--warn,#e8b04b)' : ''}">${esc(txt)}</span>${air}${over}`);
      }
      const need = r.scenes.flatMap((sc) => PACK.sceneAssets(scenes.find((s) => s.id === sc.id) || {}, known)).filter((n, i, a) => a.indexOf(n) === i);
      const missing = need.filter((n) => !r.assets.includes(n));
      $('#dpMsg', d).textContent = `${r.scenes.length} scen · zasoby: ${need.length}, do wysłania ${missing.length}`;
      $('#dpGo', d).disabled = false;
    } catch (e) { if (my === seq) $('#dpMsg', d).textContent = 'Błąd: ' + e.message; }
  };
  d.addEventListener('change', (e) => { if (!e.target.classList.contains('dpOver')) check(); });
  d.addEventListener('click', async (e) => {
    const b = e.target.dataset.dp;
    if (b) { for (const c of d.querySelectorAll('#dpList input[type=checkbox]:not(.dpOver)')) c.checked = b === 'all'; return check(); }
    if (e.target.id === 'dpNo') return d.remove();
    if (e.target.id !== 'dpGo' || !checked) return;
    const blocked = checked.scenes.filter((sc) => (sc.status === 'changed' || sc.status === 'foreign') && !d.querySelector(`[data-over="${CSS.escape(sc.id)}"]`)?.checked);
    const air = checked.scenes.filter((sc) => sc.onAir?.length);
    if (air.length && !(await confirmBox(`Na antenie: ${air.map((sc) => sc.name).join(', ')}.\nGrafika na wizji zmieni się przy następnym TAKE/aktualizacji.`, { title: 'Wysłać sceny będące na antenie?', ok: 'Wyślij' }))) return;
    const send = checked.scenes.filter((sc) => !blocked.includes(sc)).map((sc) => ({
      id: sc.id, assets: PACK.sceneAssets(scenes.find((s) => s.id === sc.id) || {}, known),
      overwrite: !!d.querySelector(`[data-over="${CSS.escape(sc.id)}"]`)?.checked,
    }));
    if (!send.length) return toast('Zaznaczone sceny zmieniono na serwerze – zaznacz „nadpisz”, by je zastąpić', true);
    $('#dpGo', d).disabled = true; $('#dpMsg', d).textContent = 'Wysyłam…';
    try {
      const r = await api('POST', '/api/deploy', { server: checked.server, scenes: send });
      try { localStorage.setItem('vizrs.deploy', checked.server); } catch { /* ignoruj */ }
      const name = (id) => scenes.find((s) => s.id === id)?.name || id;
      const lines = r.results.map((x) => x.ok
        ? `„${name(x.id)}”: wysłano${x.uploaded.length ? `, zasoby: ${x.uploaded.join(', ')}` : ''}${x.skipped.length ? ` (już na serwerze: ${x.skipped.join(', ')})` : ''}${x.renamed?.length ? `; na serwerze pod inną nazwą: ${x.renamed.map(([a, b]) => `${a} → ${b}`).join(', ')}` : ''}${x.warning ? ` – uwaga: ${x.warning}` : ''}`
        : `„${name(x.id)}”: ${x.conflict ? 'zmieniona na serwerze w międzyczasie – nie wysłano (sprawdź i zaznacz „nadpisz”)' : x.error}`);
      for (const sc of blocked) lines.push(`„${sc.name}”: pominięto – zmieniona na serwerze (nie zaznaczono „nadpisz”)`);
      const ok = r.results.filter((x) => x.ok).length;
      d.remove();
      showReport(`Wysłano na ${r.server}: ${ok} z ${send.length + blocked.length} scen`, lines);
    } catch (err) { $('#dpMsg', d).textContent = 'Błąd: ' + err.message; $('#dpGo', d).disabled = false; }
  });
  check();
}
// ------------------------------------------------------------ połączenie z serwerem
// tylko wskaźnik (edycja sceny nie jest nadpisywana zdarzeniami); okno aplikacji `vizrs artist` wie dzięki temu, że Artist jest otwarty
// warstwa zmieniona w Trio: bez tego otwarta scena przywróciłaby starą przy zapisie (`rev` – tylko gdy nikt nie zmienił nic więcej)
function layerChanged(ev) {
  const held = scenes.find((s) => s.id === ev.id);
  for (const s of new Set([held, scene?.id === ev.id ? scene : null])) if (s && s.rev === ev.rev - 1) { s.layer = ev.layer; s.rev = ev.rev; }
  renderSceneSel(); renderTree(); buildRefs();
  const inp = $('[data-sp="layer"]'); if (inp && scene?.id === ev.id) inp.value = scene.layer;
}

coreInit();
editInit();
treeInit();
canvasInit();
refsInit();
handlesInit();
dockInit();
keysInit();
treedragInit();
presetsInit();
scenesInit();
keyboardInit();
native = nativeBridge({
  state: () => scene && { title: `${dirty ? '● ' : ''}${scene.name} — VizRS Artist`, dirty, undo: undo.length > 0, redo: redo.length > 0, scene: scene.id },
  save: () => save(),
  whatChanged: () => `Scena „${scene.name}” ma niezapisane zmiany.`,
  draft: () => (dirty && scene ? { id: scene.id, text: JSON.stringify(scene) } : null),
  commands: {
    new: click('#bNew'), save: () => save(), export: click('#bExp'), pack: click('#bPack'), deploy: () => deployDialog(),
    undo: doUndo, redo: doRedo, dup: () => treeOp('dup'), del: () => (lastArea === 'timeline' && selKey ? deleteSelKey() : treeOp('del')),
    fit: resetView, z100: zoom100, zsel: zoomSel, marker: () => addMarker(t),
    panelL: () => togglePanel('l'), panelR: () => togglePanel('r'), panelT: () => togglePanel('t'), canvasOnly,
    play: () => { if (player.playing) player.playing = false; else $('#pPlay').click(); },
    file: async (f) => { await loaded; openFile(f); },
    // kopia robocza po awarii: propozycja przy otwarciu sceny
    draft: async (text) => {
      await loaded;
      let d; try { d = JSON.parse(text); } catch { return; }
      if (d.id !== scene?.id || !Array.isArray(d.nodes) || text === JSON.stringify(scene)) return;
      if (await confirmBox(`Znaleziono niezapisaną kopię roboczą sceny „${d.name}” (np. po awarii).`, { title: 'Przywrócić kopię roboczą?', ok: 'Przywróć', cancel: 'Pomiń', kind: 'info' })) {
        checkpoint(); setScene({ ...d, rev: scene.rev }); player.setScene(scene); player.seek(t); renderAll();
      }
    },
  },
});
$('#bDeploy').onclick = () => deployDialog();
connectEvents((ev) => { if (ev.t === 'show' && ev.kind === 'scenes' && ev.layer) layerChanged(ev); }, (ok) => {
  $('#conn').textContent = ok ? 'połączono' : 'brak połączenia';
  $('#conn').className = 'pill ' + (ok ? 'ok' : 'on');
});

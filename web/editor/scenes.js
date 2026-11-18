// Artist – górny pasek (sceny, eksport, import), paczka .cgpack, raport.

import { html, setHtml, orEmpty } from '/dom.js';
import * as PACK from '/cgpack.js';
import { planDialog } from '/pack-ui.js';
import { confirmBox, promptBox } from '/native.js';
import { $, $$, TRIO, api, assets, confirmLeave, dirty, doRedo, doUndo, esc, loadAssets, newScene, openScene, renderSceneSel, save, scene, scenes, selNode, setDirty, setScenes, t, toast } from './core.js';
import { renderProps } from './props.js';
import { placeFile, refresh } from './edit.js';
import { addNode } from './tree.js';

/** Buduje paczkę i ją pobiera (eksport sceny i okno paczki). */
async function downloadPack(sc, pages) {
  const known = assets.map((a) => a.name);
  const { blob, missing, assets: packed, merged } = await PACK.buildPack({ scenes: sc, pages, known, fetchAsset: fetchAssetBytes, generator: 'VizRS Artist' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (sc.length === 1 ? sc[0].name || 'scena' : 'belki').replace(/[^\w.\-]+/g, '_') + '.cgpack'; a.click();
  toast(`Paczka: ${sc.length} scen, ${packed.length} plików (${(blob.size / 1024).toFixed(0)} KB)`);
  const notes = [...missing.map((n) => `nie udało się odczytać ${n}`), ...merged.map(([n, t]) => `czcionka ${n} to ten sam plik co ${t} – w paczce raz, jako ${t}`)];
  if (notes.length) showReport('Paczka utworzona – uwagi', notes);
}
async function importFile(f) {
  try {
    if (/\.cgpack$/i.test(f.name)) return await importPack(await PACK.readPack(new Uint8Array(await f.arrayBuffer())), f.name);
    const text = await f.text();
    return await importPack(PACK.legacyScenePack(text), f.name); // dawny eksport sceny (.vizrs.json) – tylko odczyt
  } catch (e) { toast('Import: ' + e.message, true); }
}
// plik z menedżera plików albo ze skojarzenia: paczka i scena – import, obraz/wideo – nowy element, czcionka – do zasobów
const IMG_RE = /\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i, FONT_FILE_RE = /\.(ttf|otf|woff2?)$/i;
export async function openFile(f) {
  if (/\.(cgpack|json)$/i.test(f.name)) return importFile(f);
  if (!IMG_RE.test(f.name) && !FONT_FILE_RE.test(f.name)) return toast(`Nieobsługiwany plik: ${f.name}`, true);
  try {
    const j = await placeFile(f);
    if (IMG_RE.test(f.name)) { addNode('image'); selNode().props.src = j.name; refresh(); renderProps(); }
  } catch (e) { toast('Upload: ' + e.message, true); }
}
// ------------------------------------------------------------ paczka belek (.cgpack)
export const fetchAssetBytes = async (name) => {
  const r = await fetch('/assets/' + encodeURIComponent(name));
  if (!r.ok) throw new Error(String(r.status));
  return new Uint8Array(await r.arrayBuffer());
};
export async function uploadBytes(name, data) {
  const r = await fetch('/api/assets?name=' + encodeURIComponent(name), { method: 'POST', body: data });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${name}: ${j.error || r.status}`);
  return j.name || name; // serwer może poprawić nazwę (znaki spoza ASCII → _)
}
// import paczki: najpierw plan (cgpack.planImport) – scena w innej wersji albo o zajętej nazwie czeka na decyzję
// (zaktualizuj / kopia „… (2)” / pomiń), potem zapis wg planu; strony tylko w pracy na serwerze (lokalnie importuje je Trio)
async function importPack(pk, fileName = '') {
  if (!(await confirmLeave())) return;
  await loadAssets();
  const withPages = TRIO;
  const show = await api('GET', '/api/show');
  const existing = assets.map((a) => a.name);
  const plan = await PACK.planImport(pk, { show, existing, fetchAsset: fetchAssetBytes, withPages });
  const ok = await planDialog(plan, { title: `Import paczki${fileName ? ` „${fileName}”` : ''}` });
  if (!ok) return;
  const r = await PACK.importPack(pk, { api, existing, fetchAsset: fetchAssetBytes, upload: uploadBytes, show, withPages, plan, fixRefs: ok.fixRefs });
  setScenes((await api('GET', '/api/show')).scenes); // zaktualizowane sceny podmienione w miejscu, nowe dopisane
  await loadAssets();
  const last = r.scenes.at(-1) || r.updated.at(-1);
  const pick = last && scenes.find((s) => s.id === last.id);
  if (pick) openScene(pick); else if (scene) openScene(scenes.find((s) => s.id === scene.id) || scenes[0]);
  showReport(PACK.importSummary(r, withPages), r.report);
}
// ------------------------------------------------------------ raport
export function showReport(title, lines) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;display:flex;align-items:center;justify-content:center';
  setHtml(d, html`<div style="width:min(720px,94vw);max-height:86vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px">
    <b style="font-size:15px">${esc(title)}</b>
    <ul id="rep" style="margin:10px 0;padding-left:18px;line-height:1.5">${orEmpty(lines.map((l) => html`<li>${esc(l)}</li>`), html`<li class="dim">Bez uwag – wszystko przeniesiono.</li>`)}</ul>
    <button id="repOk" class="acc">OK</button></div>`);
  document.body.appendChild(d);
  d.querySelector('#repOk').onclick = () => d.remove();
  d.addEventListener('mousedown', (e) => { if (e.target === d) d.remove(); });
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  // ------------------------------------------------------------ górny pasek
  $('#sceneSel').addEventListener('change', async (e) => {
    const s = scenes.find((s) => s.id === e.target.value);
    if (await confirmLeave()) openScene(s); else renderSceneSel();
  });
  $('#bSave').onclick = () => save();
  $('#bUndo').onclick = doUndo;
  $('#bRedo').onclick = doRedo;
  $('#bNew').onclick = async () => {
    if (!(await confirmLeave())) return;
    const n = await promptBox('Nazwa nowej sceny', 'Scena' + (scenes.length + 1), { title: 'Nowa scena', ok: 'Utwórz' }); if (!n) return;
    newScene(n);
  };
  $('#bDup').onclick = async () => {
    if (!(await confirmLeave())) return;
    const c = structuredClone(scene); c.name += ' kopia'; newScene(null, c);
  };
  $('#bDel').onclick = async () => {
    if (!(await confirmBox('Strony w Trio korzystające z tego szablonu też zostaną usunięte.', { title: `Usunąć scenę „${scene.name}”?`, ok: 'Usuń' }))) return;
    try {
      await api('DELETE', '/api/scenes/' + encodeURIComponent(scene.id));
      setScenes(scenes.filter((s) => s.id !== scene.id)); setDirty(false);
      if (scenes.length) openScene(scenes[0]); else newScene('Nowa scena');
    } catch (e) { toast(e.message, true); }
  };
  $('#bExp').onclick = async () => {
    // eksport bieżącej sceny (w wersji z edytora) jako paczka .cgpack – z grafikami, czcionkami i stronami tej sceny
    try {
      const show = await api('GET', '/api/show').catch(() => ({ pages: [] }));
      await loadAssets();
      await downloadPack([scene], show.pages || []);
    } catch (e) { toast('Eksport: ' + e.message, true); }
  };
  $('#bImp').onclick = () => {
    const fi = $('#fileIn'); fi.accept = '.json,.cgpack,application/json,application/zip'; fi.value = '';
    fi.onchange = () => { if (fi.files[0]) importFile(fi.files[0]); };
    fi.click();
  };
  addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => { const fs = [...(e.dataTransfer?.files || [])]; if (!fs.length) return; e.preventDefault(); (async () => { for (const f of fs) await openFile(f); })(); });
  $('#bPack').onclick = async () => {
    let show;
    try { show = await api('GET', '/api/show'); } catch (e) { return toast(e.message, true); }
    await loadAssets();
    const known = assets.map((a) => a.name);
    const list = show.scenes.map((s) => (scene && s.id === scene.id ? scene : s)); // bieżąca scena w wersji z edytora
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;display:flex;align-items:center;justify-content:center';
    setHtml(d, html`<div style="width:min(720px,94vw);max-height:86vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px">
    <b style="font-size:15px">Paczka belek (.cgpack)</b>
    <div class="dim" style="margin:4px 0 10px;font-size:12px">Sceny razem z grafikami i czcionkami, których używają (oraz dołączonymi w „Zasoby paczki”). Czcionki z paczki serwer wysyła na /output – komputer z OBS nie musi ich mieć.</div>
    <div class="row" style="gap:6px;margin-bottom:6px"><button data-pk="all">zaznacz wszystkie</button><button data-pk="none">żadna</button><span class="grow"></span>${TRIO || show.pages?.length ? html`<label><input type="checkbox" id="pkPages" checked> dołącz strony z Trio</label>` : ''}</div>
    <div id="pkList" style="max-height:38vh;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px 8px">${list.map((s) => html`<label style="display:flex;gap:8px;align-items:center;padding:2px 0"><input type="checkbox" value="${esc(s.id)}" ${scene && s.id === scene.id ? 'checked' : ''}><span class="grow">${esc(s.name)}</span><span class="dim" style="font-size:11px">${PACK.sceneAssets(s, known).length} plik(ów)</span></label>`)}</div>
    <div id="pkSum" class="dim" style="margin:8px 0;font-size:12px"></div>
    ${dirty ? html`<div style="color:var(--warn,#e8b04b);font-size:12px;margin-bottom:6px">Bieżąca scena ma niezapisane zmiany – trafią do paczki w wersji z edytora.</div>` : ''}
    <div class="row" style="gap:6px"><button id="pkGo" class="acc">⇩ Pobierz .cgpack</button><button id="pkNo">Anuluj</button></div></div>`);
    document.body.appendChild(d);
    const chosen = () => $$('#pkList input:checked', d).map((i) => list.find((s) => s.id === i.value)).filter(Boolean);
    const sum = () => {
      const sc = chosen(), files = new Set(); sc.forEach((s) => PACK.sceneAssets(s, known).forEach((n) => files.add(n)));
      const fonts = [...files].filter((n) => PACK.FONT_RE.test(n));
      $('#pkSum', d).textContent = `${sc.length} scen · ${files.size - fonts.length} grafik · ${fonts.length} czcionek${fonts.length ? ': ' + fonts.join(', ') : ''}`;
    };
    sum();
    d.addEventListener('change', sum);
    d.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pk]');
      if (b) { $$('#pkList input', d).forEach((i) => (i.checked = b.dataset.pk === 'all')); sum(); return; }
      if (e.target.id === 'pkNo' || e.target === d) { d.remove(); return; }
      if (e.target.id !== 'pkGo') return;
      const sc = chosen(); if (!sc.length) return toast('Zaznacz co najmniej jedną scenę', true);
      e.target.disabled = true;
      try {
        await downloadPack(sc, $('#pkPages', d)?.checked ? show.pages : []);
        d.remove();
      } catch (err) { toast('Paczka: ' + err.message, true); e.target.disabled = false; }
    });
  };
}

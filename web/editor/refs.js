// Artist – sceny odniesienia i położenie względem innej sceny.

import { html, setHtml } from '/dom.js';
import { ScenePlayer, layerZ, walk } from '/renderer.js';
import { $, checkpoint, esc, isLocked, locate, num, parentXf, player, scale, scene, scenes, scl, selAll, setSceneOffset, shiftNode, stage, t, toLocal, toast, topSel, undo } from './core.js';
import { renderProps, syncProps } from './props.js';
import { renderTimeline } from './timeline.js';
import { refresh, setProp } from './edit.js';
import { cv, drawGuides, setSnapShow, snapShow, togglePop } from './canvas.js';
import { dockPv, dockVals, drawnBox, drawsNode, ownNode, sceneRect, shownEl, snapAxis, snapTargets, unionRect, updateSel } from './dock.js';

// ------------------------------------------------------------ sceny odniesienia i położenie względem innej sceny
// Inne sceny show narysowane na kanwie tak, jak złożą się na wyjściu (kolejność warstw, scene.x / y, stan w pierwszym
// stop poincie). Tylko podgląd: wybór zapamiętany per scena w localStorage okna, nie trafia do show.json ani na antenę.
const RF_DEF = { on: true, per: {}, opacity: 0.5, mode: 'layers', time: 'stop', snap: true, warn: true };
export let rf = { ...RF_DEF };
const saveRf = () => { try { localStorage.setItem('vizrs.refs', JSON.stringify(rf)); } catch { /* ignoruj */ } };
export const refsU = $('#refsU'), refsO = $('#refsO');
export let refPlayers = [];
 // { id, s, p, names }
/** Wybrane sceny odniesienia bieżącej sceny (bez niej samej i bez usuniętych). */
export const refIds = () => (scene && Array.isArray(rf.per[scene.id]) ? rf.per[scene.id] : []).filter((id) => id !== scene.id && scenes.some((x) => x.id === id));
const firstStop = (s) => { const st = [...(s.stops || [])].map(Number).sort((a, b) => a - b); return st.length ? st[0] : +s.duration || 0; };
export const refTime = (s) => (rf.time === 'head' ? Math.min(t, +s.duration || 0) : firstStop(s));
export const layerName = (s) => s?.layer || 'main';
/** Odniesienia na kanwie: włączone przez użytkownika albo na czas podglądu powiązania. */
export const refsOn = () => rf.on || !!dockPv;
/** Czy odniesienie rysujemy nad bieżącą sceną (wg warstw: wyższa warstwa wyjścia = nad). */
const refAbove = (s) => rf.mode === 'over' || (rf.mode === 'layers' && layerZ(layerName(s)) > layerZ(layerName(scene)));
export function buildRefs() {
  for (const r of refPlayers) r.p.destroy();
  refPlayers = [];
  if (scene && (rf.on || dockPv)) {
    const list = [...new Set([...(rf.on ? refIds() : []), ...(dockPv?.ids || [])])].map((id) => scenes.find((x) => x.id === id)).sort((a, b) => layerZ(layerName(a)) - layerZ(layerName(b)));
    for (const s of list) {
      const sc = structuredClone(s), names = new Map(), nodes = new Map();
      walk(sc.nodes, (n) => { names.set(n.id, n.name || n.type); nodes.set(n.id, n); });
      const p = new ScenePlayer(refAbove(s) ? refsO : refsU, sc, dockPv?.ids?.includes(s.id) ? dockVals(s.id) : {}, { editor: false });
      p.el.dataset.ref = s.id;
      p.seek(refTime(s));
      refPlayers.push({ id: s.id, s, p, names, nodes });
    }
  }
  placeRefs(); syncRefsUI(); queueGuides();
}
export function placeRefs() {
  for (const el of [refsU, refsO]) {
    el.style.transform = stage.style.transform; el.style.width = stage.style.width; el.style.height = stage.style.height;
    el.style.opacity = rf.opacity;
  }
}
/** Prostokąty elementów, które coś rysują (px kadru): bieżąca scena i odniesienia. */
export function drawnRects(root, nodeOf, tt) {
  const out = [];
  for (const el of root.querySelectorAll('.vz-node')) {
    const n = nodeOf(el.dataset.id);
    if (!drawsNode(n, tt) || !shownEl(el)) continue;
    const r = sceneRect(el); if (r.x2 - r.x1 < 1 || r.y2 - r.y1 < 1) continue;
    out.push({ id: el.dataset.id, n, r });
  }
  return out;
}
/** Nachodzenie elementów bieżącej sceny na elementy scen odniesienia z innych warstw (grają razem na antenie). */
let overInfo = '';
export function overlapSvg(k) {
  let h = '', list = [];
  if (refsOn() && rf.warn && refPlayers.length && player) {
    const others = refPlayers.filter((x) => layerName(x.s) !== layerName(scene));
    if (others.length) {
      const mine = drawnRects(stage, (id) => locate(id)?.node, t);
      for (const ref of others) {
        const theirs = drawnRects(ref.p.el, (id) => ref.nodes.get(id), refTime(ref.s));
        for (const a of mine) for (const o of theirs) {
          const x1 = Math.max(a.r.x1, o.r.x1), y1 = Math.max(a.r.y1, o.r.y1), x2 = Math.min(a.r.x2, o.r.x2), y2 = Math.min(a.r.y2, o.r.y2);
          if (x2 - x1 < 1 || y2 - y1 < 1) continue;
          h = html`${h}${html`<rect class="over" x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"/>`}`;
          list.push(`${a.n.name || a.n.type} ↔ ${ref.s.name} › ${o.n.name || o.n.type}`);
        }
      }
    }
  }
  list = [...new Set(list)];
  const txt = list.length ? `⚠ Nachodzi na grafikę z innej warstwy: ${list.slice(0, 3).join(' · ')}${list.length > 3 ? ` (+${list.length - 3})` : ''}` : '';
  if (txt !== overInfo) { overInfo = txt; const w = $('#overWarn'); w.textContent = txt; w.hidden = !txt; }
  return h;
}
/** Pomiar (Alt): odległość obrysu zaznaczenia (bez zaznaczenia – całej sceny) do najbliższych krawędzi w czterech kierunkach. */
export let measureOn = false;
export function setMeasureOn(v) { measureOn = v; }
export function measureSvg(k) {
  if (!measureOn || !player) return '';
  const ids = selAll(), selEls = ids.map((id) => stage.querySelector(`[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
  const S = selEls.length ? drawnBox(selEls, ownNode) || unionRect(selEls) : drawnBox(stage.querySelectorAll('.vz-root > .vz-node'), ownNode);
  if (!S) return '';
  const inSel = (el) => selEls.some((m) => m === el || m.contains(el));
  const cands = drawnRects(stage, (id) => locate(id)?.node, t).filter((x) => !inSel(stage.querySelector(`[data-id="${CSS.escape(x.id)}"]`)))
    .map((x) => ({ r: x.r, lbl: x.n.name || x.n.type }));
  if (!selEls.length) cands.length = 0; // cała scena: mierzymy tylko do odniesień i kadru
  if (refsOn()) for (const ref of refPlayers) for (const x of drawnRects(ref.p.el, (id) => ref.nodes.get(id), refTime(ref.s))) cands.push({ r: x.r, lbl: `${ref.s.name} › ${x.n.name || x.n.type}` });
  const W = scene.width, H = scene.height, mx = (S.x1 + S.x2) / 2, my = (S.y1 + S.y2) / 2;
  const best = { up: { d: S.y1, at: 0 }, down: { d: H - S.y2, at: H }, left: { d: S.x1, at: 0 }, right: { d: W - S.x2, at: W } }; // kadr
  for (const c of cands) {
    const r = c.r, ovX = r.x1 < S.x2 && r.x2 > S.x1, ovY = r.y1 < S.y2 && r.y2 > S.y1;
    if (ovX) for (const e of [r.y1, r.y2]) {
      if (e <= S.y1 + 0.5 && S.y1 - e < best.up.d) best.up = { d: S.y1 - e, at: e };
      if (e >= S.y2 - 0.5 && e - S.y2 < best.down.d) best.down = { d: e - S.y2, at: e };
    }
    if (ovY) for (const e of [r.x1, r.x2]) {
      if (e <= S.x1 + 0.5 && S.x1 - e < best.left.d) best.left = { d: S.x1 - e, at: e };
      if (e >= S.x2 - 0.5 && e - S.x2 < best.right.d) best.right = { d: e - S.x2, at: e };
    }
  }
  const tag = (x, y, v) => { const tx = `${Math.round(v)} px`, w = (tx.length * 6.6 + 8) * k, hh = 15 * k;
    return html`<rect class="measbg" x="${x - w / 2}" y="${y - hh / 2}" width="${w}" height="${hh}" rx="${3 * k}"/><text class="measl" x="${x}" y="${y + 4 * k}" text-anchor="middle" font-size="${11 * k}">${tx}</text>`; };
  let h = html`<rect class="measb" x="${S.x1}" y="${S.y1}" width="${S.x2 - S.x1}" height="${S.y2 - S.y1}"/>`;
  const e = 5 * k;
  const up = best.up, dn = best.down, lf = best.left, rt = best.right;
  h = html`${h}${html`<path class="meas" d="M${mx} ${S.y1}V${up.at}M${mx - e} ${up.at}H${mx + e}M${mx} ${S.y2}V${dn.at}M${mx - e} ${dn.at}H${mx + e}M${S.x1} ${my}H${lf.at}M${lf.at} ${my - e}V${my + e}M${S.x2} ${my}H${rt.at}M${rt.at} ${my - e}V${my + e}"/>`}`;
  if (up.d > 0.5) h = html`${h}${tag(mx, (S.y1 + up.at) / 2, up.d)}`;
  if (dn.d > 0.5) h = html`${h}${tag(mx, (S.y2 + dn.at) / 2, dn.d)}`;
  if (lf.d > 0.5) h = html`${h}${tag((S.x1 + lf.at) / 2, my, lf.d)}`;
  if (rt.d > 0.5) h = html`${h}${tag((S.x2 + rt.at) / 2, my, rt.d)}`;
  return h;
}
let guidesQ = 0;
/** Odrysowanie prowadnic w najbliższej klatce (nachodzenie i pomiar po zmianie właściwości, czasu, odniesień). */
export const queueGuides = () => { if (!guidesQ) guidesQ = requestAnimationFrame(() => { guidesQ = 0; drawGuides(); }); };
export function seekRefs() { if (rf.time === 'head') for (const r of refPlayers) r.p.seek(refTime(r.s)); queueGuides(); }
export function syncRefsUI() {
  const n = refPlayers.length;
  $('#vRefs').classList.toggle('on', rf.on && n > 0);
  $('#vRefsN').textContent = n && rf.on ? n : '';
  const lab = $('#tree .refs1');
  if (lab) { lab.textContent = n && rf.on ? '⧉ ' + refPlayers.map((r) => r.s.name).join(', ') : ''; lab.title = 'Sceny odniesienia na kanwie (klik = wybór)'; }
}
export function renderRefsPop() {
  const others = scenes.filter((x) => x.id !== scene.id);
  const sel = new Set(refIds());
  const pos = (s) => layerName(s) === layerName(scene) ? 'ta sama warstwa' : refAbove(s) ? 'nad' : 'pod';
  const size = (s) => (s.width || 1920) !== scene.width || (s.height || 1080) !== scene.height;
  setHtml($('#pRefs'), html`<label><input type="checkbox" data-rf="on" ${rf.on ? 'checked' : ''}> <b>Pokaż sceny odniesienia</b> <span class="dim">(Shift+R)</span></label>
    <h4>Odniesienia dla „${esc(scene.name)}”</h4>
    <div class="rflist">${others.length ? others.map((s) => html`<label title="${esc(s.name)} · warstwa ${esc(layerName(s))}"><input type="checkbox" data-rfid="${esc(s.id)}" ${sel.has(s.id) ? 'checked' : ''}><span class="nm">${esc(s.name)}</span><span class="pill">${esc(layerName(s))}</span><span class="pos">${pos(s)}</span>${size(s) ? html`<span class="warn" title="Inna rozdzielczość – rysowana w px kadru bez skalowania">⚠</span>` : ''}</label>`) : html`<div class="dim">Show nie ma innych scen.</div>`}</div>
    ${others.some((s) => sel.has(s.id) && layerName(s) === layerName(scene)) ? html`<div class="warn">Sceny tej samej warstwy zastępują się na antenie – nie będą widoczne razem.</div>` : ''}
    <h4>Wygląd</h4>
    <div class="rfrow"><span>krycie</span><input type="range" min="10" max="100" step="5" data-rf="opacity" value="${Math.round(rf.opacity * 100)}" title="${Math.round(rf.opacity * 100)}%"></div>
    <div class="rfrow"><span>kolejność</span><select data-rf="mode"><option value="layers" ${rf.mode === 'layers' ? 'selected' : ''}>wg warstw – jak na wyjściu</option><option value="under" ${rf.mode === 'under' ? 'selected' : ''}>wszystkie pod sceną</option><option value="over" ${rf.mode === 'over' ? 'selected' : ''}>wszystkie nad sceną</option></select></div>
    <div class="rfrow"><span>czas</span><select data-rf="time"><option value="stop" ${rf.time === 'stop' ? 'selected' : ''}>pierwszy stop point (na antenie)</option><option value="head" ${rf.time === 'head' ? 'selected' : ''}>jak głowica osi czasu</option></select></div>
    <label><input type="checkbox" data-rf="snap" ${rf.snap ? 'checked' : ''}> Przyciągaj do elementów odniesień</label>
    <label title="Czerwony obszar na kanwie i komunikat, gdy element tej sceny zasłania element sceny odniesienia z innej warstwy"><input type="checkbox" data-rf="warn" ${rf.warn ? 'checked' : ''}> Ostrzegaj o nachodzeniu elementów</label>
    <div class="dim" style="font-size:11px">Alt (przytrzymaj) – odległości zaznaczenia do najbliższych krawędzi.</div>
    <div class="dim" style="margin-top:6px;font-size:11px">Tylko podgląd w Artist – nie zmienia sceny ani wyjścia. Dosuwanie i wyrównanie: ustawienia sceny (klik w puste tło) → „Położenie względem innej sceny”.</div>`);
}
function onRefsPop(e) {
  const el = e.target;
  if (el.dataset.rfid) {
    const cur = new Set(refIds());
    if (el.checked) cur.add(el.dataset.rfid); else cur.delete(el.dataset.rfid);
    if (cur.size) rf.per[scene.id] = [...cur]; else delete rf.per[scene.id];
    if (el.checked) rf.on = true;
  } else if (el.dataset.rf === 'opacity') { rf.opacity = Math.min(1, Math.max(0.1, +el.value / 100)); el.title = el.value + '%'; placeRefs(); saveRf(); return; }
  else if (el.dataset.rf === 'mode' || el.dataset.rf === 'time') rf[el.dataset.rf] = el.value;
  else if (el.dataset.rf) rf[el.dataset.rf] = el.checked;
  else return;
  saveRf(); buildRefs(); renderRefsPop();
}
export function toggleRefs() {
  if (!refIds().length) { togglePop('#pRefs'); return; }
  rf.on = !rf.on; saveRf(); buildRefs(); if (!$('#pRefs').hidden) renderRefsPop();
  toast(rf.on ? 'Sceny odniesienia widoczne' : 'Sceny odniesienia ukryte');
}
/** Ustawienia „Położenie względem innej sceny” (okno, nie scena): cel, element celu, odstęp, tryb powiązania. */
const REL_DEF = { target: '', node: '', gap: 0, dock: false };
export let rel = { ...REL_DEF };
export const saveRel = () => { try { localStorage.setItem('vizrs.rel', JSON.stringify(rel)); } catch { /* ignoruj */ } };
/** Cel: zapamiętany, a gdy nie pasuje – pierwsza scena odniesienia, potem pierwsza inna scena. */
function relTarget() {
  const ok = (id) => id && id !== scene.id && scenes.some((x) => x.id === id);
  if (!ok(rel.target)) { rel.target = refIds()[0] || scenes.find((x) => x.id !== scene.id)?.id || ''; rel.node = ''; }
  return scenes.find((x) => x.id === rel.target) || null;
}
const REL_OPS = {
  above: ['⤒ nad celem', 'Dosuń nad cel (dolna krawędź = górna krawędź celu − odstęp)'], below: ['⤓ pod celem', 'Dosuń pod cel (górna krawędź = dolna krawędź celu + odstęp)'],
  left: ['⇤ z lewej celu', 'Dosuń z lewej strony celu (prawa krawędź = lewa krawędź celu − odstęp)'], right: ['⇥ z prawej celu', 'Dosuń z prawej strony celu (lewa krawędź = prawa krawędź celu + odstęp)'],
  al: ['⇤ lewe', 'Wyrównaj lewe krawędzie do celu'], ac: ['↔ środki', 'Wyrównaj środki w poziomie'], ar: ['⇥ prawe', 'Wyrównaj prawe krawędzie do celu'],
  at: ['⤒ góry', 'Wyrównaj górne krawędzie do celu'], am: ['↕ środki', 'Wyrównaj środki w pionie'], ab: ['⤓ doły', 'Wyrównaj dolne krawędzie do celu'],
};
export function relForm(forNode) {
  const ts = relTarget(), others = scenes.filter((x) => x.id !== scene.id);
  if (!others.length) return html`<div class="relbox"><div class="rnote">Show nie ma innych scen – dodaj np. ticker albo logo, żeby ustawiać tę ${forNode ? 'grafikę' : 'scenę'} względem nich.</div></div>`;
  const nodes = []; if (ts) walk(ts.nodes, (n, par) => { nodes.push([n.id, (par ? '· ' : '') + (n.name || n.type)]); });
  if (rel.node && !nodes.some(([id]) => id === rel.node)) rel.node = '';
  const b = (op) => html`<button data-relop="${op}" data-relfor="${forNode ? 'node' : 'scene'}" title="${esc(REL_OPS[op][1])}">${REL_OPS[op][0]}</button>`;
  return html`<div class="relbox">
    <div class="rrow"><label>cel</label><div class="row"><select data-rel="target" title="Scena docelowa">${others.map((x) => html`<option value="${esc(x.id)}" ${x.id === rel.target ? 'selected' : ''}>${esc(x.name)} · ${esc(layerName(x))}</option>`)}</select>
      <select data-rel="node" title="Element sceny docelowej (domyślnie obrys całej sceny)"><option value="">cała scena</option>${nodes.map(([id, nm]) => html`<option value="${esc(id)}" ${id === rel.node ? 'selected' : ''}>${esc(nm)}</option>`)}</select></div></div>
    <div class="rrow"><label>odstęp px</label><input type="number" data-rel="gap" value="${+rel.gap || 0}" title="Odstęp przy dosuwaniu (ujemny = zachodzi na cel)"></div>
    <div class="rrow"><label>dosuń</label><div class="rbtns">${['above', 'below', 'left', 'right'].map(b)}</div></div>
    <div class="rrow"><label>wyrównaj krawędzie</label><div class="rbtns three">${['al', 'ac', 'ar', 'at', 'am', 'ab'].map(b)}</div></div>
    ${forNode ? html`<div class="rrow"><label></label><div class="rbtns" style="grid-template-columns:1fr"><button data-relop="width" data-relfor="node" title="Szerokość zaznaczonego elementu = szerokość celu, lewe krawędzie wyrównane">↔ szerokość jak cel</button></div></div>`
      : html`<label class="chk" style="padding-top:4px" title="Zamiast przesuwać scenę na stałe – reguła powiązania (dock): przesunięcie tylko wtedy, gdy cel jest na antenie"><input type="checkbox" data-rel="dock" ${rel.dock ? 'checked' : ''}> jako powiązanie (dock): tylko gdy cel jest na antenie</label>`}
    <div class="rnote">Obrysy liczone jak na kanwie (cel w ${rf.time === 'head' ? 'bieżącym czasie' : 'pierwszym stop poincie'}). ${forNode ? 'Animowany element przesuwa się razem z kluczami.' : 'Przesuwa całą scenę (położenie sceny) – animacje bez zmian.'} Jedno Ctrl+Z cofa.</div>
  </div>`;
}
/** Obrys sceny docelowej albo jej elementu w px kadru – z jej odtwarzacza odniesienia albo z chwilowego, niewidocznego. */
function relTargetRect(ts, nodeId) {
  const ref = refsOn() && refPlayers.find((r) => r.id === ts.id);
  let tmp = null;
  if (!ref) { tmp = new ScenePlayer(refsU, structuredClone(ts), {}, { editor: false }); tmp.el.style.visibility = 'hidden'; tmp.seek(refTime(ts)); }
  const root = (ref ? ref.p : tmp).el;
  const els = nodeId ? [root.querySelector(`[data-id="${CSS.escape(nodeId)}"]`)] : root.querySelectorAll('.vz-root > .vz-node');
  const nodes = new Map(); walk((ref ? ref.p : tmp).scene.nodes, (n) => { nodes.set(n.id, n); });
  const r = drawnBox(els, (id) => nodes.get(id), refTime(ts)) || unionRect(els);
  tmp?.destroy();
  return r;
}
export function relApply(op, forNode) {
  const ts = relTarget(); if (!ts) { toast('Wybierz scenę docelową', true); return; }
  const T = relTargetRect(ts, rel.node);
  if (!T) { toast(`Cel „${ts.name}${rel.node ? ' › ' + (nameIn(ts, rel.node)) : ''}” nie ma widocznych elementów`, true); return; }
  const ids = forNode ? topSel().filter((id) => !isLocked(id)) : [];
  if (forNode && !ids.length) { toast('Zaznacz niezablokowany element', true); return; }
  const srcEls = () => (forNode ? ids.map((id) => stage.querySelector(`[data-id="${CSS.escape(id)}"]`)) : stage.querySelectorAll('.vz-root > .vz-node'));
  const srcBox = () => { const e = srcEls(); return drawnBox(e, ownNode) || unionRect(e); };
  let S = srcBox();
  if (!S) { toast(forNode ? 'Zaznaczony element nie jest widoczny w bieżącym czasie' : 'Scena nie ma widocznych elementów w bieżącym czasie', true); return; }
  const g = +rel.gap || 0, cx = (r) => (r.x1 + r.x2) / 2, cy = (r) => (r.y1 + r.y2) / 2;
  checkpoint();
  let widthDone = false;
  if (op === 'width') {
    const n = locate(ids[0]).node, xf = parentXf(ids[0]);
    if (ids.length > 1 || xf.rot || num(n, 'rotation')) { undo.pop(); toast('„Szerokość jak cel” działa dla jednego elementu bez obrotu', true); return; }
    setProp(n, 'w', Math.max(0, Math.round((T.x2 - T.x1) / (xf.sc * (scl(n) || 1))))); refresh();
    S = srcBox(); op = 'al'; widthDone = true;
  }
  const d = { above: [0, T.y1 - g - S.y2], below: [0, T.y2 + g - S.y1], left: [T.x1 - g - S.x2, 0], right: [T.x2 + g - S.x1, 0],
    al: [T.x1 - S.x1, 0], ac: [cx(T) - cx(S), 0], ar: [T.x2 - S.x2, 0], at: [0, T.y1 - S.y1], am: [0, cy(T) - cy(S)], ab: [0, T.y2 - S.y2] }[op];
  const dx = Math.round(d[0]), dy = Math.round(d[1]);
  if (!forNode && rel.dock) {
    const target = 'scene:' + ts.name;
    scene.dock ||= [];
    const ex = scene.dock.find((x) => x.target === target);
    if (ex) { ex.dx = dx; ex.dy = dy; } else scene.dock.push({ target, dx, dy, dur: 0.6 });
    renderProps(); toast(`Powiązanie: gdy „${ts.name}” na antenie – przesunięcie ${dx}, ${dy} px`); return;
  }
  if (!dx && !dy) {
    if (widthDone) { syncProps(); renderTimeline(); updateSel(); toast('Szerokość jak cel'); } else { undo.pop(); toast('Już na miejscu'); }
    return;
  }
  if (!forNode) setSceneOffset((+scene.x || 0) + dx, (+scene.y || 0) + dy);
  else {
    for (const id of ids) { const [lx, ly] = toLocal(dx, dy, parentXf(id)); shiftNode(locate(id).node, lx, ly); }
    refresh(); syncProps(); renderTimeline();
  }
  updateSel(); toast(`Przesunięto o ${dx}, ${dy} px`);
}
const nameIn = (s, id) => { let nm = id; walk(s.nodes, (n) => { if (n.id === id) { nm = n.name || n.type; return false; } }); return nm; };
/** Przyciąganie krawędzi przeciąganych uchwytem (obrys bb w px kadru, przesunięcie myszy ex / ey): poprawione ex / ey i linie.
 *  sxk / syk – która krawędź (−1 lewa / górna, 1 prawa / dolna, 0 – żadna). */
export function snapEdges(bb, ex, ey, sxk, syk, ev) {
  setSnapShow([]);
  if (!cv.snap || ev.ctrlKey || ev.metaKey) return [ex, ey];
  const tg = snapEdges.tg ||= snapTargets(snapEdges.moving || []), thr = 6 / scale, grid = cv.show && cv.grid ? cv.gridStep : 0;
  if (sxk) {
    const v = (sxk === 1 ? bb.x2 : bb.x1) + ex, h = snapAxis([v], tg.xs, thr, grid);
    if (h) { ex += h.d; snapShow.push({ ax: 'x', v: h.v, lbl: tg.xl[h.i] }); }
  }
  if (syk) {
    const v = (syk === 1 ? bb.y2 : bb.y1) + ey, h = snapAxis([v], tg.ys, thr, grid);
    if (h) { ey += h.d; snapShow.push({ ax: 'y', v: h.v, lbl: tg.yl[h.i] }); }
  }
  return [ex, ey];
}
export const snapEnd = () => { snapEdges.tg = null; snapEdges.moving = null; if (snapShow.length) { setSnapShow([]); drawGuides(); } };

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  try {
    const o = JSON.parse(localStorage.getItem('vizrs.refs') || '{}');
    if (o && typeof o === 'object') rf = { ...RF_DEF, ...o, per: o.per && typeof o.per === 'object' && !Array.isArray(o.per) ? o.per : {} };
  } catch { /* brak localStorage albo uszkodzony wpis */ }
  rf.opacity = Math.min(1, Math.max(0.1, +rf.opacity || 0.5));
  if (!['layers', 'under', 'over'].includes(rf.mode)) rf.mode = 'layers';
  if (!['stop', 'head'].includes(rf.time)) rf.time = 'stop';
  $('#pRefs').addEventListener('change', onRefsPop);
  $('#pRefs').addEventListener('input', (e) => { if (e.target.dataset.rf === 'opacity') onRefsPop(e); });
  try { const o = JSON.parse(localStorage.getItem('vizrs.rel') || '{}'); if (o && typeof o === 'object') rel = { ...REL_DEF, ...o }; } catch { /* ignoruj */ }
}

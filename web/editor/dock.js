// Artist – powiązania (dock): tabela reguł, podgląd, reguły z kanwy.

import { html, setHtml } from '/dom.js';
import { TYPES, propAt, layerZ, parseColor, dockShift as dockShiftOn, DOCK_EASES, restRect } from '/renderer.js';
import { $, box, checkpoint, esc, isLocked, locate, multiSel, num, parentXf, plElem, player, scale, scene, scenes, scl, selAll, selId, selMore, selNode, setLastArea, setSceneOffset, stage, t, toLocal, toast, topSel, trioPages } from './core.js';
import { renderProps, syncProps } from './props.js';
import { renderTimeline } from './timeline.js';
import { refresh, setProp } from './edit.js';
import { select } from './tree.js';
import { GUIDES, applyView, cv, drawGuides, infoText, setSnapShow, snapShow, view } from './canvas.js';
import { buildRefs, layerName, queueGuides, refIds, refPlayers, refTime, refsOn, refsU, rf } from './refs.js';
import { marquee, multiResize, resizeDrag, rotateDrag, sHeld, startTextEdit, syncAlignBar, txEd } from './handles.js';
import { isDesc } from './treedrag.js';

// ------------------------------------------------------------ powiązania (dock): tabela reguł
const DOCK_EASE_LABEL = { std: 'zwykła', out: 'szybka' };
const DOCK_EASE_TITLE = { std: 'równy rozbieg i hamowanie', out: 'szybki start, miękkie hamowanie' };
/** Zachowanie reguły: stałe przesunięcie albo odsunięcie od krawędzi celu (`edge`, z rzeczywistego obrysu celu). */
const DOCK_EDGE_LABEL = { '': 'stałe Δ', top: 'nad celem', bottom: 'pod celem', left: 'z lewej celu', right: 'z prawej celu' };
/** Etykieta jednego celu reguły: scena, warstwa albo strona; `bad` – nie ma takiej sceny / warstwy w show. */
function dockPart(part) {
  const [kind, ...rest] = part.split(':'); const val = rest.join(':');
  if (kind === 'scene') return { label: val, title: 'scena ' + val, bad: !scenes.some((x) => x.name === val) };
  if (kind === 'layer') return { label: 'warstwa ' + val, title: 'dowolna grafika na warstwie ' + val, bad: !scenes.some((x) => layerName(x) === val) };
  if (kind === 'page') return { label: 'strona ' + val, title: 'strona Trio nr ' + val + ' (w podglądzie pomijana – strony zna serwer)', bad: false };
  return { label: part, title: 'nieznany cel', bad: true };
}
export const dockParts = (r) => String(r?.target || '').split('|').map((x) => x.trim()).filter(Boolean);
/** Pary reguł, które mogą zadziałać naraz (wspólny cel) i przesuwają tę samą oś – przesunięcia się sumują. */
export function dockOverlaps() {
  const list = scene.dock || [], out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], common = dockParts(a).filter((x) => dockParts(b).includes(x));
    if (!common.length) continue;
    // oś, którą reguła przesuwa: krawędź – swoja oś, stała – osie z niezerowym Δ
    const ax = (r, k) => (r.edge ? (k === 'dy') === (r.edge === 'top' || r.edge === 'bottom') : !!(+r[k] || 0));
    const sums = (k) => ax(a, k) && ax(b, k) && !(a.edge && b.edge);
    const axes = [sums('dx') ? 'Δx' : '', sums('dy') ? 'Δy' : ''].filter(Boolean);
    if (axes.length) out.push(`reguły ${i + 1} i ${j + 1}: wspólny cel ${common.map((x) => dockPart(x).label).join(', ')} – ${axes.join(' i ')} sumują się`);
  }
  return out;
}
export function dockTable() {
  const list = scene.dock || [];
  if (!list.length) return '';
  const own = layerName(scene);
  const layers = [...new Set(scenes.map((x) => layerName(x)))].filter((l) => l !== own).sort((a, b) => layerZ(a) - layerZ(b));
  const others = scenes.filter((x) => x.id !== scene.id && layerName(x) !== own).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const row = (d, i) => {
    const parts = dockParts(d);
    const chips = parts.map((p, k) => { const x = dockPart(p); return html`<span class="chip dk${x.bad ? ' bad' : ''}" title="${esc(x.title + (x.bad ? ' – nie ma w show' : ''))}">${esc(x.label)}<button data-dkrm="${i}::${k}" title="usuń cel">×</button></span>`; });
    const opt = (v, label) => parts.includes(v) ? '' : html`<option value="${esc(v)}">${esc(label)}</option>`;
    const add = html`${html`<select data-dkadd="${i}" title="Dodaj cel: reguła działa, gdy na antenie jest którykolwiek z celów (jedno przesunięcie)"><option value="">＋ cel…</option>`}${html`<optgroup label="Sceny (każda strona sceny)">${others.map((x) => opt('scene:' + x.name, x.name + ' · ' + layerName(x)))}</optgroup>`}${html`<optgroup label="Warstwy (dowolna grafika)">${layers.map((l) => opt('layer:' + l, 'warstwa ' + l))}</optgroup>`}${html`<optgroup label="Strona Trio"><option value="page:">strona o numerze…</option></optgroup></select>`}`;
    const ease = d.ease || 'std';
    return html`${html`<div class="dkrule"><div class="dkhead"><span class="dim">${i + 1}. gdy na antenie</span><span class="dkact"><button class="icon" data-dkraw="${i}" title="Edytuj cel jako tekst (layer:…, page:…, scene:…, kilka: a|b)">✎</button><button class="icon ${dockPv?.i === i && !dockPv.set ? 'on' : ''}" data-dkpv="${i}" title="Podgląd: cele tej reguły jako sceny odniesienia „na antenie”, scena przesuwa się o wynik powiązań (jak na wyjściu)">👁</button><button class="icon ${dockPv?.i === i && dockPv.set ? 'on' : ''}" data-dkset="${i}" title="Ustaw z kanwy: przeciągnij scenę (z przyciąganiem do celu) – zmienia Δx / Δy tej reguły, nie położenie sceny. Enter – zatwierdź, Esc – anuluj">✋</button><button class="icon danger" data-dkdel="${i}" title="Usuń regułę">×</button></span></div>
      <div class="chips">${chips || html`<span class="dim">brak celu</span>`}${add}</div>
      <div class="dkrow dkmode"><label>zachowanie<select data-dk="${i}::edge" title="Stałe Δ – przesunięcie o Δx / Δy. Nad / pod / z lewej / z prawej celu – odsunięcie od krawędzi celu o odstęp, z rzeczywistego obrysu celu i tej sceny (np. belka o 1 albo 2 wierszach); tylko gdy nachodzą na siebie">${Object.entries(DOCK_EDGE_LABEL).map(([k, v]) => html`<option value="${k}" ${k === (d.edge || '') ? 'selected' : ''}>${v}</option>`)}</select></label>`}${d.edge ? html`<label>odstęp px<input type="number" data-dk="${i}::gap" value="${d.gap ?? 0}" title="Odstęp od krawędzi celu"></label>` : html`<span></span>`}${html`<label>powrót<select data-dk="${i}::back" title="Kiedy scena wraca na miejsce po zejściu celu"><option value="" ${d.back === 'end' ? '' : 'selected'} title="w chwili OUT celu">przy OUT</option><option value="end" ${d.back === 'end' ? 'selected' : ''} title="po animacji wyjścia celu">po zejściu</option></select></label></div>
      <div class="dkrow"><label title="${d.edge ? 'Zapasowe przesunięcie, gdy nie da się zmierzyć celu (albo starszy serwer)' : ''}">${d.edge ? 'zapas Δx' : 'Δx px'}<input type="number" data-dk="${i}::dx" value="${d.dx ?? 0}"></label><label title="${d.edge ? 'Zapasowe przesunięcie, gdy nie da się zmierzyć celu (albo starszy serwer)' : ''}">${d.edge ? 'zapas Δy' : 'Δy px'}<input type="number" data-dk="${i}::dy" value="${d.dy ?? 0}"></label>`}${html`<label>czas s<input type="number" step="0.1" min="0" data-dk="${i}::dur" value="${d.dur ?? 0.6}"></label>`}${html`<label>krzywa<select data-dk="${i}::ease" title="Krzywa ruchu (odjazd i powrót)">${Object.keys(DOCK_EASES).map((k) => html`<option value="${k}" ${k === ease ? 'selected' : ''} title="${DOCK_EASE_TITLE[k] || ''}">${DOCK_EASE_LABEL[k] || k}</option>`)}</select></label></div></div>`}`;
  };
  const warn = dockOverlaps();
  return html`${html`<div class="dktable">${list.map(row)}</div>`}${warn.length ? html`<div class="dkwarn" title="Każda reguła z celem na antenie dodaje swoje przesunięcie. Żeby kilka celów dawało jedno przesunięcie, wpisz je w jednej regule.">⚠ ${warn.join('; ')}. Jedno przesunięcie dla kilku celów – cele w jednej regule.</div>` : ''}`;
}
// ------------------------------------------------------------ powiązania (dock) z podglądu i z kanwy
// 👁 Podgląd: cele reguły (scene:<nazwa>, layer:<warstwa>) jako sceny odniesienia „na antenie”, bieżąca scena przesunięta
// o wynik wszystkich powiązań tak, jak liczy renderer.recomputeDock (suma reguł, które trafiają; własna warstwa nie wyzwala),
// z animacją `dur`. ✋ Ustaw z kanwy: przeciągnięcie sceny (i strzałki) zmienia Δx / Δy reguły zamiast scene.x / y;
// Enter zatwierdza (jeden krok cofania), Esc anuluje. page:<numer> – strony zna tylko serwer, w podglądzie pomijane.
export let dockPv = null;
export function setDockPv(v) { dockPv = v; }
 // { i, set, ids, unknown, dx, dy } – dx / dy: wartości reguły w trybie ustawiania
/** Sceny „na antenie” dla celu reguły: scene:<nazwa> – ta scena, layer:<warstwa> – jedna scena tej warstwy
 *  (najpierw wybrana jako odniesienie). Sceny z warstwy bieżącej sceny pomijane – na antenie zastąpiłyby ją. */
function dockScenes(target) {
  const own = layerName(scene), ids = [], unknown = [], refs = refIds();
  for (const part of String(target || '').split('|').map((x) => x.trim()).filter(Boolean)) {
    const [kind, ...rest] = part.split(':'); const val = rest.join(':');
    let hit = null;
    if (kind === 'scene') hit = scenes.filter((x) => x.name === val).slice(0, 1);
    else if (kind === 'layer') { const ls = scenes.filter((x) => layerName(x) === val && x.id !== scene.id); hit = [ls.find((x) => refs.includes(x.id)) || ls[0]].filter(Boolean); }
    if (!hit?.length) { unknown.push(part); continue; }
    for (const x of hit) if (x.id !== scene.id && layerName(x) !== own && !ids.includes(x.id)) ids.push(x.id);
  }
  return { ids, unknown };
}
/** Przesunięcie sceny przy danych grafikach na antenie – ta sama funkcja co na wyjściu (`dockShift` z renderer.js);
 *  `over` – wartości reguły w trybie „Ustaw z kanwy”. */
function dockShift(air, over) {
  const rules = (scene.dock || []).map((r, i) => (over && over.i === i ? { ...r, dx: over.dx, dy: over.dy } : r));
  // reguły krawędzi: obrysy w spoczynku jak na wyjściu (cele – z wybranymi danymi strony, scena – z danymi podglądu)
  return dockShiftOn(rules, air, layerName(scene), { rect: () => restRect(scene, player?.values || {}, refsU) });
}
/** Wartości sceny odniesienia w podglądzie powiązania: wybrana strona Trio z tą sceną albo domyślne. */
export function dockVals(id) {
  const n = dockPv?.pages?.[id];
  return (n != null && trioPages.find((p) => String(p.number) === String(n))?.values) || {};
}
/** Cel nowej reguły „z odniesienia”: sceny odniesienia z innych warstw, „scene:A|scene:B”. */
export function dockRefTargets() {
  if (!scene) return '';
  return refIds().map((id) => scenes.find((x) => x.id === id)).filter((x) => x && layerName(x) !== layerName(scene)).map((x) => 'scene:' + x.name).join('|');
}
export function dockPlay(animate) {
  if (!dockPv || !player) return;
  const air = dockPv.ids.map((id) => scenes.find((x) => x.id === id)).filter(Boolean)
    .map((x) => ({ layer: layerName(x), scene: x.name, page: dockPv.pages?.[x.id], rect: restRect(x, dockVals(x.id), refsU) }));
  const { dx, dy, dur, ease } = dockShift(air, dockPv.set ? dockPv : null);
  if (animate && dur > 0) {
    player.setDock(0, 0, 0); void player.el.offsetWidth; player.setDock(dx, dy, dur, ease);
    clearTimeout(dockPlay.tm); dockPlay.tm = setTimeout(queueGuides, dur * 1000 + 60);
  } else player.setDock(dx, dy, 0);
  dockBar(dx, dy); queueGuides();
}
export function dockStart(i, set, keep) {
  const r = scene.dock?.[i]; if (!r) return;
  const { ids, unknown } = dockScenes(r.target);
  if (!ids.length) {
    if (dockPv) dockEnd();
    toast(`Cel „${r.target || '(pusty)'}” nie wskazuje sceny z innej warstwy${unknown.some((x) => x.startsWith('page:')) ? ' (page:… – strony zna tylko serwer)' : ''}`, true);
    return;
  }
  const prev = keep && dockPv?.set ? dockPv : null;
  dockPv = { i, set, ids, unknown, dx: prev ? prev.dx : +r.dx || 0, dy: prev ? prev.dy : +r.dy || 0, pages: keep ? dockPv?.pages || {} : {} };
  if (set && selId) select(null);
  buildRefs(); dockPlay(!set); if (!keep) renderProps();
}
/** Koniec podglądu / ustawiania; commit – zapis Δx / Δy z kanwy do reguły (jeden krok cofania). */
export function dockEnd(commit) {
  const pv = dockPv; if (!pv) return;
  dockPv = null;
  player?.setDock(0, 0, 0);
  const r = scene.dock?.[pv.i];
  if (commit && pv.set && r && (Math.round(+r.dx || 0) !== pv.dx || Math.round(+r.dy || 0) !== pv.dy)) {
    checkpoint(); r.dx = pv.dx; r.dy = pv.dy;
    toast(`Powiązanie „${r.target}”: Δx ${pv.dx}, Δy ${pv.dy} px`);
  }
  $('#dockBar').hidden = true;
  buildRefs(); renderProps();
}
function dockBar(dx, dy) {
  const b = $('#dockBar'), r = scene.dock?.[dockPv?.i];
  if (!dockPv || !r) { b.hidden = true; return; }
  const names = dockPv.ids.map((id) => scenes.find((x) => x.id === id)?.name).filter(Boolean).join(', ');
  const skip = dockPv.unknown.length ? html` <span class="dim" title="Nie ma takich scen albo to strony (page:…), które zna tylko serwer">· pominięte: ${esc(dockPv.unknown.join(', '))}</span>` : '';
  // dane celu (np. belka z 1 albo 2 wierszami): strony Trio scen-celów – ruch reguł krawędzi z ich obrysem
  const vsel = dockPv.ids.map((id) => {
    const x = scenes.find((s) => s.id === id), pages = trioPages.filter((p) => p.scene === id || p.scene === x?.name);
    if (!x || !pages.length) return '';
    const cur = String(dockPv.pages?.[id] ?? '');
    return html` <select data-dkpg="${esc(id)}" title="Dane celu „${esc(x.name)}” w podglądzie"><option value="">${esc(x.name)}: domyślne</option>${pages.map((p) => html`<option value="${esc(String(p.number))}" ${cur === String(p.number) ? 'selected' : ''}>${esc(x.name)}: ${esc(String(p.number))}${p.name ? ' ' + esc(p.name) : ''}</option>`)}</select>`;
  });
  setHtml(b, dockPv.set
    ? html`<span>✋ <b>Ustaw z kanwy</b> – przeciągnij scenę (strzałki: 1 px, Shift: 10 px) · gdy na antenie: ${esc(names)}${skip} · reguła <span class="mono">Δx ${dockPv.dx}, Δy ${dockPv.dy}</span></span>
       <button data-dkb="ok" title="Enter">✓ Zatwierdź</button><button data-dkb="end" title="Esc">✕ Anuluj</button>`
    : html`<span>👁 <b>Podgląd powiązania</b> – na antenie: ${esc(names)}${skip}${vsel} · scena przesunięta o <span class="mono">${dx}, ${dy} px</span></span>
       <button data-dkb="play" title="Odtwórz ruch jeszcze raz">▶ Powtórz</button><button data-dkb="end" title="Esc">✕</button>`);
  b.hidden = false;
}
/** Czy element kanwy jest teraz widoczny (także przez przodków: display, visibility, krycie 0). */
export function shownEl(el) {
  if (!el || el.style.display === 'none') return false;
  if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0;
}
/** Czy węzeł coś rysuje: grupa i prostokąt / elipsa bez wypełnienia i ramki to tylko pojemniki. */
export function drawsNode(n, tt = t) {
  if (!n || n.type === 'group') return false;
  if (n.type === 'rect' || n.type === 'ellipse') {
    const c = parseColor(propAt(n, 'color', tt, null)), c2 = propAt(n, 'color2', tt, null);
    return !!(c && c[3] > 0) || !!c2 || +propAt(n, 'borderWidth', tt, null) > 0 || (n.motion?.bg && n.motion.bg !== 'none');
  }
  return true;
}
/** Obszar, który element rysuje, w px ekranu: tekst i zegar – sam tekst (pole bywa dużo większe od napisu). */
export function drawnClientRects(el, n) {
  if ((n.type === 'text' || n.type === 'clock') && el.firstElementChild) {
    const r = el.firstElementChild.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return [r];
  }
  return [el.getBoundingClientRect()];
}
export const inR = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
/**
 * Element pod kursorem: pierwszy (od wierzchu) niezablokowany i widoczny, który w tym punkcie coś rysuje.
 * Pojemniki (grupy, prostokąty bez wypełnienia) nie łapią kliknięć w puste miejsce – chyba że są już zaznaczone
 * i kursor jest w ich ramce (przeciągnięcie zaznaczonej grupy z pustego miejsca w jej obrysie).
 */
export function hitNode(x, y) {
  for (const e of document.elementsFromPoint(x, y)) {
    const el = e.closest?.('.vz-node');
    if (!el || !stage.contains(el) || isLocked(el.dataset.id) || !shownEl(el)) continue;
    const n = locate(el.dataset.id)?.node;
    if (!drawsNode(n)) continue;
    if (!drawnClientRects(el, n).some((r) => inR(r, x, y))) continue;
    return el;
  }
  for (const id of selAll()) {
    const el = stage.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el && !isLocked(id) && shownEl(el) && inR(el.getBoundingClientRect(), x, y)) return el;
  }
  return null;
}
/** Ramka elementu kanwy w px sceny (kadr wyjścia), osiowo – z obrotem i skalą. */
export function sceneRect(el) {
  const s0 = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x1: (r.left - s0.left) / scale, y1: (r.top - s0.top) / scale, x2: (r.right - s0.left) / scale, y2: (r.bottom - s0.top) / scale };
}
/** Cele przyciągania: krawędzie i środek kadru, widoczne prowadnice, krawędzie i środki innych elementów
 *  i elementów scen odniesienia (xl / yl – etykieta celu z odniesienia, pokazywana przy linii przyciągania). */
export function snapTargets(moving) {
  const W = scene.width, H = scene.height, xs = [0, W / 2, W], ys = [0, H / 2, H], xl = [], yl = [];
  if (cv.show) {
    for (const g of GUIDES) if (cv.g[g.k]) { const [x, y, w, h] = g.r(W, H); xs.push(x, x + w); ys.push(y, y + h); }
    if (cv.thirds) { xs.push(W / 3, 2 * W / 3); ys.push(H / 3, 2 * H / 3); }
  }
  for (const el of stage.querySelectorAll('.vz-node')) {
    if (moving.some((m) => m.contains(el)) || !drawsNode(ownNode(el.dataset.id)) || !shownEl(el)) continue;
    const r = sceneRect(el); if (r.x2 - r.x1 < 1 && r.y2 - r.y1 < 1) continue;
    xs.push(r.x1, (r.x1 + r.x2) / 2, r.x2); ys.push(r.y1, (r.y1 + r.y2) / 2, r.y2);
  }
  if (refsOn() && rf.snap) for (const ref of refPlayers) {
    for (const el of ref.p.el.querySelectorAll('.vz-node')) {
      if (!drawsNode(ref.nodes.get(el.dataset.id), refTime(ref.s)) || !shownEl(el)) continue;
      const r = sceneRect(el); if (r.x2 - r.x1 < 1 && r.y2 - r.y1 < 1) continue;
      const lb = `${ref.s.name} › ${ref.names.get(el.dataset.id) || '?'}`;
      xl[xs.length] = xl[xs.length + 1] = xl[xs.length + 2] = lb; yl[ys.length] = yl[ys.length + 1] = yl[ys.length + 2] = lb;
      xs.push(r.x1, (r.x1 + r.x2) / 2, r.x2); ys.push(r.y1, (r.y1 + r.y2) / 2, r.y2);
    }
  }
  return { xs, ys, xl, yl };
}
const visibleEl = (el) => el && el.style.display !== 'none' && el.style.visibility !== 'hidden';
/** Obrys elementów kanwy w px kadru (null – brak widocznych). */
export function unionRect(els) {
  let u = null;
  for (const el of els) {
    if (!visibleEl(el)) continue;
    const r = sceneRect(el); if (r.x2 - r.x1 < 0.5 && r.y2 - r.y1 < 0.5) continue;
    u = u ? { x1: Math.min(u.x1, r.x1), y1: Math.min(u.y1, r.y1), x2: Math.max(u.x2, r.x2), y2: Math.max(u.y2, r.y2) } : r;
  }
  return u;
}
/** Obrys tego, co elementy rysują (pojemnik – przez zawartość; grupa 1920×1080 nie robi z belki pełnego kadru), px kadru. */
export function drawnBox(els, nodeOf, tt = t) {
  const list = [];
  for (const el of els) {
    if (!el) continue;
    for (const x of [el, ...el.querySelectorAll('.vz-node')]) if (drawsNode(nodeOf(x.dataset.id), tt) && shownEl(x)) list.push(x);
  }
  return unionRect(list);
}
export const ownNode = (id) => locate(id)?.node;
/** Przyciąganie obrysu bb przesuniętego o (dx, dy): poprawione przesunięcie + linie do pokazania. */
function snapMove(bb, dx, dy, targets, lockX, lockY) {
  const thr = 6 / scale, grid = cv.show && cv.grid ? cv.gridStep : 0, out = [];
  const sxb = !lockX && snapAxis([bb.x1 + dx, (bb.x1 + bb.x2) / 2 + dx, bb.x2 + dx], targets.xs, thr, grid);
  const syb = !lockY && snapAxis([bb.y1 + dy, (bb.y1 + bb.y2) / 2 + dy, bb.y2 + dy], targets.ys, thr, grid);
  if (sxb) { dx += sxb.d; out.push({ ax: 'x', v: sxb.v, lbl: targets.xl[sxb.i] }); }
  if (syb) { dy += syb.d; out.push({ ax: 'y', v: syb.v, lbl: targets.yl[syb.i] }); }
  return { dx, dy, show: out };
}
/** Najbliższe przyciągnięcie krawędzi / środka (vals) do celów w progu thr; siatka – do wielokrotności kroku. */
export function snapAxis(vals, cands, thr, grid) {
  let best = null;
  const tryC = (v, c, i) => { const d = c - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d) || (Math.abs(d) === Math.abs(best.d) && i < best.i))) best = { d, v: c, i }; };
  for (const v of vals) { cands.forEach((c, i) => tryC(v, c, i)); if (grid) tryC(v, Math.round(v / grid) * grid, -1); }
  return best;
}
export function updateSel() {
  const o = $('#sel');
  if (txEd) { o.style.display = 'none'; $('#selLbl').style.display = 'none'; $('#alignBar').hidden = true; return; } // edycja tekstu – bez ramki i uchwytów
  const el = selId && stage.querySelector(`[data-id="${CSS.escape(selId)}"]`);
  if (!el || el.style.display === 'none') { $('#alignBar').hidden = true; o.style.display = 'none'; $('#selLbl').style.display = 'none'; if ($('#selx').dataset.h) { setHtml($('#selx'), ''); $('#selx').dataset.h = ''; } return; }
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  const n = selNode();
  // obrót (własny i przodków) obraca też ramkę: uchwyt rozmiaru jest w rogu elementu, nie w rogu obrysu osiowego
  const xf = parentXf(selId), rot = n ? xf.rot + num(n, 'rotation') : 0, sk = n ? num(n, 'skewX') : 0;
  const mb = multiSel() ? (() => { const es = topSel().map((id) => stage.querySelector(`[data-id="${CSS.escape(id)}"]`)); return drawnBox(es, ownNode) || unionRect(es); })() : null;
  if (mb) {
    const s0 = stage.getBoundingClientRect();
    Object.assign(o.style, { display: 'block', left: s0.left - b.left + mb.x1 * scale + 'px', top: s0.top - b.top + mb.y1 * scale + 'px', width: (mb.x2 - mb.x1) * scale + 'px', height: (mb.y2 - mb.y1) * scale + 'px', transform: '' });
  } else if (n && Math.abs(rot % 360) > 0.01 && !sk && el.offsetWidth + el.offsetHeight > 0) {
    const k = scale * xf.sc * (scl(n) || 1), w = el.offsetWidth * k, h = el.offsetHeight * k;
    const cx = (r.left + r.right) / 2 - b.left, cy = (r.top + r.bottom) / 2 - b.top;
    Object.assign(o.style, { display: 'block', left: cx - w / 2 + 'px', top: cy - h / 2 + 'px', width: w + 'px', height: h + 'px', transform: `rotate(${rot}deg)` });
  } else Object.assign(o.style, { display: 'block', left: r.left - b.left + 'px', top: r.top - b.top + 'px', width: r.width + 'px', height: r.height + 'px', transform: '' });
  // uchwyty: rozmiar tylko dla właściwości, które typ ma; obrót – gdy ma rotation; kilka zaznaczonych albo zablokowany – bez uchwytów
  const tp = n ? TYPES[n.type]?.props || [] : [];
  o.classList.toggle('noh', !n || (!mb && isLocked(n.id)) || (multiSel() && !mb));
  o.classList.toggle('now', !mb && !tp.includes('w')); o.classList.toggle('nohh', !mb && !tp.includes('h')); o.classList.toggle('nor', !!mb || !tp.includes('rotation'));
  const lb = $('#selLbl');
  // etykieta pod obrysem, gdy nad nim jest kółko obrotu (inaczej by je zasłaniała)
  const below = !o.classList.contains('noh') && !o.classList.contains('nor');
  Object.assign(lb.style, { display: 'block', left: r.left - b.left - 1 + 'px', top: (below ? r.bottom - b.top + 4 : r.top - b.top - 2) + 'px', transform: below ? 'none' : '' });
  lb.textContent = mb ? `${selAll().length} ${plElem(selAll().length)}  ${Math.round(mb.x2 - mb.x1)}×${Math.round(mb.y2 - mb.y1)}` : n ? `${n.name}  ${Math.round(propAt(n, 'x', t))}, ${Math.round(propAt(n, 'y', t))}  ${Math.round(propAt(n, 'w', t))}×${Math.round(propAt(n, 'h', t))}${num(n, 'rotation') ? `  ∠ ${Math.round(num(n, 'rotation') * 10) / 10}°` : ''}${selMore.length ? `  (+${selMore.length})` : ''}` : '';
  // pozostałe zaznaczone (Ctrl / Shift+klik): ramki przerywane
  let hx = '';
  for (const id of mb ? selAll() : selMore) {
    const e2 = stage.querySelector(`[data-id="${CSS.escape(id)}"]`); if (!e2 || e2.style.display === 'none') continue;
    const r2b = e2.getBoundingClientRect();
    hx = html`${hx}${html`<div class="selx${mb && id === selId ? ' key' : ''}" style="left:${r2b.left - b.left}px;top:${r2b.top - b.top}px;width:${r2b.width}px;height:${r2b.height}px"></div>`}`;
  }
  const sx = $('#selx'); if (sx.dataset.h !== hx) { setHtml(sx, hx); sx.dataset.h = hx; }
  syncAlignBar();
}
let descT = 0;

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  $('#dockBar').addEventListener('mousedown', (e) => e.stopPropagation());
  $('#dockBar').addEventListener('change', (e) => {
    const id = e.target.dataset?.dkpg; if (id === undefined || !dockPv) return;
    dockPv.pages = { ...dockPv.pages, [id]: e.target.value || undefined };
    buildRefs(); dockPlay(true);
  });
  $('#dockBar').addEventListener('click', (e) => {
    const k = e.target.closest('[data-dkb]')?.dataset.dkb;
    if (k === 'play') dockPlay(true); else if (k === 'ok') dockEnd(true); else if (k === 'end') dockEnd();
  });
  box.addEventListener('mousedown', (e) => {
    setLastArea('canvas');
    clearTimeout(descT);
    if (e.button === 1) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, x0 = view.x, y0 = view.y;
      const mv = (ev) => { view.x = x0 + ev.clientX - sx; view.y = y0 + ev.clientY - sy; applyView(); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      return;
    }
    if (e.button !== 0) return;
    const handle = e.target.closest('#sel .h, #sel .hr');
    const setD = dockPv?.set ? dockPv : null; // „Ustaw z kanwy”: każde przeciągnięcie przesuwa scenę i zmienia Δx / Δy reguły
    const nodeEl = !handle && !setD && hitNode(e.clientX, e.clientY);
    if (!handle && !nodeEl && !setD && !sHeld) { e.preventDefault(); marquee(e); return; }
    if (!handle && !nodeEl) {
      // S + przeciągnięcie (albo „Ustaw z kanwy” powiązania): przesuwa całą scenę (scene.x / y)
      if (selId) select(null);
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, x0 = setD ? setD.dx : +scene.x || 0, y0 = setD ? setD.dy : +scene.y || 0; let moved = false;
      // przyciąganie obrysu całej sceny do kadru, prowadnic i scen odniesienia (własne elementy jadą razem ze sceną)
      const own = [...stage.querySelectorAll('.vz-node')], bb = drawnBox(stage.querySelectorAll('.vz-root > .vz-node'), ownNode);
      let targets = null;
      const mv = (ev) => {
        let dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
        if (!moved) { if (!setD) checkpoint(); moved = true; }
        let lockX = false, lockY = false;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) { dy = 0; lockY = true; } else { dx = 0; lockX = true; } }
        setSnapShow([]);
        if (cv.snap && !ev.ctrlKey && !ev.metaKey && bb) {
          targets ||= snapTargets(own);
          const sm = snapMove(bb, dx, dy, targets, lockX, lockY); ({ dx, dy } = sm); setSnapShow(sm.show);
        }
        if (setD) { setD.dx = Math.round(x0 + dx); setD.dy = Math.round(y0 + dy); dockPlay(false); } else setSceneOffset(x0 + dx, y0 + dy);
        drawGuides();
      };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (snapShow.length) { setSnapShow([]); drawGuides(); } };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      return;
    }
    e.preventDefault();
    const hitId = nodeEl ? nodeEl.dataset.id : null; // nodeEl bywa false (uchwyt), nie tylko null
    // czy kliknięty element jest zaznaczony sam albo przez zaznaczoną grupę nadrzędną
    const inSel = (id) => selAll().find((s) => s === id || isDesc(locate(s)?.node || {}, id));
    if (hitId) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) { // dodaj / zdejmij z zaznaczenia, bez przeciągania
        const all = selAll();
        if (all.includes(hitId)) { const rest = all.filter((x) => x !== hitId); select(rest[0], rest.slice(1)); } else select(hitId, all);
        return;
      }
      if (e.detail >= 2 && hitId === selId && !selMore.length && locate(hitId)?.node.type === 'text' && startTextEdit(locate(hitId).node)) return; // dwuklik w zaznaczony tekst – edycja w miejscu
      if (e.detail >= 2) { // dwuklik: grupa nadrzędna (kolejny dwuklik – jeszcze wyżej)
        const base = inSel(hitId) || hitId, P = locate(base)?.parent;
        if (P) select(P.id); else if (!inSel(hitId)) select(hitId);
      } else if (!inSel(hitId)) select(hitId);
    }
    const n = selNode(); if (!n) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    if (handle) { // uchwyty ramki: rozmiar (8 uchwytów) albo obrót głównego zaznaczenia
      if (multiSel()) { if (!handle.classList.contains('hr')) multiResize(handle.dataset.h, e); return; }
      if (isLocked(n.id)) return;
      if (handle.classList.contains('hr')) rotateDrag(n, e); else resizeDrag(n, handle.dataset.h, e);
      return;
    }
    // przesuwanie całego zaznaczenia; ruch myszy przeliczony na układ rodzica każdego elementu (obrót i skala grup)
    const movers = topSel().filter((id) => !isLocked(id)).map((id) => {
      const m = locate(id).node;
      return { n: m, xf: parentXf(id), x0: num(m, 'x'), y0: num(m, 'y'), el: stage.querySelector(`[data-id="${CSS.escape(id)}"]`) };
    });
    if (!movers.length) return;
    const els = movers.map((m) => m.el).filter(Boolean);
    const bb = drawnBox(els, ownNode) || unionRect(els);
    let targets = null;
    const mv = (ev) => {
      let dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
      if (!moved) { checkpoint(); moved = true; }
      let lockX = false, lockY = false;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) { dy = 0; lockY = true; } else { dx = 0; lockX = true; } }
      setSnapShow([]);
      if (cv.snap && !ev.ctrlKey && !ev.metaKey && bb) {
        targets ||= snapTargets(els);
        const sm = snapMove(bb, dx, dy, targets, lockX, lockY); ({ dx, dy } = sm); setSnapShow(sm.show);
      }
      for (const m of movers) {
        const [lx, ly] = toLocal(dx, dy, m.xf);
        setProp(m.n, 'x', Math.round(m.x0 + lx)); setProp(m.n, 'y', Math.round(m.y0 + ly));
      }
      refresh(); syncProps(); drawGuides();
    };
    const up = () => {
      removeEventListener('mousemove', mv); removeEventListener('mouseup', up);
      if (snapShow.length) { setSnapShow([]); drawGuides(); }
      if (moved) renderTimeline();
      // klik bez ruchu w element zaznaczonej grupy: po chwili (gdy to nie dwuklik) zaznacz sam element
      else if (hitId && e.detail === 1 && hitId !== selId && !selMore.length && inSel(hitId)) descT = setTimeout(() => select(hitId), 260);
    };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  box.addEventListener('mousemove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = Math.round((e.clientX - r.left) / scale), y = Math.round((e.clientY - r.top) / scale);
    $('#info').textContent = infoText(x, y);
  });
}

// Artist – wspólne: skróty DOM, API, komunikaty, stan edytora, geometria grup, ładowanie scen.

import * as PACK from '/cgpack.js';
import { appendHtml, esc, html, setHtml } from '/dom.js';
import { TYPES, FONTS, OFFLINE_FONTS, ScenePlayer, propAt } from '/renderer.js';
import { choose, confirmBox } from '/native.js';
import { renderAll } from './props.js';
import { setTime } from './timeline.js';
import { resetView } from './canvas.js';
import { buildRefs, queueGuides } from './refs.js';
import { endTextEdit, txEd } from './handles.js';
import { dockPlay, dockPv, setDockPv } from './dock.js';
import { native } from './main.js';

// deklaracje funkcji (nie stałe): moduły z cyklu importów mogą ich użyć, zanim core.js się wykona
export function $(s, r = document) { return r.querySelector(s); }
export function $$(s, r = document) { return [...r.querySelectorAll(s)]; }
export { esc, html };
export async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
let toastT;
export function toast(msg, err) {
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.toggle('err', !!err); el.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(() => (el.style.opacity = 0), 2600);
}
// ------------------------------------------------------------ stan
export let scenes = [], scene = null, selId = null, selMore = [], t = 0, player = null, dirty = false;
export function setScenes(v) { scenes = v; }
export function setScene(v) { scene = v; }
export function setSelId(v) { selId = v; }
export function setSelMore(v) { selMore = v; }
export function setT(v) { t = v; }
export let undo = [], redo = [], selKey = null, selKeys = [], clipKeys = null, pps = 320, assets = [], scale = 1, lastArea = 'canvas', pendingCP = false;
export function setSelKey(v) { selKey = v; }
export function setSelKeys(v) { selKeys = v; }
export function setClipKeys(v) { clipKeys = v; }
export function setPps(v) { pps = v; }
export function setScale(v) { scale = v; }
export function setLastArea(v) { lastArea = v; }
export function setPendingCP(v) { pendingCP = v; }
export const LBL = 190;
export const stage = $('#stage'), box = $('#box');
export function setDirty(d) { dirty = d; $('#bSave').classList.toggle('dirty', d); native.sync(); }
export function checkpoint() {
  undo.push(JSON.stringify(scene)); if (undo.length > 150) undo.shift();
  redo = []; setDirty(true);
}
function restore(json) {
  if (txEd) endTextEdit(false);
  // rev to znacznik zapisu na serwerze, nie treść: cofnięcie po zapisie nie może wrócić do starego (fałszywy konflikt)
  const rev = scene.rev;
  scene = JSON.parse(json);
  if (rev != null) scene.rev = rev; else delete scene.rev;
  if (selId && !locate(selId)) selId = null;
  selMore = selMore.filter((id) => id !== selId && locate(id));
  selKey = null; selKeys = [];
  player.setScene(scene); player.seek(t);
  if (dockPv && !scene.dock?.[dockPv.i]) { setDockPv(null); $('#dockBar').hidden = true; player.setDock(0, 0, 0); buildRefs(); }
  renderAll(); setDirty(true); dockPlay(false);
}
export function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(scene)); restore(undo.pop()); }
export function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(scene)); restore(redo.pop()); }
export function locate(id, nodes = scene.nodes, parent = null) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return { node: n, list: nodes, index: i, parent };
    if (n.children) { const r = locate(id, n.children, n); if (r) return r; }
  }
  return null;
}
export const selNode = () => (selId ? locate(selId)?.node : null);
/** Zablokowany węzeł (sam albo przez zablokowanego przodka) – nie da się go chwycić na kanwie ani przesunąć. */
export function isLocked(id) { let cur = locate(id); while (cur) { if (cur.node.locked) return true; cur = cur.parent ? locate(cur.parent.id) : null; } return false; }
/** Położenie całej sceny (scene.x / scene.y): przesuwa wszystko naraz, bez zmiany kluczy animacji i props węzłów. */
export function setSceneOffset(x, y) {
  x = Math.max(-16384, Math.min(16384, Math.round(x) || 0)); y = Math.max(-16384, Math.min(16384, Math.round(y) || 0));
  if (x) scene.x = x; else delete scene.x;
  if (y) scene.y = y; else delete scene.y;
  player.placeRoot();
  const ix = document.querySelector('[data-sp="x"]'), iy = document.querySelector('[data-sp="y"]');
  if (ix && document.activeElement !== ix) ix.value = x; if (iy && document.activeElement !== iy) iy.value = y;
  const pl = document.querySelector('#tree .item[data-id=""] .off'); if (pl) pl.textContent = x || y ? `${x}, ${y}` : '';
  queueGuides();
}
// ------------------------------------------------------------ geometria (układy grup)
// Dziecko grupy leży względem lewego górnego rogu ramki rodzica (renderer: left = x − przesunięcie punktu zaczepienia);
// obrót i skala rodzica działają wokół środka jego ramki (transform-origin 50% 50%).
export const rnd = (v) => Math.round(v * 100) / 100;
export const num = (n, p) => +propAt(n, p, t, null) || 0;
export const scl = (n) => { const v = +propAt(n, 'scale', t, null); return Number.isFinite(v) ? v : 1; };
/** Przesunięcie lewego górnego rogu ramki względem punktu x / y (punkt zaczepienia). */
export function anchorOff(n, w = num(n, 'w'), h = num(n, 'h')) {
  const ax = propAt(n, 'anchorX', t, null), ay = propAt(n, 'anchorY', t, null);
  return { x: ax === 'right' ? w : ax === 'center' ? w / 2 : 0, y: ay === 'bottom' ? h : ay === 'middle' ? h / 2 : 0 };
}
/** Ramka węzła (lewy górny róg, wymiar) w układzie rodzica, w bieżącym czasie. */
export function boxIn(n) { const a = anchorOff(n); return { x: num(n, 'x') - a.x, y: num(n, 'y') - a.y, w: num(n, 'w'), h: num(n, 'h') }; }
/** Początek układu dzieci węzła id w układzie sceny (null = scena); bez obrotu i skali przodków. */
export function originOf(id) {
  let x = 0, y = 0, cur = id ? locate(id) : null;
  while (cur) { const b = boxIn(cur.node); x += b.x; y += b.y; cur = cur.parent ? locate(cur.parent.id) : null; }
  return { x, y };
}
/** Obrót (°) i skala nadane węzłowi przez przodków – do przeliczenia ruchu myszy na układ rodzica. */
export function parentXf(id) {
  let rot = 0, sc = 1, cur = locate(id); cur = cur?.parent ? locate(cur.parent.id) : null;
  while (cur) { rot += num(cur.node, 'rotation'); sc *= scl(cur.node); cur = cur.parent ? locate(cur.parent.id) : null; }
  return { rot, sc: sc || 1 };
}
/** Wektor (dx, dy) ze sceny do układu o obrocie rot i skali sc. */
export function toLocal(dx, dy, xf) {
  const a = -xf.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [(dx * c - dy * s) / xf.sc, (dx * s + dy * c) / xf.sc];
}
/** Przesuwa węzeł o (dx, dy) razem z kluczami animacji x / y – w każdej chwili wygląda tak samo, tylko przesunięty. */
export function shiftNode(n, dx, dy) {
  for (const [p, d] of [['x', dx], ['y', dy]]) {
    if (!d) continue;
    n.props ||= {}; n.props[p] = rnd((+n.props[p] || 0) + d);
    for (const k of n.anim?.[p] || []) k.v = rnd((+k.v || 0) + d);
  }
}
/** Zaznaczenie: główny węzeł (panel właściwości) + dodatkowe (Ctrl / Shift+klik). */
export const selAll = () => (selId ? [selId, ...selMore.filter((id) => id !== selId)] : []);
/** Edycja wielu zaznaczonych (P8): czy zaznaczono kilka elementów; pozostałe zaznaczone z właściwością p (bez zablokowanych). */
export const multiSel = () => selAll().length > 1;
export function multiOthers(n, p) {
  if (!multiSel()) return [];
  return selAll().filter((id) => id !== n.id && !isLocked(id)).map((id) => locate(id)?.node).filter((m) => m && TYPES[m.type]?.props.includes(p));
}
export const plElem = (k) => (k === 1 ? 'element' : k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14) ? 'elementy' : 'elementów');
/** Zaznaczone bez tych, których przodek też jest zaznaczony (przesuwa się i tak razem z nim). */
export function topSel() {
  const ids = selAll().filter((id) => locate(id));
  return ids.filter((id) => { let cur = locate(id); while (cur?.parent) { if (ids.includes(cur.parent.id)) return false; cur = locate(cur.parent.id); } return true; });
}
/** Wymiar grupy = obrys zawartości (z obrotem i skalą dzieci, także na ujemnych współrzędnych), jak w Viz Artist.
 *  Początek grupy przesuwa się na lewy górny róg zawartości, dzieci o tyle samo w przeciwną stronę – na ekranie nic się nie rusza. */
export function fitGroup(g) {
  if (!g || g.type !== 'group' || !g.children?.length) return false;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const c of g.children) {
    const b = boxIn(c), cx = b.x + b.w / 2, cy = b.y + b.h / 2, sc = scl(c), a = num(c, 'rotation') * Math.PI / 180;
    for (const [px, py] of [[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2], [b.w / 2, b.h / 2], [-b.w / 2, b.h / 2]]) {
      const X = cx + sc * (px * Math.cos(a) - py * Math.sin(a)), Y = cy + sc * (px * Math.sin(a) + py * Math.cos(a));
      x1 = Math.min(x1, X); y1 = Math.min(y1, Y); x2 = Math.max(x2, X); y2 = Math.max(y2, Y);
    }
  }
  const w = Math.round(x2 - x1), h = Math.round(y2 - y1);
  if (!(w > 0 && h > 0)) return false;
  const mx = Math.round(x1), my = Math.round(y1);
  // nowy lewy górny róg L'' = L + M·m + (I − M)(c − c'), M = obrót·skala grupy (wokół środka ramki)
  const old = boxIn(g), sc = scl(g), a = num(g, 'rotation') * Math.PI / 180;
  const M = (x, y) => [sc * (x * Math.cos(a) - y * Math.sin(a)), sc * (x * Math.sin(a) + y * Math.cos(a))];
  const [mmx, mmy] = M(mx, my), dcx = old.w / 2 - w / 2, dcy = old.h / 2 - h / 2, [Mdx, Mdy] = M(dcx, dcy);
  const Lx = old.x + mmx + dcx - Mdx, Ly = old.y + mmy + dcy - Mdy;
  for (const c of g.children) shiftNode(c, -mx, -my);
  const aOld = anchorOff(g), aNew = anchorOff(g, w, h);
  shiftNode(g, rnd(Lx + aNew.x - (old.x + aOld.x)), rnd(Ly + aNew.y - (old.y + aOld.y)));
  g.props ||= {}; g.props.w = w; g.props.h = h;
  if (g.anim?.w?.length || g.anim?.h?.length) toast('Grupa ma animowany wymiar – dopasowano wartość podstawową', true);
  return true;
}
// ------------------------------------------------------------ ładowanie
export async function loadAssets() { assets = await api('GET', '/api/assets').catch(() => []); updateFontList(); }
export const assetFonts = () => assets.filter((a) => PACK.FONT_RE.test(a.name)).map((a) => a.name);
function updateFontList() {
  setHtml($('#fontlist'), [...FONTS, ...assetFonts()].map((f) => html`<option>${f}</option>`));
}
/**
 * Font wpisany ręcznie → nazwa, którą zna renderer: czcionka z zasobów jest rodziną o nazwie pliku, więc „MojaCzcionka”,
 * „mojaczcionka.TTF” albo „Moja Czcionka.ttf” (nazwa sprzed poprawienia przez serwer) wskazują plik `MojaCzcionka.ttf`
 * zamiast szukać kroju w Google Fonts. Wbudowane rodziny dostają kanoniczną pisownię.
 */
export function resolveFont(v) {
  const name = String(v || '').trim(); if (!name) return name;
  const files = assetFonts(), all = [...new Set([...FONTS, ...OFFLINE_FONTS])];
  if (files.includes(name) || all.includes(name)) return name;
  const lc = name.toLowerCase(), safe = (PACK.safeAssetName(name) || '').toLowerCase();
  const stem = (f) => f.replace(PACK.FONT_RE, '').toLowerCase();
  return files.find((f) => f.toLowerCase() === lc || f.toLowerCase() === safe)
    || all.find((f) => f.toLowerCase() === lc)
    || files.find((f) => stem(f) === lc || stem(f) === safe.replace(PACK.FONT_RE, ''))
    || name;
}
// Strony Trio istnieją tylko na serwerze vizrs; praca lokalna (magazyn okna, /api/state → mode: 'local') tworzy same sceny.
export let TRIO = false;
// strony Trio z ostatniego wczytania show – dane celu w podglądzie powiązań
export let trioPages = [];
export async function load() {
  TRIO = (await api('GET', '/api/state').catch(() => null))?.mode !== 'local';
  $('#bDeploy').hidden = TRIO;
  const show = await api('GET', '/api/show');
  scenes = show.scenes;
  trioPages = show.pages || [];
  await loadAssets();
  const want = new URLSearchParams(location.search).get('scene');
  const s = scenes.find((s) => s.id === want) || scenes[0];
  if (s) openScene(s); else newScene('Nowa scena');
}
export function renderSceneSel() {
  setHtml($('#sceneSel'), scenes.map((s) => html`<option value="${s.id}" ${scene && s.id === scene.id ? 'selected' : ''}>${s.name}  ·  ${s.layer || 'main'}</option>`));
}
let who = '';
let lockedScene = null, lockedByOther = null;
async function lockScene(id) {
  if (lockedScene && lockedScene !== id) fetch(`/api/unlock/scenes/${encodeURIComponent(lockedScene)}?who=${encodeURIComponent(who)}`, { method: 'POST' }).catch(() => {});
  lockedScene = id; lockedByOther = null;
  try { await api('POST', `/api/lock/scenes/${encodeURIComponent(id)}?who=${encodeURIComponent(who)}`); }
  catch (e) { if (/^konflikt/.test(e.message)) { lockedByOther = e.message.replace(/^konflikt: edytuje /, '').replace(/ \(.*$/, ''); toast(`Scena jest edytowana przez ${lockedByOther} – zapis może zostać odrzucony`, true); } }
}
export function openScene(s) {
  lockScene(s.id);
  scene = structuredClone(s);
  scene.nodes ||= []; scene.stops ||= []; scene.width ||= 1920; scene.height ||= 1080;
  if (!(scene.duration > 0)) scene.duration = 1;
  selId = null; selMore = []; selKey = null; t = 0; undo = []; redo = [];
  setDirty(false);
  if (txEd) endTextEdit(false);
  player?.destroy();
  setDockPv(null); $('#dockBar').hidden = true;
  player = new ScenePlayer(stage, scene, {}, { editor: true });
  buildRefs();
  history.replaceState(null, '', '?scene=' + encodeURIComponent(s.id));
  resetView(); renderAll();
  // jak w Viz: edycja zaczyna się w pierwszym stop poincie (grafika widoczna)
  setTime([...scene.stops].sort((a, b) => a - b)[0] ?? 0);
}
export async function confirmLeave() {
  if (!dirty) return true;
  const c = await choose(`Scena „${scene.name}” ma niezapisane zmiany.`, { title: 'Zapisać zmiany przed przejściem?', buttons: ['Zapisz', 'Nie zapisuj', 'Anuluj'] });
  if (c === 0) return !!(await save());
  return c === 1;
}
// ostrzeżenie: zapis szablonu, który właśnie jest na antenie (brak odpowiedzi serwera nie blokuje zapisu)
async function confirmOnAir() {
  const st = await api('GET', '/api/state').catch(() => null);
  const air = st?.layers?.filter((l) => l.page?.scene === scene.id).map((l) => l.layer) || [];
  return !air.length || confirmBox(`Scena „${scene.name}” jest teraz na antenie (warstwa: ${air.join(', ')}).`, { title: 'Zapisać zmiany szablonu na antenie?', ok: 'Zapisz' });
}
export async function save(force) {
  try {
    if (force !== true && !(await confirmOnAir())) return false;
    const body = force === true ? (({ rev, ...r }) => r)(scene) : scene; // bez rev = świadome nadpisanie
    const saved = await api('PUT', '/api/scenes/' + encodeURIComponent(scene.id), body);
    scene.rev = saved.rev;
    const i = scenes.findIndex((s) => s.id === saved.id);
    if (i >= 0) scenes[i] = saved; else scenes.push(saved);
    setDirty(false); renderSceneSel(); toast('Zapisano scenę „' + scene.name + '”');
    native.clearDraft(); native.sync();
    return true;
  } catch (e) {
    if (/^konflikt/.test(e.message)) {
      if (await confirmBox('Ta scena została zmieniona przez kogoś innego (lub w innym oknie).', { title: 'Nadpisać scenę swoją wersją?', ok: 'Nadpisz', cancel: 'Nie zapisuj' })) return save(true);
      toast('Konflikt zapisu – scena nie zapisana', true);
    } else toast('Błąd zapisu: ' + e.message, true);
    return false;
  }
}
export async function newScene(name, base) {
  const s = base || { name, layer: 'main', width: 1920, height: 1080, duration: 1, stops: [], nodes: [] };
  s.id = '';
  try {
    const saved = await api('POST', '/api/scenes', s);
    scenes.push(saved); renderSceneSel(); openScene(saved);
  } catch (e) { toast(e.message, true); }
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  setHtml($('#fontlist'), FONTS.map((f) => html`<option>${f}</option>`));
  appendHtml($('#addSel'), Object.entries(TYPES).map(([k, v]) => html`<option value="${k}">${v.icon} ${v.label}</option>`));
  try { who = localStorage.getItem('vizrs.who') || ''; } catch { /* brak localStorage */ }
  if (!who) { who = 'Operator ' + Math.floor(10 + Math.random() * 90); try { localStorage.setItem('vizrs.who', who); } catch { /* ignoruj */ } }
  setInterval(() => { if (lockedScene && !lockedByOther) api('POST', `/api/lock/scenes/${encodeURIComponent(lockedScene)}?who=${encodeURIComponent(who)}`).catch(() => {}); }, 15000);
  addEventListener('pagehide', () => { if (lockedScene && !lockedByOther) navigator.sendBeacon(`/api/unlock/scenes/${encodeURIComponent(lockedScene)}?who=${encodeURIComponent(who)}`); });
}

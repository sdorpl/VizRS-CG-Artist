// Artist – uchwyty, wyrównywanie, menu kontekstowe kanwy i schowek, edycja tekstu na kanwie, zaznaczanie ramką.

import { html, setHtml } from '/dom.js';
import { TYPES, propAt } from '/renderer.js';
import { $, $$, anchorOff, checkpoint, esc, isLocked, locate, num, originOf, parentXf, plElem, player, save, scale, scene, scl, selAll, selId, selNode, setLastArea, setSelId, setSelMore, shiftNode, stage, t, toLocal, toast, topSel } from './core.js';
import { renderProps, renderTree, syncProps } from './props.js';
import { renderTimeline, tlAction } from './timeline.js';
import { refresh, setProp } from './edit.js';
import { cloneNode, select, treeOp } from './tree.js';
import { cut, cv, drawGuides, fit, resetView } from './canvas.js';
import { drawnRects, queueGuides, rf, snapEdges, snapEnd, toggleRefs } from './refs.js';
import { dockPv, drawnBox, drawnClientRects, drawsNode, hitNode, inR, ownNode, sceneRect, shownEl, unionRect, updateSel } from './dock.js';

// ------------------------------------------------------------ uchwyty: rozmiar z każdego rogu i boku, obrót (K2)
// Renderer: x / y – punkt zaczepienia, obrót i skala wokół środka ramki. Przy zmianie rozmiaru przeciwległy róg / bok stoi
// w miejscu (także element obrócony i w obróconej grupie): środek ramki liczony od punktu stałego. Shift – proporcje
// (bok z Shift – druga oś od środka), Alt – od środka. Jedno przeciągnięcie = jeden krok cofania.
export function resizeDrag(n, h, e) {
  const el = stage.querySelector(`[data-id="${CSS.escape(n.id)}"]`);
  const sxk = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, syk = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
  const pxf = parentXf(n.id), rot = num(n, 'rotation') * Math.PI / 180, sc = scl(n) || 1;
  const xf = { rot: pxf.rot + num(n, 'rotation'), sc: pxf.sc * sc };
  let w0 = num(n, 'w'), h0 = num(n, 'h');
  if (!(w0 > 0)) w0 = el?.offsetWidth || 0;
  if (!(h0 > 0)) h0 = el?.offsetHeight || 0;
  const x0 = num(n, 'x'), y0 = num(n, 'y'), an = anchorOff(n, 1, 1), tp = TYPES[n.type]?.props || [];
  const rs = (u, v) => [(u * Math.cos(rot) - v * Math.sin(rot)) * sc, (u * Math.sin(rot) + v * Math.cos(rot)) * sc];
  const cx0 = x0 - an.x * w0 + w0 / 2, cy0 = y0 - an.y * h0 + h0 / 2;
  const sx = e.clientX, sy = e.clientY;
  // przyciąganie krawędzi – gdy ramka jest osiowa (bez obrotu własnego i przodków)
  const axial = Math.abs(((xf.rot % 360) + 360) % 360) < 0.01, bb0 = axial && el ? sceneRect(el) : null;
  snapEdges.moving = el ? [el] : [];
  let moved = false;
  const mv = (ev) => {
    if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
    if (!moved) { checkpoint(); moved = true; }
    let ex = (ev.clientX - sx) / scale, ey = (ev.clientY - sy) / scale;
    if (bb0) [ex, ey] = snapEdges(bb0, ex, ey, sxk, syk, ev);
    const [dx, dy] = toLocal(ex, ey, xf);
    const k2 = ev.altKey ? 2 : 1;
    let w1 = w0 + sxk * dx * k2, h1 = h0 + syk * dy * k2;
    if (ev.shiftKey && w0 > 0 && h0 > 0) {
      const k = sxk && syk ? Math.max(w1 / w0, h1 / h0) : sxk ? w1 / w0 : h1 / h0;
      w1 = w0 * k; h1 = h0 * k;
    }
    w1 = Math.max(1, Math.round(w1)); h1 = Math.max(1, Math.round(h1));
    // punkt stały: przeciwległy róg / bok; Alt – środek; oś bez uchwytu – punkt zaczepienia (Shift – środek)
    const fx = ev.altKey ? 0.5 : sxk === 1 ? 0 : sxk === -1 ? 1 : ev.shiftKey ? 0.5 : an.x;
    const fy = ev.altKey ? 0.5 : syk === 1 ? 0 : syk === -1 ? 1 : ev.shiftKey ? 0.5 : an.y;
    const [ox0, oy0] = rs((fx - 0.5) * w0, (fy - 0.5) * h0), [ox1, oy1] = rs((fx - 0.5) * w1, (fy - 0.5) * h1);
    const cx1 = cx0 + ox0 - ox1, cy1 = cy0 + oy0 - oy1;
    if (tp.includes('w')) setProp(n, 'w', w1);
    if (tp.includes('h')) setProp(n, 'h', h1);
    setProp(n, 'x', Math.round((cx1 + an.x * w1 - w1 / 2) * 100) / 100);
    setProp(n, 'y', Math.round((cy1 + an.y * h1 - h1 / 2) * 100) / 100);
    refresh(); syncProps(); drawGuides();
  };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); snapEnd(); if (moved) { renderTimeline(); updateSel(); } };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
/** Kilka zaznaczonych: wspólna ramka (obrys osiowy), skalowanie względem przeciwległego rogu / boku (Alt – środka), Shift – proporcje.
 *  Każdy element: środek ramki skaluje się względem punktu stałego, ramka (w / h) – o współczynnik osi (obrót 90° – osie
 *  zamienione, inny kąt – średnia); tekst – ramka, nie czcionka; grupy i typy bez w / h – tylko położenie. Jeden krok cofania. */
export function multiResize(h, e) {
  const ids = topSel().filter((id) => !isLocked(id)); if (!ids.length) return;
  const els = ids.map((id) => stage.querySelector(`[data-id="${CSS.escape(id)}"]`));
  const bb = drawnBox(els, ownNode) || unionRect(els); if (!bb) return;
  const sxk = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, syk = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
  const W0 = Math.max(1, bb.x2 - bb.x1), H0 = Math.max(1, bb.y2 - bb.y1);
  const items = ids.map((id, i) => {
    const m = locate(id).node, el = els[i], r = el ? sceneRect(el) : null, pxf = parentXf(id), tp = TYPES[m.type]?.props || [];
    let w0 = num(m, 'w'), h0 = num(m, 'h');
    if (!(w0 > 0)) w0 = el?.offsetWidth || 0;
    if (!(h0 > 0)) h0 = el?.offsetHeight || 0;
    const rot = (pxf.rot + num(m, 'rotation')) * Math.PI / 180, k = pxf.sc * (scl(m) || 1);
    return { m, pxf, tp, w0, h0, rot, k, an: anchorOff(m, 1, 1), x0: num(m, 'x'), y0: num(m, 'y'), size: m.type !== 'group' && tp.includes('w'),
      C: r ? [(r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2] : null, q: ((((pxf.rot + num(m, 'rotation')) % 180) + 180) % 180) };
  }).filter((it) => it.C);
  const sx = e.clientX, sy = e.clientY;
  snapEdges.moving = els.filter(Boolean);
  let moved = false;
  const mv = (ev) => {
    if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
    if (!moved) { checkpoint(); moved = true; }
    let [ex, ey] = snapEdges(bb, (ev.clientX - sx) / scale, (ev.clientY - sy) / scale, sxk, syk, ev);
    const k2 = ev.altKey ? 2 : 1;
    let fX = sxk ? (W0 + sxk * ex * k2) / W0 : 1, fY = syk ? (H0 + syk * ey * k2) / H0 : 1;
    if (ev.shiftKey) { const f = sxk && syk ? Math.max(fX, fY) : sxk ? fX : fY; fX = fY = f; }
    fX = Math.max(0.01, fX); fY = Math.max(0.01, fY);
    const frx = ev.altKey || !sxk ? 0.5 : sxk === 1 ? 0 : 1, fry = ev.altKey || !syk ? 0.5 : syk === 1 ? 0 : 1;
    const Fx = bb.x1 + frx * W0, Fy = bb.y1 + fry * H0;
    for (const it of items) {
      const [sw, sh] = it.q < 0.5 || it.q > 179.5 ? [fX, fY] : Math.abs(it.q - 90) < 0.5 ? [fY, fX] : [Math.sqrt(fX * fY), Math.sqrt(fX * fY)];
      const w1 = it.size ? Math.max(1, Math.round(it.w0 * sw)) : it.w0, h1 = it.size && it.tp.includes('h') ? Math.max(1, Math.round(it.h0 * sh)) : it.h0;
      const rs = (u, v) => [(u * Math.cos(it.rot) - v * Math.sin(it.rot)) * it.k, (u * Math.sin(it.rot) + v * Math.cos(it.rot)) * it.k];
      const C1 = [Fx + (it.C[0] - Fx) * fX, Fy + (it.C[1] - Fy) * fY];
      const p0 = rs((it.an.x - 0.5) * it.w0, (it.an.y - 0.5) * it.h0), p1 = rs((it.an.x - 0.5) * w1, (it.an.y - 0.5) * h1);
      const [lx, ly] = toLocal(C1[0] + p1[0] - it.C[0] - p0[0], C1[1] + p1[1] - it.C[1] - p0[1], it.pxf);
      if (it.size) { setProp(it.m, 'w', w1); if (it.tp.includes('h')) setProp(it.m, 'h', h1); }
      setProp(it.m, 'x', Math.round((it.x0 + lx) * 100) / 100); setProp(it.m, 'y', Math.round((it.y0 + ly) * 100) / 100);
    }
    refresh(); syncProps(); drawGuides();
  };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); snapEnd(); if (moved) { renderTimeline(); updateSel(); } };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
/** Obrót wokół środka ramki (jak w rendererze); Shift – co 15°. */
export function rotateDrag(n, e) {
  const el = stage.querySelector(`[data-id="${CSS.escape(n.id)}"]`); if (!el) return;
  const rc = el.getBoundingClientRect(), cx = (rc.left + rc.right) / 2, cy = (rc.top + rc.bottom) / 2;
  const r0 = num(n, 'rotation'), a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
  let moved = false;
  const mv = (ev) => {
    if (!moved) { checkpoint(); moved = true; }
    let r = r0 + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
    r = ((r + 180) % 360 + 360) % 360 - 180;
    r = ev.shiftKey ? Math.round(r / 15) * 15 : Math.round(r * 10) / 10;
    setProp(n, 'rotation', r); refresh(); syncProps(); updateSel();
  };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved) renderTimeline(); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
// ------------------------------------------------------------ wyrównaj i rozmieść zaznaczone (K3)
// Obrysy jak przy chwytaniu (drawnBox – pojemniki bez wypełnienia nie liczą się), przesunięcie przez układ rodzica każdego
// elementu razem z kluczami x / y (shiftNode – jak „Położenie względem innej sceny”). Odniesienie: obrys zaznaczenia,
// element kluczowy (główny zaznaczony – pełna ramka), kadr, obszar grafiki EBU R 95 (90%). Jedna operacja = jeden krok cofania.
const AL_NEED = { dx: 3, dy: 3, row: 2, col: 2, mw: 2, mh: 2 };
export function syncAlignBar() {
  const b = $('#alignBar'), k = selAll().filter((id) => !isLocked(id)).length;
  b.hidden = !k || !!dockPv?.set;
  if (b.hidden) return;
  const ref = $('#alRef');
  if (k < 2 && (ref.value === 'sel' || ref.value === 'key')) ref.value = 'frame';
  for (const o of ref.options) o.disabled = k < 2 && (o.value === 'sel' || o.value === 'key');
  for (const x of $$('[data-al]', b)) x.disabled = k < (AL_NEED[x.dataset.al] || 1);
}
function alignOp(op) {
  const ids = topSel().filter((id) => !isLocked(id));
  const items = ids.map((id) => { const el = stage.querySelector(`[data-id="${CSS.escape(id)}"]`); return { id, n: locate(id).node, r: el && (drawnBox([el], ownNode) || unionRect([el])) }; }).filter((x) => x.r);
  if (!items.length) { toast('Zaznaczone elementy nie są widoczne w bieżącym czasie', true); return; }
  const W = scene.width, H = scene.height, refK = $('#alRef').value;
  const uni = items.reduce((u, { r }) => ({ x1: Math.min(u.x1, r.x1), y1: Math.min(u.y1, r.y1), x2: Math.max(u.x2, r.x2), y2: Math.max(u.y2, r.y2) }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
  const keyIt = items.find((x) => x.id === selId) || items[0];
  const R = refK === 'frame' ? { x1: 0, y1: 0, x2: W, y2: H } : refK === 'safe' ? { x1: W * 0.05, y1: H * 0.05, x2: W * 0.95, y2: H * 0.95 } : refK === 'key' ? keyIt.r : uni;
  const moves = new Map(); // id → [dx, dy] w px kadru
  const mv = (it, dx, dy) => { if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) moves.set(it.id, [dx, dy]); };
  const cx = (r) => (r.x1 + r.x2) / 2, cy = (r) => (r.y1 + r.y2) / 2;
  const others = refK === 'key' ? items.filter((x) => x !== keyIt) : items;
  if (op === 'l') for (const it of others) mv(it, R.x1 - it.r.x1, 0);
  else if (op === 'r') for (const it of others) mv(it, R.x2 - it.r.x2, 0);
  else if (op === 'cx') for (const it of others) mv(it, cx(R) - cx(it.r), 0);
  else if (op === 't') for (const it of others) mv(it, 0, R.y1 - it.r.y1);
  else if (op === 'b') for (const it of others) mv(it, 0, R.y2 - it.r.y2);
  else if (op === 'cy') for (const it of others) mv(it, 0, cy(R) - cy(it.r));
  else if (op === 'dx' || op === 'dy') {
    const hz = op === 'dx', a1 = hz ? 'x1' : 'y1', a2 = hz ? 'x2' : 'y2';
    const so = [...items].sort((p, q) => (p.r[a1] + p.r[a2]) - (q.r[a1] + q.r[a2]));
    const span = so[so.length - 1].r[a2] - so[0].r[a1], sum = so.reduce((t0, it) => t0 + it.r[a2] - it.r[a1], 0), g = (span - sum) / (so.length - 1);
    let pos = so[0].r[a1];
    for (const it of so) { const d = pos - it.r[a1]; mv(it, hz ? d : 0, hz ? 0 : d); pos += it.r[a2] - it.r[a1] + g; }
  } else if (op === 'row' || op === 'col') {
    const hz = op === 'row', a1 = hz ? 'x1' : 'y1', a2 = hz ? 'x2' : 'y2', g = +$('#alGap').value || 0;
    const so = [...items].sort((p, q) => p.r[a1] - q.r[a1]);
    let pos = so[0].r[a1];
    for (const it of so) { const d = pos - it.r[a1]; mv(it, hz ? d : 0, hz ? 0 : d); pos += it.r[a2] - it.r[a1] + g; }
  } else if (op === 'mw' || op === 'mh') {
    const p = op === 'mw' ? 'w' : 'h', target = op === 'mw' ? keyIt.r.x2 - keyIt.r.x1 : keyIt.r.y2 - keyIt.r.y1;
    const bad = [];
    checkpoint();
    for (const it of items) {
      if (it === keyIt) continue;
      const xf = parentXf(it.id), rot = ((xf.rot + num(it.n, 'rotation')) % 180 + 180) % 180;
      if (!TYPES[it.n.type]?.props.includes(p) || it.n.type === 'group' || (rot > 0.01 && rot < 179.99)) { bad.push(it.n.name || it.n.type); continue; }
      setProp(it.n, p, Math.max(1, Math.round(target / (xf.sc * (scl(it.n) || 1)))));
    }
    refresh(); syncProps(); renderTimeline(); updateSel();
    toast(bad.length ? `Pominięte (obrót, grupa albo brak ${p === 'w' ? 'szerokości' : 'wysokości'}): ${bad.join(', ')}` : `${p === 'w' ? 'Szerokość' : 'Wysokość'} jak „${keyIt.n.name || keyIt.n.type}”`, !!bad.length);
    return;
  }
  if (!moves.size) { toast('Już wyrównane'); return; }
  checkpoint();
  for (const [id, [dx, dy]] of moves) { const [lx, ly] = toLocal(dx, dy, parentXf(id)); shiftNode(locate(id).node, lx, ly); }
  refresh(); syncProps(); renderTimeline(); updateSel();
}
// ------------------------------------------------------------ menu kontekstowe kanwy i schowek elementów (K4)
// Prawy klik na elemencie (zaznacza go, jeśli nie był) albo na pustym miejscu. Schowek elementów: localStorage okna
// (`vizrs.clipNodes`) – działa między scenami i oknami; wklejenie w korzeń sceny w tym samym miejscu na ekranie
// (położenie grupy nadrzędnej doliczone, bez jej obrotu i skali), w tej samej scenie – przesunięte o 20 px.
export function copyNodes(cut) {
  const ids = topSel(); if (!ids.length) return;
  const nodes = ids.map((id) => { const L = locate(id), o = originOf(L.parent?.id || null); return { node: structuredClone(L.node), ox: o.x, oy: o.y }; });
  try { localStorage.setItem('vizrs.clipNodes', JSON.stringify({ scene: scene.id, nodes })); } catch { toast('Schowek: za dużo danych', true); return; }
  if (cut) {
    if (ids.some(isLocked)) { toast('Element jest zablokowany – nie można wyciąć', true); return; }
    treeOp('del'); toast(`Wycięto: ${ids.length} ${plElem(ids.length)}`);
  } else toast(`Skopiowano: ${ids.length} ${plElem(ids.length)}`);
}
export function pasteNodes() {
  let clip = null;
  try { clip = JSON.parse(localStorage.getItem('vizrs.clipNodes') || 'null'); } catch { /* uszkodzony wpis */ }
  if (!clip?.nodes?.length) { toast('Schowek elementów jest pusty', true); return; }
  checkpoint();
  const same = clip.scene === scene.id, ids = [];
  for (const { node, ox, oy } of clip.nodes) {
    const c = cloneNode(node);
    if (same && !/_kopia$/.test(c.name || '')) c.name = (c.name || c.type) + '_kopia';
    shiftNode(c, (+ox || 0) + (same ? 20 : 0), (+oy || 0) + (same ? 20 : 0));
    scene.nodes.push(c); ids.push(c.id);
  }
  setSelId(ids[0]); setSelMore(ids.slice(1));
  player.setScene(scene); player.seek(t);
  renderTree(); renderProps(); renderTimeline();
  toast(`Wklejono: ${ids.length} ${plElem(ids.length)}`);
}
const hasClip = () => { try { return !!JSON.parse(localStorage.getItem('vizrs.clipNodes') || 'null')?.nodes?.length; } catch { return false; } };
export function selectAllNodes() { const ids = scene.nodes.map((n) => n.id).filter((id) => !isLocked(id)); select(ids[0], ids.slice(1)); }
/** Kolejność warstw zaznaczonych w ich listach: front / back – na wierzch / na spód (koniec listy rysuje się na wierzchu). */
function zOrder(op) {
  const ids = topSel(); if (!ids.length) return;
  if (op === 'up' || op === 'down') { treeOp(op === 'up' ? 'down' : 'up'); return; }
  checkpoint();
  const nodes = ids.map((id) => locate(id).node);
  for (const n of op === 'front' ? nodes : [...nodes].reverse()) {
    const L = locate(n.id); L.list.splice(L.index, 1);
    if (op === 'front') L.list.push(n); else L.list.unshift(n);
  }
  player.setScene(scene); player.seek(t); renderTree(); renderTimeline(); updateSel();
}
function toggleFlag(k) {
  const ns = topSel().map((id) => locate(id).node); if (!ns.length) return;
  checkpoint();
  const on = !ns.every((n) => n[k]);
  for (const n of ns) { if (on) n[k] = true; else delete n[k]; }
  refresh(); renderTree(); updateSel();
  toast(`${k === 'locked' ? (on ? 'Zablokowano' : 'Odblokowano') : (on ? 'Ukryto' : 'Pokazano')}: ${ns.length} ${plElem(ns.length)}`);
}
/** Elementy rysujące pod kursorem (od wierzchu) – także zasłonięte. */
function nodesAt(x, y) {
  const out = [];
  for (const e of document.elementsFromPoint(x, y)) {
    const el = e.closest?.('.vz-node');
    if (!el || !stage.contains(el) || out.includes(el.dataset.id) || !shownEl(el)) continue;
    const n = locate(el.dataset.id)?.node;
    if (!drawsNode(n) || !drawnClientRects(el, n).some((r) => inR(r, x, y))) continue;
    out.push(el.dataset.id);
  }
  return out;
}
function ctxMenu(e) {
  const m = $('#ctxMenu'), hit = hitNode(e.clientX, e.clientY);
  if (hit && !selAll().includes(hit.dataset.id)) select(hit.dataset.id);
  const k = topSel().length, n = selNode(), under = nodesAt(e.clientX, e.clientY);
  const b = (act, label, key = '', off = false) => html`<button data-cx="${act}" ${off ? 'disabled' : ''}><span>${label}</span>${key ? html`<kbd>${key}</kbd>` : ''}</button>`;
  const nm = (id) => locate(id)?.node.name || locate(id)?.node.type || id;
  let h = '';
  if (hit && k) {
    const P = n && locate(n.id)?.parent;
    h = html`${h}${b('dup', 'Duplikuj', 'Ctrl+D')}${b('copy', 'Kopiuj', 'Ctrl+C')}${b('cut', 'Wytnij', 'Ctrl+X')}${b('paste', 'Wklej', 'Ctrl+V', !hasClip())}${b('del', 'Usuń', 'Del')}${html`<hr>`}${b('group', 'Grupuj', 'Ctrl+G', k < 2)}${b('ungroup', 'Rozgrupuj', 'Ctrl+Shift+G', !(k === 1 && n?.type === 'group'))}${html`<hr>`}${html`<div class="h4">Kolejność</div>`}${b('front', 'Na wierzch')}${b('zup', 'Wyżej')}${b('zdown', 'Niżej')}${b('back', 'Na spód')}${html`<hr>`}${html`<div class="h4">Wyrównaj (pasek: względem)</div>`}${b('al:l', 'Lewe krawędzie')}${b('al:cx', 'Środki w poziomie')}${b('al:r', 'Prawe krawędzie')}${b('al:t', 'Górne krawędzie')}${b('al:cy', 'Środki w pionie')}${b('al:b', 'Dolne krawędzie')}${html`<hr>`}${b('lock', 'Zablokuj / odblokuj')}${b('hide', 'Ukryj / pokaż')}${b('parent', P ? `Zaznacz grupę „${nm(P.id)}”` : 'Zaznacz grupę nadrzędną', 'dwuklik', !P)}${b('tree', 'Pokaż w drzewie')}`;
    if (under.length > 1) h = html`${h}${html`<hr><div class="h4">Zaznacz pod kursorem</div>`}${under.map((id) => b('pick:' + id, (id === selId ? '● ' : '') + nm(id)))}`;
  } else {
    h = html`${h}${b('paste', 'Wklej', 'Ctrl+V', !hasClip())}${b('all', 'Zaznacz wszystko', 'Ctrl+A', !scene.nodes.length)}${html`<hr>`}${b('guides', cv.show ? 'Ukryj prowadnice' : 'Pokaż prowadnice')}${b('refs', rf.on ? 'Ukryj sceny odniesienia' : 'Pokaż sceny odniesienia', 'Shift+R')}${b('fit', 'Dopasuj widok', 'Shift+1')}${html`<hr>`}${b('scene', 'Ustawienia sceny')}`;
  }
  setHtml(m, h); m.hidden = false;
  const W = innerWidth, H = innerHeight, r = m.getBoundingClientRect();
  m.style.left = Math.min(e.clientX, W - r.width - 4) + 'px'; m.style.top = Math.min(e.clientY, H - r.height - 4) + 'px';
}
export const ctxClose = () => { $('#ctxMenu').hidden = true; };
// ------------------------------------------------------------ edycja tekstu na kanwie (K5)
// Dwuklik w zaznaczony tekst albo Enter: pole w miejscu napisu (czcionka, rozmiar, grubość, wyrównanie, kolor, obrót
// własny i grup – jak ramka zaznaczenia), napis renderera ukryty na czas edycji. Tekst surowy: [[wyróżnienie]], nowe
// wiersze i składnia cyklu zostają bez zmian. Ctrl+Enter albo klik obok – zatwierdza (jeden krok cofania), Esc – anuluje.
// Element z polem kontrolnym: edytuje się wartość domyślna (w Trio – wartość strony).
export let txEd = null;
 // { n, el, ta, info, v0 }
export function startTextEdit(n) {
  if (txEd) endTextEdit(true);
  if (!n || n.type !== 'text' || isLocked(n.id)) return false;
  const el = stage.querySelector(`[data-id="${CSS.escape(n.id)}"]`); if (!el || !shownEl(el)) return false;
  const b = $('#box').getBoundingClientRect(), r = el.getBoundingClientRect(), xf = parentXf(n.id);
  const k = scale * xf.sc * (scl(n) || 1), rot = xf.rot + num(n, 'rotation');
  const w = Math.max(40, el.offsetWidth * k), h = Math.max(20, el.offsetHeight * k), cx = (r.left + r.right) / 2 - b.left, cy = (r.top + r.bottom) / 2 - b.top;
  const p = (x) => propAt(n, x, t, null), ta = document.createElement('textarea');
  ta.id = 'txEdit'; ta.spellcheck = true; ta.lang = 'pl';
  ta.value = String(p('text') ?? '');
  const fs = Math.max(4, (+p('size') || 48) * k);
  Object.assign(ta.style, {
    left: cx - w / 2 + 'px', top: cy - h / 2 + 'px', width: w + 'px', minHeight: '0', height: h + 'px', transform: rot ? `rotate(${rot}deg)` : '',
    font: `${p('italic') ? 'italic ' : ''}${p('weight') || 700} ${fs}px "${p('font') || 'Inter'}", sans-serif`, lineHeight: String(+p('lineHeight') || 1.15),
    textAlign: p('align') || 'left', color: /^#|^rgb/.test(String(p('color'))) ? p('color') : '#ffffff', textTransform: p('upper') ? 'uppercase' : 'none',
  });
  const info = document.createElement('span');
  info.id = 'txEditInfo';
  info.textContent = `${n.fields?.text ? `pole „${n.fields.text}” – wartość domyślna · ` : ''}Ctrl+Enter – zatwierdź · Esc – anuluj`;
  Object.assign(info.style, { left: r.left - b.left + 'px', top: Math.max(0, r.top - b.top - 18) + 'px' });
  $('#box').append(ta, info);
  el.classList.add('vz-editing');
  // wyrównanie w pionie jak w rendererze (valign): odstęp u góry pola
  const va = p('valign') || 'middle';
  const fit = () => {
    ta.style.paddingTop = '0px'; ta.style.height = '0px';
    const sh = ta.scrollHeight, pad = Math.max(0, h - sh) * (va === 'middle' ? 0.5 : va === 'bottom' ? 1 : 0);
    ta.style.paddingTop = pad + 'px'; ta.style.height = Math.max(h, sh + pad) + 'px';
  };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); endTextEdit(false); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); endTextEdit(true); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); endTextEdit(true); save(); }
  });
  ta.addEventListener('blur', () => { if (txEd?.ta === ta) endTextEdit(true); });
  ta.addEventListener('mousedown', (e) => e.stopPropagation());
  txEd = { n, el, ta, info, v0: ta.value };
  updateSel(); fit(); ta.focus(); ta.select();
  return true;
}
export function endTextEdit(commit) {
  const ed = txEd; if (!ed) return;
  txEd = null;
  ed.el.classList.remove('vz-editing'); ed.ta.remove(); ed.info.remove();
  if (commit && ed.ta.value !== ed.v0 && locate(ed.n.id)) {
    checkpoint(); setProp(ed.n, 'text', ed.ta.value); refresh(); syncProps(); renderTimeline();
  }
  updateSel(); queueGuides();
}
// ------------------------------------------------------------ zaznaczanie ramką (K1)
// Przeciągnięcie od pustego miejsca kanwy: ramka zaznacza elementy, które coś rysują (jak chwytanie klikiem – pojemniki
// bez wypełnienia nie), przecinane przez ramkę; Alt – tylko całe w ramce. Shift / Ctrl – dodaje do zaznaczenia,
// Ctrl+Shift – odejmuje. Zablokowane i niewidoczne pomija. Klik bez ruchu – odznacza (ustawienia sceny).
// Całą scenę przesuwa przytrzymany S + przeciągnięcie.
export let sHeld = false;
const setSHeld = (v) => { if (sHeld !== v) { sHeld = v; $('#box').classList.toggle('smove', v); } };
export function marquee(e) {
  const sub = (e.ctrlKey || e.metaKey) && e.shiftKey, add = !sub && (e.shiftKey || e.ctrlKey || e.metaKey);
  const base = add || sub ? selAll() : [];
  const sx = e.clientX, sy = e.clientY, bx = $('#box').getBoundingClientRect(), st0 = stage.getBoundingClientRect(), mq = $('#marq');
  const cands = drawnRects(stage, ownNode, t).filter((c) => !isLocked(c.id));
  let moved = false, last = null;
  const mv = (ev) => {
    if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
    moved = true;
    const x1 = Math.min(sx, ev.clientX), y1 = Math.min(sy, ev.clientY), x2 = Math.max(sx, ev.clientX), y2 = Math.max(sy, ev.clientY);
    Object.assign(mq.style, { left: x1 - bx.left + 'px', top: y1 - bx.top + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' }); mq.hidden = false;
    const a = { x1: (x1 - st0.left) / scale, y1: (y1 - st0.top) / scale, x2: (x2 - st0.left) / scale, y2: (y2 - st0.top) / scale };
    const hit = cands.filter(({ r }) => (ev.altKey ? r.x1 >= a.x1 && r.x2 <= a.x2 && r.y1 >= a.y1 && r.y2 <= a.y2 : r.x1 < a.x2 && r.x2 > a.x1 && r.y1 < a.y2 && r.y2 > a.y1)).map((c) => c.id);
    const ids = sub ? base.filter((id) => !hit.includes(id)) : [...new Set([...base, ...hit])];
    const k = ids.join(',');
    if (k !== last) { last = k; select(ids[0], ids.slice(1)); }
  };
  const up = () => {
    removeEventListener('mousemove', mv); removeEventListener('mouseup', up); mq.hidden = true;
    if (!moved && !add && !sub && selId) select(null);
  };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  $('#alignBar').addEventListener('mousedown', (e) => e.stopPropagation());
  $('#alignBar').addEventListener('click', (e) => { const b = e.target.closest('[data-al]'); if (b && !b.disabled) alignOp(b.dataset.al); });
  $('#box').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.vpop, #alignBar, #dockBar')) return;
    e.preventDefault(); setLastArea('canvas'); ctxMenu(e);
  });
  $('#ctxMenu').addEventListener('mousedown', (e) => e.stopPropagation());
  $('#ctxMenu').addEventListener('click', (e) => {
    const a = e.target.closest('[data-cx]')?.dataset.cx; if (!a || e.target.closest('[data-cx]').disabled) return;
    ctxClose();
    if (a.startsWith('tl:')) { tlAction(a); return; }
    if (a.startsWith('pick:')) { select(a.slice(5)); return; }
    if (a.startsWith('al:')) { alignOp(a.slice(3)); return; }
    ({
      dup: () => treeOp('dup'), copy: () => copyNodes(false), cut: () => copyNodes(true), paste: pasteNodes, del: () => treeOp('del'),
      group: () => treeOp('group'), ungroup: () => treeOp('ungroup'), front: () => zOrder('front'), back: () => zOrder('back'), zup: () => zOrder('up'), zdown: () => zOrder('down'),
      lock: () => toggleFlag('locked'), hide: () => toggleFlag('hidden'), parent: () => { const P = locate(selId)?.parent; if (P) select(P.id); },
      tree: () => { const it = $(`#tree .item[data-id="${CSS.escape(selId || '')}"]`); it?.scrollIntoView({ block: 'center' }); it?.animate([{ background: 'var(--acc)' }, { background: '' }], 700); },
      all: selectAllNodes, guides: () => $('#bSafe').click(), refs: toggleRefs, fit: resetView, scene: () => select(null),
    })[a]?.();
  });
  addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxMenu')) ctxClose(); }, true);
  addEventListener('blur', ctxClose);
  addEventListener('keydown', (e) => {
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) setSHeld(true);
  });
  addEventListener('keyup', (e) => { if (e.key === 's' || e.key === 'S') setSHeld(false); });
  addEventListener('blur', () => setSHeld(false));
}

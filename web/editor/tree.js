// Artist – drzewo sceny: rysowanie, dodawanie elementów, kolejność, grupy.

import { TYPES, walk, listFields, uid } from '/renderer.js';
import { confirmBox, promptBox } from '/native.js';
import { $, $$, boxIn, checkpoint, fitGroup, isLocked, locate, num, player, scene, scl, selAll, selId, selKey, setLastArea, setSelId, setSelKey, setSelKeys, setSelMore, shiftNode, t, toast, topSel, undo } from './core.js';
import { renderProps, renderTree } from './props.js';
import { renderTimeline } from './timeline.js';
import { refresh } from './edit.js';
import { togglePop } from './canvas.js';
import { moveNode } from './treedrag.js';

// ------------------------------------------------------------ drzewo
export function select(id, more = []) {
  setSelId(id || null); setSelMore(selId ? more.filter((x) => x !== selId) : []);
  if (selKey && selKey.node.id !== selId) { setSelKey(null); setSelKeys([]); }
  renderTree(); renderProps(); renderTimeline();
}
const DEFAULTS = {
  group: { w: 600, h: 200 },
  rect: { w: 400, h: 100, color: '#e30613' },
  ellipse: { w: 200, h: 200, color: '#3d8bfd' },
  text: { w: 800, h: 100, text: 'Nowy tekst', size: 64, color: '#ffffff', font: 'Inter', textFit: 'squeeze', squeezeMin: 0.6 },
  image: { w: 400, h: 300 },
  qr: { w: 240, h: 240, text: 'https://example.com', color: '#000000', qrBg: '#ffffff' },
  clock: { w: 300, h: 80, size: 48, color: '#ffffff', font: 'Roboto Mono', align: 'center' },
  ticker: { w: 1920, h: 70, text: 'Pierwsza wiadomość\nDruga wiadomość', size: 32, color: '#ffffff' },
};
/** Presety tickerów: grupa z tłem i węzłem ticker z polem `news`. */
const TICKER_PRESETS = {
  full: { name: 'Ticker pełny ekran (crawl)', g: { x: 0, y: 1010, w: 1920, h: 70 }, nodes: [
    { type: 'rect', name: 'tlo', props: { x: 0, y: 0, w: 1920, h: 70, color: '#0b1a33' } },
    { type: 'rect', name: 'linia', props: { x: 0, y: 0, w: 1920, h: 3, color: '#e30613' } },
    { type: 'ticker', name: 'ticker', field: 'news', props: { x: 0, y: 3, w: 1920, h: 67, tickerMode: 'crawl', label: 'INFO', catW: 180, catBg: '#e30613', sepStyle: 'dot', speed: 140, size: 34, weight: '600', upper: true, font: 'Barlow Condensed', text: 'PILNE|Pierwsza wiadomość\nDruga wiadomość\nSPORT|Trzecia wiadomość', catColors: 'PILNE=#e30613; SPORT=#1f8a4c' } }] },
  whip: { name: 'Pasek z wiperem (whip)', g: { x: 80, y: 990, w: 1760, h: 60 }, nodes: [
    { type: 'rect', name: 'tlo', props: { x: 0, y: 0, w: 1760, h: 60, color: '#0b0f19', color2: '#1e293b', gradAngle: 90, radius: 4 } },
    { type: 'ticker', name: 'ticker', field: 'news', props: { x: 0, y: 0, w: 1760, h: 60, tickerMode: 'whip', hold: 6, label: 'PILNE', catW: 190, catBg: '#c8102e', gleam: 3, size: 30, weight: '700', font: 'Barlow Condensed', text: 'Pierwsza wiadomość\nKRAJ|Druga wiadomość\nŚWIAT|Trzecia wiadomość', catColors: 'KRAJ=#c8102e; ŚWIAT=#1c3f94' } }] },
  line: { name: 'Crawl z linią akcentu', g: { x: 0, y: 1020, w: 1920, h: 60 }, nodes: [
    { type: 'rect', name: 'tlo', props: { x: 0, y: 0, w: 1920, h: 60, color: '#0f172a' } },
    { type: 'rect', name: 'akcent', props: { x: 0, y: 0, w: 1920, h: 2, color: '#38bdf8' } },
    { type: 'ticker', name: 'ticker', field: 'news', props: { x: 30, y: 2, w: 1890, h: 58, tickerMode: 'crawl', sepStyle: 'pipe', sepColor: '#38bdf8', speed: 120, size: 28, weight: '600', upper: true, font: 'Barlow Condensed', text: 'Giełda w Warszawie notuje wzrosty\nKurs złotego stabilny\nJutro słonecznie' } }] },
  side: { name: 'Ticker boczny (roll)', g: { x: 1420, y: 300, w: 460, h: 90 }, nodes: [
    { type: 'rect', name: 'tlo', props: { x: 0, y: 0, w: 460, h: 90, color: '#0b0f19', radius: 8, borderColor: '#3b82f6', borderWidth: 1 } },
    { type: 'ticker', name: 'ticker', field: 'news', props: { x: 0, y: 0, w: 460, h: 90, tickerMode: 'roll', hold: 5, catW: 120, catBg: '#2563eb', size: 26, weight: '600', font: 'Barlow Condensed', text: 'SKRÓT|Nowe przepisy drogowe\nSKRÓT|Spotkanie ministrów UE' } }] },
};
function addPreset(key) {
  const pr = TICKER_PRESETS[key]; if (!pr) return;
  checkpoint();
  const used = new Set(listFields(scene).map((f) => f.id));
  let fid = 'news', k = 2; while (used.has(fid)) fid = 'news' + k++;
  const g = { id: uid('n'), type: 'group', name: pr.name.toLowerCase().replace(/\s*\(.*$/, '').replace(/[^a-ząćęłńóśźż0-9]+/g, '_'), props: { ...pr.g }, anim: {}, fields: {}, children: pr.nodes.map((x) => ({ id: uid('n'), type: x.type, name: x.name, props: { ...x.props }, anim: {}, fields: x.field ? { text: fid } : {} })) };
  scene.nodes.push(g);
  scene.fieldMeta ||= {};
  scene.fieldMeta[fid] = { label: 'Wiadomości', ...(scene.fieldMeta[fid] || {}) };
  player.setScene(scene); player.seek(t);
  select(g.children.find((c) => c.type === 'ticker').id);
  toast(`Dodano „${pr.name}” – pole „${fid}” edytuje operator w Trio`);
}
export function addNode(type) {
  if (type.startsWith('preset:')) { addPreset(type.slice(7)); return; }
  if (!scene) return toast('Najpierw otwórz albo utwórz scenę', true);
  if (!TYPES[type]) return;
  checkpoint();
  let count = 0; walk(scene.nodes, (n) => { if (n.type === type) count++; });
  const props = { w: 200, h: 200, ...DEFAULTS[type] };
  const sel = selId ? locate(selId) : null;
  // do środka wkładamy tylko do zaznaczonej grupy (prostokąt też bywa kontenerem, ale nowy element znikał w nim pod przycięciem)
  const intoParent = sel && sel.node.type === 'group';
  if (intoParent || sel?.parent) { props.x = 0; props.y = 0; }
  else { props.x = Math.round((scene.width - props.w) / 2); props.y = Math.round((scene.height - props.h) / 2); }
  const n = { id: uid('n'), type, name: TYPES[type].label.toLowerCase().replace(/[^a-ząćęłńóśźż]/g, '') + (count + 1), props, anim: {}, fields: {} };
  if (TYPES[type].children) n.children = [];
  if (intoParent) { (sel.node.children ||= []).push(n); fitGroup(sel.node); }
  else if (sel) { sel.list.splice(sel.index + 1, 0, n); if (sel.parent) fitGroup(sel.parent); }
  else scene.nodes.push(n);
  player.setScene(scene); player.seek(t);
  select(n.id);
  if (intoParent || sel?.parent) toast(`Dodano do grupy „${(intoParent ? sel.node : sel.parent).name}” – odznacz (klik w puste miejsce), aby dodać na najwyższy poziom`);
}
export function cloneNode(n) {
  const c = structuredClone(n);
  const re = (x) => { x.id = uid('n'); (x.children || []).forEach(re); };
  re(c); return c;
}
export function treeOp(op) {
  const L = selId && locate(selId); if (!L) return;
  const { node: n, list, index: i, parent } = L;
  // włóż / wyjmij = przeniesienie z zachowaniem położenia na ekranie (moveNode robi własny punkt cofania)
  if (op === 'in') { if (i > 0 && TYPES[list[i - 1].type]?.children) moveNode(n.id, list[i - 1].id, 'into'); return; }
  if (op === 'out') { if (parent) moveNode(n.id, parent.id, 'after'); return; }
  if (op === 'group') return groupSel();
  if (op === 'ungroup') return ungroupSel();
  checkpoint();
  if (op === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  else if (op === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
  else if (op === 'dup') {
    const copies = [];
    for (const id of topSel()) {
      const D = locate(id), c = cloneNode(D.node); c.name = D.node.name + '_kopia';
      D.list.splice(D.index + 1, 0, c); copies.push(c.id);
    }
    setSelId(copies[0] || null); setSelMore(copies.slice(1));
  } else if (op === 'fit') {
    if (!fitGroup(n)) { undo.pop(); return toast('Dopasowanie działa dla grupy z elementami', true); }
  } else if (op === 'del') {
    const ids = topSel();
    if (ids.some(isLocked)) { undo.pop(); return toast('Element jest zablokowany – odblokuj go w drzewie (🔒)', true); }
    for (const id of ids) { const D = locate(id); if (D) D.list.splice(D.index, 1); }
    setSelId(null); setSelMore([]); setSelKey(null);
  } else { undo.pop(); return; }
  player.setScene(scene); player.seek(t);
  renderTree(); renderProps(); renderTimeline();
}
/** Ctrl+G: zaznaczone elementy jednego poziomu → nowa grupa w miejscu najwyższego z nich; położenie na ekranie bez zmian. */
function groupSel() {
  const Ls = topSel().map((id) => locate(id)).sort((a, b) => a.index - b.index);
  if (!Ls.length) return;
  if (Ls.some((L) => L.parent !== Ls[0].parent)) return toast('Grupować można elementy z jednego poziomu drzewa (ten sam rodzic)', true);
  if (Ls.some((L) => isLocked(L.node.id))) return toast('Element jest zablokowany – odblokuj go w drzewie (🔒)', true);
  checkpoint();
  const list = Ls[0].list, at = Ls[Ls.length - 1].index - (Ls.length - 1);
  let count = 0; walk(scene.nodes, (x) => { if (x.type === 'group') count++; });
  const g = { id: uid('n'), type: 'group', name: 'grupa' + (count + 1), props: { x: 0, y: 0, w: 1, h: 1 }, anim: {}, fields: {}, children: Ls.map((L) => L.node) };
  for (const L of [...Ls].reverse()) list.splice(L.index, 1);
  list.splice(at, 0, g);
  fitGroup(g); // grupa w (0, 0) rodzica – dzieci zachowują współrzędne, dopasowanie przesuwa początek na obrys
  player.setScene(scene); player.seek(t);
  select(g.id);
}
/** Ctrl+Shift+G: dzieci grupy przechodzą na jej poziom, w jej miejscu; własności samej grupy (animacja, obrót, krycie…) giną. */
async function ungroupSel() {
  const L = selId && locate(selId);
  if (!L || L.node.type !== 'group') return toast('Zaznacz grupę, aby ją rozgrupować', true);
  if (isLocked(L.node.id)) return toast('Grupa jest zablokowana – odblokuj ją w drzewie (🔒)', true);
  const g = L.node, kids = g.children || [];
  const own = Object.values(g.anim || {}).some((a) => a?.length) || g.motion || Object.values(g.fields || {}).some(Boolean)
    || ['rotation', 'skewX', 'blur', 'clipL', 'clipR', 'clipT', 'clipB', 'blink'].some((p) => num(g, p)) || scl(g) !== 1 || num(g, 'opacity') !== 1 || g.hidden;
  if (own && !(await confirmBox(`Grupa „${g.name}” ma własną animację, przekształcenie, krycie, maskę albo pole kontrolne. Po rozgrupowaniu elementy je stracą.`, { title: 'Rozgrupować?', ok: 'Rozgrupuj' }))) return;
  checkpoint();
  const o = boxIn(g);
  for (const k of kids) shiftNode(k, o.x, o.y);
  L.list.splice(L.index, 1, ...kids);
  player.setScene(scene); player.seek(t);
  if (kids.length) select(kids[0].id, kids.map((k) => k.id)); else select(null);
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  $('#tree').addEventListener('click', (e) => {
    if (e.target.closest('[data-refs1]')) { togglePop('#pRefs'); return; }
    setLastArea('tree');
    const eye = e.target.closest('[data-eye]');
    if (eye) { const n = locate(eye.dataset.eye)?.node; if (n) { checkpoint(); n.hidden = !n.hidden; refresh(); renderTree(); } return; }
    const lock = e.target.closest('[data-lock]');
    if (lock) { const n = locate(lock.dataset.lock)?.node; if (n) { checkpoint(); if (n.locked) delete n.locked; else n.locked = true; renderTree(); } return; }
    const it = e.target.closest('.item'); if (!it) return;
    const id = it.dataset.id;
    if (id && selId && (e.ctrlKey || e.metaKey)) { // Ctrl+klik: dodaj / zdejmij z zaznaczenia
      const all = selAll();
      if (all.includes(id)) { const rest = all.filter((x) => x !== id); select(rest[0], rest.slice(1)); } else select(id, all);
      return;
    }
    if (id && selId && e.shiftKey) { // Shift+klik: zakres w kolejności drzewa
      const ids = $$('#tree .item[data-id]').map((x) => x.dataset.id).filter(Boolean);
      const a = ids.indexOf(selId), b = ids.indexOf(id);
      if (a >= 0 && b >= 0) { select(id, ids.slice(Math.min(a, b), Math.max(a, b) + 1)); return; }
    }
    select(id);
  });
  $('#tree').addEventListener('dblclick', async (e) => {
    const it = e.target.closest('.item'); if (!it?.dataset.id) return;
    const n = locate(it.dataset.id).node;
    const v = await promptBox('Nazwa kontenera', n.name, { title: 'Zmień nazwę', ok: 'Zmień' }); if (v === null) return;
    checkpoint(); n.name = v; renderTree(); renderProps();
  });
  $('#addSel').innerHTML += `<optgroup label="Presety tickerów">${Object.entries(TICKER_PRESETS).map(([k, v]) => `<option value="preset:${k}">⇠ ${v.name}</option>`).join('')}</optgroup>`;
  $('#addSel').addEventListener('change', (e) => { if (e.target.value) addNode(e.target.value); e.target.value = ''; });
  $('#tUp').onclick = () => treeOp('up');
  $('#tDown').onclick = () => treeOp('down');
  $('#tIn').onclick = () => treeOp('in');
  $('#tOut').onclick = () => treeOp('out');
  $('#tDupN').onclick = () => treeOp('dup');
  $('#tGrp').onclick = () => treeOp('group');
  $('#tUngrp').onclick = () => treeOp('ungroup');
  $('#tDel').onclick = () => treeOp('del');
  $('#tFit').onclick = () => treeOp('fit');
}

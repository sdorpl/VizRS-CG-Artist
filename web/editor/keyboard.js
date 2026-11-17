// Artist – klawiatura, pasek stanu, rozdzielacze paneli.

import { propAt } from '/renderer.js';
import { $, $$, box, checkpoint, dirty, doRedo, doUndo, isLocked, lastArea, load, locate, player, save, scene, selId, selKey, selMore, selNode, setSceneOffset, setT, t, toast, topSel } from './core.js';
import { syncProps } from './props.js';
import { renderTimeline, setTime, updatePlayhead } from './timeline.js';
import { refresh, setProp } from './edit.js';
import { select, treeOp } from './tree.js';
import { drawGuides, resetView, resize, zoom100, zoomSel } from './canvas.js';
import { measureOn, setMeasureOn, toggleRefs } from './refs.js';
import { copyNodes, ctxClose, pasteNodes, selectAllNodes, startTextEdit } from './handles.js';
import { dockEnd, dockPlay, dockPv, updateSel } from './dock.js';
import { addMarker, copyKeys, deleteSelKey, pasteKeys } from './keys.js';

// ------------------------------------------------------------ klawiatura
// Alt przytrzymany nad kanwą = pomiar odległości (puszczenie albo utrata fokusu okna – koniec)
const setMeasure = (v) => { if (measureOn !== v) { setMeasureOn(v); drawGuides(); } };
// pętla UI: śledzenie odtwarzania i ramki zaznaczenia
let lastSync = 0;
export let loaded;
// ------------------------------------------------------------ pasek stanu: podpowiedź do panelu pod kursorem
const HINT0 = 'Ctrl+S zapisz · Ctrl+Z / Ctrl+Y cofnij / ponów · najedź na panel, aby zobaczyć jego skróty';
// ------------------------------------------------------------ rozdzielacze paneli (rozmiary zapamiętane w przeglądarce/oknie)
const LAY = { l: [270, 170, 560], r: [350, 260, 680], t: [260, 120, 640] };
 // domyślnie, min, max
// mały ekran (np. 1920×1080 przy 125 % = 1536 px CSS): węższe panele domyślne, więcej miejsca na kanwę
const COMPACT = { l: 260, r: 300, t: 210 };
 // l: pasek narzędzi drzewa ma 256 px
const defLay = (k) => (innerWidth < 1700 ? COMPACT[k] : LAY[k][0]);
const lay = (() => { try { return JSON.parse(localStorage.getItem('vizrs.artistLayout')) || {}; } catch { return {}; } })();
const setLay = (k, v) => { const [, lo, hi] = LAY[k]; lay[k] = Math.round(Math.max(lo, Math.min(hi, v))); $('#main').style.setProperty('--' + k, lay[k] + 'px'); };
const saveLay = () => { try { localStorage.setItem('vizrs.artistLayout', JSON.stringify(lay)); } catch { /* brak localStorage */ } renderTimeline(); };
// panele schowane: Ctrl+1 drzewo, Ctrl+2 właściwości, Ctrl+3 oś czasu, Tab – tylko kanwa (drugi raz – wszystko jak było)
const PANELS = { l: 'noL', r: 'noR', t: 'noT' };
const hid = (() => { try { return { l: false, r: false, t: false, ...JSON.parse(localStorage.getItem('vizrs.artistPanels')) }; } catch { return { l: false, r: false, t: false }; } })();
let hidBefore = null;
 // stan przed „tylko kanwa”
function applyPanels() {
  for (const [k, c] of Object.entries(PANELS)) $('#main').classList.toggle(c, !!hid[k]);
  $('#vPanels').classList.toggle('on', hid.l && hid.r && hid.t);
  // „tylko kanwa” nie przechodzi na następny start (okno bez paneli zaskakuje) – zapisany jest stan sprzed niej
  const keep = hidBefore || hid;
  try { localStorage.setItem('vizrs.artistPanels', JSON.stringify({ l: keep.l, r: keep.r, t: keep.t })); } catch { /* brak localStorage */ }
  if (!hid.t) requestAnimationFrame(renderTimeline);
}
export function togglePanel(k) { hid[k] = !hid[k]; hidBefore = null; applyPanels(); }
export function canvasOnly() {
  if (hid.l && hid.r && hid.t) Object.assign(hid, hidBefore || { l: false, r: false, t: false }), hidBefore = null;
  else { hidBefore = { l: hid.l, r: hid.r, t: hid.t }; Object.assign(hid, { l: true, r: true, t: true }); }
  applyPanels();
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  addEventListener('keydown', (e) => {
    if (e.key === 'Alt' && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && lastArea === 'canvas') { e.preventDefault(); setMeasure(true); }
  });
  addEventListener('keyup', (e) => { if (e.key === 'Alt') { if (measureOn) e.preventDefault(); setMeasure(false); } });
  addEventListener('blur', () => setMeasure(false));
  addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (typing) return;
    if (e.key === '/' && !mod && selNode()) { e.preventDefault(); $('#psearch').focus(); $('#psearch').select(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); treeOp('dup'); return; }
    if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); treeOp(e.shiftKey ? 'ungroup' : 'group'); return; }
    if (e.key === 'Escape' && !$('#ctxMenu').hidden) { ctxClose(); return; }
    if (e.key === 'Enter' && !mod && !dockPv?.set && lastArea !== 'timeline' && selId && !selMore.length && selNode()?.type === 'text') { e.preventDefault(); startTextEdit(selNode()); return; }
    if (dockPv && (e.key === 'Escape' || (e.key === 'Enter' && dockPv.set))) { e.preventDefault(); dockEnd(e.key === 'Enter'); return; }
    if (e.key === 'Escape') {
      const open = $$('.vpop').filter((x) => !x.hidden);
      if (open.length) open.forEach((x) => { x.hidden = true; }); else if (selId) select(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (lastArea === 'timeline' && selKey) deleteSelKey(); else treeOp('del'); return; }
    if (e.key === ' ') { e.preventDefault(); if (player.playing) player.playing = false; else $('#pPlay').click(); return; }
    if (mod && e.key.toLowerCase() === 'c' && lastArea === 'timeline') { e.preventDefault(); copyKeys(); return; }
    if (mod && e.key.toLowerCase() === 'v' && lastArea === 'timeline') { e.preventDefault(); pasteKeys(); return; }
    if (mod && !e.shiftKey && lastArea !== 'timeline' && lastArea !== 'props') {
      const kk = e.key.toLowerCase();
      if (kk === 'c' && selId) { e.preventDefault(); copyNodes(false); return; }
      if (kk === 'x' && selId) { e.preventDefault(); copyNodes(true); return; }
      if (kk === 'v') { e.preventDefault(); pasteNodes(); return; }
      if (kk === 'a') { e.preventDefault(); selectAllNodes(); return; }
    }
    if (e.key.toLowerCase() === 'm' && !mod) { e.preventDefault(); addMarker(t); return; }
    if (e.shiftKey && !mod && e.code === 'Digit1') { e.preventDefault(); resetView(); return; }
    if (mod && !e.shiftKey && !e.altKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { e.preventDefault(); togglePanel('lrt'[+e.code.slice(5) - 1]); return; }
    if (e.key === 'Tab' && !mod && !e.altKey && !e.shiftKey) { e.preventDefault(); canvasOnly(); return; }
    if (e.shiftKey && !mod && !e.altKey && e.code === 'KeyR') { e.preventDefault(); toggleRefs(); return; }
    if (e.shiftKey && !mod && e.code === 'Digit2') { e.preventDefault(); zoom100(); return; }
    if (e.shiftKey && !mod && e.code === 'Digit3') { e.preventDefault(); zoomSel(); return; }
    if (e.key === 'Home') { setTime(0); return; }
    if (e.key === 'End') { setTime(scene.duration); return; }
    const n = selNode();
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dockPv?.set && arrows[e.key] && lastArea !== 'timeline') {
      e.preventDefault();
      const m = e.shiftKey ? 10 : 1, [dx, dy] = arrows[e.key];
      dockPv.dx += dx * m; dockPv.dy += dy * m; dockPlay(false); return;
    }
    if (!n && arrows[e.key] && lastArea !== 'timeline') {
      e.preventDefault(); checkpoint();
      const m = e.shiftKey ? 10 : 1, [dx, dy] = arrows[e.key];
      setSceneOffset((+scene.x || 0) + dx * m, (+scene.y || 0) + dy * m); return;
    }
    if (n && arrows[e.key]) {
      // całe zaznaczenie, w układzie rodzica każdego elementu (zablokowane zostają)
      const ms = topSel().filter((id) => !isLocked(id)).map((id) => locate(id).node);
      if (!ms.length) return;
      e.preventDefault(); checkpoint();
      const m = e.shiftKey ? 10 : 1, [dx, dy] = arrows[e.key];
      for (const x of ms) { setProp(x, 'x', propAt(x, 'x', t, null) + dx * m); setProp(x, 'y', propAt(x, 'y', t, null) + dy * m); }
      refresh(); syncProps();
    }
  });
  // w oknie natywnym zamknięcie i ponowne wczytanie pyta okno (systemowe pytanie), nie przeglądarka
  addEventListener('beforeunload', (e) => { if (dirty && !window.__vizrsShell) { e.preventDefault(); e.returnValue = ''; } });
  (function frame(now) {
    if (player) {
      if (player.playing || Math.abs(player.t - t) > 1e-6) {
        setT(player.t); updatePlayhead();
        if (now - lastSync > 80) { syncProps(); lastSync = now; }
      }
      updateSel();
    }
    requestAnimationFrame(frame);
  })(0);
  new ResizeObserver(() => resize()).observe(box);
  loaded = load().catch((e) => toast('Błąd: ' + e.message, true));
  $('#hint').textContent = HINT0;
  document.addEventListener('mouseover', (e) => { const h = e.target.closest?.('[data-hint]')?.dataset.hint || HINT0; if ($('#hint').textContent !== h) $('#hint').textContent = h; });
  // wygaszenie dołu przewijanych paneli (.scroll.more), dopóki niżej jest treść
  {
    const more = (el) => el.classList.toggle('more', el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    const ro = new ResizeObserver((es) => es.forEach((e) => more(e.target)));
    for (const el of $$('.scroll')) {
      el.addEventListener('scroll', () => more(el), { passive: true });
      ro.observe(el);
      new MutationObserver(() => more(el)).observe(el, { childList: true, subtree: true });
    }
  }
  // lista rozwijana ucięta w wąskim panelu („TickerWipe · l…”): podpowiedź pokazuje też wybraną pozycję w całości
  document.addEventListener('mouseover', (e) => {
    const sl = e.target.closest?.('select'); if (!sl) return;
    sl.dataset.tip ??= sl.title || '';
    const v = sl.selectedOptions[0]?.textContent || '', tip = sl.dataset.tip;
    sl.title = tip && v ? `${tip}: ${v}` : tip || v;
  });
  for (const k of Object.keys(LAY)) setLay(k, +lay[k] || defLay(k));
  for (const g of document.querySelectorAll('.gutter')) {
    const k = g.dataset.k;
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.setPointerCapture(e.pointerId); g.classList.add('drag');
      const start = lay[k], x0 = e.clientX, y0 = e.clientY;
      const move = (ev) => setLay(k, start + (k === 'l' ? ev.clientX - x0 : k === 'r' ? x0 - ev.clientX : y0 - ev.clientY));
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.classList.remove('drag'); saveLay(); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    });
    g.addEventListener('dblclick', () => { setLay(k, defLay(k)); saveLay(); });
  }
  $('#vPanels').onclick = canvasOnly;
  applyPanels();
}

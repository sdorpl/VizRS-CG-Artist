// Artist – oś czasu: obsługa myszy, markery, zoom, kopiowanie kluczy.

import * as MO from '/motion.js';
import { PROPS, TYPES, propAt } from '/renderer.js';
import { promptBox } from '/native.js';
import { $, $$, LBL, checkpoint, clipKeys, locate, player, pps, scene, selId, selKey, selKeys, selNode, setClipKeys, setLastArea, setPps, setSelId, setSelKey, setSelKeys, setSelMore, t, toast, undo } from './core.js';
import { outStartOf, renderProps, renderTree, syncProps } from './props.js';
import { afterCycle, r2, renderKeyEd, renderTimeline, seqTool, setTime, showPhase, tlFold, tlMenu } from './timeline.js';
import { refresh, setKey } from './edit.js';
import { select } from './tree.js';
import { resize } from './canvas.js';

export const sortedStops = () => [...scene.stops].sort((a, b) => a - b);
function timeFromX(clientX) {
  const a = $('#tl .tl-area[data-area="ruler"]').getBoundingClientRect();
  return (clientX - a.left) / pps;
}
export function deleteSelKey() {
  if (!selKey && !selKeys.length) return;
  checkpoint();
  for (const x of (selKeys.length ? selKeys : [selKey])) {
    const tr = x.node.anim?.[x.prop]; if (!tr) continue;
    const i = tr.indexOf(x.key); if (i >= 0) tr.splice(i, 1);
    if (!tr.length) delete x.node.anim[x.prop];
  }
  setSelKey(null); setSelKeys([]); refresh(); renderTimeline(); syncProps(); renderTree();
}
// ------------------------------------------------------------ markery, zoom, kopiuj/wklej klucze
export async function addMarker(at, name) {
  const v = name ?? await promptBox('Nazwa markera', 'marker' + ((scene.markers?.length || 0) + 1), { title: 'Nowy marker', ok: 'Dodaj' }); if (v === null || !v.trim()) return;
  checkpoint(); (scene.markers ||= []).push({ t: Math.max(0, Math.min(scene.duration, +at.toFixed(3))), name: v.trim() });
  scene.markers.sort((a, b) => a.t - b.t); renderTimeline(); if (!selId) renderProps();
}
function setZoom(v, anchorClientX) {
  const host = $('#tl'), old = pps;
  const ar = host.getBoundingClientRect();
  const cx = anchorClientX != null ? anchorClientX - ar.left : ar.width / 2;
  const tAt = (host.scrollLeft + cx - LBL) / old;
  setPps(Math.max(40, Math.min(1200, v)));
  $('#zoom').value = pps;
  renderTimeline();
  host.scrollLeft = Math.max(0, tAt * pps + LBL - cx);
}
export function copyKeys() {
  const sel = selKeys.length ? selKeys : selKey ? [selKey] : [];
  if (!sel.length) return toast('Zaznacz klucze (kliknij, Shift+klik lub Shift+przeciągnięcie ramką)', true);
  const t0 = Math.min(...sel.map((x) => x.key.t));
  setClipKeys(sel.map((x) => ({ prop: x.prop, dt: x.key.t - t0, v: x.key.v, e: x.key.e })));
  toast(`Skopiowano ${clipKeys.length} kluczy`);
}
export function pasteKeys() {
  const n = selNode();
  if (!clipKeys) return toast('Schowek kluczy jest pusty', true);
  if (!n) return toast('Zaznacz węzeł, na który wkleić klucze', true);
  const ok = clipKeys.filter((c) => PROPS[c.prop]?.anim && TYPES[n.type].props.includes(c.prop));
  if (!ok.length) return toast(`Węzeł „${n.name}” nie ma tych właściwości`, true);
  checkpoint();
  for (const c of ok) {
    const at = Math.round(Math.max(0, Math.min(scene.duration, t + c.dt)) * 1000) / 1000;
    setKey(n, c.prop, at, c.v);
    const k = n.anim[c.prop].find((x) => Math.abs(x.t - at) < 0.0005); if (k && c.e) k.e = c.e;
  }
  refresh(); renderTimeline(); renderTree(); syncProps();
  toast(`Wklejono ${ok.length} kluczy` + (ok.length < clipKeys.length ? ` (pominięto ${clipKeys.length - ok.length} – brak właściwości)` : ''));
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  // ------------------------------------------------------------ timeline
  $('#zoom').addEventListener('input', (e) => setZoom(+e.target.value));
  $('#tc').addEventListener('change', (e) => setTime(parseFloat(e.target.value) || 0));
  $('#dur').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value); if (!(v > 0)) return;
    checkpoint(); scene.duration = v; if (t > v) setTime(v); renderTimeline(); if (!selId) renderProps();
  });
  $('#pHome').onclick = () => setTime(0);
  $('#pTake').onclick = () => { const s = sortedStops(); player.playTo(s.length ? s[0] : scene.duration, 0); };
  $('#pCont').onclick = () => { const nx = sortedStops().find((s) => s > t + 1e-4); player.playTo(nx ?? scene.duration); };
  $('#pOut').onclick = () => { const s = sortedStops(); const ls = s.length ? s[s.length - 1] : 0; player.playTo(scene.duration, Math.max(t, ls)); };
  $('#pPlay').onclick = () => player.playTo(scene.duration, t >= scene.duration - 1e-3 ? 0 : t);
  $('#pStop').onclick = () => { player.playing = false; };
  $('#addStop').onclick = () => {
    if (scene.stops.some((s) => Math.abs(s - t) < 0.005)) return toast('Stop w tym miejscu już istnieje');
    checkpoint(); scene.stops.push(+t.toFixed(3)); scene.stops.sort((a, b) => a - b); renderTimeline(); if (!selId) renderProps();
  };
  $('#tl').addEventListener('contextmenu', (e) => {
    const mb = e.target.closest('.mb[data-mb]'), nrow = e.target.closest('[data-nrow]');
    if (!mb && !nrow) return;
    e.preventDefault(); setLastArea('timeline');
    if (mb) { const [nid, sec] = mb.dataset.mb.split('|'); tlMenu(e, nid, sec); } else tlMenu(e, nrow.dataset.nrow, null);
  });
  $('#seqTools').addEventListener('click', (e) => { const b = e.target.closest('[data-seq]'); if (b) seqTool(b.dataset.seq); });
  $('#tl').addEventListener('mousedown', (e) => {
    setLastArea('timeline');
    const mb = e.target.closest('.mb[data-mb]');
    if (mb && mb.classList.contains('loop') && e.button === 0) { e.preventDefault(); const [nid] = mb.dataset.mb.split('|'); if (selId !== nid) select(nid); showPhase('loop'); return; }
    const fold = e.target.closest('[data-fold]');
    if (fold) { e.preventDefault(); const id = fold.dataset.fold; if (tlFold.has(id)) tlFold.delete(id); else tlFold.add(id); renderTimeline(); return; }
    if (e.button === 2) return;
    if (mb && !mb.classList.contains('loop')) {
      // pasek ruchu: przeciągnięcie = opóźnienie, krawędź = czas trwania
      e.preventDefault();
      const [nid, sec] = mb.dataset.mb.split('|');
      const n = locate(nid)?.node; if (!n?.motion?.[sec]) return;
      const spec = n.motion[sec], resize = !!e.target.closest('.mbh');
      const d0 = MO.specDelay(spec), u0 = MO.specDur(spec), sx = e.clientX, sy = e.clientY;
      const canAfter = sec === 'in' || sec === 'textIn';
      let moved = false, vert = false, drop = null;
      if (selId !== nid) { setSelId(nid); setSelMore([]); renderTree(); }
      const rowAt = (ev) => document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('.tl-row.node[data-node]')).find(Boolean);
      const mv = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 8) return;
        if (!moved) { checkpoint(); moved = true; }
        if (canAfter && !resize && Math.abs(dy) > 12) { // w pionie: „po węźle” – wiersz innego elementu
          // bez przerysowania osi w trakcie (zaznaczony element wskoczyłby na górę i wiersze uciekłyby spod kursora)
          if (!vert) { vert = true; if (d0) spec.delay = d0; else delete spec.delay; }
          $$('#tl .tl-row.node.drop').forEach((x) => x.classList.remove('drop'));
          const r = rowAt(ev); drop = r && r.dataset.node !== nid ? r.dataset.node : null;
          if (drop) r.classList.add('drop');
          return;
        }
        if (vert) return;
        const q = (v) => (ev.shiftKey ? Math.round(v * 20) / 20 : r2(v));
        if (resize) spec.dur = Math.max(0.02, q(u0 + dx / pps));
        else { const d = Math.max(0, q(d0 + dx / pps)); if (d) spec.delay = d; else delete spec.delay; }
        renderTimeline(); refresh();
      };
      const up = () => {
        removeEventListener('mousemove', mv); removeEventListener('mouseup', up);
        if (vert) {
          if (drop && afterCycle(nid, drop)) { toast('„Po węźle” utworzyłoby pętlę sekwencji', true); undo.pop(); }
          else if (drop) { n.motion.after = drop; toast(`„${n.name}” wchodzi po „${locate(drop)?.node.name}”`); refresh(); }
          else undo.pop();
        }
        if (!moved) { const st = sec === 'out' || sec === 'textOut' ? outStartOf() + d0 : (MO.sequenceShifts(scene.nodes).get(nid) || 0) + d0; setTime(Number.isFinite(st) ? st : 0); renderTimeline(); showPhase(sec); return; }
        renderTimeline(); renderProps();
      };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      return;
    }
    const kf = e.target.closest('.kf');
    const sm = e.target.closest('.stopm');
    const lbl = e.target.closest('.tl-lbl[data-sel]');
    if (lbl) { select(lbl.dataset.sel); return; }
    if (kf) {
      e.preventDefault();
      const [nid, p, i] = kf.dataset.k.split('|');
      const n = locate(nid).node; const key = n.anim[p][+i];
      const entry = { node: n, prop: p, key };
      if (e.shiftKey) {
        const j = selKeys.findIndex((x) => x.key === key);
        if (j >= 0) selKeys.splice(j, 1); else selKeys.push(entry);
      } else if (!selKeys.some((x) => x.key === key) || selKeys.length < 2) setSelKeys([entry]);
      setSelKey(entry);
      if (selId !== nid) { setSelId(nid); setSelMore([]); renderTree(); renderProps(); }
      renderTimeline();
      const sx = e.clientX; let moved = false;
      const starts = selKeys.map((x) => x.key.t);
      const mv = (ev) => {
        const dx = ev.clientX - sx; if (!moved && Math.abs(dx) < 3) return;
        if (!moved) { checkpoint(); moved = true; }
        const minT = Math.min(...starts);
        let dt = Math.max(-minT, dx / pps);
        dt = ev.shiftKey ? Math.round(dt * 20) / 20 : Math.round(dt * 100) / 100;
        selKeys.forEach((x, idx) => { x.key.t = Math.max(0, starts[idx] + dt); });
        new Set(selKeys.map((x) => x.node.anim[x.prop])).forEach((tr) => tr.sort((a, b) => a.t - b.t));
        renderTimeline(); refresh(); syncProps();
      };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (!moved && selKeys.length === 1) setTime(key.t); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      return;
    }
    if (sm) {
      e.preventDefault();
      const i = +sm.dataset.stop, sx = e.clientX, t0 = scene.stops[i]; let moved = false;
      const mv = (ev) => {
        const dx = ev.clientX - sx; if (!moved && Math.abs(dx) < 3) return;
        if (!moved) { checkpoint(); moved = true; }
        scene.stops[i] = Math.max(0, Math.min(scene.duration, Math.round((t0 + dx / pps) * 100) / 100));
        renderTimeline();
      };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); scene.stops.sort((a, b) => a - b); if (!moved) setTime(t0); renderTimeline(); if (!selId) renderProps(); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      return;
    }
    const mk = e.target.closest('.mkm');
    if (mk) { e.preventDefault(); setTime(scene.markers[+mk.dataset.mk].t); return; }
    if (e.shiftKey && e.target.closest('.tl-area[data-row]')) { // zaznaczanie ramką
      e.preventDefault();
      const host = $('#tl'), hr = host.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      const band = document.createElement('div'); band.id = 'band'; host.appendChild(band);
      const mv = (ev) => {
        const x1 = Math.min(sx, ev.clientX), x2 = Math.max(sx, ev.clientX), y1 = Math.min(sy, ev.clientY), y2 = Math.max(sy, ev.clientY);
        Object.assign(band.style, { left: x1 - hr.left + host.scrollLeft + 'px', top: y1 - hr.top + host.scrollTop + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
      };
      const up = (ev) => {
        removeEventListener('mousemove', mv); removeEventListener('mouseup', up); band.remove();
        const x1 = Math.min(sx, ev.clientX), x2 = Math.max(sx, ev.clientX), y1 = Math.min(sy, ev.clientY), y2 = Math.max(sy, ev.clientY);
        const picked = [];
        for (const kfEl of $$('#tl .kf')) {
          const r = kfEl.getBoundingClientRect();
          if (r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2) continue;
          const [nid, p, i] = kfEl.dataset.k.split('|');
          const n = locate(nid)?.node; if (n?.anim?.[p]?.[+i]) picked.push({ node: n, prop: p, key: n.anim[p][+i] });
        }
        setSelKeys(picked); setSelKey(picked[0] || null);
        renderTimeline();
      };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      return;
    }
    if (e.target.closest('.tl-area')) {
      e.preventDefault();
      if (selKey || selKeys.length) { setSelKey(null); setSelKeys([]); renderKeyEd(); $$('.kf.sel').forEach((k) => k.classList.remove('sel')); }
      player.playing = false;
      setTime(timeFromX(e.clientX));
      const mv = (ev) => setTime(timeFromX(ev.clientX));
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    }
  });
  $('#tl').addEventListener('dblclick', async (e) => {
    const mk = e.target.closest('.mkm');
    if (mk) {
      const m = scene.markers[+mk.dataset.mk];
      const v = await promptBox('Puste = usuń marker.', m.name || '', { title: 'Nazwa markera' }); if (v === null) return;
      checkpoint(); if (v.trim()) m.name = v.trim(); else scene.markers.splice(+mk.dataset.mk, 1);
      renderTimeline(); if (!selId) renderProps(); return;
    }
    if (e.target.closest('.tl-area[data-area="ruler"]') && !e.target.closest('.stopm')) { addMarker(Math.round(timeFromX(e.clientX) * 100) / 100); return; }
    const sm = e.target.closest('.stopm');
    if (sm) { checkpoint(); scene.stops.splice(+sm.dataset.stop, 1); renderTimeline(); if (!selId) renderProps(); return; }
    const nrow = e.target.closest('.tl-area[data-nrow]');
    if (nrow && !e.target.closest('.mb')) { tlMenu(e, nrow.dataset.nrow, null); return; }
    const row = e.target.closest('.tl-area[data-row]');
    if (!row || e.target.closest('.kf')) return;
    const [nid, p] = row.dataset.row.split('|');
    const n = locate(nid).node;
    const at = Math.round(timeFromX(e.clientX) * 100) / 100;
    checkpoint(); setKey(n, p, at, propAt(n, p, at, null));
    setTime(at); renderTimeline();
  });
  $('#keyed').addEventListener('change', (e) => {
    if (!selKey) return;
    const k = selKey.key, tr = selKey.node.anim[selKey.prop];
    checkpoint();
    if (e.target.id === 'kt') { k.t = Math.max(0, parseFloat(e.target.value) || 0); tr.sort((a, b) => a.t - b.t); }
    if (e.target.id === 'kv') k.v = PROPS[selKey.prop]?.t === 'num' ? parseFloat(e.target.value) || 0 : e.target.value;
    if (e.target.id === 'ke') k.e = e.target.value;
    refresh(); renderTimeline(); syncProps();
  });
  $('#keyed').addEventListener('click', (e) => { if (e.target.id === 'kdel') deleteSelKey(); });
  $('#markAdd').onclick = () => addMarker(t);
  $('#tl').addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // bez Ctrl – zwykłe przewijanie
    e.preventDefault();
    setZoom(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX);
  }, { passive: false });
  $('#zoomFit').onclick = () => { setZoom(($('#tl').clientWidth - LBL - 90) / Math.max(0.1, scene.duration)); $('#tl').scrollLeft = 0; };
  $('#keyCopy').onclick = copyKeys;
  $('#keyPaste').onclick = pasteKeys;
}

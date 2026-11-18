// Artist – oś czasu: klipy presetów i klucze (rysowanie).

import { html, setHtml } from '/dom.js';
import * as MO from '/motion.js';
import { PROPS, TYPES, EASES, trackValue, walk } from '/renderer.js';
import { confirmBox } from '/native.js';
import { $, LBL, checkpoint, esc, locate, player, pps, scene, selId, selKey, selKeys, selNode, setSelKey, setSelKeys, setT, t, toast, undo } from './core.js';
import { fitMotionTiming, outStartOf, pui, renderProps, savePui, syncProps } from './props.js';
import { refresh } from './edit.js';
import { select } from './tree.js';
import { seekRefs } from './refs.js';
import { sortedStops } from './keys.js';
import { showReport } from './scenes.js';

// ------------------------------------------------------------ jedna oś czasu (J1): klipy presetów i klucze w jednym widoku
// Wiersz elementu z klipami ruchu (wejście, efekt tekstu, pętla, wyjście – czasy z motion.js, jak w rendererze), pod nim
// (▾ / ▸) wiersze kluczy jego właściwości. Elementy bez ruchu i kluczy nie mają wiersza – poza zaznaczonym (dodawanie presetu).
export const tlFold = new Set();
 // elementy ze zwiniętymi kluczami
const hasMotion = (n) => { const m = n.motion; return !!m && !!(m.in?.type || m.out?.type || (m.textIn?.type && m.textIn.type !== 'none') || (m.textOut?.type && m.textOut.type !== 'none') || (m.loop?.type && m.loop.type !== 'none')); };
export const keyProps = (n) => Object.keys(n.anim || {}).filter((p) => n.anim[p]?.length);
/** Wartości spoczynkowe właściwości ruchu w chwili at (klucz – wartość ścieżki, inaczej właściwość albo domyślna). */
function restOf(n, at) {
  const r = {};
  for (const p of ['x', 'y', 'opacity', 'scale', 'skewX', 'blur', 'clipL', 'clipT', 'clipR', 'clipB']) r[p] = n.anim?.[p]?.length ? +trackValue(n.anim[p], at, 'num') || 0 : +(n.props?.[p] ?? PROPS[p].d) || 0;
  return r;
}
/** Właściwości, które zmieniają presety wejścia / wyjścia elementu (znacznik „+ preset” na wierszu klucza). */
function presetProps(n) {
  if (!n.motion?.in && !n.motion?.out) return new Set();
  try { return new Set(Object.keys(MO.motionToKeys(n.motion, { rest: restOf(n, 0), outStart: outStartOf(), shift: MO.sequenceShifts(scene.nodes).get(n.id) || 0 }).anim)); } catch { return new Set(); }
}
export function renderTimeline() {
  if (!scene) return; // zmiana rozmiaru okna, zanim wczyta się pierwsza scena
  const dur = scene.duration || 1;
  const W = Math.max(dur * pps + 80, $('#tl').clientWidth - LBL);
  const sh = MO.sequenceShifts(scene.nodes), oS = outStartOf();
  const nodes = [];
  walk(scene.nodes, (n) => { if (hasMotion(n) || keyProps(n).length || n.id === selId) nodes.push(n); });
  nodes.sort((a, b) => (a.id === selId) === (b.id === selId) ? 0 : a.id === selId ? -1 : 1);
  let h = html`<div class="tl-in" style="width:${LBL + W}px">`;
  h = html`${h}${html`<div class="tl-row ruler"><div class="tl-lbl">${nodes.length ? html`<span class="dim">ruch i klucze</span>` : html`<span class="dim">brak animacji – ◆ albo zaznacz element</span>`}</div><div class="tl-area" data-area="ruler" style="width:${W}px">`}`;
  const step = pps > 500 ? 0.05 : pps > 160 ? 0.1 : 0.25, lab = pps > 500 ? 0.25 : 0.5;
  for (let i = 0; i * step <= dur + 1e-9 + 2; i++) {
    const s0 = i * step, major = Math.abs(s0 / lab - Math.round(s0 / lab)) < 1e-6;
    h = html`${h}${html`<div class="tick ${major ? 'maj' : ''}" style="left:${s0 * pps}px">${major ? s0.toFixed(2).replace(/0$/, '') : ''}</div>`}`;
  }
  (scene.markers || []).forEach((m, i) => { h = html`${h}${html`<div class="mkm" data-mk="${i}" style="left:${m.t * pps}px" title="Marker „${esc(m.name || '')}” ${(+m.t).toFixed(2)}s – klik: skocz, dwuklik: zmień nazwę / usuń">◆<span>${esc(m.name || '')}</span></div>`}`; });
  scene.stops.forEach((s0, i) => { h = html`${h}${html`<div class="stopm" data-stop="${i}" style="left:${s0 * pps}px" title="Stop ${(+s0).toFixed(2)}s – przeciągnij; dwuklik usuwa">▼</div>`}`; });
  h = html`${h}${html`<div class="endm" style="left:${dur * pps}px" title="koniec sceny"></div></div></div>`}`;
  const bar = (id, sec, cls, a, b, label, title, handle = true) => html`<div class="mb ${cls}" data-mb="${id}|${sec}" style="left:${a * pps}px;width:${Math.max(4, (b - a) * pps)}px" title="${esc(title)}">${esc(label)}${handle ? html`<i class="mbh" data-mbh="${id}|${sec}"></i>` : ''}</div>`;
  for (const n of nodes) {
    const m = n.motion || {}, s0 = sh.get(n.id) || 0, tx = n.props?.text, kp = keyProps(n), open = !tlFold.has(n.id);
    const after = m.after && locate(m.after)?.node;
    h = html`${h}${html`<div class="tl-row seq node ${n.id === selId ? 'sel' : ''}" data-node="${n.id}"><div class="tl-lbl" data-sel="${n.id}" title="${esc(n.name)}${after ? ` – wchodzi po „${after.name}”` : ''} · dwuklik w pasku: dodaj preset">${kp.length ? html`<span class="car" data-fold="${n.id}">${open ? '▾' : '▸'}</span>` : html`<span class="car"></span>`}${TYPES[n.type]?.icon || ''} ${esc(n.name)}${after ? html` <span class="dim">↳ ${esc(after.name)}</span>` : ''}${kp.length && !open ? html` <span class="dim">◆${kp.length}</span>` : ''}</div><div class="tl-area" data-nrow="${n.id}" style="width:${W}px">`}`;
    if (m.loop?.type && m.loop.type !== 'none') {
      const a = MO.inEnd(m, s0, tx), b = Number.isFinite(oS) ? oS : dur;
      if (b > a) h = html`${h}${bar(n.id, 'loop', 'loop', a, b, 'pętla: ' + (MO.LOOP_LABELS[m.loop.type] || m.loop.type), 'pętla uwagi – gra, gdy grafika stoi (klik: zakładka Ruch)', false)}`;
    }
    if (m.in?.type) {
      const a = s0 + MO.specDelay(m.in), d = m.in.type === 'none' ? 0 : MO.specDur(m.in);
      h = html`${h}${bar(n.id, 'in', 'in' + (after ? ' after' : ''), a, a + d, MO.ANIM_LABELS[m.in.type] || m.in.type, `wejście: ${MO.ANIM_LABELS[m.in.type] || m.in.type} · start ${a.toFixed(2)} s · czas ${d.toFixed(2)} s – przeciągnij: opóźnienie, krawędź: czas, w pionie na inny element: „po węźle”; klik: zakładka Ruch; prawy klik: menu`)}`;
    }
    if (m.textIn?.type && m.textIn.type !== 'none') {
      const a = s0 + MO.specDelay(m.textIn), d = MO.specDur(m.textIn) + MO.textSpread(m.textIn, tx);
      h = html`${h}${bar(n.id, 'textIn', 'tin', a, a + d, '', `tekst IN: ${MO.textLabel(m.textIn.type)} · ${a.toFixed(2)}–${(a + d).toFixed(2)} s`)}`;
    }
    if (Number.isFinite(oS)) {
      if (m.out?.type) {
        const a = oS + MO.specDelay(m.out), d = m.out.type === 'none' ? 0 : MO.specDur(m.out);
        h = html`${h}${bar(n.id, 'out', 'out', a, a + d, MO.ANIM_LABELS[m.out.type] || m.out.type, `wyjście: ${MO.ANIM_LABELS[m.out.type] || m.out.type} · start ${a.toFixed(2)} s (od ostatniego stopu) · czas ${d.toFixed(2)} s`)}`;
      }
      if (m.textOut?.type && m.textOut.type !== 'none') {
        const a = oS + MO.specDelay(m.textOut), d = MO.specDur(m.textOut) + MO.textSpread(m.textOut, tx);
        h = html`${h}${bar(n.id, 'textOut', 'tout', a, a + d, '', `tekst OUT: ${MO.textLabel(m.textOut.type)} · ${a.toFixed(2)}–${(a + d).toFixed(2)} s`)}`;
      }
    }
    h = html`${h}${html`</div></div>`}`;
    if (!open) continue;
    const pp = kp.length ? presetProps(n) : new Set();
    for (const pr of kp) {
      const tr = n.anim[pr];
      h = html`${h}${html`<div class="tl-row kr ${n.id === selId ? 'sel' : ''}"><div class="tl-lbl" data-sel="${n.id}" title="${esc(n.name)}.${pr}${pp.has(pr) ? ' – preset ruchu też zmienia tę właściwość (składają się)' : ''}">${esc(PROPS[pr]?.label || pr)}${pp.has(pr) ? html`<span class="pz">+ preset</span>` : ''}</div><div class="tl-area" data-row="${n.id}|${pr}" style="width:${W}px">`}`;
      for (let i = 0; i < tr.length - 1; i++) {
        const a = tr[i], b = tr[i + 1];
        h = html`${h}${html`<div class="seg ${a.v === b.v || a.e === 'hold' ? 'hold' : ''}" style="left:${a.t * pps}px;width:${(b.t - a.t) * pps}px"></div>`}`;
      }
      tr.forEach((k, i) => {
        const sel = selKeys.some((x) => x.key === k) || (selKey && selKey.node === n && selKey.prop === pr && selKey.key === k);
        h = html`${h}${html`<div class="kf ${sel ? 'sel' : ''}" data-k="${n.id}|${pr}|${i}" style="left:${k.t * pps}px" title="${k.t.toFixed(2)}s = ${esc(k.v)} (${k.e || 'inout'})"></div>`}`;
      });
      h = html`${h}${html`</div></div>`}`;
    }
  }
  scene.stops.forEach((s0) => { h = html`${h}${html`<div class="stopline" style="left:${LBL + s0 * pps}px"></div>`}`; });
  h = html`${h}${html`<div class="endline" style="left:${LBL + dur * pps}px"></div>`}`;
  h = html`${h}${html`<div id="playhead" style="left:${LBL + t * pps}px"></div></div>`}`;
  const sl = $('#tl').scrollLeft;
  setHtml($('#tl'), h);
  $('#tl').scrollLeft = sl;
  $('#dur').value = scene.duration;
  renderKeyEd();
}
/** Elementy, których dotyczą narzędzia sekwencji: dzieci zaznaczonej grupy, rodzeństwo zaznaczonego elementu albo scena. */
function seqTargets() {
  const n = selNode();
  if (n?.children?.length) return n.children;
  if (n) return locate(n.id).list;
  if (scene.nodes.length === 1 && scene.nodes[0].children?.length) return scene.nodes[0].children;
  return scene.nodes;
}
export const r2 = (v) => Math.round(v * 100) / 100;
export async function seqTool(act) {
  const n = selNode();
  if (act === 'fit') return fitMotionTiming();
  if (act === 'stagger') {
    const step = Math.max(0, parseFloat($('#seqStep').value) || 0);
    let list = seqTargets();
    if (!list.length) return;
    checkpoint();
    const withIn = list.filter((x) => x.motion?.in?.type);
    if (!withIn.length) for (const x of list) (x.motion ||= {}).in = { type: 'fade', dur: 0.4, ease: 'power2.out' };
    list = list.filter((x) => x.motion?.in?.type);
    const base = MO.specDelay(list[0].motion.in);
    list.forEach((x, i) => { delete x.motion.after; x.motion.in.delay = r2(base + i * step); if (!x.motion.in.delay) delete x.motion.in.delay; });
    const outs = list.filter((x) => x.motion.out?.type);
    outs.forEach((x, i) => { const d = r2((outs.length - 1 - i) * step); if (d) x.motion.out.delay = d; else delete x.motion.out.delay; });
    toast(`Kaskada: ${list.length} elementów co ${step} s${outs.length ? ' (wyjścia odwrotnie)' : ''}`);
  } else if (act === 'chain') {
    const list = seqTargets().filter((x) => x.motion?.in?.type || x.motion?.textIn?.type);
    if (list.length < 2) return toast('Po kolei: potrzeba co najmniej dwóch elementów z ruchem wejścia', true);
    checkpoint();
    list.forEach((x, i) => { if (i) x.motion.after = list[i - 1].id; else delete x.motion.after; });
    toast(`Po kolei: ${list.length} elementów`);
  } else if (act === 'copy') {
    if (!n?.motion) return toast('Zaznacz element z ruchem do skopiowania', true);
    const list = locate(n.id).list.filter((x) => x !== n);
    if (!list.length || !(await confirmBox(`Ruch „${n.name}” zastąpi ruch ${list.length} element(ów) obok.`, { title: 'Skopiować ruch?', ok: 'Kopiuj' }))) return;
    checkpoint();
    for (const x of list) {
      const m = structuredClone(n.motion); delete m.after;
      if (x.type !== 'text' && x.type !== 'clock') { delete m.textIn; delete m.textOut; }
      if (Object.keys(m).length) x.motion = m; else delete x.motion;
    }
    toast(`Skopiowano ruch na ${list.length} element(y)`);
  } else if (act === 'keys') {
    if (!n?.motion?.in && !n?.motion?.out) return toast('Zaznacz element z presetem wejścia lub wyjścia', true);
    checkpoint();
    const skipped = [], done = [];
    for (const sec of ['in', 'out']) if (n.motion?.[sec]) { const r = phaseToKeys(n, sec); done.push(...r.done); skipped.push(...r.skipped); }
    if (!done.length) { undo.pop(); return showReport('Na klucze – nic nie zamieniono', skipped); }
    if (skipped.length) showReport('Na klucze – część pominięta', skipped); else toast('Presety zamienione na klucze (scalone z istniejącymi)');
  } else if (act === 'fromkeys') {
    if (!n || !MO.MOTION_PROPS.some((p) => n.anim?.[p]?.length >= 2)) return toast('Zaznacz element z kluczami położenia, krycia, skali, skosu, rozmycia lub przycięcia', true);
    // zaznaczone klucze (klik / Shift / ramka na osi) – tylko ich właściwości; inaczej wszystkie
    const only = new Set(selKeys.filter((x) => x.node === n).map((x) => x.prop));
    const src = only.size ? Object.fromEntries(Object.entries(n.anim).filter(([p]) => only.has(p))) : n.anim;
    const defaults = Object.fromEntries(MO.MOTION_PROPS.map((p) => [p, PROPS[p].d]));
    const opt = { props: n.props || {}, defaults, sample: (p, t) => +trackValue(n.anim[p], t, 'num') || 0, outStart: outStartOf(), shift: MO.sequenceShifts(scene.nodes).get(n.id) || 0 };
    let r = MO.keysToMotion(src, opt);
    if (r.skipped.length) {
      const a = MO.keysToMotion(src, { ...opt, approx: true });
      if (a.approx.length && await confirmBox(`Części kluczy nie da się zapisać dokładnie presetem:\n${a.approx.join('\n')}`, { title: 'Zamienić w przybliżeniu?', ok: 'Zamień' })) r = a;
    }
    if (!r.done.length) return showReport('Z kluczy – nic nie zamieniono', r.skipped);
    const busy = Object.keys(r.motion).filter((k) => n.motion?.[k]);
    if (busy.length) return toast(`Z kluczy: element ma już preset (${busy.map((k) => k === 'in' ? 'wejście' : 'wyjście').join(', ')}) – usuń go albo rozbij na klucze`, true);
    checkpoint();
    n.anim = { ...Object.fromEntries(Object.entries(n.anim).filter(([p]) => !(p in src))), ...r.anim }; if (!Object.keys(n.anim).length) delete n.anim;
    n.props = { ...(n.props || {}), ...r.props };
    const mo = (n.motion ||= {});
    Object.assign(mo, r.motion);
    if (r.dropAfter) delete mo.after;
    setSelKeys([]); setSelKey(null);
    if (r.skipped.length) showReport('Z kluczy – część zostaje kluczami', r.skipped); else toast('Klucze zamienione na presety (klipy na osi czasu)');
  } else if (act === 'clear') {
    const list = n ? [n] : seqTargets();
    const withM = list.filter((x) => x.motion);
    if (!withM.length || !(await confirmBox(`Presety, pętle i efekty tekstu zostaną usunięte z ${withM.length} element(ów).`, { title: 'Usunąć ruch?', ok: 'Usuń' }))) return;
    checkpoint();
    for (const x of withM) delete x.motion;
  }
  renderTimeline(); renderProps(); refresh();
}
/** Rozbij jedną fazę (wejście / wyjście) na klucze. Właściwości, które mają już klucze, nie są odrzucane – preset dodaje
 *  się do ścieżki (położenie, skos, rozmycie, przycięcie – różnica, krycie i skala – iloraz względem spoczynku w chwili startu
 *  fazy), jak składa je renderer. Woła się po checkpoint(). Zwraca { done, skipped }. */
function phaseToKeys(n, sec) {
  const spec = n.motion?.[sec]; if (!spec) return { done: [], skipped: [] };
  const shift = MO.sequenceShifts(scene.nodes).get(n.id) || 0, oS = outStartOf();
  const t0 = sec === 'in' ? shift + MO.specDelay(spec) : oS + MO.specDelay(spec);
  const rest = restOf(n, Number.isFinite(t0) ? t0 : 0);
  const r = MO.motionToKeys({ [sec]: spec }, { rest, outStart: oS, shift });
  if (!r.done.length) return { done: [], skipped: r.skipped };
  n.anim ||= {};
  const MUL = new Set(['opacity', 'scale']);
  for (const [pr, pk] of Object.entries(r.anim)) {
    const tr = n.anim[pr];
    if (!tr?.length) { n.anim[pr] = pk; continue; }
    const a = pk[0].t, b = pk[pk.length - 1].t, base = rest[pr];
    const times = [...new Set([...tr.map((k) => k.t), ...pk.map((k) => k.t)])].sort((x, y) => x - y);
    const old = new Map(tr.map((k) => [k.t, k.e]));
    n.anim[pr] = times.map((tt) => {
      const v0 = +trackValue(tr, tt, 'num') || 0;
      if (tt < a - 1e-9 || tt > b + 1e-9) return { t: tt, v: v0, e: old.get(tt) || 'linear' };
      const pv = +trackValue(pk, tt, 'num') || 0;
      const v = MUL.has(pr) ? (Math.abs(base) > 1e-9 ? v0 * pv / base : v0) : v0 + pv - base;
      return { t: tt, v: Math.round(v * 1000) / 1000, e: 'linear' };
    });
  }
  delete n.motion[sec];
  if (!n.motion.in && !n.motion.textIn) delete n.motion.after;
  if (!Object.keys(n.motion).length) delete n.motion;
  return { done: r.done, skipped: r.skipped };
}
const PH_DEF = { in: { type: 'fade', dur: 0.4, ease: 'power2.out' }, out: { type: 'fade', dur: 0.3, ease: 'power2.in' }, textIn: { type: 'reveal', dur: 0.6 }, textOut: { type: 'fade', dur: 0.4 }, loop: { type: 'pulse' } };
const PH_LABEL = { in: 'wejście', out: 'wyjście', textIn: 'efekt tekstu IN', textOut: 'efekt tekstu OUT', loop: 'pętla' };
/** Menu osi czasu (to samo okno co menu kanwy): klip – rozbij na klucze, usuń, zakładka Ruch; pusty wiersz – dodaj fazę. */
export function tlMenu(e, nid, sec) {
  const n = locate(nid)?.node; if (!n) return;
  if (selId !== nid) select(nid);
  const b = (act, label, off = false, tip = '') => html`<button data-cx="tl:${act}|${nid}" ${off ? 'disabled' : ''} title="${esc(tip)}"><span>${label}</span></button>`;
  let h = '';
  if (sec) {
    const keyable = (sec === 'in' || sec === 'out') && (() => { try { return MO.motionToKeys({ [sec]: n.motion[sec] }, { rest: restOf(n, 0), outStart: Number.isFinite(outStartOf()) ? outStartOf() : 1, shift: 0 }).done.length > 0; } catch { return false; } })();
    h = html`${h}${html`<div class="h4">${esc(PH_LABEL[sec] || sec)}</div>`}${b('keys:' + sec, 'Rozbij na klucze', !keyable, keyable ? 'Preset → klucze; z istniejącymi kluczami tych właściwości – scalenie' : sec === 'in' || sec === 'out' ? 'Ten typ ruchu nie ma odpowiednika w kluczach (przesłona, obrót, odwrócenie…)' : 'Pętle i efekty tekstu zostają presetami')}${b('tab:' + sec, 'Pokaż w zakładce Ruch')}${b('del:' + sec, 'Usuń ' + (PH_LABEL[sec] || sec))}`;
  } else {
    const m = n.motion || {}, txt = n.type === 'text' || n.type === 'clock';
    h = html`${h}${html`<div class="h4">Dodaj ruch</div>`}`;
    for (const k of ['in', 'out', 'textIn', 'textOut', 'loop']) {
      if ((k === 'textIn' || k === 'textOut') && !txt) continue;
      const has = k === 'loop' || k === 'textIn' || k === 'textOut' ? m[k]?.type && m[k].type !== 'none' : !!m[k]?.type;
      h = html`${h}${b('add:' + k, '＋ ' + PH_LABEL[k], has)}`;
    }
    h = html`${h}${html`<hr>`}${b('fromkeys:', 'Zrób preset z kluczy', !MO.MOTION_PROPS.some((pr) => n.anim?.[pr]?.length >= 2), 'Zaznaczone klucze (klik / Shift / ramka) albo wszystkie')}`;
  }
  const mn = $('#ctxMenu'); setHtml(mn, h); mn.hidden = false;
  const r = mn.getBoundingClientRect();
  mn.style.left = Math.min(e.clientX, innerWidth - r.width - 4) + 'px'; mn.style.top = Math.min(e.clientY, innerHeight - r.height - 4) + 'px';
}
export function showPhase(sec) {
  pui.tab = 'ruch'; savePui(); renderProps();
  const el = $(`#props .mo[data-ph="${sec}"]`);
  if (el) { el.scrollIntoView({ block: 'nearest' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
}
export async function tlAction(a) {
  const [act, nid] = a.slice(3).split('|'), [op, sec] = act.split(':');
  const n = locate(nid)?.node; if (!n) return;
  if (op === 'tab') { showPhase(sec); return; }
  if (op === 'fromkeys') { await seqTool('fromkeys'); return; }
  checkpoint();
  if (op === 'add') { (n.motion ||= {})[sec] = structuredClone(PH_DEF[sec]); if (sec === 'out' && !sortedStops().length) toast('Wyjście gra od ostatniego stop pointu – dodaj stop (albo „dopasuj” w zakładce Ruch)'); }
  else if (op === 'del') { delete n.motion?.[sec]; if (n.motion && !Object.keys(n.motion).length) delete n.motion; }
  else if (op === 'keys') { const r = phaseToKeys(n, sec); if (!r.done.length) { undo.pop(); showReport('Na klucze – nic nie zamieniono', r.skipped); return; } toast('Faza zamieniona na klucze (scalone z istniejącymi)'); }
  refresh(); renderTimeline(); renderProps();
  if (op === 'add') showPhase(sec);
}
/** Czy ustawienie „po węźle” a → b dałoby pętlę. */
export function afterCycle(nid, target) { let cur = target; for (let i = 0; cur && i < 200; i++) { if (cur === nid) return true; cur = locate(cur)?.node?.motion?.after; } return false; }
export function renderKeyEd() {
  const el = $('#keyed');
  if (!selKey || !selKey.node.anim?.[selKey.prop]?.includes(selKey.key)) { setSelKey(null); setHtml(el, html`<span class="dim" style="font-size:11px">KLUCZ</span><span class="dim" style="font-size:12px">kliknij klucz (◆) na ścieżce, aby zmienić jego czas, wartość i krzywą · dwuklik na ścieżce = nowy klucz</span>`); return; }
  const k = selKey.key, d = PROPS[selKey.prop];
  setHtml(el, html`<span class="dim" style="font-size:11px">KLUCZ</span><b style="font-size:12px">${esc(selKey.node.name)}.${esc(d?.label || selKey.prop)}</b>
    <label>t</label><input id="kt" type="number" step="0.01" value="${k.t}">
    <label>wart.</label><input id="kv" ${d?.t === 'num' ? html`type="number" step="any"` : ''} value="${esc(k.v)}">
    <select id="ke" title="krzywa do następnego klucza">${EASES.map((e) => html`<option ${(k.e || 'inout') === e ? 'selected' : ''}>${e}</option>`)}</select>
    <button class="icon danger" id="kdel" title="Usuń klucz"><i class="ico del"></i></button>`);
}
export function updatePlayhead() {
  const ph = $('#playhead'); if (ph) ph.style.left = LBL + t * pps + 'px';
  $('#tc').value = t.toFixed(2);
}
export function setTime(nt) {
  setT(Math.max(0, Math.min(scene.duration, Math.round(nt * 1000) / 1000)));
  player.seek(t);
  seekRefs();
  updatePlayhead();
  syncProps();
}

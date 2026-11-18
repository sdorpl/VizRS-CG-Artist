// Artist – edycja właściwości, kluczy, pól kontrolnych i reguł w panelu.

import { html, setHtml } from '/dom.js';
import * as PACK from '/cgpack.js';
import * as MO from '/motion.js';
import { PROPS, propAt, walk, listFields, variantFields, parseColor } from '/renderer.js';
import { promptBox } from '/native.js';
import { $, api, assetFonts, assets, checkpoint, dirty, loadAssets, multiOthers, num, pendingCP, player, resolveFont, save, scene, selKey, selNode, setDirty, setLastArea, setPendingCP, setSceneOffset, setSelKey, setSelKeys, t, toast } from './core.js';
import { RAD_UI, WHEN_SRC, applySearch, fitMotionTiming, folded, openRules, pui, renderProps, renderTree, savePui, syncProps } from './props.js';
import { renderTimeline, setTime, tlFold } from './timeline.js';
import { resetView } from './canvas.js';
import { buildRefs, queueGuides, rel, relApply, saveRel } from './refs.js';
import { dockEnd, dockOverlaps, dockParts, dockPlay, dockPv, dockRefTargets, dockStart } from './dock.js';
import { fetchAssetBytes, uploadBytes } from './scenes.js';

// ------------------------------------------------------------ edycja właściwości
export function setProp(n, p, v) {
  const tr = n.anim?.[p];
  if (tr?.length && PROPS[p]?.anim) setKey(n, p, t, v);
  else { n.props ||= {}; n.props[p] = v; }
}
/** Zmiana z panelu: przy blokadzie proporcji szerokość i wysokość zmieniają się razem. Przy kilku zaznaczonych – wszystkim,
 *  które mają tę właściwość: położenie x / y przesuwa się o tyle samo (układ zostaje), inne właściwości dostają tę samą wartość. */
function setPropUI(n, p, v) {
  const old = +propAt(n, p, t, null);
  setPropOne(n, p, v);
  for (const m of multiOthers(n, p)) {
    if ((p === 'x' || p === 'y') && typeof v === 'number' && Number.isFinite(old)) setPropOne(m, p, Math.round((+propAt(m, p, t, null) + v - old) * 1000) / 1000);
    else setPropOne(m, p, v);
  }
}
function setPropOne(n, p, v) {
  if (pui.ratio && (p === 'w' || p === 'h')) {
    const o = p === 'w' ? 'h' : 'w', old = +propAt(n, p, t, null), oo = +propAt(n, o, t, null);
    if (old > 0 && oo > 0) setProp(n, o, Math.round(oo * v / old * 1000) / 1000);
  }
  setProp(n, p, v);
}
export function setKey(n, p, at, v) {
  n.anim ||= {};
  const tr = (n.anim[p] ||= []);
  const k = tr.find((k) => Math.abs(k.t - at) < 0.0005);
  if (k) k.v = v; else tr.push({ t: Math.round(at * 1000) / 1000, v, e: 'inout' });
  tr.sort((a, b) => a.t - b.t);
}
function toggleKey(n, p) {
  n.anim ||= {};
  const tr = n.anim[p] || [];
  const i = tr.findIndex((k) => Math.abs(k.t - t) < 0.0005);
  if (i >= 0) {
    tr.splice(i, 1);
    if (!tr.length) { n.props ||= {}; delete n.anim[p]; }
  } else {
    const v = propAt(n, p, t, null);
    if (!tr.length) { n.props ||= {}; n.props[p] = v; }
    setKey(n, p, t, v);
  }
}
export function refresh() { player.apply(t); showSqueeze(); queueGuides(); }
/** Ściśnięcie zaznaczonego tekstu (jak wskaźnik w Trio); przepełnienie oznacza też ramka na kanwie (`data-over`). */
export function showSqueeze() {
  const el = $('#sqInfo'); if (!el) return;
  const n = selNode(), it = n && player.items.find((i) => i.node === n || i.node.id === n.id);
  if (!it?.sq) { setHtml(el, ''); return; }
  const one = it.sq.length === 1;
  setHtml(el, html`${it.sq.map((s, i) => html`<span class="${s < 0.7 || it.over ? 'bad' : s < 0.999 ? 'warn' : ''}">${one ? 'ściśnięcie' : 'w' + (i + 1)}: ${Math.round(s * 100)}%</span>`)}${it.over ? html`<span class="bad" title="Tekst wymaga ściśnięcia poniżej granicy (min. ściśnięcie) – wystaje poza ramkę">⚠︎ nie mieści się</span>` : ''}`);
}
function parseVal(p, inp) {
  const d = PROPS[p];
  if (d.t === 'bool') return inp.checked;
  if (d.t === 'num') {
    let v = parseFloat(inp.value);
    if (isNaN(v)) v = d.auto ?? 0; // puste pole właściwości z „auto” = brak nadpisania
    if (d.min != null) v = Math.max(d.min, v); if (d.max != null) v = Math.min(d.max, v);
    return v;
  }
  return inp.value;
}
function cp() { if (pendingCP) { checkpoint(); setPendingCP(false); } else setDirty(true); }
/** Po wpisaniu fontu: nazwa pliku z zasobów albo kanoniczna nazwa wbudowanej rodziny; ostrzeżenie o brakującym pliku. */
function checkFont(inp) {
  const v = resolveFont(inp.value);
  if (v !== inp.value) { inp.value = v; setPropUI(selNode(), inp.dataset.p, v); refresh(); syncProps(); toast(`Font: ${v}`); }
  else if (PACK.FONT_RE.test(v) && !assetFonts().includes(v)) toast(`Czcionki ${v} nie ma w zasobach – wgraj ją przyciskiem ⤒`, true);
}
function onPropInput(e) {
  const inp = e.target;
  if (inp.dataset.rel) {
    const k = inp.dataset.rel;
    if (k === 'gap') { if (e.type === 'input') { rel.gap = Math.round(parseFloat(inp.value) || 0); saveRel(); } return; }
    if (e.type !== 'change') return;
    if (k === 'dock') rel.dock = inp.checked; else rel[k] = inp.value;
    if (k === 'target') rel.node = '';
    saveRel(); if (k === 'target') renderProps();
    return;
  }
  if (e.type === 'change' && inp.type !== 'checkbox' && inp.tagName !== 'SELECT' && inp.type !== 'color') {
    setPendingCP(true);
    if (PROPS[inp.dataset.p]?.t === 'font' && selNode()) checkFont(inp);
    if (WHEN_SRC.has(inp.dataset.p) && selNode()) renderProps(); // widoczność zależnych właściwości (P4)
    return;
  }
  const n = selNode();
  if (n && (inp.dataset.mobg !== undefined || inp.dataset.moorg !== undefined)) {
    if (e.type !== 'change') return;
    checkpoint();
    const key = inp.dataset.mobg !== undefined ? 'bg' : 'origin';
    const v = key === 'bg' ? (inp.value === 'none' ? '' : inp.value) : inp.value ? inp.value.split(',').map(Number) : '';
    if (v) (n.motion ||= {})[key] = v; else if (n.motion) { delete n.motion[key]; if (!Object.keys(n.motion).length) delete n.motion; }
    refresh(); renderTimeline(); return;
  }
  if (n && inp.dataset.moafter !== undefined) {
    if (e.type !== 'change') return;
    checkpoint();
    if (inp.value) (n.motion ||= {}).after = inp.value; else if (n.motion) { delete n.motion.after; if (!Object.keys(n.motion).length) delete n.motion; }
    refresh(); renderTimeline(); return;
  }
  if (n && inp.dataset.mo) {
    if (e.type === 'input' && inp.tagName === 'SELECT') return; // wybór obsługuje 'change'
    cp();
    const [sec, key] = inp.dataset.mo.split('.');
    const mo = (n.motion ||= {});
    const s = (mo[sec] ||= {});
    let v = inp.value.trim();
    if (inp.type === 'number') v = v === '' ? '' : Math.max(0, parseFloat(v) || 0);
    if (v === '' || (key === 'type' && v === 'none' && sec !== 'in' && sec !== 'out')) {
      if (key === 'type') delete mo[sec]; else delete s[key];
    } else s[key] = v;
    if (key === 'type' && s.type && (sec === 'in' || sec === 'out') && s.dur == null) Object.assign(s, { dur: 0.5, ease: sec === 'out' ? 'power2.in' : 'power2.out', ...(MO.DIR_TYPES.has(s.type) && !s.dir ? { dir: 'left' } : {}) });
    if (key === 'type' && sec.startsWith('text') && mo[sec] && s.dur == null) s.dur = 0.6;
    if (mo[sec] && !Object.keys(mo[sec]).length) delete mo[sec];
    if (!Object.keys(mo).length) delete n.motion;
    refresh(); renderTimeline();
    if (key === 'type' || e.type === 'change') renderProps();
    return;
  }
  if (inp.id === 'pkPick') { if (inp.value && e.type === 'change') { checkpoint(); scene.packAssets = [...new Set([...(scene.packAssets || []), inp.value])]; renderProps(); } return; }
  if (inp.id === 'pname' && n) { cp(); n.name = inp.value; renderTree(); return; }
  if (n && inp.dataset.p) {
    cp(); setPropUI(n, inp.dataset.p, parseVal(inp.dataset.p, inp)); refresh();
    if (n.type === 'ticker' && (inp.dataset.p === 'tickerMode' || (inp.dataset.p === 'catColors' && e.type === 'change'))) { renderProps(); return; }
    if (e.type === 'change' && WHEN_SRC.has(inp.dataset.p)) { renderProps(); return; }
    if (n.anim?.[inp.dataset.p]?.length) renderTimeline();
    syncProps(); return;
  }
  if (n && inp.dataset.pc) {
    cp();
    const p = inp.dataset.pc;
    const cur = parseColor(propAt(n, p, t, null));
    let v = inp.value;
    if (cur && cur[3] < 1) v += Math.round(cur[3] * 255).toString(16).padStart(2, '0');
    setPropUI(n, p, v); refresh(); syncProps(); return;
  }
  if (inp.dataset.sp) {
    if (e.type === 'change' && inp.tagName !== 'SELECT') return;
    cp();
    const k = inp.dataset.sp;
    if (k === 'x' || k === 'y') { const v = Math.round(parseFloat(inp.value) || 0); setSceneOffset(k === 'x' ? v : +scene.x || 0, k === 'y' ? v : +scene.y || 0); return; }
    const num = ['width', 'height', 'duration'].includes(k);
    let v = num ? parseFloat(inp.value) : inp.value;
    if (num && !(v > 0)) return;
    scene[k] = v;
    if (k === 'width' || k === 'height') { player.setScene(scene); resetView(); }
    if (k === 'duration') { if (t > v) setTime(v); renderTimeline(); }
    if (k === 'name' || k === 'layer') { renderTree(); }
    if (k === 'layer') buildRefs();
    return;
  }
  if (inp.dataset.si) {
    const n2 = selNode(); if (!n2) return;
    cp();
    n2.showIf ||= {};
    n2.showIf[inp.dataset.si] = inp.value;
    if (!n2.showIf.field) delete n2.showIf;
    else if (inp.dataset.si === 'field') { const vf = variantFields(scene).find((f) => f.id === inp.value); n2.showIf.value = vf?.opts[0] || ''; renderProps(); }
    refresh(); return;
  }
  if (inp.dataset.vopt || inp.dataset.vdef) {
    cp();
    const id = inp.dataset.vopt || inp.dataset.vdef, m = scene.fieldMeta[id];
    if (inp.dataset.vopt) { m.options = inp.value.split(',').map((s) => s.trim()).filter(Boolean); if (!m.options.includes(m.default)) m.default = m.options[0]; }
    else m.default = inp.value;
    refresh(); return;
  }
  if (inp.dataset.dkadd !== undefined) {
    if (e.type !== 'change' || !inp.value) return;
    const i = +inp.dataset.dkadd, d = scene.dock?.[i]; if (!d) return;
    const v = inp.value; inp.value = '';
    const put = (part) => {
      if (!part || dockParts(d).includes(part)) return;
      checkpoint(); d.target = [...dockParts(d), part].join('|');
      if (dockPv?.i === i) dockStart(i, dockPv.set, true);
      renderProps();
    };
    if (v === 'page:') promptBox('Numer strony Trio, której obecność na antenie przesuwa tę scenę:', '', { title: 'Cel: strona' }).then((n) => { n = String(n ?? '').trim(); if (/^\d+$/.test(n)) put('page:' + n); else if (n) toast('Numer strony to liczba', true); });
    else put(v);
    return;
  }
  if (inp.dataset.dk) {
    const [i, key] = inp.dataset.dk.split('::');
    const d = scene.dock?.[+i]; if (!d) return;
    if (key === 'ease' || key === 'edge' || key === 'back') {
      if (e.type !== 'change') return;
      cp();
      if (!inp.value || (key === 'ease' && inp.value === 'std')) delete d[key]; else d[key] = inp.value;
      if (key === 'edge' && !d.edge) delete d.gap;
      if (dockPv) dockPlay(false);
      if (key !== 'ease') renderProps();
      return;
    }
    cp();
    d[key] = key === 'target' ? inp.value.trim() : (parseFloat(inp.value) || 0);
    if (key !== 'target' && e.type === 'change') { const w = document.querySelector('.dkwarn'); if (!w !== !dockOverlaps().length) renderProps(); }
    if (dockPv) { if (key === 'target' && dockPv.i === +i) dockStart(dockPv.i, dockPv.set, true); else dockPlay(false); }
    return;
  }
  if (inp.dataset.fr) {
    cp();
    const [fid, key] = inp.dataset.fr.split('::');
    scene.fieldMeta ||= {};
    const m = (scene.fieldMeta[fid] ||= {});
    if (inp.type === 'checkbox') {
      if (key === 'rich' || key === 'spell') { if (inp.checked) delete m[key]; else m[key] = false; } // domyślnie włączone
      else if (inp.checked) m[key] = true; else delete m[key];
    } else if (inp.type === 'number') {
      const v = parseInt(inp.value);
      if (v > 0 || (key === 'tab' && v === 0)) m[key] = v; else delete m[key];
    } else if (key === 'cats') {
      const list = inp.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (list.length) m.cats = list; else delete m.cats;
    } else if (inp.value.trim()) m[key] = inp.value; else delete m[key];
    if (m.softMax && m.maxChars && m.softMax > m.maxChars) { m.softMax = m.maxChars; }
    return;
  }
  if (inp.dataset.fm) {
    cp();
    scene.fieldMeta ||= {};
    scene.fieldMeta[inp.dataset.fm] = { ...(scene.fieldMeta[inp.dataset.fm] || {}), label: inp.value };
  }
}
/**
 * Plik wgrywany ręcznie (⤒ przy polu, „Wgraj i dołącz”, przeciągnięcie, skojarzenie) – reguły `PACK.assetPlacer`:
 * nic nie jest nadpisywane, czcionka już wgrana (ta sama treść) nie powstaje drugi raz. Zwraca { name } pliku w zasobach.
 */
export async function placeFile(f) {
  await loadAssets();
  const place = PACK.assetPlacer({ existing: assets.map((a) => a.name), fetchAsset: fetchAssetBytes, upload: uploadBytes });
  const r = await place(f.name, new Uint8Array(await f.arrayBuffer()));
  await loadAssets();
  toast(r.status === 'reused' ? `Ta czcionka jest już w zasobach jako ${r.name} – użyto istniejącej`
    : r.status === 'same' ? `${r.name} jest już w zasobach`
      : r.status === 'renamed' ? `Wgrano jako ${r.name}${assets.some((a) => a.name.toLowerCase() === PACK.safeAssetName(f.name)?.toLowerCase() && a.name !== r.name) ? ' (nazwa zajęta przez inny plik – nic nie nadpisano)' : ''}`
        : 'Wgrano ' + r.name);
  return { name: r.name };
}
export function uploadAsset(accept = 'image/*,video/mp4,video/webm,.ttf,.otf,.woff,.woff2') {
  return new Promise((res) => {
    const fi = $('#fileIn');
    fi.accept = accept;
    fi.value = '';
    fi.onchange = async () => {
      const f = fi.files[0]; if (!f) return res(null);
      try { res(await placeFile(f)); } catch (e) { toast('Upload: ' + e.message, true); res(null); }
    };
    fi.click();
  });
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  $('#props').addEventListener('focusin', () => { setPendingCP(true); setLastArea('props'); });
  $('#props').addEventListener('input', onPropInput);
  $('#props').addEventListener('change', onPropInput);
  $('#props').addEventListener('click', async (e) => {
    const n = selNode();
    const fo = e.target.closest('[data-fold]');
    if (fo) { const g = fo.dataset.fold; pui.fold[g] = !folded(g); savePui(); fo.parentElement.classList.toggle('fold', folded(g)); return; }
    if (e.target.closest('[data-pall]')) { pui.all = true; savePui(); renderProps(); return; }
    const ro = e.target.closest('[data-relop]');
    if (ro) { relApply(ro.dataset.relop, ro.dataset.relfor === 'node'); return; }
    if (e.target.closest('[data-radx]')) { pui.radius = !e.target.closest('[data-radx]').classList.contains('on'); savePui(); renderProps(); return; }
    if (e.target.closest('[data-radclr]') && n) {
      checkpoint();
      for (const x of Object.keys(RAD_UI)) { if (n.props) delete n.props[x]; if (n.anim) delete n.anim[x]; if (n.fields) delete n.fields[x]; }
      pui.radius = false; savePui(); refresh(); renderProps(); renderTimeline(); return;
    }
    if (e.target.closest('[data-ratio]')) { pui.ratio = !pui.ratio; savePui(); e.target.closest('[data-ratio]').classList.toggle('on', pui.ratio); return; }
    const an = e.target.closest('[data-anchor]');
    if (an && n) { const [ax, ay] = an.dataset.anchor.split(','); checkpoint(); setPropUI(n, 'anchorX', ax); setPropUI(n, 'anchorY', ay); refresh(); syncProps(); return; }
    const sg = e.target.closest('[data-seg]');
    if (sg && n) { checkpoint(); setPropUI(n, sg.dataset.seg, sg.dataset.v); refresh(); syncProps(); return; }
    const kb = e.target.closest('[data-key]');
    if (kb && n) { checkpoint(); toggleKey(n, kb.dataset.key); refresh(); syncProps(); renderTimeline(); renderTree(); return; }
    const fb = e.target.closest('[data-field]');
    if (fb && n) {
      const p = fb.dataset.field;
      const cur = n.fields?.[p] || '';
      const v = await promptBox(`Litery, cyfry, _ . -; puste = usuń.`, cur || n.name.replace(/[^\w.\-]/g, '_'), { title: `Pole kontrolne „${n.name}.${p}”` });
      if (v === null) return;
      checkpoint();
      n.fields ||= {};
      const id = v.trim().replace(/[^\w.\-]/g, '_');
      if (id) n.fields[p] = id; else delete n.fields[p];
      renderTree(); syncProps(); return;
    }
    const ub = e.target.closest('[data-upload]');
    if (ub && n) { const a = await uploadAsset(ub.dataset.accept); if (a) { checkpoint(); setPropUI(n, ub.dataset.upload, a.name); renderProps(); refresh(); } return; }
    if (e.target.closest('[data-mofit]')) { fitMotionTiming(); return; }
    const kj = e.target.closest('[data-kjump]');
    if (kj) { // zakładka Ruch: skok do ścieżki klucza na osi czasu
      const n = selNode(), tr = n?.anim?.[kj.dataset.kjump]; if (!tr?.length) return;
      tlFold.delete(n.id); setSelKey({ node: n, prop: kj.dataset.kjump, key: tr[0] }); setSelKeys([selKey]);
      setTime(tr[0].t); renderTimeline();
      $(`#tl .tl-area[data-row="${CSS.escape(n.id + '|' + kj.dataset.kjump)}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.target.id === 'pkAdd') { const a = await uploadAsset(); if (a) { checkpoint(); scene.packAssets = [...new Set([...(scene.packAssets || []), a.name])]; renderProps(); refresh(); } return; }
    const pkr = e.target.closest('[data-pkrm]');
    if (pkr) { checkpoint(); scene.packAssets = (scene.packAssets || []).filter((x) => x !== pkr.dataset.pkrm); if (!scene.packAssets.length) delete scene.packAssets; renderProps(); return; }
    const dkr = e.target.closest('[data-dkrm]');
    if (dkr) {
      const [i, k] = dkr.dataset.dkrm.split('::').map(Number), d = scene.dock?.[i]; if (!d) return;
      checkpoint(); const parts = dockParts(d); parts.splice(k, 1); d.target = parts.join('|');
      if (dockPv?.i === i) { if (parts.length) dockStart(i, dockPv.set, true); else dockEnd(); }
      renderProps(); return;
    }
    const dkw = e.target.closest('[data-dkraw]');
    if (dkw) {
      const i = +dkw.dataset.dkraw, d = scene.dock?.[i]; if (!d) return;
      promptBox('Cel reguły – layer:<warstwa>, page:<numer>, scene:<nazwa>; kilka rozdziel znakiem |', d.target || '', { title: 'Cel powiązania' }).then((v) => {
        if (v == null) return;
        checkpoint(); d.target = dockParts({ target: v }).join('|');
        if (dockPv?.i === i) dockStart(i, dockPv.set, true);
        renderProps();
      });
      return;
    }
    if (e.target.id === 'dkAdd') { checkpoint(); (scene.dock ||= []).push({ target: 'layer:back', dx: 0, dy: -90, dur: 0.6 }); renderProps(); return; }
    if (e.target.id === 'dkRef') {
      const target = dockRefTargets(); if (!target) return;
      checkpoint(); (scene.dock ||= []).push({ target, dx: 0, dy: 0, dur: 0.6 });
      dockStart(scene.dock.length - 1, true); return;
    }
    const dkp = e.target.closest('[data-dkpv]');
    if (dkp) { const i = +dkp.dataset.dkpv; if (dockPv?.i === i && !dockPv.set) dockEnd(); else dockStart(i, false); return; }
    const dks = e.target.closest('[data-dkset]');
    if (dks) { const i = +dks.dataset.dkset; if (dockPv?.i === i && dockPv.set) dockEnd(true); else dockStart(i, true); return; }
    const dkd = e.target.closest('[data-dkdel]');
    if (dkd) { if (dockPv) dockEnd(); checkpoint(); scene.dock.splice(+dkd.dataset.dkdel, 1); if (!scene.dock.length) delete scene.dock; renderProps(); return; }
    const mks = e.target.closest('[data-mkstop]');
    if (mks) { const m = scene.markers[+mks.dataset.mkstop]; if (scene.stops.some((x) => Math.abs(x - m.t) < 0.005)) return toast('Stop w tym miejscu już istnieje'); checkpoint(); scene.stops.push(+m.t.toFixed(3)); scene.stops.sort((a, b) => a - b); renderProps(); renderTimeline(); return; }
    const mkr = e.target.closest('[data-rmmk]');
    if (mkr) { checkpoint(); scene.markers.splice(+mkr.dataset.rmmk, 1); renderProps(); renderTimeline(); return; }
    const ft = e.target.closest('[data-frtoggle]');
    if (ft) { const id = ft.dataset.frtoggle; if (openRules.has(id)) openRules.delete(id); else openRules.add(id); renderProps(); return; }
    if (e.target.closest('[data-scene0]')) { checkpoint(); setSceneOffset(0, 0); return; }
    const rs = e.target.closest('[data-rmstop]');
    if (rs) { checkpoint(); scene.stops.splice(+rs.dataset.rmstop, 1); renderProps(); renderTimeline(); return; }
    const vd = e.target.closest('[data-vdel]');
    if (vd) { checkpoint(); delete scene.fieldMeta[vd.dataset.vdel]; walk(scene.nodes, (x) => { if (x.showIf?.field === vd.dataset.vdel) delete x.showIf; }); renderProps(); refresh(); return; }
    if (e.target.id === 'addVar') {
      const id = await promptBox('Nazwa pola wariantu (np. styl)', 'styl', { title: 'Nowy wariant' }); if (!id) return;
      const opts = await promptBox('Opcje, po przecinku', 'info, pilne', { title: `Wariant „${id}”` }); if (!opts) return;
      checkpoint();
      scene.fieldMeta ||= {};
      const o = opts.split(',').map((s) => s.trim()).filter(Boolean);
      scene.fieldMeta[id.replace(/[^\w.\-]/g, '_')] = { type: 'select', label: id, options: o, default: o[0] };
      renderProps(); return;
    }
    if (e.target.id === 'mkPage') {
      if (dirty) await save();
      const values = {}; for (const f of listFields(scene)) values[f.id] = f.default;
      try { const p = await api('POST', '/api/pages', { scene: scene.id, name: scene.name, values }); toast(`Utworzono stronę ${p.number} – otwórz Trio`); }
      catch (err) { toast(err.message, true); }
    }
  });
  // prawy klik na etykiecie = wartość domyślna (gdy właściwość nie ma kluczy)
  $('#props').addEventListener('contextmenu', (e) => {
    const lb = e.target.closest('label[data-scrub]'), n = selNode();
    const p = lb?.closest('[data-prop]')?.dataset.prop;
    if (!lb || !n || !p || !PROPS[p]) return;
    e.preventDefault();
    if (n.anim?.[p]?.length) return toast('Właściwość ma klucze – usuń je na osi czasu', true);
    if (!n.props || !(p in n.props)) return;
    checkpoint(); delete n.props[p]; refresh();
    if (WHEN_SRC.has(p)) renderProps(); else syncProps();
    toast(`${PROPS[p].label || p}: wartość domyślna`);
  });
  // pasek panelu: zakładki, tryb Podstawowe/Wszystko, szukanie
  $('#ptools').addEventListener('click', (e) => {
    const tb = e.target.closest('[data-ptab]');
    if (tb) { pui.tab = tb.dataset.ptab; savePui(); renderProps(); return; }
    if (e.target.id === 'pall') { pui.all = !pui.all; savePui(); renderProps(); }
  });
  $('#psearch').addEventListener('input', () => applySearch());
  $('#psearch').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; applySearch(); e.target.blur(); } });
  // przeciąganie etykiety = zmiana wartości liczbowej
  $('#props').addEventListener('mousedown', (e) => {
    const lb = e.target.closest('label[data-scrub]');
    const n = selNode();
    if (!lb || !lb.dataset.scrub || !n) return;
    e.preventDefault();
    const p = lb.dataset.scrub, d = PROPS[p];
    let start = propAt(n, p, t, null); const sx = e.clientX;
    // „auto” (róg/bok jak zaokrąglenie): przeciąganie zaczyna od wartości, którą element ma teraz
    if (d.auto != null && start < 0) start = /^radius./.test(p) ? Math.max(0, +propAt(n, 'radius', t, null) || 0) : 0;
    let moved = false;
    const mv = (ev) => {
      if (!moved) { checkpoint(); moved = true; }
      let v = start + (ev.clientX - sx) * (d.step || 1) * (ev.shiftKey ? 10 : 1);
      if (d.min != null) v = Math.max(d.min, v); if (d.max != null) v = Math.min(d.max, v);
      setPropUI(n, p, Math.round(v * 1000) / 1000); refresh(); syncProps();
    };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved && n.anim?.[p]) renderTimeline(); if (moved && WHEN_SRC.has(p)) renderProps(); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
}

// Artist – renderowanie UI i panel Właściwości (zakładki, pola, ruch, dane, scena).

import { html, setHtml, orEmpty } from '/dom.js';
import * as PACK from '/cgpack.js';
import * as MO from '/motion.js';
import { PROPS, TYPES, propAt, cornerRadii, walk, listFields, variantFields, parseColor } from '/renderer.js';
import { mountTickerEditor } from '/ticker-items.js';
import { $, $$, TRIO, assets, checkpoint, esc, isLocked, locate, multiOthers, multiSel, num, plElem, player, renderSceneSel, scene, scenes, selAll, selId, selMore, selNode, t } from './core.js';
import { keyProps, renderTimeline } from './timeline.js';
import { refresh, showSqueeze } from './edit.js';
import { relForm, syncRefsUI } from './refs.js';
import { dockRefTargets, dockTable } from './dock.js';
import { sortedStops } from './keys.js';
import { animPresets } from './presets.js';

// ------------------------------------------------------------ renderowanie UI
export function renderAll() { renderSceneSel(); renderTree(); renderProps(); renderTimeline(); }
export function renderTree() {
  let h = html`<div class="item ${selId ? '' : 'sel'}" data-id=""><span class="ic"><i class="ico scene"></i></span><b class="grow">${esc(scene.name)}</b><span class="refs1" data-refs1></span><span class="dim off" title="położenie sceny (X, Y)">${+scene.x || +scene.y ? `${+scene.x || 0}, ${+scene.y || 0}` : ''}</span><span class="pill">${esc(scene.layer || 'main')}</span></div>`;
  const rec = (nodes, d) => {
    for (const n of nodes) {
      const fl = Object.values(n.fields || {}).filter(Boolean);
      const lk = isLocked(n.id);
      h = html`${h}${html`<div class="item ${n.id === selId ? 'sel' : selMore.includes(n.id) ? 'sel2' : ''} ${n.hidden ? 'hid' : ''} ${lk ? 'lockd' : ''}" data-id="${n.id}" draggable="${!lk}" style="padding-left:${10 + d * 16}px">
        <span class="ic">${TYPES[n.type]?.icon || '?'}</span><span class="grow">${esc(n.name || n.type)}</span>
        ${fl.map((f) => html`<span class="pill fld" title="pole kontrolne">${esc(f)}</span>`)}
        ${Object.values(n.anim || {}).some((a) => a?.length) ? html`<span class="dim" title="animowany">◆</span>` : ''}
        <span class="lock ${n.locked ? 'on' : ''}" data-lock="${n.id}" title="${n.locked ? 'odblokuj' : lk ? 'zablokowany przez grupę' : 'zablokuj na kanwie'}">${n.locked ? '🔒' : lk ? '·' : '🔓'}</span>
        <span class="eye" data-eye="${n.id}" title="pokaż/ukryj">${n.hidden ? '○' : '◉'}</span></div>`}`;
      if (n.children) rec(n.children, d + 1);
    }
  };
  rec(scene.nodes, 0);
  if (!scene.nodes.length) h = html`${h}${html`<div class="empty">Pusta scena.<br>Dodaj kontener: „＋ Dodaj…”</div>`}`;
  setHtml($('#tree'), h);
  const names = []; walk(scene.nodes, (n) => { if (n.name) names.push(n.name); });
  setHtml($('#nodelist'), names.map((n) => html`<option>${esc(n)}</option>`));
  syncRefsUI();
}
function inputFor(p, d) {
  switch (d.t) {
    case 'num': return html`<input type="number" data-p="${p}" step="${d.step || 1}" ${d.min != null ? html`min="${d.min}"` : ''} ${d.max != null ? html`max="${d.max}"` : ''}${d.auto != null ? html` placeholder="auto"` : ''}>`;
    case 'color': return html`<div class="row"><input type="color" data-pc="${p}"><input data-p="${p}" class="grow mono" placeholder="#rrggbbaa"></div>`;
    case 'text': return html`<textarea data-p="${p}" rows="2"></textarea>`;
    case 'string': return html`<input data-p="${p}">`;
    case 'font': return html`<div class="row"><input data-p="${p}" class="grow" list="fontlist"><button class="icon" data-upload="${p}" data-accept=".ttf,.otf,.woff,.woff2" title="Wgraj własną czcionkę (TTF/OTF/WOFF/WOFF2) i użyj jej w tym elemencie; trafi do paczki sceny">⤒</button></div>`;
    case 'node': return html`<input data-p="${p}" list="nodelist" placeholder="nazwa węzła (kilka: a,b)">`;
    case 'select': return html`<select data-p="${p}">${d.opts.map((o) => html`<option>${o}</option>`)}</select>`;
    case 'bool': return html`<input type="checkbox" data-p="${p}">`;
    case 'image': return html`<div class="row"><select data-p="${p}" class="grow"><option value="">— brak —</option>${assets.filter((a) => !/\.(ttf|otf|woff2?)$/i.test(a.name)).map((a) => html`<option>${esc(a.name)}</option>`)}</select><button class="icon" data-upload="${p}" title="Wgraj plik (PNG/JPG/SVG/WEBM/MP4)">⤒</button></div>`;
  }
  return '';
}
// ------------------------------------------------------------ panel Właściwości (plan PLAN-panel-wlasciwosci.md)
/** Stan panelu (per przeglądarka): zwinięte grupy, tryb „Wszystko”, zakładka, blokada proporcji. */
export const pui = (() => { try { return { fold: {}, all: false, tab: 'wl', ratio: false, ...JSON.parse(localStorage.getItem('vizrs.propsUI')) }; } catch { return { fold: {}, all: false, tab: 'wl', ratio: false }; } })();
export const savePui = () => { try { localStorage.setItem('vizrs.propsUI', JSON.stringify(pui)); } catch { /* ignoruj */ } };
/** Grupy domyślnie zwinięte (rzadko używane). */
const FOLD0 = new Set(['Maska / efekty', 'Autofollow', 'Względem innej sceny']);
export const folded = (g) => pui.fold[g] ?? FOLD0.has(g);
/** Właściwości zaawansowane: w trybie „Podstawowe” widoczne tylko, gdy są użyte (wartość, klucz, pole kontrolne). */
const ADV = new Set(['skewX', 'blink', 'blur', 'clipL', 'clipR', 'clipT', 'clipB', 'followMin', 'fillSqueeze', 'squeezeMin', 'lineBreak', 'hlColor', 'hlText',
  'cycle', 'gleam', 'labelSize', 'labelWeight', 'sepColor', 'sepStyle', 'crawlFrom', 'tz', 'shadow',
  'radiusTL', 'radiusTR', 'radiusBR', 'radiusBL', 'radiusL', 'radiusR', 'radiusT', 'radiusB']);
/** Widoczność warunkowa: właściwość nie działa przy obecnych ustawieniach węzła (nadal widoczna, gdy jest użyta). */
const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
const WHEN = {
  squeezeMin: (v) => /^squeeze/.test(v('textFit') || ''),
  fillSqueeze: (v) => v('lineBreak') === 'fill',
  gradAngle: (v) => !!v('color2'),
  borderColor: (v) => +v('borderWidth') > 0,
  followAxis: (v) => !!v('follow'), followPad: (v) => !!v('follow'), followMin: (v) => !!v('follow'),
  seconds: (v) => ['up', 'down'].includes(v('mode')),
  target: (v) => v('mode') === 'target',
  loop: (v) => VIDEO_RE.test(v('src') || ''),
};
/** Właściwości, od których zależy widoczność innych – po zmianie panel układa się od nowa. */
export const WHEN_SRC = new Set(['textFit', 'lineBreak', 'color2', 'borderWidth', 'follow', 'mode', 'src', 'tickerMode']);
/** Wiersze złożone: kilka właściwości w jednej linii (krótkie etykiety). */
const COMBOS = [
  { props: ['x', 'y'], short: ['X', 'Y'] },
  { props: ['w', 'h'], short: ['szer.', 'wys.'], ratio: true },
  { props: ['anchorX', 'anchorY'], kind: 'anchor', label: 'punkt' },
  { props: ['rotation', 'scale', 'opacity'], short: ['obrót°', 'skala', 'krycie'] },
  { props: ['clipL', 'clipR', 'clipT', 'clipB'], short: ['L', 'P', 'G', 'D'], label: 'maska %' },
  { props: ['blur', 'skewX'], short: ['rozmycie', 'pochyl.°'] },
  { props: ['followAxis', 'followPad', 'followMin'], short: ['oś', 'margines', 'min.'] },
  { props: ['color', 'color2', 'gradAngle'], short: ['kolor', 'kolor 2', 'kąt'], kind: 'fill' },
  { props: ['borderWidth', 'borderColor'], short: ['ramka px', 'kolor ramki'] },
  { props: ['radius', 'radiusTL', 'radiusT', 'radiusTR', 'radiusL', 'radiusR', 'radiusBL', 'radiusB', 'radiusBR'], kind: 'radius', label: 'zaokrąglenie' },
  { props: ['font', 'weight'], short: ['font', 'grubość'], kind: 'wide1' },
  { props: ['size', 'spacing', 'lineHeight'], short: ['rozmiar', 'odstęp', 'interl.'] },
  { props: ['italic', 'upper'], kind: 'bools', label: 'styl' },
  { props: ['align', 'valign'], kind: 'seg', label: 'wyrównanie' },
  { props: ['hlColor', 'hlText'], short: ['tło [[ ]]', 'tekst [[ ]]'] },
  { props: ['catBg', 'catFg'], short: ['tło kat.', 'tekst kat.'] },
  { props: ['labelSize', 'labelWeight'], short: ['rozm. etyk.', 'grub. etyk.'] },
];
/** Pola schematu zaokrąglenia: pozycja w siatce 3×3, krótka etykieta, opis. */
export const RAD_UI = {
  radiusTL: { pos: 'tl', short: '↖ róg', tip: 'Lewy górny róg' }, radiusTR: { pos: 'tr', short: 'róg ↗', tip: 'Prawy górny róg' },
  radiusBL: { pos: 'bl', short: '↙ róg', tip: 'Lewy dolny róg' }, radiusBR: { pos: 'br', short: 'róg ↘', tip: 'Prawy dolny róg' },
  radiusT: { pos: 't', short: 'bok górny', tip: 'Bok górny (oba górne rogi)', side: 1 }, radiusB: { pos: 'b', short: 'bok dolny', tip: 'Bok dolny (oba dolne rogi)', side: 1 },
  radiusL: { pos: 'l', short: 'bok lewy', tip: 'Bok lewy (oba lewe rogi)', side: 1 }, radiusR: { pos: 'r', short: 'bok prawy', tip: 'Bok prawy (oba prawe rogi)', side: 1 },
};
const SEG = { align: [['left', '⇤'], ['center', '↔'], ['right', '⇥']], valign: [['top', '⤒'], ['middle', '↕'], ['bottom', '⤓']] };
const SEG_T = { left: 'do lewej', center: 'do środka', right: 'do prawej', top: 'do góry', middle: 'w pionie do środka', bottom: 'do dołu' };
/** Czy właściwość jest „użyta”: wartość różna od domyślnej, klucze albo pole kontrolne. */
function propState(n, p) {
  const d = PROPS[p], has = n.props && p in n.props;
  const mod = has && String(n.props[p] ?? '') !== String(d.d ?? '');
  const anim = !!n.anim?.[p]?.length, fld = n.fields?.[p] || '';
  return { mod, anim, fld, used: mod || anim || !!fld };
}
const btns = (p, d) => html`${d.anim ? html`<button class="icon kbtn" data-key="${p}" title="Klucz animacji w bieżącym czasie (dodaj/usuń)">◆</button>` : ''}<button class="icon fbtn" data-field="${p}" title="Pole kontrolne (Control Object) – edytowalne w Trio"><i class="ico link"></i></button>`;
const scrubLbl = (p, d, txt) => html`<label data-scrub="${d.t === 'num' ? p : ''}" title="${esc(d.label || p)} (${p})${d.t === 'num' ? ' – przeciągnij, aby zmienić' : ''} · prawy klik = wartość domyślna">${esc(txt)}</label>`;
export function renderProps() {
  const el = $('#props');
  const n = selNode();
  $('#ptools').hidden = !n;
  if (!n) { $('#propsTitle').textContent = 'Scena'; renderSceneProps(); return; }
  const def = TYPES[n.type];
  const msel = multiSel() ? selAll().map((id) => locate(id)?.node).filter(Boolean) : [];
  $('#propsTitle').textContent = msel.length > 1 ? `Właściwości – ${msel.length} ${plElem(msel.length)}` : 'Właściwości – ' + def.label;
  for (const b of $$('[data-ptab]')) b.classList.toggle('on', b.dataset.ptab === pui.tab);
  $('#pall').classList.toggle('on', pui.all);
  $('#pall').textContent = pui.all ? 'Wszystko' : 'Podstawowe';
  const ruchOn = !!n.motion || Object.values(n.anim || {}).some((a) => a?.length);
  const daneOn = !!n.showIf || Object.keys(n.fields || {}).length > 0;
  $('[data-ptab="ruch"]').classList.toggle('dot', ruchOn);
  $('[data-ptab="dane"]').classList.toggle('dot', daneOn);

  const val = (k) => propAt(n, k, t, null);
  const tkMode = n.type === 'ticker' ? val('tickerMode') : null;
  const TK_HIDE = { crawl: ['hold'], roll: ['speed', 'crawlFrom', 'sep', 'sepStyle', 'sepColor'], wipe: ['speed', 'crawlFrom', 'sep', 'sepStyle', 'sepColor'], whip: ['speed', 'crawlFrom', 'sep', 'sepStyle', 'sepColor'] };
  // kilka zaznaczonych: tylko właściwości wspólne dla ich typów
  const own = new Set(def.props.filter((p) => msel.every((m) => TYPES[m.type]?.props.includes(p))));
  const shown = (p) => {
    if (!own.has(p) || (tkMode && TK_HIDE[tkMode]?.includes(p))) return false;
    const s = propState(n, p);
    if (s.used) return true;
    if (WHEN[p] && !WHEN[p](val)) return false;
    return pui.all || !ADV.has(p);
  };
  const inert = (p) => WHEN[p] && !WHEN[p](val);
  const comboOf = new Map(); for (const c of COMBOS) for (const p of c.props) comboOf.set(p, c);

  let wl = msel.length > 1
    ? html`<div class="phead"><span class="ic">⧉</span><span class="grow" title="Zmiana właściwości dotyczy wszystkich zaznaczonych, które ją mają; „—” – różne wartości">${esc(Object.entries(msel.reduce((o, m) => { const l = TYPES[m.type]?.label || m.type; o[l] = (o[l] || 0) + 1; return o; }, {})).map(([l, k]) => `${k} × ${l}`).join(', '))}</span></div>`
    : html`<div class="phead"><span class="ic">${def.icon}</span><input id="pname" class="grow" value="${esc(n.name)}" title="Nazwa kontenera"></div>`;
  const groups = []; // [nazwa, html]
  const add = (g, part) => { let e = groups.find((x) => x[0] === g); if (!e) groups.push(e = [g, []]); e[1].push(part); };
  const done = new Set();
  let hidden = 0;
  for (const p of def.props) {
    if (done.has(p)) continue;
    const d = PROPS[p];
    if (tkMode && p === 'text') {
      done.add(p);
      add(d.g, html`<div class="prtk" data-prop="text"><div class="prtk-h"><span class="grow">wiadomości próbne <span class="dim">(w Trio: pole strony)</span></span><button class="icon fbtn" data-field="text" title="Pole kontrolne (Control Object) – edytowalne w Trio"><i class="ico link"></i></button></div><div data-tkhost></div><textarea data-p="text" hidden></textarea></div>`);
      continue;
    }
    const c = comboOf.get(p);
    const members = c ? c.props.filter((x) => own.has(x) && !done.has(x)) : [p];
    for (const x of members) done.add(x);
    // zaokrąglenie: jeden schemat dla wszystkich rogów i boków (rozwinięcie – przycisk w wierszu, nie tryb „Wszystko”)
    const vis = c?.kind === 'radius' ? (members.some(shown) || members.some((x) => propState(n, x).used) ? members : []) : members.filter(shown);
    hidden += members.length - vis.length;
    if (!vis.length) continue;
    if (!c || vis.length === 1) { for (const x of vis) add(PROPS[x].g, rowOne(x)); }
    else add(d.g, rowCombo(c, vis));
    if (p === 'textFit' || (vis.includes('textFit'))) add(d.g, html`<div class="sqinfo" id="sqInfo"></div>`);
  }
  if (scenes.length > 1) add('Względem innej sceny', relForm(true));
  for (const [g, body] of groups) {
    wl = html`${wl}${html`<div class="pgsec ${folded(g) ? 'fold' : ''}" data-sec="${esc(g)}"><button class="pgroup" data-fold="${esc(g)}"><span class="car">▾</span> ${esc(g)}<span class="cnt"></span></button><div class="pgbody">${body}</div></div>`}`;
  }
  if (hidden && !pui.all) wl = html`${wl}${html`<div class="pmore"><button data-pall>＋ ${hidden} rzadziej używanych – pokaż wszystkie</button></div>`}`;
  wl = html`${wl}${html`<div class="pnone dim" hidden>Brak właściwości pasujących do szukanej frazy.</div>`}`;

  function rowOne(p) {
    const d = PROPS[p];
    if (comboOf.get(p)?.kind === 'seg' || comboOf.get(p)?.kind === 'anchor') return rowCombo(comboOf.get(p), [p]);
    return html`<div class="pr ${inert(p) ? 'inert' : ''}" data-prop="${p}" data-q="${esc(p + ' ' + (d.label || ''))}" ${inert(p) ? html`title="Nie działa przy obecnych ustawieniach węzła"` : ''}>
      ${scrubLbl(p, d, d.label || p)}<div class="pin">${inputFor(p, d)}</div>${d.anim ? html`<button class="icon kbtn" data-key="${p}" title="Klucz animacji w bieżącym czasie (dodaj/usuń)">◆</button>` : html`<span></span>`}
      <button class="icon fbtn" data-field="${p}" title="Pole kontrolne (Control Object) – edytowalne w Trio"><i class="ico link"></i></button></div>`;
  }
  function rowCombo(c, vis) {
    const q = esc(vis.map((x) => x + ' ' + (PROPS[x].label || '')).join(' ') + ' ' + (c.label || ''));
    if (c.kind === 'anchor') {
      const cells = [];
      for (const yv of ['top', 'middle', 'bottom']) for (const xv of ['left', 'center', 'right']) cells.push(html`<button class="icon" data-anchor="${xv},${yv}" title="punkt: ${xv} / ${yv}"></button>`);
      return html`<div class="pr pcombo" data-q="${q}"><label title="Punkt zaczepienia (anchorX / anchorY): right/bottom = element rośnie w lewo/w górę">${esc(c.label)}</label>
        <div class="pin anchor-row"><div class="agrid">${cells}</div><span class="dim mono" data-anchorlbl></span>
        ${vis.map((x) => html`<span class="cell" data-prop="${x}"><select data-p="${x}" hidden>${PROPS[x].opts.map((o) => html`<option>${o}</option>`)}</select>${btns(x, PROPS[x])}</span>`)}</div><span></span><span></span></div>`;
    }
    if (c.kind === 'seg') {
      return html`<div class="pr pcombo" data-q="${q}"><label>${esc(c.label)}</label><div class="pin seg-row">${vis.map((x) => html`<span class="cell" data-prop="${x}"><span class="segb">${SEG[x].map(([v, ic]) => html`<button class="icon" data-seg="${x}" data-v="${v}" title="${SEG_T[v]}">${ic}</button>`)}</span><select data-p="${x}" hidden>${PROPS[x].opts.map((o) => html`<option>${o}</option>`)}</select>${btns(x, PROPS[x])}</span>`)}</div><span></span><span></span></div>`;
    }
    if (c.kind === 'bools') {
      return html`<div class="pr pcombo" data-q="${q}"><label>${esc(c.label)}</label><div class="pin seg-row">${vis.map((x) => html`<span class="cell" data-prop="${x}"><label class="chk"><input type="checkbox" data-p="${x}"> ${esc(PROPS[x].label)}</label>${btns(x, PROPS[x])}</span>`)}</div><span></span><span></span></div>`;
    }
    if (c.kind === 'radius') return radiusRow(c, vis);
    const cols = c.kind === 'wide1' && vis.length === 2 ? '2fr 1fr' : `repeat(${vis.length}, minmax(0, 1fr))`;
    const lockBtn = c.ratio && vis.length === 2 ? html`<button class="icon ratio ${pui.ratio ? 'on' : ''}" data-ratio title="Zachowaj proporcje szerokości i wysokości">⛓</button>` : '';
    return html`<div class="pmulti" data-q="${q}">${c.label ? html`<div class="pmlbl">${esc(c.label)}</div>` : ''}<div class="pmgrid" style="grid-template-columns:${cols}${lockBtn ? ' 22px' : ''}">
      ${vis.map((x) => { const d = PROPS[x], i = c.props.indexOf(x); return html`<div class="cell ${inert(x) ? 'inert' : ''}" data-prop="${x}"><div class="ch">${scrubLbl(x, d, c.short?.[i] || d.label || x)}<span class="grow"></span>${btns(x, d)}</div>${inputFor(x, d)}</div>`; })}${lockBtn}</div></div>`;
  }

  /** Zaokrąglenie: „wszystkie rogi” + schemat prostokąta z polami w rogach i na bokach (puste pole = dziedziczy). */
  function radiusRow(c, vis) {
    const q = esc(vis.map((x) => x + ' ' + (PROPS[x].label || '')).join(' ') + ' zaokrąglenie rogi boki narożniki');
    const own8 = vis.filter((x) => x !== 'radius');
    const used8 = own8.some((x) => propState(n, x).used);
    const open = own8.length && (used8 || pui.radius);
    const cell = (x) => {
      if (!vis.includes(x)) return html`<span></span>`;
      const d = PROPS[x], R = RAD_UI[x];
      return html`<div class="cell rcell r-${R.pos}" data-prop="${x}"><div class="ch">${scrubLbl(x, d, R.short)}<span class="grow"></span>${btns(x, d)}</div><input type="number" data-p="${x}" step="1" min="-1" title="${esc(R.tip)} – puste = ${R.side ? 'jak „wszystkie”' : 'z boków albo jak „wszystkie”'}"></div>`;
    };
    const all = vis.includes('radius') ? html`<div class="cell rall" data-prop="radius"><div class="ch">${scrubLbl('radius', PROPS.radius, 'wszystkie rogi')}<span class="grow"></span>${btns('radius', PROPS.radius)}</div><input type="number" data-p="radius" step="1" min="0"></div>` : '';
    const tog = own8.length ? html`<button class="rtog ${open ? 'on' : ''}" data-radx title="${open ? 'Zwiń' : 'Pokaż'} osobne zaokrąglenie każdego rogu i boku">${open ? '▾' : '▸'} osobno${used8 ? ' •' : ''}</button>` : '';
    let h = html`<div class="pmulti prad" data-q="${q}"><div class="pmlbl">${esc(c.label)}</div><div class="rtop">${all}${tog}</div>`;
    if (open) {
      h = html`${h}${html`<div class="rgrid">${cell('radiusTL')}${cell('radiusT')}${cell('radiusTR')}${cell('radiusL')}<div class="rprev" title="Podgląd rogów (w skali krótszego boku elementu)"><i data-rprev></i></div>${cell('radiusR')}${cell('radiusBL')}${cell('radiusB')}${cell('radiusBR')}</div>
        <div class="rhint">Puste pole dziedziczy: róg → z boków → „wszystkie”. Dwa boki przy rogu (np. górny i lewy) dają róg eliptyczny.${used8 ? html` <button class="linkb" data-radclr title="Usuń zaokrąglenia rogów i boków – wszystkie rogi jak „wszystkie”">wyczyść rogi i boki</button>` : ''}</div>`}`;
    }
    return html`${h}${html`</div>`}`;
  }

  let ruch = motionForm(n);
  ruch = html`${ruch}${html`<div class="pgroup">Presety animacji (klucze)</div>
  <div class="pr" style="grid-template-columns:1fr auto auto"><select id="apSel"><option value="">— wybierz —</option>${animPresets.map((x) => html`<option value="${esc(x.id)}">${esc(x.name)} (${x.duration}s)</option>`)}</select><button data-ap="apply" title="Wstaw klucze presetu od bieżącego czasu">Zastosuj</button><button data-ap="save" title="Zapisz klucze tego węzła jako preset">＋ zapisz</button></div>
  <div class="pr" style="grid-template-columns:1fr auto auto auto"><span class="dim" style="font-size:11px">preset = zestaw kluczy (czasy względne)</span><button data-ap="export" title="Pobierz preset do pliku">⇩</button><button data-ap="import" title="Wczytaj preset z pliku">⇧</button><button data-ap="del" class="icon danger" title="Usuń preset"><i class="ico del"></i></button></div>`}`;

  const vf = variantFields(scene);
  let dane = html`<div class="pgroup">Wariant – widoczność</div>`;
  if (vf.length) {
    const si = n.showIf || {};
    dane = html`${dane}${html`<div class="pr" style="grid-template-columns:100px 1fr 1fr"><label>widoczny gdy</label>
      <select data-si="field"><option value="">— zawsze —</option>${vf.map((f) => html`<option value="${esc(f.id)}" ${si.field === f.id ? 'selected' : ''}>${esc(f.label)}</option>`)}</select>
      <input data-si="value" list="si_vals" value="${esc(si.value || '')}" placeholder="wartość (a,b)" ${si.field ? '' : 'disabled'}>
      <datalist id="si_vals">${(vf.find((f) => f.id === si.field)?.opts || []).map((o) => html`<option>${esc(o)}</option>`)}</datalist></div>`}`;
  } else dane = html`${dane}${html`<div class="dim pnote">Zdefiniuj warianty w ustawieniach sceny (kliknij puste tło), aby pokazywać ten węzeł tylko w wybranym wariancie.</div>`}`;
  const fl = Object.entries(n.fields || {});
  dane = html`${dane}${html`<div class="pgroup">Pola kontrolne węzła</div>`}${fl.length
    ? fl.map(([p, f]) => html`<div class="pr" style="grid-template-columns:1fr 1fr 24px"><span>${esc(PROPS[p]?.label || p)}</span><span class="pill fld">${esc(f)}</span><button class="icon fbtn on" data-field="${p}" title="Zmień lub usuń pole kontrolne"><i class="ico link"></i></button></div>`)
    : html`<div class="dim pnote"><i class="ico link"></i> przy właściwości wystawia ją jako pole kontrolne: operator Trio wpisze tu wartość na stronie. <b>[[tekst]]</b> w tekście = wyróżnienie.</div>`}`;

  if (msel.length > 1) ruch = dane = html`<div class="dim pnote">Ruch, warianty i pola kontrolne ustawia się dla jednego elementu – zaznacz jeden (klik na kanwie albo w drzewie).</div>`;
  setHtml(el, html`<div class="ptab" data-tab="wl" ${pui.tab === 'wl' ? '' : 'hidden'}>${wl}</div><div class="ptab" data-tab="ruch" ${pui.tab === 'ruch' ? '' : 'hidden'}>${ruch}</div><div class="ptab" data-tab="dane" ${pui.tab === 'dane' ? '' : 'hidden'}>${dane}</div>`);
  syncProps(true);
  applySearch();
  showSqueeze();
  const host = $('[data-tkhost]', el);
  if (host) {
    const ta = $('textarea[data-p="text"]', el);
    mountTickerEditor(host, {
      value: ta.value, catColors: val('catColors'), catBg: val('catBg'), catFg: val('catFg'), label: val('label'), rules: scene.fieldMeta?.[n.fields?.text] || {},
      onChange: (v) => { ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); },
      onHover: (i) => player.tickerPin(n.id, i),
    });
  }
}
/** Szukanie właściwości: filtruje wiersze zakładki Właściwości i rozwija pasujące grupy. */
export function applySearch() {
  const q = ($('#psearch')?.value || '').trim().toLowerCase();
  const tab = $('#props .ptab[data-tab="wl"]'); if (!tab) return;
  tab.classList.toggle('searching', !!q);
  let any = false;
  for (const sec of $$('.pgsec', tab)) {
    let n = 0;
    for (const r of $$('[data-q]', sec)) { const m = !q || r.dataset.q.toLowerCase().includes(q) || sec.dataset.sec.toLowerCase().includes(q); r.hidden = !m; if (m) n++; }
    for (const r of $$('.sqinfo, .prtk', sec)) if (q) r.hidden = !sec.dataset.sec.toLowerCase().includes(q) && !(r.classList.contains('prtk') && 'tekst text'.includes(q)); else r.hidden = false;
    sec.hidden = q && !n; any ||= n > 0;
  }
  $('.pnone', tab).hidden = !q || any;
  const more = $('.pmore', tab); if (more) more.hidden = !!q;
  if (q && pui.tab !== 'wl') { pui.tab = 'wl'; savePui(); renderProps(); }
}
/** Stany wierszy: zmieniona / animowana / pole kontrolne + liczniki na nagłówkach grup. */
function markProps(n) {
  for (const r of $$('#props [data-prop]')) {
    const p = r.dataset.prop; if (!PROPS[p]) continue;
    const s = propState(n, p);
    r.classList.toggle('mod', s.mod); r.classList.toggle('anim', s.anim); r.classList.toggle('fld', !!s.fld);
  }
  for (const sec of $$('#props .pgsec')) {
    const c = (k) => $$(`[data-prop].${k}`, sec).length;
    const m = c('mod'), a = c('anim'), f = c('fld');
    $('.cnt', sec).textContent = [m && `${m} zm.`, a && `◆${a}`, f && `⛓${f}`].filter(Boolean).join(' · ');
  }
  const ax = propAt(n, 'anchorX', t, null), ay = propAt(n, 'anchorY', t, null);
  for (const b of $$('#props [data-anchor]')) b.classList.toggle('on', b.dataset.anchor === `${ax},${ay}`);
  const al = $('#props [data-anchorlbl]'); if (al) al.textContent = `${ax} / ${ay}`;
  for (const b of $$('#props [data-seg]')) b.classList.toggle('on', propAt(n, b.dataset.seg, t, null) === b.dataset.v);
}
/** Ruch (node.motion): presety IN/OUT, efekt tekstu, pętla uwagi – bez kluczy, liczone przez renderer. */
function motionForm(n) {
  const m = n.motion || {};
  const opt = (list, v, lab) => list.map((x) => html`<option value="${x}" ${x === (v || 'none') ? 'selected' : ''}>${esc(lab ? lab(x) : x)}</option>`);
  const numIn = (k, v, ph, step = 0.05) => html`<input type="number" min="0" step="${step}" data-mo="${k}" value="${v ?? ''}" placeholder="${ph}">`;
  const phase = (k, label) => {
    const s = m[k] || {}, on = s.type && s.type !== '';
    let r = html`<div class="mo" data-ph="${k}"><label>${label}</label><select data-mo="${k}.type" style="grid-column:2/4"><option value="" ${on ? '' : 'selected'}>— bez presetu —</option>${opt(MO.ANIM_TYPES, on ? s.type : '-', (x) => MO.ANIM_LABELS[x] || x)}</select>`;
    if (on) {
      r = html`${r}${html`<div class="sub"><label>czas s${numIn(k + '.dur', s.dur, '0.5')}</label><label>opóźnienie s${numIn(k + '.delay', s.delay, '0')}</label>
        <label>kierunek<select data-mo="${k}.dir" ${MO.DIR_TYPES.has(s.type) ? '' : 'disabled'}>${opt(MO.DIRECTIONS, s.dir || 'left', (x) => MO.DIR_LABELS[x])}</select></label></div>
        <div class="sub"><label style="grid-column:1/4">krzywa<select data-mo="${k}.ease">${opt(MO.MOTION_EASES, s.ease || 'power2.out')}</select></label></div>`}`;
    }
    return html`${r}${html`</div>`}`;
  };
  const textPhase = (k, label, list) => {
    const s = m[k] || {}, on = s.type && s.type !== 'none';
    let r = html`<div class="mo" data-ph="${k}"><label>${label}</label><select data-mo="${k}.type" style="grid-column:2/4">${opt(list, s.type || 'none', MO.textLabel)}</select>`;
    if (on) {
      r = html`${r}${html`<div class="sub"><label>czas s${numIn(k + '.dur', s.dur, '0.5')}</label><label>opóźnienie s${numIn(k + '.delay', s.delay, '0')}</label>
        <label>odstęp s${numIn(k + '.stagger', s.stagger, 'auto', 0.01)}</label></div>
        <div class="sub"><label style="grid-column:1/4">kolejność<select data-mo="${k}.from">${opt(MO.STAGGER_FROM, s.from || 'start', (x) => ({ start: 'od początku', end: 'od końca', center: 'od środka', edges: 'od krawędzi' })[x])}</select></label></div>`}`;
    }
    return html`${r}${html`</div>`}`;
  };
  const lp = m.loop || {}, lpOn = lp.type && lp.type !== 'none';
  // klucze elementu (◆) – skok do ścieżki na osi czasu; potem fazy presetów w kolejności czasu (jak klipy na osi)
  const kp = keyProps(n);
  let h = html`${html`<div class="pgroup">Klucze (◆)</div>`}${kp.length
    ? html`<div class="kj">${kp.map((pr) => html`<button data-kjump="${pr}" title="Pokaż ścieżkę na osi czasu i zaznacz pierwszy klucz">◆ ${esc(PROPS[pr]?.label || pr)} <span class="dim">${n.anim[pr].length}</span></button>`)}</div>`
    : html`<div class="dim pnote">Brak kluczy – ◆ przy właściwości w zakładce Właściwości.</div>`}`;
  const txt = n.type === 'text' || n.type === 'clock';
  h = html`${h}${html`<div class="pgroup">Ruch – presety (klipy na osi czasu)</div>`}${phase('in', 'wejście')}${txt ? textPhase('textIn', 'tekst IN', MO.TEXT_IN) : ''}`;
  h = html`${h}${html`<div class="mo" data-ph="loop"><label>pętla</label><select data-mo="loop.type" style="grid-column:2/4">${opt(MO.LOOP_TYPES, lp.type || 'none', (x) => MO.LOOP_LABELS[x])}</select>`}`;
  if (lpOn) h = html`${h}${html`<div class="sub"><label>okres s${numIn('loop.dur', lp.dur, 'auto')}</label><label>siła${numIn('loop.amp', lp.amp, 'auto', 0.5)}</label>
    <label>kolor<input data-mo="loop.color" value="${esc(lp.color || '')}" placeholder="auto" ${['glow', 'shine', 'underline-sweep'].includes(lp.type) ? '' : 'disabled'}></label></div>`}`;
  h = html`${h}${html`</div>`}${phase('out', 'wyjście')}${txt ? textPhase('textOut', 'tekst OUT', MO.TEXT_OUT) : ''}`;
  if (n.type === 'rect' || n.type === 'ellipse') h = html`${h}${html`<div class="mo"><label title="Stały efekt tła – gra cały czas, także w trakcie wejścia">efekt tła</label><select data-mobg style="grid-column:2/4">${opt(MO.BG_TYPES, m.bg || 'none', (x) => MO.BG_LABELS[x])}</select></div>`}`;
  const ORG = { '': 'środek', '0,0': 'lewy górny róg', '0.5,0': 'góra', '1,0': 'prawy górny róg', '0,0.5': 'lewa krawędź', '1,0.5': 'prawa krawędź', '0,1': 'lewy dolny róg', '0.5,1': 'dół', '1,1': 'prawy dolny róg' };
  const org = Array.isArray(m.origin) ? m.origin.join(',') : '';
  h = html`${h}${html`<div class="mo"><label title="Punkt odniesienia skali i obrotu ruchu (presety przesłon, obrotu i odwróceń mają własny)">punkt ruchu</label><select data-moorg style="grid-column:2/4">${Object.entries(ORG).map(([k, v]) => html`<option value="${k}" ${k === org ? 'selected' : ''}>${v}</option>`)}${org && !ORG[org] ? html`<option value="${org}" selected>${org}</option>` : ''}</select></div>`}`;
  const others = []; walk(scene.nodes, (x) => { if (x.id !== n.id) others.push(x); });
  h = html`${h}${html`<div class="mo"><label title="Sekwencja: wejście zaczyna się, gdy skończy się wejście wskazanego węzła">po węźle</label><select data-moafter style="grid-column:2/4"><option value="">— od początku sceny —</option>${others.map((x) => html`<option value="${esc(x.id)}" ${m.after === x.id ? 'selected' : ''}>${esc(x.name || x.id)}</option>`)}</select></div>`}`;
  const hasOut = m.out?.type || (m.textOut?.type && m.textOut.type !== 'none');
  const st = sortedStops();
  if ((m.in?.type || hasOut || lpOn || (m.textIn?.type && m.textIn.type !== 'none')) && (!st.length || (hasOut && scene.duration < st[st.length - 1] + MO.outLen(m, n.props?.text) - 1e-3))) {
    h = html`${h}${html`<div class="mohint">${!st.length ? 'Brak stop pointu: wyjście (OUT) zagra od ostatniego stopu, a pętla gra, gdy grafika stoi.' : 'Wyjście nie mieści się w długości sceny.'} <button data-mofit title="Stop point po wejściu i długość sceny = stop + wyjście">⟲ Dopasuj stop i długość</button></div>`}`;
  }
  return h;
}
/** Stop point po najdłuższym wejściu i długość sceny = stop + najdłuższe wyjście (ruch presetów i klucze). */
export function fitMotionTiming() {
  const sh = MO.sequenceShifts(scene.nodes);
  let inE = 0, outL = 0, keyEnd = 0;
  walk(scene.nodes, (x) => {
    if (x.motion) { const tx = x.props?.text; inE = Math.max(inE, MO.inEnd(x.motion, sh.get(x.id) || 0, tx)); outL = Math.max(outL, MO.outLen(x.motion, tx)); }
    for (const tr of Object.values(x.anim || {})) for (const k of tr) keyEnd = Math.max(keyEnd, k.t);
  });
  checkpoint();
  const st = sortedStops();
  if (!st.length) scene.stops = [Math.round(Math.max(inE, 0.04) * 100) / 100];
  else if (st[st.length - 1] < inE) scene.stops = [...st.slice(0, -1), Math.round(inE * 100) / 100];
  const last = Math.max(...scene.stops);
  scene.duration = Math.round(Math.max(last + outL, last + 0.04, outL > 0 ? 0 : keyEnd) * 100) / 100;
  $('#dur').value = scene.duration;
  renderProps(); renderTimeline(); refresh();
}
const hex6 = (c) => { const p = parseColor(c); if (!p) return '#000000'; return '#' + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''); };
export function syncProps(force) {
  const n = selNode(); if (!n) return;
  for (const inp of $$('[data-p]', $('#props'))) {
    const p = inp.dataset.p;
    if (!force && document.activeElement === inp) continue;
    let v = propAt(n, p, t, null);
    const d = PROPS[p];
    if (inp.type === 'checkbox') inp.checked = !!v;
    else if (d.t === 'num') inp.value = d.auto != null && +v < 0 ? '' : Math.round(v * 1000) / 1000;
    else {
      if (inp.tagName === 'SELECT' && v && ![...inp.options].some((o) => o.value === v)) inp.add(new Option(v, v));
      inp.value = v ?? '';
    }
  }
  for (const inp of $$('[data-pc]', $('#props'))) { const v = propAt(n, inp.dataset.pc, t, null); inp.value = hex6(v); }
  for (const b of $$('[data-key]', $('#props'))) {
    const tr = n.anim?.[b.dataset.key];
    b.classList.toggle('has', !!tr?.length);
    b.classList.toggle('on', !!tr?.some((k) => Math.abs(k.t - t) < 0.0005));
  }
  for (const b of $$('[data-field]', $('#props'))) {
    const f = n.fields?.[b.dataset.field];
    b.classList.toggle('on', !!f); b.title = f ? `Pole kontrolne: ${f} (kliknij, aby zmienić)` : 'Wystaw jako pole kontrolne (Control Object)';
  }
  syncRadius(n);
  markProps(n);
  if (multiSel()) syncMulti(n, force);
}
/** Kilka zaznaczonych: pole z różnymi wartościami jest puste z „—”, przełącznik – nieokreślony; ◆ i pola kontrolne – tylko dla jednego. */
function syncMulti(n, force) {
  for (const inp of $$('[data-p]', $('#props'))) {
    if (!force && document.activeElement === inp) continue;
    const p = inp.dataset.p, vs = [n, ...multiOthers(n, p)].map((m) => JSON.stringify(propAt(m, p, t, null)));
    const diff = vs.some((v) => v !== vs[0]);
    if (inp.dataset.ph0 == null) inp.dataset.ph0 = inp.placeholder || '';
    if (inp.type === 'checkbox') { inp.indeterminate = diff; continue; }
    inp.placeholder = diff ? '—' : inp.dataset.ph0;
    if (diff) inp.value = '';
  }
  for (const b of $$('[data-key], [data-field]', $('#props'))) { b.disabled = true; b.title = 'Klucze animacji i pola kontrolne – dla jednego elementu'; }
}
/** Schemat zaokrąglenia: puste pola pokazują wartość dziedziczoną, podgląd ma kształt i proporcje elementu. */
function syncRadius(n) {
  const pv = $('#props [data-rprev]'); if (!pv) return;
  const p = (k) => propAt(n, k, t, null), r = Math.max(0, +p('radius') || 0);
  const eff = cornerRadii(p) || [[r, r], [r, r], [r, r], [r, r]];
  const idx = { radiusTL: 0, radiusTR: 1, radiusBR: 2, radiusBL: 3 };
  const r1 = (v) => String(Math.round(v * 10) / 10);
  for (const inp of $$('#props .rgrid input[data-p]')) {
    const k = inp.dataset.p, i = idx[k];
    inp.placeholder = i != null ? r1(Math.max(...eff[i])) : r1(+p(k) >= 0 ? +p(k) : r);
  }
  // stały prostokąt podglądu; promienie w skali krótszego boku elementu (róg = połowa boku wygląda jak w elemencie)
  const k = 40 / Math.max(1, Math.min(num(n, 'w') || 100, num(n, 'h') || 100));
  const sc = (v) => Math.round(Math.min(v * k, 40) * 10) / 10 + 'px';
  Object.assign(pv.style, { width: '72px', height: '40px',
    borderRadius: eff.map((x) => sc(x[0])).join(' ') + ' / ' + eff.map((x) => sc(x[1])).join(' ') });
}
export const openRules = new Set();
/** Formularz reguł pola kontrolnego (Control Text): egzekwowane w Trio przy wpisywaniu. */
function rulesForm(f) {
  const m = scene.fieldMeta?.[f.id] || {};
  const id = esc(f.id);
  const num = (k, label, ph) => html`<label>${label}</label><input type="number" min="0" data-fr="${id}::${k}" value="${m[k] ?? ''}" placeholder="${ph || '—'}">`;
  const chk = (k, label, def) => html`<label class="rchk"><input type="checkbox" data-fr="${id}::${k}" ${(def ? m[k] !== false : !!m[k]) ? 'checked' : ''}> ${label}</label>`;
  const isText = f.type === 'text';
  if (f.nodeType === 'ticker' && f.prop === 'text') {
    return html`<div class="rules">
    ${num('maxItems', 'maks. wiadomości', '200')}${num('maxChars', 'maks. znaków wiadomości', '500')}
    <label>kategorie (lista)</label><input data-fr="${id}::cats" value="${esc((m.cats || []).join(', '))}" placeholder="dowolne; np. PILNE, SPORT">
    ${num('tab', 'kolejność Tab')}
    <label>podpowiedź</label><input data-fr="${id}::help" value="${esc(m.help || '')}" placeholder="widoczna pod etykietą w Trio">
    <div class="rchks">${html`${chk('upper', 'WERSALIKI')}${chk('typo', 'polska typografia')}${chk('readonly', 'tylko do odczytu')}`}</div>
  </div>`;
  }
  return html`<div class="rules">
    ${isText ? html`${num('maxChars', 'maks. znaków (twardy)')}${num('softMax', 'próg ostrzeżenia (żółty)', 'domyślnie 85%')}${num('maxLines', 'maks. linii', 'z węzła')}` : ''}
    ${num('tab', 'kolejność Tab')}
    <label>podpowiedź</label><input data-fr="${id}::help" value="${esc(m.help || '')}" placeholder="widoczna pod etykietą w Trio">
    <div class="rchks">${isText ? html`${chk('oneLine', 'jedna linia')}${chk('upper', 'WERSALIKI')}${chk('typo', 'polska typografia')}${chk('rich', 'pasek formatowania', true)}${chk('spell', 'sprawdzanie pisowni', true)}` : ''}${chk('readonly', 'tylko do odczytu')}</div>
  </div>`;
}
function renderSceneProps() {
  const fields = listFields(scene);
  let h = html`<div class="pgroup">Scena</div>
  <div class="sp"><label>Nazwa</label><input data-sp="name" value="${esc(scene.name)}"></div>
  <div class="sp"><label>Warstwa (layer)</label><input data-sp="layer" list="layerlist" value="${esc(scene.layer || 'main')}"></div>
  <div class="sp"><label>Rozdzielczość</label><div class="row"><input data-sp="width" type="number" value="${scene.width}"> × <input data-sp="height" type="number" value="${scene.height}"></div></div>
  <div class="sp"><label>Położenie sceny</label><div class="row"><input data-sp="x" type="number" value="${+scene.x || 0}" title="X – przesunięcie całej sceny (nie zmienia animacji)"> × <input data-sp="y" type="number" value="${+scene.y || 0}" title="Y – przesunięcie całej sceny (nie zmienia animacji)"><button class="icon" data-scene0 title="Wyzeruj położenie">⟲</button></div></div>
  <div class="pgroup">Położenie względem innej sceny (np. belka nad tickerem)</div>
  ${relForm(false)}
  <div class="sp"><label>Długość (s)</label><input data-sp="duration" type="number" step="0.1" value="${scene.duration}"></div>
  <div class="sp"><label>Stop pointy</label><div class="chips">${orEmpty(scene.stops.map((s, i) => html`<span class="chip">${(+s).toFixed(2)}s<button data-rmstop="${i}" title="usuń">×</button></span>`), html`<span class="dim">brak – grafika gra do końca</span>`)}</div></div>
  <div class="sp"><label>Markery</label><div class="chips">${orEmpty((scene.markers || []).map((m, i) => html`<span class="chip mk">${esc(m.name)} ${(+m.t).toFixed(2)}s<button data-mkstop="${i}" title="Utwórz stop point z markera">⏹</button><button data-rmmk="${i}" title="usuń">×</button></span>`), html`<span class="dim">M lub dwuklik na linijce = marker</span>`)}</div></div>
  <div class="pgroup">Powiązania (dock) – przesunięcie tej sceny, gdy inna grafika jest na wizji</div>
  ${dockTable()}
  <div style="padding:4px 10px"><button id="dkAdd">＋ Powiązanie</button> <button id="dkRef" ${dockRefTargets() ? '' : 'disabled'} title="${esc(dockRefTargets() ? 'Nowa reguła z celem: ' + dockRefTargets() + ' – od razu w trybie „Ustaw z kanwy”' : 'Wybierz sceny odniesienia z innej warstwy (⧉ na kanwie)')}">＋ Z odniesienia</button> <span class="dim" style="font-size:12px">np. belka unosi się o 90 px, gdy jest ticker (layer:back)</span></div>
  <div class="pgroup">Warianty (pola wyboru, jak Variants/Concepts w Viz)</div>`;
  const vfs = variantFields(scene);
  h = html`${h}${vfs.length ? html`${html`<table class="ftable"><tr class="dim"><td>pole</td><td>opcje (po przecinku)</td><td>domyślna</td><td></td></tr>`}${vfs.map((f) => html`<tr><td class="mono">${esc(f.id)}</td><td><input data-vopt="${esc(f.id)}" value="${esc(f.opts.join(', '))}"></td><td><select data-vdef="${esc(f.id)}">${f.opts.map((o) => html`<option ${o === f.default ? 'selected' : ''}>${esc(o)}</option>`)}</select></td><td><button class="icon danger" data-vdel="${esc(f.id)}">×</button></td></tr>`)}${html`</table>`}` : ''}`;
  h = html`${h}${html`<div style="padding:4px 10px"><button id="addVar">＋ Wariant</button> <span class="dim" style="font-size:12px">np. styl = info, pilne</span></div>
  <div class="pgroup">Pola kontrolne (Control Object)</div>`}`;
  const pfields = fields.filter((f) => f.nodeType !== 'variant');
  if (pfields.length) {
    h = html`${h}${html`<table class="ftable"><tr class="dim"><td>pole</td><td>etykieta w Trio</td><td>kontener</td><td></td></tr>`}${pfields.map((f) => {
        const m = scene.fieldMeta?.[f.id] || {};
        const has = ['maxChars', 'softMax', 'maxLines', 'maxItems', 'cats', 'tab', 'help', 'oneLine', 'upper', 'typo', 'readonly'].some((k) => m[k]) || m.rich === false || m.spell === false;
        return html`${html`<tr><td class="mono">${esc(f.id)}</td><td><input data-fm="${esc(f.id)}" value="${esc(m.label || '')}" placeholder="${esc(f.id)}"></td><td class="dim">${esc(f.node)}.${esc(f.prop)}</td><td><button class="icon ${has ? 'acc' : ''}" data-frtoggle="${esc(f.id)}" title="Reguły pola (limity znaków, wersaliki, typografia, Tab…)"><i class="ico gear"></i></button></td></tr>`}${openRules.has(f.id) ? html`<tr><td colspan="4">${rulesForm(f)}</td></tr>` : ''}`;
      })}${html`</table>`}`;
  } else h = html`${h}${html`<div class="dim" style="padding:4px 10px">Brak. Zaznacz kontener i kliknij <i class="ico link"></i> przy właściwości.</div>`}`;
  const known = assets.map((a) => a.name), used = PACK.sceneAssets({ ...scene, packAssets: undefined }, known), att = scene.packAssets || [];
  const chip = (n, rm) => html`<span class="chip" title="${PACK.FONT_RE.test(n) ? 'czcionka – na /output ładowana z serwera' : 'grafika'}"><i class="ico ${PACK.FONT_RE.test(n) ? 'font' : 'img'}"></i> ${esc(n)}${known.includes(n) ? '' : html` <b style="color:#e55">brak!</b>`}${rm ? html`<button data-pkrm="${esc(n)}" title="odłącz od paczki">×</button>` : ''}</span>`;
  h = html`${h}${html`<div class="pgroup">Zasoby paczki (.cgpack) – grafiki i czcionki</div>
  <div class="sp"><label>Używane</label><div class="chips">${orEmpty(used.map((n) => chip(n, false)), html`<span class="dim">brak</span>`)}</div></div>
  <div class="sp"><label>Dołączone</label><div class="chips">${orEmpty(att.map((n) => chip(n, true)), html`<span class="dim">np. czcionka używana w znacznikach tekstu albo grafika podmieniana przez operatora</span>`)}</div></div>
  <div style="padding:4px 10px" class="row"><button id="pkAdd" title="Wgraj plik (grafika, wideo, czcionka TTF/OTF/WOFF) i dołącz do paczki tej sceny">＋ Wgraj i dołącz</button><select id="pkPick" class="grow"><option value="">dołącz z assets…</option>${known.filter((n) => !att.includes(n) && !used.includes(n)).map((n) => html`<option>${esc(n)}</option>`)}</select></div>`}`;
  h = html`${h}${html`${TRIO ? html`<div style="padding:10px" class="row"><button id="mkPage">＋ Utwórz stronę w Trio</button></div>` : ''}
  <div class="help"><b>Jak to działa (jak w Viz):</b><br>
  • <b>Warstwa</b> – sceny na tej samej warstwie zastępują się (back / main / front lub dowolna nazwa).<br>
  • <b>Stop pointy</b> – TAKE gra animację do pierwszego stopu, CONTINUE do kolejnego, OUT gra od ostatniego stopu do końca i zdejmuje grafikę.<br>
  • Bez stopów: TAKE gra całość i grafika zostaje, OUT ją wycina.<br>
  • Kliknij puste miejsce na podglądzie, aby wrócić do ustawień sceny.</div>`}`;
  setHtml($('#props'), h);
}
export const outStartOf = () => { const st = sortedStops(); const ls = st.length ? st[st.length - 1] : null; return ls !== null && scene.duration > ls + 1e-3 ? ls : Infinity; };

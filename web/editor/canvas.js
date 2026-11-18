// Artist – podgląd i płótno: powiększenie, prowadnice, tło, przyciąganie.

import { html, setHtml } from '/dom.js';
import { fitStage } from '/renderer.js';
import { $, $$, assets, box, esc, scale, scene, selId, setScale, stage, toast } from './core.js';
import { renderTimeline } from './timeline.js';
import { uploadAsset } from './edit.js';
import { measureSvg, overlapSvg, placeRefs, renderRefsPop } from './refs.js';
import { updateSel } from './dock.js';

// ------------------------------------------------------------ podgląd / płótno
// zoom podglądu (jak w Trio): k – krotność względem dopasowania, x/y – przesunięcie w px pudełka
export let view = { k: 1, x: 0, y: 0 }, fit = { base: 1, ox: 0, oy: 0 };
// wymiar sceny z zabezpieczeniem: scena bez width/height (stary zapis, scena z serwera) nie może dać NaN w transformacji
const sceneW = () => +scene?.width || 1920, sceneH = () => +scene?.height || 1080;
// pikseli ekranu na piksel CSS: okno podaje skalę ekranu i powiększenie interfejsu (__vizrsShell.px / zoom);
// devicePixelRatio przy skali ułamkowej kłamie (2 zamiast 1.25 na Waylandzie, 1 przez XWayland). Bez okna – 1.
const screenPx = () => { const sh = window.__vizrsShell; return sh?.px > 0 ? sh.px * (sh.zoom > 0 ? sh.zoom : 1) : 1; };
// skala w procentach pikseli ekranu: 100% = piksel sceny na piksel ekranu
const pct = () => Math.round(scale * screenPx() * 100) + '%';
export const infoText = (x, y) => `${x}, ${y}   ·   ${scene ? `${sceneW()}×${sceneH()}` : '–'}   ·   ${pct()}`;
export function applyView() {
  const b = box.getBoundingClientRect(), w = sceneW() * scale, h = sceneH() * scale, M = 40;
  // scena nie może całkiem uciec z pola widzenia
  view.x = Math.min(b.width - M - fit.ox, Math.max(M - w - fit.ox, view.x));
  view.y = Math.min(b.height - M - fit.oy, Math.max(M - h - fit.oy, view.y));
  stage.style.transform = `translate(${fit.ox + view.x}px, ${fit.oy + view.y}px) scale(${scale})`;
  $('#vZoom').textContent = pct();
  $('#info').textContent = $('#info').textContent.replace(/\d+%$/, pct());
  placeGuides(); updateSel();
}
export function resize() {
  if (!scene) return;
  const b = box.getBoundingClientRect(), old = fit.base, base = fitStage(stage, box, sceneW(), sceneH());
  if (!(base > 0)) return; // pudełko kanwy bez wymiaru (panel schowany, okno w trakcie zmiany)
  // zmiana panelu: ten sam punkt sceny zostaje na środku
  if (old > 0) { view.x *= base / old; view.y *= base / old; }
  fit = { base, ox: (b.width - sceneW() * base) / 2, oy: (b.height - sceneH() * base) / 2 };
  setScale(base * view.k);
  applyView();
}
export function resetView() { view = { k: 1, x: 0, y: 0 }; resize(); }
/** Zoom do skali s (rzeczywistej), z punktem (px, py) pudełka nieruchomym. */
function zoomAt(s, px, py) {
  s = Math.min(8, Math.max(Math.min(0.1, fit.base), s));
  const f = s / scale;
  view = { k: s / fit.base, x: px - fit.ox - (px - fit.ox - view.x) * f, y: py - fit.oy - (py - fit.oy - view.y) * f };
  setScale(s); applyView();
}
/** Punkt (cx, cy) w px sceny na środku pudełka, w skali s. */
function zoomOn(cx, cy, s) {
  s = Math.min(8, Math.max(Math.min(0.1, fit.base), s));
  const b = box.getBoundingClientRect();
  view = { k: s / fit.base, x: b.width / 2 - fit.ox - cx * s, y: b.height / 2 - fit.oy - cy * s };
  setScale(s); applyView();
}
const boxMid = () => { const b = box.getBoundingClientRect(); return [b.width / 2, b.height / 2]; };
export const zoom100 = () => zoomOn(sceneW() / 2, sceneH() / 2, 1 / screenPx());
 // powiększenie interfejsu zmienia procent kanwy
export function zoomSel() {
  const el = selId && stage.querySelector(`[data-id="${CSS.escape(selId)}"]`);
  const r = el && el.style.display !== 'none' ? el.getBoundingClientRect() : null;
  if (!r || !r.width || !r.height) { toast('Zaznacz widoczny element', true); return; }
  const b = box.getBoundingClientRect(), s0 = stage.getBoundingClientRect();
  zoomOn((r.left + r.width / 2 - s0.left) / scale, (r.top + r.height / 2 - s0.top) / scale, scale * Math.min(0.7 * b.width / r.width, 0.7 * b.height / r.height));
}
// ------------------------------------------------------------ prowadnice, tło kanwy, przyciąganie
// Ustawienia podglądu (nie sceny): zapamiętane w localStorage tego okna, nie trafiają do show.json ani na antenę.
export const cut = (W, H, ar, f) => { const w = Math.min(W, H * ar) * f, h = H * f; return [(W - w) / 2, (H - h) / 2, w, h]; };
/** Obszary bezpieczne (EBU R 95: akcja 93%, grafika 90%; ochrona 4:3 – grafika 67,5% × 90% kadru 16:9) i kadry. */
export const GUIDES = [
  { k: 'ebuA', label: 'EBU R 95 – akcja 93%', c: '#f5c518', r: (W, H) => [W * 0.035, H * 0.035, W * 0.93, H * 0.93] },
  { k: 'ebuG', label: 'EBU R 95 – grafika 90%', c: '#4dd0e1', r: (W, H) => [W * 0.05, H * 0.05, W * 0.9, H * 0.9] },
  { k: 'c43', label: 'Kadr 4:3 (center cut)', c: '#ff8a65', r: (W, H) => cut(W, H, 4 / 3, 1) },
  { k: 'g43', label: 'EBU R 95 – grafika 4:3', c: '#ff8a65', dash: 1, r: (W, H) => cut(W, H, 4 / 3, 0.9) },
  { k: 'c149', label: 'Kadr 14:9', c: '#ce93d8', r: (W, H) => cut(W, H, 14 / 9, 1) },
  { k: 'sd80', label: 'Dawny tytuł SD 80%', c: '#9ccc65', dash: 1, r: (W, H) => [W * 0.1, H * 0.1, W * 0.8, H * 0.8] },
];
const BGS = [['checker', 'szachownica'], ['checkerL', 'jasna szach.'], ['black', 'czarne', '#000000'], ['gray', 'szare', '#808080'],
  ['white', 'białe', '#ffffff'], ['green', 'chroma ziel.', '#00b140'], ['blue', 'chroma nieb.', '#0047bb'], ['color', 'własny kolor']];
const CV_DEF = { show: false, snap: true, g: { ebuA: true, ebuG: true }, center: false, thirds: false, grid: false, gridStep: 100, bg: 'checker', bgColor: '#404040', bgImg: '' };
export let cv = { ...CV_DEF };
const saveCv = () => { try { localStorage.setItem('vizrs.canvas', JSON.stringify(cv)); } catch { /* ignoruj */ } };
export let snapShow = [];
export function setSnapShow(v) { snapShow = v; }
 // linie przyciągania widoczne podczas przeciągania: { ax: 'x' | 'y', v }

function placeGuides() {
  const b = box.getBoundingClientRect(), r = stage.getBoundingClientRect();
  const pos = { left: r.left - b.left + 'px', top: r.top - b.top + 'px', width: r.width + 'px', height: r.height + 'px' };
  Object.assign($('#bg').style, pos); Object.assign($('#guides').style, pos);
  placeRefs(); drawGuides();
}
export function drawGuides() {
  if (!scene) return;
  const W = scene.width, H = scene.height, k = 1 / scale, svg = $('#guides');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
  let h = '';
  if (cv.show) {
    if (cv.grid && cv.gridStep * scale >= 4) {
      let d = '';
      for (let x = cv.gridStep; x < W; x += cv.gridStep) d += `M${x} 0V${H}`;
      for (let y = cv.gridStep; y < H; y += cv.gridStep) d += `M0 ${y}H${W}`;
      h = html`${h}${html`<path class="g" d="${d}" stroke="rgba(255,255,255,.14)"/>`}`;
    }
    if (cv.thirds) h = html`${h}${html`<path class="g" d="M${W / 3} 0V${H}M${2 * W / 3} 0V${H}M0 ${H / 3}H${W}M0 ${2 * H / 3}H${W}" stroke="rgba(255,255,255,.35)" stroke-dasharray="2 4"/>`}`;
    if (cv.center) {
      const c = 30 * k;
      h = html`${h}${html`<path class="g" d="M${W / 2} 0V${H}M0 ${H / 2}H${W}" stroke="rgba(255,255,255,.18)"/><path class="g" d="M${W / 2 - c} ${H / 2}H${W / 2 + c}M${W / 2} ${H / 2 - c}V${H / 2 + c}" stroke="#fff"/>`}`;
    }
    let li = 0; // etykiety na przemian: lewy górny / prawy dolny róg ramki, żeby bliskie ramki się nie zasłaniały
    for (const g of GUIDES) {
      if (!cv.g[g.k]) continue;
      const [x, y, w, hh] = g.r(W, H), alt = li++ % 2;
      h = html`${h}${html`<rect class="g" x="${x}" y="${y}" width="${w}" height="${hh}" stroke="${g.c}" ${g.dash ? html`stroke-dasharray="6 4"` : ''} opacity=".9"/>`}`;
      h = html`${h}${alt
        ? html`<text x="${x + w - 4 * k}" y="${y + hh - 4 * k}" text-anchor="end" font-size="${10 * k}" fill="${g.c}" opacity=".85">${esc(g.label)}</text>`
        : html`<text x="${x + 4 * k}" y="${y + 12 * k}" font-size="${10 * k}" fill="${g.c}" opacity=".85">${esc(g.label)}</text>`}`;
    }
  }
  h = html`${h}${overlapSvg(k)}${measureSvg(k)}`;
  for (const s of snapShow) {
    const c = s.lbl ? 'snap ref' : 'snap';
    h = html`${h}${s.ax === 'x' ? html`<line class="${c}" x1="${s.v}" y1="0" x2="${s.v}" y2="${H}"/>` : html`<line class="${c}" x1="0" y1="${s.v}" x2="${W}" y2="${s.v}"/>`}`;
    if (s.lbl) h = html`${h}${s.ax === 'x' ? html`<text class="snapl" x="${s.v + 4 * k}" y="${14 * k}" font-size="${11 * k}">${esc(s.lbl)}</text>` : html`<text class="snapl" x="${4 * k}" y="${s.v - 4 * k}" font-size="${11 * k}">${esc(s.lbl)}</text>`}`;
  }
  setHtml(svg, h);
}
function applyBg() {
  const el = $('#bg'), b = BGS.find((x) => x[0] === cv.bg);
  el.className = ''; el.style.background = '';
  if (cv.bg === 'checker' || cv.bg === 'checkerL') el.className = cv.bg;
  else if (cv.bg === 'image' && cv.bgImg) el.style.background = `#000 url("/assets/${encodeURIComponent(cv.bgImg)}") center / cover no-repeat`;
  else el.style.background = b?.[2] || cv.bgColor;
}
function syncCvUI() {
  $('#bSafe').classList.toggle('on', cv.show); $('#vGuides').classList.toggle('on', cv.show); $('#vSnap').classList.toggle('on', cv.snap);
}
function renderGuidesPop() {
  const ck = (key, on, label, extra = '') => html`<label><input type="checkbox" data-cv="${key}" ${on ? 'checked' : ''}> ${label}${extra}</label>`;
  setHtml($('#pGuides'), html`${ck('show', cv.show, html`<b>Pokaż prowadnice</b> (▢ Safe)`)}
    <h4>Obszary bezpieczne i kadry</h4>${GUIDES.map((g) => ck('g.' + g.k, cv.g[g.k], html`<span style="color:${g.c}">▭</span> ${esc(g.label)}`))}
    <h4>Pomocnicze</h4>${ck('center', cv.center, 'Środek kadru')}${ck('thirds', cv.thirds, 'Trójpodział')}
    ${ck('grid', cv.grid, 'Siatka', html` <select data-cv="gridStep" style="margin-left:auto">${[10, 20, 25, 50, 100, 200].map((v) => html`<option ${v === cv.gridStep ? 'selected' : ''}>${v}</option>`)}</select> px`)}
    <h4>Przesuwanie</h4>${ck('snap', cv.snap, 'Przyciąganie (Ctrl w trakcie = bez)')}`);
}
function renderBgPop() {
  const imgs = assets.filter((a) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(a.name)).map((a) => a.name);
  setHtml($('#pBg'), html`<h4>Tło kanwy</h4><div class="sw">${BGS.map(([k, label, c]) => html`<button data-bg="${k}" class="${cv.bg === k ? 'on' : ''} ${k.startsWith('checker') ? k : ''}" title="${label}" style="${c ? `background:${c};color:${k === 'white' ? '#000' : '#fff'}` : k === 'color' ? `background:${cv.bgColor}` : ''}">${esc(label)}</button>`)}</div>
    <label style="margin-top:6px">Własny kolor <input type="color" id="bgColor" value="${cv.bgColor}" style="margin-left:auto"></label>
    <h4>Obraz referencyjny (z zasobów)</h4>
    <div class="row"><select id="bgImg" class="grow"><option value="">— brak —</option>${imgs.map((n) => html`<option ${cv.bg === 'image' && n === cv.bgImg ? 'selected' : ''}>${esc(n)}</option>`)}</select><button id="bgUp" title="Wgraj obraz (np. kadr programu) do zasobów">Wgraj…</button></div>
    <div class="dim" style="margin-top:6px;font-size:11px">Tylko podgląd w Artist – nie zmienia sceny ani wyjścia.</div>`);
}
export function togglePop(id) {
  const p = $(id), open = p.hidden;
  $$('.vpop').forEach((x) => { x.hidden = true; });
  if (!open) return;
  if (id === '#pGuides') renderGuidesPop(); else if (id === '#pRefs') renderRefsPop(); else renderBgPop();
  p.hidden = false;
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  addEventListener('vizrs-zoom', () => { if (scene) applyView(); });
  $('#vTools').addEventListener('mousedown', (e) => e.stopPropagation());
  $('#vIn').onclick = () => zoomAt(scale * 1.5, ...boxMid());
  $('#vOut').onclick = () => zoomAt(scale / 1.5, ...boxMid());
  $('#vFit').onclick = resetView;
  $('#v100').onclick = zoom100;
  $('#vSel').onclick = zoomSel;
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    const b = box.getBoundingClientRect();
    zoomAt(scale * Math.exp(-e.deltaY * 0.0015), e.clientX - b.left, e.clientY - b.top);
  }, { passive: false });
  addEventListener('resize', () => { resize(); renderTimeline(); });
  try {
    const o = JSON.parse(localStorage.getItem('vizrs.canvas') || '{}');
    if (o && typeof o === 'object') cv = { ...CV_DEF, ...o, g: { ...(o.g && typeof o.g === 'object' ? o.g : CV_DEF.g) } };
  } catch { /* brak localStorage albo uszkodzony wpis */ }
  if (!/^#[0-9a-f]{6}$/i.test(cv.bgColor)) cv.bgColor = CV_DEF.bgColor;
  cv.gridStep = Math.min(1000, Math.max(5, Math.round(+cv.gridStep) || 100));
  if (typeof cv.bgImg !== 'string') cv.bgImg = '';
  $('#vGuides').onclick = () => togglePop('#pGuides');
  $('#vBg').onclick = () => togglePop('#pBg');
  $('#vRefs').onclick = () => togglePop('#pRefs');
  $('#vSnap').onclick = () => { cv.snap = !cv.snap; saveCv(); syncCvUI(); toast(cv.snap ? 'Przyciąganie włączone' : 'Przyciąganie wyłączone'); };
  $('#bSafe').onclick = () => { cv.show = !cv.show; saveCv(); syncCvUI(); drawGuides(); if (!$('#pGuides').hidden) renderGuidesPop(); };
  for (const p of $$('.vpop')) for (const ev of ['mousedown', 'wheel', 'dblclick']) p.addEventListener(ev, (e) => e.stopPropagation());
  addEventListener('mousedown', (e) => { if (!e.target.closest('.vpop, #vTools')) $$('.vpop').forEach((x) => { x.hidden = true; }); });
  $('#pGuides').addEventListener('change', (e) => {
    const k = e.target.dataset.cv; if (!k) return;
    if (k === 'gridStep') { cv.gridStep = +e.target.value || 100; cv.grid = true; renderGuidesPop(); }
    else if (k.startsWith('g.')) cv.g[k.slice(2)] = e.target.checked;
    else cv[k] = e.target.checked;
    if (k !== 'show' && k !== 'snap' && e.target.checked) cv.show = true; // wybór prowadnicy ją pokazuje
    saveCv(); syncCvUI(); drawGuides();
    $('#pGuides [data-cv="show"]').checked = cv.show;
  });
  $('#pBg').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bg]');
    if (b) { cv.bg = b.dataset.bg; saveCv(); applyBg(); renderBgPop(); return; }
    if (e.target.id === 'bgUp') { const a = await uploadAsset('image/*'); if (a?.name) { cv.bg = 'image'; cv.bgImg = a.name; saveCv(); applyBg(); renderBgPop(); } }
  });
  $('#pBg').addEventListener('input', (e) => { if (e.target.id === 'bgColor') { cv.bgColor = e.target.value; cv.bg = 'color'; saveCv(); applyBg(); $$('#pBg [data-bg]').forEach((x) => x.classList.toggle('on', x.dataset.bg === 'color')); $('#pBg [data-bg="color"]').style.background = cv.bgColor; } });
  $('#pBg').addEventListener('change', (e) => {
    if (e.target.id !== 'bgImg') return;
    if (e.target.value) { cv.bg = 'image'; cv.bgImg = e.target.value; } else if (cv.bg === 'image') cv.bg = 'checker';
    saveCv(); applyBg(); renderBgPop();
  });
  applyBg(); syncCvUI();
}

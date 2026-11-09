// Most stron Artist/Trio z oknem natywnym vizrs-shell (w przeglądarce nic nie robi).
// Strona zgłasza stan (tytuł, zmiany, cofanie, kopia robocza), powłoka wysyła komendy z menu i pliki.
// W oknie natywnym pytania idą do systemowych okien dialogowych (`dialog`), a zachowania przeglądarki
// (menu kontekstowe, skróty przeglądarki, nawigacja przyciskami myszy, przeciąganie obrazów) są wyłączone.
const shell = window.__vizrsShell;
// __vizrsPost: okno Tauri (tam `window.ipc` należy do Tauri i nie da się go podmienić); inaczej `window.ipc` (GTK, wry)
const post = (o) => { try { const m = 'app:' + JSON.stringify(o); if (window.__vizrsPost) window.__vizrsPost(m); else window.ipc.postMessage(m); } catch { /* okno zamykane */ } };

/** System okna: 'windows' | 'macos' | 'linux' | '' (przeglądarka). */
export const OS = shell?.os || '';

// ------------------------------------------------------------ okna dialogowe
// Limity jak w `src/bridge.rs` (dłuższy tekst okno odrzuca).
const MAX_TEXT = 4000, MAX_BTN = 40;
let dialogSeq = 0;
const waiting = new Map();
if (shell) {
  // odpowiedź okna: numer przycisku (0 = pierwszy; zamknięcie okna dialogowego = ostatni)
  window.__vizrsDialog = (id, choice) => { const f = waiting.get(id); if (f) { waiting.delete(id); f(choice); } };
}

/**
 * Systemowe okno z pytaniem; wynik: numer przycisku (ostatni = anuluj / zamknięte).
 * buttons: 1–3 etykiety, pierwsza to przycisk domyślny. W przeglądarce: alert/confirm.
 */
export function choose(text, { title = 'VizRS CG Artist', buttons = ['OK', 'Anuluj'], kind = 'warning' } = {}) {
  text = String(text).slice(0, MAX_TEXT);
  buttons = buttons.slice(0, 3).map((b) => String(b).slice(0, MAX_BTN));
  if (!shell) {
    if (buttons.length === 1) { alert(text); return Promise.resolve(0); }
    return Promise.resolve(confirm(`${title}\n\n${text}`) ? 0 : buttons.length - 1);
  }
  shell.lastDialog = text;
  const id = ++dialogSeq;
  return new Promise((res) => { waiting.set(id, res); post({ t: 'dialog', id, kind, title: String(title).slice(0, 200), text, buttons }); });
}
/** Pytanie tak/nie: `true` = pierwszy przycisk. */
export async function confirmBox(text, { ok = 'OK', cancel = 'Anuluj', ...o } = {}) {
  return (await choose(text, { ...o, buttons: [ok, cancel] })) === 0;
}
/** Komunikat z jednym przyciskiem. */
export function messageBox(text, { kind = 'info', ...o } = {}) {
  return choose(text, { ...o, kind, buttons: ['OK'] });
}

// Pole tekstowe: systemowe okna dialogowe go nie mają, więc to okno strony w układzie przycisków danego systemu
// (Windows: OK, Anuluj; macOS i Linux: Anuluj, OK – przycisk domyślny po prawej).
let textOpen = false;
export function promptBox(text, value = '', { title = '', ok = 'OK', cancel = 'Anuluj' } = {}) {
  if (!shell) return Promise.resolve(prompt(text, value));
  return new Promise((res) => {
    textOpen = true;
    const d = document.createElement('div');
    d.className = 'nd-back';
    d.innerHTML = `<form class="nd" role="dialog" aria-modal="true"><div class="nd-t"></div><div class="nd-m"></div>
      <input class="nd-in" spellcheck="false" autocomplete="off"><div class="nd-b"></div></form>`;
    const f = d.querySelector('form');
    d.querySelector('.nd-t').textContent = title;
    d.querySelector('.nd-t').hidden = !title;
    d.querySelector('.nd-m').textContent = text;
    const inp = d.querySelector('input'); inp.value = value ?? '';
    const bOk = Object.assign(document.createElement('button'), { type: 'submit', className: 'acc', textContent: ok });
    const bNo = Object.assign(document.createElement('button'), { type: 'button', textContent: cancel });
    d.querySelector('.nd-b').append(...(OS === 'windows' ? [bOk, bNo] : [bNo, bOk]));
    const done = (v) => { textOpen = false; d.remove(); removeEventListener('keydown', esc, true); res(v); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
    addEventListener('keydown', esc, true);
    f.onsubmit = (e) => { e.preventDefault(); done(inp.value); };
    bNo.onclick = () => done(null);
    document.body.appendChild(d);
    inp.focus(); inp.select();
  });
}

// pytanie przy zamykaniu okna: strona zna stan, więc i zapis należy do niej
let closing = false;
async function askClose(what, save, discard) {
  if (closing) return;
  closing = true;
  const c = await choose(what, { title: 'Zapisać zmiany przed zamknięciem?', buttons: ['Zapisz', 'Nie zapisuj', 'Anuluj'], kind: 'warning' });
  closing = false;
  if (c === 1) { discard(); return post({ t: 'close' }); }
  if (c !== 0) return post({ t: 'stay' });
  post({ t: (await save()) ? 'close' : 'stay' });
}

// ------------------------------------------------------------ okno natywne zamiast przeglądarki
// Skróty, którymi silnik WebView zdradza przeglądarkę: odświeżanie, szukanie, drukowanie, źródło, przeglądanie
// kursorem (F7), historia, pobrania, powiększanie strony. Skróty programu obsługuje menu okna i strona.
// (litery formatowania tekstu – B, I, U – zostają dla pól tekstowych)
const BROWSER_KEYS = new Set(['f', 'g', 'h', 'j', 'p', 'r', '+', '=', '-', '0']);
if (shell) {
  addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (['F3', 'F5', 'F7', 'F12', 'BrowserBack', 'BrowserForward', 'BrowserRefresh', 'BrowserSearch'].includes(e.key)
      || (mod && !e.altKey && BROWSER_KEYS.has(k))
      || (mod && e.shiftKey && ['i', 'j', 'c', 'delete'].includes(k))
      || (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home'))) e.preventDefault();
  });
  // boczne przyciski myszy (Wstecz/Dalej) nie przewijają historii strony
  for (const ev of ['mousedown', 'mouseup', 'auxclick']) addEventListener(ev, (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
  // obrazy i odnośniki interfejsu nie dają się wyciągnąć z okna jak ze strony
  addEventListener('dragstart', (e) => { if (e.target instanceof Element && e.target.closest('img, a') && !e.target.closest('[draggable="true"]')) e.preventDefault(); });
  // gesty powiększania strony (WKWebView na macOS)
  for (const ev of ['gesturestart', 'gesturechange']) addEventListener(ev, (e) => e.preventDefault());
  // menu kontekstowe silnika (Wstecz, Odśwież, Zbadaj element) – tylko w polach tekstowych zostaje (wytnij, kopiuj, pisownia)
  addEventListener('contextmenu', (e) => { if (!e.defaultPrevented && !(e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]'))) e.preventDefault(); });
}

// state() → { title, dirty, undo, redo, scene }; draft() → { id, text } kopii roboczej albo null
export function nativeBridge({ state, save, whatChanged, draft, commands = {} }) {
  if (!shell) return { sync() {}, clearDraft() {} };
  let last = '', draftId = null, draftText = null, parts = null;
  const clearDraft = () => { if (draftId) post({ t: 'draft', id: draftId, data: null }); draftId = null; draftText = null; };
  const sync = () => {
    const s = state(); if (!s) return;
    const j = JSON.stringify(s);
    if (j !== last) { last = j; post({ t: 'state', ...s }); }
  };
  window.__vizrsCmd = (name, arg) => {
    if (name === 'close') askClose(whatChanged(), save, clearDraft);
    else if (!textOpen || name === 'file' || name === 'draft') commands[name]?.(arg); // pole tekstowe otwarte: bez komend menu
  };
  window.__vizrsFile = {
    begin(name) { parts = { name, list: [] }; },
    chunk(b64) { parts.list.push(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); },
    end() { const f = new File(parts.list, parts.name); parts = null; commands.file?.(f); },
  };
  setInterval(sync, 300);
  if (draft) {
    setInterval(() => {
      const d = draft();
      if (draftId && d?.id !== draftId) clearDraft();
      if (d && d.text !== draftText) { draftId = d.id; draftText = d.text; post({ t: 'draft', id: d.id, data: d.text }); }
    }, 5000);
  }
  return { sync, clearDraft };
}

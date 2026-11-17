// Artist – drzewo: przeciąganie (zmiana rodzica i kolejności).

import { TYPES, walk } from '/renderer.js';
import { $, $$, checkpoint, fitGroup, locate, num, originOf, player, rnd, scene, scl, shiftNode, t, toast } from './core.js';
import { renderProps, renderTree } from './props.js';
import { renderTimeline } from './timeline.js';

// ------------------------------------------------------------ drzewo: przeciąganie (zmiana rodzica / kolejności)
export const isDesc = (anc, id) => { let f = false; walk(anc.children || [], (n) => { if (n.id === id) f = true; }); return f; };
export function moveNode(srcId, dstId, mode) {
  const S = locate(srcId), D = dstId ? locate(dstId) : null; if (!S) return;
  if (D && (D.node.id === srcId || isDesc(S.node, D.node.id))) return toast('Nie można przenieść węzła do własnego potomka', true);
  if (mode === 'into' && !(D && TYPES[D.node.type]?.children)) return;
  checkpoint();
  const o0 = originOf(S.parent?.id);
  S.list.splice(S.index, 1);
  const L = D ? locate(D.node.id) : null;
  let parent = null;
  if (mode === 'into') { (L.node.children ||= []).push(S.node); parent = L.node; }
  else if (L) { L.list.splice(L.index + 1, 0, S.node); parent = L.parent || null; }
  else scene.nodes.push(S.node);
  // zachowaj położenie na ekranie: układ nowego rodzica (z punktem zaczepienia), klucze x / y przesunięte razem
  const o1 = originOf(parent?.id);
  shiftNode(S.node, rnd(o0.x - o1.x), rnd(o0.y - o1.y));
  if (parent && (num(parent, 'rotation') || scl(parent) !== 1) || (S.parent && (num(S.parent, 'rotation') || scl(S.parent) !== 1)))
    toast('Grupa jest obrócona lub przeskalowana – element przyjmuje przekształcenie nowej grupy', true);
  if (mode === 'into') fitGroup(parent);
  player.setScene(scene); player.seek(t); renderTree(); renderProps(); renderTimeline();
}
let dragNode = null;
function dropMode(e, it) {
  const r = it.getBoundingClientRect(), n = locate(it.dataset.id)?.node;
  return n && TYPES[n.type]?.children && e.clientY > r.top + r.height * 0.25 && e.clientY < r.bottom - r.height * 0.25 ? 'into' : 'after';
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  $('#tree').addEventListener('dragstart', (e) => { const it = e.target.closest('.item[data-id]'); if (!it || !it.dataset.id) { e.preventDefault(); return; } dragNode = it.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragNode); } catch { /* ignoruj */ } });
  $('#tree').addEventListener('dragover', (e) => {
    const it = e.target.closest('.item'); if (!dragNode || !it) return;
    e.preventDefault();
    $$('#tree .dropinto, #tree .dropafter').forEach((x) => x.classList.remove('dropinto', 'dropafter'));
    it.classList.add(it.dataset.id ? (dropMode(e, it) === 'into' ? 'dropinto' : 'dropafter') : 'dropafter');
  });
  $('#tree').addEventListener('dragend', () => { dragNode = null; $$('#tree .dropinto, #tree .dropafter').forEach((x) => x.classList.remove('dropinto', 'dropafter')); });
  $('#tree').addEventListener('drop', (e) => {
    const it = e.target.closest('.item'); if (!dragNode || !it) return;
    e.preventDefault();
    const src = dragNode; dragNode = null;
    $$('#tree .dropinto, #tree .dropafter').forEach((x) => x.classList.remove('dropinto', 'dropafter'));
    if (!it.dataset.id) { moveNode(src, null, 'after'); return; } // upuszczenie na wiersz sceny = na koniec korzenia
    moveNode(src, it.dataset.id, dropMode(e, it));
  });
}

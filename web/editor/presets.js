// Artist – biblioteka presetów animacji.

import { PROPS, TYPES, uid } from '/renderer.js';
import { confirmBox, promptBox } from '/native.js';
import { $, api, checkpoint, player, scene, selNode, t, toast, undo } from './core.js';
import { renderProps, renderTree, syncProps } from './props.js';
import { renderTimeline } from './timeline.js';

// ------------------------------------------------------------ biblioteka presetów animacji
export let animPresets = [];
async function loadPresets() { animPresets = await api('GET', '/api/animpresets').catch(() => []); }
async function savePresets() { animPresets = await api('PUT', '/api/animpresets', animPresets); }
function presetFromNode(n, name) {
  const tracks = {}; let t0 = Infinity, t1 = 0;
  for (const [p, tr] of Object.entries(n.anim || {})) if (tr?.length) { tracks[p] = tr.map((k) => ({ ...k })); t0 = Math.min(t0, tr[0].t); t1 = Math.max(t1, tr[tr.length - 1].t); }
  if (!Object.keys(tracks).length) return null;
  for (const tr of Object.values(tracks)) tr.forEach((k) => { k.t = Math.round((k.t - t0) * 1000) / 1000; });
  return { id: uid('ap'), name, duration: Math.round((t1 - t0) * 1000) / 1000, tracks };
}
function applyPreset(n, pr) {
  let used = 0;
  for (const [p, tr] of Object.entries(pr.tracks || {})) {
    if (!PROPS[p]?.anim || !TYPES[n.type].props.includes(p)) continue;
    n.anim ||= {};
    const lo = t - 1e-4, hi = t + pr.duration + 1e-4;
    n.anim[p] = (n.anim[p] || []).filter((k) => k.t < lo || k.t > hi).concat(tr.map((k) => ({ ...k, t: Math.round((k.t + t) * 1000) / 1000 })));
    n.anim[p].sort((a, b) => a.t - b.t); used++;
  }
  return used;
}

/** Zdarzenia i stan początkowy; woła main.js, moduły w kolejności dawnego skryptu. */
export function init() {
  $('#props').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ap]'); if (!b) return;
    const n = selNode(); if (!n) return;
    const act = b.dataset.ap;
    try {
      if (act === 'save') {
        const name = await promptBox('Nazwa presetu animacji', n.name + ' – animacja', { title: 'Zapisz preset', ok: 'Zapisz' }); if (!name) return;
        const pr = presetFromNode(n, name);
        if (!pr) return toast('Węzeł nie ma kluczy animacji', true);
        animPresets.push(pr); await savePresets(); renderProps(); toast(`Zapisano preset „${name}”`);
      } else {
        const sel = $('#apSel')?.value, pr = animPresets.find((x) => x.id === sel);
        if (act === 'apply') {
          if (!pr) return toast('Wybierz preset', true);
          checkpoint(); const used = applyPreset(n, pr);
          if (!used) { undo.pop(); return toast('Ten węzeł nie ma właściwości z presetu', true); }
          player.setScene(scene); player.seek(t); renderTimeline(); renderTree(); syncProps(); toast(`Zastosowano preset „${pr.name}” od ${t.toFixed(2)}s`);
        } else if (act === 'del') {
          if (!pr || !(await confirmBox(`Preset „${pr.name}” zostanie usunięty.`, { title: 'Usunąć preset?', ok: 'Usuń' }))) return;
          animPresets = animPresets.filter((x) => x.id !== pr.id); await savePresets(); renderProps();
        } else if (act === 'export') {
          if (!pr) return toast('Wybierz preset', true);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify(pr, null, 2)], { type: 'application/json' }));
          a.download = (pr.name || 'preset').replace(/[^\w.\-]+/g, '_') + '.animpreset.json'; a.click();
        } else if (act === 'import') {
          const fi = $('#fileIn'); fi.accept = '.json,application/json'; fi.value = '';
          fi.onchange = async () => {
            try { const x = JSON.parse(await fi.files[0].text()); if (!x.tracks) throw new Error('to nie jest preset animacji'); x.id = uid('ap'); animPresets.push(x); await savePresets(); renderProps(); toast('Zaimportowano preset'); }
            catch (err) { toast('Import: ' + err.message, true); }
          };
          fi.click();
        }
      }
    } catch (err) { toast(err.message, true); }
  });
  loadPresets();
}

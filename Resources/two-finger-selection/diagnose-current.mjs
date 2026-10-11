import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(process.cwd() + '/package.json');
const { JSDOM } = require('jsdom');
const { attachTwoFingerSelection } = await import(pathToFileURL(process.cwd() + '/web/src/lib/twoFingerSelection.mjs'));
function harness({ gapRows = false, linked = false, count = 500 } = {}) {
  const dom = new JSDOM('<div id="pane"><article><p>body</p><a href="#">link</a></article></div>');
  const win = dom.window, pane = win.document.querySelector('#pane');
  const target = pane.querySelector(linked ? 'a' : 'p');
  let selected = new Set(['outside']), writes = 0, hits = 0, rectReads = 0, frameId = 0;
  const frames = new Map(), statuses = [];
  pane.getBoundingClientRect = () => { rectReads++; return { top: 0, bottom: 1000 }; };
  win.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const api = attachTwoFingerSelection(pane, {
    getSelection: () => selected, setSelection: next => { selected = next; writes++; },
    getVisibleIds: () => Array.from({ length: count }, (_, i) => i),
    hitTest: y => { hits++; return gapRows && y % 80 > 65 ? null : Math.floor(y / 80); },
    onStatus: message => statuses.push(message),
  });
  const points = (y, gap = 60, dx = 0) => [{ identifier: 1, clientX: 100 + dx, clientY: y, target }, { identifier: 2, clientX: 100 + dx + gap, clientY: y, target }];
  const event = (type, pts, cancelable = true) => { const e = new win.Event(type, { bubbles: true, cancelable }); Object.defineProperty(e, 'touches', { value: pts }); target.dispatchEvent(e); return e.defaultPrevented; };
  const snapshot = () => ({ selected: [...selected], writes, hits, paneRectReads: rectReads, pendingFrames: frames.size, active: api.active, statuses: [...statuses] });
  const tick = t => { const pair = [...frames][0]; if (pair) { frames.delete(pair[0]); pair[1](t); } };
  return { event, points, snapshot, tick, close: () => { api.destroy(); win.close(); } };
}
function run(name, options, task) { const h = harness(options); try { return { name, ...task(h) }; } finally { h.close(); } }
const results = [
  run('coherent-pan-with-finger-drift', {}, h => { h.event('touchstart', h.points(40)); h.event('touchmove', h.points(130)); const before = h.snapshot(); h.event('touchmove', h.points(210, 78)); return { before, after: h.snapshot(), trace: 'centroid +170px, separation +18px after recognition' }; }),
  run('start-in-row-gap', { gapRows: true }, h => { const prevented = h.event('touchstart', h.points(72)); h.event('touchmove', h.points(190)); return { prevented, after: h.snapshot() }; }),
  run('start-in-link', { linked: true }, h => { const prevented = h.event('touchstart', h.points(40)); h.event('touchmove', h.points(190)); return { prevented, after: h.snapshot() }; }),
  run('early-diagonal-then-vertical', {}, h => { h.event('touchstart', h.points(40)); h.event('touchmove', h.points(50, 60, 13)); h.event('touchmove', h.points(190, 60, 14)); return { after: h.snapshot() }; }),
  run('300-moves-within-one-row-before-a-frame', {}, h => { h.event('touchstart', h.points(100)); for (let i = 0; i < 300; i++) h.event('touchmove', h.points(130 + i % 10)); const beforeIdle = h.snapshot(); for (let i = 0; i < 120; i++) h.tick(i * 16.67); return { beforeIdle, after120StationaryFrames: h.snapshot() }; }),
];
console.log(JSON.stringify({ kind: 'synthetic-existing-engine-diagnostics', realDeviceMeasurement: false, results }, null, 2));

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { attachTwoFingerSelection, edgeVelocity, gestureSelection } from './gesture.mjs';

function harness(baseline = [], { autoFrame = true } = {}) {
  const dom = new JSDOM('<div id="pane"><article><p>正文</p><button>操作</button></article></div>', { pretendToBeVisual: true });
  const win = dom.window, element = win.document.getElementById('pane'), body = element.querySelector('p');
  element.getBoundingClientRect = () => ({ top: 0, bottom: 300 });
  Object.defineProperties(element, { scrollHeight: { value: 1200 }, clientHeight: { value: 300 } });
  let selected = new Set(baseline), disabled = false, frames = [], statuses = [], writes = 0, hits = 0;
  win.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  win.cancelAnimationFrame = () => { frames = []; };
  const api = attachTwoFingerSelection(element, {
    getSelection: () => selected, setSelection: next => { selected = next; writes++; },
    getVisibleIds: () => ['a', 'c', 'd', 'f'], disabled: () => disabled,
    hitTest: y => { hits++; return ['a', 'c', 'd', 'f'][Math.min(3, Math.floor(y / 75))]; },
    onStatus: s => statuses.push(s),
  });
  const points = (y, gap = 30) => [{ identifier: 1, clientX: 40, clientY: y, target: body }, { identifier: 2, clientX: 40 + gap, clientY: y, target: body }];
  function event(type, pts, target = body, cancelable = true) {
    const e = new win.Event(type, { bubbles: true, cancelable });
    Object.defineProperty(e, 'touches', { value: pts }); target.dispatchEvent(e);
    if (autoFrame && type === 'touchmove') frames.shift()?.(16);
    return e;
  }
  return { element, body, win, api, points, event, statuses, metrics: () => ({ writes, hits, frames: frames.length }), selected: () => [...selected].sort(), replaceSelection: ids => { selected = new Set(ids); }, disable: () => { disabled = true; }, tick: time => { const next = frames.shift(); next?.(time); }, close: () => { api.destroy(); win.close(); } };
}

test('range uses visible IDs only, preserves unrelated selection and backtracks from baseline', () => {
  const base = new Set(['outside', 'hidden']);
  assert.deepEqual([...gestureSelection(base, ['a', 'c', 'f'], 'a', 'f', false)].sort(), ['a', 'c', 'f', 'hidden', 'outside']);
  assert.deepEqual([...gestureSelection(base, ['a', 'c', 'f'], 'a', 'c', false)].sort(), ['a', 'c', 'hidden', 'outside']);
});

test('one finger scroll is not prevented and sub-threshold gesture does not select', () => {
  const h = harness();
  try {
    assert.equal(h.event('touchstart', h.points(30).slice(0, 1)).defaultPrevented, false);
    assert.equal(h.event('touchmove', h.points(35).slice(0, 1)).defaultPrevented, false);
    h.event('touchend', []);
    assert.equal(h.event('touchstart', h.points(30)).defaultPrevented, true);
    h.event('touchmove', h.points(36)); assert.deepEqual(h.selected(), []);
    h.event('touchend', []); assert.deepEqual(h.selected(), []);
  } finally { h.close(); }
});

test('two fingers add visible range, backtrack, suppress phantom clicks and preserve on lift', () => {
  const h = harness(['outside']);
  try {
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(190));
    assert.deepEqual(h.selected(), ['a', 'c', 'd', 'outside']);
    h.event('touchmove', h.points(110)); assert.deepEqual(h.selected(), ['a', 'c', 'outside']);
    h.event('touchend', []); assert.deepEqual(h.selected(), ['a', 'c', 'outside']);
    assert.equal(h.event('click', []).defaultPrevented, true);
  } finally { h.close(); }
});

test('selected anchor locks deselection direction and restores baseline on backtrack', () => {
  const h = harness(['a', 'c', 'd', 'outside']);
  try {
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(190));
    assert.deepEqual(h.selected(), ['outside']);
    h.event('touchmove', h.points(110)); assert.deepEqual(h.selected(), ['d', 'outside']);
    h.event('touchend', []); assert.deepEqual(h.selected(), ['d', 'outside']);
  } finally { h.close(); }
});

test('third contact, system cancel, disabled state and noncancelable move restore baseline', () => {
  for (const kind of ['third', 'cancel', 'disabled', 'system']) {
    const h = harness(['outside']);
    try {
      h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110));
      assert.deepEqual(h.selected(), ['a', 'c', 'outside']);
      if (kind === 'third') h.event('touchstart', [...h.points(110), { identifier: 3, clientX: 100, clientY: 110 }]);
      if (kind === 'cancel') h.event('touchcancel', []);
      if (kind === 'disabled') { h.disable(); h.event('touchmove', h.points(150)); }
      if (kind === 'system') h.event('touchmove', h.points(150), h.body, false);
      assert.deepEqual(h.selected(), ['outside'], kind);
    } finally { h.close(); }
  }
});

test('buttons, stylus, horizontal movement and already-committed scroll cannot start selection', () => {
  for (const kind of ['button', 'stylus', 'horizontal', 'system']) {
    const h = harness();
    try {
      const points = h.points(30);
      if (kind === 'button') points[0].target = h.element.querySelector('button');
      if (kind === 'stylus') points[0].touchType = 'stylus';
      h.event('touchstart', points, h.body, kind !== 'system');
      if (kind === 'horizontal') h.event('touchmove', points.map(p => ({ ...p, clientX: p.clientX + 30 })));
      else h.event('touchmove', h.points(150));
      assert.deepEqual(h.selected(), [], kind);
    } finally { h.close(); }
  }
});

test('edge scrolling starts only after gesture recognition and is stopped by cancellation', () => {
  const h = harness();
  try {
    assert.equal(edgeVelocity(150, 0, 300), 0);
    assert.ok(edgeVelocity(280, 0, 300) > 0); assert.ok(edgeVelocity(20, 0, 300) < 0);
    h.event('touchstart', h.points(100)); h.event('touchmove', h.points(280)); h.tick(16);
    assert.ok(h.element.scrollTop > 0);
    const position = h.element.scrollTop;
    h.api.cancel(); h.tick(32); assert.equal(h.element.scrollTop, position);
    assert.deepEqual(h.selected(), []);
  } finally { h.close(); }
});


test('window blur and hidden-page lifecycle restore the baseline and stop edge scrolling', () => {
  for (const kind of ['blur', 'pagehide', 'visibilitychange']) {
    const h = harness(['outside']);
    try {
      h.event('touchstart', h.points(100)); h.event('touchmove', h.points(280)); h.tick(16);
      const position = h.element.scrollTop;
      if (kind === 'visibilitychange') {
        Object.defineProperty(h.win.document, 'hidden', { configurable: true, value: true });
        h.win.document.dispatchEvent(new h.win.Event(kind));
      } else h.win.dispatchEvent(new h.win.Event(kind));
      assert.deepEqual(h.selected(), ['outside'], kind);
      assert.equal(h.api.active, false, kind);
      h.tick(32); assert.equal(h.element.scrollTop, position, kind);
    } finally { h.close(); }
  }
});

test('cancellation and ordinary lift outside the pane both terminate the session', () => {
  for (const kind of ['touchcancel', 'touchend']) {
    const h = harness(['outside']);
    try {
      h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110));
      h.event(kind, [], h.win.document.body);
      assert.equal(h.api.active, false, kind);
      assert.deepEqual(h.selected(), kind === 'touchcancel' ? ['outside'] : ['a', 'c', 'outside']);
    } finally { h.close(); }
  }
});

test('a disabled gesture restores baseline before the next animation frame or finger lift', () => {
  for (const kind of ['frame', 'end']) {
    const h = harness(['outside']);
    try {
      h.event('touchstart', h.points(30)); h.event('touchmove', h.points(280));
      const position = h.element.scrollTop; h.disable();
      if (kind === 'frame') h.tick(16); else h.event('touchend', []);
      assert.deepEqual(h.selected(), ['outside'], kind);
      assert.equal(h.api.active, false, kind); assert.equal(h.element.scrollTop, position, kind);
    } finally { h.close(); }
  }
});

test('explicit cancellation blocks replacement contacts until every finger lifts', () => {
  const h = harness(['outside']);
  try {
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110)); h.api.cancel();
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(190));
    assert.deepEqual(h.selected(), ['outside']);
    h.event('touchend', []); h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110));
    assert.deepEqual(h.selected(), ['a', 'c', 'outside']);
  } finally { h.close(); }
});

test('contact replacement at lift cancels rather than committing a stale range', () => {
  const h = harness(['outside']);
  try {
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110));
    h.event('touchend', [{ ...h.points(110)[0], identifier: 9 }]);
    assert.deepEqual(h.selected(), ['outside']); assert.equal(h.api.active, false);
  } finally { h.close(); }
});

test('keyboard activation remains available after touch selection while phantom touch clicks are blocked', () => {
  const h = harness();
  try {
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110)); h.event('touchend', []);
    const keyboard = new h.win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 });
    h.element.querySelector('button').dispatchEvent(keyboard); assert.equal(keyboard.defaultPrevented, false);
    const touchClick = new h.win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    h.body.dispatchEvent(touchClick); assert.equal(touchClick.defaultPrevented, true);
  } finally { h.close(); }
});

test('a visible-page event preserves selection and fresh contact recovers a lost release after blur', () => {
  const h = harness(['outside']);
  try {
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110));
    Object.defineProperty(h.win.document, 'hidden', { configurable: true, value: false });
    h.win.document.dispatchEvent(new h.win.Event('visibilitychange')); assert.deepEqual(h.selected(), ['a', 'c', 'outside']);
    h.win.dispatchEvent(new h.win.Event('blur')); assert.deepEqual(h.selected(), ['outside']);
    h.event('touchstart', h.points(30).slice(0, 1)); h.event('touchstart', h.points(30)); h.event('touchmove', h.points(110));
    assert.deepEqual(h.selected(), ['a', 'c', 'outside']);
  } finally { h.close(); }
});

test('a detached pane cancels scrolling and destruction unregisters lifecycle listeners', () => {
  const h = harness(['outside']);
  try {
    h.event('touchstart', h.points(30)); h.event('touchmove', h.points(280)); const position = h.element.scrollTop; h.element.remove(); h.tick(16);
    assert.deepEqual(h.selected(), ['outside']); assert.equal(h.api.active, false); assert.equal(h.element.scrollTop, position);
    h.api.destroy(); const statuses = h.statuses.length;
    h.win.dispatchEvent(new h.win.Event('blur')); h.win.dispatchEvent(new h.win.Event('pagehide')); h.event('touchcancel', [], h.win.document.body);
    assert.equal(h.statuses.length, statuses);
  } finally { h.close(); }
});

test('explicit selection changes supersede a gesture without restoring or overwriting them', () => {
  for (const kind of ['move', 'frame', 'end', 'cancel', 'blur']) {
    const h = harness(['outside']);
    try {
      h.event('touchstart', h.points(30)); h.event('touchmove', h.points(280)); h.replaceSelection(['manual']);
      if (kind === 'move') h.event('touchmove', h.points(190));
      if (kind === 'frame') h.tick(16);
      if (kind === 'end') h.event('touchend', []);
      if (kind === 'cancel') h.api.cancel();
      if (kind === 'blur') h.win.dispatchEvent(new h.win.Event('blur'));
      assert.deepEqual(h.selected(), ['manual'], kind); assert.equal(h.api.active, false, kind);
    } finally { h.close(); }
  }
});

test('same-frame movement coalesces and a stationary interior has no animation loop', () => {
  const h = harness(['outside'], { autoFrame: false });
  try {
    h.event('touchstart', h.points(100));
    for (let i = 0; i < 300; i++) h.event('touchmove', h.points(130 + i % 10));
    assert.deepEqual(h.metrics(), { writes: 0, hits: 1, frames: 1 });
    h.tick(16); assert.deepEqual(h.metrics(), { writes: 1, hits: 2, frames: 0 });
    for (let i = 0; i < 120; i++) h.tick(32 + i * 16);
    assert.deepEqual(h.metrics(), { writes: 1, hits: 2, frames: 0 });
    h.event('touchmove', h.points(142)); h.tick(32); assert.equal(h.metrics().writes, 1);
  } finally { h.close(); }
});

test('finger drift, diagonal launch and reversed touch ordering preserve a recognised pan', () => {
  const h = harness(['outside']);
  try {
    h.event('touchstart', h.points(30, 60));
    const diagonal = h.points(40, 60).map(p => ({ ...p, clientX: p.clientX + 13 }));
    h.event('touchmove', diagonal); assert.deepEqual(h.selected(), ['a', 'outside']);
    h.event('touchmove', h.points(190, 78).reverse()); assert.deepEqual(h.selected(), ['a', 'c', 'd', 'outside']);
    h.event('touchmove', h.points(190, 140)); assert.equal(h.api.active, true);
    h.event('touchend', []); assert.deepEqual(h.selected(), ['a', 'c', 'd', 'outside']);
  } finally { h.close(); }
});

test('true pinch before recognition stays out of selection', () => {
  const h = harness(['outside']);
  try {
    h.event('touchstart', h.points(30, 60));
    h.event('touchmove', h.points(30, 60).map((p, i) => ({ ...p, clientX: p.clientX + (i ? 25 : -25) })));
    assert.deepEqual(h.selected(), ['outside']); assert.equal(h.api.active, false);
    h.event('touchmove', h.points(190)); assert.deepEqual(h.selected(), ['outside']);
  } finally { h.close(); }
});

test('release flushes the final pending range and cancellation discards it', () => {
  for (const cancelled of [false, true]) {
    const h = harness(['outside'], { autoFrame: false });
    try {
      h.event('touchstart', h.points(30)); h.event('touchmove', h.points(190));
      h.event(cancelled ? 'touchcancel' : 'touchend', []);
      assert.deepEqual(h.selected(), cancelled ? ['outside'] : ['a', 'c', 'd', 'outside']);
      assert.equal(h.metrics().frames, 0); h.tick(16);
      assert.deepEqual(h.selected(), cancelled ? ['outside'] : ['a', 'c', 'd', 'outside']);
    } finally { h.close(); }
  }
});

test('staggered contacts and asynchronous finger motion wait for common intent', () => {
  const h = harness();
  try {
    const pair = h.points(30, 60);
    assert.equal(h.event('touchstart', pair.slice(0, 1)).defaultPrevented, false);
    assert.equal(h.event('touchstart', pair).defaultPrevented, true);
    h.event('touchmove', [pair[0], { ...pair[1], clientY: 50 }]); assert.deepEqual(h.selected(), []);
    h.event('touchmove', h.points(90, 60)); assert.deepEqual(h.selected(), ['a', 'c']);
  } finally { h.close(); }
});

test('incremental selection matches baseline ranges through arbitrary reversals', () => {
  for (const baseline of [['outside'], ['a', 'd', 'outside'], ['c', 'f', 'outside']]) {
    const h = harness(baseline);
    try {
      h.event('touchstart', h.points(110));
      for (const y of [190, 40, 260, 110, 40, 190, 110]) {
        h.event('touchmove', h.points(y));
        const end = ['a', 'c', 'd', 'f'][Math.min(3, Math.floor(y / 75))];
        assert.deepEqual(h.selected(), [...gestureSelection(new Set(baseline), ['a', 'c', 'd', 'f'], 'c', end, baseline.includes('c'))].sort());
      }
    } finally { h.close(); }
  }
});

test('edge animation stops at scroll limits and resumes when direction changes', () => {
  const h = harness([], { autoFrame: false });
  try {
    h.element.scrollTop = 900;
    h.event('touchstart', h.points(100)); h.event('touchmove', h.points(290)); h.tick(16);
    assert.equal(h.metrics().frames, 0); assert.equal(h.element.scrollTop, 900);
    h.event('touchmove', h.points(5)); h.tick(32); assert.ok(h.element.scrollTop < 900); assert.equal(h.metrics().frames, 1);
    h.event('touchend', []); assert.equal(h.metrics().frames, 0);
  } finally { h.close(); }
});

test('sub-pixel edge motion accumulates on a quantised scroll container', () => {
  const h = harness([], { autoFrame: false });
  try {
    let actual = 0;
    Object.defineProperty(h.element, 'scrollTop', { get: () => actual, set: value => { actual = Math.floor(value); } });
    h.event('touchstart', h.points(100)); h.event('touchmove', h.points(245));
    for (let i = 0; i < 80; i++) h.tick(i * 16.67);
    assert.ok(actual >= 2); assert.equal(h.metrics().frames, 1);
    h.event('touchmove', h.points(150)); h.tick(1400); assert.equal(h.metrics().frames, 0);
  } finally { h.close(); }
});

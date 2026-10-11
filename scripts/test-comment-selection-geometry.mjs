import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCommentHitTester } from '../web/src/lib/commentSelectionGeometry.mjs';

function harness(count = 500) {
  const dom = new JSDOM('<div id="pane"></div>');
  const win = dom.window, pane = win.document.querySelector('#pane');
  let reads = 0, offset = 0, callback, observations = 0;
  const observed = new Set();
  win.ResizeObserver = class {
    constructor(cb) { callback = cb; }
    observe(node) { observations++; observed.add(node); }
    unobserve(node) { observed.delete(node); }
    disconnect() { observed.clear(); }
  };
  pane.getBoundingClientRect = () => ({ top: 0, bottom: 1000, left: 0, right: 500, height: 1000 });
  for (let i = 0; i < count; i++) {
    const row = win.document.createElement('article'); row.dataset.commentIndex = i;
    row.getBoundingClientRect = () => { reads++; return { top: i * 80 + offset - pane.scrollTop, bottom: i * 80 + 65 + offset - pane.scrollTop, height: 65 }; };
    pane.append(row);
  }
  const api = createCommentHitTester(pane, () => Array.from({ length: count }, (_, i) => i));
  return { win, pane, api, reads: () => reads, observations: () => observations, observed, shift: value => { offset = value; }, resize: () => callback([]), close: () => { api.destroy(); win.close(); } };
}

test('500 variable-position rows are measured once and scroll does not invalidate positions', () => {
  const h = harness();
  try {
    assert.equal(h.api.hitTest(130, { start: true, x: 100 }), 1); assert.equal(h.reads(), 500);
    for (let i = 0; i < 300; i++) assert.equal(h.api.hitTest(130 + i % 10), 1);
    h.pane.scrollTop = 39000;
    assert.equal(h.api.hitTest(600), 495); assert.equal(h.reads(), 500);
    assert.equal(h.api.hitTest(100, { start: true, x: 900 }), null);
  } finally { h.close(); }
});

test('narrow gaps choose the nearest comment, large blank areas cannot start a range', () => {
  const h = harness(2);
  try {
    assert.equal(h.api.hitTest(70, { start: true }), 0);
    assert.equal(h.api.hitTest(77, { start: true }), 1);
    assert.equal(h.api.hitTest(900, { start: true }), null);
    assert.equal(h.api.hitTest(900), 1);
    assert.equal(h.api.hitTest(-10), null);
  } finally { h.close(); }
});

test('native excerpt and module headings are excluded even when close to a comment', () => {
  const h = harness(3);
  try {
    const zone = h.win.document.createElement('header'); zone.className = 'comment-module-head';
    zone.getBoundingClientRect = () => ({ top: 65, bottom: 78, height: 13 }); h.pane.append(zone);
    assert.equal(h.api.hitTest(73, { start: true }), null);
    assert.equal(h.api.hitTest(73), 1);
    zone.className = ''; zone.id = 'native-excerpt';
    assert.equal(h.api.hitTest(70, { start: true }), null);
  } finally { h.close(); }
});

test('resize and image load invalidate geometry without re-observing every row', () => {
  const h = harness(3);
  try {
    h.api.hitTest(130, { start: true }); assert.equal(h.observations(), 4);
    h.shift(80); h.resize(); assert.equal(h.api.hitTest(130), 0); assert.equal(h.reads(), 6); assert.equal(h.observations(), 4);
    h.shift(160); const img = h.win.document.createElement('img'); h.pane.append(img); img.dispatchEvent(new h.win.Event('load'));
    assert.equal(h.api.hitTest(200), 0); assert.equal(h.reads(), 9);
    h.shift(0); h.win.dispatchEvent(new h.win.Event('resize')); assert.equal(h.api.hitTest(200), 2);
  } finally { h.close(); }
});

test('hidden and ineligible rows cannot become range endpoints', () => {
  const h = harness(3);
  try {
    h.api.destroy();
    h.pane.children[1].getBoundingClientRect = () => ({ top: 80, bottom: 80, height: 0 });
    const api = createCommentHitTester(h.pane, () => [0, 1]);
    assert.equal(api.hitTest(90), 0); assert.equal(api.hitTest(180, { start: true }), null);
    api.destroy(); assert.equal(h.observed.size, 0);
  } finally { h.close(); }
});

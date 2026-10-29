// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import App from './App';
import MNBridge from './lib/mnBridge';
import { defaultSettings, structureSignature } from './lib/commentModules.mjs';
import { alignedDragCenter, dragTarget } from './lib/commentDragGeometry.mjs';
vi.mock('./lib/mnBridge', () => ({ default: { send: vi.fn() } }));
let root, host, snapshot, saved, observers;
const $ = selector => document.querySelector(selector);
const grip = index => $(`#comment-${index} .comment-drag-handle`);
const click = async node => act(async () => node.click());
const key = async (value, target = document.body) => act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));
async function pointer(type, y, target = $('#comment-pane'), x = 470, id = 1) {
  await act(async () => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
    Object.defineProperties(e, { pointerId: { value: id }, isPrimary: { value: id === 1 }, pointerType: { value: 'touch' } });
    target.dispatchEvent(e);
  });
}
const calls = () => MNBridge.send.mock.calls.filter(([command]) => command === 'moveComments');
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  observers = [];
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { observers.push(callback); } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('cm-drag-viewport')) return { top: 62, bottom: 524, left: 12, right: 434, width: 422, height: 462 };
    return { top: 0, bottom: 560, left: 0, right: 500, width: 500, height: 560 };
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  snapshot = { noteId: 'drag-card', noteTitle: '拖动卡片', error: '', moduleSettings: defaultSettings(),
    excerpt: { present: true, type: 'text', text: '原生摘录', capabilities: {} }, commentFold: { supported: true, revision: '1' },
    comments: ['起点', '标题', '中间', '图片', '终点'].map((text, index) => ({ index, text, type: index === 1 ? 'HtmlComment' : index === 3 ? 'imageComment' : 'textComment', imageHash: index === 3 ? 'img' : '', collapsed: false, capabilities: { canMove: true, canCopyText: true, canSetCollapsed: true } })) };
  saved = snapshot;
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (['getCurrentNoteComments', 'refreshCurrentNote'].includes(command)) return snapshot;
    if (command === 'moveComments') {
      const from = payload.indices[0], to = payload.targetIndex > from ? payload.targetIndex - 1 : payload.targetIndex;
      const comments = snapshot.comments.slice(); comments.splice(to, 0, comments.splice(from, 1)[0]);
      snapshot = { ...snapshot, comments: comments.map((c, index) => ({ ...c, index })), commentFold: { supported: true, revision: String(+snapshot.commentFold.revision + 1) }, selectedIndices: [to] };
      return snapshot;
    }
    return {};
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<App />)); MNBridge.send.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it('previews all comments and sends one guarded move only on release, then undoes using the new revision', async () => {
  expect($('#native-excerpt .comment-drag-handle')).toBeNull();
  await pointer('pointerdown', 180, grip(0)); await pointer('pointermove', 190);
  expect($('.cm-drag-overview')).not.toBeNull(); expect(calls()).toHaveLength(0);
  await pointer('pointermove', 505); expect($('.cm-drag-landing').dataset.targetPosition).toBe('4');
  await pointer('pointerup', 505); await pointer('pointerup', 505);
  expect(calls()).toHaveLength(1);
  expect(calls()[0][1]).toEqual({ noteId: 'drag-card', indices: [0], targetIndex: 5, expectedStructure: structureSignature(saved.comments), expectedRevision: '1' });
  expect(snapshot.comments[4].text).toBe('起点'); expect($('.cm-drag-overview')).toBeNull();
  await click($('[aria-label="撤销拖动移动"]'));
  expect(calls()[1][1]).toMatchObject({ indices: [4], targetIndex: 0, expectedRevision: '2' });
  expect(snapshot.comments.map(c => c.text)).toEqual(saved.comments.map(c => c.text)); expect($('[aria-label="撤销拖动移动"]')).toBeNull();
});

it('supports consecutive guarded undo and keyboard endpoints', async () => {
  await key(' ', grip(0)); await key('End'); await key('Enter');
  await key(' ', grip(0)); await key('End'); await key('Enter');
  expect(calls()).toHaveLength(2);
  await click($('[aria-label="撤销拖动移动"]')); await click($('[aria-label="撤销拖动移动"]'));
  expect(snapshot.comments.map(c => c.text)).toEqual(saved.comments.map(c => c.text));
});

it('keeps taps and an original-position release free of mutations and selection side effects', async () => {
  await pointer('pointerdown', 280, grip(2)); await pointer('pointerup', 280);
  await pointer('pointerdown', 280, grip(2)); await pointer('pointermove', 290); await pointer('pointermove', 280); await pointer('pointerup', 280);
  expect(calls()).toHaveLength(0); expect($('[data-comment-index][aria-pressed=true]')).toBeNull();
});

it.each(['Escape', 'pointercancel', 'blur', 'resize', 'scroll', 'second', 'outside', 'filter', 'dialog', 'snapshot'])('cancels safely on %s', async kind => {
  await pointer('pointerdown', 180, grip(0)); await pointer('pointermove', 390);
  if (kind === 'Escape') await key('Escape');
  if (kind === 'pointercancel') await pointer('pointercancel', 390);
  if (['blur', 'resize', 'scroll'].includes(kind)) await act(async () => window.dispatchEvent(new Event(kind)));
  if (kind === 'second') await pointer('pointerdown', 390, document.body, 480, 2);
  if (kind === 'outside') { await pointer('pointermove', 390, $('#comment-pane'), 610); await pointer('pointerup', 390, $('#comment-pane'), 610); }
  if (kind === 'filter') await click([...host.querySelectorAll('.segmented button')].find(n => n.textContent.startsWith('文本')));
  if (kind === 'dialog') await click($('[aria-label="模块划分设置"]'));
  if (kind === 'snapshot') await act(async () => window.__MNCommentManagerNativeSync(JSON.stringify({ snapshot: { ...saved, noteId: 'next-card' } })));
  await pointer('pointerup', 390);
  expect(calls()).toHaveLength(0); expect($('.cm-drag-overview')).toBeNull();
  expect($('#comment-pane').classList.contains('comment-drag-active')).toBe(false);
});

it('ignores scrollbar content-box changes but cancels when the panel itself resizes', async () => {
  await act(async () => observers.forEach(fn => fn([{ contentRect: { width: 485, height: 560 } }])));
  await key(' ', grip(0));
  await act(async () => observers.forEach(fn => fn([{ contentRect: { width: 500, height: 560 } }])));
  expect($('.cm-drag-overview')).not.toBeNull();
  $('#comment-pane').getBoundingClientRect = () => ({ top: 0, bottom: 560, left: 0, right: 540, width: 540, height: 560 });
  await act(async () => observers.forEach(fn => fn([{ contentRect: { width: 540, height: 560 } }])));
  expect($('.cm-drag-overview')).toBeNull(); expect(calls()).toHaveLength(0);
});

it('includes filtered and module-hidden comments while moving only the dragged comment', async () => {
  await click([...host.querySelectorAll('.segmented button')].find(n => n.textContent.startsWith('文本')));
  await key(' ', grip(0)); expect($('.cm-drag-overview').textContent).toContain('全部 5 条评论');
  expect($('.cm-drag-overview').textContent).toContain('图片');
  await key('End'); await key('Enter'); expect(calls()[0][1].indices).toEqual([0]);
});

it('refreshes a rejected mutation and never offers a speculative undo', async () => {
  const normal = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === 'moveComments' ? Promise.reject(new Error('评论列表已变化')) : normal(command, payload));
  await key(' ', grip(0)); await key('End'); await key('Enter');
  expect(MNBridge.send).toHaveBeenCalledWith('refreshCurrentNote');
  expect($('[aria-label="撤销拖动移动"]')).toBeNull(); expect(snapshot).toBe(saved);
});

it('does not apply a late receipt to a different card', async () => {
  let resolve;
  const normal = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === 'moveComments' ? new Promise(r => { resolve = () => r(normal(command, payload)); }) : normal(command, payload));
  await key(' ', grip(0)); await key('End'); await key('Enter');
  await act(async () => window.__MNCommentManagerNativeSync(JSON.stringify({ snapshot: { ...saved, noteId: 'next-card', noteTitle: '下一卡片' } })));
  await act(async () => resolve());
  expect($('[aria-label="撤销拖动移动"]')).toBeNull(); expect(host.textContent).toContain('下一卡片');
});

it('bounds rendered overview rows for large lists', async () => {
  const large = { ...saved, comments: Array.from({ length: 5000 }, (_, index) => ({ ...saved.comments[0], index, text: `评论 ${index}` })) };
  // Keep the ordinary DOM small through a search while overview still sees all 5000.
  const input = $('#comment-search');
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '评论 4999'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => window.__MNCommentManagerNativeSync(JSON.stringify({ snapshot: large })));
  await key(' ', grip(4999));
  expect(document.querySelectorAll('.cm-drag-summary').length).toBeLessThan(45);
  await key('Escape');
});

it('uses one clamped center for thumb and card while mapping the whole track', () => {
  expect(alignedDragCenter(300, 62, 524, 62)).toBe(300);
  expect(alignedDragCenter(0, 62, 524, 62)).toBe(101);
  expect(alignedDragCenter(560, 62, 524, 62)).toBe(485);
  expect(dragTarget(4, 80, 82, 280, 82, 505)).toBe(0);
  expect(dragTarget(4, 80, 505, 280, 82, 505)).toBe(79);
  expect(dragTarget(4, 80, 280, 280, 82, 505)).toBe(4);
});

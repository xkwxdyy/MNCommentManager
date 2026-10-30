// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import QuickComment, { animationDestination } from './QuickComment';
import MNBridge from './lib/mnBridge';
vi.mock('./lib/mnBridge', () => ({ default: { send: vi.fn() } }));
let root, host, nativeState;
const input = () => host.querySelector('textarea');
const click = async label => { await act(async () => host.querySelector(`button[aria-label="${label}"]`).click()); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const stateFor = (payload, status, extra = {}) => ({ ...nativeState, submission: { submissionId: payload.submissionId, text: payload.text, markdown: payload.markdown === true, draftRevision: payload.draftRevision, status, ...extra } });
async function type(text) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(key, options = {}) { await act(async () => input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))); }
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  nativeState = { sessionId: 'session', noteId: 'card', noteTitle: '目标卡片', draft: '', draftRevision: 0, submission: null, nativeViewport: { width: 1000, height: 800 }, targetRect: { x: 700, y: 80, width: 120, height: 100 } };
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === 'getQuickCommentState') return nativeState;
    if (command === 'appendQuickComment') return { ...nativeState, submission: { status: 'saved', submissionId: payload.submissionId, text: payload.text, markdown: payload.markdown === true, draftRevision: payload.draftRevision, receipt: { persisted: true, noteId: 'card', markdown: payload.markdown === true } } };
    return { closed: true };
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<QuickComment />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
it('keeps whitespace and newlines, fixes the target, and only animates after a save receipt', async () => {
  await type('  第一行\n第二行  '); await key('Enter');
  expect(MNBridge.send).toHaveBeenCalledWith('appendQuickComment', expect.objectContaining({ sessionId: 'session', text: '  第一行\n第二行  ' }));
  expect(host.querySelector('.quick-success')).not.toBeNull();
  expect(MNBridge.send).toHaveBeenCalledWith('setQuickCommentExit', expect.objectContaining({ sessionId: 'session', active: true }));
});
it('focuses only after the textarea becomes enabled', () => {
  expect(input().disabled).toBe(false);
  expect(document.activeElement).toBe(input());
  expect(host.querySelector('.quick-ready')).not.toBeNull();
  expect(MNBridge.send).toHaveBeenCalledWith('presentQuickComment', { sessionId: 'session', reducedMotion: false });
});
it('rejects empty input and ignores Return during Chinese composition', async () => {
  await type(' \n '); await key('Enter'); expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(0);
  await type('文字');
  await act(async () => input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await key('Enter'); expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(0);
  await act(async () => input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await key('Enter', { keyCode: 229 }); expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(0);
  await key('Enter'); expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
});
it('uses Shift+Return for native newline and provides a mobile newline button', async () => {
  await type('ab'); await key('Enter', { shiftKey: true });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(0);
  input().setSelectionRange(1, 1); await click('插入换行'); expect(input().value).toBe('a\nb');
  expect(input().selectionStart).toBe(2);
});
it('submits Return from mobile beforeinput while retaining shifted line breaks', async () => {
  await type('手机正文');
  await act(async () => input().dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true })));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
});
it('does not discard a nonempty draft when the background is touched and retains it when closing', async () => {
  await type('草稿');
  await act(async () => host.querySelector('main').dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  await key('Escape'); expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', { sessionId: 'session', text: '草稿', markdown: false, draftRevision: 1 });
});
it('restores Native drafts and normalizes rich clipboard input to plain text', async () => {
  await act(async () => root.unmount()); nativeState.draft = '恢复正文'; root = createRoot(host);
  await act(async () => root.render(<QuickComment />)); expect(input().value).toBe('恢复正文');
  input().setSelectionRange(0, 4);
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: type => type === 'text/plain' ? '<b>文字</b>' : '' } });
  await act(async () => input().dispatchEvent(event)); expect(input().value).toBe('<b>文字</b>'); expect(host.querySelector('b')).toBeNull();
  expect(input().selectionStart).toBe(9);
});
it('keeps input on a confirmed pre-write failure and allows an intentional retry', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (cmd, payload) => cmd === 'appendQuickComment' ? { ...nativeState, submission: { submissionId: payload.submissionId, text: payload.text, status: 'failed', error: '目标不存在' } } : send(cmd, payload));
  await type('保留'); await click('添加评论'); expect(input().value).toBe('保留'); expect(input().disabled).toBe(false);
  expect(host.querySelector('[role=alert]').textContent).toContain('目标不存在'); expect(host.querySelector('.quick-success')).toBeNull();
});
it('blocks resubmission on a lost reply and can recover a saved result by checking Native', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (cmd, payload) => { if (cmd === 'appendQuickComment') throw new Error('回执丢失'); return send(cmd, payload); });
  await type('正文'); await key('Enter'); await key('Enter');
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
  expect(input().disabled).toBe(true); expect(host.querySelector('.quick-success')).toBeNull();
  const original = MNBridge.send.mock.calls.find(([cmd]) => cmd === 'appendQuickComment')[1];
  nativeState = { ...nativeState, submission: { submissionId: original.submissionId, text: original.text, status: 'saved', receipt: { persisted: true, noteId: 'card' } } };
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '核对保存').click());
  expect(host.querySelector('.quick-success')).not.toBeNull();
});
it('rejects wrong-target or malformed successful receipts', async () => {
  MNBridge.send.mockImplementation(async (cmd, payload) => cmd === 'appendQuickComment' ? { ...nativeState, submission: { submissionId: payload.submissionId, text: payload.text, status: 'saved', receipt: { persisted: true, noteId: 'different' } } } : nativeState);
  await type('正文'); await key('Enter'); expect(host.querySelector('.quick-success')).toBeNull(); expect(input().disabled).toBe(true);
});
it('handles reduced motion and still closes after saved delivery', async () => {
  vi.useFakeTimers(); window.matchMedia = () => ({ matches: true });
  await type('保存'); await click('添加评论');
  expect(host.querySelector('.quick-fly')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(180));
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', { sessionId: 'session' });
  delete window.matchMedia;
});
it('maps native viewport coordinates and falls back on invalid targets', () => {
  expect(animationDestination(nativeState, { left: 200, top: 100, width: 400, height: 200 }, 1000, 800)).toEqual({ x: 360, y: -70 });
  expect(animationDestination({ ...nativeState, targetRect: null }, {}, 1000, 800)).toBeNull();
  expect(animationDestination({ ...nativeState, targetRect: { x: 5000, y: 10, width: 30, height: 20 } }, {}, 1000, 800)).toBeNull();
});

it('does not overwrite Native drafts when closing before initial hydration', async () => {
  await act(async () => root.unmount());
  MNBridge.send.mockImplementation(command => command === 'getQuickCommentState' ? new Promise(() => {}) : Promise.resolve({ closed: true }));
  root = createRoot(host); await act(async () => root.render(<QuickComment />));
  await click('关闭输入并保留草稿');
  const payload = MNBridge.send.mock.calls.find(([cmd]) => cmd === 'closeQuickComment')[1];
  expect(payload).not.toHaveProperty('text');
});
it('rehydrates after an early close fails and ignores the obsolete initial reply', async () => {
  await act(async () => root.unmount());
  const initial = deferred(); let reads = 0;
  MNBridge.send.mockImplementation(async (command) => {
    if (command === 'getQuickCommentState') return ++reads === 1 ? initial.promise : { ...nativeState, draft: '恢复草稿', markdown: true, draftRevision: 1 };
    if (command === 'closeQuickComment') throw new Error('关闭未送达');
    return { started: true };
  });
  root = createRoot(host); await act(async () => root.render(<QuickComment />));
  await click('关闭输入并保留草稿');
  expect(input().value).toBe('恢复草稿'); expect(input().disabled).toBe(false);
  await type('继续输入');
  await act(async () => initial.resolve({ ...nativeState, draft: '过期正文' }));
  expect(input().value).toBe('继续输入'); expect(reads).toBe(2);
});
it('keeps rendered content until an acknowledged Native close removes its canvas', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command,payload) => command === 'closeQuickComment' ? Promise.resolve({ closed: true, nativeClosing: true }) : send(command,payload));
  await type('保留草稿'); await click('关闭输入并保留草稿');
  expect(host.querySelector('.quick-closed.quick-native-close.quick-paused')).not.toBeNull();
  expect(input().value).toBe('保留草稿');
});
it('rejects an unconfirmed close reply and retains editable text', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command,payload) => command === 'closeQuickComment' ? Promise.resolve({ closed: false }) : send(command,payload));
  await type('原正文'); await click('关闭输入并保留草稿');
  expect(host.querySelector('.quick-closed')).toBeNull(); expect(input().value).toBe('原正文'); expect(input().disabled).toBe(false);
});
it('keeps an unobserved request immutable until its same-id retry is confirmed', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((cmd, payload) => cmd === 'appendQuickComment' ? Promise.reject(new Error('回执丢失')) : send(cmd, payload));
  await type('原正文'); await key('Enter');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '核对保存').click());
  expect(input().disabled).toBe(true);
  expect(input().value).toBe('原正文');
});
it('retries an unobserved delivery with precisely the same id, revision and text', async () => {
  const send = MNBridge.send.getMockImplementation(); let deliveries = 0;
  MNBridge.send.mockImplementation((cmd, payload) => {
    if (cmd === 'appendQuickComment') return ++deliveries === 1 ? Promise.reject(new Error('未送达')) : Promise.resolve(stateFor(payload, 'saved', { receipt: { persisted: true, noteId: 'card' } }));
    return send(cmd, payload);
  });
  await type('固定正文'); await key('Enter');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '重试同次提交').click());
  const requests = MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment');
  expect(requests).toHaveLength(2); expect(requests[0][1]).toEqual(requests[1][1]);
  expect(host.querySelector('.quick-success')).not.toBeNull();
});
it('ignores a delayed failed query for an older attempt while a newer attempt is pending', async () => {
  const stale = deferred(), pending = deferred(), send = MNBridge.send.getMockImplementation(); let deliveries = 0, queries = 0;
  let first;
  MNBridge.send.mockImplementation((cmd, payload) => {
    if (cmd === 'appendQuickComment') { if (++deliveries === 1) { first = payload; return Promise.reject(new Error('回执丢失')); } return pending.promise; }
    if (cmd === 'getQuickCommentState' && payload?.submissionId) return ++queries === 1 ? stale.promise : Promise.resolve(stateFor(first, 'failed', { error: '写入前拒绝' }));
    return send(cmd, payload);
  });
  await type('旧正文'); await key('Enter');
  const checkButton = () => [...host.querySelectorAll('button')].find(button => button.textContent === '核对保存');
  await act(async () => checkButton().click()); await act(async () => checkButton().click());
  expect(input().disabled).toBe(false);
  await type('新正文'); await key('Enter');
  await act(async () => stale.resolve(stateFor(first, 'failed', { error: '迟到失败' })));
  expect(input().disabled).toBe(true); expect(input().value).toBe('新正文');
  await key('Enter'); expect(deliveries).toBe(2);
  const latest = MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')[1][1];
  await act(async () => pending.resolve(stateFor(latest, 'saved', { receipt: { persisted: true, noteId: 'card' } })));
  expect(host.querySelector('.quick-success')).not.toBeNull();
});
it('captures the latest text synchronously when editing and submitting in the same turn', async () => {
  await type('旧正文');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '最新正文');
    input().dispatchEvent(new Event('input', { bubbles: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  const requests = MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment');
  expect(requests).toHaveLength(1); expect(requests[0][1].text).toBe('最新正文');
});
it('keeps a computed newline when closing before React commits the textarea value', async () => {
  await type('正文'); input().setSelectionRange(2, 2);
  await act(async () => {
    host.querySelector('button[aria-label="插入换行"]').click();
    host.querySelector('button[aria-label="关闭输入并保留草稿"]').click();
  });
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', { sessionId: 'session', text: '正文\n', markdown: false, draftRevision: 2 });
});
it('locks input during close and restores an uncertain state when close fails', async () => {
  const gate = deferred(), send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((cmd, payload) => cmd === 'closeQuickComment' ? gate.promise : cmd === 'appendQuickComment' ? Promise.reject(new Error('未知保存结果')) : send(cmd, payload));
  await type('正文'); await key('Enter'); await click('关闭输入并保留草稿');
  await key('Enter'); expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
  await act(async () => gate.reject(new Error('关闭失败')));
  expect(input().disabled).toBe(true);
  expect([...host.querySelectorAll('button')].some(button => button.textContent === '核对保存')).toBe(true);
});
it('retains the confirmed save and closes even if preparing the animation throws', async () => {
  vi.useFakeTimers(); window.matchMedia = () => { throw new Error('动画不可用'); };
  await type('已保存'); await key('Enter');
  await act(async () => vi.advanceTimersByTimeAsync(900));
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', { sessionId: 'session' });
  expect(host.querySelector('.quick-closed')).not.toBeNull(); delete window.matchMedia;
});
it('retains text on a saved receipt for different content even if the target matches', async () => {
  MNBridge.send.mockImplementation(async (cmd, payload) => cmd === 'appendQuickComment' ? stateFor({ ...payload, text: '其他正文' }, 'saved', { receipt: { persisted: true, noteId: 'card' } }) : nativeState);
  await type('保留正文'); await key('Enter'); expect(input().value).toBe('保留正文');
  expect(host.querySelector('.quick-success')).toBeNull(); expect(input().disabled).toBe(true);
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'setQuickCommentExit')).toHaveLength(0);
});

function animationEnd(element, name) {
  // React selects the prefixed event in jsdom, which has no AnimationEvent constructor.
  const event = new Event('AnimationEvent' in window ? 'animationend' : 'webkitAnimationEnd', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: name });
  element.dispatchEvent(event);
}
it('waits for the rendered panel exit and keeps the exit styles while closing', async () => {
  vi.useFakeTimers();
  const gate = deferred(), send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((cmd, payload) => cmd === 'closeQuickComment' ? gate.promise : send(cmd, payload));
  await type('已保存'); await key('Enter');
  await act(async () => vi.advanceTimersByTimeAsync(480));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  await act(async () => animationEnd(input(), 'quick-text-out'));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  await act(async () => animationEnd(host.querySelector('.quick-card'), 'quick-flight'));
  expect(host.querySelector('.quick-success')).not.toBeNull();
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(1);
  await act(async () => { animationEnd(host.querySelector('.quick-card'), 'quick-flight'); await vi.advanceTimersByTimeAsync(900); gate.resolve({ closed: true }); });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(1);
  expect(host.querySelector('.quick-closed')).not.toBeNull();
});
it('shows confirmed-save recovery if closing fails without resubmitting the body', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((cmd, payload) => cmd === 'closeQuickComment' ? Promise.reject(new Error('关闭失败')) : send(cmd, payload));
  await type('已保存'); await key('Enter');
  await act(async () => animationEnd(host.querySelector('.quick-card'), 'quick-fade'));
  expect(host.querySelector('.quick-success')).toBeNull();
  expect(host.querySelector('[role=alert]').textContent).toContain('评论已保存，窗口关闭失败');
  expect(input().value).toBe('已保存'); expect(input().disabled).toBe(true);
  expect(MNBridge.send).toHaveBeenCalledWith('setQuickCommentExit', expect.objectContaining({ active: false }));
  await key('Enter');
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
});

it('switches output type without changing text and submits the selected mode immediately', async () => {
  await type('  **正文**\n第二行  ');
  expect(host.querySelector('[role=switch]').getAttribute('aria-checked')).toBe('false');
  await act(async () => {
    host.querySelector('[role=switch]').click();
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  expect(input().value).toBe('  **正文**\n第二行  ');
  expect(MNBridge.send).toHaveBeenCalledWith('appendQuickComment', expect.objectContaining({ markdown: true, text: '  **正文**\n第二行  ' }));
  expect(host.querySelector('.quick-success')).not.toBeNull();
});
it('closes with the Markdown draft selection and restores it on reopening', async () => {
  await type('**草稿**'); await click('Markdown 评论'); await click('关闭输入并保留草稿');
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', { sessionId: 'session', text: '**草稿**', markdown: true, draftRevision: 2 });
  await act(async () => root.unmount());
  nativeState = { ...nativeState, draft: '**草稿**', markdown: true, draftRevision: 2 }; root = createRoot(host);
  await act(async () => root.render(<QuickComment />));
  expect(input().value).toBe('**草稿**'); expect(host.querySelector('[role=switch]').getAttribute('aria-checked')).toBe('true');
  await click('Markdown 评论'); expect(input().value).toBe('**草稿**');
  await key('Enter'); expect(MNBridge.send).toHaveBeenCalledWith('appendQuickComment', expect.objectContaining({ markdown: false }));
});
it('locks the original mode on a lost reply and reuses it for the same-id retry', async () => {
  const send = MNBridge.send.getMockImplementation(); let attempts = 0;
  MNBridge.send.mockImplementation((cmd, payload) => cmd === 'appendQuickComment' && ++attempts === 1 ? Promise.reject(new Error('回执丢失')) : send(cmd, payload));
  await type('**固定正文**'); await click('Markdown 评论'); await key('Enter');
  expect(host.querySelector('[role=switch]').disabled).toBe(true);
  const original = MNBridge.send.mock.calls.find(([cmd]) => cmd === 'appendQuickComment')[1];
  await click('Markdown 评论');
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '重试同次提交').click());
  const retried = MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')[1][1];
  expect(retried).toEqual(original); expect(retried.markdown).toBe(true);
});
it('retains Markdown body and mode on a mismatched persisted type receipt', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (cmd, payload) => cmd === 'appendQuickComment' ? stateFor(payload, 'saved', { receipt: { persisted: true, noteId: 'card', markdown: false } }) : send(cmd, payload));
  await type('**保留正文**'); await click('Markdown 评论'); await key('Enter');
  expect(host.querySelector('.quick-success')).toBeNull(); expect(input().value).toBe('**保留正文**');
  expect(host.querySelector('[role=switch]').getAttribute('aria-checked')).toBe('true'); expect(input().disabled).toBe(true);
});
it('does not end the panel exit when the independent backdrop finishes fading', async () => {
  await type('保存'); await key('Enter');
  await act(async () => animationEnd(host.querySelector('.quick-backdrop'), 'quick-backdrop-out'));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  await act(async () => animationEnd(host.querySelector('.quick-card'), 'quick-flight'));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(1);
});

async function finishComposition() {
  await act(async () => { input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 10)); });
}
async function keyboard(type, extra = {}) {
  await act(async () => window.__MNQuickCommentKeyboard({ sessionId: 'session', type, ...extra }));
}
it('closes with the newest composing draft when the owned keyboard hides', async () => {
  await type('已输入'); await keyboard('show');
  await act(async () => input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '已输入组词');
  await keyboard('hide', { eventId: 'hide-1' });
  await finishComposition();
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', expect.objectContaining({ reason: 'keyboard', eventId: 'hide-1', text: '已输入组词', draftRevision: 2 }));
  await keyboard('hide', { eventId: 'hide-1' });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(1);
});
it('ignores unowned, old-session and ordinary focus-change keyboard events', async () => {
  await keyboard('hide', { eventId: 'no-show' });
  await keyboard('show');
  await keyboard('hide', { sessionId: 'old', eventId: 'stale' });
  await act(async () => host.querySelector('[aria-label="插入换行"]').focus());
  await keyboard('hide', { eventId: 'focus-change' });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
});
it('ignores keyboard hiding during a save or after window focus is lost', async () => {
  await type('正文'); await keyboard('show');
  await act(async () => window.dispatchEvent(new Event('blur')));
  await keyboard('hide', { eventId: 'background' });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  await keyboard('show'); await click('添加评论'); await keyboard('hide', { eventId: 'saved' });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  expect(host.querySelector('.quick-success')).not.toBeNull();
});
it('restores the current editing phase and content after a keyboard-close failure', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (cmd, payload) => { if (cmd === 'closeQuickComment') throw new Error('关闭失败'); return send(cmd, payload); });
  await type('保留正文'); await keyboard('show'); await keyboard('hide', { eventId: 'failed' });
  expect(input().disabled).toBe(false); expect(input().value).toBe('保留正文');
  expect(host.querySelector('[role=alert]').textContent).toContain('关闭失败');
  await type('继续编辑'); expect(input().value).toBe('继续编辑');
});
it('freezes viewport geometry during keyboard dismissal and removes its callback on unmount', async () => {
  await keyboard('show');
  const original = host.querySelector('.quick-positioner').getAttribute('style');
  await keyboard('hide', { eventId: 'freeze' });
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(host.querySelector('.quick-positioner').getAttribute('style')).toBe(original);
  await act(async () => root.unmount());
  expect(window.__MNQuickCommentKeyboard).toBeUndefined();
  root = createRoot(host);
});

it('allows keyboard dismissal again after the textarea is touched', async () => {
  await keyboard('show');
  await act(async () => host.querySelector('header').dispatchEvent(new Event('pointerdown', { bubbles: true })));
  await act(async () => input().dispatchEvent(new Event('pointerdown', { bubbles: true })));
  await keyboard('hide', { eventId: 'input-again' });
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', expect.objectContaining({ reason: 'keyboard', eventId: 'input-again' }));
});

it('retains the final composition value when keyboard hiding arrives before the input event', async () => {
  await type('原正文'); await keyboard('show');
  await act(async () => {
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '原正文中文组词');
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    window.__MNQuickCommentKeyboard({ sessionId: 'session', type: 'hide', eventId: 'commit-before-input' });
  });
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', expect.objectContaining({ text: '原正文中文组词' }));
});
it('keeps the composing snapshot visible after keyboard-close delivery fails', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (cmd, payload) => { if (cmd === 'closeQuickComment') throw new Error('关闭请求未送达'); return send(cmd, payload); });
  await type('原正文'); await keyboard('show');
  await act(async () => input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '原正文保留中文');
  await keyboard('hide', { eventId: 'composition-close-error' });
  await finishComposition();
  expect(input().value).toBe('原正文保留中文');
  await key('Escape');
  const closes = MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment');
  expect(closes.at(-1)[1].text).toBe('原正文保留中文');
});
it('does not close a submission when keyboard hiding races the first saving render', async () => {
  const pending = deferred(), send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((cmd, payload) => cmd === 'appendQuickComment' ? pending.promise : send(cmd, payload));
  await type('保存正文'); await keyboard('show');
  await act(async () => {
    host.querySelector('[aria-label="添加评论"]').click();
    window.__MNQuickCommentKeyboard({ sessionId: 'session', type: 'hide', eventId: 'same-tick-save' });
    host.querySelector('[aria-label="关闭输入并保留草稿"]').click();
  });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  const submission = MNBridge.send.mock.calls.find(([cmd]) => cmd === 'appendQuickComment')[1];
  await act(async () => pending.resolve(stateFor(submission, 'saved', { receipt: { persisted: true, noteId: 'card', markdown: false } })));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
  expect(host.querySelector('.quick-success')).not.toBeNull();
});

it('waits for a pending Chinese composition to finish before taking the keyboard-close snapshot', async () => {
  await type('原正文'); await keyboard('show');
  await act(async () => {
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '原正文拼音');
    window.__MNQuickCommentKeyboard({ sessionId: 'session', type: 'hide', eventId: 'hide-before-commit' });
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '原正文中文');
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', expect.objectContaining({ text: '原正文中文' }));
});

it('keeps a draft visible instead of removing an unfinished composition on timeout', async () => {
  vi.useFakeTimers(); await type('原正文'); await keyboard('show');
  await act(async () => input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '原正文尚未结束的组词');
  await keyboard('hide', { eventId: 'no-composition-end' });
  await act(async () => vi.advanceTimersByTime(500));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  expect(input().value).toBe('原正文尚未结束的组词'); expect(input().disabled).toBe(false);
  expect(host.querySelector('[role=alert]').textContent).toContain('中文组词尚未结束');
  await click('添加评论'); await click('关闭输入并保留草稿');
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment' || cmd === 'closeQuickComment')).toHaveLength(0);
  await act(async () => {
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', expect.objectContaining({ text: '原正文尚未结束的组词' }));
});
it('cancels a pending composition close when its page is removed', async () => {
  vi.useFakeTimers(); await type('原正文'); await keyboard('show');
  await act(async () => input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await keyboard('hide', { eventId: 'removed-while-composing' });
  await act(async () => root.unmount());
  await act(async () => vi.advanceTimersByTime(600));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  root = createRoot(host);
});
it('does not submit the Return used to finish composition while a close is waiting', async () => {
  await type('组词正文'); await keyboard('show');
  await act(async () => {
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.__MNQuickCommentKeyboard({ sessionId: 'session', type: 'hide', eventId: 'return-finishes-composition' });
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(0);
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(1);
});

it('blocks closing while a retry starts before the uncertain phase rerenders', async () => {
  const send = MNBridge.send.getMockImplementation(), pending = deferred(); let attempts = 0;
  MNBridge.send.mockImplementation((cmd, payload) => {
    if (cmd === 'appendQuickComment') { attempts += 1; if (attempts === 1) return Promise.reject(new Error('首次回执丢失')); return pending.promise; }
    return send(cmd, payload);
  });
  await type('原提交正文'); await click('添加评论');
  await act(async () => {
    [...host.querySelectorAll('button')].find(el => el.textContent === '重试同次提交').click();
    host.querySelector('[aria-label="关闭输入并保留草稿"]').click();
  });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'closeQuickComment')).toHaveLength(0);
  const first = MNBridge.send.mock.calls.find(([cmd]) => cmd === 'appendQuickComment')[1];
  await act(async () => pending.resolve(stateFor(first, 'saved', { receipt: { persisted: true, noteId: 'card', markdown: false } })));
  const requests = MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment');
  expect(requests[0][1]).toEqual(requests[1][1]);
  expect(host.querySelector('.quick-success')).not.toBeNull();
});

it('unlocks editing when Native recovers an initially failed state read', async () => {
  await act(async () => root.unmount());
  const send = MNBridge.send.getMockImplementation(); let reads = 0;
  MNBridge.send.mockImplementation((command, payload) => {
    if (command === 'getQuickCommentState') return ++reads === 1 ? Promise.reject(new Error('读取暂时失败')) : Promise.resolve({ ...nativeState, draft: '原草稿', markdown: true, draftRevision: 3 });
    return send(command, payload);
  });
  root = createRoot(host); await act(async () => root.render(<QuickComment />));
  expect(input().disabled).toBe(true);
  await act(async () => window.__MNQuickCommentRecoverOpen());
  expect(input().value).toBe('原草稿'); expect(input().disabled).toBe(false);
  expect(host.querySelector('[role=switch]').getAttribute('aria-checked')).toBe('true');
  await type('继续编辑'); await click('添加评论');
  expect(MNBridge.send).toHaveBeenCalledWith('appendQuickComment', expect.objectContaining({ text: '继续编辑', markdown: true, draftRevision: 4 }));
});
it('does not treat a composition-confirming Return beforeinput as a submission', async () => {
  await type('已完成中文');
  await act(async () => {
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
    input().dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }));
  });
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(0);
  await key('Enter');
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
});
it('ignores an older draft write failure after newer text was retained', async () => {
  const old = deferred(), send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === 'updateQuickCommentDraft' && payload.draftRevision === 1 ? old.promise : send(command, payload));
  await type('旧草稿'); await type('当前草稿');
  await act(async () => old.reject(new Error('旧请求失败')));
  expect(input().value).toBe('当前草稿');
  expect(host.querySelector('[role=alert]')).toBeNull();
});

it('does not replace an active composing value when the newline button is tapped', async () => {
  await type('原正文');
  await act(async () => input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input(), '原正文组词');
  input().setSelectionRange(5, 5);
  await click('插入换行');
  expect(input().value).toBe('原正文组词');
  await finishComposition();
  expect(input().value).toBe('原正文组词');
  await click('插入换行');
  expect(input().value).toBe('原正文组词\n');
});
it('keeps current draft failures visible and editable', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === 'updateQuickCommentDraft' ? Promise.reject(new Error('当前请求失败')) : send(command, payload));
  await type('保留当前正文');
  expect(host.querySelector('[role=alert]').textContent).toContain('草稿保留失败：当前请求失败');
  expect(input().value).toBe('保留当前正文'); expect(input().disabled).toBe(false);
  await click('关闭输入并保留草稿');
  expect(MNBridge.send).toHaveBeenCalledWith('closeQuickComment', expect.objectContaining({ text: '保留当前正文', draftRevision: 1 }));
});
it('does not unlock an unresolved hydrated submission during state recovery', async () => {
  await act(async () => root.unmount());
  const send = MNBridge.send.getMockImplementation(); let reads = 0;
  nativeState = stateFor({ submissionId: 'pending-original', text: '原提交', markdown: false, draftRevision: 2 }, 'pending');
  MNBridge.send.mockImplementation((command, payload) => command === 'getQuickCommentState' ? ++reads === 1 ? Promise.reject(new Error('初次读取失败')) : Promise.resolve(nativeState) : send(command, payload));
  root = createRoot(host); await act(async () => root.render(<QuickComment />));
  await act(async () => window.__MNQuickCommentRecoverOpen());
  expect(input().value).toBe('原提交'); expect(input().disabled).toBe(true);
  await key('Enter');
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(0);
});
it('allows a later mobile Return after the composition-confirming key is released', async () => {
  await type('中文正文'); await key('Enter', { keyCode: 229 });
  await act(async () => input().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })));
  await act(async () => input().dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true })));
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === 'appendQuickComment')).toHaveLength(1);
});

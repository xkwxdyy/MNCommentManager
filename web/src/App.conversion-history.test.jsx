// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import MNBridge from './lib/mnBridge';

vi.mock('./lib/mnBridge', () => ({ default: { send: vi.fn() } }));
let root, host, snapshot, rejectOld;
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent === text);
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const makeSnapshot = noteId => ({ noteId, noteTitle: noteId, excerpt: { present: false }, comments: [
  { index: 0, type: 'textComment', text: 'editable', capabilities: { canEditText: true, canCopyText: true } },
] });
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  snapshot = makeSnapshot('converted'); rejectOld = true;
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === 'getCurrentNoteComments' || command === 'refreshCurrentNote') return snapshot;
    if (rejectOld && ['editCommentText', 'copyContentText'].includes(command)) throw {
      code: 'TARGET_CHANGED', message: '卡片转换状态已变化，请重新选择内容；未保存的编辑仍保留',
    };
    if (command === 'editCommentText') return { ...snapshot, comments: [{ ...snapshot.comments[0], text: payload.text }] };
    return {};
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<App />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it.each(['original', 'redone'])('refreshes to %s after a stale copy and uses the new target for subsequent edit and copy', async noteId => {
  await click(host.querySelector('#comment-0 input'));
  snapshot = makeSnapshot(noteId);
  await click(button('复制文本'));
  expect(MNBridge.send).toHaveBeenCalledWith('refreshCurrentNote');
  expect(host.textContent).toContain('卡片转换状态已变化');
  expect(host.textContent).not.toContain('编辑请求已过期');
  expect(host.querySelector('#comment-0 input').checked).toBe(false);
  rejectOld = false;
  await click(host.querySelector('#comment-0 input'));
  await click(button('编辑文本'));
  await click(button('保存'));
  expect(MNBridge.send).toHaveBeenCalledWith('editCommentText', expect.objectContaining({ noteId }));
  await click(host.querySelector('#comment-0 input'));
  await click(button('复制文本'));
  expect(MNBridge.send).toHaveBeenCalledWith('copyContentText', expect.objectContaining({ noteId }));
});

it('preserves the text draft and rejects its save after undo changes the target', async () => {
  await click(host.querySelector('#comment-0 input'));
  await click(button('编辑文本'));
  const input = host.querySelector('.dialog textarea');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => { setter.call(input, 'unsaved draft'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  snapshot = makeSnapshot('original');
  await click(button('保存'));
  expect(host.querySelector('.dialog textarea').value).toBe('unsaved draft');
  expect(host.textContent).toContain('卡片转换状态已变化');
  expect(MNBridge.send.mock.calls.filter(([command]) => command === 'editCommentText')).toHaveLength(1);
  expect(MNBridge.send).toHaveBeenCalledWith('refreshCurrentNote');
});

it('does not replace a newly opened card with a late recovery response', async () => {
  let reply;
  const original = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === 'refreshCurrentNote'
    ? new Promise(resolve => { reply = resolve; }) : original(command, payload));
  await click(host.querySelector('#comment-0 input'));
  await click(button('复制文本'));
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: makeSnapshot('unrelated') }));
  await act(async () => reply(makeSnapshot('original')));
  expect(host.textContent).toContain('unrelated');
  expect(host.textContent).not.toContain('original');
});

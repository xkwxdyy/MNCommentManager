// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import App from './App';
import MNBridge from './lib/mnBridge';
import { createStore } from '../demos/rich-text-lifecycle/model.mjs';
import { createPrototypeBridge } from '../demos/rich-text-lifecycle/mockBridge.mjs';
vi.mock('./lib/mnBridge', () => ({ default: { send: vi.fn() } }));
let host, root, store, send;
const click = async (el) => {
  expect(el).toBeTruthy();
  await act(async () => el.click());
};
const field = (label) => document.querySelector(`[aria-label="${label}"]`);
async function fill(el, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    ).set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const sync = async (snapshot) => {
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot }));
};
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  store = createStore();
  send = createPrototypeBridge(store);
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(send);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
it('keeps editor input on save failure and submits a repeated click only once', async () => {
  await click(field('编辑 HTML 评论 #0'));
  await fill(field('评论正文'), '尚未保存的正文');
  let reject;
  MNBridge.send.mockImplementation((c, p) =>
    c === 'saveRichComment'
      ? new Promise((_, r) => {
          reject = r;
        })
      : send(c, p),
  );
  const save = document.querySelector('.rich-editor-dialog footer .primary');
  await act(async () => {
    save.click();
    save.click();
  });
  expect(MNBridge.send.mock.calls.filter(([c]) => c === 'saveRichComment')).toHaveLength(1);
  expect(save.disabled).toBe(true);
  await act(async () => reject(Error('保存失败，请重试')));
  expect(field('评论正文').value).toBe('尚未保存的正文');
  expect(document.querySelector('.rich-editor-error').textContent).toContain('保存失败');
  expect(store.card.comments[0].text).toBe('证明');
});
it('pins editor data through A→B, then returns to the latest A instead of stale B on close', async () => {
  await click(field('编辑 HTML 评论 #0'));
  await fill(field('评论正文'), '保留输入');
  const a = store.snapshot();
  store.switchCard('demo-definition');
  const b = store.snapshot();
  store.switchCard('demo-proof');
  await sync(b);
  expect(host.querySelector('.topbar-title').textContent).toContain('有界算子');
  expect(field('评论正文').value).toBe('保留输入');
  await sync(a);
  await click(document.querySelector('.rich-editor-dialog footer .secondary'));
  expect(host.querySelector('.topbar-title').textContent).toContain('有界算子');
  expect(document.querySelector('.rich-editor-dialog')).toBeNull();
});
it('applies a queued B after cancelling an editor pinned to A', async () => {
  await click(field('编辑 HTML 评论 #0'));
  store.switchCard('demo-definition');
  await sync(store.snapshot());
  await click(document.querySelector('.rich-editor-dialog footer .secondary'));
  expect(host.querySelector('.topbar-title').textContent).toContain('紧算子');
});
it('copies across a late card change without replacing the destination undo ticket', async () => {
  let finish;
  MNBridge.send.mockImplementation((c, p) =>
    c === 'copyRichCommentFormat'
      ? new Promise((r) => {
          finish = r;
        })
      : send(c, p),
  );
  await click(field('复制评论 #0 的格式'));
  store.switchCard('demo-definition');
  const b = store.snapshot();
  b.richText.undo = { noteId: b.noteId, token: 'B-undo', label: '撤销目标卡修改' };
  await sync(b);
  await act(async () =>
    finish({
      state: {
        clipboard: {
          text: '证明',
          noteTitle: '源卡片',
          style: {
            fontName: 'PingFangSC-Regular',
            fontSize: 16,
            textColor: '#175D62',
            backgroundColor: '#E3F2FD',
          },
        },
        undo: { noteId: 'demo-proof', token: 'A-undo' },
      },
    }),
  );
  expect(host.querySelector('.rich-format-clipboard').textContent).toContain('证明');
  expect(field('粘贴格式到评论 #0')).toBeTruthy();
  expect(field('撤销上次富文本修改').title).toBe('撤销目标卡修改');
});
it('clears copied format after a late card change without losing destination undo', async () => {
  await click(field('复制评论 #0 的格式'));
  let finish;
  MNBridge.send.mockImplementation((c, p) =>
    c === 'clearRichCommentFormat'
      ? new Promise((r) => {
          finish = r;
        })
      : send(c, p),
  );
  await click(field('清除已复制格式'));
  store.switchCard('demo-definition');
  const b = store.snapshot();
  b.richText.undo = { noteId: b.noteId, token: 'B-undo', label: '撤销目标卡修改' };
  await sync(b);
  await act(async () => finish({ state: { clipboard: null, undo: null } }));
  expect(host.querySelector('.rich-format-clipboard')).toBeNull();
  expect(field('撤销上次富文本修改').title).toBe('撤销目标卡修改');
});
it('ignores a draft that resolves after a native card change', async () => {
  let finish;
  MNBridge.send.mockImplementation((c, p) =>
    c === 'getRichCommentDraft'
      ? new Promise((r) => {
          finish = r;
        })
      : send(c, p),
  );
  await click(field('编辑 HTML 评论 #0'));
  store.switchCard('demo-definition');
  await sync(store.snapshot());
  await act(async () =>
    finish({
      noteId: 'demo-proof',
      index: 0,
      token: 'late',
      text: '证明',
      style: {
        fontName: 'PingFangSC-Regular',
        fontSize: 16,
        textColor: null,
        backgroundColor: null,
      },
    }),
  );
  expect(document.querySelector('.rich-editor-dialog')).toBeNull();
});
it('closes the font menu with Escape while retaining the editor', async () => {
  await click(field('编辑 HTML 评论 #0'));
  await click(field('字体'));
  expect(document.querySelector('[role="listbox"]')).toBeTruthy();
  await act(async () =>
    field('字体').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.querySelector('.rich-editor-dialog')).toBeTruthy();
});

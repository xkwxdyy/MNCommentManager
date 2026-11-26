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
  await click(field('编辑富文本评论 #0'));
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
  await click(field('编辑富文本评论 #0'));
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
  await click(document.querySelector('.rich-editor-discard'));
  expect(host.querySelector('.topbar-title').textContent).toContain('有界算子');
  expect(document.querySelector('.rich-editor-dialog')).toBeNull();
});
it('applies a queued B after cancelling an editor pinned to A', async () => {
  await click(field('编辑富文本评论 #0'));
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
  await click(field('编辑富文本评论 #0'));
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
  await click(field('编辑富文本评论 #0'));
  await click(field('字体'));
  expect(document.querySelector('[role="listbox"]')).toBeTruthy();
  await act(async () =>
    field('字体').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.querySelector('.rich-editor-dialog')).toBeTruthy();
});
it('validates invalid hex color on client without calling saveRichComment, and supports mode switching on create', async () => {
  await click(field('新建评论'));
  expect(document.querySelector('.rich-editor-dialog')).toBeTruthy();
  await fill(field('评论正文'), '测试颜色校验');
  await fill(field('文字颜色'), '#XYZ');
  await click(document.querySelector('.rich-editor-dialog footer .primary'));
  expect(MNBridge.send.mock.calls.filter(([c]) => c === 'saveRichComment')).toHaveLength(0);
  expect(document.querySelector('.rich-editor-error').textContent).toContain('#RRGGBB');

  const mdTab = [...document.querySelectorAll('.rich-editor-mode-tabs button')].find(
    (el) => el.textContent === 'Markdown',
  );
  await click(mdTab);
  await fill(field('评论正文'), '**新增 Markdown**');
  await click(document.querySelector('.rich-editor-dialog footer .primary'));
  expect(
    MNBridge.send.mock.calls.find(([c]) => c === 'saveRichComment')?.[1]?.mode,
  ).toBe('markdown');
  expect(document.querySelector('.rich-editor-dialog')).toBeNull();
});
it('preselects main-list selected comments when opening paste preview from RichClipboardBar', async () => {
  await click(field('复制评论 #0 的格式'));
  await click(host.querySelector('#comment-1 input[type="checkbox"]'));
  await click(field('批量粘贴已复制的格式'));
  expect(document.querySelector('.brush-dialog')).toBeTruthy();
  expect(document.querySelector('[aria-label="选择目标评论 #1"]').checked).toBe(true);
});
it('asks before discarding unsaved edits; a second Escape keeps editing', async () => {
  await click(field('编辑富文本评论 #0'));
  await fill(field('评论正文'), '未保存的修改');
  const esc = () =>
    act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
  await esc();
  expect(document.querySelector('.rich-editor-discard')).toBeTruthy();
  await esc();
  expect(document.querySelector('.rich-editor-discard')).toBeNull();
  expect(field('评论正文').value).toBe('未保存的修改');
  await click(document.querySelector('.rich-editor-dialog header button'));
  await click(document.querySelector('.rich-editor-discard'));
  expect(document.querySelector('.rich-editor-dialog')).toBeNull();
  expect(store.card.comments[0].text).toBe('证明');
});
it('marks the copied source row and lets the editor apply the copied format', async () => {
  await click(field('复制评论 #0 的格式'));
  expect(host.querySelector('#comment-0 .rich-copy-format').classList).toContain('is-format-source');
  await click(field('编辑富文本评论 #2'));
  await click(document.querySelector('.rich-editor-use-clipboard'));
  expect(field('文字颜色').value).toBe('#175D62');
  expect(document.querySelector('.rich-editor-use-clipboard')).toBeNull();
});
it('skips comments that already use the format when selecting all paste targets', async () => {
  await click(field('复制评论 #0 的格式'));
  await click(field('批量粘贴已复制的格式'));
  const same = document.querySelector('[aria-label="选择目标评论 #0"]');
  expect(same.closest('.brush-target').querySelector('.brush-target-tag')).toBeTruthy();
  await click([...document.querySelectorAll('.brush-target-heading button')][0]);
  expect(same.checked).toBe(false);
  expect(document.querySelector('[aria-label="选择目标评论 #1"]').checked).toBe(true);
});

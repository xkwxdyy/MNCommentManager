// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DemoBridge } from './bridge';
import { App } from './main';
import { initialState } from './fixtures.mjs';
import { dispatch, publicState } from './model.mjs';

vi.mock('./bridge', () => ({ DemoBridge: { send: vi.fn() } }));
let host, root, state;
const labelled = label => [...host.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === label);
const button = text => [...host.querySelectorAll('button')].find(el => el.textContent === text);
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
async function change(node, value) {
  expect(node).toBeTruthy();
  await act(async () => {
    const proto = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function mount() { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); await act(async () => root.render(<App />)); }
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state = initialState(); DemoBridge.send.mockReset();
  DemoBridge.send.mockImplementation(async (command, payload) => { state = dispatch(state, command, payload); return structuredClone(publicState(state)); });
  window.requestAnimationFrame = vi.fn(() => 1); window.cancelAnimationFrame = vi.fn();
  await mount();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it('shows baseline modules including empty and duplicate titles without repeating comments', () => {
  expect(host.querySelectorAll('[data-module-id]').length).toBe(6);
  expect(host.querySelectorAll('[data-comment-id]').length).toBe(17);
  expect(labelled('选择模块：空模块（含标题）').disabled).toBe(false);
  expect(host.textContent).toContain('模块正文为空');
});

it('selects complete modules under image filtering and exposes hidden member count', async () => {
  await click(button('图片'));
  await click(labelled('选择模块：证明（含标题）'));
  expect(host.querySelector('.demo-selection-summary').textContent).toContain('已选 12');
  expect(host.querySelector('.demo-hidden-count').textContent).toContain('隐藏');
  expect(host.querySelectorAll('[data-comment-id]').length).toBe(2);
  expect(host.querySelector('.status-message').textContent).toContain('被筛选隐藏');
});

it('nested preset saves a card override and body-only excludes all structural headings', async () => {
  await click(labelled('模块划分设置'));
  await change(labelled('划分方案'), 'nested');
  await click(button('保存方案'));
  expect(state.settings.cardOverrides.mixed.profileId).toBe('nested');
  expect(host.querySelectorAll('[data-module-id]').length).toBeGreaterThan(7);
  await click(labelled('模块操作：证明'));
  await click(button('仅选择正文（排除各级标题）'));
  expect(host.querySelector('.demo-selection-summary').textContent).toContain('已选 6');
  expect(labelled('选择模块：证明（含标题）').indeterminate).toBe(true);
});

it('title option persists, affects default module selection and supports restoring global default', async () => {
  await click(labelled('模块划分设置'));
  const titleCheck = [...host.querySelectorAll('label')].find(el => el.textContent.includes('模块选择包含结构标题')).querySelector('input');
  await click(titleCheck); await click(button('保存方案'));
  expect(state.settings.cardOverrides.mixed.includeTitle).toBe(false);
  await click(labelled('选择模块：证明（仅正文）'));
  expect(host.querySelector('.demo-selection-summary').textContent).toContain('已选 11');
  await click(labelled('模块划分设置')); await click(button('恢复全局默认'));
  expect(state.settings.cardOverrides.mixed).toBeUndefined();
  expect(labelled('选择模块：证明（含标题）')).toBeTruthy();
});

it('switches between card overrides and global defaults, preserving saved preferences on remount', async () => {
  await click(labelled('模块划分设置')); await change(labelled('划分方案'), 'nested'); await click(button('保存方案'));
  await change(labelled('样例卡片'), 'plain');
  expect(host.querySelector('.demo-profile-summary').textContent).toContain('HTML 字段');
  await change(labelled('样例卡片'), 'mixed');
  expect(host.querySelector('.demo-profile-summary').textContent).toContain('HTML＋Markdown');
  await act(async () => root.unmount()); host.remove(); await mount();
  expect(host.querySelector('.demo-profile-summary').textContent).toContain('HTML＋Markdown');
});

it('module collapse is temporary and independent of persisted comment folding', async () => {
  await click(labelled('选择模块：证明（含标题）'));
  await click(labelled('折叠所选评论'));
  expect(state.cards[0].comments[3].collapsed).toBe(true);
  const snapshot = structuredClone(state);
  DemoBridge.send.mockClear();
  await click(labelled('隐藏模块内容：证明'));
  expect(labelled('显示模块内容：证明').getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('[data-comment-id="mixed-3"]')).toBeNull();
  expect(host.querySelector('.demo-module-summary').textContent).toContain('全文或摘要显示状态保持不变');
  await click(labelled('显示模块内容：证明')); expect(state.cards[0].comments[3].collapsed).toBe(true);
  expect(host.querySelector('[data-comment-id="mixed-3"] .comment-fold-preview')).toBeTruthy();
  expect(DemoBridge.send).not.toHaveBeenCalled();
  expect(state).toEqual(snapshot);
});

it('shows the module fold arrow only on full selection and scopes mixed-state toggling to that module', async () => {
  expect(labelled('折叠模块评论：证明')).toBeUndefined();
  await click(labelled('折叠评论 #3'));
  await click(labelled('选择评论 #0'));
  await click(labelled('选择评论 #3'));
  expect(labelled('折叠模块评论：证明')).toBeUndefined();
  await click(labelled('选择模块：证明（含标题）'));
  expect(labelled('折叠模块评论：证明').dataset.foldState).toBe('mixed');
  expect(labelled('折叠模块评论：证明').nextElementSibling).toBe(labelled('选择模块：证明（含标题）'));
  await click(labelled('折叠模块评论：证明'));
  expect(state.cards[0].comments.slice(1, 13).every(c => c.collapsed)).toBe(true);
  expect(state.cards[0].comments[0].collapsed).toBe(false);
  expect(host.querySelector('.demo-selection-summary').textContent).toContain('已选 13');
  await click(labelled('展开模块评论：证明'));
  expect(state.cards[0].comments.slice(1, 13).every(c => !c.collapsed)).toBe(true);
  await click(labelled('选择评论 #3'));
  expect(labelled('折叠模块评论：证明')).toBeUndefined();
});

it('module folding includes filtered and visually hidden members, retains visibility and supports undo', async () => {
  await click(button('图片'));
  await click(labelled('选择模块：证明（含标题）'));
  await click(labelled('隐藏模块内容：证明'));
  await click(labelled('折叠模块评论：证明'));
  expect(state.cards[0].comments.slice(1, 13).every(c => c.collapsed)).toBe(true);
  expect(labelled('显示模块内容：证明')).toBeTruthy();
  expect(labelled('选择模块：证明（含标题）').checked).toBe(true);
  expect(host.querySelector('#module-mixed-1').querySelectorAll('[data-comment-id]').length).toBe(0);
  await click(labelled('撤销：评论折叠'));
  expect(state.cards[0].comments.slice(1, 13).every(c => !c.collapsed)).toBe(true);
  expect(labelled('显示模块内容：证明')).toBeTruthy();
});

it('body-only module folding excludes every structural title and never appears for empty body selection', async () => {
  await click(labelled('模块划分设置')); await change(labelled('划分方案'), 'nested');
  const titleCheck = [...host.querySelectorAll('label')].find(el => el.textContent.includes('模块选择包含结构标题')).querySelector('input');
  await click(titleCheck); await click(button('保存方案'));
  expect(labelled('选择模块：空模块（仅正文）').disabled).toBe(true);
  expect(labelled('折叠模块评论：空模块')).toBeUndefined();
  await click(labelled('选择模块：证明（仅正文）'));
  await click(labelled('折叠模块评论：证明'));
  expect([3, 4, 6, 8, 10, 12].every(i => state.cards[0].comments[i].collapsed)).toBe(true);
  expect([1, 2, 5, 7, 9, 11].every(i => !state.cards[0].comments[i].collapsed)).toBe(true);
  expect(labelled('展开模块评论：方法一：直接估计')).toBeTruthy();
});

it('failed module folding preserves comment states and the complete selection', async () => {
  await click(labelled('选择模块：证明（含标题）'));
  const before = structuredClone(state);
  DemoBridge.send.mockRejectedValueOnce(new Error('模拟写入失败'));
  await click(labelled('折叠模块评论：证明'));
  expect(state).toEqual(before);
  expect(labelled('选择模块：证明（含标题）').checked).toBe(true);
  expect(labelled('折叠模块评论：证明')).toBeTruthy();
  expect(host.querySelector('.status-message').textContent).toBe('模拟写入失败');
});

it('extracts a simulated child and exposes a working result viewer and undo', async () => {
  await click(labelled('选择模块：应用（含标题）'));
  await click(labelled('提取所选内容为子卡片'));
  await change(labelled('子卡片标题'), '演示结果'); await click(button('确认提取'));
  expect(state.cards.at(-1).title).toBe('演示结果');
  await click(button('查看子卡片')); expect(labelled('样例卡片').value).toBe(state.cards.at(-1).id);
  await click(labelled('撤销：提取子卡片')); expect(state.cards.length).toBe(5);
});

it('save failures retain the draft and do not claim success', async () => {
  await click(labelled('模块划分设置')); await change(labelled('方案名称'), '待保存的名称');
  DemoBridge.send.mockRejectedValueOnce(new Error('模拟写入失败'));
  await click(button('保存方案'));
  expect(host.querySelector('[role=dialog]')).toBeTruthy();
  expect(labelled('方案名称').value).toBe('待保存的名称');
  expect(host.querySelector('.demo-dialog-status').textContent).toBe('模拟写入失败');
  expect(state.settings.profiles[0].name).toBe('HTML 字段');
});

it('narrow layout retains sorting actions through the module menu', async () => {
  await click(labelled('模块操作：应用'));
  expect(button('整体上移模块').disabled).toBe(false);
  await click(button('整体上移模块'));
  expect(state.cards[0].comments[1].text).toContain('应用');
});

it('copies a preset into a named configurable profile without changing the original', async () => {
  await click(labelled('模块划分设置')); await click(button('复制为新方案'));
  await change(labelled('方案名称'), '证明专用'); await change(labelled('边界匹配'), 'exact'); await change(labelled('匹配文字'), '证明');
  await click(button('保存方案'));
  expect(state.settings.profiles.length).toBe(5);
  expect(state.settings.profiles[0].match).toBe('all');
  expect(host.querySelector('.demo-profile-summary').textContent).toContain('证明专用');
});

it('preserves the original touch target when selection and status update', async () => {
  const target = host.querySelector('[data-comment-id="mixed-3"] .markdown-content p');
  await click(labelled('选择评论 #4'));
  expect(target.isConnected).toBe(true);
  expect(host.querySelector('[data-comment-id="mixed-3"] .markdown-content p')).toBe(target);
  await click(labelled('选择模块：证明（含标题）'));
  expect(target.isConnected).toBe(true);
  expect(host.querySelector('[data-comment-id="mixed-3"] .markdown-content p')).toBe(target);
});

// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import MNBridge from './lib/mnBridge';
import { chooseHtmlOption } from './test/chooseHtmlOption';
vi.mock('./lib/mnBridge', () => ({ default: { send: vi.fn() } }));
let root, host, workflows, saved;
const menu = (single, batch, order) => ({ single: { position: single, order }, batch: { position: batch, order } });
const template = { id: 'builtin.clearAllTitles', templateId: 'builtin.clearAllTitles', name: '清空所有标题', scope: 'both', steps: [{ kind: 'action', actionId: 'clearAllTitles', options: {} }], menu: menu('root', 'root', 0) };
const clone = (value) => structuredClone(value);
const click = async (node) => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const find = (label) => [...host.querySelectorAll('.workflow-manager button')].find((node) => node.textContent === label) || [...host.querySelectorAll('button')].find((node) => node.textContent === label);
const selectWorkflow = async (id) => click([...host.querySelectorAll('.workflow-list-item')].find((node) => node.textContent.includes(workflows.find((item) => item.id === id).name)));
const choose = async (label, value) => chooseHtmlOption(host.querySelector(`[aria-label="${label}"]`), value);
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  saved = null;
  workflows = [{ ...clone(template), name: '已修改的默认操作' }, {
    id: 'user.one', name: '自定义流程', scope: 'both', steps: clone(template.steps), menu: menu('submenu', 'submenu', 1),
  }];
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === 'getCurrentNoteComments') return { noteId: 'test', comments: [], excerpt: { present: false } };
    if (command === 'getWorkflowActionCatalog') return [{ id: 'clearAllTitles', title: '清空所有标题', scope: 'both', compatible: true, builtin: true, parameterSchema: [] }];
    if (command === 'getWorkflowTemplates') return [clone(template)];
    if (command === 'listWorkflows') return clone(workflows);
    if (command === 'saveWorkflow') {
      saved = { ...clone(payload), id: payload.id || 'new.copy' };
      saved.menu ||= menu('submenu', 'submenu', workflows.length);
      for (const mode of ['single', 'batch']) saved.menu[mode].order ??= workflows.find((item) => item.id === saved.id)?.menu[mode].order ?? workflows.length;
      workflows = workflows.some((item) => item.id === saved.id) ? workflows.map((item) => item.id === saved.id ? clone(saved) : item) : [...workflows, clone(saved)];
      return clone(saved);
    }
    if (command === 'reorderWorkflows') {
      workflows.forEach((item) => { item.menu[payload.mode].order = payload.ids.indexOf(item.id); });
      return clone(workflows);
    }
    return {};
  });
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host); await act(async () => root.render(<App />));
  await click(find('工作流'));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it('saves independent single and batch menu positions and restores them on reopening', async () => {
  await selectWorkflow('user.one');
  await choose('单选菜单展示位置', 'root');
  await choose('多选菜单展示位置', 'hidden');
  await click(find('保存'));
  expect(saved.menu).toEqual(menu('root', 'hidden', 1));
  await click(find('关闭')); await click(find('工作流'));
  await selectWorkflow('user.one');
  expect(host.querySelector('[aria-label="单选菜单展示位置"]').textContent).toContain('直接显示');
  expect(host.querySelector('[aria-label="多选菜单展示位置"]').textContent).toContain('不在菜单中显示');
});
it('persists manual ordering for the chosen mode only', async () => {
  await selectWorkflow('user.one');
  await choose('菜单排序范围', 'batch');
  await click(host.querySelector('[aria-label="上移工作流"]'));
  expect(MNBridge.send).toHaveBeenCalledWith('reorderWorkflows', { mode: 'batch', ids: ['user.one', template.id], expectedIds: [template.id, 'user.one'] });
  expect(workflows.find((item) => item.id === 'user.one').menu).toEqual({ single: { position: 'submenu', order: 1 }, batch: { position: 'submenu', order: 0 } });
  expect(host.querySelectorAll('.workflow-list-item')[0].textContent).toContain('自定义流程');
});
it('protects a changed menu position as an unsaved draft', async () => {
  await choose('单选菜单展示位置', 'hidden');
  expect(host.querySelector('[aria-label="下移工作流"]').disabled).toBe(true);
  await click(find('关闭'));
  expect(host.querySelector('.workflow-unsaved-dialog')).not.toBeNull();
  expect(MNBridge.send.mock.calls.some(([command]) => command === 'saveWorkflow')).toBe(false);
});
it('copies a default without changing the original or inheriting its menu rank', async () => {
  await click(host.querySelector('.workflow-secondary-actions summary'));
  await click(host.querySelector('[aria-label="复制工作流"]'));
  expect(workflows).toHaveLength(2);
  await click(find('保存'));
  expect(saved.id).toBe('new.copy');
  expect(saved.name).toBe('已修改的默认操作（副本）');
  expect(saved.templateId).toBe('');
  expect(saved.menu).toEqual(menu('submenu', 'submenu', 2));
  expect(workflows[0].name).toBe('已修改的默认操作');
});
it('loads a factory template into a dirty draft and writes only after save', async () => {
  await click(host.querySelector('.workflow-secondary-actions summary'));
  await choose('出厂工作流模板', template.id);
  await click(host.querySelector('[aria-label="载入出厂模板"]'));
  expect(workflows[0].name).toBe('已修改的默认操作');
  expect(host.querySelector('.workflow-save-state').textContent).toBe('有未保存更改');
  await click(find('保存'));
  expect(saved.id).toBe(template.id);
  expect(workflows[0].name).toBe(template.name);
  expect(workflows).toHaveLength(2);
});
it('keeps the draft if the native receipt drops a menu setting', async () => {
  await choose('单选菜单展示位置', 'hidden');
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => command === 'saveWorkflow' ? { ...payload, menu: undefined } : send(command, payload));
  await click(find('保存'));
  expect(host.querySelector('.workflow-feedback.error').textContent).toContain('保存结果未确认');
  expect(host.querySelector('[aria-label="单选菜单展示位置"]').textContent).toContain('不在菜单中显示');
  expect(host.querySelector('.workflow-save-state').textContent).toBe('有未保存更改');
});
it('rejects a contradictory reorder receipt without changing the displayed list', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => command === 'reorderWorkflows' ? clone(workflows) : send(command, payload));
  await selectWorkflow('user.one'); await click(host.querySelector('[aria-label="上移工作流"]'));
  expect(host.querySelector('.workflow-feedback.error').textContent).toContain('排序结果未确认');
  expect(host.querySelectorAll('.workflow-list-item')[0].textContent).toContain('已修改的默认操作');
});

const openSecondaryActions = async () => click(host.querySelector('.workflow-secondary-actions summary'));
const changeName = async (value) => {
  const input = host.querySelector('.workflow-edit-fields input');
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

it('starts with menu settings and hides editing, recovery, and usage metadata', () => {
  expect(host.querySelector('.workflow-edit-fields')).toBeNull();
  expect(host.querySelectorAll('.workflow-step')).toHaveLength(0);
  expect(host.querySelector('.workflow-secondary-actions').open).toBe(false);
  expect(host.querySelector('.workflow-guide').open).toBe(false);
  expect(host.querySelectorAll('.workflow-menu-settings [role="combobox"]')).toHaveLength(2);
  expect(host.querySelector('.workflow-list').textContent).not.toContain('使用 0 次');
  expect(find('保存').disabled).toBe(true);
});
it('preserves name edits and a pending action when editing is collapsed', async () => {
  await click(host.querySelector('[data-workflow-edit-toggle]'));
  await changeName('新的菜单名称');
  await choose('添加工作流动作', 'clearAllTitles');
  await click(host.querySelector('[data-workflow-edit-toggle]'));
  expect(host.querySelector('.workflow-edit-fields')).toBeNull();
  expect(find('保存').disabled).toBe(false);
  await click(find('保存'));
  expect(saved.name).toBe('新的菜单名称');
  expect(saved.steps).toHaveLength(2);
});
it('copies the saved version after explaining that unsaved edits will be discarded', async () => {
  await click(host.querySelector('[data-workflow-edit-toggle]'));
  await changeName('未保存的名称');
  await openSecondaryActions();
  await click(host.querySelector('[aria-label="复制工作流"]'));
  expect(host.querySelector('.workflow-unsaved-dialog').textContent).toContain('已保存的内容');
  await click(find('放弃修改并复制'));
  expect(document.activeElement).toBe(host.querySelector('.workflow-edit-fields input'));
  await click(find('保存'));
  expect(saved.name).toBe('已修改的默认操作（副本）');
  expect(workflows[0].name).toBe('已修改的默认操作');
});
it('explains when an already-restored template requires no additional save', async () => {
  workflows[0] = clone(template);
  await click(find('关闭')); await click(find('工作流'));
  await openSecondaryActions();
  await click(host.querySelector('[aria-label="载入出厂模板"]'));
  expect(host.querySelector('.workflow-feedback').textContent).toContain('无需再次保存');
  expect(find('保存').disabled).toBe(true);
  expect(workflows).toHaveLength(2);
});
it('names a new workflow from its first selected action and opens its editing fields', async () => {
  await click(host.querySelector('[data-workflow-create]'));
  expect(host.querySelector('.workflow-edit-fields')).not.toBeNull();
  expect(document.activeElement).toBe(host.querySelector('.workflow-edit-fields input'));
  await choose('添加工作流动作', 'clearAllTitles');
  expect(host.querySelector('.workflow-edit-fields input').value).toBe('清空所有标题');
  expect(host.querySelector('.workflow-pending-action').textContent).toContain('也可以直接保存');
  await click(find('保存'));
  expect(saved.name).toBe('清空所有标题');
  expect(saved.steps).toHaveLength(1);
});
it('queues a native request safely and preserves an already-open editing draft', async () => {
  await choose('单选菜单展示位置', 'hidden');
  const calls = MNBridge.send.mock.calls.filter(([command]) => command === 'getWorkflowActionCatalog').length;
  await act(async () => {
    window.__MNCommentManagerRequestedView = 'workflow';
    window.__MNCommentManagerOpenWorkflow();
  });
  expect(MNBridge.send.mock.calls.filter(([command]) => command === 'getWorkflowActionCatalog')).toHaveLength(calls);
  expect(host.querySelector('[aria-label="单选菜单展示位置"]').textContent).toContain('不在菜单中显示');
  await click(find('关闭')); await click(find('放弃并关闭'));
  await act(async () => {
    window.__MNCommentManagerRequestedView = 'workflow';
    window.__MNCommentManagerOpenWorkflow();
  });
  expect(host.querySelector('.workflow-manager')).not.toBeNull();
  expect(window.__MNCommentManagerRequestedView).toBe('');
});

it('allows Tab to leave a disclosure summary and skips its collapsed controls in the footer loop', async () => {
  const summary = host.querySelector('.workflow-secondary-actions summary');
  summary.focus();
  let event;
  await act(async () => {
    event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    summary.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(false);
  const close = host.querySelector('.workflow-actions .secondary');
  close.focus();
  await act(async () => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(host.querySelector('[data-workflow-close]'));
});
it('returns keyboard focus to the action picker if the last step is removed while filtering controls are collapsed', async () => {
  await click(host.querySelector('[data-workflow-edit-toggle]'));
  await click(host.querySelector('[aria-label="删除第 1 步"]'));
  expect(document.activeElement).toBe(host.querySelector('[aria-label="添加工作流动作"]'));
  expect(find('保存').disabled).toBe(true);
});

it('waits for another settings dialog to close before opening a requested workflow manager', async () => {
  await click(find('关闭'));
  await click(find('设置'));
  const settings = host.querySelector('.action-button-settings');
  expect(settings).not.toBeNull();
  await act(async () => {
    window.__MNCommentManagerRequestedView = 'workflow';
    window.__MNCommentManagerOpenWorkflow();
  });
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(host.querySelector('.action-button-settings')).toBe(settings);
  expect(window.__MNCommentManagerRequestedView).toBe('workflow');
  await click(find('完成'));
  expect(host.querySelector('.workflow-manager')).not.toBeNull();
  expect(window.__MNCommentManagerRequestedView).toBe('');
});

it('updates an automatic name if the first action changes and preserves a name explicitly typed by the user', async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => command === 'getWorkflowActionCatalog' ? [
    { id: 'clearAllTitles', title: '清空所有标题', scope: 'both', compatible: true, parameterSchema: [] },
    { id: 'clearAllComments', title: '清空所有评论', scope: 'both', compatible: true, parameterSchema: [] },
  ] : send(command, payload));
  await click(find('关闭')); await click(find('工作流'));
  await click(host.querySelector('[data-workflow-create]'));
  await choose('添加工作流动作', 'clearAllTitles');
  await choose('添加工作流动作', 'clearAllComments');
  expect(host.querySelector('.workflow-edit-fields input').value).toBe('清空所有评论');
  await changeName('已确认的菜单名称');
  await choose('添加工作流动作', 'clearAllTitles');
  expect(host.querySelector('.workflow-edit-fields input').value).toBe('已确认的菜单名称');
  await click(find('保存'));
  expect(saved.name).toBe('已确认的菜单名称');
});

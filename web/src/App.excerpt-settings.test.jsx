// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import MNBridge from "./lib/mnBridge";

vi.mock("./lib/mnBridge", () => ({ default: { send: vi.fn() } }));
let root, host, snapshot, settings;
const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const click = async (node) => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const excerptBody = () => host.querySelector("#native-excerpt .excerpt-body");
const textCheckbox = () => [...host.querySelectorAll(".action-button-settings label")]
  .find((node) => node.textContent.includes("显示图片摘录文本"))?.querySelector("input");

it("does not restore old dialog focus over newly opened settings", async () => {
  const frames = [];
  const frameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
  try {
    await click(button('设置'));
    await click(button('完成'));
    await click(button('设置'));
    const target = host.querySelector('.dynamic-button-setting[data-button-id="move"] input');
    target.focus();
    await act(async () => { frames.splice(0).forEach(callback => callback()); });
    expect(document.activeElement).toBe(target);
  } finally { frameSpy.mockRestore(); }
});

async function mount() {
  root = createRoot(host);
  await act(async () => root.render(<App />));
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  snapshot = {
    noteId: "image-excerpt-test", noteTitle: "图片摘录测试", comments: [],
    excerpt: {
      present: true, type: "image", text: "图片中的原文",
      imageBase64: "data:image/png;base64,preview", capabilities: { canCopyText: true },
    },
  };
  settings = { showBatchButton: true, enableDynamicSingleCardButton: true, showImageExcerptText: false };
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "getCurrentNoteComments") return snapshot;
    if (command === "getActionButtonSettings") return { ...settings };
    if (command === "updateActionButtonSettings") {
      settings = { ...settings, ...payload };
      return { ...settings };
    }
    return {};
  });
  host = document.createElement("div");
  document.body.append(host);
  await mount();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it("hides image excerpt text by default while retaining the image and copy action", async () => {
  expect(excerptBody().querySelector("img")).not.toBeNull();
  expect(excerptBody().textContent).toBe("");
  await click(host.querySelector("#native-excerpt input"));
  await click(button("复制文本"));
  expect(MNBridge.send).toHaveBeenCalledWith("copyContentText", {
    noteId: snapshot.noteId, selection: { excerptSelected: true, commentIndices: [] },
  });
  expect(snapshot.excerpt.text).toBe("图片中的原文");
});

it("saves the switch through Native, updates immediately, and retains it after reopening", async () => {
  await click(button("设置"));
  expect(textCheckbox().checked).toBe(false);
  await click(textCheckbox());
  expect(MNBridge.send).toHaveBeenCalledWith("updateActionButtonSettings", { showImageExcerptText: true });
  expect(excerptBody().textContent).toContain(snapshot.excerpt.text);
  expect(textCheckbox().checked).toBe(true);
  await click(button("完成"));
  await act(async () => root.unmount());
  await mount();
  expect(excerptBody().textContent).toContain(snapshot.excerpt.text);
  await click(button("设置"));
  expect(textCheckbox().checked).toBe(true);
  await click(textCheckbox());
  expect(MNBridge.send).toHaveBeenCalledWith("updateActionButtonSettings", { showImageExcerptText: false });
  expect(excerptBody().textContent).toBe("");
});

it("renders image excerpt Markdown only when enabled", async () => {
  snapshot = { ...snapshot, excerpt: { ...snapshot.excerpt, text: "**图片中的原文**", textMarkdown: true } };
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot }));
  expect(excerptBody().querySelector("strong")).toBeNull();
  await click(button("设置"));
  await click(textCheckbox());
  expect(excerptBody().querySelector("strong").textContent).toBe("图片中的原文");
});

it.each([false, true])("continues to show text excerpts with Markdown=%s while the switch is off", async (textMarkdown) => {
  snapshot = { ...snapshot, excerpt: { ...snapshot.excerpt, type: "text", textMarkdown } };
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot }));
  expect(excerptBody().textContent).toContain("图片中的原文");
});

it("does not enable the preview when Native fails to save", async () => {
  await click(button("设置"));
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "updateActionButtonSettings") throw new Error("测试保存失败");
    return send(command, payload);
  });
  await click(textCheckbox());
  expect(textCheckbox().checked).toBe(false);
  expect(excerptBody().textContent).toBe("");
  expect(host.querySelector(".action-button-settings [role=alert]").textContent).toContain("测试保存失败");
});

it("uses a safe readback to apply an enabled preference when the write response is lost", async () => {
  await click(button("设置"));
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "updateActionButtonSettings") {
      settings = { ...settings, ...payload };
      throw new Error("测试响应丢失");
    }
    return send(command, payload);
  });
  await click(textCheckbox());
  expect(textCheckbox().checked).toBe(true);
  expect(excerptBody().textContent).toContain(snapshot.excerpt.text);
  expect(host.querySelector(".action-button-settings [role=alert]").textContent).toContain("已生效");
});

it("persists per-button click and hold actions and the add-button visibility through Native", async () => {
  await click(button("设置"));
  const trigger = host.querySelector('[role="combobox"][aria-label="管理按钮单击"]');
  await click(trigger);
  await click(host.querySelector('[role="option"][data-value="quickInput"]'));
  expect(MNBridge.send).toHaveBeenCalledWith('updateActionButtonSettings', { managementTapAction: 'quickInput' });
  expect(trigger.textContent).toContain('添加评论');
  const visibility = [...host.querySelectorAll('.action-button-settings label')].find(node => node.textContent.includes('显示添加评论按钮')).querySelector('input');
  await click(visibility);
  expect(MNBridge.send).toHaveBeenCalledWith('updateActionButtonSettings', { showQuickCommentButton: false });
  const hold = host.querySelector('[role="combobox"][aria-label="添加按钮长按"]');
  await click(hold); await click(host.querySelector('[role="option"][data-value="none"]'));
  expect(MNBridge.send).toHaveBeenCalledWith('updateActionButtonSettings', { addHoldAction: 'none' });
});

it("independently disables every floating button, preserves choices under the master switch, and restores them after reopening", async () => {
  await click(button("设置"));
  const checkbox = label => [...host.querySelectorAll('.action-button-settings label')]
    .find(node => node.querySelector('strong')?.textContent === label)?.querySelector('input');
  for (const [label, key] of [['显示管理按钮', 'showManagementButton'], ['显示添加评论按钮', 'showQuickCommentButton'], ['显示移动评论按钮', 'showMoveCommentButton']]) {
    expect(checkbox(label).checked).toBe(true);
    await click(checkbox(label));
    expect(MNBridge.send).toHaveBeenCalledWith('updateActionButtonSettings', { [key]: false });
    expect(checkbox(label).checked).toBe(false);
  }
  await click(checkbox('单卡时显示浮动按钮'));
  expect(settings.enableDynamicSingleCardButton).toBe(false);
  expect(checkbox('显示管理按钮').disabled).toBe(false);
  await click(checkbox('显示管理按钮'));
  await click(checkbox('单卡时显示浮动按钮'));
  expect(settings.showManagementButton).toBe(true);
  expect(settings.showQuickCommentButton).toBe(false);
  expect(settings.showMoveCommentButton).toBe(false);
  await click(button('完成')); await click(button('设置'));
  expect(checkbox('显示管理按钮').checked).toBe(true);
  expect(checkbox('显示添加评论按钮').checked).toBe(false);
  expect(checkbox('显示移动评论按钮').checked).toBe(false);
});

it("saves reordered buttons through Native and checks array contents across a lost response", async () => {
  await click(button('设置'));
  const order = () => [...host.querySelectorAll('.dynamic-button-setting')].map(row => row.dataset.buttonId);
  const arrow = name => host.querySelector(`button[aria-label="${name}"]`);
  expect(arrow('前移：显示管理按钮').disabled).toBe(true);
  expect(arrow('后移：显示移动评论按钮').disabled).toBe(true);
  await click(arrow('前移：显示移动评论按钮'));
  expect(settings.dynamicButtonOrder).toEqual(['management', 'move', 'add']);
  expect(order()).toEqual(settings.dynamicButtonOrder);
  expect(host.querySelector('.action-button-settings [role=status]').textContent).toContain('已保存');
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === 'updateActionButtonSettings') {
      settings = { ...settings, ...payload };
      throw new Error('测试排序回执丢失');
    }
    const result = await send(command, payload);
    return JSON.parse(JSON.stringify(result));
  });
  await click(arrow('前移：显示移动评论按钮'));
  expect(order()).toEqual(['move', 'management', 'add']);
  expect(host.querySelector('.action-button-settings [role=alert]').textContent).toContain('已生效');
  await click(button('完成')); await click(button('设置'));
  expect(order()).toEqual(['move', 'management', 'add']);
});

it("keeps the existing order when Native rejects a reorder", async () => {
  await click(button('设置'));
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === 'updateActionButtonSettings') throw new Error('测试排序保存失败');
    return send(command, payload);
  });
  await click(host.querySelector('button[aria-label="前移：显示移动评论按钮"]'));
  expect([...host.querySelectorAll('.dynamic-button-setting')].map(row => row.dataset.buttonId)).toEqual(['management', 'add', 'move']);
  expect(host.querySelector('.action-button-settings [role=alert]').textContent).toContain('测试排序保存失败');
});

it("updates live preview pills, rank badges, and keeps action selectors attached to their button cards", async () => {
  await click(button('设置'));
  expect(host.querySelector('.statusbar .status-message')?.textContent).toBe('评论管理设置已打开');
  await click(button('完成'));
  expect(host.querySelector('.statusbar .status-message')?.textContent).toBe('当前卡片已就绪');

  await click(button('设置'));
  const card = (id) => host.querySelector(`.dynamic-button-setting[data-button-id="${id}"]`);
  const summary = () => host.querySelector('.dynamic-button-preview-summary')?.textContent;
  expect(summary()).toBe('显示 3 / 3 项');
  expect(card('management').querySelector('[aria-label="管理按钮单击"]')).not.toBeNull();
  expect(card('add').querySelector('[aria-label="添加按钮单击"]')).not.toBeNull();
  expect(card('move').querySelector('.dynamic-action-settings')).toBeNull();
  expect(card('add').querySelector('.dynamic-button-rank-badge').textContent).toBe('左起第 2 位');

  const previewPills = host.querySelectorAll('.dynamic-button-preview-pill');
  await click(previewPills[2]);
  expect(document.activeElement).toBe(card('move').querySelector('input[type="checkbox"]'));
  expect(card('move').classList.contains('is-highlighted')).toBe(true);

  await click(card('management').querySelector('input[type="checkbox"]'));
  expect(summary()).toBe('显示 2 / 3 项');
  expect(card('management').querySelector('.dynamic-button-rank-badge').textContent).toBe('已隐藏');
  expect(card('add').querySelector('.dynamic-button-rank-badge').textContent).toBe('左起第 1 位');

  await act(async () => {
    card('add').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
  });
  expect([...host.querySelectorAll('.dynamic-button-setting')].map(row => row.dataset.buttonId)).toEqual(['add', 'management', 'move']);
  expect(card('add').classList.contains('is-just-moved')).toBe(true);
  expect(host.querySelector('.dynamic-button-setting').querySelector('[aria-label="添加按钮单击"]')).not.toBeNull();

  await click(card('add').querySelector('[role="combobox"][aria-label="添加按钮单击"]'));
  await click(host.querySelector('[role="option"][data-value="none"]'));
  await click(card('add').querySelector('[role="combobox"][aria-label="添加按钮长按"]'));
  await click(host.querySelector('[role="option"][data-value="none"]'));
  expect(card('add').querySelector('.dynamic-action-noop-hint')?.textContent).toContain('不执行操作');

  const master = [...host.querySelectorAll('.action-button-settings label')]
    .find(node => node.querySelector('strong')?.textContent === '单卡时显示浮动按钮')?.querySelector('input');
  await click(master);
  expect(summary()).toBe('总开关已关');
  expect(host.querySelector('.dynamic-button-master-off-banner')?.textContent).toContain('已暂停显示');
  expect(card('add').querySelector('.dynamic-button-rank-badge').textContent).toContain('已暂停');
  await click(button('完成'));
  expect(host.querySelector('.statusbar .status-message')?.textContent).toBe('当前卡片已就绪');
});

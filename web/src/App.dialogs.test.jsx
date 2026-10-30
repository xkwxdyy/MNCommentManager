// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { chooseHtmlOption } from "./test/chooseHtmlOption";
import MNBridge from "./lib/mnBridge";

vi.mock("./lib/mnBridge", () => ({ default: { send: vi.fn() } }));
let root, host;
const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const click = async (node) => { expect(node).toBeTruthy(); await act(async () => node.click()); };
async function key(node, key, options = {}) {
  await act(async () => node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })));
}

async function openWorkflowEditing() {
  const toggle = host.querySelector('[data-workflow-edit-toggle]');
  if (toggle?.getAttribute('aria-expanded') === 'false') await click(toggle);
}
async function addFilter() {
  await openWorkflowEditing();
  const builder = host.querySelector('.workflow-filter-builder');
  if (!builder.open) await click(builder.querySelector('summary'));
  await click(button('添加评论筛选'));
}
async function addActionIfNeeded() {
  if ([...host.querySelectorAll('.workflow-step-title')].some(node => !node.textContent.startsWith('筛选评论'))) return;
  await chooseHtmlOption(host.querySelector('[aria-label="添加工作流动作"]'), 'foldSelectedComments');
  await click(button('添加步骤'));
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command) => {
    if (command === "getCurrentNoteComments") return {
      noteId: "dialog-test", noteTitle: "弹窗测试", excerpt: { present: false },
      comments: [{ index: 0, type: "textComment", text: "原文", capabilities: { canEditText: true } }],
    };
    if (command === "listWorkflows") return [];
    if (command === "getWorkflowActionCatalog") return [{ id: "foldSelectedComments", title: "折叠评论", scope: "both", input: "selection", compatible: true, parameterSchema: [] }];
    return {};
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete window.__MNCommentManagerPendingBatchSync;
  delete window.__MNCommentManagerPendingNativeClose;
  delete window.__MNCommentManagerPendingPanelClose;
});

it("opens the first batch editor from a native payload delivered before React is mounted", async () => {
  await act(async () => root.unmount());
  window.__MNCommentManagerPendingBatchSync = JSON.stringify({ state: {
    mode: "batch", token: "before-react", noteIds: ["note-a", "note-b"], cards: [], catalog: [], workflows: [],
  } });
  root = createRoot(host);
  await act(async () => root.render(<App />));
  expect(host.querySelector('.batch-editor')).not.toBeNull();
  expect(host.querySelector('.batch-editor').textContent).toContain("2 张卡片");
  expect(window.__MNCommentManagerPendingBatchSync).toBeUndefined();
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: {
    noteId: "single-again", noteTitle: "单卡", comments: [], excerpt: { present: false },
  } }));
  expect(host.querySelector('.batch-editor-backdrop').hidden).toBe(true);
  expect(host.querySelector('.batch-editor').getAttribute('aria-modal')).toBeNull();
});

it("keeps an early native close request until the batch editor mounts its guard", async () => {
  window.__MNCommentManagerPendingNativeClose = true;
  expect(window.__MNCommentManagerNativeRequestClose).toBeUndefined();
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "early-close", noteIds: ["note-a"], cards: [], catalog: [], workflows: [],
  } }));
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "closePanel")).toHaveLength(1);
  expect(host.querySelector('.batch-editor')).toBeNull();
  expect(window.__MNCommentManagerPendingNativeClose).toBeUndefined();
  expect(window.__MNCommentManagerNativeRequestClose).toBeUndefined();
});

it.each([{ isComposing: true }, { keyCode: 229 }])("keeps workflow drafts open while IME handles Escape: %j", async (options) => {
  await click(button("工作流"));
  await addFilter();
  const input = host.querySelector('.workflow-name-field input');
  await key(input, "Escape", options);
  expect(host.querySelector('.workflow-unsaved-dialog')).toBeNull();
  expect(host.querySelector('.workflow-manager')).not.toBeNull();
  await key(input, "Escape");
  expect(host.querySelector('.workflow-unsaved-dialog')).not.toBeNull();
  await key(host.querySelector('[data-workflow-unsaved-cancel]'), "Escape");
  expect(host.querySelector('.workflow-unsaved-dialog')).toBeNull();
  expect(host.querySelectorAll('.workflow-step')).toHaveLength(1);
});

it("keeps the workflow footer in the focus loop and restores the opener on close", async () => {
  const opener = button("工作流");
  opener.focus();
  await click(opener);
  await addFilter();
  const manager = host.querySelector('.workflow-manager');
  const first = manager.querySelector('[data-workflow-close]');
  await addActionIfNeeded();
  const save = button("保存");
  save.focus();
  await key(save, "Tab");
  expect(document.activeElement).toBe(first);
  await key(first, "Tab", { shiftKey: true });
  expect(document.activeElement).toBe(save);
  await key(save, "Escape");
  await click(button("放弃并关闭"));
  expect(MNBridge.send).toHaveBeenCalledWith("workflowManagerClosed");
  await vi.waitFor(() => expect(document.activeElement).toBe(opener));
});

it.each([{ isComposing: true }, { keyCode: 229 }])("does not close or submit the text editor during composition: %j", async (options) => {
  await click(host.querySelector('#comment-0 input[type="checkbox"]'));
  await click(button("编辑文本"));
  const input = host.querySelector('.dialog textarea');
  expect(input).not.toBeNull();
  MNBridge.send.mockClear();
  await key(input, "Escape", options);
  await key(input, "Enter", { ctrlKey: true, ...options });
  expect(host.querySelector('.dialog textarea')).toBe(input);
  expect(MNBridge.send).not.toHaveBeenCalled();
  await key(input, "Escape");
  expect(host.querySelector('.dialog')).toBeNull();
});

it("still submits text with Ctrl+Enter after composition ends", async () => {
  await click(host.querySelector('#comment-0 input[type="checkbox"]'));
  await click(button("编辑文本"));
  const input = host.querySelector('.dialog textarea');
  MNBridge.send.mockClear();
  await key(input, "Enter", { ctrlKey: true, isComposing: true });
  expect(MNBridge.send).not.toHaveBeenCalled();
  await key(input, "Enter", { ctrlKey: true });
  expect(MNBridge.send).toHaveBeenCalledWith("editCommentText", expect.objectContaining({ text: "原文" }));
  expect(host.querySelector('.dialog')).toBeNull();
});

it("saves from the relocated footer and keeps selector values", async () => {
  await click(button("工作流"));
  await addFilter();
  await click(host.querySelector('.comment-type-choices input'));
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => command === "saveWorkflow"
    ? { ...payload, id: "saved-workflow" } : send(command, payload));
  await addActionIfNeeded();
  await click(button("保存"));
  expect(MNBridge.send).toHaveBeenCalledWith("saveWorkflow", expect.objectContaining({
    steps: [expect.objectContaining({ selector: expect.objectContaining({ types: ["text"] }) }), expect.objectContaining({ actionId: "foldSelectedComments" })],
  }));
  expect(host.querySelector('.workflow-save-state').textContent).toBe("已保存");
  expect(host.querySelector('.comment-type-choices input').checked).toBe(true);
});

it("reports a failed footer save and allows retry without losing the draft", async () => {
  await click(button("工作流"));
  await addFilter();
  const send = MNBridge.send.getMockImplementation();
  let fail = true;
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command !== "saveWorkflow") return send(command, payload);
    if (fail) throw new Error("测试保存失败");
    return { ...payload, id: "retry-workflow" };
  });
  await addActionIfNeeded();
  await click(button("保存"));
  expect(host.querySelector('[role="alert"]').textContent).toContain("测试保存失败");
  expect(host.querySelectorAll('.workflow-step')).toHaveLength(2);
  expect(button("保存").disabled).toBe(false);
  fail = false;
  await addActionIfNeeded();
  await click(button("保存"));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('.workflow-save-state').textContent).toBe("已保存");
});

it.each([
  null, {}, [], { id: "broken" },
  { id: "broken", name: "缺少步骤", scope: "both", steps: [] },
  { id: "broken", name: "非法步骤", scope: "both", steps: [null] },
  { id: "broken", name: "非法选择器", scope: "both", steps: [{ kind: "select", selector: [] }] },
].map((reply) => ({ reply })))(
  "preserves the draft and reports unconfirmed save receipts: %j", async ({ reply }) => {
    await click(button("工作流"));
    await addFilter();
    await click(host.querySelector('.comment-type-choices input'));
    const send = MNBridge.send.getMockImplementation();
    MNBridge.send.mockImplementation(async (command, payload) => command === "saveWorkflow" ? reply : send(command, payload));
    await addActionIfNeeded();
    await click(button("保存"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("未确认");
    expect(host.querySelectorAll('.workflow-step')).toHaveLength(2);
    expect(host.querySelector('.comment-type-choices input').checked).toBe(true);
    expect(host.querySelector('.workflow-save-state').textContent).toContain("尚未保存");
    expect(host.querySelector('.workflow-feedback.success')).toBeNull();
    await key(button("保存"), "Escape");
    expect(host.querySelector('.workflow-unsaved-dialog')).not.toBeNull();
  },
);

it("accepts a complete workflow wrapped in a single-item reply array", async () => {
  await click(button("工作流"));
  await addFilter();
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => command === "saveWorkflow"
    ? [{ ...payload, id: "array-reply" }] : send(command, payload));
  await addActionIfNeeded();
  await click(button("保存"));
  expect(host.querySelector('.workflow-save-state').textContent).toBe("已保存");
  expect(host.querySelectorAll('.workflow-step')).toHaveLength(2);
});

it("rejects a receipt for another workflow without replacing the current saved draft", async () => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "listWorkflows") return [{ id: "original", name: "原工作流", scope: "both", steps: [{ kind: "select", selector: { types: ["text"] } }, { kind: "action", actionId: "foldSelectedComments", options: {} }] }];
    if (command === "saveWorkflow") return { ...payload, id: "different" };
    return send(command, payload);
  });
  await click(button("工作流"));
  await addFilter();
  await addActionIfNeeded();
  await click(button("保存"));
  expect(host.querySelector('[role="alert"]').textContent).toContain("未确认");
  expect(host.querySelectorAll('.workflow-step')).toHaveLength(3);
  expect(host.querySelector('.workflow-save-state').textContent).toContain("未保存");
  expect(host.querySelectorAll('.workflow-list-item')).toHaveLength(1);
});

it("keeps focus on the adjacent step after deletion, then the add control when empty", async () => {
  await click(button("工作流"));
  await addFilter();
  await addFilter();
  const remove = host.querySelector('[aria-label="删除第 2 步"]');
  remove.focus();
  await click(remove);
  expect(document.activeElement.closest('.workflow-step')).toBe(host.querySelector('.workflow-step'));
  const lastRemove = host.querySelector('[aria-label="删除第 1 步"]');
  lastRemove.focus();
  await click(lastRemove);
  expect(document.activeElement).toBe(button("添加评论筛选"));
});

it("focuses newly added and moved steps", async () => {
  await click(button("工作流"));
  await addFilter();
  expect(document.activeElement.closest('.workflow-step')).toBe(host.querySelector('.workflow-step'));
  await click(host.querySelector('.comment-type-choices input'));
  await addFilter();
  expect(document.activeElement.closest('.workflow-step')).toBe(host.querySelectorAll('.workflow-step')[1]);
  const move = host.querySelector('[aria-label="下移第 1 步"]');
  move.focus();
  await click(move);
  expect(document.activeElement.closest('.workflow-step')).toBe(host.querySelectorAll('.workflow-step')[1]);
  expect(document.activeElement.closest('.workflow-step').querySelector('.comment-type-choices input').checked).toBe(true);
});

const savedWorkflowFixture = { id: "original", name: "删除验证", scope: "both", steps: [{ kind: "select", selector: { types: ["text"] } }, { kind: "action", actionId: "foldSelectedComments", options: {} }] };
async function openSavedWorkflow(deleteReply) {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "listWorkflows") return [savedWorkflowFixture];
    if (command === "deleteWorkflow") return deleteReply;
    return send(command, payload);
  });
  await click(button("工作流"));
  await openWorkflowEditing();
  await click(host.querySelector(".workflow-secondary-actions summary"));
}
const deleteWorkflowButton = () => host.querySelector('[data-workflow-delete]');

it.each([
  null, {}, { deleted: true }, { deleted: false, workflows: [] },
  { deleted: true, workflows: [savedWorkflowFixture] },
  { deleted: true, workflows: [null] },
  { deleted: true, workflows: [{ ...savedWorkflowFixture, id: "other", steps: [null] }] },
  { deleted: true, workflows: [{ ...savedWorkflowFixture, id: "other" }, { ...savedWorkflowFixture, id: "other" }] },
].map(reply => ({ reply })))("does not pretend a workflow was deleted on an unconfirmed receipt: %j", async ({ reply }) => {
  await openSavedWorkflow(reply);
  await addFilter();
  await click(deleteWorkflowButton());
  await click(button("确认删除"));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("删除结果未确认");
  expect(host.querySelectorAll('.workflow-list-item')).toHaveLength(1);
  expect(host.querySelectorAll('.workflow-step')).toHaveLength(3);
  expect(host.querySelector('.workflow-save-state').textContent).toContain("未保存");
  expect(host.querySelector('.workflow-feedback.success')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(deleteWorkflowButton()));
});

it("accepts confirmed deletion and focuses the new-workflow entry", async () => {
  await openSavedWorkflow({ deleted: true, workflows: [] });
  await click(deleteWorkflowButton());
  await click(button("确认删除"));
  expect(host.querySelectorAll('.workflow-list-item')).toHaveLength(0);
  expect(host.querySelector('.workflow-feedback.success').textContent).toBe("工作流已删除");
  await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector('[data-workflow-create]')));
});

it("selects a complete remaining workflow after confirmed deletion", async () => {
  await openSavedWorkflow({ deleted: true, workflows: [{ ...savedWorkflowFixture, id: "remaining", name: "保留工作流" }] });
  await click(deleteWorkflowButton());
  await click(button("确认删除"));
  expect(host.querySelector('.workflow-name-field input').value).toBe("保留工作流");
  expect(host.querySelectorAll('.workflow-list-item')).toHaveLength(1);
  await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector('.workflow-list-item.active')));
});

it.each(["resolve", "reject"])("dismisses the pending-close prompt when saving settles: %s", async outcome => {
  let resolve, reject;
  const response = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  await click(button("工作流"));
  await addFilter();
  let submitted;
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => {
    if (command !== "saveWorkflow") return send(command, payload);
    submitted = payload;
    return response;
  });
  await addActionIfNeeded();
  await click(button("保存"));
  await click(host.querySelector('.workflow-actions .secondary'));
  expect(host.querySelector('.workflow-mutation-close-dialog')).not.toBeNull();
  await act(async () => {
    if (outcome === "resolve") resolve({ ...submitted, id: "saved" });
    else reject(new Error("保存失败测试"));
  });
  expect(host.querySelector('.workflow-mutation-close-dialog')).toBeNull();
  expect(host.querySelector('.workflow-manager')).not.toBeNull();
  expect(host.querySelector(outcome === "resolve" ? '.workflow-feedback.success' : '[role="alert"]')).not.toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector('.workflow-actions .secondary')));
});

it("dismisses the pending-close prompt when deletion finishes", async () => {
  let resolve;
  const response = new Promise(ok => { resolve = ok; });
  await openSavedWorkflow(response);
  await click(deleteWorkflowButton());
  await click(button("确认删除"));
  await click(host.querySelector('.workflow-actions .secondary'));
  expect(host.querySelector('.workflow-mutation-close-dialog')).not.toBeNull();
  await act(async () => resolve({ deleted: true, workflows: [] }));
  expect(host.querySelector('.workflow-mutation-close-dialog')).toBeNull();
  expect(host.querySelector('.workflow-feedback.success').textContent).toBe("工作流已删除");
  await vi.waitFor(() => expect(host.querySelector('.workflow-manager').contains(document.activeElement)).toBe(true));
});

it("does not reopen the editor when deletion returns after an explicit close", async () => {
  let resolve;
  const response = new Promise(ok => { resolve = ok; });
  await openSavedWorkflow(response);
  await click(deleteWorkflowButton());
  await click(button("确认删除"));
  await click(host.querySelector('.workflow-actions .secondary'));
  await click(button("仍然关闭"));
  expect(host.querySelector('.workflow-manager')).toBeNull();
  await act(async () => resolve({ deleted: true, workflows: [] }));
  expect(host.querySelector('.workflow-manager')).toBeNull();
});

async function openRecordedBatch(saveReply, name = "录制回归") {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "runBatchWorkflow") return { completed: true };
    if (command === "saveWorkflow") return typeof saveReply === "function" ? saveReply(payload) : saveReply;
    return send(command, payload);
  });
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "batch-test", noteIds: ["note-a"], cards: [], catalog: [],
  } }));
  await click(button("开始录制"));
  await click(button("执行当前操作"));
  const input = host.querySelector('.batch-recording input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

it("routes native close through the recorded batch draft confirmation", async () => {
  const input = await openRecordedBatch({});
  const recordedSteps = [...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent);
  expect(recordedSteps.length).toBeGreaterThan(0);
  expect(typeof window.__MNCommentManagerNativeRequestClose).toBe("function");
  await act(async () => { window.__MNCommentManagerNativeRequestClose(); window.__MNCommentManagerNativeRequestClose(); });
  expect(host.querySelector('.batch-recording-close-dialog').dataset.closeKind).toBe("unsaved");
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "closePanel")).toHaveLength(0);
  await click(host.querySelector('[data-batch-close-cancel]'));
  expect(input.value).toBe("录制回归");
  expect([...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent)).toEqual(recordedSteps);
  await act(async () => window.__MNCommentManagerNativeRequestClose());
  await click(button("放弃并关闭"));
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "closePanel")).toHaveLength(1);
  expect(host.querySelector('.batch-editor')).toBeNull();
  expect(window.__MNCommentManagerNativeRequestClose).toBeUndefined();
});

it("keeps a recording save and its draft when native close is cancelled", async () => {
  let resolve, submitted;
  const pending = new Promise(yes => { resolve = yes; });
  const input = await openRecordedBatch(payload => { submitted = payload; return pending; });
  await click(button("保存工作流"));
  await act(async () => window.__MNCommentManagerNativeRequestClose());
  expect(host.querySelector('.batch-recording-close-dialog').dataset.closeKind).toBe("saving");
  await click(host.querySelector('[data-batch-close-cancel]'));
  expect(input.value).toBe("录制回归");
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "saveWorkflow")).toHaveLength(1);
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "closePanel")).toHaveLength(0);
  await act(async () => resolve({ ...submitted, id: "native-save-confirmed" }));
  expect(host.querySelector('.batch-editor')).not.toBeNull();
  expect(host.querySelector('.batch-recording-save-feedback.success')).not.toBeNull();
});

it("retains recorded names and steps across a new current card selection", async () => {
  const input = await openRecordedBatch({});
  const steps = [...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent);
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "new-current-selection", noteIds: ["new-a", "new-b"], cards: [], catalog: [],
  } }));
  expect(host.querySelector('.batch-recording input')).toBe(input);
  expect(input.value).toBe("录制回归");
  expect([...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent)).toEqual(steps);
  expect(host.querySelector('.batch-editor-header').textContent).toContain("2 张卡片");
  expect(host.querySelector('.batch-editor').textContent).toContain("已有未保存的录制草稿");
});

it("preserves a hidden recording without keeping its old targets, close handler or focus", async () => {
  const input = await openRecordedBatch({}); input.focus();
  await act(async () => window.__MNCommentManagerBatchNativeSync(null));
  expect(host.querySelector('.batch-editor-backdrop').hidden).toBe(true);
  expect(window.__MNCommentManagerNativeRequestClose).toBeUndefined();
  expect(document.activeElement).not.toBe(input);
  expect(button("执行当前操作").disabled).toBe(true);
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: {
    noteId: "single-between", noteTitle: "中途单卡", comments: [], excerpt: { present: false },
  } }));
  const workflowOpener = button("工作流"); workflowOpener.focus();
  await click(workflowOpener);
  expect(host.querySelector('.workflow-manager')).not.toBeNull();
  expect(window.__MNCommentManagerNativeRequestClose).toBeUndefined();
  await click(host.querySelector('[data-workflow-close]'));
  await vi.waitFor(() => expect(document.activeElement).toBe(workflowOpener));
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "resumed-scope", noteIds: ["new-a", "new-b"], cards: [], catalog: [],
  } }));
  expect(host.querySelector('.batch-recording input')).toBe(input);
  expect(input.value).toBe("录制回归");
  MNBridge.send.mockClear();
  await click(button("执行当前操作"));
  expect(MNBridge.send).toHaveBeenCalledWith("runBatchWorkflow", expect.objectContaining({ token: "resumed-scope" }));
});

it("closes an old workflow layer when batch mode reopens while retaining its recording draft", async () => {
  const input = await openRecordedBatch({});
  const steps = [...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent);
  await act(async () => window.__MNCommentManagerBatchNativeSync(null));
  await click(button("工作流"));
  expect(host.querySelector('.workflow-manager')).not.toBeNull();
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "after-workflow", noteIds: ["new-a", "new-b"], cards: [], catalog: [],
  } }));
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(host.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
  expect(host.querySelector('.batch-recording input')).toBe(input);
  expect(input.value).toBe("录制回归");
  expect([...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent)).toEqual(steps);
  expect(window.__MNCommentManagerRequestedView).toBe("");
});

it.each(["settings", "edit"])("closes a stale %s layer when native batch mode opens", async (kind) => {
  if (kind === "settings") await click(button("设置"));
  else {
    await click(host.querySelector('#comment-0 input[type="checkbox"]'));
    await click(button("编辑文本"));
  }
  expect(host.querySelector('.dialog')).not.toBeNull();
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "after-" + kind, noteIds: ["new-a", "new-b"], cards: [], catalog: [],
  } }));
  expect(host.querySelector('.action-button-settings')).toBeNull();
  expect(host.querySelector('.dialog textarea')).toBeNull();
  expect(host.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
  expect(host.querySelector('.batch-editor')).not.toBeNull();
});

it.each(["workflow", "settings"])("ignores an in-flight old %s opening after switching to batch mode", async (kind) => {
  const send = MNBridge.send.getMockImplementation();
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const delayedCommand = kind === "workflow" ? "listWorkflows" : "getActionButtonSettings";
  MNBridge.send.mockImplementation((command, payload) => command === delayedCommand ? response : send(command, payload));
  await click(button(kind === "workflow" ? "工作流" : "设置"));
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "pending-" + kind, noteIds: ["new-a", "new-b"], cards: [], catalog: [],
  } }));
  await act(async () => finish(kind === "workflow" ? [] : {}));
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(host.querySelector('.action-button-settings')).toBeNull();
  expect(host.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
  expect(host.querySelector('.batch-editor')).not.toBeNull();
});

it.each(["getWorkflowActionCatalog", "listWorkflows", "getWorkflowTemplates"])("restores native card synchronization when %s fails to open the workflow manager", async (failedCommand) => {
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === failedCommand ? Promise.reject(new Error("工作流读取失败")) : send(command, payload));
  await click(button("工作流"));
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "workflowManagerClosed")).toHaveLength(1);
  expect(host.querySelector('.status-message').textContent).toContain("工作流读取失败");
  expect(button("工作流")).toBeTruthy();
});

it.each(["resolve", "reject"])("does not resurrect a workflow opening after whole native close and late %s", async (result) => {
  const send = MNBridge.send.getMockImplementation();
  let finish, fail;
  const response = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  MNBridge.send.mockImplementation((command, payload) => command === "listWorkflows" ? response : send(command, payload));
  await click(button("工作流"));
  await act(async () => window.__MNCommentManagerNativePanelClosed());
  await act(async () => result === "resolve" ? finish([]) : fail(new Error("旧请求失败")));
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "workflowManagerClosed")).toHaveLength(0);
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { noteId: "normal-reopen", noteTitle: "普通管理器重开", comments: [], excerpt: { present: false } } }));
  expect(host.querySelector('.workflow-manager')).toBeNull();
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: { mode: "batch", token: "batch-reopen", noteIds: ["a", "b"], cards: [], catalog: [] } }));
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(host.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
});

it("whole native closing clears an existing workflow layer while preserving the hidden recording draft", async () => {
  const input = await openRecordedBatch({});
  const steps = [...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent);
  await act(async () => window.__MNCommentManagerBatchNativeSync(null));
  await click(button("工作流"));
  expect(host.querySelector('.workflow-manager')).not.toBeNull();
  await act(async () => window.__MNCommentManagerNativePanelClosed());
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(host.querySelector('.batch-editor-backdrop').hidden).toBe(true);
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: { mode: "batch", token: "recording-reopen", noteIds: ["new-a", "new-b"], cards: [], catalog: [] } }));
  expect(host.querySelector('.batch-recording input')).toBe(input);
  expect(input.value).toBe("录制回归");
  expect([...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent)).toEqual(steps);
  expect(host.querySelector('.workflow-manager')).toBeNull();
});

it("consumes a whole close delivered before React can receive it", async () => {
  await act(async () => root.unmount());
  window.__MNCommentManagerPendingPanelClose = true;
  window.__MNCommentManagerRequestedView = "workflow";
  window.__MNCommentManagerPendingBatchSync = { state: { mode: "batch", token: "stale-before-close", noteIds: ["a", "b"], cards: [], catalog: [] } };
  root = createRoot(host);
  await act(async () => root.render(<App />));
  expect(window.__MNCommentManagerPendingPanelClose).toBeUndefined();
  expect(window.__MNCommentManagerPendingBatchSync).toBeUndefined();
  expect(window.__MNCommentManagerRequestedView).toBe("");
  expect(host.querySelector('.workflow-manager')).toBeNull();
  expect(host.querySelector('.batch-editor')).toBeNull();
});

it("does not record a completed execution from an earlier selection into the current draft", async () => {
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  await openRecordedBatch({});
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === "runBatchWorkflow" ? response : send(command, payload));
  const priorSteps = [...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent);
  await click(button("执行当前操作"));
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "replacement-scope", noteIds: ["new-a"], cards: [], catalog: [],
  } }));
  await act(async () => finish({ completed: true }));
  expect([...host.querySelectorAll('.batch-recording > p > span')].map(node => node.textContent)).toEqual(priorSteps);
});

it("discards an old selection preview after the editor is hidden and restored", async () => {
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  await openRecordedBatch({});
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === "previewBatchWorkflow" ? response : send(command, payload));
  await click(button("预览匹配"));
  await act(async () => window.__MNCommentManagerBatchNativeSync(null));
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "new-preview-scope", noteIds: ["new-a"], cards: [], catalog: [],
  } }));
  await act(async () => finish({ steps: [{ totalMatched: 999, perCard: [{ matched: 999 }] }] }));
  expect(host.querySelector('.batch-preview-list')).toBeNull();
  expect(host.querySelector('.batch-editor').textContent).not.toContain("999");
});

it("settles a recording save during forced hiding without replaying it on a new selection", async () => {
  let finish, submitted;
  const response = new Promise(resolve => { finish = resolve; });
  await openRecordedBatch(payload => { submitted = payload; return response; });
  await click(button("保存工作流"));
  await act(async () => window.__MNCommentManagerBatchNativeSync(null));
  expect(window.__MNCommentManagerNativeRequestClose).toBeUndefined();
  const visibleStatus = host.querySelector('.status-message').textContent;
  await act(async () => finish({ ...submitted, id: "saved-while-hidden" }));
  expect(host.querySelector('.status-message').textContent).toBe(visibleStatus);
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "after-hidden-save", noteIds: ["new-a"], cards: [], catalog: [],
  } }));
  expect(host.querySelector('.batch-recording input').value).toBe("");
  expect(host.querySelector('.batch-recording-save-feedback.success')).not.toBeNull();
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "saveWorkflow")).toHaveLength(1);
  await act(async () => window.__MNCommentManagerNativeRequestClose());
  expect(host.querySelector('.batch-recording-close-dialog')).toBeNull();
  expect(host.querySelector('.batch-editor')).toBeNull();
});

it("retains a failed recording save while hidden and restores its failure guard", async () => {
  let fail;
  const response = new Promise((_resolve, reject) => { fail = reject; });
  await openRecordedBatch(() => response);
  await click(button("保存工作流"));
  await act(async () => window.__MNCommentManagerBatchNativeSync(null));
  await act(async () => fail(new Error("隐藏期间保存失败")));
  await act(async () => window.__MNCommentManagerBatchNativeSync({ state: {
    mode: "batch", token: "after-hidden-failure", noteIds: ["new-a"], cards: [], catalog: [],
  } }));
  expect(host.querySelector('.batch-recording input').value).toBe("录制回归");
  expect(host.querySelector('.batch-recording-save-feedback.error').textContent).toContain("隐藏期间保存失败");
  await act(async () => window.__MNCommentManagerNativeRequestClose());
  expect(host.querySelector('.batch-recording-close-dialog').dataset.closeKind).toBe("failed");
});

it.each([null, {}, { id: "only-id" }, { id: "bad", name: "录制回归", scope: "batch", steps: [null, null] }])(
  "retains recorded batch drafts on unconfirmed save receipt %j", async (reply) => {
    const input = await openRecordedBatch(reply);
    await click(button("保存工作流"));
    expect(input.value).toBe("录制回归");
    expect(host.querySelector('.batch-recording-save-feedback[role="alert"]').textContent).toContain("未确认");
    expect(button("停止录制")).toBeTruthy();
    await click(host.querySelector('[data-batch-editor-close]'));
    expect(host.querySelector('.batch-recording-close-dialog')).not.toBeNull();
  },
);

it.each(["success", "failure", "invalid"])("settles recording feedback and waiting dialog after %s", async (outcome) => {
  let resolve, reject, submitted;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const input = await openRecordedBatch((payload) => { submitted = payload; return promise; });
  await click(button("保存工作流"));
  const close = host.querySelector('[data-batch-editor-close]');
  await click(close);
  expect(host.querySelector('.batch-recording-close-dialog').dataset.closeKind).toBe("saving");
  await act(async () => {
    if (outcome === "failure") reject(new Error("模拟拒绝"));
    else resolve(outcome === "success" ? { ...submitted, id: "recorded" } : {});
  });
  expect(host.querySelector('.batch-recording-close-dialog')).toBeNull();
  expect(host.querySelector('.batch-recording-save-feedback.saving')).toBeNull();
  expect(host.querySelector('.batch-editor')).not.toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(close));
  if (outcome === "success") {
    expect(input.value).toBe("");
    expect(host.querySelector('.batch-recording-save-feedback.success').textContent).toContain("已保存");
  } else {
    expect(input.value).toBe("录制回归");
    await click(close);
    expect(host.querySelector('.batch-recording-close-dialog').dataset.closeKind).toBe("failed");
  }
});

it.each(["object", "array", "long-name"])("accepts complete recording receipts and native name normalization: %s", async (shape) => {
  const name = shape === "long-name" ? "长".repeat(130) : "录制回归";
  const input = await openRecordedBatch((payload) => {
    const reply = { ...payload, id: "recorded", name: payload.name.slice(0, 120) };
    return shape === "array" ? [reply] : reply;
  }, name);
  await click(button("保存工作流"));
  expect(input.value).toBe("");
  expect(host.querySelector('.batch-recording-save-feedback.success').textContent).toContain(name.slice(0, 120));
  await click(host.querySelector('[data-batch-editor-close]'));
  expect(host.querySelector('.batch-recording-close-dialog')).toBeNull();
  expect(host.querySelector('.batch-editor')).toBeNull();
});

it.each(["scope", "name", "steps"])("retains recordings on mismatched %s", async (field) => {
  const input = await openRecordedBatch((payload) => ({
    ...payload, id: "recorded", [field]: field === "steps" ? [] : "wrong",
  }));
  await click(button("保存工作流"));
  expect(input.value).toBe("录制回归");
  expect(host.querySelector('.batch-recording-save-feedback.error').textContent).toContain("未确认");
  expect(MNBridge.send.mock.calls.filter(([cmd]) => cmd === "saveWorkflow")).toHaveLength(1);
});

it("does not reopen a closed batch editor after a late save receipt", async () => {
  let resolve, submitted;
  const pending = new Promise((yes) => { resolve = yes; });
  await openRecordedBatch((payload) => { submitted = payload; return pending; });
  await click(button("保存工作流"));
  await click(host.querySelector('[data-batch-editor-close]'));
  await click(button("仍然关闭"));
  await act(async () => resolve({ ...submitted, id: "late" }));
  expect(host.querySelector('.batch-editor')).toBeNull();
  expect(host.querySelector('.batch-recording-close-dialog')).toBeNull();
});


it("blocks external card switching while an edit dialog or workflow draft is open", async () => {
  expect(window.__MNCommentManagerCanSwitchCard()).toBe(true);
  window.__MNBridgePending = { loadingCard: {} };
  expect(window.__MNCommentManagerCanSwitchCard()).toBe(false);
  delete window.__MNBridgePending;
  expect(window.__MNCommentManagerCanSwitchCard()).toBe(true);
  await click(host.querySelector('#comment-0 input[type="checkbox"]'));
  await click(button("编辑文本"));
  const input = host.querySelector('.dialog textarea');
  expect(window.__MNCommentManagerCanSwitchCard()).toBe(false);
  expect(input.value).toBe("原文");
  await key(input, "Escape");
  expect(window.__MNCommentManagerCanSwitchCard()).toBe(true);
  await click(button("工作流"));
  expect(window.__MNCommentManagerCanSwitchCard()).toBe(false);
  await addFilter();
  expect(window.__MNCommentManagerCanSwitchCard()).toBe(false);
});

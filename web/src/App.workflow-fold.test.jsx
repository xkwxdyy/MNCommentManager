import { chooseHtmlOption } from './test/chooseHtmlOption';
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import MNBridge from "./lib/mnBridge";
vi.mock("./lib/mnBridge", () => ({ default: { send: vi.fn() } }));
let root, host, saved;
const catalog = ["foldSelectedComments", "unfoldSelectedComments"].map((id) => ({
  id, title: id === "foldSelectedComments" ? "折叠选中的评论" : "展开选中的评论",
  scope: "both", input: "selection", compatible: true, builtin: true, parameterSchema: [],
}));
const button = (text) => [...host.querySelectorAll(".workflow-manager button")].find((node) => node.textContent === text)
  || [...host.querySelectorAll("button")].find((node) => node.textContent === text);
const click = async (node) => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const choose = async (id) => {
  const select = host.querySelector('[aria-label="添加工作流动作"]');
  await chooseHtmlOption(select, id);
};
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  saved = null;
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "getCurrentNoteComments") return { noteId: "test", comments: [], excerpt: { present: false } };
    if (command === "getWorkflowActionCatalog") return catalog;
    if (command === "listWorkflows") return saved ? [structuredClone(saved)] : [];
    if (command === "saveWorkflow") { saved = { ...structuredClone(payload), id: "fold-workflow" }; return structuredClone(saved); }
    return {};
  });
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host); await act(async () => root.render(<App />));
  await click(button("工作流"));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it.each(catalog.map(({ id }) => id))("saves a selected pending action and restores it when reopening: %s", async (id) => {
  await click(button("添加评论筛选"));
  await choose(id);
  await click(button("保存"));
  expect(saved.steps).toEqual([expect.objectContaining({ kind: "select" }), { kind: "action", actionId: id, options: {} }]);
  expect(host.querySelector('[aria-label="添加工作流动作"]').value).toBe("");
  await click(button("关闭"));
  expect(host.querySelector(".workflow-manager")).toBeNull();
  await click(button("工作流"));
  await click(host.querySelector("[data-workflow-edit-toggle]"));
  expect(host.querySelectorAll(".workflow-step")).toHaveLength(2);
  expect(host.querySelectorAll(".workflow-step-title")[1].textContent).toBe(catalog.find((item) => item.id === id).title);
});

it("does not duplicate an action added explicitly before saving", async () => {
  await choose("foldSelectedComments"); await click(button("添加步骤")); await click(button("保存"));
  expect(saved.steps).toEqual([{ kind: "action", actionId: "foldSelectedComments", options: {} }]);
});

it("saves a pending action as the first step without requiring an empty selector", async () => {
  await choose("foldSelectedComments");
  expect(button("保存").disabled).toBe(false);
  await click(button("保存"));
  expect(saved.steps).toEqual([{ kind: "action", actionId: "foldSelectedComments", options: {} }]);
});

it("protects a pending action from being discarded on close", async () => {
  await choose("foldSelectedComments"); await click(button("关闭"));
  expect(host.querySelector(".workflow-unsaved-dialog")).not.toBeNull();
});

it("preserves the pending action and draft if the receipt replaces its action ID", async () => {
  await click(button("添加评论筛选")); await choose("foldSelectedComments");
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => command === "saveWorkflow"
    ? { ...payload, id: "fold-workflow", steps: payload.steps.map((step) => step.kind === "action" ? { ...step, actionId: "unfoldSelectedComments" } : step) }
    : send(command, payload));
  await click(button("保存"));
  expect(host.querySelector(".workflow-feedback.error").textContent).toContain("保存结果未确认");
  expect(host.querySelector('[aria-label="添加工作流动作"]').textContent).toContain("折叠选中的评论");
});

it('does not allow saving a workflow that only filters comments', async () => {
  await click(button('添加评论筛选'));
  expect(button('保存').disabled).toBe(true);
  expect(MNBridge.send.mock.calls.some(([command]) => command === 'saveWorkflow')).toBe(false);
  expect(host.querySelector('.workflow-selector-advanced').open).toBe(false);
});
it('keeps basic type filtering visible and discloses advanced conditions only when expanded', async () => {
  const builder = host.querySelector('.workflow-filter-builder');
  expect(builder.open).toBe(false);
  await click(builder.querySelector('summary'));
  expect(builder.open).toBe(true);
  await click(button('添加评论筛选'));
  expect(host.querySelector('.comment-type-selector')).not.toBeNull();
  const advanced = host.querySelector('.workflow-selector-advanced');
  expect(advanced.open).toBe(false);
  await click(advanced.querySelector('summary'));
  expect(advanced.open).toBe(true);
  expect(advanced.textContent).toContain('评论位置从 0 开始');
});

// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import MNBridge from "./lib/mnBridge";

vi.mock("./lib/mnBridge", () => ({ default: { send: vi.fn() } }));
let root, host, settings, snapshot, moveReply;
const button = text => [...host.querySelectorAll("button")].find(node => node.textContent === text);
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const arrow = () => host.querySelector('[aria-label="下移摘录"]');
const notice = () => host.querySelector('[role="dialog"]');
const setting = () => [...host.querySelectorAll(".action-button-settings label")]
  .find(node => node.textContent.includes("移动摘录时显示转换提示"))?.querySelector("input");
const moves = () => MNBridge.send.mock.calls.filter(([command]) => command === "moveContentSelection");

async function mount() {
  root = createRoot(host);
  await act(async () => root.render(<App />));
}
async function nextExcerpt(changes = {}) {
  snapshot = { ...snapshot, noteId: `${snapshot.noteId}-next`, ...changes };
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot }));
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  settings = { showExcerptMoveNotice: true };
  snapshot = {
    noteId: "excerpt", noteTitle: "移动测试",
    excerpt: { present: true, type: "text", text: "原摘录", conversion: { eligible: true } },
    comments: ["第一条", "最后一条"].map((text, index) => ({ index, type: "textComment", text, capabilities: { canMove: true } })),
  };
  moveReply = () => ({
    noteId: "converted", converted: true, actionCompleted: true, selectedIndices: [1],
    snapshot: { ...snapshot, noteId: "converted", excerpt: { present: false }, comments: [
      snapshot.comments[0], { index: 1, type: "textComment", text: "原摘录", capabilities: { canMove: true } },
      { ...snapshot.comments[1], index: 2 },
    ] },
  });
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "getCurrentNoteComments") return snapshot;
    if (command === "getActionButtonSettings") return { ...settings };
    if (command === "updateActionButtonSettings") return (settings = { ...settings, ...payload });
    if (command === "moveContentSelection") return moveReply(payload);
    return {};
  });
  host = document.createElement("div"); document.body.append(host);
  await mount();
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it.each(["text", "image"])("asks before converting and moving a %s excerpt", async type => {
  await nextExcerpt({ excerpt: { ...snapshot.excerpt, type } });
  expect(host.querySelector('[aria-label="上移摘录"]').disabled).toBe(true);
  expect(arrow().disabled).toBe(false);
  await click(arrow());
  expect(moves()).toHaveLength(0);
  expect(host.querySelector("#native-excerpt")).not.toBeNull();
  expect(notice().textContent).toContain("移动摘录前需转换卡片");
  expect(notice().textContent).toContain("转为非摘录版");
  expect(button("取消")).toBeTruthy();
  await click(button("转换并移动"));
  expect(moves()).toEqual([["moveContentSelection", {
    noteId: snapshot.noteId, selection: { excerptSelected: true, commentIndices: [] }, targetIndex: 2,
  }]]);
  expect(host.querySelector("#native-excerpt")).toBeNull();
  expect(notice()).toBeNull();
  expect(host.querySelector('[aria-label="上移评论 #1"]').disabled).toBe(false);
  expect(host.querySelector('[aria-label="下移评论 #1"]').disabled).toBe(false);
  expect(moves()).toHaveLength(1);
  await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector("#selection-summary")));
});

it("does not include unrelated selected comments in an inline move", async () => {
  await click(host.querySelector("#comment-1 input"));
  await click(arrow());
  expect(moves()).toHaveLength(0);
  await click(button("转换并移动"));
  expect(moves()[0][1].selection).toEqual({ excerptSelected: true, commentIndices: [] });
});

it("persists no-more-notices, retains it after remount, and allows re-enabling in settings", async () => {
  await click(arrow());
  await click(notice().querySelector("input"));
  await click(button("转换并移动"));
  expect(settings.showExcerptMoveNotice).toBe(false);
  expect(MNBridge.send).toHaveBeenCalledWith("updateActionButtonSettings", { showExcerptMoveNotice: false });
  await act(async () => root.unmount()); await mount();
  await click(arrow()); expect(notice()).toBeNull();
  await click(button("设置")); expect(setting().checked).toBe(false);
  await click(setting()); expect(settings.showExcerptMoveNotice).toBe(true);
  await click(button("完成"));
  await nextExcerpt(); await click(arrow());
  expect(notice().textContent).toContain("移动摘录前需转换卡片");
});

it("shows the notice again for another conversion unless disabled", async () => {
  await click(arrow()); await click(button("转换并移动"));
  await nextExcerpt(); await click(arrow());
  expect(notice().textContent).toContain("移动摘录前需转换卡片");
});

it("does not save a checked preference when the confirmation dialog is dismissed", async () => {
  await click(arrow()); await click(notice().querySelector("input"));
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(notice()).toBeNull(); expect(settings.showExcerptMoveNotice).toBe(true);
});

it("keeps the confirmation open on preference failure and moves only after a successful retry", async () => {
  await click(arrow()); await click(notice().querySelector("input"));
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "updateActionButtonSettings") throw new Error("测试保存失败");
    return send(command, payload);
  });
  await click(button("转换并移动"));
  expect(notice().querySelector('[role="alert"]').textContent).toContain("测试保存失败");
  expect(settings.showExcerptMoveNotice).toBe(true);
  expect(moves()).toHaveLength(0);
  MNBridge.send.mockImplementation(send); await click(button("转换并移动"));
  expect(notice()).toBeNull(); expect(settings.showExcerptMoveNotice).toBe(false);
  expect(moves()).toHaveLength(1);
});

it("reconciles a lost preference receipt with a read, without repeating the move", async () => {
  await click(arrow()); await click(notice().querySelector("input"));
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "updateActionButtonSettings") { settings = { ...settings, ...payload }; throw new Error("测试回执丢失"); }
    return send(command, payload);
  });
  await click(button("转换并移动"));
  expect(notice()).toBeNull(); expect(settings.showExcerptMoveNotice).toBe(false);
  expect(moves()).toHaveLength(1);
});

it.each(["noParent", "unsupportedMedia"])("disables unsupported conversion: %s", async reason => {
  await nextExcerpt({ excerpt: { ...snapshot.excerpt, conversion: { eligible: false, reason } } });
  expect(arrow().disabled).toBe(true); await click(arrow()); expect(moves()).toHaveLength(0);
});

it("does not convert an excerpt with no lower comment", async () => {
  await nextExcerpt({ comments: [] });
  expect(arrow().disabled).toBe(true); await click(arrow()); expect(moves()).toHaveLength(0);
});

it("reports a partial result even when conversion notices are off", async () => {
  settings.showExcerptMoveNotice = false;
  await act(async () => root.unmount()); await mount();
  const success = moveReply;
  moveReply = () => ({ ...success(), actionCompleted: false, statusMessage: "卡片已转换，但映射校验失败，移动已停止" });
  await click(arrow());
  expect(notice()).toBeNull(); expect(host.textContent).toContain("移动已停止");
});

it("reports conversion failure without opening a success dialog", async () => {
  moveReply = () => { throw new Error("测试转换失败"); };
  await click(arrow());
  await click(button("转换并移动"));
  expect(notice()).toBeNull(); expect(host.textContent).toContain("测试转换失败");
  expect(host.querySelector("#native-excerpt")).not.toBeNull();
});

it("does not show conversion information for an ordinary comment move", async () => {
  moveReply = () => ({ noteId: snapshot.noteId, converted: false, actionCompleted: true, snapshot });
  await click(host.querySelector("#comment-0 input"));
  await click(host.querySelector('[aria-label="更多选区操作"]'));
  await click(button("下移"));
  expect(moves()).toHaveLength(1); expect(host.querySelector("#dialog-title")).toBeNull();
});

it("keeps the disabled preference after a failed attempt to re-enable it in settings", async () => {
  settings.showExcerptMoveNotice = false;
  await click(button("设置"));
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "updateActionButtonSettings") throw new Error("测试开关保存失败");
    return send(command, payload);
  });
  await click(setting());
  expect(setting().checked).toBe(false);
  expect(notice().querySelector('[role="alert"]').textContent).toContain("测试开关保存失败");
});

it("waits for completion and ignores double-clicks and receipts from a previous card", async () => {
  let finish; const success = moveReply();
  moveReply = () => new Promise(resolve => { finish = resolve; });
  await click(arrow());
  await click(button("转换并移动"));
  expect(notice()).toBeNull(); expect(arrow().disabled).toBe(true);
  await click(arrow()); expect(moves()).toHaveLength(1);
  await nextExcerpt();
  await act(async () => finish(success));
  expect(notice()).toBeNull(); expect(host.querySelector("#native-excerpt")).not.toBeNull();
});

it("confirms before moving the whole selected range through the existing batch action", async () => {
  await click(host.querySelector("#native-excerpt input"));
  await click(host.querySelector("#comment-0 input"));
  await click(host.querySelector('[aria-label="更多选区操作"]'));
  await click(button("下移"));
  expect(moves()).toHaveLength(0);
  await click(button("转换并移动"));
  expect(moves()[0][1].selection).toEqual({ excerptSelected: true, commentIndices: [0] });
  expect(moves()[0][1].targetIndex).toBe(3);
});

it.each(["cancel", "escape", "backdrop"])("does not convert, move, or save the preference after %s", async kind => {
  await click(arrow()); await click(notice().querySelector("input"));
  if (kind === "cancel") await click(button("取消"));
  if (kind === "escape") await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  if (kind === "backdrop") await click(host.querySelector(".dialog-backdrop"));
  expect(notice()).toBeNull(); expect(moves()).toHaveLength(0);
  expect(settings.showExcerptMoveNotice).toBe(true);
  expect(host.querySelector("#native-excerpt")).not.toBeNull();
});

it("refuses to apply an old confirmation after switching cards", async () => {
  await click(arrow()); await nextExcerpt();
  await click(button("转换并移动"));
  expect(moves()).toHaveLength(0);
});

it("does not move after dismissing the confirmation while the preference is saving", async () => {
  let finish;
  const send = MNBridge.send.getMockImplementation();
  MNBridge.send.mockImplementation((command, payload) => command === "updateActionButtonSettings"
    ? new Promise(resolve => { finish = () => resolve(settings = { ...settings, ...payload }); })
    : send(command, payload));
  await click(arrow()); await click(notice().querySelector("input"));
  await click(button("转换并移动"));
  expect(moves()).toHaveLength(0);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await act(async () => finish());
  expect(notice()).toBeNull(); expect(moves()).toHaveLength(0);
});

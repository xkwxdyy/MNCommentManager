// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import MNBridge from "./lib/mnBridge";

vi.mock("./lib/mnBridge", () => ({ default: { send: vi.fn() } }));
let root, host, snapshot;
const button = (label) => [...host.querySelectorAll("button")].find((node) => node.textContent === label);
const click = async (node) => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const card = (index) => host.querySelector(`#comment-${index}`);
const selected = (index) => card(index).getAttribute("aria-pressed") === "true";
const foldButton = (index) => card(index).querySelector(".comment-fold-button");

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  snapshot = {
    noteId: "fold-test", noteTitle: "折叠测试", error: "",
    commentFold: { supported: true, revision: "revision-1" },
    excerpt: { present: true, type: "text", text: "原生摘录", capabilities: {} },
    comments: [
      { index: 0, type: "textComment", text: "完整正文与末尾搜索标记", collapsed: false, capabilities: { canSetCollapsed: true } },
      { index: 1, type: "markdownComment", text: "## 收敛条件\n\n**证据**与完整正文的搜索标记", collapsed: true, capabilities: { canSetCollapsed: true, isMarkdown: true } },
      { index: 2, type: "imageComment", text: "图片说明", imageBase64: "data:image/png;base64,preview", collapsed: true, capabilities: { canSetCollapsed: true, hasImage: true } },
    ],
  };
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command, payload) => {
    if (command === "getCurrentNoteComments" || command === "refreshCurrentNote") return snapshot;
    if (command === "setCommentsCollapsed") {
      snapshot = { ...snapshot, commentFold: { supported: true, revision: "revision-2" }, comments: snapshot.comments.map((comment) => payload.indices.includes(comment.index) ? { ...comment, collapsed: payload.collapsed } : comment) };
      return { snapshot, persisted: true };
    }
    return {};
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
  MNBridge.send.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllGlobals();
});

it("places disclosure before selection and shows compact Markdown and image previews", () => {
  expect(card(0).querySelector(".comment-head").firstElementChild).toBe(foldButton(0));
  expect(foldButton(0).getAttribute("aria-expanded")).toBe("true");
  expect(foldButton(1).getAttribute("aria-expanded")).toBe("false");
  expect(card(1).querySelector(".comment-fold-status").textContent).toBe("已折叠");
  expect(card(1).querySelector(".comment-fold-summary strong").textContent).toBe("证据");
  expect(card(2).querySelector(".comment-fold-thumbnail")).not.toBeNull();
  expect(host.querySelector("#native-excerpt .comment-fold-button")).toBeNull();
  expect(button("折叠所选").disabled).toBe(true);
});

it("sends the displayed revision and preserves selection while changing one comment", async () => {
  await click(card(0).querySelector("input"));
  await click(foldButton(1));
  expect(MNBridge.send).toHaveBeenCalledWith("setCommentsCollapsed", { noteId: "fold-test", indices: [1], collapsed: false, expectedRevision: "revision-1" });
  expect(selected(0)).toBe(true);
  expect(selected(1)).toBe(false);
  expect(card(1).querySelector(".markdown-content")).not.toBeNull();
  await click(foldButton(1));
  expect(MNBridge.send).toHaveBeenLastCalledWith("setCommentsCollapsed", expect.objectContaining({ expectedRevision: "revision-2", collapsed: true }));
});

it("uses the clicked selected comment state to unify a mixed selection in one write", async () => {
  for (const index of [0, 1, 2]) await click(card(index).querySelector("input"));
  expect(foldButton(1).getAttribute("aria-label")).toBe("展开所选 3 条评论（按评论 #1 切换）");
  expect(foldButton(1).title).toBe(foldButton(1).getAttribute("aria-label"));
  await click(foldButton(1));
  expect(MNBridge.send).toHaveBeenCalledTimes(1);
  expect(MNBridge.send).toHaveBeenLastCalledWith("setCommentsCollapsed", { noteId: "fold-test", indices: [0, 1, 2], collapsed: false, expectedRevision: "revision-1" });
  for (const index of [0, 1, 2]) {
    expect(foldButton(index).getAttribute("aria-expanded")).toBe("true");
    expect(selected(index)).toBe(true);
  }
  await click(foldButton(0));
  expect(MNBridge.send).toHaveBeenCalledTimes(2);
  expect(MNBridge.send).toHaveBeenLastCalledWith("setCommentsCollapsed", { noteId: "fold-test", indices: [0, 1, 2], collapsed: true, expectedRevision: "revision-2" });
  for (const index of [0, 1, 2]) {
    expect(foldButton(index).getAttribute("aria-expanded")).toBe("false");
    expect(selected(index)).toBe(true);
  }
});

it("includes hidden selected comments in disclosure toggles and preserves the excerpt selection", async () => {
  await click(host.querySelector("#native-excerpt input"));
  for (const index of [0, 1, 2]) await click(card(index).querySelector("input"));
  const input = host.querySelector("#comment-search");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "完整正文");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(card(2)).toBeNull();
  await click(foldButton(1));
  expect(MNBridge.send).toHaveBeenLastCalledWith("setCommentsCollapsed", { noteId: "fold-test", indices: [0, 1, 2], collapsed: false, expectedRevision: "revision-1" });
  expect(snapshot.comments.every((comment) => comment.collapsed === false)).toBe(true);
  expect(host.querySelector("#native-excerpt").getAttribute("aria-pressed")).toBe("true");
  await click(button("重置筛选"));
  for (const index of [0, 1, 2]) expect(selected(index)).toBe(true);
});

it("folds a mixed selection when the clicked selected comment is expanded", async () => {
  for (const index of [0, 1, 2]) await click(card(index).querySelector("input"));
  await click(foldButton(0));
  expect(MNBridge.send).toHaveBeenCalledTimes(1);
  expect(MNBridge.send).toHaveBeenLastCalledWith("setCommentsCollapsed", { noteId: "fold-test", indices: [0, 1, 2], collapsed: true, expectedRevision: "revision-1" });
  for (const index of [0, 1, 2]) {
    expect(foldButton(index).getAttribute("aria-expanded")).toBe("false");
    expect(selected(index)).toBe(true);
  }
});

it("changes only an unselected comment even when other comments are selected together", async () => {
  for (const index of [0, 2]) await click(card(index).querySelector("input"));
  expect(foldButton(1).getAttribute("aria-label")).toBe("展开评论 #1");
  await click(foldButton(1));
  expect(MNBridge.send).toHaveBeenLastCalledWith("setCommentsCollapsed", { noteId: "fold-test", indices: [1], collapsed: false, expectedRevision: "revision-1" });
  expect(snapshot.comments.map((comment) => comment.collapsed)).toEqual([false, false, true]);
  expect(selected(0)).toBe(true);
  expect(selected(2)).toBe(true);
  expect(selected(1)).toBe(false);
});

it("reveals the single comment header after layout updates without scrolling batch actions away", async () => {
  const frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback) => { frames.push(callback); return frames.length; });
  const reveal = vi.fn();
  card(1).querySelector(".comment-head").scrollIntoView = reveal;
  await click(foldButton(1));
  expect(frames).toHaveLength(1);
  await act(async () => frames.shift()());
  expect(reveal).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest" }));
  reveal.mockClear();
  await click(card(1).querySelector("input"));
  await click(button("折叠所选"));
  expect(frames).toHaveLength(0);
  expect(reveal).not.toHaveBeenCalled();
});

it("uses the shared scroll pane for the top navigation action", async () => {
  const pane = host.querySelector("#comment-pane");
  pane.scrollTop = 360;
  pane.scrollTo = vi.fn();
  await click(button("顶部"));
  expect(pane.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
});

it("folds hidden selected comments too and preserves the excerpt selection", async () => {
  await click(host.querySelector("#native-excerpt input"));
  await click(host.querySelector("#selection-actions-toggle"));
  await click(button("全选批注"));
  const input = host.querySelector("#comment-search");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "完整正文");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(card(2)).toBeNull();
  await click(button("折叠所选"));
  expect(MNBridge.send).toHaveBeenCalledWith("setCommentsCollapsed", { noteId: "fold-test", indices: [0, 1, 2], collapsed: true, expectedRevision: "revision-1" });
  expect(selected(0)).toBe(true);
  expect(host.querySelector("#native-excerpt").getAttribute("aria-pressed")).toBe("true");
  expect(card(0).querySelector(".comment-fold-summary").textContent).toContain("搜索标记");
});

it("uses the existing header selection controls and keeps batch controls outside the scroll pane", () => {
  expect(host.querySelector("#comment-pane .comment-fold-toolbar")).toBeNull();
  expect(host.querySelector(".right-pane .comment-fold-toolbar")).not.toBeNull();
  expect([...host.querySelectorAll("button")].filter((node) => node.textContent === "全选")).toHaveLength(1);
  expect(host.querySelector(".comment-fold-selection-controls")).toBeNull();
});

it("opens existing selection actions and returns keyboard focus to the fixed control", async () => {
  const trigger = host.querySelector("#selection-actions-toggle");
  await click(trigger);
  const panel = host.querySelector("#selection-actions-panel");
  expect(panel.hidden).toBe(false);
  expect(document.activeElement.getAttribute("aria-label")).toBe("关闭选区操作");
  await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(panel.hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
  expect(MNBridge.send).not.toHaveBeenCalled();
});

it("dismisses selection actions when the native card changes", async () => {
  await click(host.querySelector("#selection-actions-toggle"));
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { ...snapshot, noteId: "next-note" } }));
  expect(host.querySelector("#selection-actions-panel").hidden).toBe(true);
});

it("returns focus to the selected card when an editor opened from the menu closes", async () => {
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { ...snapshot, comments: snapshot.comments.map((comment) => ({ ...comment, capabilities: { ...comment.capabilities, canCopyText: true, canEditText: true } })) } }));
  await click(card(0).querySelector("input"));
  await click(host.querySelector("#selection-actions-toggle"));
  await click(button("编辑文本"));
  expect(host.querySelector("#selection-actions-panel").hidden).toBe(true);
  await click(button("取消"));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  expect(document.activeElement).toBe(card(0));
});

it("keeps selection keyboard events separate from the native disclosure button", async () => {
  await act(async () => foldButton(1).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => foldButton(1).dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true })));
  expect(selected(1)).toBe(false);
  expect(MNBridge.send).not.toHaveBeenCalled();
});

it("prevents embedded links in folded Markdown from navigating away", async () => {
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { ...snapshot, comments: snapshot.comments.map((comment) => comment.index === 1 ? { ...comment, text: "[链接](https://example.com)" } : comment) } }));
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => card(1).querySelector(".comment-fold-summary a").dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(selected(1)).toBe(false);
  expect(MNBridge.send).not.toHaveBeenCalled();
});

it("reads back after a failed write and clears stale indices instead of showing optimistic state", async () => {
  await click(card(0).querySelector("input"));
  MNBridge.send.mockImplementation(async (command) => {
    if (command === "setCommentsCollapsed") throw { code: "SAVE_FAILED", message: "保存失败" };
    if (command === "refreshCurrentNote") return snapshot;
    return {};
  });
  await click(button("折叠所选"));
  expect(MNBridge.send).toHaveBeenCalledWith("refreshCurrentNote");
  expect(card(0).classList.contains("comment-is-collapsed")).toBe(false);
  expect(selected(0)).toBe(false);
  expect(host.querySelector(".status-message").textContent).toContain("保存失败");
  expect(host.querySelector(".status-message").textContent).toContain("SAVE_FAILED");
});

it("invalidates fold controls and selection when both writing and readback fail", async () => {
  await click(card(0).querySelector("input"));
  MNBridge.send.mockImplementation(async (command) => {
    if (command === "setCommentsCollapsed") throw { code: "COMMENT_CHANGED", message: "批注已变化" };
    if (command === "refreshCurrentNote") throw new Error("回读失败");
    return {};
  });
  await click(button("折叠所选"));
  expect(selected(0)).toBe(false);
  expect(host.querySelector(".comment-fold-button")).toBeNull();
  expect(host.querySelector(".comment-fold-toolbar")).toBeNull();
  expect(host.querySelector(".comment-fold-unavailable").textContent).toContain("重新核实");
  expect(host.querySelector(".status-message").textContent).toContain("COMMENT_CHANGED");
  expect(MNBridge.send.mock.calls.filter(([command]) => command === "setCommentsCollapsed")).toHaveLength(1);
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot }));
  expect(foldButton(0)).not.toBeNull();
  expect(selected(0)).toBe(false);
});

it("preserves selection on repeated native pushes of the saved fold revision", async () => {
  await click(card(0).querySelector("input"));
  await click(button("折叠所选"));
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot }));
  expect(selected(0)).toBe(true);
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { ...snapshot, commentFold: { supported: true, revision: "external-change" } } }));
  expect(selected(0)).toBe(false);
});

it("ignores delayed fold responses after native focus changes to another card", async () => {
  let finish;
  const oldSnapshot = snapshot;
  MNBridge.send.mockImplementation((command) => command === "setCommentsCollapsed" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({}));
  await click(foldButton(0));
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { ...snapshot, noteId: "next-note", noteTitle: "新卡片" } }));
  await act(async () => finish({ snapshot: { ...oldSnapshot, comments: [] } }));
  expect(host.querySelector(".topbar-title").textContent).toContain("新卡片");
  expect(card(0)).not.toBeNull();
});

it("hides disclosure controls and reports unsupported hosts without enabling local-only writes", async () => {
  await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { ...snapshot, commentFold: { supported: false }, comments: snapshot.comments.map(({ collapsed, ...comment }) => ({ ...comment, capabilities: {} })) } }));
  expect(host.querySelector(".comment-fold-button")).toBeNull();
  expect(host.querySelector(".comment-fold-toolbar")).toBeNull();
  expect(host.querySelector(".comment-fold-unavailable").textContent).toContain("未提供批注折叠接口");
  expect(MNBridge.send).not.toHaveBeenCalled();
});

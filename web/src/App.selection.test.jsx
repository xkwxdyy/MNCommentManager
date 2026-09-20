// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import MNBridge from "./lib/mnBridge";

vi.mock("./lib/mnBridge", () => ({ default: { send: vi.fn() } }));

let root;
let host;
let snapshot;
const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent.trim() === text);
const selectedIds = () => [...host.querySelectorAll(".comment-card.selected")].map((node) => node.id);
const checkbox = (index) => host.querySelector(`#comment-${index} input`);
const click = async (element) => { expect(element).toBeTruthy(); await act(async () => element.click()); };
const key = async (element, keyName, options = {}) => {
  await act(async () => element.dispatchEvent(new KeyboardEvent("keydown", {
    key: keyName, bubbles: true, cancelable: true, ...options,
  })));
};

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  snapshot = {
    noteId: "selection-test", noteTitle: "范围选择测试", error: "",
    excerpt: { present: true, type: "text", text: "摘录", capabilities: {} },
    comments: ["起点", "中间链接", "中间文本", "终点"].map((text, index) => ({
      index, text, type: index === 1 ? "linkComment" : "textComment", capabilities: { canCopyText: true, canEditText: true },
    })),
  };
  MNBridge.send.mockReset();
  MNBridge.send.mockImplementation(async (command) => command === "getCurrentNoteComments" ? snapshot : {});
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
});

describe("range and insertion selection modes", () => {
  it("uses checkbox clicks as range endpoints and exits after selecting the complete range", async () => {
    await click(button("选范围"));
    await click(checkbox(0));
    expect(host.querySelector(".range-anchor")?.id).toBe("comment-0");
    expect(host.querySelector(".range-anchor-label")?.textContent).toBe("起点");
    await click(checkbox(3));
    expect(selectedIds()).toEqual(["comment-0", "comment-1", "comment-2", "comment-3"]);
    expect(button("选范围").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".selection-mode-banner")).toBeNull();
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("includes the excerpt when it is picked as the first endpoint", async () => {
    await click(button("选范围"));
    await click(host.querySelector("#native-excerpt input"));
    expect(host.querySelector(".range-anchor")?.id).toBe("native-excerpt");
    await click(checkbox(1));
    expect(selectedIds()).toEqual(["native-excerpt", "comment-0", "comment-1"]);
  });

  it("keeps zero-based endpoints correct on cards without an excerpt", async () => {
    await act(async () => window.__MNCommentManagerNativeSync({ snapshot: {
      ...snapshot, excerpt: { present: false, type: "none", capabilities: {} },
    } }));
    await click(button("选范围"));
    await click(checkbox(0));
    expect(host.querySelector("#selection-mode-description").textContent).toContain("评论 #0");
    await click(checkbox(3));
    expect(selectedIds()).toEqual(["comment-0", "comment-1", "comment-2", "comment-3"]);
  });

  it("supports reversed ranges using card keyboard activation", async () => {
    await click(button("选范围"));
    await key(host.querySelector("#comment-3"), "Enter");
    await key(host.querySelector("#comment-0"), " ");
    expect(selectedIds()).toEqual(["comment-0", "comment-1", "comment-2", "comment-3"]);
    expect(button("选范围").getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles range selection off without changing selected items", async () => {
    await click(checkbox(2));
    await click(button("选范围"));
    await click(button("选范围"));
    expect(button("选范围").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".range-anchor")).toBeNull();
    expect(selectedIds()).toEqual(["comment-2"]);
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("never enables range and insertion modes at the same time", async () => {
    await click(checkbox(0));
    await click(button("选择插入位置"));
    expect(host.querySelectorAll(".insert-target").length).toBeGreaterThan(0);
    await click(button("选范围"));
    expect(button("选择插入位置").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".insert-target")).toBeNull();
    await click(button("选择插入位置"));
    expect(button("选范围").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".range-anchor")).toBeNull();
    expect(button("选择插入位置").getAttribute("aria-pressed")).toBe("true");
    expect(selectedIds()).toEqual(["comment-0"]);
  });

  it("exits through Escape on a checkbox or the visible exit button and restores focus", async () => {
    await click(button("选范围"));
    await click(checkbox(0));
    await key(checkbox(0), "Escape");
    expect(button("选范围").getAttribute("aria-pressed")).toBe("false");
    expect(selectedIds()).toEqual(["comment-0"]);
    await click(button("选择插入位置"));
    await click(host.querySelector('[aria-label="退出插入位置选择"]'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(document.activeElement).toBe(button("选择插入位置"));
    expect(button("选择插入位置").getAttribute("aria-pressed")).toBe("false");
    expect(selectedIds()).toEqual(["comment-0"]);
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("does not take Escape from search, input methods or an open dialog", async () => {
    await click(checkbox(0));
    await click(button("选范围"));
    await key(host.querySelector("#comment-search"), "Escape");
    await key(checkbox(0), "Escape", { isComposing: true });
    await key(checkbox(0), "Escape", { keyCode: 229 });
    expect(button("选范围").getAttribute("aria-pressed")).toBe("true");
    await click(button("编辑文本"));
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await key(host.querySelector('[role="dialog"] textarea'), "Escape");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(button("选范围").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not imply cancellation of a native operation that is still running", async () => {
    await click(checkbox(0));
    await click(button("选择插入位置"));
    let finish;
    MNBridge.send.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await click(button("复制文本"));
    expect(host.querySelector('[aria-label="退出插入位置选择"]').disabled).toBe(true);
    await key(checkbox(0), "Escape");
    expect(button("选择插入位置").getAttribute("aria-pressed")).toBe("true");
    await act(async () => finish({ statusMessage: "已复制" }));
    expect(host.querySelector('[aria-label="退出插入位置选择"]').disabled).toBe(false);
    await click(host.querySelector('[aria-label="退出插入位置选择"]'));
    expect(host.querySelector(".selection-mode-banner")).toBeNull();
    expect(MNBridge.send).toHaveBeenCalledTimes(1);
    expect(MNBridge.send).toHaveBeenCalledWith("copyContentText", expect.any(Object));
  });

  it("explains filtered ranges and still selects hidden intermediate comments", async () => {
    await click([...host.querySelectorAll(".segmented button")].find((node) => node.querySelector("span").textContent === "文本"));
    await click(button("选范围"));
    expect(host.querySelector(".selection-mode-banner").textContent).toContain("被筛选隐藏");
    await click(checkbox(0));
    await click(checkbox(3));
    expect(host.querySelector(".hidden-selection-notice").textContent).toContain("1 条已选评论");
    await click(button("重置筛选"));
    expect(selectedIds()).toEqual(["comment-0", "comment-1", "comment-2", "comment-3"]);
  });

  it("ends a pending range when a toolbar selection command replaces it or Native switches cards", async () => {
    await click(button("选范围"));
    await click(checkbox(0));
    await click(button("清空"));
    expect(button("选范围").getAttribute("aria-pressed")).toBe("false");
    expect(selectedIds()).toEqual([]);
    await click(button("选范围"));
    await act(async () => window.__MNCommentManagerNativeSync({ snapshot: { ...snapshot, noteId: "new-note" } }));
    expect(host.querySelector(".selection-mode-banner")).toBeNull();
    expect(host.querySelector(".range-anchor")).toBeNull();
  });
});

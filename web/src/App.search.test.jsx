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

function searchInput() {
  return host.querySelector('[aria-label="搜索评论"]');
}

function button(text) {
  const element = [...host.querySelectorAll("button")].find((item) => item.textContent.trim() === text);
  expect(element, `button ${text}`).toBeTruthy();
  return element;
}

async function click(element) {
  await act(async () => element.click());
}

async function filterBy(label) {
  await click([...host.querySelectorAll(".segmented button")].find((item) => item.querySelector("span").textContent === label));
}

async function searchFor(value) {
  await act(async () => {
    searchInput().focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(searchInput(), value);
    searchInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function escape(options = {}) {
  await act(async () => searchInput().dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape", bubbles: true, cancelable: true, ...options,
  })));
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  snapshot = {
    noteId: "search-test", noteTitle: "搜索测试", error: "",
    excerpt: { present: true, type: "text", text: "原生摘录", capabilities: {} },
    comments: [
      { index: 1, type: "textComment", text: "阅读计划", capabilities: { canCopyText: true, canEditText: true } },
      { index: 2, type: "textComment", text: "整理笔记", capabilities: { canCopyText: true } },
      { index: 3, type: "linkComment", text: "关联卡片", capabilities: {} },
    ],
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

describe("comment search and filter recovery", () => {
  it("reports hidden selections and restores them without changing the selection", async () => {
    await click(host.querySelector('#comment-1 input[type="checkbox"]'));
    await click(host.querySelector('#comment-3 input[type="checkbox"]'));
    await filterBy("文本");
    expect(host.querySelector(".list-context-summary strong").textContent).toBe("2 / 3 条评论");
    expect(host.querySelector(".hidden-selection-notice").textContent).toContain("1 条已选评论被筛选隐藏");
    expect(host.querySelector(".hidden-selection-notice").textContent).toContain("仍会参与操作");
    expect(host.querySelector("#comment-3")).toBeNull();

    await click(button("重置筛选"));
    expect(host.querySelector(".list-context")).toBeNull();
    expect(host.querySelector('#comment-1 input').checked).toBe(true);
    expect(host.querySelector('#comment-3 input').checked).toBe(true);
    expect(document.activeElement).toBe(searchInput());
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("clears only the query with the clear button or Escape and retains focus", async () => {
    await filterBy("文本");
    host.querySelector("#comment-list").scrollTop = 240;
    await searchFor("计划");
    expect(host.querySelector("#comment-list").scrollTop).toBe(0);
    expect(host.querySelector(".list-context-summary strong").textContent).toBe("1 / 3 条评论");
    expect(host.querySelector(".list-context-summary p").textContent).toBe("文本 · 搜索「计划」");
    await click(host.querySelector('[aria-label="清空搜索"]'));
    expect(searchInput().value).toBe("");
    expect(document.activeElement).toBe(searchInput());
    expect(host.querySelector(".segmented button.active span").textContent).toBe("文本");
    expect(host.querySelectorAll(".comment-row")).toHaveLength(2);

    await searchFor("整理");
    await escape();
    expect(searchInput().value).toBe("");
    expect(host.querySelector(".segmented button.active span").textContent).toBe("文本");
    expect(document.activeElement).toBe(searchInput());
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("does not clear the query while Escape is being used by an input method", async () => {
    await searchFor("计划");
    await escape({ isComposing: true });
    expect(searchInput().value).toBe("计划");
    await escape({ keyCode: 229 });
    expect(searchInput().value).toBe("计划");
    await escape();
    expect(searchInput().value).toBe("");
  });

  it("recovers from zero results without dropping the excerpt or selected comments", async () => {
    await click(host.querySelector('#native-excerpt input'));
    await click(host.querySelector('#comment-1 input'));
    await searchFor("没有这个关键词");
    expect(host.querySelector(".list-context-summary strong").textContent).toBe("0 / 3 条评论");
    expect(host.querySelector(".empty-state").textContent).toContain("没有匹配的评论");
    expect(host.querySelector('#native-excerpt input').checked).toBe(true);
    await click(button("清除筛选"));
    expect(host.querySelectorAll(".comment-row")).toHaveLength(3);
    expect(host.querySelector('#native-excerpt input').checked).toBe(true);
    expect(host.querySelector('#comment-1 input').checked).toBe(true);
    expect(document.activeElement).toBe(searchInput());
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("refreshes the result and hidden-selection counts after Native switches cards", async () => {
    await click(host.querySelector('#comment-1 input'));
    await searchFor("整理");
    expect(host.querySelector(".hidden-selection-notice")).not.toBeNull();
    await act(async () => window.__MNCommentManagerNativeSync({ snapshot: {
      ...snapshot, noteId: "another-note", comments: [snapshot.comments[1]],
    } }));
    expect(searchInput().value).toBe("整理");
    expect(host.querySelector(".list-context-summary strong").textContent).toBe("1 / 1 条评论");
    expect(host.querySelector(".hidden-selection-notice")).toBeNull();
    expect(host.querySelector('#comment-2 input').checked).toBe(false);
    expect(MNBridge.send).not.toHaveBeenCalled();
  });
});

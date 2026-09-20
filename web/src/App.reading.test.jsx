// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import MNBridge from "./lib/mnBridge";

vi.mock("./lib/mnBridge", () => ({ default: { send: vi.fn() } }));
const longText = Array.from({ length: 24 }, (_, index) => `第 ${index + 1} 段：仔细阅读，保留问题、证据与思考的过程。`).join("\n\n");
const manyLines = Array.from({ length: 12 }, (_, index) => `项目 ${index + 1}`).join("\n");
let root;
let host;
let snapshot;
const click = async (element) => { expect(element).toBeTruthy(); await act(async () => element.click()); };
const card = (index) => host.querySelector(`#comment-${index}`);
const pre = (index) => card(index).querySelector("pre");
const toggle = (index) => card(index).querySelector(".text-preview-toggle");
const selected = (index) => card(index).getAttribute("aria-pressed") === "true";
const toolbarButton = (name) => [...host.querySelectorAll(".topbar-actions button")].find((node) => node.textContent === name);

function selectText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.getSelection().removeAllRanges();
  snapshot = {
    noteId: "reading-test", noteTitle: "阅读交互测试", error: "",
    excerpt: { present: true, type: "text", text: longText, capabilities: {} },
    comments: [
      { index: 0, type: "textComment", text: longText, capabilities: {} },
      { index: 1, type: "markdownComment", text: "## 阅读笔记\n\n一段可以选取的 Markdown 正文。", capabilities: { isMarkdown: true } },
      { index: 2, type: "textComment", text: "短文本", capabilities: {} },
      { index: 3, type: "textComment", text: manyLines, capabilities: {} },
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
  window.getSelection().removeAllRanges();
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

describe("comment reading interactions", () => {
  it("does not toggle a card when a text-selection gesture ends in its body", async () => {
    selectText(pre(0));
    await click(pre(0));
    expect(selected(0)).toBe(false);
    expect(window.getSelection().toString()).not.toBe("");
    await click(card(0).querySelector("input"));
    expect(selected(0)).toBe(true);
    selectText(pre(0));
    await click(pre(0));
    expect(selected(0)).toBe(true);
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("protects text selections in Markdown and the native excerpt too", async () => {
    const paragraph = card(1).querySelector(".markdown-content p");
    selectText(paragraph);
    await click(paragraph);
    expect(selected(1)).toBe(false);
    const excerpt = host.querySelector("#native-excerpt");
    selectText(excerpt.querySelector("pre"));
    await click(excerpt.querySelector("pre"));
    expect(excerpt.getAttribute("aria-pressed")).toBe("false");
  });

  it("still accepts normal card clicks when the text selection is elsewhere or collapsed", async () => {
    selectText(pre(0));
    await click(pre(2));
    expect(selected(2)).toBe(true);
    window.getSelection().removeAllRanges();
    await click(pre(0));
    expect(selected(0)).toBe(true);
  });

  it("does not pick range endpoints when reading text, and keeps keyboard selection working", async () => {
    await click(toolbarButton("选范围"));
    selectText(pre(0));
    await click(pre(0));
    expect(host.querySelector(".range-anchor")).toBeNull();
    window.getSelection().removeAllRanges();
    await click(pre(0));
    expect(host.querySelector(".range-anchor").id).toBe("comment-0");
    selectText(card(1).querySelector(".markdown-content p"));
    await click(card(1).querySelector(".markdown-content p"));
    expect(toolbarButton("选范围").getAttribute("aria-pressed")).toBe("true");
    await act(async () => card(2).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect([0, 1, 2].every(selected)).toBe(true);
  });

  it("expands the complete text into a labelled keyboard-focusable reading region", async () => {
    const control = toggle(0);
    await click(control);
    expect(pre(0).textContent).toBe(longText);
    expect(control.getAttribute("aria-expanded")).toBe("true");
    expect(control.getAttribute("aria-controls")).toBe(pre(0).id);
    expect(pre(0).id).not.toBe("");
    expect(pre(0).getAttribute("role")).toBe("region");
    expect(pre(0).getAttribute("aria-label")).toBe("评论 #0 全文");
    expect(pre(0).tabIndex).toBe(0);
    expect(host.querySelector("#native-excerpt pre").id).not.toBe(pre(0).id);
    expect(selected(0)).toBe(false);
    expect(MNBridge.send).not.toHaveBeenCalled();
  });

  it("offers expansion for many short lines without adding controls to short text", async () => {
    expect(manyLines.length).toBeLessThan(360);
    expect(toggle(3)).not.toBeNull();
    expect(toggle(2)).toBeNull();
    await click(toggle(3));
    expect(pre(3).textContent).toBe(manyLines);
  });

  it("resets inner scrolling on collapse and reopen without changing the selected card", async () => {
    await click(card(0).querySelector("input"));
    await click(toggle(0));
    pre(0).scrollTop = 250;
    await click(toggle(0));
    expect(pre(0).scrollTop).toBe(0);
    expect(toggle(0).getAttribute("aria-expanded")).toBe("false");
    expect(pre(0).getAttribute("tabindex")).toBeNull();
    await click(toggle(0));
    expect(pre(0).scrollTop).toBe(0);
    expect(pre(0).textContent).toBe(longText);
    expect(selected(0)).toBe(true);
  });

  it("keeps Space and arrow keys inside the reading region from toggling the parent card", async () => {
    await click(toggle(0));
    await act(async () => {
      pre(0).focus();
      pre(0).dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      pre(0).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(selected(0)).toBe(false);
    expect(document.activeElement).toBe(pre(0));
  });

  it("closes an expanded preview when Native replaces its card content", async () => {
    await click(toggle(0));
    pre(0).scrollTop = 200;
    await act(async () => window.__MNCommentManagerNativeSync({ snapshot: {
      ...snapshot, noteId: "new-reading-note", comments: [{ ...snapshot.comments[0], text: "新卡片的正文" }],
    } }));
    expect(pre(0).textContent).toBe("新卡片的正文");
    expect(toggle(0)).toBeNull();
    expect(pre(0).getAttribute("role")).toBeNull();
    expect(pre(0).scrollTop).toBe(0);
  });
});

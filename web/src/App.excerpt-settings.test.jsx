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

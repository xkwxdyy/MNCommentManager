// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HelpVideos from "./HelpVideos";
import MNBridge from "../lib/mnBridge";
import App from "../App";

vi.mock("../lib/mnBridge", () => ({ default: { send: vi.fn() } }));
let host, root;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  MNBridge.send.mockReset().mockResolvedValue({ opened: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<HelpVideos />));
  host.querySelector("details").open = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it.each([['promo', 0], ['gettingStarted', 1]])("opens %s through the native bridge", async (id, index) => {
  await act(async () => host.querySelectorAll("button")[index].click());
  expect(MNBridge.send).toHaveBeenCalledExactlyOnceWith("openHelpVideo", { id });
  expect(host.querySelector("details").open).toBe(false);
  expect(document.activeElement).toBe(host.querySelector("summary"));
});

it("disables duplicate clicks while pending, keeps errors visible, and supports retry", async () => {
  let fail;
  MNBridge.send.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; }));
  await act(async () => host.querySelector("button").click());
  expect([...host.querySelectorAll("button")].every(button => button.disabled)).toBe(true);
  expect(host.querySelector("button").classList.contains("is-opening")).toBe(true);
  expect(host.querySelector("button .help-video-trailing")?.textContent).toBe("打开中…");
  await act(async () => host.querySelectorAll("button")[1].click());
  expect(MNBridge.send).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error("test failure")));
  expect(host.querySelector("button").classList.contains("is-opening")).toBe(false);
  expect(host.querySelector('[role="alert"]').textContent).toContain("test failure");
  expect(host.querySelector("details").open).toBe(true);
  await act(async () => host.querySelector("button").click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector("details").open).toBe(false);
});

it("closes on Escape or outside pointer without a bridge request and supports ArrowDown/ArrowUp focus cycling", async () => {
  const summary = host.querySelector("summary");
  const buttons = host.querySelectorAll("button");
  await act(async () => summary.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(buttons[0]);
  await act(async () => buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(buttons[1]);
  await act(async () => buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(buttons[0]);
  await act(async () => summary.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(host.querySelector("details").open).toBe(false);
  expect(document.activeElement).toBe(summary);
  host.querySelector("details").open = true;
  await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  expect(host.querySelector("details").open).toBe(false);
  expect(MNBridge.send).not.toHaveBeenCalled();
});

it("handles a late response after unmount", async () => {
  let done;
  MNBridge.send.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  await act(async () => host.querySelector("button").click());
  await act(async () => root.render(null));
  await act(async () => done({ opened: true }));
  expect(host.children.length).toBe(0);
});

it("closes help with Escape while preserving the main panel range-selection mode", async () => {
  MNBridge.send.mockImplementation(async command => command === "getCurrentNoteComments" ? {
    noteId: "video-test", noteTitle: "视频入口测试", excerpt: { present: false },
    comments: [{ index: 0, type: "textComment", text: "测试评论", capabilities: {} }],
  } : {});
  await act(async () => root.render(<App />));
  const rangeButton = host.querySelector('[title="选择连续范围"]');
  await act(async () => rangeButton.click());
  const summary = host.querySelector(".help-videos summary");
  host.querySelector(".help-videos").open = true;
  await act(async () => summary.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(host.querySelector(".help-videos").open).toBe(false);
  expect(host.querySelector('[title="退出范围选择（Esc）"]')).toBeTruthy();
});

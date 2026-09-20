// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import CommentTypeSelector from "./CommentTypeSelector";
let root, host;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
async function mount(initial = [], disabled = false) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  function Harness() {
    const [types, setTypes] = useState(initial);
    return <><CommentTypeSelector types={types} onChange={setTypes} disabled={disabled} /><output>{JSON.stringify(types)}</output></>;
  }
  await act(async () => root.render(<Harness />));
}
const click = async (element) => { await act(async () => element.click()); };
const check = (label) => [...host.querySelectorAll("label")].find((node) => node.textContent === label).querySelector("input");
const button = (label) => [...host.querySelectorAll("button")].find((node) => node.textContent === label);
const selected = () => JSON.parse(host.querySelector("output").textContent);
it("selects plain and rich text together and prevents accidental expansion to all", async () => {
  await mount();
  await click(check("普通文本"));
  await click(check("富文本（HTML）"));
  expect(selected()).toEqual(["text", "html"]);
  await click(check("普通文本"));
  expect(selected()).toEqual(["html"]);
  expect(check("富文本（HTML）").disabled).toBe(true);
  await click(button("全部评论"));
  expect(selected()).toEqual([]);
  expect(button("全部评论").getAttribute("aria-pressed")).toBe("true");
});
it("restores multi-type workflows and selects every text format", async () => {
  await mount(["text", "html"]);
  expect(check("普通文本").checked).toBe(true);
  expect(check("富文本（HTML）").checked).toBe(true);
  await click(button("所有文本"));
  expect(selected()).toEqual(["text", "markdown", "html"]);
});
it("preserves custom types while editing known types", async () => {
  await mount(["custom", "html"]);
  await click(check("普通文本"));
  expect(selected()).toEqual(["custom", "html", "text"]);
});
it("blocks changes while busy", async () => {
  await mount(["html"], true);
  await click(button("所有文本"));
  await click(check("普通文本"));
  expect(selected()).toEqual(["html"]);
});

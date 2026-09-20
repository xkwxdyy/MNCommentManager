const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web", "src", "App.jsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "web", "src", "styles.css"), "utf8");

function matchingBrace(text, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let templateDepth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote === "`" && char === "$" && next === "{") { templateDepth += 1; depth += 1; index += 1; continue; }
      if (quote === "`" && char === "}" && templateDepth > 0) { templateDepth -= 1; depth -= 1; continue; }
      if (char === quote && templateDepth === 0) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") { depth -= 1; if (depth === 0) return index; }
  }
  throw new Error(`No matching brace for ${openIndex}`);
}

function extractConstArrow(text, name) {
  const marker = `const ${name} = `;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const arrow = text.indexOf("=>", start + marker.length);
  const open = text.indexOf("{", arrow);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 2);
}

function extractFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const open = text.indexOf("{", start);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const start = source.indexOf("function WorkflowManagerDialog");
const end = source.indexOf("\nfunction Dialog", start);
assert.ok(start >= 0 && end > start);
const workflow = source.slice(start, end);
const saveSource = extractConstArrow(workflow, "save");
const removeSource = extractConstArrow(workflow, "removeConfirmed");
const requestCloseSource = extractConstArrow(workflow, "requestWorkflowManagerClose");
const cancelCloseSource = extractConstArrow(workflow, "cancelPendingMutationClose");
const confirmCloseSource = extractConstArrow(workflow, "confirmPendingMutationClose");
const helperSource = extractFunction(source, "buildWorkflowMutationCloseConfirmation");
const clampSource = extractFunction(source, "clampText");

function makeSaveContext(send) {
  const events = [];
  const draft = {
    id: "WF-1",
    name: " My workflow ",
    scope: "both",
    steps: [{ kind: "action", actionId: "copySelectedText", options: { markdown: true } }],
  };
  const context = vm.createContext({
    Promise,
    Array,
    String,
    draft,
    catalog: [{ id: "copySelectedText", title: "复制文本", compatible: true, scope: "both" }],
    workflowMutationRef: { current: null },
    workflowMountedRef: { current: true },
    MNBridge: { send },
    actionDescriptor: (id) => ({ id, title: "复制文本", compatible: true, scope: "both" }),
    invalidSelectorMessage: () => "",
    normalizeError: (error) => String(error?.message || error),
    cloneWorkflowDraft: (value) => JSON.parse(JSON.stringify(value)),
    workflowDraftSignature: (value) => JSON.stringify(value),
    setBusy: (value) => events.push(["busy", value]),
    setWorkflowMutationKind: (value) => events.push(["kind", value]),
    setWorkflowFeedback: (value) => events.push(["feedback", value]),
    setWorkflows: (updater) => events.push(["workflows", typeof updater === "function" ? updater([]) : updater]),
    setSelectedId: (value) => events.push(["selectedId", value]),
    setDraft: (value) => events.push(["draft", value]),
    setSavedDraftSignature: (value) => events.push(["signature", value]),
    onStatus: (value) => events.push(["status", value]),
  });
  vm.runInContext(`${saveSource}\nthis.save = save;`, context, { filename: "App-workflow-save.js" });
  return { context, events, draft };
}

(async () => {
  {
    const response = deferred();
    let sends = 0;
    const { context, events } = makeSaveContext((command, payload) => {
      sends += 1;
      assert.strictEqual(command, "saveWorkflow");
      assert.deepStrictEqual(JSON.parse(JSON.stringify(payload)), {
        id: "WF-1",
        name: "My workflow",
        scope: "both",
        steps: [{ kind: "action", actionId: "copySelectedText", options: { markdown: true } }],
      });
      return response.promise;
    });
    const first = context.save();
    const second = context.save();
    assert.strictEqual(sends, 1, "same-tick save activation must send one Native mutation");
    assert.strictEqual(context.workflowMutationRef.current.kind, "save");
    response.resolve({ id: "WF-1", name: "My workflow", scope: "both", steps: [] });
    await Promise.all([first, second]);
    assert.strictEqual(context.workflowMutationRef.current, null);
    assert.deepStrictEqual(events.filter((item) => item[0] === "busy").map((item) => item[1]), [true, false]);
    assert.ok(events.some((item) => item[0] === "feedback" && item[1]?.kind === "success"));
  }

  {
    const response = deferred();
    const { context, events } = makeSaveContext(() => response.promise);
    const pending = context.save();
    response.reject(new Error("disk failed"));
    await pending;
    assert.strictEqual(context.workflowMutationRef.current, null);
    assert.ok(events.some((item) => item[0] === "feedback" && item[1]?.kind === "error" && item[1].message.includes("草稿仍保留")));
    assert.strictEqual(events.filter((item) => item[0] === "draft").length, 0, "save failure must not replace the current draft");
  }

  {
    const response = deferred();
    let sends = 0;
    const events = [];
    const context = vm.createContext({
      Promise,
      Array,
      draft: { id: "WF-9", name: "Delete me" },
      workflows: [{ id: "WF-9" }, { id: "WF-2", name: "Remaining", steps: [] }],
      workflowMutationRef: { current: null },
      workflowMountedRef: { current: true },
      deleteReturnFocusTargetRef: { current: { id: "delete-trigger" } },
      workflowManagerRef: { current: { id: "workflow-manager" } },
      MNBridge: { send: (command, payload) => { sends += 1; assert.strictEqual(command, "deleteWorkflow"); assert.deepStrictEqual(JSON.parse(JSON.stringify(payload)), { id: "WF-9" }); return response.promise; } },
      cloneWorkflowDraft: (value) => value ? JSON.parse(JSON.stringify(value)) : { id: "", name: "新工作流", scope: "both", steps: [] },
      workflowDraftSignature: (value) => JSON.stringify(value),
      normalizeError: (error) => String(error?.message || error),
      setConfirmDelete: (value) => events.push(["confirm", value]),
      setBusy: (value) => events.push(["busy", value]),
      setWorkflowMutationKind: (value) => events.push(["kind", value]),
      setWorkflowFeedback: (value) => events.push(["feedback", value]),
      setWorkflows: (value) => events.push(["workflows", value]),
      setSelectedId: (value) => events.push(["selected", value]),
      setDraft: (value) => events.push(["draft", value]),
      setSavedDraftSignature: (value) => events.push(["signature", value]),
      onStatus: (value) => events.push(["status", value]),
      restoreFocusAfterDialogClose: (...args) => events.push(["restore", ...args]),
      scheduleWorkflowManagerStartFocus: () => events.push(["scheduleFocus"]),
    });
    vm.runInContext(`${removeSource}\nthis.removeConfirmed = removeConfirmed;`, context, { filename: "App-workflow-delete.js" });
    const first = context.removeConfirmed();
    const second = context.removeConfirmed();
    assert.strictEqual(sends, 1, "same-tick delete confirmation must send one Native mutation");
    response.resolve({ workflows: [{ id: "WF-2", name: "Remaining", steps: [] }] });
    await Promise.all([first, second]);
    assert.strictEqual(context.workflowMutationRef.current, null);
    assert.ok(events.some((item) => item[0] === "feedback" && item[1]?.kind === "success"));
    assert.strictEqual(events.filter((item) => item[0] === "scheduleFocus").length, 1);
  }

  {
    const events = [];
    const context = vm.createContext({
      draft: { name: "Pending save" },
      workflowMutationRef: { current: { kind: "save" } },
      pendingMutationCloseRef: { current: null },
      workflowManagerRef: { current: { id: "manager" } },
      setPendingMutationClose: (value) => events.push(["pending", value]),
      requestWorkflowDraftTransition: (value) => events.push(["transition", value]),
      restoreFocusAfterDialogClose: (...args) => events.push(["restore", ...args]),
      closeWorkflowManager: () => events.push(["close"]),
      String,
    });
    vm.runInContext(`${clampSource}\n${helperSource}\n${requestCloseSource}\n${cancelCloseSource}\n${confirmCloseSource}\nthis.api = { requestWorkflowManagerClose, cancelPendingMutationClose, confirmPendingMutationClose };`, context, { filename: "App-workflow-pending-close.js" });
    const trigger = { id: "close" };
    context.api.requestWorkflowManagerClose({ currentTarget: trigger });
    context.api.requestWorkflowManagerClose({ currentTarget: trigger });
    assert.strictEqual(events.filter((item) => item[0] === "pending").length, 1, "pending mutation close confirmations must not stack");
    assert.strictEqual(context.pendingMutationCloseRef.current.cancelText, "继续等待");
    assert.ok(context.pendingMutationCloseRef.current.note.includes("不会自动重试"));
    context.api.cancelPendingMutationClose();
    assert.strictEqual(context.pendingMutationCloseRef.current, null);
    assert.ok(events.some((item) => item[0] === "restore" && item[1] === trigger));

    context.workflowMutationRef.current = { kind: "delete" };
    context.api.requestWorkflowManagerClose(trigger);
    context.api.confirmPendingMutationClose();
    assert.strictEqual(events.filter((item) => item[0] === "close").length, 1);
  }

  assert.strictEqual((saveSource.match(/MNBridge\.send\("saveWorkflow"/g) || []).length, 1);
  assert.strictEqual((removeSource.match(/MNBridge\.send\("deleteWorkflow"/g) || []).length, 1);
  assert.ok(saveSource.indexOf("workflowMutationRef.current = operation") < saveSource.indexOf('MNBridge.send("saveWorkflow"'), "save must lock synchronously before awaiting Native");
  assert.ok(removeSource.indexOf("workflowMutationRef.current = operation") < removeSource.indexOf('MNBridge.send("deleteWorkflow"'), "delete must lock synchronously before awaiting Native");
  assert.ok(saveSource.includes("workflowMutationRef.current === operation"));
  assert.ok(removeSource.includes("workflowMutationRef.current === operation"));
  assert.ok(!saveSource.includes("retry"));
  assert.ok(!removeSource.includes("retry"));
  assert.ok(workflow.includes('role={workflowFeedback.kind === "error" ? "alert" : "status"}'));
  assert.ok(workflow.includes('{workflowMutationKind === "save" ? "保存中…" : "保存"}'));
  assert.ok(workflow.includes('{workflowMutationKind === "delete" ? "删除中…" : "确认删除"}'));
  assert.ok(workflow.includes("<SelectorEditor selector={step.selector || {}} disabled={busy}"));
  assert.ok(workflow.includes("<ActionOptionsEditor actionId={step.actionId} options={step.options || {}} disabled={busy}"));
  assert.ok(/disabled=\{busy\}\s+onClick=\{\(event\) => selectWorkflow\(workflow, event\)\}/s.test(workflow));
  assert.ok(workflow.includes('role="alertdialog"'));
  assert.ok(workflow.includes('data-workflow-mutation-close-cancel'));
  assert.ok(source.includes("关闭后请重新打开工作流管理器核对最终结果"));
  assert.ok(styles.includes(".workflow-feedback"));
  assert.ok(styles.includes(".workflow-feedback.error"));

  console.log("workflow mutation and pending-close lifecycle regression passed");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

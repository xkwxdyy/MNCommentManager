const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web", "src", "App.jsx"), "utf8");

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const start = source.indexOf("function BatchCommentEditor");
const end = source.indexOf("\nfunction ActionButtonSettingsDialog", start);
assert.ok(start >= 0 && end > start);
const batch = source.slice(start, end);
const beginSource = extractConstArrow(batch, "beginBatchOperation");
const finishSource = extractConstArrow(batch, "finishBatchOperation");
const invalidateSource = extractConstArrow(batch, "invalidateBatchPreview");
const previewSource = extractConstArrow(batch, "previewSelection");
const executeSource = extractConstArrow(batch, "execute");

function makeContext(send) {
  const events = [];
  const context = vm.createContext({
    Promise,
    Date,
    selectorError: "",
    selector: { subject: "comments", types: ["text"], includeExcerpt: false, order: "forward" },
    action: "copySelectedText",
    destination: "comment",
    state: { token: "BATCH-1" },
    batchOperationRef: { current: null },
    previewRevisionRef: { current: 0 },
    mountedRef: { current: true },
    MNBridge: { send },
    setBusy: (value) => events.push(["busy", value]),
    setBatchOperationKind: (value) => events.push(["kind", value]),
    setPreview: (value) => events.push(["preview", value]),
    setExecutionFailure: (value) => events.push(["executionFailure", value]),
    report: (value, kind = "status") => events.push(["report", value, kind]),
    normalizeError: (error) => String(error?.message || error),
    appendRecorded: (steps) => events.push(["recorded", steps]),
    workflowStepTitle: (step) => step.actionId || step.kind,
    buildBatchExecutionFailure: () => ({ failed: true }),
  });
  vm.runInContext([
    invalidateSource,
    beginSource,
    finishSource,
    previewSource,
    executeSource,
    "this.api = { invalidateBatchPreview, beginBatchOperation, finishBatchOperation, previewSelection, execute };",
  ].join("\n"), context, { filename: "App-batch-operation-lifecycle.js" });
  return { context, events };
}

(async () => {
  {
    const response = deferred();
    let sends = 0;
    const { context, events } = makeContext(() => { sends += 1; return response.promise; });
    const first = context.api.previewSelection();
    const second = context.api.previewSelection();
    assert.strictEqual(sends, 1, "preview double activation must not create two Native requests");
    assert.strictEqual(context.batchOperationRef.current.kind, "preview");
    assert.ok(events.some((item) => item[0] === "report" && item[1].includes("等待当前批量操作")));
    response.resolve({ steps: [{ totalMatched: 4, perCard: [] }] });
    await Promise.all([first, second]);
    assert.strictEqual(context.batchOperationRef.current, null);
    assert.ok(events.some((item) => item[0] === "preview" && item[1]?.steps?.[0]?.totalMatched === 4));
    assert.deepStrictEqual(events.filter((item) => item[0] === "busy").map((item) => item[1]), [true, false]);
  }

  {
    const response = deferred();
    const { context, events } = makeContext(() => response.promise);
    const pending = context.api.previewSelection();
    context.api.invalidateBatchPreview();
    response.resolve({ steps: [{ totalMatched: 99 }] });
    await pending;
    assert.strictEqual(events.filter((item) => item[0] === "preview" && item[1]?.steps).length, 0, "a preview invalidated by changed criteria must never overwrite the current view");
    assert.strictEqual(events.filter((item) => item[0] === "report" && String(item[1]).startsWith("预览：")).length, 0);
  }

  {
    const response = deferred();
    const { context, events } = makeContext(() => response.promise);
    const pending = context.api.execute();
    context.mountedRef.current = false;
    response.resolve({ completed: true, statusMessage: "late success" });
    await pending;
    assert.strictEqual(events.filter((item) => item[0] === "recorded").length, 0, "a late execution result must not write into an unmounted recording draft");
    assert.strictEqual(events.filter((item) => item[0] === "report" && item[1] === "late success").length, 0);
    assert.strictEqual(context.batchOperationRef.current, null, "the operation identity must still be released after unmount");
  }

  {
    const response = deferred();
    let sends = 0;
    const { context, events } = makeContext(() => { sends += 1; return response.promise; });
    const preview = context.api.previewSelection();
    const execute = context.api.execute();
    assert.strictEqual(sends, 1, "preview and execution must share one synchronous operation gate");
    response.reject(new Error("preview failed"));
    await Promise.all([preview, execute]);
    assert.ok(events.some((item) => item[0] === "report" && item[1] === "preview failed" && item[2] === "error"));
  }

  assert.ok(previewSource.includes('MNBridge.send("previewBatchWorkflow", { token: state.token, workflow })'));
  assert.ok(executeSource.includes('MNBridge.send("runBatchWorkflow", { token: state.token, workflow })'));
  assert.ok(executeSource.includes("if (!mountedRef.current || batchOperationRef.current !== operation) return;"));
  assert.ok(previewSource.includes("previewRevisionRef.current !== previewRevision"));
  assert.ok(!previewSource.includes("retry"));
  assert.ok(!executeSource.includes("retry"));

  assert.ok(batch.includes("setSelectorTypes(types); invalidateBatchPreview();"), "criteria update must invalidate preview: setSelectorTypes(types); invalidateBatchPreview();");

  [
    "setPositionMode(event.target.value); invalidateBatchPreview();",
    "setPositionIndex(event.target.value); invalidateBatchPreview();",
    "setPositionStart(event.target.value); invalidateBatchPreview();",
    "setPositionEnd(event.target.value); invalidateBatchPreview();",
    "setOrder(event.target.value); invalidateBatchPreview();",
    "setMergeableOnly(event.target.checked); invalidateBatchPreview();",
    "setIncludeExcerpt(event.target.checked); invalidateBatchPreview();",
    "setAction(event.target.value); invalidateBatchPreview();",
    "setDestination(event.target.value); invalidateBatchPreview();",
  ].forEach((needle) => assert.ok(batch.includes(needle), `criteria update must invalidate preview: ${needle}`));

  assert.ok(batch.includes('{batchOperationKind === "preview" ? "预览中…" : "预览匹配"}'));
  assert.ok(batch.includes('{batchOperationKind === "execute" ? "执行中…" : "执行当前操作"}'));
  assert.ok(batch.includes('aria-busy={busy || savingRecording ? "true" : undefined}'));
  assert.ok(batch.includes('role={editorMessageKind === "error" ? "alert" : "status"}'));
  assert.ok(batch.includes('disabled={busy || savingRecording || !!selectorError}'));

  console.log("batch operation and stale-preview lifecycle regression passed");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

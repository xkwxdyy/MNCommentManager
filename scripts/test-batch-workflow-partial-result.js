const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "src", "App.jsx");
const stylesPath = path.join(__dirname, "..", "web", "src", "styles.css");
const source = fs.readFileSync(appPath, "utf8");
const styles = fs.readFileSync(stylesPath, "utf8");

function matchingBrace(text, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let templateExpressionDepth = 0;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (quote === "`" && char === "$" && next === "{") {
        templateExpressionDepth += 1;
        depth += 1;
        index += 1;
        continue;
      }
      if (quote === "`" && char === "}" && templateExpressionDepth > 0) {
        templateExpressionDepth -= 1;
        depth -= 1;
        continue;
      }
      if (char === quote && templateExpressionDepth === 0) quote = "";
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`No matching brace for index ${openIndex}`);
}

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const signatureEnd = text.indexOf(") {", start);
  assert.notStrictEqual(signatureEnd, -1, `${name} must have a function body`);
  const open = signatureEnd + 2;
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

function extractArrowValue(text, marker) {
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${marker} must exist`);
  const valueStart = start + marker.length;
  const open = text.indexOf("{", valueStart);
  assert.notStrictEqual(open, -1, `${marker} must have a body`);
  const close = matchingBrace(text, open);
  return text.slice(valueStart, close + 1);
}

const helperContext = vm.createContext({ Number, String, Array, Math });
vm.runInContext(
  `${extractFunction(source, "nonNegativeCount")}\n${extractFunction(source, "buildBatchExecutionFailure")}\nthis.buildFailure = buildBatchExecutionFailure;`,
  helperContext,
  { filename: "App-batch-failure.js" },
);
const buildFailure = helperContext.buildFailure;

const workflow = {
  steps: [
    { kind: "select", selector: { types: ["html"] } },
    { kind: "action", actionId: "convertSelectedHtmlToMarkdown" },
    { kind: "action", actionId: "deleteSelectedComments" },
  ],
};
const failureResult = {
  completed: false,
  statusMessage: "工作流已在第 2 步停止",
  failedStep: {
    index: 1,
    actionId: "convertSelectedHtmlToMarkdown",
    title: "转换选中的 HTML 评论",
    result: {
      total: 5,
      changed: 2,
      skipped: 1,
      failed: 2,
      errors: [
        { noteId: "A", message: "卡片 A 写入失败" },
        { noteId: "B", message: "卡片 B 已关闭" },
        { noteId: "C", message: "卡片 C 无权限" },
        { noteId: "D", message: "卡片 D 已变化" },
      ],
    },
  },
  stepResults: [
    { kind: "select", matched: 9 },
    { actionId: "convertSelectedHtmlToMarkdown", result: { failed: 2 } },
  ],
};
const described = buildFailure(failureResult, workflow, (step) => (
  step.kind === "select" ? "选择 HTML 评论" : `动作 ${step.actionId}`
));
const plainDescribed = JSON.parse(JSON.stringify(described));
assert.strictEqual(plainDescribed.statusMessage, failureResult.statusMessage);
assert.strictEqual(plainDescribed.failedStepNumber, 2);
assert.strictEqual(plainDescribed.totalSteps, 3);
assert.strictEqual(plainDescribed.completedSteps, 1);
assert.strictEqual(plainDescribed.failedStepTitle, "转换选中的 HTML 评论");
assert.deepStrictEqual(plainDescribed.steps.map((item) => item.status), ["completed", "failed", "pending"]);
assert.deepStrictEqual(plainDescribed.steps.map((item) => item.title), [
  "选择 HTML 评论",
  "动作 convertSelectedHtmlToMarkdown",
  "动作 deleteSelectedComments",
]);
assert.deepStrictEqual(plainDescribed.counts, [
  { key: "total", label: "涉及卡片", value: 5 },
  { key: "changed", label: "已修改", value: 2 },
  { key: "skipped", label: "已跳过", value: 1 },
  { key: "failed", label: "失败", value: 2 },
]);
assert.strictEqual(plainDescribed.errors.length, 3, "long per-card failures must be bounded in the panel");
assert.strictEqual(plainDescribed.remainingErrorCount, 1);
assert.strictEqual(plainDescribed.directError, "");

const thrown = JSON.parse(JSON.stringify(buildFailure({
  completed: false,
  failedStep: { index: 0, error: "批量上下文已关闭", result: { failed: 1, error: "批量上下文已关闭" } },
  stepResults: [{ actionId: "convertSelectedHtmlToMarkdown", result: { failed: 1 } }],
}, { steps: [{ kind: "action", actionId: "convertSelectedHtmlToMarkdown" }] }, () => "转换 HTML")));
assert.strictEqual(thrown.failedStepNumber, 1);
assert.strictEqual(thrown.completedSteps, 0);
assert.strictEqual(thrown.failedStepTitle, "转换 HTML");
assert.strictEqual(thrown.directError, "批量上下文已关闭");
assert.strictEqual(thrown.errors.length, 0);

const batchStart = source.indexOf("function BatchCommentEditor(");
const batchEnd = source.indexOf("\nfunction ActionButtonSettingsDialog(", batchStart);
assert.notStrictEqual(batchStart, -1, "BatchCommentEditor must exist");
assert.notStrictEqual(batchEnd, -1, "BatchCommentEditor boundary must exist");
const batchSource = source.slice(batchStart, batchEnd);
const executeSource = extractArrowValue(batchSource, "const execute = ");
const executeFactory = vm.runInNewContext(`
  (function (deps) {
    const {
      selectorError, report, setExecutionFailure, selector, action,
      destination, MNBridge, state, appendRecorded, buildBatchExecutionFailure,
      workflowStepTitle, normalizeError, beginBatchOperation, finishBatchOperation,
      invalidateBatchPreview, mountedRef, batchOperationRef,
    } = deps;
    return (${executeSource});
  })
`);

async function runExecute(resultOrError) {
  const events = [];
  const bridgeCalls = [];
  const batchOperationRef = { current: null };
  const deps = {
    selectorError: "",
    batchOperationRef,
    report: (message) => events.push(["report", message]),
    setExecutionFailure: (value) => events.push(["failure", value]),
    selector: { subject: "comments", types: ["html"] },
    action: "mergeSelectedComments",
    destination: "excerpt",
    MNBridge: {
      async send(command, payload) {
        bridgeCalls.push({ command, payload });
        if (resultOrError instanceof Error) throw resultOrError;
        return resultOrError;
      },
    },
    state: { token: "TOKEN-1" },
    appendRecorded: (steps) => events.push(["record", steps]),
    buildBatchExecutionFailure: (result, nextWorkflow, title) => ({ described: true, result, nextWorkflow, title: title(nextWorkflow.steps[1]) }),
    workflowStepTitle: (step) => step.kind === "select" ? "选择" : "合并",
    normalizeError: (error) => error.message || String(error),
    mountedRef: { current: true },
    invalidateBatchPreview: () => events.push(["preview-invalidated"]),
    beginBatchOperation: (kind) => {
      const operation = { kind };
      batchOperationRef.current = operation;
      events.push(["busy", true]);
      return operation;
    },
    finishBatchOperation: (operation) => {
      if (batchOperationRef.current === operation) batchOperationRef.current = null;
      events.push(["busy", false]);
    },
  };
  await executeFactory(deps)();
  return { events, bridgeCalls };
}

(async () => {
  const completed = await runExecute({ completed: true, statusMessage: "完成" });
  assert.strictEqual(completed.bridgeCalls.length, 1, "one user action must send exactly one workflow request");
  assert.strictEqual(completed.bridgeCalls[0].command, "runBatchWorkflow");
  assert.strictEqual(completed.bridgeCalls[0].payload.token, "TOKEN-1");
  assert.strictEqual(completed.bridgeCalls[0].payload.workflow.scope, "batch");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(completed.bridgeCalls[0].payload.workflow.steps[1])), {
    kind: "action",
    actionId: "mergeSelectedComments",
    options: { destination: "excerpt", markdown: true, separator: "\n\n" },
  });
  assert.strictEqual(completed.events.filter((item) => item[0] === "record").length, 1, "only completed execution may enter the recording draft");
  assert.ok(completed.events.some((item) => item[0] === "preview-invalidated"), "a new run must invalidate any stale preview");
  assert.ok(completed.events.some((item) => item[0] === "failure" && item[1] === null), "a new run must clear stale failure details");
  assert.deepStrictEqual(completed.events.at(-1), ["busy", false]);

  const partial = await runExecute(failureResult);
  assert.strictEqual(partial.events.filter((item) => item[0] === "record").length, 0, "partial execution must never enter the recording draft");
  const failureEvent = partial.events.find((item) => item[0] === "failure" && item[1]);
  assert.ok(failureEvent && failureEvent[1].described, "completed:false must create a structured result panel");
  assert.deepStrictEqual(partial.events.find((item) => item[0] === "report"), ["report", failureResult.statusMessage]);

  const cancelled = await runExecute({ cancelled: true });
  assert.strictEqual(cancelled.events.filter((item) => item[0] === "record").length, 0);
  assert.deepStrictEqual(cancelled.events.find((item) => item[0] === "report"), ["report", "已取消执行，未写入录制草稿"]);

  const rejected = await runExecute(new Error("native workflow failed"));
  assert.strictEqual(rejected.events.filter((item) => item[0] === "record").length, 0);
  assert.deepStrictEqual(rejected.events.find((item) => item[0] === "report"), ["report", "native workflow failed"]);

  assert.ok(batchSource.includes('role="alert"'), "partial failure must be announced accessibly");
  assert.ok(batchSource.includes('aria-label="本次工作流步骤状态"'), "step state list must have an accessible name");
  assert.ok(batchSource.includes('"已完成" : step.status === "failed" ? "失败" : "未执行"'), "step state must not rely on color alone");
  assert.ok(batchSource.includes("本次执行未写入录制草稿"), "partial mutation and recording boundary must be explicit");
  assert.ok(batchSource.includes("失败动作中已成功处理的卡片"), "partial changes inside the failed action must be explained");
  assert.ok(batchSource.includes("请先检查卡片内容，再决定是否重试"), "the UI must not encourage blind retry");
  assert.strictEqual((executeSource.match(/MNBridge\.send\(/g) || []).length, 1, "partial result UI must not add an automatic retry");
  assert.strictEqual((executeSource.match(/appendRecorded\(/g) || []).length, 1, "recording gate must remain a single completed-only call site");

  [
    ".batch-execution-result",
    ".batch-execution-step.completed",
    ".batch-execution-step.failed",
    ".batch-execution-step.pending",
    ".batch-execution-error",
    ".batch-execution-note",
  ].forEach((selector) => assert.ok(styles.includes(selector), `${selector} style must exist`));
  assert.ok(styles.includes("var(--accent-red)"), "failure styling must use the existing red token");
  assert.ok(styles.includes("var(--accent-green)"), "completed styling must use the existing green token");
  assert.ok(styles.includes("@media (max-width: 720px)"), "narrow-screen layout must remain explicit");

  console.log("batch workflow partial-result regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
  let templateDepth = 0;

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
        templateDepth += 1;
        depth += 1;
        index += 1;
        continue;
      }
      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        depth -= 1;
        continue;
      }
      if (char === quote && templateDepth === 0) quote = "";
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
  throw new Error(`No matching brace at ${openIndex}`);
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

const helperNames = [
  "createEmptyWorkflowDraft",
  "cloneWorkflowDraft",
  "stableWorkflowDraftValue",
  "workflowDraftSignature",
  "routeWorkflowDraftTransition",
];
const context = vm.createContext({ JSON, Object, Array, String, Number, Math });
vm.runInContext(
  `${helperNames.map((name) => extractFunction(source, name)).join("\n")}\n` +
  "this.helpers = { createEmptyWorkflowDraft, cloneWorkflowDraft, stableWorkflowDraftValue, workflowDraftSignature, routeWorkflowDraftTransition };",
  context,
  { filename: "App-workflow-unsaved-helpers.js" },
);
const {
  createEmptyWorkflowDraft,
  cloneWorkflowDraft,
  workflowDraftSignature,
  routeWorkflowDraftTransition,
} = context.helpers;

const empty = JSON.parse(JSON.stringify(createEmptyWorkflowDraft()));
assert.deepStrictEqual(empty, { id: "", name: "新工作流", scope: "both", steps: [] });
assert.deepStrictEqual(JSON.parse(JSON.stringify(cloneWorkflowDraft(null))), empty);

const saved = {
  id: "workflow-1",
  name: "清理评论",
  scope: "both",
  steps: [
    {
      kind: "select",
      selector: {
        subject: "comments",
        types: ["html", "text"],
        position: { mode: "range", start: 1, end: 3 },
      },
      selectorError: "transient validation decoration",
    },
    {
      kind: "action",
      actionId: "mergeSelectedComments",
      options: { markdown: true, separator: "\n\n", nested: { z: 2, a: 1 } },
    },
  ],
  usageCount: 4,
  lastUsedAt: 100,
  createdAt: 10,
  updatedAt: 20,
  missingActions: ["optional.patch"],
  invalidSelectors: [{ step: 0, message: "display only" }],
};
const savedSignature = workflowDraftSignature(saved);
const metadataOnly = cloneWorkflowDraft(saved);
metadataOnly.usageCount = 999;
metadataOnly.lastUsedAt = 999;
metadataOnly.updatedAt = 999;
metadataOnly.missingActions = [];
metadataOnly.invalidSelectors = [];
metadataOnly.steps[0].selectorError = "another display-only message";
metadataOnly.steps[1].options = { nested: { a: 1, z: 2 }, separator: "\n\n", markdown: true };
assert.strictEqual(
  workflowDraftSignature(metadataOnly),
  savedSignature,
  "usage metadata, validation decorations, and object key order must not create a false dirty state",
);

const implicitActionKind = cloneWorkflowDraft(saved);
delete implicitActionKind.steps[1].kind;
assert.strictEqual(
  workflowDraftSignature(implicitActionKind),
  savedSignature,
  "an action step without an explicit kind must compare as the same persisted action step",
);

for (const [label, mutate] of [
  ["name", (value) => { value.name = "清理评论（修改）"; }],
  ["scope", (value) => { value.scope = "single"; }],
  ["step order", (value) => { value.steps.reverse(); }],
  ["action id", (value) => { value.steps[1].actionId = "deleteSelectedComments"; }],
  ["action options", (value) => { value.steps[1].options.markdown = false; }],
  ["selector types", (value) => { value.steps[0].selector.types = ["html"]; }],
  ["selector position", (value) => { value.steps[0].selector.position.end = 4; }],
]) {
  const changed = cloneWorkflowDraft(saved);
  mutate(changed);
  assert.notStrictEqual(workflowDraftSignature(changed), savedSignature, `${label} must mark the draft dirty`);
}

{
  const events = [];
  const transition = { kind: "select", workflow: { id: "workflow-2" } };
  const result = routeWorkflowDraftTransition(
    false,
    transition,
    (value) => events.push(["queued", value]),
    (value) => events.push(["applied", value]),
  );
  assert.strictEqual(result, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [["applied", transition]]);
}

{
  const events = [];
  const transition = { kind: "close" };
  const result = routeWorkflowDraftTransition(
    true,
    transition,
    (value) => events.push(["queued", value]),
    (value) => events.push(["applied", value]),
  );
  assert.strictEqual(result, false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [["queued", transition]]);
}

{
  let called = false;
  assert.strictEqual(routeWorkflowDraftTransition(false, null, () => { called = true; }, () => { called = true; }), false);
  assert.strictEqual(called, false);
}

const managerStart = source.indexOf("function WorkflowManagerDialog(");
const managerEnd = source.indexOf("\nfunction Dialog(", managerStart);
assert.notStrictEqual(managerStart, -1, "WorkflowManagerDialog must exist");
assert.notStrictEqual(managerEnd, -1, "WorkflowManagerDialog boundary must exist");
const manager = source.slice(managerStart, managerEnd);

assert.ok(manager.includes("const [pendingDraftTransition, setPendingDraftTransition] = useState(null)"));
assert.ok(manager.includes("const hasUnsavedChanges = workflowDraftSignature(draft) !== savedDraftSignature"));
assert.ok(manager.includes("const pendingDraftTransitionRef = useRef(null)"), "the discard prompt needs a synchronous re-entry guard");
assert.ok(manager.includes("if (workflowMutationRef.current || busy || confirmDelete || pendingMutationCloseRef.current || pendingDraftTransitionRef.current || !transition) return"), "navigation must not stack while saving or another confirmation is open");
assert.ok(manager.includes('transition.kind === "select" && transition.workflow?.id === selectedId'), "reselecting the current workflow must not discard its draft");
assert.ok(manager.includes('kind: "select"'));
assert.ok(manager.includes('kind: "create"'));
assert.ok(manager.includes('kind: "close"'));
assert.ok(manager.includes("onClick={(event) => selectWorkflow(workflow, event)}"), "workflow switching must capture the actual trigger");
assert.ok(manager.includes("onClick={createWorkflow}"), "new workflow must use the guarded transition");
assert.ok(manager.includes("onClick={requestWorkflowManagerClose}"), "close buttons must use the guarded transition");
assert.ok(manager.includes('onClick={() => requestWorkflowManagerClose()}'), "backdrop close must use the guarded transition");
assert.strictEqual((manager.match(/onClick=\{onClose\}/g) || []).length, 0, "no visible workflow-manager close path may bypass the guard");

assert.ok(manager.includes('role="alertdialog"'));
assert.ok(manager.includes('aria-labelledby="workflow-unsaved-title"'));
assert.ok(manager.includes("放弃未保存的更改？"));
assert.ok(manager.includes("继续编辑"));
assert.ok(manager.includes("放弃并切换"));
assert.ok(manager.includes("放弃并新建"));
assert.ok(manager.includes("放弃并关闭"));
assert.ok(manager.includes("名称、支持范围、步骤和动作参数中的未保存修改都将丢失"));
assert.ok(manager.includes("当前尚未保存的修改也会一并丢失"), "the existing delete confirmation must disclose that dirty edits are discarded too");
assert.ok(!manager.includes("window.confirm"), "workflow draft protection must use the in-product dialog");
assert.ok(manager.includes("keepFocusWithinDialog(event, discardDialogRef.current)"));
assert.ok(manager.includes('event.key === "Escape"'));
assert.ok(manager.includes("restoreFocusAfterDialogClose(transition.returnFocusTarget, workflowManagerRef.current)"), "cancelled or discarded transitions must restore focus to their trigger");
assert.ok(manager.includes("pendingDraftTransitionRef.current = null"), "confirm/cancel must synchronously release the pending transition exactly once");
assert.ok(manager.includes("data-workflow-unsaved-cancel"));
assert.ok(manager.includes('aria-live="polite"'));
assert.ok(manager.includes("有未保存更改"));
assert.ok(manager.includes("新工作流尚未保存"));

assert.ok(manager.includes("setSavedDraftSignature(workflowDraftSignature(nextDraft))"), "successful save/delete must establish a new clean baseline");
assert.ok(manager.includes("setSavedDraftSignature(workflowDraftSignature(next))"), "select/create transitions must establish a new clean baseline");
const catchStart = manager.indexOf("} catch (error) {", manager.indexOf('MNBridge.send("saveWorkflow"'));
const catchEnd = manager.indexOf("} finally {", catchStart);
assert.notStrictEqual(catchStart, -1);
assert.notStrictEqual(catchEnd, -1);
assert.ok(!manager.slice(catchStart, catchEnd).includes("setSavedDraftSignature"), "save failure must leave the draft dirty");

assert.ok(manager.includes('MNBridge.send("saveWorkflow", {'));
assert.ok(manager.includes("id: draft.id || undefined"));
assert.ok(manager.includes('scope: draft.scope === "single" || draft.scope === "both" ? draft.scope : "batch"'));
assert.ok(manager.includes("steps: normalizedSteps"));
assert.ok(manager.includes('MNBridge.send("deleteWorkflow", { id: draft.id })'));
const confirmStart = manager.indexOf("const confirmPendingDraftTransition");
const confirmEnd = manager.indexOf("useEffect(() =>", confirmStart);
const confirmSource = manager.slice(confirmStart, confirmEnd);
assert.ok(confirmSource.includes("applyWorkflowDraftTransition(transition)"));
assert.ok(!confirmSource.includes("save()"));
assert.ok(!confirmSource.includes("MNBridge.send"), "discard confirmation must not auto-save, retry, or write data");

assert.ok(styles.includes(".workflow-save-state"));
assert.ok(styles.includes(".workflow-save-state.unsaved"));
assert.ok(styles.includes(".workflow-unsaved-note"));
assert.ok(styles.includes("border-left: 3px solid var(--accent-orange)"), "unsaved warning must not rely on color alone");

console.log("workflow manager unsaved draft regression passed");

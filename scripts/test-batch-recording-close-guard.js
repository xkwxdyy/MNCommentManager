const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const appPath = path.join(root, "web", "src", "App.jsx");
const cssPath = path.join(root, "web", "src", "styles.css");
const source = fs.readFileSync(appPath, "utf8");
const styles = fs.readFileSync(cssPath, "utf8");

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
  throw new Error(`No matching brace for index ${openIndex}`);
}

function extractFunctionDeclaration(text, name) {
  const marker = `function ${name}`;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const bodyMarker = text.indexOf(") {", start + marker.length);
  assert.notStrictEqual(bodyMarker, -1, `${name} must have a body`);
  const open = bodyMarker + 2;
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

function extractConstArrow(text, name) {
  const marker = `const ${name} = `;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const arrow = text.indexOf("=>", start + marker.length);
  assert.notStrictEqual(arrow, -1, `${name} must be an arrow function`);
  const open = text.indexOf("{", arrow);
  assert.notStrictEqual(open, -1, `${name} must have a block body`);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 2);
}

const stableSource = extractFunctionDeclaration(source, "stableWorkflowDraftValue");
const signatureSource = extractFunctionDeclaration(source, "batchRecordingDraftSignature");
const clampSource = extractFunctionDeclaration(source, "clampText");
const guardSource = extractFunctionDeclaration(source, "buildBatchRecordingCloseConfirmation");
const helperContext = vm.createContext({ JSON, String, Array, Object, Number, Math });
vm.runInContext(`${stableSource}\n${signatureSource}\n${clampSource}\n${guardSource}\nthis.signature = batchRecordingDraftSignature; this.guard = buildBatchRecordingCloseConfirmation;`, helperContext, {
  filename: "App-batch-recording-close-helpers.js",
});
const signature = helperContext.signature;
const guard = helperContext.guard;

const emptySignature = signature("", []);
assert.strictEqual(
  guard({ saving: false, name: "   ", steps: [], savedSignature: emptySignature, feedback: null }),
  null,
  "an empty recording session must close without a discard warning",
);

const nameOnly = guard({
  saving: false,
  name: "  Named draft  ",
  steps: [],
  savedSignature: emptySignature,
  feedback: null,
});
assert.strictEqual(nameOnly.kind, "unsaved");
assert.ok(nameOnly.description.includes("工作流名称“Named draft”"), "a typed name is user-authored draft data even before the first step");
assert.strictEqual(nameOnly.confirmText, "放弃并关闭");

const recordedSteps = [
  { kind: "select", selector: { order: "forward", types: ["text"] } },
  { kind: "action", actionId: "copyText", options: {} },
];
const unsaved = guard({
  saving: false,
  name: "Recorded draft",
  steps: recordedSteps,
  savedSignature: emptySignature,
  feedback: null,
});
assert.strictEqual(unsaved.kind, "unsaved");
assert.ok(unsaved.description.includes("2 个录制步骤"));
assert.ok(unsaved.note.includes("不会自动保存"));

const failed = guard({
  saving: false,
  name: "Recorded draft",
  steps: recordedSteps,
  savedSignature: emptySignature,
  feedback: { kind: "error", message: "native save failed" },
});
assert.strictEqual(failed.kind, "failed");
assert.strictEqual(failed.title, "放弃保存失败的录制草稿？");
assert.ok(failed.description.includes("上次保存没有成功确认"));

const pending = guard({
  saving: true,
  name: "Recorded draft",
  steps: recordedSteps,
  savedSignature: emptySignature,
  feedback: { kind: "error" },
});
assert.strictEqual(pending.kind, "saving", "an in-flight request must take precedence over stale failure feedback");
assert.strictEqual(pending.cancelText, "继续等待");
assert.strictEqual(pending.confirmText, "仍然关闭");
assert.ok(pending.description.includes("不会撤回该请求"));
assert.ok(pending.note.includes("不会自动重试"));

const savedRetainedSteps = signature("", recordedSteps);
assert.strictEqual(
  guard({ saving: false, name: "", steps: recordedSteps, savedSignature: savedRetainedSteps, feedback: null }),
  null,
  "steps retained after an explicit successful save must not be misclassified as unsaved",
);
assert.strictEqual(
  guard({
    saving: false,
    name: "",
    steps: [...recordedSteps, { kind: "action", actionId: "copyImage", options: {} }],
    savedSignature: savedRetainedSteps,
    feedback: null,
  }).kind,
  "unsaved",
  "a step recorded after the saved baseline must re-enable close protection",
);
assert.strictEqual(
  signature("Same", [{ kind: "action", options: { z: 1, a: 2 }, actionId: "copyText" }]),
  signature(" Same ", [{ actionId: "copyText", kind: "action", options: { a: 2, z: 1 } }]),
  "draft signatures must ignore object key order while preserving workflow semantics",
);

const batchStart = source.indexOf("function BatchCommentEditor");
const batchEnd = source.indexOf("\nfunction ActionButtonSettingsDialog", batchStart);
assert.notStrictEqual(batchStart, -1, "BatchCommentEditor must exist");
assert.notStrictEqual(batchEnd, -1, "BatchCommentEditor boundary must exist");
const batchSource = source.slice(batchStart, batchEnd);
const closeOnceSource = extractConstArrow(batchSource, "closeEditorOnce");
const requestSource = extractConstArrow(batchSource, "requestEditorClose");
const cancelSource = extractConstArrow(batchSource, "cancelEditorClose");
const confirmSource = extractConstArrow(batchSource, "confirmEditorClose");

function makeCloseHarness(overrides = {}) {
  const events = [];
  const closeConfirmationRef = { current: null };
  const closeRequestedRef = { current: false };
  const batchEditorRef = { current: { id: "batch-editor" } };
  const context = vm.createContext({
    busy: overrides.busy ?? false,
    batchOperationRef: { current: overrides.batchOperation ?? null },
    closeConfirmationRef,
    closeRequestedRef,
    recordingSaveRef: { current: overrides.refSaving ?? false },
    savingRecording: overrides.savingRecording ?? false,
    name: overrides.name ?? "",
    steps: overrides.steps ?? [],
    savedRecordingSignature: overrides.savedRecordingSignature ?? emptySignature,
    recordingSaveFeedback: overrides.recordingSaveFeedback ?? null,
    buildBatchRecordingCloseConfirmation: guard,
    setCloseConfirmation: (value) => events.push(["setConfirmation", value]),
    restoreFocusAfterDialogClose: (target, fallback) => events.push(["restoreFocus", target?.id || null, fallback?.id || null]),
    batchEditorRef,
    onClose: () => {
      events.push(["close"]);
      return "closed";
    },
  });
  vm.runInContext(`${closeOnceSource}\n${requestSource}\n${cancelSource}\n${confirmSource}\nthis.closeEditorOnce = closeEditorOnce; this.requestEditorClose = requestEditorClose; this.cancelEditorClose = cancelEditorClose; this.confirmEditorClose = confirmEditorClose;`, context, {
    filename: "App-batch-recording-close-actions.js",
  });
  return { events, closeConfirmationRef, closeRequestedRef, ...context };
}

{
  const harness = makeCloseHarness();
  const result = harness.requestEditorClose({ currentTarget: { id: "close-button" } });
  const duplicate = harness.requestEditorClose({ currentTarget: { id: "close-button" } });
  assert.strictEqual(result, "closed");
  assert.strictEqual(duplicate, undefined, "same-tick clean close requests must not call the parent close twice");
  assert.deepStrictEqual(harness.events, [["close"]], "a clean or empty draft must preserve the existing immediate close path exactly once");
}

{
  const harness = makeCloseHarness({ name: "Unsaved", steps: recordedSteps });
  const trigger = { id: "close-button" };
  harness.requestEditorClose({ currentTarget: trigger });
  assert.strictEqual(harness.events.filter((item) => item[0] === "close").length, 0, "an unsaved draft must not close before explicit confirmation");
  assert.strictEqual(harness.closeConfirmationRef.current.kind, "unsaved");
  assert.strictEqual(harness.closeConfirmationRef.current.returnFocusTarget, trigger);
  harness.requestEditorClose({ currentTarget: trigger });
  assert.strictEqual(harness.events.filter((item) => item[0] === "setConfirmation").length, 1, "same-tick close requests must not stack confirmation layers");
  harness.cancelEditorClose();
  assert.strictEqual(harness.closeConfirmationRef.current, null);
  assert.deepStrictEqual(harness.events[harness.events.length - 1], ["restoreFocus", "close-button", "batch-editor"]);
  assert.strictEqual(harness.events.filter((item) => item[0] === "close").length, 0);
}

{
  const harness = makeCloseHarness({ refSaving: true, name: "Pending", steps: recordedSteps });
  harness.requestEditorClose({ currentTarget: { id: "close-button" } });
  assert.strictEqual(harness.closeConfirmationRef.current.kind, "saving", "the synchronous save ref must protect the pre-render pending window");
  const result = harness.confirmEditorClose();
  assert.strictEqual(result, "closed");
  assert.strictEqual(harness.events.filter((item) => item[0] === "close").length, 1);
  assert.strictEqual(harness.closeConfirmationRef.current, null);
}

assert.ok(batchSource.includes('const [savedRecordingSignature, setSavedRecordingSignature] = useState(() => batchRecordingDraftSignature("", []))'), "the editor needs an explicit clean baseline for retained saved steps");
assert.ok(batchSource.includes('setSavedRecordingSignature(batchRecordingDraftSignature("", submittedSteps))'), "only an explicit save success may advance the clean baseline");
const catchStart = batchSource.indexOf("} catch (error) {", batchSource.indexOf("const saveRecording"));
const catchEnd = batchSource.indexOf("} finally {", catchStart);
assert.ok(catchStart > -1 && catchEnd > catchStart);
assert.ok(!batchSource.slice(catchStart, catchEnd).includes("setSavedRecordingSignature"), "save failure must leave the draft dirty");
assert.ok(batchSource.includes('saving: recordingSaveRef.current || savingRecording'), "close protection must include the synchronous pre-render pending window");
assert.ok(batchSource.includes('<Button data-batch-editor-close className="secondary" disabled={busy} onClick={requestEditorClose}>关闭</Button>'), "the only in-editor close control must route through the draft guard");
assert.ok(batchSource.includes('role="alertdialog"'), "discard and in-flight close decisions need alertdialog semantics");
assert.ok(batchSource.includes('data-batch-close-cancel'), "the safe action must be discoverable for initial focus");
assert.ok(batchSource.includes('aria-describedby="batch-recording-close-description batch-recording-close-note"'), "the risk explanation must be associated with the alert dialog");
assert.ok(batchSource.includes('if (closeConfirmationRef.current) return;\n          keepFocusWithinDialog(event, batchEditorRef.current);'), "the modal editor must trap focus without competing with its nested confirmation");
assert.ok(batchSource.includes('focusInitialDialogControl(dialogElement, recordingToggle)'), "the modal editor must move focus inside when opened");
assert.ok(batchSource.includes('if (event.key === "Escape")'), "the nested confirmation must support a non-destructive Escape path");
assert.ok(!requestSource.includes("MNBridge"), "requesting close must not save, retry, or cancel through the bridge");
assert.ok(!requestSource.includes("saveWorkflow"));
assert.ok(!confirmSource.includes("MNBridge"), "confirming close must preserve the existing parent close path without adding a second command");
assert.ok(!batchSource.includes("window.confirm"), "the close guard must use the product dialog rather than a blocking browser prompt");
assert.strictEqual((batchSource.match(/MNBridge\.send\("saveWorkflow"/g) || []).length, 1, "U-19 must not add a save or retry path");
assert.ok(styles.includes(".batch-recording-close-backdrop { z-index: 70; }"), "the nested close decision must render above the batch editor");
assert.ok(styles.includes(".batch-recording-close-dialog .batch-recording-close-note"), "the consequences need a readable, non-color-only note surface");
assert.ok(styles.includes('.batch-recording-close-dialog[data-close-kind="unsaved"]'), "unsaved discard risk needs an explicit state selector");
assert.ok(styles.includes(".batch-editor:focus-visible"), "the modal fallback target needs a visible focus indicator");

console.log("batch recording close guard regression passed");

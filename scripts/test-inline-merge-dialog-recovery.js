const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const appPath = path.join(root, "web", "src", "App.jsx");
const source = fs.readFileSync(appPath, "utf8");

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

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const markerStart = text.indexOf(marker);
  assert.notStrictEqual(markerStart, -1, `${name} must exist`);
  const asyncPrefixStart = markerStart >= 6 && text.slice(markerStart - 6, markerStart) === "async "
    ? markerStart - 6
    : markerStart;
  const signatureEnd = text.indexOf(") {", markerStart);
  assert.notStrictEqual(signatureEnd, -1, `${name} must have a function body`);
  const open = signatureEnd + 2;
  const close = matchingBrace(text, open);
  return text.slice(asyncPrefixStart, close + 1);
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

function extractArrowProperty(text, propertyMarker) {
  const propertyStart = text.indexOf(propertyMarker);
  assert.notStrictEqual(propertyStart, -1, `${propertyMarker} must exist`);
  const functionStart = propertyStart + propertyMarker.length;
  const arrow = text.indexOf("=>", functionStart);
  assert.notStrictEqual(arrow, -1, `${propertyMarker} must be an arrow function`);
  const open = text.indexOf("{", arrow);
  assert.notStrictEqual(open, -1, `${propertyMarker} must have a block body`);
  const close = matchingBrace(text, open);
  return text.slice(functionStart, close + 1);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const normalizeErrorSource = extractFunction(source, "normalizeError");
const recoverableSource = extractFunction(source, "runRecoverableDialogSubmission");
const helperContext = vm.createContext({});
vm.runInContext(
  `${normalizeErrorSource}\n${recoverableSource}\nthis.runSubmission = runRecoverableDialogSubmission;`,
  helperContext,
  { filename: "App-inline-merge-submission.js" },
);
const runSubmission = helperContext.runSubmission;

(async () => {
  {
    const deferred = createDeferred();
    const events = [];
    const drafts = {
      builderText: "Readable title",
      builderLink: "marginnote3app://note/NOTE-B",
      cookingText: "[Readable title](marginnote3app://note/NOTE-B)",
    };
    const pending = runSubmission(
      async (value) => {
        events.push({ type: "confirm", value });
        await deferred.promise;
      },
      [drafts.cookingText],
      () => events.push({ type: "success" }),
      (message) => events.push({ type: "error", message }),
    );

    await Promise.resolve();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [
      { type: "confirm", value: drafts.cookingText },
    ], "the dialog must remain available while Native is pending");
    assert.strictEqual(drafts.builderText, "Readable title", "the builder text draft must remain intact while pending");
    assert.strictEqual(drafts.builderLink, "marginnote3app://note/NOTE-B", "the builder link draft must remain intact while pending");
    deferred.resolve();
    assert.strictEqual(await pending, true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [
      { type: "confirm", value: drafts.cookingText },
      { type: "success" },
    ], "the dialog may close only after explicit success");
  }

  {
    const events = [];
    const outcome = await runSubmission(
      async () => { throw new Error("native inline merge failed"); },
      ["draft markdown"],
      () => events.push("success"),
      (message) => events.push(`error:${message}`),
    );
    assert.strictEqual(outcome, false);
    assert.deepStrictEqual(events, ["error:native inline merge failed"], "failure must stay in the recoverable dialog path");
  }

  const appStart = source.indexOf("function App()");
  const appEnd = source.indexOf("\nfunction BatchCommentEditor", appStart);
  assert.notStrictEqual(appStart, -1, "App must exist");
  assert.notStrictEqual(appEnd, -1, "App boundary must exist");
  const appSource = source.slice(appStart, appEnd);
  const openSource = extractConstArrow(appSource, "openInlineMergeDialog");
  assert.ok(openSource.startsWith("const openInlineMergeDialog = (event) =>"), "the actual trigger event must be captured synchronously");
  assert.ok(openSource.includes('pendingText: "合并中…"'), "the pending state must have a visible label");
  assert.ok(openSource.includes("returnFocusTarget: event?.currentTarget || null"), "the originating action button must be retained for focus restoration");
  assert.ok(openSource.includes('returnFocusFallback: document.getElementById("selection-summary")'), "selection summary must remain a stable fallback after the selection changes");

  const openContext = vm.createContext({
    selectedContentCount: 2,
    selectionIsContinuous: true,
    selectedComments: [
      { index: 1, type: "textComment", text: "Context" },
      { index: 2, type: "linkComment", text: "marginnote3app://note/NOTE-B" },
    ],
    canInlineMergeComment: () => true,
    getInlineMergeLinkUrl: (comment) => comment.type === "linkComment" ? comment.text : "",
    notifyStatus: () => { throw new Error("valid selection must not be rejected"); },
    setDialog: (dialog) => { openContext.dialog = dialog; },
    excerptSelected: false,
    excerpt: {},
    buildExcerptInlineMergeMaterial: () => ({}),
    buildInlineMergeMaterial: (comment, order) => ({ index: comment.index, order, kind: comment.type === "linkComment" ? "link" : "text" }),
    contentSelection: { excerptSelected: false, commentIndices: [1, 2] },
    document: { getElementById: (id) => ({ id }) },
    snapshot: { noteId: "NOTE-A" },
    runCommand: async () => {},
  });
  vm.runInContext(`${openSource}\nthis.openInlineMergeDialog = openInlineMergeDialog;`, openContext, { filename: "App-open-inline-merge.js" });
  const trigger = { id: "inline-merge-trigger", focus() {} };
  openContext.openInlineMergeDialog({ currentTarget: trigger });
  assert.strictEqual(openContext.dialog.returnFocusTarget, trigger);
  assert.strictEqual(openContext.dialog.returnFocusFallback.id, "selection-summary");
  assert.strictEqual(openContext.dialog.materials.length, 2);

  const onConfirmSource = extractArrowProperty(openSource, "onConfirm: ");
  assert.ok(onConfirmSource.includes('runCommand("mergeContentSelection"'), "the existing Native command must remain");
  assert.strictEqual((onConfirmSource.match(/runCommand\(/g) || []).length, 1, "failure recovery must not replay the write automatically");
  assert.ok(!onConfirmSource.includes("setDialog(null)"), "the parent callback must not destroy all three drafts before Native success");
  const callbackFactory = vm.runInNewContext(
    `(function (runCommand, snapshot, contentSelection, notifyStatus) { return (${onConfirmSource}); })`,
  );
  const calls = [];
  const callback = callbackFactory(
    async (...args) => calls.push(args),
    { noteId: "NOTE-A" },
    { excerptSelected: false, commentIndices: [1, 2] },
    () => {},
  );
  await callback("  [Readable title](marginnote3app://note/NOTE-B)  ");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [[
    "mergeContentSelection",
    {
      noteId: "NOTE-A",
      selection: { excerptSelected: false, commentIndices: [1, 2] },
      text: "[Readable title](marginnote3app://note/NOTE-B)",
      markdown: true,
      mode: "inline",
    },
    { message: "行内链接已合并" },
  ]], "command name, payload fields, trim behavior, mode, and success message must remain unchanged");

  const dialogSource = extractFunction(source, "InlineMergeDialog");
  assert.ok(dialogSource.includes("const [submitting, setSubmitting] = useState(false)"), "the dialog needs a local pending state before React receives global loading");
  assert.ok(dialogSource.includes("const [submissionError, setSubmissionError] = useState(\"\")"), "the dialog needs a recoverable inline error state");
  assert.ok(dialogSource.includes("const submittingRef = useRef(false)"), "same-tick duplicate submission must be blocked");
  assert.ok(dialogSource.includes("const mountedRef = useRef(true)"), "late responses must not update an intentionally closed dialog");
  assert.ok(dialogSource.includes("const closeRequestedRef = useRef(false)"), "close and focus restoration must run at most once");
  assert.ok(dialogSource.includes("const busy = loading || submitting"), "global and local pending states must both lock editing");
  assert.ok(dialogSource.includes("runRecoverableDialogSubmission("), "submission must use the established recoverable path");
  assert.strictEqual((dialogSource.match(/if \(!mountedRef\.current\) return;/g) || []).length, 2, "late success and late failure must both ignore an unmounted dialog");
  assert.ok(dialogSource.includes("focusInitialDialogControl(dialogRef.current, cookingRef.current)"), "the final content editor must remain the initial focus target");
  assert.ok(dialogSource.includes("keepFocusWithinDialog(event, dialogRef.current)"), "Tab and Shift+Tab must remain inside the dialog");
  assert.ok(dialogSource.includes("restoreFocusAfterDialogClose(dialog.returnFocusTarget, dialog.returnFocusFallback)"), "all close paths must restore focus safely");
  assert.ok(dialogSource.includes('if (event.key === "Escape") closeDialog()'), "Escape must use the guarded close path");
  assert.ok(dialogSource.includes("Promise.resolve(handleConfirm()).catch(() => {})"), "Cmd/Ctrl+Enter must share the guarded submission path");
  assert.ok(dialogSource.includes("onClick={handleConfirm}"), "the visible merge button must share the guarded submission path");
  assert.ok(!dialogSource.includes("Promise.resolve(dialog.onConfirm("), "keyboard submission must not bypass validation and duplicate-submit guards");
  assert.ok(!dialogSource.includes('onClick={() => dialog.onConfirm('), "button submission must not bypass recovery");
  assert.strictEqual((dialogSource.match(/readOnly=\{busy\}/g) || []).length, 3, "both builder fields and final content must be locked while their sent values are pending");
  assert.ok(dialogSource.includes('aria-label="显示文本"'), "the display-text builder field needs an accessible name");
  assert.ok(dialogSource.includes('aria-label="链接地址"'), "the link builder field needs an accessible name");
  assert.ok(dialogSource.includes('aria-label="最终内容"'), "the final Markdown editor needs an accessible name");
  assert.ok(dialogSource.includes("disabled={busy}"), "material controls must be disabled while pending");
  assert.ok(dialogSource.includes('aria-busy={busy ? "true" : undefined}'), "pending state must be exposed to assistive technology");
  assert.ok(dialogSource.includes('tabIndex={-1}'), "the dialog container must be a safe focus fallback");
  assert.ok(dialogSource.includes('<p className="dialog-error" role="alert">合并失败：{submissionError}</p>'), "Native failure must be visible and announced inside the dialog");
  assert.ok(dialogSource.includes('{busy ? (dialog.pendingText || "合并中…") : (dialog.confirmText || "合并")}'), "the primary action must visibly distinguish pending from ready");
  assert.strictEqual((dialogSource.match(/onClick=\{closeDialog\}/g) || []).length, 2, "backdrop and cancel must share one guarded close path");
  assert.ok(dialogSource.includes("if (!textarea || !insertText || busy) return;"), "cursor insertion must not mutate the draft while a write is pending");
  assert.ok(dialogSource.includes("if (!textarea || busy) return false;"), "selection wrapping must not mutate the draft while a write is pending");
  assert.ok(dialogSource.includes("if (!material || busy) return;"), "material actions must have a synchronous pending guard");

  console.log("inline merge dialog recovery regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

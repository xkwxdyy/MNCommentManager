const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web/src/App.jsx"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "web/src/main.jsx"), "utf8");

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

function extractConstArrow(text, name) {
  const marker = `const ${name} = `;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const open = text.indexOf("{", start + marker.length);
  assert.notStrictEqual(open, -1, `${name} must have a body`);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

const selectorStart = source.indexOf("const DIALOG_FOCUSABLE_SELECTOR = [");
assert.notStrictEqual(selectorStart, -1, "the shared dialog focus helpers must remain available");
const restoreSource = extractFunction(source, "restoreFocusAfterDialogClose");
const helperEnd = source.indexOf(restoreSource) + restoreSource.length;
const helperBundle = source.slice(selectorStart, helperEnd);

const animationFrames = [];
const helperContext = vm.createContext({
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
    return animationFrames.length;
  },
  setTimeout(callback) {
    animationFrames.push(callback);
    return animationFrames.length;
  },
});
vm.runInContext(
  `${helperBundle}\nthis.restoreFocus = restoreFocusAfterDialogClose;`,
  helperContext,
  { filename: "App-edit-dialog-focus-helpers.js" },
);
const restoreFocus = helperContext.restoreFocus;

(async () => {
  const focusLog = [];
  function makeElement(name, options = {}) {
    return {
      name,
      disabled: options.disabled === true,
      isConnected: options.isConnected !== false,
      focus() {
        focusLog.push(name);
      },
      closest() {
        return options.closest || null;
      },
    };
  }

  const exactTrigger = makeElement("edit-button");
  const fallbackCard = makeElement("comment-card");
  restoreFocus(exactTrigger, fallbackCard);
  assert.strictEqual(animationFrames.length, 1, "focus restoration must wait for the closing React commit");
  animationFrames.shift()();
  assert.deepStrictEqual(focusLog, ["edit-button"], "an available edit button must receive focus before its fallback card");

  focusLog.length = 0;
  const disabledTrigger = makeElement("disabled-edit-button", { disabled: true });
  restoreFocus(disabledTrigger, fallbackCard);
  animationFrames.shift()();
  assert.deepStrictEqual(focusLog, ["comment-card"], "a temporarily disabled process button must fall back to the edited comment card");

  focusLog.length = 0;
  const disconnectedTrigger = makeElement("removed-edit-button", { isConnected: false });
  restoreFocus(disconnectedTrigger, fallbackCard);
  animationFrames.shift()();
  assert.deepStrictEqual(focusLog, ["comment-card"], "a process button removed after selection refresh must fall back to the edited comment card");

  focusLog.length = 0;
  const closestCard = makeElement("closest-comment-card");
  const inlineTrigger = makeElement("inline-button", { disabled: true, closest: closestCard });
  restoreFocus(inlineTrigger);
  animationFrames.shift()();
  assert.deepStrictEqual(focusLog, ["closest-comment-card"], "the existing inline-link owning-card fallback must remain compatible");

  const openEditSource = extractConstArrow(source, "openEditDialog");
  assert.ok(openEditSource.startsWith("const openEditDialog = (event) =>"), "the opener must receive the exact invoking process button");
  assert.ok(openEditSource.includes('kind: "editCommentText"'), "focus behavior must be explicitly scoped to the comment-text editor");
  assert.ok(openEditSource.includes("event?.currentTarget"), "the exact trigger must be captured synchronously");
  assert.ok(openEditSource.includes("document.getElementById(`comment-${index}`)"), "the edited comment card must be retained as the refresh-safe fallback");
  assert.ok(openEditSource.includes("returnFocusTarget"), "the dialog must retain its exact trigger");
  assert.ok(openEditSource.includes("returnFocusFallback"), "the dialog must retain its edited-card fallback");

  const dialogs = [];
  const bridgeCalls = [];
  const statuses = [];
  const trigger = makeElement("process-edit-button");
  const commentCard = makeElement("comment-7");
  const fakeDocument = {
    getElementById(id) {
      return id === "comment-7" ? commentCard : null;
    },
  };
  const openEditFactory = vm.runInNewContext(
    `(function (selectedIndices, notifyStatus, commentByIndex, canComment, commentText, setDialog, snapshot, runCommand, document) { ${openEditSource}; return openEditDialog; })`,
  );
  const currentComment = { index: 7, text: "Original", capabilities: { canEditText: true, isMarkdown: true } };
  const openEdit = openEditFactory(
    [7],
    (message) => statuses.push(message),
    new Map([[7, currentComment]]),
    (comment, capability) => comment?.capabilities?.[capability] === true,
    (comment) => comment.text,
    (dialog) => dialogs.push(dialog),
    { noteId: "NOTE-1" },
    async (...args) => bridgeCalls.push(args),
    fakeDocument,
  );
  openEdit({ currentTarget: trigger });
  assert.deepStrictEqual(statuses, []);
  assert.strictEqual(dialogs.length, 1);
  assert.strictEqual(dialogs[0].kind, "editCommentText");
  assert.strictEqual(dialogs[0].returnFocusTarget, trigger, "the process button must be the primary return target");
  assert.strictEqual(dialogs[0].returnFocusFallback, commentCard, "the edited comment card must be the fallback target");
  await dialogs[0].onConfirm("Updated");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(bridgeCalls)), [[
    "editCommentText",
    { noteId: "NOTE-1", index: 7, text: "Updated", markdown: true },
    { message: "评论已更新" },
  ]], "focus management must not change the existing bridge command, payload, markdown flag, or success message");

  const processActionMarker = '{ key: "edit-text", label: "编辑文本", visible: selectedCanEditText, onClick: openEditDialog }';
  assert.ok(source.includes(processActionMarker), "the existing process action must keep using the same opener");

  const dialogSource = extractFunction(source, "TextDialog");
  assert.ok(dialogSource.includes('const focusManaged = dialog.kind === "editCommentText" || dialog.focusManaged === true'), "the ordinary comment-text editor must remain explicitly focus-managed when audited confirmations opt in");
  assert.ok(dialogSource.includes("const dialogRef = useRef(null)"), "the editor must own a stable focus boundary");
  assert.ok(dialogSource.includes("const initialFocusRef = useRef(null)"), "the comment textarea must remain the initial focus target");
  assert.ok(dialogSource.includes("const closeRequestedRef = useRef(false)"), "close and restoration must be idempotent");
  assert.ok(dialogSource.includes("const requestClose = focusManaged ? closeDialog : onClose"), "focus-managed variants must share the centralized close and restoration path");
  assert.ok(dialogSource.includes("if (focusManaged) focusInitialDialogControl(dialogRef.current, initialFocusRef.current)"), "opening the editor must explicitly prefer its textarea through the shared initial-focus helper");
  assert.ok(dialogSource.includes("focusManaged && event.key === \"Tab\""), "Tab trapping must be scoped to the edit-comment dialog");
  assert.ok(dialogSource.includes("keepFocusWithinDialog(event, dialogRef.current)"), "Tab handling must reuse the shared tested focus helper");
  assert.ok(dialogSource.includes("ref={focusManaged ? dialogRef : undefined}"), "the modal section must expose the scoped focus boundary");
  assert.ok(dialogSource.includes("tabIndex={focusManaged ? -1 : undefined}"), "the scoped dialog must remain focusable if all controls are disabled");
  assert.ok(dialogSource.includes("ref={focusManaged ? initialFocusRef : undefined}"), "the textarea must remain the editor's explicit initial target");
  assert.ok(dialogSource.includes("autoFocus"), "the existing browser autofocus hint must remain");
  assert.ok(dialogSource.includes("restoreFocusAfterDialogClose(dialog.returnFocusTarget, dialog.returnFocusFallback)"), "real close paths must restore to the process button or edited-card fallback");
  assert.strictEqual((dialogSource.match(/restoreFocusAfterDialogClose\(/g) || []).length, 1, "focus restoration must be scheduled exactly once per real close");
  assert.strictEqual((dialogSource.match(/onClose\(\);/g) || []).length, 1, "the focus-managed close callback must be centralized");
  assert.ok(dialogSource.includes('if (event.key === "Escape") requestClose()'), "Escape must use the same focus-restoring close path");
  assert.strictEqual((dialogSource.match(/onClick=\{requestClose\}/g) || []).length, 2, "backdrop and cancel must use the same close path");
  assert.ok(dialogSource.includes("setSubmitting(false);\n        requestClose();"), "successful save must close through the focus-restoring path");
  assert.ok(mainSource.includes("<React.StrictMode>"), "the regression must account for the project's development StrictMode wrapper");
  assert.ok(dialogSource.includes("mountedRef.current = true;\n    return () => {\n      mountedRef.current = false;"), "the U-03 mounted guard must recover after StrictMode's setup-cleanup-setup cycle");
  assert.ok(!dialogSource.includes("mountedRef.current = false;\n      restoreFocusAfterDialogClose"), "StrictMode effect cleanup must never steal focus while the dialog remains open");
  assert.ok(dialogSource.includes("runRecoverableDialogSubmission("), "U-03 failure recovery must remain intact");
  assert.ok(dialogSource.includes('<p className="dialog-error" role="alert">保存失败：{submissionError}</p>'), "U-03 inline failure feedback must remain intact");
  assert.ok(dialogSource.includes("readOnly={closeOnConfirmSuccess && busy}"), "the user's draft must remain visible while save is pending");

  console.log("edit dialog focus regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

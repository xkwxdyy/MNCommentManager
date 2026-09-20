const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "web/src/App.jsx");
const stylesPath = path.join(root, "web/src/styles.css");
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

function extractConstArrow(text, name) {
  const marker = `const ${name} = `;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const open = text.indexOf("{", start + marker.length);
  assert.notStrictEqual(open, -1, `${name} must have a body`);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

function makeFocusable(name, log, options = {}) {
  return {
    name,
    disabled: options.disabled === true,
    hidden: options.hidden === true,
    tabIndex: options.tabIndex ?? 0,
    focus() {
      log.push(name);
    },
    getAttribute(attribute) {
      if (attribute === "aria-hidden") return options.ariaHidden ? "true" : null;
      if (attribute === "type") return options.type || null;
      return null;
    },
  };
}

const closeHelperSource = extractFunction(source, "runCloseBeforeDialogConfirmation");
const selectorStart = source.indexOf("const DIALOG_FOCUSABLE_SELECTOR = [");
assert.notStrictEqual(selectorStart, -1, "shared dialog focus selector must exist");
const initialFocusSource = extractFunction(source, "focusInitialDialogControl");
const focusBundleEnd = source.indexOf(initialFocusSource) + initialFocusSource.length;
const focusBundle = source.slice(selectorStart, focusBundleEnd);
const helperContext = vm.createContext({});
vm.runInContext(
  `${closeHelperSource}\n${focusBundle}\nthis.closeBefore = runCloseBeforeDialogConfirmation;\nthis.focusInitial = focusInitialDialogControl;`,
  helperContext,
  { filename: "App-text-dialog-confirmation-helpers.js" },
);
const closeBefore = helperContext.closeBefore;
const focusInitial = helperContext.focusInitial;

{
  const events = [];
  const result = closeBefore(
    () => events.push("close"),
    (value, options) => {
      events.push(`confirm:${value}:${options.checked}`);
      return "result";
    },
    ["draft", { checked: true }],
  );
  assert.deepStrictEqual(events, ["close", "confirm:draft:true"], "audited confirmations must close before invoking the existing mutation callback");
  assert.strictEqual(result, "result", "the existing callback return value must be preserved");
}

{
  const events = [];
  assert.throws(
    () => closeBefore(
      () => events.push("close"),
      () => {
        events.push("confirm");
        throw new Error("native path failed");
      },
      [],
    ),
    /native path failed/,
    "synchronous callback errors must still propagate to the existing Button/execute boundary",
  );
  assert.deepStrictEqual(events, ["close", "confirm"], "an error must not reverse the pre-existing close-before-command ordering");
}

{
  const focusLog = [];
  const first = makeFocusable("cancel", focusLog);
  const second = makeFocusable("confirm", focusLog);
  const dialog = {
    tabIndex: -1,
    focus() {
      focusLog.push("dialog");
    },
    querySelectorAll() {
      return [first, second];
    },
  };
  const preferred = makeFocusable("textarea", focusLog);
  assert.strictEqual(focusInitial(dialog, preferred), true);
  assert.deepStrictEqual(focusLog, ["textarea"], "input dialogs must prefer their textarea instead of the first action button");

  focusLog.length = 0;
  assert.strictEqual(focusInitial(dialog), true);
  assert.deepStrictEqual(focusLog, ["cancel"], "confirmation-only dialogs must initially focus the first safe action, which is Cancel");

  focusLog.length = 0;
  dialog.querySelectorAll = () => [];
  assert.strictEqual(focusInitial(dialog), true);
  assert.deepStrictEqual(focusLog, ["dialog"], "a fully disabled dialog must retain focus on its modal container");
}

const dialogSource = extractFunction(source, "TextDialog");
assert.ok(dialogSource.includes("const closeBeforeConfirm = dialog.closeBeforeConfirm === true"), "close-before-command behavior must be explicit and opt-in");
assert.ok(dialogSource.includes('const focusManaged = dialog.kind === "editCommentText" || dialog.focusManaged === true'), "generic confirmations must opt into the same tested focus boundary without weakening the editor path");
assert.ok(dialogSource.includes("if (busy) return undefined"), "keyboard submission must not bypass disabled/loading confirmation buttons");
assert.ok(dialogSource.includes("runCloseBeforeDialogConfirmation(requestClose, dialog.onConfirm, [value, { checked }])"), "confirm must use the tested close-before-command helper");
assert.ok(dialogSource.includes("focusInitialDialogControl(dialogRef.current, initialFocusRef.current)"), "all opted-in dialogs must receive deterministic initial focus");
assert.ok(dialogSource.includes("focusManaged && event.key === \"Tab\""), "all opted-in dialogs must trap forward and reverse Tab navigation");
assert.ok(dialogSource.includes("keepFocusWithinDialog(event, dialogRef.current)"), "focus trapping must continue using the shared helper");
assert.ok(dialogSource.includes("restoreFocusAfterDialogClose(dialog.returnFocusTarget, dialog.returnFocusFallback)"), "cancel, Escape, backdrop, and confirm must share one restoration path");
assert.strictEqual((dialogSource.match(/onClick=\{requestClose\}/g) || []).length, 2, "backdrop and Cancel must close through the restoration path");
assert.ok(dialogSource.includes("ref={focusManaged ? dialogRef : undefined}"), "the modal section must expose the focus boundary");
assert.ok(dialogSource.includes("tabIndex={focusManaged ? -1 : undefined}"), "the modal container must remain a fallback focus target");

const confirmationCases = [
  { name: "moveSelection", fallback: "selection-summary", expected: "executeMoveSelection" },
  { name: "deleteSelection", fallback: "selection-summary", expected: "executeDeleteSelection" },
  { name: "confirmBidirectionalDelete", fallback: "selection-summary", expected: 'runCommand("deleteBidirectionalLinks"' },
  { name: "confirmSingleBidirectionalDelete", fallback: "comment-list", expected: 'runCommand("deleteBidirectionalLinks"' },
  { name: "openMergeDialog", fallback: "selection-summary", expected: 'runCommand("mergeContentSelection"' },
  { name: "openConvertHtmlToMarkdownDialog", fallback: "selection-summary", expected: 'runCommand("convertHtmlCommentsToMarkdown"' },
  { name: "openExtractDialog", fallback: "selection-summary", expected: 'runCommand("extractContentSelectionToChildNote"' },
];

for (const item of confirmationCases) {
  const functionSource = extractConstArrow(source, item.name);
  assert.ok(functionSource.includes("focusManaged: true"), `${item.name} must explicitly opt into focus management`);
  assert.ok(functionSource.includes("closeBeforeConfirm: true"), `${item.name} must explicitly preserve close-before-command semantics`);
  assert.ok(functionSource.includes("returnFocusTarget"), `${item.name} must retain its exact invoking control`);
  assert.ok(functionSource.includes(`document.getElementById("${item.fallback}")`), `${item.name} must provide its audited stable fallback region`);
  assert.ok(functionSource.includes(item.expected), `${item.name} must preserve its existing mutation path`);
  assert.ok(!functionSource.includes("setDialog(null)"), `${item.name} must not bypass the centralized focus-restoring close path`);
}

const mergeSource = extractConstArrow(source, "openMergeDialog");
assert.ok(mergeSource.startsWith("const openMergeDialog = (event) =>"), "merge must capture the exact process button");
assert.ok(mergeSource.includes('runCommand("mergeCommentsToExcerpt"'), "merge-to-excerpt behavior must remain available");
assert.ok(mergeSource.includes('runCommand("mergeContentSelection"'), "ordinary merge behavior must remain available");

const convertSource = extractConstArrow(source, "openConvertHtmlToMarkdownDialog");
assert.ok(convertSource.startsWith("const openConvertHtmlToMarkdownDialog = (event) =>"), "HTML conversion must capture the exact process button");
const extractSource = extractConstArrow(source, "openExtractDialog");
assert.ok(extractSource.startsWith("const openExtractDialog = (event) =>"), "child-note extraction must capture the exact process button");

const moveSource = extractConstArrow(source, "moveSelection");
assert.ok(moveSource.startsWith("const moveSelection = async (targetIndex, message, returnFocusTarget = null) =>"), "all move confirmation entry points must be able to retain their trigger");
const moveStepSource = extractConstArrow(source, "moveByStep");
assert.ok(moveStepSource.includes('moveSelection(first - 1, "已上移一位", returnFocusTarget)'), "step-up must forward its exact trigger");
assert.ok(moveStepSource.includes('moveSelection(last + 2, "已下移一位", returnFocusTarget)'), "step-down must forward its exact trigger");

const deletePressSource = extractConstArrow(source, "startDeletePress");
assert.ok(deletePressSource.includes("const returnFocusTarget = event.currentTarget"), "bulk long-press must capture the DOM button before the timer fires");
assert.ok(deletePressSource.includes("confirmBidirectionalDelete(returnFocusTarget)"), "bulk long-press must forward the captured button");
const deleteReleaseSource = extractConstArrow(source, "endDeletePress");
assert.ok(deleteReleaseSource.includes("deleteSelection(returnFocusTarget)"), "bulk short-press conversion confirmation must retain the same button");
const singleDeletePressSource = extractConstArrow(source, "startSingleDeletePress");
assert.ok(singleDeletePressSource.includes("confirmSingleBidirectionalDelete(commentIndex, returnFocusTarget)"), "single-comment long-press must forward the captured quick-action button");

assert.ok(source.includes('{ key: "top", label: "移到最上方", visible: canMoveSelectionToTop, onClick: (event) => moveSelection(moveState.topBoundary, "已移到最上方", event.currentTarget) }'), "top move action must forward its button");
assert.ok(source.includes('{ key: "up", label: "上移", visible: canMoveSelectionUp, onClick: (event) => moveByStep("up", event.currentTarget) }'), "step-up action must forward its button");
assert.ok(source.includes('{ key: "down", label: "下移", visible: canMoveSelectionDown, onClick: (event) => moveByStep("down", event.currentTarget) }'), "step-down action must forward its button");
assert.ok(source.includes('{ key: "bottom", label: "移到最下方", visible: canMoveSelectionToBottom, onClick: (event) => moveSelection(moveState.totalCount, "已移到最下方", event.currentTarget) }'), "bottom move action must forward its button");
assert.ok(source.includes('onClick={(event) => moveSelection(insertVirtualTarget, `已移动到评论 #${comment.index} 前`, event.currentTarget)}'), "insert-before move action must retain its dynamic button");
assert.ok(source.includes('onClick={(event) => moveSelection(moveState.totalCount, "已移动到最后", event.currentTarget)}'), "insert-at-end move action must retain its button");

const commentListStart = source.indexOf('id="comment-list"');
const commentListEnd = source.indexOf('>', commentListStart);
assert.ok(commentListStart >= 0 && source.slice(commentListStart, commentListEnd).includes('tabIndex={-1}'), "the stable comment-list fallback must be programmatically focusable");
const selectionSummaryStart = source.indexOf('id="selection-summary"');
const selectionSummaryEnd = source.indexOf('>', selectionSummaryStart);
assert.ok(selectionSummaryStart >= 0 && source.slice(selectionSummaryStart, selectionSummaryEnd).includes('tabIndex={-1}'), "the stable selection-summary fallback must be programmatically focusable");
assert.ok(styles.includes(".comment-list:focus-visible"), "comment-list fallback focus must be visibly indicated");
assert.ok(styles.includes(".selection-summary:focus-visible"), "selection-summary fallback focus must be visibly indicated");

console.log("TextDialog confirmation focus regression passed");

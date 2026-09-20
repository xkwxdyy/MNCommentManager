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
assert.notStrictEqual(selectorStart, -1, "the dialog focusable selector must exist");
const restoreSource = extractFunction(source, "restoreFocusAfterDialogClose");
const helperEnd = source.indexOf(restoreSource) + restoreSource.length;
const helperBundle = source.slice(selectorStart, helperEnd);

const animationFrames = [];
const timerCallbacks = [];
const helperContext = vm.createContext({
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
    return animationFrames.length;
  },
  setTimeout(callback) {
    timerCallbacks.push(callback);
    return timerCallbacks.length;
  },
});
vm.runInContext(
  `${helperBundle}\nthis.getFocusable = getDialogFocusableElements;\nthis.keepFocus = keepFocusWithinDialog;\nthis.restoreFocus = restoreFocusAfterDialogClose;`,
  helperContext,
  { filename: "App-markdown-link-focus-helpers.js" },
);

const getFocusable = helperContext.getFocusable;
const keepFocus = helperContext.keepFocus;
const restoreFocus = helperContext.restoreFocus;

(async () => {
const focusLog = [];
const ownerDocument = { activeElement: null };
function makeElement(name, options = {}) {
  const attributes = { ...(options.attributes || {}) };
  return {
    name,
    disabled: options.disabled === true,
    hidden: options.hidden === true,
    isConnected: options.isConnected !== false,
    tabIndex: Number.isInteger(options.tabIndex) ? options.tabIndex : 0,
    getAttribute(attribute) {
      return Object.prototype.hasOwnProperty.call(attributes, attribute) ? attributes[attribute] : null;
    },
    focus() {
      ownerDocument.activeElement = this;
      focusLog.push(name);
    },
  };
}

const first = makeElement("first");
const middle = makeElement("middle");
const last = makeElement("last");
const disabled = makeElement("disabled", { disabled: true });
const hidden = makeElement("hidden", { hidden: true });
const ariaHidden = makeElement("aria-hidden", { attributes: { "aria-hidden": "true" } });
const hiddenInput = makeElement("hidden-input", { attributes: { type: "hidden" } });
const negativeTab = makeElement("negative-tab", { tabIndex: -1 });
let candidates = [first, disabled, hidden, ariaHidden, hiddenInput, negativeTab, middle, last];
const dialogElement = {
  name: "dialog",
  ownerDocument,
  tabIndex: -1,
  querySelectorAll() {
    return candidates;
  },
  contains(element) {
    return candidates.includes(element);
  },
  focus() {
    ownerDocument.activeElement = this;
    focusLog.push("dialog");
  },
};

assert.deepStrictEqual(
  Array.from(getFocusable(dialogElement), (element) => element.name),
  ["first", "middle", "last"],
  "only enabled, visible, keyboard-focusable controls may participate in the focus loop",
);

function makeTabEvent(shiftKey = false, key = "Tab") {
  return {
    key,
    shiftKey,
    preventCount: 0,
    preventDefault() {
      this.preventCount += 1;
    },
  };
}

ownerDocument.activeElement = last;
let event = makeTabEvent(false);
assert.strictEqual(keepFocus(event, dialogElement), true, "Tab from the final control must wrap to the first control");
assert.strictEqual(ownerDocument.activeElement, first);
assert.strictEqual(event.preventCount, 1);

ownerDocument.activeElement = first;
event = makeTabEvent(true);
assert.strictEqual(keepFocus(event, dialogElement), true, "Shift+Tab from the first control must wrap to the final control");
assert.strictEqual(ownerDocument.activeElement, last);
assert.strictEqual(event.preventCount, 1);

ownerDocument.activeElement = middle;
event = makeTabEvent(false);
assert.strictEqual(keepFocus(event, dialogElement), false, "Tab inside the focus loop must keep the browser's normal order");
assert.strictEqual(ownerDocument.activeElement, middle);
assert.strictEqual(event.preventCount, 0);

const background = makeElement("background");
ownerDocument.activeElement = background;
event = makeTabEvent(false);
assert.strictEqual(keepFocus(event, dialogElement), true, "focus outside an open modal must be brought back to its first control");
assert.strictEqual(ownerDocument.activeElement, first);

ownerDocument.activeElement = background;
event = makeTabEvent(true);
assert.strictEqual(keepFocus(event, dialogElement), true, "reverse traversal from outside must return to the modal's final control");
assert.strictEqual(ownerDocument.activeElement, last);

ownerDocument.activeElement = dialogElement;
event = makeTabEvent(false);
assert.strictEqual(keepFocus(event, dialogElement), true, "a programmatically focused dialog container must enter its first control");
assert.strictEqual(ownerDocument.activeElement, first);

candidates = [];
ownerDocument.activeElement = background;
event = makeTabEvent(false);
assert.strictEqual(keepFocus(event, dialogElement), true, "a dialog without enabled controls must retain focus on its container");
assert.strictEqual(ownerDocument.activeElement, dialogElement);

candidates = [first, middle, last];
ownerDocument.activeElement = middle;
event = makeTabEvent(false, "ArrowDown");
assert.strictEqual(keepFocus(event, dialogElement), false, "non-Tab keyboard behavior must remain untouched");
assert.strictEqual(event.preventCount, 0);

focusLog.length = 0;
ownerDocument.activeElement = null;
restoreFocus(first);
assert.strictEqual(focusLog.length, 0, "focus restoration must wait until the closing commit has completed");
assert.strictEqual(animationFrames.length, 1, "requestAnimationFrame must be used when available");
animationFrames.shift()();
assert.deepStrictEqual(focusLog, ["first"]);

focusLog.length = 0;
restoreFocus(makeElement("disconnected", { isConnected: false }));
animationFrames.shift()();
assert.deepStrictEqual(focusLog, [], "a trigger removed during refresh must not receive focus");

focusLog.length = 0;
restoreFocus(makeElement("disabled-target", { disabled: true }));
animationFrames.shift()();
assert.deepStrictEqual(focusLog, [], "a disabled trigger must not receive focus");

focusLog.length = 0;
const fallbackCard = makeElement("owning-comment-card");
const disabledWithFallback = makeElement("disabled-with-fallback", { disabled: true });
disabledWithFallback.closest = (selector) => selector === ".comment-card" ? fallbackCard : null;
restoreFocus(disabledWithFallback);
animationFrames.shift()();
assert.deepStrictEqual(focusLog, ["owning-comment-card"], "a temporarily disabled trigger must return focus to its owning comment card instead of the page background");

const openDialogSource = extractConstArrow(source, "openMarkdownLinkEditDialog");
assert.ok(openDialogSource.includes("returnFocusTarget = null"), "the opener must accept the exact invoking control");
assert.ok(openDialogSource.includes("returnFocusTarget: returnFocusTarget && typeof returnFocusTarget.focus === \"function\""), "only a focusable object may be retained for restoration");

const setDialogs = [];
const bridgeCalls = [];
const openDialogFactory = vm.runInNewContext(
  `(function (setDialog, snapshot, runCommand) { ${openDialogSource}; return openMarkdownLinkEditDialog; })`,
);
const openDialog = openDialogFactory(
  (value) => setDialogs.push(value),
  { noteId: "NOTE-1" },
  async (...args) => bridgeCalls.push(args),
);
const trigger = makeElement("original-edit-button");
openDialog({ index: 7 }, { displayText: "Old", url: "marginnote3app://note/NOTE-2" }, 1, trigger);
assert.strictEqual(setDialogs.length, 1);
assert.strictEqual(setDialogs[0].returnFocusTarget, trigger, "the original edit button must remain the return target");
await setDialogs[0].onConfirm({ displayText: "New", url: "marginnote3app://note/NOTE-3" });
assert.deepStrictEqual(JSON.parse(JSON.stringify(bridgeCalls)), [[
  "editMarkdownLink",
  {
    noteId: "NOTE-1",
    commentIndex: 7,
    linkIndex: 1,
    displayText: "New",
    url: "marginnote3app://note/NOTE-3",
  },
  { message: "行内链接已更新" },
]], "focus restoration must not change the bridge command, payload, indices, or success message");

const linkListSource = extractFunction(source, "MarkdownLinkList");
const editButtonMarker = 'aria-label={`编辑行内链接：${link.displayText || link.url}`}';
const editButtonStart = linkListSource.indexOf(editButtonMarker);
assert.notStrictEqual(editButtonStart, -1, "the existing inline-link edit control must remain");
const editButtonSource = linkListSource.slice(editButtonStart, linkListSource.indexOf("</Button>", editButtonStart));
assert.strictEqual((editButtonSource.match(/event\.currentTarget/g) || []).length, 3, "Enter, Space, and click must all preserve the exact invoking edit button");
assert.ok(editButtonSource.includes("onEdit(comment, link, linkIndex, event.currentTarget)"), "the invoking control must be passed without changing the existing edit arguments");

const dialogSource = extractFunction(source, "MarkdownLinkEditDialog");
assert.ok(dialogSource.includes("const dialogRef = useRef(null)"), "the dialog must own a stable focus boundary");
assert.ok(dialogSource.includes("const initialFocusRef = useRef(null)"), "the link-text input must remain the initial focus target");
assert.ok(dialogSource.includes("const closeRequestedRef = useRef(false)"), "close and focus restoration must be idempotent");
assert.ok(dialogSource.includes("initialFocusRef.current?.focus()"), "opening must explicitly focus the link-text input");
assert.ok(dialogSource.includes("keepFocusWithinDialog(event, dialogRef.current)"), "Tab handling must use the tested focus loop");
assert.ok(dialogSource.includes('if (event.key === "Tab")'), "Tab must be handled before global dialog shortcuts");
assert.ok(dialogSource.includes("ref={dialogRef}"), "the modal section must expose the focus boundary");
assert.ok(dialogSource.includes("tabIndex={-1}"), "the modal container must remain focusable as an empty-state fallback");
assert.ok(dialogSource.includes("ref={initialFocusRef}"), "the first field must remain the explicit initial target");
assert.ok(dialogSource.includes("autoFocus"), "the existing browser autofocus hint must remain");
assert.ok(dialogSource.includes("const closeDialog = () =>"), "real close paths must share one focus-restoring function");
assert.strictEqual((dialogSource.match(/restoreFocusAfterDialogClose\(dialog\.returnFocusTarget\)/g) || []).length, 1, "focus restoration must be scheduled exactly once per real close");
assert.strictEqual((dialogSource.match(/onClose\(\);/g) || []).length, 1, "the parent close callback must be centralized");
assert.ok(dialogSource.includes('if (event.key === "Escape") closeDialog()'), "Escape close behavior must remain");
assert.strictEqual((dialogSource.match(/onClick=\{closeDialog\}/g) || []).length, 2, "backdrop and cancel must use the same focus-restoring close path");
assert.ok(dialogSource.includes("setSubmitting(false);\n        closeDialog();"), "successful save must close through the same focus-restoring path");
assert.ok(mainSource.includes("<React.StrictMode>"), "the regression must account for the project's development StrictMode wrapper");
assert.ok(dialogSource.includes("mountedRef.current = true;\n    return () => {\n      mountedRef.current = false;"), "the mounted guard must recover after StrictMode's development setup-cleanup-setup cycle");
assert.ok(!dialogSource.includes("mountedRef.current = false;\n    restoreFocusAfterDialogClose"), "development-only effect cleanup must not steal focus while the dialog remains open");
assert.ok(dialogSource.includes("runRecoverableDialogSubmission("), "U-08 failure recovery must remain intact");
assert.ok(dialogSource.includes('<p className="dialog-error" role="alert">保存失败：{submissionError}</p>'), "U-08 inline failure feedback must remain intact");

console.log("markdown link edit dialog focus regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

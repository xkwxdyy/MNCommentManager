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
  const open = text.indexOf("{", start + marker.length);
  assert.notStrictEqual(open, -1, `${name} must have a body`);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

function extractArrowProperty(text, propertyMarker) {
  const propertyStart = text.indexOf(propertyMarker);
  assert.notStrictEqual(propertyStart, -1, `${propertyMarker} must exist`);
  const functionStart = propertyStart + propertyMarker.length;
  const arrow = text.indexOf("=>", functionStart);
  assert.notStrictEqual(arrow, -1, `${propertyMarker} must be an arrow function`);
  const open = text.indexOf("{", arrow);
  const close = matchingBrace(text, open);
  return text.slice(functionStart, close + 1);
}

const normalizeErrorSource = extractFunction(source, "normalizeError");
const helperSource = extractFunction(source, "runRecoverableDialogSubmission");
const helperContext = vm.createContext({});
vm.runInContext(
  `${normalizeErrorSource}\n${helperSource}\nthis.runSubmission = runRecoverableDialogSubmission;`,
  helperContext,
  { filename: "App-markdown-link-dialog-submission.js" },
);
const runSubmission = helperContext.runSubmission;

(async () => {
  {
    const draft = { displayText: "Revised label", url: "marginnote3app://note/NOTE-2" };
    const events = [];
    let resolveCommand;
    const commandPromise = new Promise((resolve) => {
      resolveCommand = resolve;
    });
    const outcomePromise = runSubmission(
      async (value) => {
        events.push({ type: "confirm", value });
        await commandPromise;
      },
      [draft],
      () => events.push({ type: "success" }),
      (message) => events.push({ type: "error", message }),
    );

    await Promise.resolve();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [
      { type: "confirm", value: draft },
    ], "the link editor must remain mounted while Native is pending");
    resolveCommand();
    assert.strictEqual(await outcomePromise, true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [
      { type: "confirm", value: draft },
      { type: "success" },
    ], "the editor may close only after Native resolves successfully");
  }

  {
    const events = [];
    const outcome = await runSubmission(
      async () => {
        throw new Error("native inline-link edit failed");
      },
      [{ displayText: "draft label", url: "draft-url" }],
      () => events.push("success"),
      (message) => events.push(`error:${message}`),
    );
    assert.strictEqual(outcome, false);
    assert.deepStrictEqual(events, ["error:native inline-link edit failed"], "failure must remain in the dialog instead of closing it");
  }

  const openDialogSource = extractConstArrow(source, "openMarkdownLinkEditDialog");
  assert.ok(openDialogSource.includes('kind: "editMarkdownLink"'), "the dedicated dialog kind must remain");
  assert.ok(openDialogSource.includes('pendingText: "保存中…"'), "the link editor must expose a visible pending label");
  const onConfirmSource = extractArrowProperty(openDialogSource, "onConfirm: ");
  assert.ok(onConfirmSource.includes('runCommand("editMarkdownLink"'), "the existing Native command must remain");
  assert.strictEqual((onConfirmSource.match(/runCommand\(/g) || []).length, 1, "retry must remain an explicit user action, not an automatic replay");
  assert.ok(!onConfirmSource.includes("setDialog(null)"), "the callback must not destroy both field drafts before Native success");

  const callbackFactory = vm.runInNewContext(
    `(function (runCommand, snapshot, comment, linkIndex) { return (${onConfirmSource}); })`,
  );
  const calls = [];
  const callback = callbackFactory(
    async (...args) => calls.push(args),
    { noteId: "NOTE-1" },
    { index: 9 },
    2,
  );
  await callback({ displayText: "Updated label", url: "marginnote3app://note/NOTE-2" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [[
    "editMarkdownLink",
    {
      noteId: "NOTE-1",
      commentIndex: 9,
      linkIndex: 2,
      displayText: "Updated label",
      url: "marginnote3app://note/NOTE-2",
    },
    { message: "行内链接已更新" },
  ]], "command name, payload fields, indices, and success message must remain unchanged");

  const dialogSource = extractFunction(source, "MarkdownLinkEditDialog");
  assert.ok(dialogSource.includes("const [submitting, setSubmitting] = useState(false)"), "the dialog needs an immediate local pending state");
  assert.ok(dialogSource.includes("const [submissionError, setSubmissionError] = useState(\"\")"), "the dialog needs a recoverable inline error state");
  assert.ok(dialogSource.includes("const submittingRef = useRef(false)"), "same-tick double submit must be blocked");
  assert.ok(dialogSource.includes("const mountedRef = useRef(true)"), "late responses must not write into an intentionally closed dialog");
  assert.ok(dialogSource.includes("const busy = loading || submitting"), "global and local pending states must both disable submission");
  assert.ok(dialogSource.includes("runRecoverableDialogSubmission("), "the link editor must reuse the tested recoverable submission path");
  assert.strictEqual((dialogSource.match(/if \(!mountedRef\.current\) return;/g) || []).length, 2, "both late success and late failure must ignore an unmounted editor");
  assert.ok(dialogSource.includes('if (event.key === "Escape") closeDialog()'), "Escape must continue to close through the dialog's guarded close path");
  assert.strictEqual((dialogSource.match(/onClick=\{closeDialog\}/g) || []).length, 2, "backdrop and cancel must continue to close through the same guarded path");
  assert.ok(dialogSource.includes("onClose();"), "the guarded close path must still invoke the parent close callback");
  assert.ok(dialogSource.includes("Promise.resolve(handleConfirm()).catch(() => {})"), "keyboard submission must share the guarded confirm path");
  assert.ok(dialogSource.includes("onClick={handleConfirm}"), "the save button must share the guarded confirm path");
  assert.ok(!dialogSource.includes("Promise.resolve(dialog.onConfirm("), "keyboard submission must not bypass recovery and duplicate-submit guards");
  assert.ok(!dialogSource.includes('onClick={() => dialog.onConfirm('), "button submission must not bypass recovery and duplicate-submit guards");
  assert.ok(dialogSource.includes("readOnly={busy}"), "both field drafts must remain visible but immutable while the sent values are pending");
  assert.strictEqual((dialogSource.match(/readOnly=\{busy\}/g) || []).length, 2, "both link text and URL fields must be locked while pending");
  assert.ok(dialogSource.includes('aria-busy={busy ? "true" : undefined}'), "pending state must be exposed to assistive technology");
  assert.ok(dialogSource.includes('<p className="dialog-error" role="alert">保存失败：{submissionError}</p>'), "Native failure must be visible and announced inside the editor");
  assert.ok(dialogSource.includes('{busy ? (dialog.pendingText || "保存中…") : (dialog.confirmText || "保存")}'), "the save control must visibly distinguish pending from ready");
  assert.ok(dialogSource.includes("trimmedDisplayText.length > 0 && trimmedUrl.length > 0 && hasChanges && !busy"), "existing validation must remain while incorporating local pending state");
  assert.ok(dialogSource.includes('const preview = `[${trimmedDisplayText || "..."}](${trimmedUrl || "..."})`;'), "the existing Markdown preview must remain derived from the current drafts");
  assert.ok(styles.includes(".dialog .dialog-error"), "the shared inline failure treatment must remain available without a new visual contract");

  console.log("markdown link edit dialog recovery regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

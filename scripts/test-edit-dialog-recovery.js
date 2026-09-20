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

function extractArrowProperty(text, propertyMarker) {
  const propertyStart = text.indexOf(propertyMarker);
  assert.notStrictEqual(propertyStart, -1, `${propertyMarker} must exist`);
  const functionStart = propertyStart + propertyMarker.length;
  const open = text.indexOf("{", functionStart);
  const close = matchingBrace(text, open);
  return text.slice(functionStart, close + 1);
}

const normalizeErrorSource = extractFunction(source, "normalizeError");
const helperSource = extractFunction(source, "runRecoverableDialogSubmission");
const helperContext = vm.createContext({});
vm.runInContext(
  `${normalizeErrorSource}\n${helperSource}\nthis.runSubmission = runRecoverableDialogSubmission;`,
  helperContext,
  { filename: "App-dialog-submission.js" },
);
const runSubmission = helperContext.runSubmission;

(async () => {
  {
    const events = [];
    let resolveCommand;
    const commandPromise = new Promise((resolve) => {
      resolveCommand = resolve;
    });
    const outcomePromise = runSubmission(
      async (value) => {
        events.push(`confirm:${value}`);
        await commandPromise;
      },
      ["draft text"],
      () => events.push("success"),
      (message) => events.push(`error:${message}`),
    );

    await Promise.resolve();
    assert.deepStrictEqual(events, ["confirm:draft text"], "dialog must stay open while native work is pending");
    resolveCommand();
    assert.strictEqual(await outcomePromise, true);
    assert.deepStrictEqual(events, ["confirm:draft text", "success"], "success must close only after confirmation resolves");
  }

  {
    const events = [];
    const outcome = await runSubmission(
      async () => {
        throw new Error("native edit failed");
      },
      ["draft text"],
      () => events.push("success"),
      (message) => events.push(`error:${message}`),
    );
    assert.strictEqual(outcome, false);
    assert.deepStrictEqual(events, ["error:native edit failed"], "failure must report the native error without closing");
  }

  {
    const events = [];
    const outcome = await runSubmission(
      () => {
        throw "plain failure";
      },
      [],
      () => events.push("success"),
      (message) => events.push(`error:${message}`),
    );
    assert.strictEqual(outcome, false);
    assert.deepStrictEqual(events, ["error:plain failure"], "string errors must remain readable");
  }

  const openEditMarker = "const openEditDialog = (event) => {";
  const openEditStart = source.indexOf(openEditMarker);
  assert.notStrictEqual(openEditStart, -1, "openEditDialog must exist");
  const openEditBrace = source.indexOf("{", openEditStart + openEditMarker.length - 1);
  const openEditEnd = matchingBrace(source, openEditBrace);
  const openEditSource = source.slice(openEditStart, openEditEnd + 1);

  assert.ok(openEditSource.includes('pendingText: "保存中…"'), "edit dialog must expose a visible pending label");
  assert.ok(openEditSource.includes("closeOnConfirmSuccess: true"), "edit dialog must opt into close-after-success behavior");

  const onConfirmSource = extractArrowProperty(openEditSource, "onConfirm: ");
  assert.ok(onConfirmSource.includes('runCommand("editCommentText"'), "edit dialog must keep the existing command");
  assert.strictEqual((onConfirmSource.match(/runCommand\(/g) || []).length, 1, "edit retry must remain an explicit user action, not an automatic replay");
  assert.ok(!onConfirmSource.includes("setDialog(null)"), "edit callback must not destroy the draft before native success");

  const callbackFactory = vm.runInNewContext(
    `(function (runCommand, snapshot, current, index) { return (${onConfirmSource}); })`,
  );
  const calls = [];
  const callback = callbackFactory(
    async (...args) => calls.push(args),
    { noteId: "NOTE-1" },
    { capabilities: { isMarkdown: true } },
    7,
  );
  await callback("updated draft");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [[
    "editCommentText",
    { noteId: "NOTE-1", index: 7, text: "updated draft", markdown: true },
    { message: "评论已更新" },
  ]], "command name, payload and success message must remain unchanged");

  const textDialogSource = extractFunction(source, "TextDialog");
  assert.ok(textDialogSource.includes("const submittingRef = useRef(false)"), "dialog must guard same-tick duplicate submits");
  assert.ok(textDialogSource.includes("const mountedRef = useRef(true)"), "late responses must not update an intentionally closed dialog");
  assert.strictEqual((textDialogSource.match(/if \(!mountedRef\.current\) return;/g) || []).length, 2, "both late success and late failure must ignore an unmounted dialog");
  assert.ok(textDialogSource.includes('if (event.key === "Escape") requestClose()'), "existing Escape close behavior must remain available through the scoped close path");
  assert.strictEqual((textDialogSource.match(/onClick=\{requestClose\}/g) || []).length, 2, "existing backdrop and cancel close paths must remain available through the scoped close path");
  assert.ok(textDialogSource.includes("runRecoverableDialogSubmission("), "edit dialog must use the tested recovery path");
  assert.ok(textDialogSource.includes('role="alert"'), "save failure must be announced inside the dialog");
  assert.ok(textDialogSource.includes("readOnly={closeOnConfirmSuccess && busy}"), "draft input must be locked without discarding its focusable value while saving");
  assert.ok(textDialogSource.includes('aria-busy={closeOnConfirmSuccess && busy ? "true" : undefined}'), "pending state must be exposed to assistive technology");
  assert.ok(textDialogSource.includes("onClick={handleConfirm}"), "button and keyboard submission must share one guarded path");
  assert.ok(styles.includes(".dialog .dialog-error"), "inline failure message must have a visible component style");

  console.log("edit dialog recovery regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

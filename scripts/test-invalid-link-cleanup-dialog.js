const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const appPath = path.join(root, "web", "src", "App.jsx");
const stylesPath = path.join(root, "web", "src", "styles.css");
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

function extractConstArrow(text, name) {
  const marker = `const ${name} =`;
  const start = text.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} must exist`);
  const arrow = text.indexOf("=>", start);
  assert.notStrictEqual(arrow, -1, `${name} must be an arrow function`);
  const open = text.indexOf("{", arrow);
  assert.notStrictEqual(open, -1, `${name} must have a block body`);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 2);
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

const appStart = source.indexOf("function App()");
const appEnd = source.indexOf("\nfunction BatchCommentEditor", appStart);
assert.notStrictEqual(appStart, -1, "App must exist");
assert.notStrictEqual(appEnd, -1, "App boundary must exist");
const app = source.slice(appStart, appEnd);

const helperSource = [
  extractFunction(source, "normalizeError"),
  extractFunction(source, "nonNegativeCount"),
  extractFunction(source, "applyInvalidLinkCleanupForSession"),
  extractFunction(source, "summarizeInvalidLinkCleanupPreview"),
].join("\n");
const openSource = extractConstArrow(app, "openInvalidLinkCleanup");
const closeSource = extractConstArrow(app, "closeInvalidLinkCleanup");
const previewSource = extractConstArrow(app, "previewInvalidLinkCleanup");
const confirmSource = extractConstArrow(app, "confirmInvalidLinkCleanup");

function makeContext(send) {
  const context = vm.createContext({
    Array,
    Error,
    JSON,
    Math,
    Number,
    Promise,
    String,
    console,
    document: { getElementById: () => ({ id: "comment-list" }) },
  });
  context.invalidLinkCleanup = null;
  context.snapshot = { noteId: "NOTE-A" };
  context.invalidLinkCleanupSessionRef = { current: 0 };
  context.invalidLinkCleanupPreviewRef = { current: null };
  context.invalidLinkCleanupConfirmingRef = { current: false };
  context.statuses = [];
  context.restored = [];
  context.runCalls = [];
  context.setInvalidLinkCleanup = (updater) => {
    context.invalidLinkCleanup = typeof updater === "function"
      ? updater(context.invalidLinkCleanup)
      : updater;
  };
  context.notifyStatus = (message) => context.statuses.push(message);
  context.restoreFocusAfterDialogClose = (target, fallback) => context.restored.push({ target, fallback });
  context.MNBridge = { send };
  context.runCommand = async (...args) => {
    context.runCalls.push(args);
    return { snapshot: { noteId: args[1]?.noteId || "" } };
  };
  context.execute = async (callback) => {
    try {
      await callback();
    } catch (_) {
      // Matches the production helper: command paths own visible errors.
    }
  };
  vm.runInContext(
    `${helperSource}\n${openSource}\n${closeSource}\n${previewSource}\n${confirmSource}\n` +
      "this.api = { openInvalidLinkCleanup, closeInvalidLinkCleanup, previewInvalidLinkCleanup, confirmInvalidLinkCleanup, applyInvalidLinkCleanupForSession, summarizeInvalidLinkCleanupPreview };",
    context,
    { filename: "App-invalid-link-cleanup-flow.js" },
  );
  return context;
}

(async () => {
  {
    const context = makeContext(async () => ({
      signature: "[]",
      affectedCards: 0,
      removableCardLinks: 0,
      removableMarkdownLinks: 0,
      failed: 0,
      errors: [],
    }));
    const trigger = { id: "cleanup-trigger" };
    context.api.openInvalidLinkCleanup({ currentTarget: trigger });
    assert.strictEqual(context.invalidLinkCleanup.sessionId, 1);
    assert.strictEqual(context.invalidLinkCleanup.noteId, "NOTE-A", "the preview and mutation must remain bound to the card that opened the dialog");
    assert.strictEqual(context.invalidLinkCleanup.returnFocusTarget, trigger);
    assert.strictEqual(context.invalidLinkCleanup.returnFocusFallback.id, "comment-list");
    assert.strictEqual(context.invalidLinkCleanup.phase, "select");

    await context.api.previewInvalidLinkCleanup("all", 1, "NOTE-A");
    assert.strictEqual(context.invalidLinkCleanup.phase, "preview");
    assert.strictEqual(context.invalidLinkCleanup.preview.signature, "[]");
    assert.deepStrictEqual(context.statuses, ["当前卡片没有失效链接"]);
  }

  {
    const first = createDeferred();
    const second = createDeferred();
    let sends = 0;
    const context = makeContext(() => {
      sends += 1;
      return sends === 1 ? first.promise : second.promise;
    });
    context.api.openInvalidLinkCleanup({ currentTarget: { id: "trigger-1" } });
    const firstPreview = context.api.previewInvalidLinkCleanup("card", 1, "NOTE-A");
    const duplicate = context.api.previewInvalidLinkCleanup("markdown", 1, "NOTE-A");
    assert.strictEqual(sends, 1, "same-session preview activation must not create a second read request");
    await duplicate;

    context.api.closeInvalidLinkCleanup();
    context.api.openInvalidLinkCleanup({ currentTarget: { id: "trigger-2" } });
    const secondSessionId = context.invalidLinkCleanup.sessionId;
    const nextPreview = context.api.previewInvalidLinkCleanup("markdown", secondSessionId, "NOTE-A");
    assert.strictEqual(sends, 2, "a newly opened dialog session must not be blocked by the stale session's pending read");

    first.resolve({ signature: "old", removableCardLinks: 1, removableMarkdownLinks: 0, failed: 0, errors: [] });
    await firstPreview;
    assert.strictEqual(context.invalidLinkCleanup.phase, "previewing", "the stale response must not overwrite the new session");
    second.resolve({ signature: "new", removableCardLinks: 0, removableMarkdownLinks: 1, failed: 0, errors: [] });
    await nextPreview;
    assert.strictEqual(context.invalidLinkCleanup.preview.signature, "new");
    assert.strictEqual(context.invalidLinkCleanupPreviewRef.current, null, "only the active preview identity may clear the shared guard");
  }

  {
    const context = makeContext(async () => ({
      signature: "[{\"noteId\":\"NOTE-A\"}]",
      affectedCards: 1,
      removableCardLinks: 2,
      removableMarkdownLinks: 1,
      failed: 0,
      errors: [],
    }));
    context.api.openInvalidLinkCleanup({ currentTarget: { id: "trigger" } });
    await context.api.previewInvalidLinkCleanup("all", 1, "NOTE-A");
    assert.strictEqual(context.invalidLinkCleanup.phase, "preview");
    assert.strictEqual(context.statuses[0], "扫描完成：找到 3 条可清理链接");
  }

  {
    const context = makeContext(async () => ({
      signature: "[]",
      affectedCards: 0,
      removableCardLinks: 0,
      removableMarkdownLinks: 0,
      failed: 2,
      errors: [
        { index: 3, message: "database unavailable" },
        { index: 4, message: "permission denied" },
      ],
    }));
    context.api.openInvalidLinkCleanup({ currentTarget: { id: "trigger" } });
    await context.api.previewInvalidLinkCleanup("all", 1, "NOTE-A");
    assert.strictEqual(context.invalidLinkCleanup.phase, "preview");
    assert.ok(context.statuses[0].includes("无法确认"));
    assert.ok(!context.statuses[0].includes("没有失效链接"), "lookup failures must never be reported as proof that no invalid links exist");
    const summary = context.api.summarizeInvalidLinkCleanupPreview(context.invalidLinkCleanup.preview);
    assert.strictEqual(summary.removable, 0);
    assert.strictEqual(summary.failed, 2);
    assert.strictEqual(summary.errors[0].index, 3);
  }

  {
    const context = makeContext(async () => {
      throw new Error("preview timed out");
    });
    context.api.openInvalidLinkCleanup({ currentTarget: { id: "trigger" } });
    await context.api.previewInvalidLinkCleanup("markdown", 1, "NOTE-A");
    assert.strictEqual(context.invalidLinkCleanup.phase, "error");
    assert.strictEqual(context.invalidLinkCleanup.mode, "markdown");
    assert.strictEqual(context.invalidLinkCleanup.preview, null);
    assert.strictEqual(context.invalidLinkCleanup.error, "preview timed out");
    assert.ok(context.statuses[0].includes("扫描失败"));
  }

  {
    const deferred = createDeferred();
    const context = makeContext(() => deferred.promise);
    const trigger = { id: "trigger" };
    context.api.openInvalidLinkCleanup({ currentTarget: trigger });
    const pending = context.api.previewInvalidLinkCleanup("card", 1, "NOTE-A");
    assert.strictEqual(context.invalidLinkCleanup.phase, "previewing");
    context.api.closeInvalidLinkCleanup();
    assert.strictEqual(context.invalidLinkCleanup, null);
    assert.strictEqual(context.invalidLinkCleanupSessionRef.current, 2, "closing must invalidate the in-flight preview before it can update state");
    deferred.resolve({
      signature: "[]",
      affectedCards: 0,
      removableCardLinks: 0,
      removableMarkdownLinks: 0,
      failed: 0,
      errors: [],
    });
    await pending;
    assert.strictEqual(context.invalidLinkCleanup, null, "a late preview response must not reopen a closed dialog");
    assert.deepStrictEqual(context.statuses, [], "a stale response must not overwrite the current status");
  }

  {
    const context = makeContext(async () => ({ removableCardLinks: 1 }));
    context.api.openInvalidLinkCleanup({ currentTarget: { id: "trigger" } });
    await context.api.previewInvalidLinkCleanup("card", 1, "NOTE-A");
    assert.strictEqual(context.invalidLinkCleanup.phase, "error", "a preview without the Native signature must not enable cleanup");
    assert.ok(context.invalidLinkCleanup.error.includes("校验信息"));
  }

  {
    const context = makeContext(async () => {
      throw new Error("the reset path must not call Native");
    });
    context.api.openInvalidLinkCleanup({ currentTarget: { id: "trigger" } });
    context.invalidLinkCleanup = {
      ...context.invalidLinkCleanup,
      mode: "all",
      preview: { signature: "[]" },
      phase: "preview",
      error: "old",
    };
    await context.api.previewInvalidLinkCleanup("", 1, "NOTE-A");
    assert.strictEqual(context.invalidLinkCleanup.phase, "select");
    assert.strictEqual(context.invalidLinkCleanup.mode, "");
    assert.strictEqual(context.invalidLinkCleanup.preview, null);
    assert.strictEqual(context.invalidLinkCleanup.error, "");
  }

  {
    const deferred = createDeferred();
    const context = makeContext(async () => ({}));
    const target = { id: "cleanup-trigger" };
    context.invalidLinkCleanupSessionRef.current = 7;
    context.invalidLinkCleanup = {
      sessionId: 7,
      noteId: "NOTE-ORIGINAL",
      mode: "all",
      preview: { signature: "signature-7" },
      phase: "preview",
      returnFocusTarget: target,
      returnFocusFallback: { id: "comment-list" },
    };
    context.runCommand = async (...args) => {
      context.runCalls.push(args);
      await deferred.promise;
      return {};
    };

    const first = context.api.confirmInvalidLinkCleanup();
    const second = context.api.confirmInvalidLinkCleanup();
    await Promise.resolve();
    assert.strictEqual(context.invalidLinkCleanup, null, "the dialog must still close before the existing mutation starts");
    assert.strictEqual(context.runCalls.length, 1, "same-tick confirmation must never duplicate the mutation");
    assert.strictEqual(context.runCalls[0][0], "clearInvalidLinks");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(context.runCalls[0][1])), {
      noteId: "NOTE-ORIGINAL",
      mode: "all",
      expectedSignature: "signature-7",
    });
    assert.deepStrictEqual(context.restored, [], "focus should be restored only after loading has ended");
    deferred.resolve();
    await Promise.all([first, second]);
    assert.strictEqual(context.invalidLinkCleanupConfirmingRef.current, false);
    assert.strictEqual(context.restored.length, 1);
    assert.strictEqual(context.restored[0].target, target);
    assert.strictEqual(context.restored[0].fallback.id, "comment-list");
  }

  {
    const context = makeContext(async () => ({}));
    context.invalidLinkCleanupSessionRef.current = 1;
    context.invalidLinkCleanup = {
      sessionId: 1,
      noteId: "NOTE-A",
      mode: "card",
      preview: {},
      phase: "preview",
      returnFocusTarget: { id: "trigger" },
    };
    await context.api.confirmInvalidLinkCleanup();
    assert.strictEqual(context.runCalls.length, 0, "cleanup must not run without the exact preview signature");
    assert.strictEqual(context.invalidLinkCleanup.phase, "error");
    assert.ok(context.statuses[0].includes("校验信息"));
  }

  assert.ok(openSource.startsWith("const openInvalidLinkCleanup = (event) =>"));
  assert.ok(openSource.includes("event?.currentTarget || null"));
  assert.ok(openSource.includes('document.getElementById("comment-list")'));
  assert.ok(openSource.indexOf("event?.currentTarget") < openSource.indexOf("setInvalidLinkCleanup"), "the real trigger must be captured synchronously");
  assert.ok(closeSource.indexOf("invalidLinkCleanupSessionRef.current += 1") < closeSource.indexOf("setInvalidLinkCleanup(null)"), "close must invalidate before unmounting");
  assert.strictEqual((previewSource.match(/MNBridge\.send\("previewInvalidLinkCleanup"/g) || []).length, 1);
  assert.ok(previewSource.includes('MNBridge.send("previewInvalidLinkCleanup", { noteId, mode })'));
  assert.ok(!previewSource.includes("setLoading(true)"), "the read-only preview must use its own state so stale sessions cannot release another request's global loading state");
  assert.ok(previewSource.includes("invalidLinkCleanupSessionRef.current !== sessionId"));
  assert.ok(previewSource.includes("invalidLinkCleanupPreviewRef.current?.sessionId === sessionId"));
  assert.ok(previewSource.includes("invalidLinkCleanupPreviewRef.current === previewOperation"));
  assert.ok(previewSource.includes('typeof preview.signature !== "string"'));
  assert.strictEqual((confirmSource.match(/runCommand\("clearInvalidLinks"/g) || []).length, 1);
  assert.ok(confirmSource.includes("expectedSignature: signature"));
  assert.ok(confirmSource.includes("noteId: current.noteId"));
  assert.ok(confirmSource.includes("invalidLinkCleanupConfirmingRef.current"));
  assert.ok(confirmSource.indexOf("setInvalidLinkCleanup(null)") < confirmSource.indexOf('runCommand("clearInvalidLinks"'), "the existing close-before-mutation sequence must remain intact");
  assert.ok(!confirmSource.includes("previewInvalidLinkCleanup"), "a failed mutation must not automatically rescan or retry");

  const dialogStart = source.indexOf("function InvalidLinkCleanupDialog(");
  const dialogEnd = source.indexOf("\nfunction MarkdownLinkList(", dialogStart);
  assert.notStrictEqual(dialogStart, -1);
  assert.notStrictEqual(dialogEnd, -1);
  const dialog = source.slice(dialogStart, dialogEnd);
  assert.ok(dialog.includes("const dialogRef = useRef(null)"));
  assert.ok(dialog.includes("keepFocusWithinDialog(event, dialogRef.current)"));
  assert.ok(dialog.includes('if (event.key === "Escape")'));
  assert.ok(dialog.includes("restoreFocusAfterDialogClose(returnFocusTarget, returnFocusFallback)"));
  assert.ok(dialog.includes('aria-busy={busy ? "true" : undefined}'));
  assert.ok(dialog.includes('role="alert"'));
  assert.ok(dialog.includes("重试扫描"));
  assert.ok(dialog.includes("迟到结果不会再写入界面"));
  assert.ok(dialog.includes("这些链接不会被清理"));
  assert.ok(dialog.includes("summary.removable <= 0"));
  assert.ok(dialog.includes("!preview?.signature"), "the dangerous action must remain disabled without a preview signature");
  assert.ok(!dialog.includes("window.confirm"));
  assert.ok(!dialog.includes("AbortController"), "closing a read-only request must not pretend to cancel the Native operation");

  assert.ok(app.includes("onChoose={(mode) => previewInvalidLinkCleanup(mode, invalidLinkCleanup.sessionId, invalidLinkCleanup.noteId)}"));
  assert.ok(app.includes("returnFocusTarget={invalidLinkCleanup.returnFocusTarget}"));
  assert.ok(app.includes("returnFocusFallback={invalidLinkCleanup.returnFocusFallback}"));
  assert.ok(app.includes("onClose={closeInvalidLinkCleanup}"));
  assert.ok(app.includes('<Button className="secondary wide" disabled={loading || !snapshot.noteId} onClick={openInvalidLinkCleanup}>'));

  assert.ok(styles.includes(".invalid-link-cleanup-dialog"));
  assert.ok(styles.includes(".dialog .invalid-link-cleanup-status.loading"));
  assert.ok(styles.includes(".dialog .invalid-link-cleanup-status.warning"));
  assert.ok(styles.includes(".dialog .invalid-link-cleanup-status.error"));
  assert.ok(styles.includes(".invalid-link-cleanup-errors"));
  assert.ok(styles.includes(".invalid-link-cleanup-dialog .dialog-actions {\n    align-items: stretch;\n    flex-direction: column;\n  }"), "narrow screens must keep all dialog actions reachable without horizontal compression");
  assert.ok(!styles.includes(".invalid-link-cleanup-dialog .dialog-actions {\n    align-items: stretch;\n    flex-direction: column-reverse;"), "visual order must not diverge from DOM and keyboard order");

  const bridgeSource = fs.readFileSync(path.join(root, "src", "WebBridgeCommands.js"), "utf8");
  assert.ok(bridgeSource.includes("expectedSignature: payload && payload.expectedSignature"));
  assert.ok(bridgeSource.includes("mode: payload && payload.mode"));
  assert.ok(bridgeSource.includes("return Object.assign({}, result, { snapshot: __MN_COMMENT_DATA__.getNoteSnapshot(note) })"));

  console.log("invalid link cleanup dialog regression passed");
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

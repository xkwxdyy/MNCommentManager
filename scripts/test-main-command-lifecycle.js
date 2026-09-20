const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web", "src", "App.jsx"), "utf8");

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
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote === "`" && char === "$" && next === "{") { templateDepth += 1; depth += 1; index += 1; continue; }
      if (quote === "`" && char === "}" && templateDepth > 0) { templateDepth -= 1; depth -= 1; continue; }
      if (char === quote && templateDepth === 0) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") { depth -= 1; if (depth === 0) return index; }
  }
  throw new Error(`No matching brace for ${openIndex}`);
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

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const functionStart = text.indexOf(marker);
  assert.notStrictEqual(functionStart, -1, `${name} must exist`);
  const start = text.slice(Math.max(0, functionStart - 6), functionStart) === "async " ? functionStart - 6 : functionStart;
  const open = text.indexOf("{", functionStart);
  const close = matchingBrace(text, open);
  return text.slice(start, close + 1);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const appStart = source.indexOf("function App()");
const appEnd = source.indexOf("\nfunction BatchCommentEditor", appStart);
assert.ok(appStart >= 0 && appEnd > appStart, "App source boundary must exist");
const app = source.slice(appStart, appEnd);
const runCommandSource = extractConstArrow(app, "runCommand");
const closePanelSource = extractConstArrow(app, "closePanel");
const openSettingsSource = extractConstArrow(app, "openActionButtonSettings");
const openWorkflowSource = extractConstArrow(app, "openWorkflowManager");
const persistMergeSource = extractConstArrow(app, "persistMergeToExcerptDefault");
const persistSettingSource = extractFunction(source, "persistActionButtonSetting");

function makeRunContext(send) {
  const events = [];
  const context = vm.createContext({
    Error,
    Promise,
    Array,
    commandInFlightRef: { current: null },
    appMountedRef: { current: true },
    MNBridge: { send },
    setLoading: (value) => events.push(["loading", value]),
    notifyStatus: (value) => events.push(["status", value]),
    normalizeError: (error) => String(error?.message || error || "unknown"),
    makeContentSelection: (excerptSelected, commentIndices) => ({ excerptSelected, commentIndices }),
    applySnapshot: (...args) => events.push(["snapshot", ...args]),
  });
  vm.runInContext(`${runCommandSource}\nthis.runCommand = runCommand;`, context, { filename: "App-main-run-command.js" });
  return { context, events };
}

(async () => {
  {
    const first = deferred();
    let sends = 0;
    const { context, events } = makeRunContext(() => { sends += 1; return first.promise; });
    const pending = context.runCommand("editCommentText", { text: "A" }, { message: "保存完成" });
    assert.strictEqual(context.commandInFlightRef.current.command, "editCommentText", "the synchronous ref must be set before awaiting Native");
    const duplicate = context.runCommand("deleteComments", { indices: [1] }).then(
      () => null,
      (error) => error,
    );
    const duplicateError = await duplicate;
    assert.strictEqual(duplicateError.code, "MNCM_WEB_BUSY");
    assert.strictEqual(sends, 1, "same-tick activation must not send a second mutation");
    first.resolve({ statusMessage: "Native 完成" });
    await pending;
    assert.strictEqual(context.commandInFlightRef.current, null);
    assert.deepStrictEqual(events, [
      ["loading", true],
      ["status", "正在处理上一项操作，请稍候"],
      ["status", "Native 完成"],
      ["loading", false],
    ]);
  }

  {
    const { context, events } = makeRunContext(async () => ({
      snapshot: { noteId: "N-1", comments: [] },
      selectedIndices: [3, 1],
      statusMessage: "已更新",
    }));
    await context.runCommand("moveComments", {}, { message: "fallback" });
    const snapshotEvent = events.find((item) => item[0] === "snapshot");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshotEvent)), [
      "snapshot",
      { noteId: "N-1", comments: [] },
      "已更新",
      { excerptSelected: false, commentIndices: [3, 1] },
    ]);
  }

  {
    const failed = deferred();
    const { context, events } = makeRunContext(() => failed.promise);
    const pending = context.runCommand("deleteComments", {}).catch((error) => error);
    failed.reject(new Error("native failed"));
    const error = await pending;
    assert.strictEqual(error.message, "native failed");
    assert.strictEqual(context.commandInFlightRef.current, null, "failure must release only the matching operation");
    assert.ok(events.some((item) => item[0] === "status" && item[1] === "native failed"));
    assert.deepStrictEqual(events.filter((item) => item[0] === "loading").map((item) => item[1]), [true, false]);
  }

  {
    const response = deferred();
    const { context, events } = makeRunContext(() => response.promise);
    const pending = context.runCommand("getCurrentNoteComments");
    context.appMountedRef.current = false;
    response.resolve({ statusMessage: "late" });
    await pending;
    assert.strictEqual(context.commandInFlightRef.current, null, "a late response must still clear the transport guard");
    assert.deepStrictEqual(events, [["loading", true]], "an unmounted App must receive no late status, snapshot, or loading state writes");
  }

  {
    const response = deferred();
    let sends = 0;
    const events = [];
    const context = vm.createContext({
      Promise,
      panelCloseRef: { current: false },
      appMountedRef: { current: true },
      MNBridge: { send: () => { sends += 1; return response.promise; } },
      setClosingPanel: (value) => events.push(["closing", value]),
      notifyStatus: (value) => events.push(["status", value]),
      normalizeError: (error) => String(error?.message || error),
    });
    vm.runInContext(`${closePanelSource}\nthis.closePanel = closePanel;`, context, { filename: "App-close-panel.js" });
    const first = context.closePanel();
    const second = context.closePanel();
    assert.strictEqual(sends, 1, "the panel close command must be sent at most once while pending");
    response.resolve({});
    await Promise.all([first, second]);
    assert.strictEqual(context.panelCloseRef.current, false);
    assert.deepStrictEqual(events.filter((item) => item[0] === "closing").map((item) => item[1]), [true, false]);
  }

  {
    const response = deferred();
    let sends = 0;
    const states = [];
    const context = vm.createContext({
      Promise,
      actionButtonSettingsSessionRef: { current: 0 },
      overlayOpeningRef: { current: "" },
      appMountedRef: { current: true },
      MNBridge: { send: () => { sends += 1; return response.promise; } },
      setOpeningOverlay: (value) => states.push(["opening", value]),
      setActionButtonSettings: (value) => states.push(["settings", value]),
      notifyStatus: (value) => states.push(["status", value]),
      normalizeError: (error) => String(error?.message || error),
    });
    vm.runInContext(`${openSettingsSource}\nthis.openActionButtonSettings = openActionButtonSettings;`, context, { filename: "App-open-settings.js" });
    const trigger = { id: "settings" };
    const first = context.openActionButtonSettings({ currentTarget: trigger });
    const second = context.openActionButtonSettings({ currentTarget: trigger });
    assert.strictEqual(sends, 1, "an overlay opening ref must close the pre-render double-click window");
    response.resolve({ showSingleButton: true });
    await Promise.all([first, second]);
    assert.strictEqual(context.overlayOpeningRef.current, "");
    assert.ok(states.some((item) => item[0] === "settings" && item[1].returnFocusTarget === trigger));
  }

  {
    const updateOne = deferred();
    const updateTwo = deferred();
    const writes = [];
    const reads = [];
    const states = [];
    const statuses = [];
    const context = vm.createContext({
      Promise,
      String,
      appMountedRef: { current: true },
      mergeDefaultPersistenceRef: { current: { busy: false, queued: null, latest: false } },
      MNBridge: {
        send(command, payload) {
          if (command === "updateActionButtonSettings") {
            writes.push(payload);
            return writes.length === 1 ? updateOne.promise : updateTwo.promise;
          }
          reads.push(command);
          return Promise.resolve({ mergeToExcerptDefault: false });
        },
      },
      setMergeToExcerptDefault: (value) => states.push(value),
      setMergeDefaultLoadError: () => {},
      notifyStatus: (value) => statuses.push(value),
      normalizeError: (error) => String(error?.message || error),
    });
    vm.runInContext(`${persistSettingSource}
${persistMergeSource}
this.persist = persistMergeToExcerptDefault;`, context, { filename: "App-merge-default-persistence.js" });
    context.persist(true);
    context.persist(false);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(writes)), [{ mergeToExcerptDefault: true }]);
    updateOne.resolve({ mergeToExcerptDefault: true });
    for (let index = 0; index < 8 && writes.length < 2; index += 1) await Promise.resolve();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(writes)), [
      { mergeToExcerptDefault: true },
      { mergeToExcerptDefault: false },
    ], "rapid changes must serialize only the original write and the latest desired value");
    updateTwo.resolve({ mergeToExcerptDefault: false });
    for (let index = 0; index < 8 && context.mergeDefaultPersistenceRef.current.busy; index += 1) await Promise.resolve();
    assert.strictEqual(context.mergeDefaultPersistenceRef.current.busy, false);
    assert.deepStrictEqual(reads, [], "matching mutation readback must not cause an unnecessary extra read");
    assert.strictEqual(states.at(-1), false);
    assert.ok(statuses.at(-1).includes("已保存"), "the final queued value must publish a completion status");
  }

  {
    const response = deferred();
    const statuses = [];
    const context = vm.createContext({
      Promise,
      String,
      appMountedRef: { current: true },
      mergeDefaultPersistenceRef: { current: { busy: false, queued: null, latest: false } },
      MNBridge: { send: () => response.promise },
      setMergeToExcerptDefault: () => {},
      setMergeDefaultLoadError: () => { throw new Error("unmounted state write"); },
      notifyStatus: (value) => statuses.push(value),
      normalizeError: (error) => String(error?.message || error),
    });
    vm.runInContext(`${persistSettingSource}
${persistMergeSource}
this.persist = persistMergeToExcerptDefault;`, context, { filename: "App-merge-default-unmount.js" });
    context.persist(true);
    context.appMountedRef.current = false;
    response.resolve({ mergeToExcerptDefault: true });
    for (let index = 0; index < 8 && context.mergeDefaultPersistenceRef.current.busy; index += 1) await Promise.resolve();
    assert.deepStrictEqual(statuses, [], "late preference completion must not write status after App unmount");
  }

  assert.ok(openWorkflowSource.includes("if (overlayOpeningRef.current) return;"));
  assert.ok(openWorkflowSource.includes('MNBridge.send("getWorkflowActionCatalog")'));
  assert.ok(openWorkflowSource.includes('MNBridge.send("listWorkflows")'));
  assert.ok(openWorkflowSource.includes("if (!appMountedRef.current) return;"));
  assert.ok(persistMergeSource.includes("persistence.queued = normalized"), "rapid preference changes must retain only the latest desired value");
  assert.ok(persistMergeSource.includes("persistActionButtonSetting("), "preference success must be verified through the existing readback helper");
  assert.ok(persistMergeSource.includes("if (appMountedRef.current && persistence.latest === value)"));
  assert.ok(persistMergeSource.includes("if (!appMountedRef.current) return;"), "late preference errors must not write to an unmounted App");
  assert.ok(!persistMergeSource.includes("catch(() => {})"), "preference persistence failures must never be swallowed");

  const effectAnchor = app.indexOf("appMountedRef.current = true;");
  const effectEnd = app.indexOf("}, []);", effectAnchor);
  const mountEffect = app.slice(app.lastIndexOf("useEffect(() => {", effectAnchor), effectEnd + 7);
  assert.ok(mountEffect.includes("if (!didInitialLoad.current)"));
  assert.ok(!mountEffect.includes("if (didInitialLoad.current) return"), "StrictMode's second setup must still install the real cleanup");
  assert.ok(mountEffect.includes("appMountedRef.current = false"));
  assert.ok(mountEffect.includes("clearDeleteTimer()"));
  assert.ok(mountEffect.includes("Object.values(quickMoveTimers.current)"));
  assert.ok(mountEffect.includes("Object.values(linkFocusTimers.current)"));

  assert.ok(app.includes('{openingOverlay === "workflow" ? "打开中…" : "工作流"}'));
  assert.ok(app.includes('{openingOverlay === "settings" ? "打开中…" : "设置"}'));
  assert.ok(app.includes('{closingPanel ? "关闭中…" : "关闭"}'));
  assert.strictEqual((closePanelSource.match(/MNBridge\.send\("closePanel"/g) || []).length, 1);

  console.log("main command and overlay lifecycle regression passed");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

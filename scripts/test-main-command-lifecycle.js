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
const batchReceiverStart = app.indexOf('window.__MNCommentManagerBatchNativeSync = ');
const batchReceiverOpen = app.indexOf('{', app.indexOf('=>', batchReceiverStart));
const batchReceiverSource = app.slice(batchReceiverStart, matchingBrace(app, batchReceiverOpen) + 2);
const batchOverlayResetSource = app.includes('const resetSingleOverlaysForBatch = ')
  ? extractConstArrow(app, 'resetSingleOverlaysForBatch') : '';
const wholeCloseMarker = 'window.__MNCommentManagerNativePanelClosed = ';
const wholeCloseStart = app.indexOf(wholeCloseMarker);
const wholeCloseOpen = app.indexOf('{', app.indexOf('=>', wholeCloseStart));
const wholeCloseReceiverSource = wholeCloseStart < 0 ? '' : app.slice(wholeCloseStart, matchingBrace(app, wholeCloseOpen) + 2);
const panelSource = fs.readFileSync(path.join(root, 'src/WebPanelController.js'), 'utf8');
const wholeCloseScriptMatch = panelSource.match(/if \(controller\.webView\) evaluateScript\(controller\.webView, ("window\.__MNCommentManagerRequestedView=.*")\);/);
assert(wholeCloseScriptMatch, 'the actual whole-native-close script must be discoverable');
const wholeCloseScript = JSON.parse(wholeCloseScriptMatch[1]);

function makeBatchOverlayContext(send = async () => []) {
  const states = { workflow: { name: '旧工作流窗口' }, settings: {}, modules: true, moduleResult: {}, dialog: {}, invalidLinks: {}, selection: true, opening: 'workflow' };
  const recordingDraft = { name: '保留的多卡录制', steps: [{ actionId: 'clearAllComments' }] };
  const context = vm.createContext({
    Promise, JSON, window: { __MNCommentManagerRequestedView: 'workflow' },
    retainedBatchEditorRef: { current: { token: 'old', recordingDraft } },
    actionButtonSettingsSessionRef: { current: 1 }, invalidLinkCleanupSessionRef: { current: 1 },
    overlayOpeningRef: { current: '' }, appMountedRef: { current: true },
    MNBridge: { send }, notifyStatus() {}, normalizeError: error => String(error?.message || error),
    setWorkflowManager: value => { states.workflow = value; }, setActionButtonSettings: value => { states.settings = value; },
    setModuleSettingsOpen: value => { states.modules = value; }, setModuleResult: value => { states.moduleResult = value; },
    setDialog: value => { states.dialog = value; }, setInvalidLinkCleanup: value => { states.invalidLinks = value; },
    setSelectionActionsOpen: value => { states.selection = value; }, setOpeningOverlay: value => { states.opening = value; },
    setBatchEditor: value => { states.batch = value; }, hideBatchEditorRetainingDraft() { states.batch = null; },
  });
  vm.runInContext(`${batchOverlayResetSource}\n${batchReceiverSource}\n${wholeCloseReceiverSource}\n${openWorkflowSource}\nthis.openWorkflowManager = openWorkflowManager;`, context);
  return { context, states, recordingDraft };
}

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
  for (const failedCommand of ['getWorkflowActionCatalog', 'listWorkflows', 'getWorkflowTemplates']) {
    const addon = { mncmWorkflowManagerModalOpen: true, mncmWorkflowPanelOwnsEntries: true };
    let syncs = 0;
    const native = vm.createContext({ __MN_WEB_API_MNCommentManagerAddon: { syncCurrentNote() { syncs++; } } });
    vm.runInContext(fs.readFileSync(path.join(root, 'src/WebBridgeCommands.js'), 'utf8'), native);
    const { context, states } = makeBatchOverlayContext(async command => {
      if (command === failedCommand) throw new Error('读取失败');
      if (command === 'workflowManagerClosed') return native.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands.workflowManagerClosed({ addon, controller: { addon } });
      return [];
    });
    await context.openWorkflowManager();
    assert.equal(addon.mncmWorkflowManagerModalOpen, false, 'a failed current workflow opening must release the native modal gate');
    assert.equal(addon.mncmWorkflowPanelOwnsEntries, true, 'failure recovery must keep following controls behind the main panel');
    assert.equal(syncs, 1); assert.equal(states.opening, '');
  }
  for (const result of ['resolve', 'reject']) {
    const response = deferred(); let closedRequests = 0;
    const { context, states } = makeBatchOverlayContext(command => {
      if (command === 'listWorkflows') return response.promise;
      if (command === 'workflowManagerClosed') closedRequests++;
      return Promise.resolve([]);
    });
    const pending = context.openWorkflowManager();
    vm.runInContext(wholeCloseScript, context);
    assert.equal(states.workflow, null, 'whole native closing must clear an existing workflow layer');
    assert.equal(context.overlayOpeningRef.current, '', 'whole native closing must cancel the active opening identity');
    if (result === 'resolve') response.resolve([]); else response.reject(new Error('旧请求失败'));
    await pending;
    assert.equal(states.workflow, null, 'an old response cannot resurrect a workflow layer after whole native closing');
    assert.equal(closedRequests, 0, 'cancelled old failures must not release a later modal session');
  }
  {
    const { context, states, recordingDraft } = makeBatchOverlayContext();
    const selection = { mode: 'batch', token: 'new-selection', noteIds: ['a', 'b'], cards: [] };
    context.window.__MNCommentManagerBatchNativeSync({ state: selection });
    for (const key of ['workflow', 'settings', 'moduleResult', 'dialog', 'invalidLinks']) assert.equal(states[key], null, 'entering batch mode must close the old ' + key + ' layer');
    assert.equal(states.modules, false); assert.equal(states.selection, false); assert.equal(states.opening, '');
    assert.equal(context.window.__MNCommentManagerRequestedView, '');
    assert.equal(states.batch, selection); assert.equal(context.retainedBatchEditorRef.current, selection);
    assert.deepEqual(recordingDraft, { name: '保留的多卡录制', steps: [{ actionId: 'clearAllComments' }] }, 'mode handoff must leave the mounted batch recording draft untouched');
    assert(app.includes('state={batchEditor || retainedBatchEditorRef.current} active={!!batchEditor}'), 'the existing batch editor must remain mounted to retain recording state');
  }
  {
    const response = deferred();
    const { context, states } = makeBatchOverlayContext(() => response.promise);
    const pending = context.openWorkflowManager();
    context.window.__MNCommentManagerBatchNativeSync({ state: { mode: 'batch', token: 'new-selection', noteIds: ['a', 'b'] } });
    response.resolve([]); await pending;
    assert.equal(states.workflow, null, 'a late old-mode workflow read must not reopen above the batch editor');
    assert.equal(states.batch.token, 'new-selection');
  }
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
      window: { __MNCommentManagerRequestedView: "workflow" },
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
    assert.strictEqual(context.window.__MNCommentManagerRequestedView, "", "closing cancels a pending workflow view request");
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
      setShowImageExcerptText: (value) => states.push(["imageExcerptText", value]),
      setShowExcerptMoveNotice: (value) => states.push(["excerptMoveNotice", value]),
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
    assert.ok(states.some((item) => item[0] === "imageExcerptText" && item[1] === false));
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

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(rootDir, "src/main.js"), "utf8");
const addonSource = fs.readFileSync(path.join(rootDir, "src/MNCommentManagerAddon.js"), "utf8");
const panelSource = fs.readFileSync(path.join(rootDir, "src/WebPanelController.js"), "utf8");
const forbiddenRuntimeFiles = [
  path.join(rootDir, "src/vendor/mnutils.js"),
  path.join(rootDir, "src/vendor/mnnote.js"),
];

forbiddenRuntimeFiles.forEach((filePath) => {
  assert(!fs.existsSync(filePath), `vendored MN Utils runtime must not exist: ${filePath}`);
});
assert(!/vendor\/(?:mnutils|mnnote)/.test(mainSource), "main.js must not load a vendored MN Utils runtime");
assert(
  !/MNUtil\.(?:add|remove)Observer\([^\n]*["']PopupMenuOnNote["']/.test(panelSource),
  "WebPanelController must not register or remove the addon's persistent PopupMenuOnNote observer",
);

function loadMain() {
  const required = [];
  const context = {
    console,
    createMNCommentManagerAddon(mainPath) {
      return { mainPath };
    },
    JSB: {
      require(moduleName) {
        required.push(moduleName);
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(mainSource, context, { filename: "main.js" });
  const addon = context.JSB.newAddon("/addons/marginnote.extension.mncommentmanager");
  return { required, addon };
}

function loadAddon({
  provideMNUtilsRuntime,
  mnutilsInstalled = provideMNUtilsRuntime,
  runtimeAvailableAfterTimer = null,
}) {
  const logs = [];
  const hudMessages = [];
  const observerCalls = [];
  const controllerCalls = [];
  const batchCalls = [];
  const dynamicCalls = [];
  const timerCalls = [];
  const panelRemovals = [];
  const app = {
    focusWindow: { id: "focus-window" },
    showHUD(message) {
      hudMessages.push(message);
    },
    studyController() {
      return {
        refreshAddonCommands() {},
      };
    },
  };
  const context = {
    console: {
      log(message) {
        logs.push(String(message));
      },
    },
    Application: {
      sharedInstance() {
        return app;
      },
    },
    NSFileManager: {
      defaultManager() {
        return {
          fileExistsAtPath(filePath) {
            return mnutilsInstalled && filePath === "/addons/marginnote.extension.mnutils/main.js";
          },
        };
      },
    },
    NSTimer: {
      scheduledTimerWithTimeInterval(seconds, _repeats, callback) {
        timerCalls.push(seconds);
        if (runtimeAvailableAfterTimer && timerCalls.length >= runtimeAvailableAfterTimer) {
          installMNUtilsRuntime();
        }
        callback();
        return { invalidate() {} };
      },
    },
    __MN_WEB_API_MNCommentManagerAddon: {
      createController(mainPath, addon) {
        controllerCalls.push({ mainPath, addon });
        return {
          view: {
            hidden: true,
            window: null,
            superview: null,
            removeFromSuperview() {
              panelRemovals.push(addon);
              this.superview = null;
            },
          },
        };
      },
      ensureLayout() {},
      shouldRestorePanel() {
        return false;
      },
    },
    __MN_BATCH_COMMENT_ACTIONS__: {
      hideButton(addon, reason) {
        batchCalls.push({ type: "hideButton", addon, reason });
      },
      handleMultipleSelection(addon, sender) {
        batchCalls.push({ type: "handleMultipleSelection", addon, sender });
      },
    },
    __MN_DYNAMIC_COMMENT_ACTIONS__: {
      handlePopupMenuOnNote(addon, sender) {
        dynamicCalls.push({ type: "handlePopupMenuOnNote", addon, sender });
        return true;
      },
      handlePopupMenuClosed(addon) {
        dynamicCalls.push({ type: "handlePopupMenuClosed", addon });
        return true;
      },
      hideButton(addon, reason) {
        dynamicCalls.push({ type: "hideButton", addon, reason });
      },
      disposeButton(addon, reason) {
        dynamicCalls.push({ type: "disposeButton", addon, reason });
        return true;
      },
      beginInteraction(addon) {
        dynamicCalls.push({ type: "beginInteraction", addon });
        return true;
      },
      handleMenuDismissed(addon, controller) {
        dynamicCalls.push({ type: "handleMenuDismissed", addon, controller });
        return true;
      },
      runKeepFirstContent(addon, sender) {
        dynamicCalls.push({ type: "runKeepFirstContent", addon, sender });
        return Promise.reject(new Error("selector test failure"));
      },
    },
    JSB: {
      defineClass(_declaration, instanceMembers) {
        return instanceMembers;
      },
    },
  };

  function installMNUtilsRuntime() {
    context.MNUtil = {
      addObserver(addon, selector, notification) {
        observerCalls.push({ type: "add", addon, selector, notification });
      },
      removeObserver(addon, notification) {
        observerCalls.push({ type: "remove", addon, notification });
      },
      showHUD(message) {
        hudMessages.push(String(message));
      },
    };
    context.MNNote = {
      new() {
        return null;
      },
    };
    if (context.self) context.MNUtil.currentWindow = context.self.window;
  }

  if (provideMNUtilsRuntime) installMNUtilsRuntime();

  vm.createContext(context);
  vm.runInContext(addonSource, context, { filename: "MNCommentManagerAddon.js" });
  const members = context.createMNCommentManagerAddon("/addons/marginnote.extension.mncommentmanager");
  context.self = { window: { id: "addon-window" } };
  if (context.MNUtil) context.MNUtil.currentWindow = context.self.window;
  return {
    context,
    members,
    logs,
    hudMessages,
    observerCalls,
    controllerCalls,
    batchCalls,
    dynamicCalls,
    timerCalls,
    panelRemovals,
    installMNUtilsRuntime,
  };
}

{
  const result = loadMain();
  assert.deepStrictEqual(result.required, [
    "WebDevServerConfig",
    "HandwritingPreview",
    "CommentData",
    "UndoGroupingHelper",
    "CommentMutations",
    "CommentActionSettings",
    "BatchCommentActions",
    "DynamicCommentActions",
    "WebBridgeCommands",
    "WebPanelController",
    "MNCommentManagerAddon",
  ]);
  assert.strictEqual(result.addon.mainPath, "/addons/marginnote.extension.mncommentmanager");
}

(async function testAddonWithRuntime() {
  {
    const result = loadAddon({ provideMNUtilsRuntime: false, mnutilsInstalled: false });
    await result.members.sceneWillConnect();
    assert.strictEqual(result.context.self.mnCommentManagerInitialized, undefined);
    assert.strictEqual(result.context.self.mnCommentManagerRuntimeReady, false);
    assert.strictEqual(result.controllerCalls.length, 0);
    assert.strictEqual(result.observerCalls.length, 0);
    assert.strictEqual(result.hudMessages.length, 0, "scene bootstrap must not show a dependency prompt");

    await result.members.notebookWillOpen();
    assert(result.hudMessages.some((message) => message.includes("需要先安装并启用 MN Utils")));
    assert.strictEqual(result.hudMessages.length, 1);

    const command = result.members.queryAddonCommandStatus();
    assert.strictEqual(command.selector, "toggleWebPanel:");
    await result.members.toggleWebPanel();
    assert.strictEqual(result.hudMessages.length, 1, "repeated lifecycle checks must not repeat the same prompt");
  }

  {
    const result = loadAddon({
      provideMNUtilsRuntime: false,
      mnutilsInstalled: true,
      runtimeAvailableAfterTimer: 2,
    });
    await result.members.sceneWillConnect();
    assert.strictEqual(result.context.self.mnCommentManagerInitialized, true);
    assert.strictEqual(result.context.self.mnCommentManagerRuntimeReady, true);
    assert.strictEqual(result.timerCalls.length, 2);
    assert.strictEqual(result.hudMessages.length, 0, "delayed shared runtime loading must stay silent");
    assert.strictEqual(result.controllerCalls.length, 1);
    assert.strictEqual(result.observerCalls.filter((item) => item.type === "add").length, 4);
  }

  {
    const result = loadAddon({ provideMNUtilsRuntime: false, mnutilsInstalled: true });
    await result.members.sceneWillConnect();
    assert.strictEqual(result.hudMessages.length, 0);
    assert.strictEqual(result.timerCalls.length, 10);

    await result.members.notebookWillOpen();
    assert.strictEqual(result.context.self.mnCommentManagerInitialized, undefined);
    assert.strictEqual(result.hudMessages.length, 1);
    assert(result.hudMessages[0].includes("已安装，但运行时尚未就绪"));
    assert(!result.hudMessages[0].includes("需要先安装"));

    result.installMNUtilsRuntime();
    await result.members.notebookWillOpen();
    assert.strictEqual(result.context.self.mnCommentManagerInitialized, true);
    assert.strictEqual(result.controllerCalls.length, 1);
    assert.strictEqual(result.observerCalls.filter((item) => item.type === "add").length, 4);
  }

  const result = loadAddon({ provideMNUtilsRuntime: true });
  await result.members.sceneWillConnect();
  await result.members.sceneWillConnect();
  assert.strictEqual(result.context.self.mnCommentManagerInitialized, true);
  assert.strictEqual(result.context.self.mnCommentManagerRuntimeReady, true);
  assert.strictEqual(result.controllerCalls.length, 1);
  assert.deepStrictEqual(
    result.observerCalls
      .filter((item) => item.type === "add")
      .map(({ selector, notification }) => ({ selector, notification })),
    [
      { selector: "onMindmapViewOnMultipleSelection:", notification: "mindmapViewOnMultipleSelection" },
      { selector: "onMindmapViewBottomToolbarClosed:", notification: "mindmapViewBottomToolbarClosed" },
      { selector: "onPopupMenuOnNote:", notification: "PopupMenuOnNote" },
      { selector: "onClosePopupMenuOnNote:", notification: "ClosePopupMenuOnNote" },
    ],
  );

  const popupSender = { userInfo: { noteid: "single-note" } };
  result.members.onPopupMenuOnNote(popupSender);
  result.members.onClosePopupMenuOnNote();
  const selectionSender = { userInfo: { selViewLst: [{ note: { noteId: "a" } }, { note: { noteId: "b" } }] } };
  result.members.onMindmapViewOnMultipleSelection(selectionSender);
  assert.deepStrictEqual(result.batchCalls, [
    { type: "hideButton", addon: result.context.self, reason: "singleNote" },
    { type: "handleMultipleSelection", addon: result.context.self, sender: selectionSender },
  ]);
  assert.deepStrictEqual(result.dynamicCalls, [
    { type: "handlePopupMenuOnNote", addon: result.context.self, sender: popupSender },
    { type: "handlePopupMenuClosed", addon: result.context.self },
    { type: "hideButton", addon: result.context.self, reason: "multipleSelection" },
  ]);
  result.context.MNUtil.currentWindow = { id: "other-window" };
  result.members.onPopupMenuOnNote(popupSender);
  result.members.onClosePopupMenuOnNote();
  assert.strictEqual(result.batchCalls.length, 2, "inactive windows must not touch single-card state");
  assert.strictEqual(result.dynamicCalls.length, 3, "inactive windows must ignore PopupMenu notifications");
  result.context.MNUtil.currentWindow = result.context.self.window;
  result.batchCalls.length = 0;
  result.dynamicCalls.length = 0;

  result.members.dynamicCommentButtonTouchDown();
  assert.deepStrictEqual(result.dynamicCalls, [
    { type: "beginInteraction", addon: result.context.self },
  ]);
  const singleCardPopover = { id: "single-card-popover" };
  result.members.popoverControllerDidDismissPopover(singleCardPopover);
  assert.strictEqual(result.members.popoverControllerDidDismissPopover.length, 1);
  assert.deepStrictEqual(result.dynamicCalls.slice(1), [
    { type: "handleMenuDismissed", addon: result.context.self, controller: singleCardPopover },
  ]);
  await result.members.runSingleKeepFirstContent("single-note");
  assert.deepStrictEqual(result.dynamicCalls.slice(2), [
    { type: "runKeepFirstContent", addon: result.context.self, sender: "single-note" },
  ]);
  assert(result.hudMessages.some((message) => message.includes("selector test failure")));
  assert(result.logs.some((message) => message.includes("single-card runKeepFirstContent failed")));
  assert(result.logs.some((message) => message.includes("initialized with MN Utils runtime")));

  result.dynamicCalls.length = 0;
  result.context.self.webController.view.superview = { id: "panel-host" };
  delete result.context.MNUtil;
  delete result.context.MNNote;
  result.members.sceneDidDisconnect();
  assert.deepStrictEqual(result.dynamicCalls, [
    { type: "disposeButton", addon: result.context.self, reason: "scene.disconnect" },
  ]);
  assert.strictEqual(result.panelRemovals.length, 1, "disconnect must remove the panel even after MN Utils unloads");
  assert.strictEqual(result.context.self.webController, null);
  assert.strictEqual(result.context.self.mnCommentManagerInitialized, false);
  assert.strictEqual(result.context.self.mnCommentManagerRuntimeReady, false);
  console.log("runtime dependency tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(rootDir, "src/main.js"), "utf8");
const addonSource = fs.readFileSync(path.join(rootDir, "src/MNCommentManagerAddon.js"), "utf8");
const forbiddenRuntimeFiles = [
  path.join(rootDir, "src/vendor/mnutils.js"),
  path.join(rootDir, "src/vendor/mnnote.js"),
];

forbiddenRuntimeFiles.forEach((filePath) => {
  assert(!fs.existsSync(filePath), `vendored MN Utils runtime must not exist: ${filePath}`);
});
assert(!/vendor\/(?:mnutils|mnnote)/.test(mainSource), "main.js must not load a vendored MN Utils runtime");

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

function loadAddon({ provideMNUtilsRuntime }) {
  const logs = [];
  const hudMessages = [];
  const observerCalls = [];
  const controllerCalls = [];
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
    __MN_WEB_API_MNCommentManagerAddon: {
      createController(mainPath, addon) {
        controllerCalls.push({ mainPath, addon });
        return {
          view: {
            hidden: true,
            window: null,
          },
        };
      },
      ensureLayout() {},
      shouldRestorePanel() {
        return false;
      },
    },
    __MN_BATCH_COMMENT_ACTIONS__: {},
    JSB: {
      defineClass(_declaration, instanceMembers) {
        return instanceMembers;
      },
    },
  };

  if (provideMNUtilsRuntime) {
    context.MNUtil = {
      addObserver(addon, selector, notification) {
        observerCalls.push({ type: "add", addon, selector, notification });
      },
      removeObserver(addon, notification) {
        observerCalls.push({ type: "remove", addon, notification });
      },
    };
    context.MNNote = {
      new() {
        return null;
      },
    };
  }

  vm.createContext(context);
  vm.runInContext(addonSource, context, { filename: "MNCommentManagerAddon.js" });
  const members = context.createMNCommentManagerAddon("/addons/marginnote.extension.mncommentmanager");
  context.self = { window: { id: "addon-window" } };
  return {
    context,
    members,
    logs,
    hudMessages,
    observerCalls,
    controllerCalls,
  };
}

{
  const result = loadMain();
  assert.deepStrictEqual(result.required, [
    "WebDevServerConfig",
    "CommentData",
    "UndoGroupingHelper",
    "CommentMutations",
    "BatchCommentActions",
    "WebBridgeCommands",
    "WebPanelController",
    "MNCommentManagerAddon",
  ]);
  assert.strictEqual(result.addon.mainPath, "/addons/marginnote.extension.mncommentmanager");
}

{
  const result = loadAddon({ provideMNUtilsRuntime: false });
  result.members.sceneWillConnect();
  assert.strictEqual(result.context.self.mnCommentManagerInitialized, undefined);
  assert.strictEqual(result.context.self.mnCommentManagerRuntimeReady, false);
  assert.strictEqual(result.controllerCalls.length, 0);
  assert.strictEqual(result.observerCalls.length, 0);
  assert(result.hudMessages.some((message) => message.includes("需要先安装并启用 MN Utils")));

  const command = result.members.queryAddonCommandStatus();
  assert.strictEqual(command.selector, "showMissingMNUtilsDependency:");
  result.members.toggleWebPanel();
  assert(result.hudMessages.length >= 2);

  result.context.MNUtil = {
    addObserver(addon, selector, notification) {
      result.observerCalls.push({ type: "add", addon, selector, notification });
    },
    removeObserver(addon, notification) {
      result.observerCalls.push({ type: "remove", addon, notification });
    },
  };
  result.context.MNNote = {
    new() {
      return null;
    },
  };
  result.members.notebookWillOpen();
  assert.strictEqual(result.context.self.mnCommentManagerInitialized, true);
  assert.strictEqual(result.controllerCalls.length, 1);
  assert.strictEqual(result.observerCalls.filter((item) => item.type === "add").length, 2);
}

{
  const result = loadAddon({ provideMNUtilsRuntime: true });
  result.members.sceneWillConnect();
  result.members.sceneWillConnect();
  assert.strictEqual(result.context.self.mnCommentManagerInitialized, true);
  assert.strictEqual(result.context.self.mnCommentManagerRuntimeReady, true);
  assert.strictEqual(result.controllerCalls.length, 1);
  assert.strictEqual(result.observerCalls.filter((item) => item.type === "add").length, 2);
  assert(result.logs.some((message) => message.includes("initialized with MN Utils runtime")));
}

console.log("runtime dependency tests passed");

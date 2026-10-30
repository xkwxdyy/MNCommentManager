const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const stage = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const isStage = fs.existsSync(path.join(stage, "src/CommentActionSettings.js"));
const runtime = isStage ? path.join(stage, "src") : stage;
const source = fs.readFileSync(path.join(runtime, "CommentActionSettings.js"), "utf8");
const store = new Map();
const writes = [];
const defaults = {
  objectForKey(key) { return store.get(key); },
  setBoolForKey(value, key) { writes.push([key, value]); store.set(key, value); },
  setObjectForKey(value, key) { writes.push([key, value]); store.set(key, value); },
};
function load() {
  const context = vm.createContext({ console: { log() {} }, NSUserDefaults: { standardUserDefaults() { return defaults; } } });
  vm.runInContext(source, context);
  return context.__MN_COMMENT_ACTION_SETTINGS__;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

const settings = load();
const initial = plain(settings.getSettings());
assert.equal(initial.autoHideNativeDuplicates, true);
assert.equal(store.has("mncommentmanager_auto_hide_native_duplicates"), false, "reading defaults must not persist or rewrite preferences");
assert.equal(settings.updateSettings({ autoHideNativeDuplicates: false }).autoHideNativeDuplicates, false);
assert.equal(store.get("mncommentmanager_auto_hide_native_duplicates"), false);
assert.equal(load().getSettings().autoHideNativeDuplicates, false, "preference survives a module reload");
for (const invalid of [undefined, null, 0, 1, "false", "true", {}, []]) {
  const before = writes.length;
  assert.equal(settings.updateSettings({ autoHideNativeDuplicates: invalid }).autoHideNativeDuplicates, false);
  assert.equal(writes.length, before, "invalid boolean values are ignored using the existing settings convention");
}
assert.equal(settings.updateSettings({ autoHideNativeDuplicates: true }).autoHideNativeDuplicates, true);
assert.deepEqual(plain(settings.getSettings()), initial, "the new preference must leave all existing defaults unchanged");

const saved = {
  showBatchButton: false,
  enableDynamicSingleCardButton: false,
  autoHideNativeDuplicates: false,
  showManagementButton: false,
  showQuickCommentButton: false,
  showMoveCommentButton: false,
  dynamicButtonOrder: ["move", "add", "management"],
  managementTapAction: "quickInput",
  managementHoldAction: "none",
  addTapAction: "manager",
  addHoldAction: "menu",
  mergeToExcerptDefault: true,
  showImageExcerptText: true,
  showExcerptMoveNotice: false,
};
settings.updateSettings(saved);
assert.deepEqual(plain(load().getSettings()), saved, "existing switches, order and custom actions survive alongside the new preference");
const beforeInvalid = new Map(store);
assert.throws(() => settings.updateSettings({ autoHideNativeDuplicates: true, managementTapAction: "invalid" }), /动作无效/);
assert.deepEqual(store, beforeInvalid, "action validation must run before writing the new preference");
assert.throws(() => settings.updateSettings({ autoHideNativeDuplicates: true, dynamicButtonOrder: ["add"] }), /顺序无效/);
assert.deepEqual(store, beforeInvalid, "order validation must run before writing the new preference");
settings.updateSettings({ autoHideNativeDuplicates: true });
assert.deepEqual(plain(load().getSettings()), { ...saved, autoHideNativeDuplicates: true }, "changing auto-hide must not alter the persistent display/action settings");

const bridge = fs.readFileSync(path.join(runtime, "WebBridgeCommands.js"), "utf8");
if (isStage) assert.match(bridge, /else if \(\["enableDynamicSingleCardButton", "autoHideNativeDuplicates",[\s\S]*?__MN_DYNAMIC_COMMENT_ACTIONS__\.refreshButtons\(context\.addon\)/);
const calls = [];
const addon = { window: {} };
const bridgeContext = vm.createContext({
  console: { log() {} },
  __MN_COMMENT_ACTION_SETTINGS__: settings,
  __MN_BATCH_COMMENT_ACTIONS__: { hideButton(target) { calls.push(["batch-hide", target]); } },
  __MN_DYNAMIC_COMMENT_ACTIONS__: {
    hideButton(target) { calls.push(["hide", target]); },
    refreshButtons(target) { calls.push(["refresh", target]); },
  },
});
vm.runInContext(bridge, bridgeContext);
const updateViaBridge = bridgeContext.__MN_WEB_BRIDGE_COMMANDS_MNCommentManagerAddon.commands.updateActionButtonSettings;
settings.updateSettings({ showBatchButton: true, enableDynamicSingleCardButton: true });
updateViaBridge({ addon }, { autoHideNativeDuplicates: false });
assert.deepEqual(calls, [["refresh", addon]], "the new preference must refresh the current dynamic group");
calls.length = 0;
updateViaBridge({ addon }, { showExcerptMoveNotice: true });
assert.deepEqual(calls, [], "unrelated settings must retain the existing refresh boundary");
settings.updateSettings({ enableDynamicSingleCardButton: false });
updateViaBridge({ addon }, { autoHideNativeDuplicates: true });
assert.deepEqual(calls, [["hide", addon]], "auto-hide must not reactivate a disabled master switch");
assert.equal(settings.getSettings().enableDynamicSingleCardButton, false);
calls.length = 0;
const joint = {
  enableDynamicSingleCardButton: false, autoHideNativeDuplicates: false,
  showManagementButton: false, showQuickCommentButton: false, showMoveCommentButton: true,
  dynamicButtonOrder: ["add", "move", "management"], managementTapAction: "menu", managementHoldAction: "none",
  addTapAction: "none", addHoldAction: "quickInput",
};
const jointResult = plain(updateViaBridge({ addon }, joint));
assert.deepEqual(calls, [["hide", addon]], "one combined settings request must not refresh or revive a disabled group");
for (const [key, value] of Object.entries(joint)) assert.deepEqual(jointResult[key], value);
assert.deepEqual(plain(load().getSettings()), jointResult, "combined bridge choices must survive a reload");
calls.length = 0;
const jointStore = new Map(store), jointWrites = writes.length;
for (const invalid of [{ managementHoldAction: "invalid" }, { dynamicButtonOrder: ["management", "management", "move"] }]) {
  assert.throws(() => updateViaBridge({ addon }, { enableDynamicSingleCardButton: true, autoHideNativeDuplicates: true, ...invalid }), /无效/);
  assert.deepEqual(store, jointStore, "invalid combined bridge requests cannot partially enable auto-hide or the master switch");
  assert.equal(writes.length, jointWrites);
  assert.deepEqual(calls, [], "validation failures cannot refresh visible controls");
}
const reenabled = plain(updateViaBridge({ addon }, { enableDynamicSingleCardButton: true, autoHideNativeDuplicates: true }));
assert.deepEqual(calls, [["refresh", addon]], "one combined enable request must refresh exactly once");
assert.deepEqual(reenabled, { ...jointResult, enableDynamicSingleCardButton: true, autoHideNativeDuplicates: true });
assert.deepEqual(plain(load().getSettings()), reenabled, "re-enabling cannot reset custom gestures, individual switches or order");
if (isStage) {
  const app = fs.readFileSync(path.join(stage, "web/src/App.jsx"), "utf8");
  assert.equal(app.split('saveSetting("autoHideNativeDuplicates", event.target.checked, "自动隐藏重复动态入口")').length - 1, 1);
  assert.match(app, /checked=\{settings\?\.autoHideNativeDuplicates !== false\}\s+disabled=\{busy\}/);
  assert.ok(app.indexOf('saveSetting("autoHideNativeDuplicates"') > app.indexOf('saveSetting("enableDynamicSingleCardButton"'));
  assert.ok(app.indexOf('saveSetting("autoHideNativeDuplicates"') < app.indexOf('<fieldset className={`dynamic-button-settings'));
} else {
  const assets = path.join(runtime, "web-dist/assets");
  const app = fs.readdirSync(assets).filter(name => name.endsWith(".js")).map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
  assert.ok(app.includes("autoHideNativeDuplicates"), "the rebuilt package must include the new setting key");
  assert.ok(app.includes("自动隐藏重复动态入口"), "the rebuilt package must include the new checkbox label");
  assert.ok(app.includes("当前原生卡片菜单提供相应功能时，隐藏重复的默认浮动入口；自定义动作及原有显示设置继续保留。"), "the rebuilt package must include its explanation");
}
console.log("adaptive settings: default, toggle, reload, invalid input, legacy preferences, combined bridge transactions, refresh and UI checks passed");

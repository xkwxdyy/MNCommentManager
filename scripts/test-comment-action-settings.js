const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const store = new Map();
const context = {
  console: { log() {} },
  NSUserDefaults: {
    standardUserDefaults() {
      return {
        objectForKey(key) { return store.get(key); },
        setBoolForKey(value, key) { store.set(key, value); },
        setObjectForKey(value, key) { store.set(key, value); },
      };
    },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentActionSettings.js"), "utf8"), context);

const settings = context.__MN_COMMENT_ACTION_SETTINGS__;
assert.deepStrictEqual(JSON.parse(JSON.stringify(settings.getSettings())), {
  showBatchButton: true,
  enableDynamicSingleCardButton: true,
  mergeToExcerptDefault: false,
  showImageExcerptText: false,
  showExcerptMoveNotice: true,
  showQuickCommentButton: true,
  managementTapAction: "manager", managementHoldAction: "menu", addTapAction: "quickInput", addHoldAction: "menu",
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(settings.updateSettings({ showBatchButton: false }))), {
  showBatchButton: false,
  enableDynamicSingleCardButton: true,
  mergeToExcerptDefault: false,
  showImageExcerptText: false,
  showExcerptMoveNotice: true,
  showQuickCommentButton: true,
  managementTapAction: "manager", managementHoldAction: "menu", addTapAction: "quickInput", addHoldAction: "menu",
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(settings.updateSettings({ enableDynamicSingleCardButton: false }))), {
  showBatchButton: false,
  enableDynamicSingleCardButton: false,
  mergeToExcerptDefault: false,
  showImageExcerptText: false,
  showExcerptMoveNotice: true,
  showQuickCommentButton: true,
  managementTapAction: "manager", managementHoldAction: "menu", addTapAction: "quickInput", addHoldAction: "menu",
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(settings.updateSettings({ mergeToExcerptDefault: true }))), {
  showBatchButton: false,
  enableDynamicSingleCardButton: false,
  mergeToExcerptDefault: true,
  showImageExcerptText: false,
  showExcerptMoveNotice: true,
  showQuickCommentButton: true,
  managementTapAction: "manager", managementHoldAction: "menu", addTapAction: "quickInput", addHoldAction: "menu",
});
assert.strictEqual(settings.updateSettings({ showImageExcerptText: true }).showImageExcerptText, true);
assert.strictEqual(store.get("mncommentmanager_show_image_excerpt_text"), true);
// Reload the module to verify the preference survives a new plugin session.
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentActionSettings.js"), "utf8"), context);
assert.strictEqual(context.__MN_COMMENT_ACTION_SETTINGS__.getSettings().showImageExcerptText, true);
assert.strictEqual(settings.updateSettings({ showImageExcerptText: "false" }).showImageExcerptText, true);
assert.strictEqual(settings.updateSettings({ showImageExcerptText: false }).showImageExcerptText, false);
assert.strictEqual(store.get("mncommentmanager_show_image_excerpt_text"), false);
assert.strictEqual(settings.getSettings().mergeToExcerptDefault, true);
console.log("comment action settings tests passed");

assert.strictEqual(settings.updateSettings({ managementTapAction: "quickInput", addHoldAction: "none", showQuickCommentButton: false }).managementTapAction, "quickInput");
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentActionSettings.js"), "utf8"), context);
assert.strictEqual(context.__MN_COMMENT_ACTION_SETTINGS__.getSettings().addHoldAction, "none");
assert.strictEqual(context.__MN_COMMENT_ACTION_SETTINGS__.getSettings().showQuickCommentButton, false);
assert.throws(() => settings.updateSettings({ managementTapAction: "invalid" }), /动作无效/);
store.set("mncommentmanager_addTapAction", "outdated");
assert.strictEqual(settings.getSettings().addTapAction, "quickInput");

assert.strictEqual(settings.getQuickCommentMarkdown(), false);
settings.setQuickCommentMarkdown(true);
assert.strictEqual(store.get('mncommentmanager_quick_comment_markdown'), true);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'CommentActionSettings.js'), 'utf8'), context);
assert.strictEqual(context.__MN_COMMENT_ACTION_SETTINGS__.getQuickCommentMarkdown(), true);
settings.setQuickCommentMarkdown(false);
assert.strictEqual(settings.getQuickCommentMarkdown(), false);
assert.throws(() => settings.setQuickCommentMarkdown('true'), /参数无效/);
store.set('mncommentmanager_quick_comment_markdown', { boolValue() { return false; } });
assert.strictEqual(settings.getQuickCommentMarkdown(), false);

assert.strictEqual(settings.updateSettings({ showExcerptMoveNotice: false }).showExcerptMoveNotice, false);
assert.strictEqual(store.get("mncommentmanager_show_excerpt_move_notice"), false);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "CommentActionSettings.js"), "utf8"), context);
assert.strictEqual(context.__MN_COMMENT_ACTION_SETTINGS__.getSettings().showExcerptMoveNotice, false);
assert.strictEqual(settings.updateSettings({ showExcerptMoveNotice: "true" }).showExcerptMoveNotice, false);
assert.strictEqual(settings.updateSettings({ showExcerptMoveNotice: true }).showExcerptMoveNotice, true);

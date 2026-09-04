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
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(settings.updateSettings({ showBatchButton: false }))), {
  showBatchButton: false,
  enableDynamicSingleCardButton: true,
  mergeToExcerptDefault: false,
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(settings.updateSettings({ enableDynamicSingleCardButton: false }))), {
  showBatchButton: false,
  enableDynamicSingleCardButton: false,
  mergeToExcerptDefault: false,
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(settings.updateSettings({ mergeToExcerptDefault: true }))), {
  showBatchButton: false,
  enableDynamicSingleCardButton: false,
  mergeToExcerptDefault: true,
});
console.log("comment action settings tests passed");
